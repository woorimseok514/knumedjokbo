// 이용자 포털 스크립트 (과목별 격리 & 회원 인증)

let userToken = localStorage.getItem('user_token') || '';
let currentUser = null;
let currentSubjectId = localStorage.getItem('active_subject_id') || '';
let currentResults = null;
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  checkUserAuth();
  initAuthForms();
  initUploadHandlers();
  initUserChangePwForm();
});

function getUserHeaders() {
  const headers = {};
  if (userToken) {
    headers['Authorization'] = `Bearer ${userToken}`;
  }
  return headers;
}

// ------------------- 인증 및 로그인 (Supabase 기반) -------------------

async function checkUserAuth() {
  try {
    // 1. Supabase 세션 확인
    if (typeof supabaseGetCurrentUser === 'function') {
      const sbUser = await supabaseGetCurrentUser();
      if (sbUser) {
        currentUser = sbUser;
        document.getElementById('userNameDisplay').textContent = `${currentUser.name} (${currentUser.username})`;
        showLoginModal(false);
        await loadSubjects();
        return;
      }
    }
  } catch (err) {
    console.warn('Supabase auth check error:', err);
  }

  // 로그인되지 않은 경우 모달 표시
  showLoginModal(true);
}

function showLoginModal(show) {
  const modal = document.getElementById('loginModal');
  if (show) modal.classList.remove('hidden');
  else modal.classList.add('hidden');
}

function switchAuthTab(tab) {
  const loginTab = document.getElementById('authTab-login');
  const regTab = document.getElementById('authTab-register');
  const loginPanel = document.getElementById('authPanel-login');
  const regPanel = document.getElementById('authPanel-register');

  if (tab === 'login') {
    loginTab.className = 'flex-1 pb-3 text-sm font-bold border-b-2 border-indigo-600 text-indigo-600 flex items-center justify-center gap-1.5';
    regTab.className = 'flex-1 pb-3 text-sm font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1.5';
    loginPanel.classList.remove('hidden');
    regPanel.classList.add('hidden');
  } else {
    regTab.className = 'flex-1 pb-3 text-sm font-bold border-b-2 border-indigo-600 text-indigo-600 flex items-center justify-center gap-1.5';
    loginTab.className = 'flex-1 pb-3 text-sm font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1.5';
    regPanel.classList.remove('hidden');
    loginPanel.classList.add('hidden');
  }
}

function initAuthForms() {
  // 로그인 폼 (Supabase 연동)
  const loginForm = document.getElementById('loginForm');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uInput = document.getElementById('loginUsername');
    const pInput = document.getElementById('loginPassword');
    const errEl = document.getElementById('loginError');
    errEl.classList.add('hidden');

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>로그인 확인 중...</span>`;

    try {
      if (typeof supabaseLogin === 'function') {
        const res = await supabaseLogin(uInput.value.trim(), pInput.value);
        if (res.success) {
          currentUser = res.user;
          document.getElementById('userNameDisplay').textContent = `${currentUser.name} (${currentUser.username})`;
          showLoginModal(false);
          await loadSubjects();
          return;
        }
      }
      throw new Error('인증 모듈이 올바르게 초기화되지 않았습니다.');
    } catch (err) {
      errEl.textContent = err.message || '로그인 실패';
      errEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  // 가입 신청 폼 (Supabase 연동)
  const regForm = document.getElementById('registerForm');
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const note = document.getElementById('regNote').value.trim();
    const msgEl = document.getElementById('regMsg');

    const submitBtn = regForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>신청서 전송 중...</span>`;

    try {
      if (typeof supabaseRegister === 'function') {
        const res = await supabaseRegister(username, password, name, note);
        if (res.success) {
          msgEl.textContent = res.message;
          msgEl.className = 'text-xs text-emerald-600 font-bold block p-2.5 bg-emerald-50 rounded-lg border border-emerald-200';
          regForm.reset();
          setTimeout(() => switchAuthTab('login'), 3000);
          return;
        }
      }
      throw new Error('가입 처리 모듈 오류');
    } catch (err) {
      msgEl.textContent = err.message || '가입 신청 중 오류가 발생했습니다.';
      msgEl.className = 'text-xs text-rose-500 font-semibold block p-2 bg-rose-50 rounded-lg border border-rose-200';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

async function userLogout() {
  if (confirm('로그아웃 하시겠습니까?')) {
    if (typeof supabaseLogout === 'function') {
      await supabaseLogout();
    }
    localStorage.removeItem('user_token');
    userToken = '';
    window.location.reload();
  }
}

// ------------------- 정적 데이터 & API 스마트 패치 헬퍼 -------------------

function applyExamOverrides(data, staticJsonPath) {
  if (!data) return data;
  const isExams = (staticJsonPath && staticJsonPath.includes('exams.json'));

  if (Array.isArray(data)) {
    return data.map(exam => {
      if (exam && exam.id) {
        const override = localStorage.getItem(`custom_exam_override_${exam.id}`);
        if (override) {
          try {
            return JSON.parse(override);
          } catch (e) {}
        }
        const ak = localStorage.getItem(`custom_answer_keys_${exam.id}`);
        if (ak) {
          try {
            exam.answer_keys = { ...(exam.answer_keys || {}), ...JSON.parse(ak) };
          } catch (e) {}
        }
      }
      return exam;
    });
  } else if (data && typeof data === 'object' && data.id) {
    const override = localStorage.getItem(`custom_exam_override_${data.id}`);
    if (override) {
      try {
        return JSON.parse(override);
      } catch (e) {}
    }
    const ak = localStorage.getItem(`custom_answer_keys_${data.id}`);
    if (ak) {
      try {
        data.answer_keys = { ...(data.answer_keys || {}), ...JSON.parse(ak) };
      } catch (e) {}
    }
  }
  return data;
}

// Supabase 클라우드에서 관리자가 수정한 문제 및 정답 동기화
async function syncExamOverridesFromCloud() {
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('exam_overrides').select('*');
      if (!error && Array.isArray(data)) {
        data.forEach(item => {
          if (item.exam_id && item.exam_data) {
            localStorage.setItem(`custom_exam_override_${item.exam_id}`, JSON.stringify(item.exam_data));
            if (item.exam_data.answer_keys) {
              localStorage.setItem(`custom_answer_keys_${item.exam_id}`, JSON.stringify(item.exam_data.answer_keys));
            }
          }
        });
      }
    } catch (e) {
      // cloud sync silent fallback
    }
  }
}

async function smartFetchJson(apiEndpoint, staticJsonPath) {
  let result = null;

  try {
    const res = await fetch(apiEndpoint, { headers: getUserHeaders() });
    if (res.ok) {
      result = await res.json();
    }
  } catch (e) {}

  if (!result) {
    try {
      const resStatic = await fetch(staticJsonPath);
      if (resStatic.ok) {
        result = await resStatic.json();
      }
    } catch (e) {}
  }

  if (!result) {
    try {
      const altPath = staticJsonPath.startsWith('./') ? `.${staticJsonPath}` : `../${staticJsonPath}`;
      const resAlt = await fetch(altPath);
      if (resAlt.ok) {
        result = await resAlt.json();
      }
    } catch (e) {}
  }

  // 관리자 포털에서 수정한 문제 및 정답 실시간 오버라이드 적용
  return applyExamOverrides(result, staticJsonPath);
}


