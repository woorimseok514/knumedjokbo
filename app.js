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
    // 1. 로컬 캐시 사용자 확인 (새로고침 시 1ms 만에 즉시 로그인 복원)
    const cachedUser = localStorage.getItem('knumed_current_user');
    if (cachedUser) {
      try {
        const u = JSON.parse(cachedUser);
        if (u && u.username) {
          currentUser = u;
          document.getElementById('userNameDisplay').textContent = `${currentUser.name} (${currentUser.username})`;
          showLoginModal(false);
          syncExamOverridesFromCloud().catch(e => console.warn(e));
          loadSubjects().catch(e => console.warn(e));
          return;
        }
      } catch (e) {}
    }

    // 2. Supabase 세션 확인
    if (typeof supabaseGetCurrentUser === 'function') {
      const sbUser = await supabaseGetCurrentUser();
      if (sbUser) {
        currentUser = sbUser;
        document.getElementById('userNameDisplay').textContent = `${currentUser.name} (${currentUser.username})`;
        showLoginModal(false);
        loadSubjects().catch(e => console.warn(e));
        return;
      }
    }
  } catch (err) {
    console.warn('Auth check warning:', err);
  }

  showLoginModal(true);
}


function showLoginModal(show) {
  const modal = document.getElementById('loginModal');
  if (!modal) return;
  if (show) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  } else {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
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

    const usernameVal = uInput.value.trim();
    const passwordVal = pInput.value;

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs mr-1.5"></i><span>로그인 중...</span>`;

    try {
      if (typeof supabaseLogin === 'function') {
        const res = await supabaseLogin(usernameVal, passwordVal);
        if (res.success && res.user) {
          currentUser = res.user;
          localStorage.setItem('knumed_current_user', JSON.stringify(currentUser));
          localStorage.setItem('user_token', currentUser.id);

          document.getElementById('userNameDisplay').textContent = `${currentUser.name} (${currentUser.username})`;
          
          // 로그인 모달 즉시 닫기
          showLoginModal(false);

          // 데이터 비동기 로드 (실패해도 로그인 상태는 유지)
          loadSubjects().catch(e => console.warn('Subjects load non-fatal warning:', e));
          return;
        }
      }
      throw new Error('인증 처리 모듈을 초기화할 수 없습니다.');
    } catch (err) {
      console.error('Login error:', err);
      errEl.textContent = err.message || '로그인에 실패했습니다. 아이디와 비밀번호를 확인해주세요.';
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
      localStorage.removeItem('knumed_current_user');
  localStorage.removeItem('user_token');
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

async function syncExamOverridesFromCloud() {
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('exam_overrides').select('*');
      if (!error && Array.isArray(data)) {
        let deletedLecs = JSON.parse(localStorage.getItem('deleted_lectures') || '[]');
        let deletedExs = JSON.parse(localStorage.getItem('deleted_exams') || '[]');

        data.forEach(item => {
          if (item.exam_id && item.exam_data) {
            localStorage.setItem(`custom_exam_override_${item.exam_id}`, JSON.stringify(item.exam_data));
            if (item.exam_data.answer_keys) {
              localStorage.setItem(`custom_answer_keys_${item.exam_id}`, JSON.stringify(item.exam_data.answer_keys));
            }
            if (item.exam_data.is_deleted) {
              if (item.exam_id.startsWith('deleted_lec_')) {
                const docId = item.exam_id.replace('deleted_lec_', '');
                if (!deletedLecs.includes(docId)) deletedLecs.push(docId);
              } else {
                if (!deletedExs.includes(item.exam_id)) deletedExs.push(item.exam_id);
              }
            }
          }
        });
        localStorage.setItem('deleted_lectures', JSON.stringify(deletedLecs));
        localStorage.setItem('deleted_exams', JSON.stringify(deletedExs));
      }
    } catch (e) {}
  }
}

async function smartFetchJson(apiEndpoint, staticJsonPath) {
  let result = null;
  try {
    const res = await fetch(apiEndpoint, { headers: getUserHeaders() });
    if (res.ok) result = await res.json();
  } catch (e) {}

  if (!result) {
    try {
      const resStatic = await fetch(staticJsonPath);
      if (resStatic.ok) result = await resStatic.json();
    } catch (e) {}
  }

  if (!result) {
    try {
      const altPath = staticJsonPath.startsWith('./') ? `.${staticJsonPath}` : `../${staticJsonPath}`;
      const resAlt = await fetch(altPath);
      if (resAlt.ok) result = await resAlt.json();
    } catch (e) {}
  }

  return applyExamOverrides(result, staticJsonPath);
}

// ------------------- 과목 관리 -------------------

async function loadSubjects() {
  try {
    let subs = await smartFetchJson('/api/subjects', './data/subjects.json');
    if (!subs || subs.length === 0) {
      // 기본 과목 fallback
      subs = [{ id: "sub_fbdc79d0", name: "의학세포분자생물학 (기출 문제은행)", description: "2022~2025학년도 족보 및 강의자료" }];
    }

    const sel = document.getElementById('activeSubjectSelect');
    sel.innerHTML = subs.map(s => `
      <option value="${s.id}" ${s.id === currentSubjectId ? 'selected' : ''}>
        ${escapeHtml(s.name)}
      </option>
    `).join('');

    if (!currentSubjectId || !subs.some(s => s.id === currentSubjectId)) {
      currentSubjectId = subs[0].id;
      localStorage.setItem('active_subject_id', currentSubjectId);
      sel.value = currentSubjectId;
    }

    updateSubjectStats(subs);
    refreshSubjectData();

  } catch (err) {
    console.error('과목 로딩 실패:', err);
  }
}

function updateSubjectStats(subs) {
  const current = subs.find(s => s.id === currentSubjectId);
  if (current) {
    document.getElementById('subLectureCountText').textContent = `${current.lecture_count || 0}개`;
    document.getElementById('subExamCountText').textContent = `${current.exam_count || 0}개`;
  }
}

function onSubjectChange() {
  const sel = document.getElementById('activeSubjectSelect');
  currentSubjectId = sel.value;
  localStorage.setItem('active_subject_id', currentSubjectId);
  refreshSubjectData();
}

async function refreshSubjectData() {
  loadLectures();
  loadExams();
  loadRecentResult();
}

// ------------------- 탭 네비게이션 -------------------

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active-tab'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));

  const activeBtn = document.getElementById(`tab-${tabName}`);
  const activePanel = document.getElementById(`panel-${tabName}`);
  if (activeBtn) activeBtn.classList.add('active-tab');
  if (activePanel) activePanel.classList.remove('hidden');

  if (tabName === 'matching') {
    populateExamSelect();
  }
  if (tabName === 'workbooks') {
    loadWorkbooks();
  }
}

// ------------------- 강의 자료 관리 -------------------

async function loadLectures() {
  if (!currentSubjectId) return;
  try {
    let staticDocs = await smartFetchJson(`/api/lectures?subject_id=${currentSubjectId}`, './data/lectures.json') || [];
    staticDocs = staticDocs.filter(d => !d.subject_id || d.subject_id === currentSubjectId || d.subject_id === "sub_fbdc79d0");

    // Supabase shared_lectures에서 다른 이용자가 등록한 강의자료 실시간 조회
    let cloudDocs = [];
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('shared_lectures')
          .select('*')
          .eq('subject_id', currentSubjectId)
          .order('uploaded_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          cloudDocs = data.map(cd => ({ ...cd, is_cloud: true }));
        }
      } catch (e) {}
    }

    const deletedDocs = JSON.parse(localStorage.getItem('deleted_lectures') || '[]');
    const docMap = new Map();
    cloudDocs.forEach(d => { if (!deletedDocs.includes(d.id) && !d.is_deleted) docMap.set(d.id, d); });
    staticDocs.forEach(d => { if (!deletedDocs.includes(d.id) && !d.is_deleted && !docMap.has(d.id)) docMap.set(d.id, d); });
    let docs = Array.from(docMap.values());
    docs.forEach(d => {
      if (d.unit_count === undefined && d.units) {
        d.unit_count = d.units.length;
      }
    });

    document.getElementById('badgeLectureCount').textContent = docs.length;
    document.getElementById('lectureTotalCountText').textContent = `총 ${docs.length}개 문서`;
    const subLecEl = document.getElementById('subLectureCountText');
    if (subLecEl) subLecEl.textContent = `${docs.length}개`;

    const tbody = document.getElementById('lectureTableBody');
    if (docs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-slate-400">현재 과목에 등록된 강의 자료가 없습니다. 상단에서 파일을 추가해주세요.</td></tr>`;
      return;
    }

    tbody.innerHTML = docs.map(d => `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="px-6 py-4 font-semibold text-slate-900 flex items-center gap-2">
          <i class="fa-regular fa-file-powerpoint text-indigo-500"></i>
          <span>${escapeHtml(d.filename)}</span>
        </td>
        <td class="px-6 py-4">
          <span class="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700">${d.unit_type}</span>
        </td>
        <td class="px-6 py-4 font-medium text-slate-600">${d.unit_count}개</td>
        <td class="px-6 py-4 text-xs text-slate-400">
          <span class="font-medium text-slate-600">${escapeHtml(d.uploaded_by || '사용자')}</span><br>
          ${d.uploaded_at || '-'}
        </td>
        <td class="px-6 py-4 text-right space-x-2">
          <button onclick="viewLectureUnits('${d.id}')" class="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-200 transition">
            원문 보기
          </button>
          <button onclick="deleteLecture('${d.id}')" class="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded border border-rose-200 transition">
            삭제
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('강의 자료 목록 조회 실패:', err);
  }
}

async function uploadLectureFiles(files) {
  if (!files || files.length === 0 || !currentSubjectId) return;
  const spinner = document.getElementById('lectureUploadSpinner');
  spinner.classList.remove('hidden');

  const formData = new FormData();
  formData.append('subject_id', currentSubjectId);
  for (let f of files) {
    formData.append('files', f);
  }

  try {
    const res = await fetch('/api/lectures/upload', {
      method: 'POST',
      headers: getUserHeaders(),
      body: formData
    });
    if (res.ok) {
      await loadLectures();
      alert('강의 자료가 성공적으로 등록 및 파싱되었습니다.');
    } else {
      alert('파일 업로드 중 오류가 발생했습니다.');
    }
  } catch (err) {
    alert('서버 연결 오류');
  } finally {
    spinner.classList.add('hidden');
  }
}

async function deleteLecture(docId) {
  if (!confirm('이 강의 자료를 삭제하시겠습니까?\n삭제 시 모든 화면에서 즉시 제외됩니다.')) return;

  // 1. Supabase shared_lectures 및 exam_overrides 기록
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      await supabaseClient.from('shared_lectures').delete().eq('id', docId);
    } catch (e) {}
    try {
      await supabaseClient.from('exam_overrides').upsert({
        exam_id: 'deleted_lec_' + docId,
        subject_id: currentSubjectId || 'sub_fbdc79d0',
        exam_data: { id: docId, is_deleted: true, type: 'lecture' },
        updated_by: (currentUser ? currentUser.name : '이용자'),
        updated_at: new Date().toISOString()
      });
    } catch (e) {}
  }

  // 2. 로컬스토리지 보존
  let deleted = JSON.parse(localStorage.getItem('deleted_lectures') || '[]');
  if (!deleted.includes(docId)) deleted.push(docId);
  localStorage.setItem('deleted_lectures', JSON.stringify(deleted));

  // 3. 로컬 서버 환경 백엔드 API (조용히 호출)
  try {
    await fetch(`/api/lectures/${docId}`, { method: 'DELETE', headers: getUserHeaders() });
  } catch (err) {}

  alert('강의 자료가 삭제되었습니다.');
  await loadLectures();
}

async function viewLectureUnits(docId) {
  try {
    let data = null;
    // 1. Supabase shared_lectures 확인
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { data: cDoc } = await supabaseClient.from('shared_lectures').select('*').eq('id', docId).maybeSingle();
        if (cDoc && cDoc.units) {
          data = cDoc;
        }
      } catch (e) {}
    }

    if (!data) {
      const res = await fetch(`/api/lectures/${docId}/units`, { headers: getUserHeaders() });
      if (res.ok) data = await res.json();
    }

    document.getElementById('modalUnitTitle').textContent = data.filename;
    document.getElementById('modalUnitSubtitle').textContent = `총 ${data.units.length}개 ${data.unit_type}`;
    
    const content = data.units.map(u => 
      `=== [${u.unit_type} ${u.unit_number}] ===\n${u.text}\n`
    ).join('\n----------------------------------------\n\n');

    document.getElementById('modalUnitContent').textContent = content;
    document.getElementById('unitViewModal').classList.remove('hidden');
  } catch (err) {
    alert('내용을 불러오지 못했습니다.');
  }
}

function closeUnitModal() {
  document.getElementById('unitViewModal').classList.add('hidden');
}

// ------------------- 족보 문항 관리 -------------------

async function loadExams() {
  if (!currentSubjectId) return;
  try {
    let staticExams = await smartFetchJson(`/api/exams?subject_id=${currentSubjectId}`, './data/exams.json');
    if (!staticExams) staticExams = [];
    staticExams = staticExams.filter(e => !e.subject_id || e.subject_id === currentSubjectId || e.subject_id === "sub_fbdc79d0");

    // 1. Supabase shared_exams에서 다른 이용자가 등록한 최신 족보 실시간 조회
    let cloudExams = [];
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('shared_exams')
          .select('*')
          .eq('subject_id', currentSubjectId)
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          cloudExams = data.map(ce => ({
            ...ce,
            is_cloud: true,
            created_by: ce.created_by || '학생 기여'
          }));
        }
      } catch (e) {
        console.warn('Cloud exams fetch warning:', e);
      }
    }

    // 로컬 커스텀 족보 백업
    const localExamsRaw = localStorage.getItem(`custom_exams_${currentSubjectId}`);
    let localExams = [];
    if (localExamsRaw) {
      try { localExams = JSON.parse(localExamsRaw); } catch (e) {}
    }

    // 중복 제거 병합 (Cloud 우선 -> Local -> Static)
    const examMap = new Map();
    cloudExams.forEach(e => examMap.set(e.id, e));
    localExams.forEach(e => { if (!examMap.has(e.id)) examMap.set(e.id, e); });
    staticExams.forEach(e => { if (!examMap.has(e.id)) examMap.set(e.id, e); });

    const deletedExams = JSON.parse(localStorage.getItem('deleted_exams') || '[]');
    let exams = Array.from(examMap.values()).filter(e => {
      if (deletedExams.includes(e.id) || e.is_deleted) return false;
      const ov = localStorage.getItem(`custom_exam_override_${e.id}`);
      if (ov) {
        try {
          const parsed = JSON.parse(ov);
          if (parsed.is_deleted) return false;
        } catch(err) {}
      }
      return true;
    });
    exams.forEach(e => {
      if (e.question_count === undefined && e.questions) {
        e.question_count = e.questions.length;
      }
    });

    document.getElementById('badgeExamCount').textContent = exams.length;
    document.getElementById('examTotalCountText').textContent = `총 ${exams.length}개 세트`;
    const subExEl = document.getElementById('subExamCountText');
    if (subExEl) subExEl.textContent = `${exams.length}세트`;

    const tbody = document.getElementById('examTableBody');
    if (exams.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400">현재 과목에 등록된 족보가 없습니다. 상단에서 업로드하거나 붙여넣어주세요.</td></tr>`;
      return;
    }

    tbody.innerHTML = exams.map(e => `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="px-6 py-4 font-semibold text-slate-900 flex items-center gap-2">
          <i class="fa-regular fa-file-lines text-indigo-500"></i>
          <span>${escapeHtml(e.title)}</span>
        </td>
        <td class="px-6 py-4">
          <span class="px-2.5 py-1 text-xs font-bold rounded-md bg-indigo-50 text-indigo-700">${e.question_count}문항</span>
        </td>
        <td class="px-6 py-4 text-xs text-slate-400">
          <span class="font-medium text-slate-600">${escapeHtml(e.created_by || '사용자')}</span><br>
          ${e.created_at || '-'}
        </td>
        <td class="px-6 py-4 text-right space-x-2">
          <button onclick="startMatchForExam('${e.id}')" class="px-2.5 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 rounded border border-emerald-200 transition">
            선지 매칭하기
          </button>
          <button onclick="deleteExam('${e.id}')" class="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded border border-rose-200 transition">
            삭제
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('족보 목록 조회 실패:', err);
  }
}

async function uploadExamFile(file) {
  if (!file || !currentSubjectId) return;
  const statusEl = document.getElementById('examFileStatus');
  statusEl.textContent = '문서 파싱 중...';
  statusEl.classList.remove('hidden');

  const formData = new FormData();
  formData.append('subject_id', currentSubjectId);
  formData.append('file', file);

  try {
    const res = await fetch('/api/exams/upload', {
      method: 'POST',
      headers: getUserHeaders(),
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      statusEl.textContent = `등록 완료! (총 ${data.question_count}문항 추출)`;
      await loadExams();
    } else {
      statusEl.textContent = '업로드 실패: ' + (data.detail || '');
    }
  } catch (err) {
    statusEl.textContent = '서버 통신 에러';
  }
}

/**
 * 이용자 족보 텍스트 자동 파싱 헬퍼 (문제 번호 및 선지 ①~⑤ 자동 추출)
 */
function parseRawExamTextToQuestions(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const questions = [];
  let currentQ = null;

  const qNumRegex = /^(?:문\s*제\s*)?(?:No\.?\s*)?(\d{1,3})[\.\)\s\]번](.*)$/i;
  const choiceRegex = /^[\(]?(?:①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|[1-9])[\.\)]?\s*(.*)$/;
  const circleSymbols = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

  for (let line of lines) {
    const qMatch = line.match(qNumRegex);
    if (qMatch && !line.match(/^[①-⑩]/)) {
      if (currentQ && currentQ.stem) {
        questions.push(currentQ);
      }
      const qNum = parseInt(qMatch[1], 10);
      const stemPart = qMatch[2].trim();
      currentQ = {
        q_number: qNum,
        stem: stemPart,
        choices: [],
        correct_answer: ''
      };
      continue;
    }

    const cMatch = line.match(choiceRegex);
    if (cMatch && currentQ) {
      const idx = currentQ.choices.length;
      const label = idx < circleSymbols.length ? circleSymbols[idx] : `(${idx+1})`;
      currentQ.choices.push({
        label: label,
        text: cMatch[1] || line
      });
      continue;
    }

    if (currentQ) {
      if (currentQ.choices.length === 0) {
        currentQ.stem += ' ' + line;
      } else {
        // 마지막 선지의 추가 설명
        currentQ.choices[currentQ.choices.length - 1].text += ' ' + line;
      }
    }
  }

  if (currentQ && currentQ.stem) {
    questions.push(currentQ);
  }

  return questions;
}

async function submitPastedExam() {
  if (!currentSubjectId) return;
  const title = document.getElementById('pasteExamTitle').value.trim() || '신규 기출 족보';
  const content = document.getElementById('pasteExamContent').value.trim();

  if (!content) {
    alert('족보 문항 텍스트를 입력해주세요.');
    return;
  }

  const submitBtn = document.querySelector('button[onclick="submitPastedExam()"]');
  const origBtnText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs mr-1"></i> 문항 파싱 및 클라우드 저장 중...`;
  }

  // 1. 기존 파이썬 백엔드 서버가 있는 경우 우선 시도
  let serverHandled = false;
  try {
    const res = await fetch('/api/exams/paste', {
      method: 'POST',
      headers: { ...getUserHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: currentSubjectId, title, text_content: content })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        serverHandled = true;
        alert(`족보가 등록되었습니다! 총 ${data.question_count}개 문항이 자동 추출되었습니다.`);
      }
    }
  } catch (e) {}

  // 2. GitHub Pages / Supabase 클라우드 직접 처리 (모든 이용자 자동 영구 저장)
  if (!serverHandled) {
    try {
      const questions = parseRawExamTextToQuestions(content);
      if (questions.length === 0) {
        // 문항 구분자를 못 찾았을 경우 단일 문항으로 안전 처리
        questions.push({
          q_number: 1,
          stem: content,
          choices: [
            { label: '①', text: '선지 1' },
            { label: '②', text: '선지 2' },
            { label: '③', text: '선지 3' },
            { label: '④', text: '선지 4' },
            { label: '⑤', text: '선지 5' }
          ]
        });
      }

      const examId = 'exam_cloud_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const author = currentUser ? `${currentUser.name} (${currentUser.username})` : '학생 기여';
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);

      const newExam = {
        id: examId,
        subject_id: currentSubjectId,
        title: title,
        question_count: questions.length,
        questions: questions,
        answer_keys: {},
        created_by: author,
        created_at: nowStr
      };

      // 2-1. Supabase 클라우드 DB에 영구 등록 (다른 모든 이용자 실시간 공유)
      if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
          const { error } = await supabaseClient.from('shared_exams').insert(newExam);
          if (error) console.warn('Supabase shared_exams insert warning:', error);
        } catch (sbErr) {
          console.warn('Supabase insert failed:', sbErr);
        }
      }

      // 2-2. 로컬 브라우저에도 즉시 캐시 저장
      const localExamsRaw = localStorage.getItem(`custom_exams_${currentSubjectId}`);
      let localExams = [];
      if (localExamsRaw) {
        try { localExams = JSON.parse(localExamsRaw); } catch (e) {}
      }
      localExams.unshift(newExam);
      localStorage.setItem(`custom_exams_${currentSubjectId}`, JSON.stringify(localExams));

      alert(`✅ 족보가 성공적으로 등록되었습니다!\n\n• 문항 수: 총 ${questions.length}문항 추출 완료\n• 등록자: ${author}\n• 클라우드 동기화: 다른 학생들도 지금 즉시 풀 수 있습니다.`);
      document.getElementById('pasteExamContent').value = '';
      document.getElementById('pasteExamTitle').value = '';

    } catch (err) {
      console.error('클라이언트 족보 파싱 오류:', err);
      alert('족보 등록 중 오류가 발생했습니다: ' + err.message);
    }
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = origBtnText;
  }

  await loadExams();
  await loadWorkbooks();
}

async function deleteExam(examId) {
  if (!confirm('정말로 이 족보 문항 세트를 삭제하시겠습니까?
삭제 시 모든 화면 및 기출 풀이에서 제외됩니다.')) return;

  // 1. Supabase shared_exams 및 exam_overrides 기록
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      await supabaseClient.from('shared_exams').delete().eq('id', examId);
    } catch (e) {}
    try {
      await supabaseClient.from('exam_overrides').upsert({
        exam_id: examId,
        subject_id: currentSubjectId || 'sub_fbdc79d0',
        exam_data: { id: examId, is_deleted: true, type: 'exam' },
        updated_by: (currentUser ? currentUser.name : '이용자'),
        updated_at: new Date().toISOString()
      });
    } catch (e) {}
  }

  // 2. 로컬스토리지 보존
  let deleted = JSON.parse(localStorage.getItem('deleted_exams') || '[]');
  if (!deleted.includes(examId)) deleted.push(examId);
  localStorage.setItem('deleted_exams', JSON.stringify(deleted));

  // 3. 로컬 서버 백엔드 API (조용히 호출)
  try {
    await fetch(`/api/exams/${examId}`, { method: 'DELETE', headers: getUserHeaders() });
  } catch (err) {}

  alert('족보 문항 세트가 삭제되었습니다.');
  await loadExams();
}

// ------------------- 선지 매칭 및 분석 -------------------

async function populateExamSelect() {
  if (!currentSubjectId) return;
  try {
    let exams = await smartFetchJson(`/api/exams?subject_id=${currentSubjectId}`, './data/exams.json');
    if (!exams) exams = [];
    exams = exams.filter(e => !e.subject_id || e.subject_id === currentSubjectId);
    exams.forEach(e => {
      if (e.question_count === undefined && e.questions) {
        e.question_count = e.questions.length;
      }
    });

    const sel = document.getElementById('matchSelectExam');
    if (!sel) return;
    
    const curVal = sel.value;
    sel.innerHTML = '<option value="">현재 과목에서 분석할 족보를 선택하세요</option>' +
      exams.map(e => `<option value="${e.id}">${escapeHtml(e.title)} (${e.question_count || 35}문항)</option>`).join('');
    if (curVal) sel.value = curVal;
  } catch (err) {
    console.error(err);
  }
}

function startMatchForExam(examId) {
  switchTab('matching');
  setTimeout(async () => {
    await populateExamSelect();
    const sel = document.getElementById('matchSelectExam');
    if (sel) sel.value = examId;
    runAnalysis();
  }, 150);
}

async function runAnalysis() {
  const examId = document.getElementById('matchSelectExam').value;
  if (!examId || !currentSubjectId) {
    alert('분석할 족보 세트를 먼저 선택해주세요.');
    return;
  }

  const btn = document.getElementById('btnRunMatch');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>매칭 분석 중...</span>`;

  try {
    let data = null;
    // 1. 서버 API가 있으면 실행
    try {
      const res = await fetch('/api/match/run', {
        method: 'POST',
        headers: { ...getUserHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: currentSubjectId, exam_id: examId })
      });
      if (res.ok) data = await res.json();
    } catch (e) {}

    // 2. GitHub Pages 정적 환경 fallback: results.json에서 사전 매칭 결과 로드
    if (!data || !data.success) {
      const results = await smartFetchJson(`/api/match/results?subject_id=${currentSubjectId}`, './data/results.json');
      if (results && Array.isArray(results)) {
        const matched = results.find(r => r.exam_id === examId) || results.find(r => r.id === examId);
        if (matched) {
          data = { success: true, result_id: matched.id, result: matched };
        }
      }
    }

    if (data && (data.success || data.result_id || data.result)) {
      await loadResultDetail(data.result_id || data.result);
      document.getElementById('badgeResultReady').classList.remove('hidden');
    } else {
      alert('선택하신 족보의 매칭 분석 결과를 불러올 수 없습니다.');
    }
  } catch (err) {
    alert('분석 중 오류가 발생했습니다.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-play text-xs"></i> <span>선지 매칭 분석 시작</span>`;
  }
}

async function loadRecentResult() {
  if (!currentSubjectId) return;
  try {
    let results = await smartFetchJson(`/api/match/results?subject_id=${currentSubjectId}`, './data/results.json');
    if (results && results.length > 0) {
      // 과목 필터링
      const subResults = results.filter(r => !r.subject_id || r.subject_id === currentSubjectId);
      const target = subResults.length > 0 ? subResults[0] : results[0];
      await loadResultDetail(target.id || target);
    } else {
      document.getElementById('noResultsGuide').classList.remove('hidden');
      document.getElementById('resultsDashboard').classList.add('hidden');
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadResultDetail(resultIdOrObj) {
  try {
    let data = null;
    if (typeof resultIdOrObj === 'object' && resultIdOrObj !== null) {
      data = resultIdOrObj;
    } else {
      data = await smartFetchJson(`/api/match/results/${resultIdOrObj}`, './data/results.json');
      if (Array.isArray(data)) {
        data = data.find(r => r.id === resultIdOrObj) || data[0];
      }
    }
    if (!data) return;
    currentResults = data;

    document.getElementById('noResultsGuide').classList.add('hidden');
    document.getElementById('resultsDashboard').classList.remove('hidden');

    document.getElementById('currentExamTitleBadge').textContent = currentResults.exam_title || '분석 결과';
    document.getElementById('currentResultMeta').textContent = 
      `분석 시각: ${currentResults.analyzed_at || '-'} | 분석자: ${currentResults.analyzed_by || '사용자'} | 참조 강의자료: ${currentResults.lecture_count || 0}개`;

    const summary = currentResults.summary || {};
    document.getElementById('statTotalChoices').textContent = summary.total_choices || 0;
    document.getElementById('statHighCount').textContent = summary.high_count || 0;
    document.getElementById('statMedCount').textContent = summary.medium_count || 0;
    document.getElementById('statLowCount').textContent = summary.low_count || 0;

    renderQuestionsList();
  } catch (err) {
    console.error('결과 상세 조회 실패:', err);
  }
}

function setFilter(filterType) {
  currentFilter = filterType;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    if (btn.getAttribute('data-filter') === filterType) {
      btn.classList.add('active-filter');
    } else {
      btn.classList.remove('active-filter');
    }
  });
  renderQuestionsList();
}

function renderQuestionsList() {
  if (!currentResults || !currentResults.questions) return;
  const container = document.getElementById('questionsContainer');
  const search = (document.getElementById('choiceSearchInput').value || '').toLowerCase().trim();

  let htmlStr = '';

  currentResults.questions.forEach((q, qIdx) => {
    const qNum = q.q_number || (qIdx + 1);
    const stem = q.stem || '';

    const filteredChoices = (q.choices || []).filter(c => {
      const status = c.analysis?.status || 'low';
      if (currentFilter !== 'all' && status !== currentFilter) return false;

      if (search) {
        const textMatch = c.text?.toLowerCase().includes(search);
        const stemMatch = stem.toLowerCase().includes(search);
        const snippetMatch = c.analysis?.top_match?.snippet?.toLowerCase().includes(search);
        if (!textMatch && !stemMatch && !snippetMatch) return false;
      }
      return true;
    });

    if (filteredChoices.length === 0 && (currentFilter !== 'all' || search)) {
      return;
    }

    htmlStr += `
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div class="p-5 border-b border-slate-100 bg-slate-50/70">
          <div class="flex items-start gap-3">
            <span class="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-900 text-white font-bold text-xs shrink-0">
              ${qNum}
            </span>
            <div class="flex-1">
              <h4 class="font-bold text-slate-900 text-sm leading-snug">${escapeHtml(cleanQuestionStem(stem))}</h4>
            </div>
          </div>
        </div>

        <div class="p-5 space-y-3.5 divide-y divide-slate-100">
          ${filteredChoices.map((c, cIdx) => renderChoiceCard(c, qIdx, cIdx)).join('')}
        </div>
      </div>
    `;
  });

  if (!htmlStr) {
    container.innerHTML = `
      <div class="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm">
        조건에 맞는 선지 결과가 없습니다.
      </div>
    `;
  } else {
    container.innerHTML = htmlStr;
  }
}

function renderChoiceCard(choice, qIdx, cIdx) {
  const label = choice.label || `(${cIdx + 1})`;
  const text = choice.text || '';
  const an = choice.analysis || {};
  const top = an.top_match;
  const status = an.status || 'low';

  let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
  let badgeIcon = 'fa-circle-question';
  let borderLeft = 'border-l-slate-300';

  if (status === 'high') {
    badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    badgeIcon = 'fa-circle-check';
    borderLeft = 'border-l-emerald-500';
  } else if (status === 'medium') {
    badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
    badgeIcon = 'fa-triangle-exclamation';
    borderLeft = 'border-l-amber-500';
  }

  const badgeText = top?.badge || '직접 언급 없음';
  const docTitle = top ? top.doc_title : '-';
  const pageNum = top ? (top.unit_number || top.page_number || '-') : '-';
  const unitLoc = top ? `${top.unit_type || '슬라이드'} ${pageNum}페이지` : '-';
  const score = top ? `${top.score}%` : '0%';
  
  // 완전한 핵심 문장 추출값 (단순 발췌가 아닌 전체 내용을 담은 온전한 문장)
  const fullSentence = top?.highlighted_snippet || top?.full_sentence || top?.snippet || '강의 자료에서 관련 구문을 찾을 수 없습니다.';
  const cleanKeywords = (top?.matched_keywords || []).filter(k => k && k.length >= 2);

  return `
    <div class="pt-3.5 first:pt-0">
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-4 border-l-4 ${borderLeft} space-y-3 shadow-xs">
        <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
          <div class="flex items-start gap-2.5 flex-1">
            <span class="w-6 h-6 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">${escapeHtml(label)}</span>
            <p class="font-bold text-slate-900 text-sm leading-snug pt-0.5">${escapeHtml(text)}</p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <span class="text-xs font-bold px-2.5 py-1 rounded-full border ${badgeColor} flex items-center gap-1.5 shadow-2xs">
              <i class="fa-solid ${badgeIcon} text-[11px]"></i>
              <span>${badgeText}</span>
            </span>
            <span class="text-xs font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
              일치도 ${score}
            </span>
          </div>
        </div>

        ${top ? `
          <!-- 1. PPT 파일명 및 정확한 슬라이드 페이지 번호 (강조 박스) -->
          <div class="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-xs">
            <div class="flex items-center gap-2 font-bold text-amber-900">
              <i class="fa-solid fa-file-powerpoint text-amber-600 text-sm"></i>
              <span class="truncate max-w-md">${escapeHtml(docTitle)}</span>
            </div>
            <span class="px-2.5 py-1 bg-amber-500 text-white font-bold rounded-lg text-xs shadow-xs">
              ${unitLoc}
            </span>
          </div>

          <!-- 2. 전체 내용을 온전히 담고 있는 핵심 전체 문장 (Full Sentence) -->
          <div class="p-3.5 rounded-xl bg-white border border-indigo-100 shadow-2xs space-y-1.5">
            <div class="flex items-center justify-between text-[11px] font-bold text-indigo-700">
              <span class="flex items-center gap-1.5">
                <i class="fa-solid fa-quote-left text-indigo-500 text-xs"></i>
                <span>슬라이드 내 핵심 전체 문장:</span>
              </span>
              <span class="text-[10px] text-slate-400 font-medium">강의록 원문 매칭</span>
            </div>
            <div class="font-sans text-xs text-slate-800 leading-relaxed bg-indigo-50/30 p-2.5 rounded-lg border border-indigo-50 font-medium">
              "${fullSentence}"
            </div>
          </div>

          <!-- 3. 핵심 키워드 태그 (조사 및 it, as, to 등 배제된 순수 전문어) -->
          <div class="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-slate-400 text-[11px] font-semibold">핵심 전문어:</span>
              ${cleanKeywords.length > 0 ? cleanKeywords.map(k => `
                <span class="px-2 py-0.5 bg-slate-200/70 text-slate-700 rounded-md text-[10px] font-bold">${escapeHtml(k)}</span>
              `).join('') : '<span class="text-slate-400 text-[10px]">일치 용어 없음</span>'}
            </div>

            <button onclick="previewRawSlide('${escapeHtml(docTitle)}', '${unitLoc}', ${qIdx}, ${cIdx})" 
                    class="text-indigo-600 hover:text-indigo-800 font-bold px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition text-xs flex items-center gap-1">
              <i class="fa-regular fa-file-lines text-[11px]"></i>
              <span>슬라이드 원문 전체 보기</span>
            </button>
          </div>
        ` : `
          <div class="p-3 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
            강의 자료에서 직접적인 언급을 찾을 수 없습니다.
          </div>
        `}
      </div>
    </div>
  `;
}

function previewRawSlide(docTitle, unitLoc, qIdx, cIdx) {
  const q = currentResults.questions[qIdx];
  const c = q.choices[cIdx];
  const top = c.analysis?.top_match;
  if (!top) return;

  document.getElementById('modalUnitTitle').textContent = docTitle;
  document.getElementById('modalUnitSubtitle').textContent = `${unitLoc} 원문 전체 내용`;
  document.getElementById('modalUnitContent').textContent = top.full_text || '내용이 없습니다.';
  document.getElementById('unitViewModal').classList.remove('hidden');
}

function downloadExcel() {
  if (!currentResults || !currentResults.id) return;
  window.open(`/api/match/export/${currentResults.id}/excel`, '_blank');
}

// ------------------- 드래그앤드롭 이벤트 -------------------

function initUploadHandlers() {
  const lectureZone = document.getElementById('lectureDropZone');
  const lectureInput = document.getElementById('lectureFileInput');

  lectureZone.addEventListener('click', () => lectureInput.click());
  lectureInput.addEventListener('change', (e) => uploadLectureFiles(e.target.files));

  ['dragenter', 'dragover'].forEach(name => {
    lectureZone.addEventListener(name, (e) => {
      e.preventDefault();
      lectureZone.classList.add('border-indigo-600', 'bg-indigo-100/40');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    lectureZone.addEventListener(name, (e) => {
      e.preventDefault();
      lectureZone.classList.remove('border-indigo-600', 'bg-indigo-100/40');
    });
  });

  lectureZone.addEventListener('drop', (e) => {
    uploadLectureFiles(e.dataTransfer.files);
  });

  const examZone = document.getElementById('examDropZone');
  const examInput = document.getElementById('examFileInput');

  examZone.addEventListener('click', () => examInput.click());
  examInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) uploadExamFile(e.target.files[0]);
  });

  examZone.addEventListener('dragover', (e) => e.preventDefault());
  examZone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) uploadExamFile(e.dataTransfer.files[0]);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ------------------- 이용자 비밀번호 변경 -------------------

function openChangePwModal() {
  document.getElementById('changePwModal').classList.remove('hidden');
}

function closeChangePwModal() {
  document.getElementById('changePwModal').classList.add('hidden');
  document.getElementById('userChangePwForm').reset();
  document.getElementById('userPwMsg').classList.add('hidden');
}

function initUserChangePwForm() {
  const form = document.getElementById('userChangePwForm');
  if (!form) return;
  const msg = document.getElementById('userPwMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.classList.add('hidden');
    const oldPw = document.getElementById('userOldPw').value;
    const newPw = document.getElementById('userNewPw').value;

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { ...getUserHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPw, new_password: newPw })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        msg.textContent = '비밀번호가 성공적으로 변경되었습니다!';
        msg.className = 'text-xs text-emerald-600 font-bold block';
        setTimeout(() => closeChangePwModal(), 1500);
      } else {
        msg.textContent = data.detail || '비밀번호 변경 실패';
        msg.className = 'text-xs text-rose-500 font-semibold block';
      }
    } catch (err) {
      msg.textContent = '서버 통신 오류';
      msg.className = 'text-xs text-rose-500 font-semibold block';
    }
  });
}

// ------------------- 문제은행 기출 문제집 & 실전 풀이 모드 -------------------

let currentExamForSolving = null;
let currentQuestionIndex = 0;
let userAnswers = {};
let solverTimerInterval = null;
let solverSeconds = 0;
let solverHintVisible = false;
let currentReviewData = null;
let currentExamForAnswerKey = null;

async function loadWorkbooks() {
  if (!currentSubjectId) return;
  try {
    let staticExams = await smartFetchJson(`/api/exams?subject_id=${currentSubjectId}`, './data/exams.json') || [];
    staticExams = staticExams.filter(e => !e.subject_id || e.subject_id === currentSubjectId || e.subject_id === "sub_fbdc79d0");

    // Supabase shared_exams 병합
    let cloudExams = [];
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('shared_exams')
          .select('*')
          .eq('subject_id', currentSubjectId)
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          cloudExams = data.map(ce => ({ ...ce, is_cloud: true }));
        }
      } catch (e) {}
    }

    const examMap = new Map();
    cloudExams.forEach(e => examMap.set(e.id, e));
    staticExams.forEach(e => { if (!examMap.has(e.id)) examMap.set(e.id, e); });
    let exams = Array.from(examMap.values());

    exams.forEach(e => {
      if (e.question_count === undefined && e.questions) {
        e.question_count = e.questions.length;
      }
    });

    let history = [];
    try {
      const histRes = await fetch(`/api/workbooks/history?subject_id=${currentSubjectId}`, { headers: getUserHeaders() });
      if (histRes.ok) history = await histRes.json();
    } catch (e) {}

    // 1. 문제집 서재 그리드 렌더링
    const grid = document.getElementById('workbookGrid');
    if (exams.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          <i class="fa-solid fa-book-open text-3xl mb-3 text-slate-300"></i>
          <p class="font-bold text-slate-700">현재 과목에 등록된 기출 문제집이 없습니다.</p>
          <p class="text-xs text-slate-400 mt-1">상단의 [2. 과목 족보 문항 관리] 탭에서 족보를 등록하면 자동으로 문제집이 생성됩니다.</p>
        </div>
      `;
    } else {
      grid.innerHTML = exams.map((e, idx) => {
        const attempts = history.filter(h => h.exam_id === e.id);
        const lastAttempt = attempts.length > 0 ? attempts[0] : null;
        const colorThemes = [
          'from-indigo-600 to-blue-500',
          'from-violet-600 to-purple-500',
          'from-cyan-600 to-teal-500',
          'from-rose-600 to-pink-500',
          'from-amber-600 to-orange-500'
        ];
        const theme = colorThemes[idx % colorThemes.length];

        return `
          <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between group">
            <div>
              <!-- 책 표지 상단 디자인 -->
              <div class="bg-gradient-to-tr ${theme} p-6 text-white relative">
                <div class="flex justify-between items-start">
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-white/20 text-white backdrop-blur-xs">
                    기출 문제은행
                  </span>
                  <span class="text-xs font-bold bg-black/20 px-2 py-0.5 rounded-md text-white/90">
                    ${e.question_count}문항
                  </span>
                </div>
                <h3 class="font-black text-lg text-white mt-4 leading-snug line-clamp-2">${escapeHtml(e.title)}</h3>
                <p class="text-[11px] text-white/80 mt-1 flex items-center gap-1.5">
                  <i class="fa-solid fa-clock text-[10px]"></i>
                  <span>${e.created_at || '-'}</span>
                </p>
              </div>

              <!-- 하단 상태 정보 -->
              <div class="p-5 space-y-2.5 text-xs">
                <div class="flex justify-between items-center text-slate-500">
                  <span>최근 풀이 기록:</span>
                  <span class="font-bold ${lastAttempt ? 'text-indigo-600' : 'text-slate-400'}">
                    ${lastAttempt ? `${lastAttempt.score}점 (${lastAttempt.submitted_at})` : '미응시'}
                  </span>
                </div>
              </div>
            </div>

            <!-- 액션 버튼들 -->
            <div class="p-5 pt-0 grid grid-cols-2 gap-2">
              <button onclick="openAnswerKeyModal('${e.id}')" class="py-2 px-3 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center justify-center gap-1">
                <i class="fa-solid fa-key text-[10px]"></i>
                <span>정답표 관리</span>
              </button>
              <button onclick="startSolving('${e.id}')" class="py-2 px-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md shadow-indigo-100 transition flex items-center justify-center gap-1">
                <i class="fa-solid fa-pen-nib text-[10px]"></i>
                <span>문제 풀기</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    // 2. 최근 이력 테이블 렌더링
    const histBody = document.getElementById('historyTableBody');
    if (history.length === 0) {
      histBody.innerHTML = `<tr><td colspan="5" class="px-6 py-6 text-center text-slate-400 text-xs">아직 문제 풀이 이력이 없습니다.</td></tr>`;
    } else {
      histBody.innerHTML = history.slice(0, 5).map(h => {
        const min = Math.floor((h.time_spent_seconds || 0) / 60);
        const sec = (h.time_spent_seconds || 0) % 60;
        const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="px-6 py-3.5 font-bold text-slate-900">${escapeHtml(h.exam_title)}</td>
            <td class="px-6 py-3.5 font-black text-indigo-600">${h.score}점</td>
            <td class="px-6 py-3.5 text-xs text-slate-600 font-semibold">${h.correct_count} / ${h.total_questions}문항</td>
            <td class="px-6 py-3.5 text-xs text-slate-500 font-mono">${timeStr}</td>
            <td class="px-6 py-3.5 text-xs text-slate-400">${h.submitted_at}</td>
          </tr>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('문제집 불러오기 실패:', err);
  }
}

// ------------------- 문제 풀이 실행 모드 -------------------


function normalizeQuestionChoices(rawChoices) {
  if (!Array.isArray(rawChoices)) return [];
  const circleSymbols = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  const normalized = [];

  for (let i = 0; i < rawChoices.length; i++) {
    const c = rawChoices[i];
    const text = (typeof c === 'object' && c !== null ? c.text : String(c)) || '';
    
    // 선지 내부에 다른 선지 번호가 겹쳐서 들어있는지 탐지: 예) "4) ...", " 4) ...", "② ...", "(4) ..."
    const match = text.match(/(?:[\s\.\,\;]|^)(?:([1-9])\)|(?:\(([1-9])\))|([①-⑨]))\s*(.+)$/);
    if (match) {
      let rawNum = match[1] || match[2];
      if (!rawNum && match[3]) {
        const idx = circleSymbols.indexOf(match[3]);
        if (idx !== -1) rawNum = String(idx + 1);
      }
      
      if (rawNum && parseInt(rawNum) > normalized.length + 1) {
        const part1 = text.slice(0, match.index).replace(/[\.\,\s]+$/, '').trim();
        const part2 = match[4].trim();
        
        normalized.push({
          label: circleSymbols[normalized.length] || `(${normalized.length + 1})`,
          text: part1
        });
        normalized.push({
          label: circleSymbols[normalized.length] || `(${normalized.length + 1})`,
          text: part2
        });
        continue;
      }
    }
    
    normalized.push({
      label: (typeof c === 'object' && c.label) ? c.label : (circleSymbols[normalized.length] || `(${normalized.length + 1})`),
      text: text
    });
  }

  return normalized;
}

function cleanQuestionStem(stem) {
  if (!stem) return '';
  let s = String(stem);
  s = s.replace(/\s*1\s*,\s*4\s*1\)\s*2\)\s*3\)\s*4\)\s*5\)\s*$/, '');
  s = s.replace(/\(\s*[1-5](?:\s*,\s*[1-5])*\s*\)([\.\s]*)$/, '( )$1');
  s = s.replace(/([\?\.\)])\s*([1-5](?:\s*,\s*[1-5])*)\s*$/, '$1');
  s = s.replace(/\s+([1-5](?:\s*,\s*[1-5])*)\s*$/, '');
  return s.trim();
}


async function startSolving(examId) {
  try {
    let exam = await smartFetchJson(`/api/exams/${examId}`, './data/exams.json');
    if (Array.isArray(exam)) {
      exam = exam.find(e => e.id === examId) || exam[0];
    }

    if (!exam || !exam.questions || exam.questions.length === 0) {
      alert('이 문제집에는 등록된 문항이 없습니다.');
      return;
    }

    currentExamForSolving = exam;
    currentQuestionIndex = 0;
    userAnswers = {};
    solverSeconds = 0;
    solverHintVisible = false;

    document.getElementById('wbView-list').classList.add('hidden');
    document.getElementById('wbView-result').classList.add('hidden');
    document.getElementById('wbView-solve').classList.remove('hidden');

    document.getElementById('solverTitle').textContent = exam.title;

    startSolverTimer();
    renderCurrentQuestion();
    renderOMRGrid();

  } catch (err) {
    alert('문제집을 불러오지 못했습니다.');
  }
}

function startSolverTimer() {
  if (solverTimerInterval) clearInterval(solverTimerInterval);
  const timerEl = document.getElementById('solverTimer');
  solverTimerInterval = setInterval(() => {
    solverSeconds++;
    const min = Math.floor(solverSeconds / 60);
    const sec = solverSeconds % 60;
    timerEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }, 1000);
}

function stopSolverTimer() {
  if (solverTimerInterval) {
    clearInterval(solverTimerInterval);
    solverTimerInterval = null;
  }
}

function cleanQuestionStem(stem) {
  if (!stem) return '';
  let s = String(stem);
  s = s.replace(/\s*1\s*,\s*4\s*1\)\s*2\)\s*3\)\s*4\)\s*5\)\s*$/, '');
  s = s.replace(/\(\s*[1-5](?:\s*,\s*[1-5])*\s*\)([\.\s]*)$/, '( )$1');
  s = s.replace(/([\?\.\)])\s*([1-5](?:\s*,\s*[1-5])*)\s*$/, '$1');
  s = s.replace(/\s+([1-5](?:\s*,\s*[1-5])*)\s*$/, '');
  return s.trim();
}

function renderCurrentQuestion() {
  if (!currentExamForSolving) return;
  const qList = currentExamForSolving.questions || [];
  const total = qList.length;
  const q = qList[currentQuestionIndex];
  if (!q) return;

  const qNum = q.q_number || (currentQuestionIndex + 1);

  // 헤더 및 프로그레스
  document.getElementById('solverProgressText').textContent = `문항 ${currentQuestionIndex + 1} / ${total}`;
  document.getElementById('currentQNumBadge').textContent = `Q. ${qNum}`;
  document.getElementById('currentQStem').textContent = cleanQuestionStem(q.stem || '');
  document.getElementById('qIndicator').textContent = `${currentQuestionIndex + 1} / ${total}`;

  // 이전/다음 버튼 비활성화 상태
  document.getElementById('btnPrevQ').disabled = currentQuestionIndex === 0;
  document.getElementById('btnNextQ').disabled = currentQuestionIndex === total - 1;

  // 선지 및 주관식 렌더링
  const choicesBox = document.getElementById('currentChoicesContainer');
  const currentAnswer = userAnswers[String(qNum)] || '';

  if (q.choices && q.choices.length > 0) {
    choicesBox.innerHTML = q.choices.map((c, cIdx) => {
      const label = c.label || `(${cIdx + 1})`;
      const isSelected = currentAnswer === label;
      const activeClass = isSelected 
        ? 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-500/20' 
        : 'border-slate-200 bg-white hover:bg-slate-50/80';
      const badgeClass = isSelected
        ? 'bg-indigo-600 text-white font-bold'
        : 'bg-slate-100 text-slate-700 font-semibold group-hover:bg-indigo-100 group-hover:text-indigo-700';

      return `
        <div onclick="selectAnswer('${escapeHtml(label)}')" 
             class="group flex items-start gap-3.5 p-4 rounded-xl border-2 transition cursor-pointer ${activeClass}">
          <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 transition ${badgeClass}">
            ${escapeHtml(label)}
          </span>
          <span class="text-sm font-semibold text-slate-900 leading-snug pt-0.5">${escapeHtml(c.text)}</span>
        </div>
      `;
    }).join('');
  } else {
    // 단답형 / 서술형 주관식 입력 UI
    choicesBox.innerHTML = `
      <div class="p-5 rounded-2xl border-2 border-indigo-100 bg-indigo-50/30 space-y-3">
        <div class="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wide">
          <i class="fa-solid fa-pen"></i>
          <span>단답형 / 주관식 문항</span>
        </div>
        <p class="text-xs text-slate-500">답안을 입력창에 직접 작성해주세요.</p>
        <div class="flex items-center gap-3">
          <input type="text" id="subjectiveInput" value="${escapeHtml(currentAnswer)}" 
                 oninput="onSubjectiveInput(this.value)"
                 placeholder="답안을 입력하세요 (예: 명칭, 수치, 서술)" 
                 class="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm font-medium bg-white">
        </div>
      </div>
    `;
  }

  // 힌트 내용 업데이트
  updateSolverHintContent(q);
}

function onSubjectiveInput(val) {
  if (!currentExamForSolving) return;
  const qList = currentExamForSolving.questions || [];
  const q = qList[currentQuestionIndex];
  const qNum = String(q.q_number || (currentQuestionIndex + 1));
  userAnswers[qNum] = val.trim();
  renderOMRGrid();
}

function selectAnswer(label) {
  if (!currentExamForSolving) return;
  const qList = currentExamForSolving.questions || [];
  const q = qList[currentQuestionIndex];
  const qNum = String(q.q_number || (currentQuestionIndex + 1));

  // 토글 선택 (이미 선택된 걸 누르면 유지)
  userAnswers[qNum] = label;

  renderCurrentQuestion();
  renderOMRGrid();
}

function renderOMRGrid() {
  if (!currentExamForSolving) return;
  const qList = currentExamForSolving.questions || [];
  const omr = document.getElementById('omrGrid');
  let answeredCount = 0;

  omr.innerHTML = qList.map((q, idx) => {
    const qNum = String(q.q_number || (idx + 1));
    const ans = userAnswers[qNum] || '';
    if (ans) answeredCount++;

    const isCurrent = idx === currentQuestionIndex;
    const currentIndicator = isCurrent ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : 'bg-slate-50/70';

    return `
      <div onclick="jumpToQuestion(${idx})" 
           class="flex items-center justify-between p-2 rounded-xl border border-slate-200 hover:border-indigo-400 cursor-pointer transition ${currentIndicator}">
        <span class="text-xs font-bold text-slate-700 ml-1">${idx + 1}번</span>
        <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${ans ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-200 text-slate-400'}">
          ${ans || '-'}
        </span>
      </div>
    `;
  }).join('');

  document.getElementById('omrAnsweredCount').textContent = `${answeredCount}/${qList.length} 마킹`;
}

function jumpToQuestion(idx) {
  currentQuestionIndex = idx;
  renderCurrentQuestion();
  renderOMRGrid();
}

function navigateQuestion(delta) {
  if (!currentExamForSolving) return;
  const qList = currentExamForSolving.questions || [];
  const nextIdx = currentQuestionIndex + delta;
  if (nextIdx >= 0 && nextIdx < qList.length) {
    jumpToQuestion(nextIdx);
  }
}

function toggleSolverHint() {
  solverHintVisible = !solverHintVisible;
  const box = document.getElementById('solverHintBox');
  const btn = document.getElementById('btnToggleHint');

  if (solverHintVisible) {
    box.classList.remove('hidden');
    btn.className = 'px-3 py-1.5 rounded-xl bg-indigo-600 text-white border border-indigo-500 text-xs font-bold transition flex items-center gap-1.5';
  } else {
    box.classList.add('hidden');
    btn.className = 'px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-900/60 border border-slate-700 hover:border-indigo-500 text-xs font-semibold text-indigo-300 transition flex items-center gap-1.5';
  }
}

function updateSolverHintContent(q) {
  const content = document.getElementById('solverHintContent');
  content.innerHTML = `
    <p class="text-slate-600">
      💡 <b>강의자료 매칭 힌트:</b> 시험 제출 후 각 선지가 몇 번 슬라이드/페이지에서 출제되었는지 문맥과 형광펜으로 완벽하게 확인하실 수 있습니다.
    </p>
  `;
}

function exitSolver() {
  if (confirm('문제 풀이를 중단하고 나가시겠습니까? 작성한 답안은 저장되지 않습니다.')) {
    stopSolverTimer();
    document.getElementById('wbView-solve').classList.add('hidden');
    document.getElementById('wbView-list').classList.remove('hidden');
    loadWorkbooks();
  }
}

// ------------------- 정답 비교 헬퍼 (복수 정답 & 단답형 완벽 지원) -------------------

const CIRCLED_TO_NUM = {
  '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
  '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10',
  '⑴': '1', '⑵': '2', '⑶': '3', '⑷': '4', '⑸': '5'
};

function normalizeTokens(str) {
  if (!str) return [];
  let s = String(str);
  for (const [c, n] of Object.entries(CIRCLED_TO_NUM)) {
    s = s.split(c).join(n);
  }
  return s.split(/[,/·\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
}

function evaluateQuestionAnswer(userAns, correctKey) {
  if (!correctKey || !correctKey.trim()) {
    return { hasKey: false, isCorrect: false };
  }
  const uTrim = (userAns || '').trim();
  const cTrim = correctKey.trim();
  if (!uTrim) {
    return { hasKey: true, isCorrect: false };
  }

  // 1. 단순 텍스트 일치 (공백/대소문자 무시 - 단답형 및 원문자 일치)
  if (uTrim.toLowerCase() === cTrim.toLowerCase()) {
    return { hasKey: true, isCorrect: true };
  }

  // 2. 복수 정답 및 번호 정규화 비교 (예: "3,4", "1, 4", "③, ④")
  const uTokens = normalizeTokens(uTrim);
  const cTokens = normalizeTokens(cTrim);

  // 복수 정답 중 하나를 선택한 경우도 정답 처리
  if (uTokens.length === 1 && cTokens.includes(uTokens[0])) {
    return { hasKey: true, isCorrect: true };
  }

  // 복수 정답 전체를 다 맞춘 경우
  if (uTokens.length > 1 && uTokens.slice().sort().join(',') === cTokens.slice().sort().join(',')) {
    return { hasKey: true, isCorrect: true };
  }

  return { hasKey: true, isCorrect: false };
}

function formatDisplayChoice(choiceStr) {
  if (!choiceStr) return '';
  const NUM_TO_CIRC = { '1':'①', '2':'②', '3':'③', '4':'④', '5':'⑤' };
  let res = choiceStr;
  for (const [n, c] of Object.entries(NUM_TO_CIRC)) {
    res = res.replace(new RegExp(`(?<!\\d)${n}(?!\\d)`, 'g'), c);
  }
  return res;
}

async function submitExam() {
  if (!currentExamForSolving) return;
  const qList = currentExamForSolving.questions || [];
  const total = qList.length;
  const answered = Object.keys(userAnswers).length;

  let msg = `총 ${total}문항 중 ${answered}문항을 마킹하셨습니다.\n답안을 제출하고 채점하시겠습니까?`;
  if (answered < total) {
    msg = `[주의] 아직 풀지 않은 문항이 ${total - answered}개 있습니다!\n그래도 제출하고 채점하시겠습니까?`;
  }

  if (!confirm(msg)) return;

  stopSolverTimer();

  // 1. 서버 API 호출 시도 (로컬 서버 환경일 때)
  let scoredData = null;
  try {
    const res = await fetch(`/api/workbooks/${currentExamForSolving.id}/submit`, {
      method: 'POST',
      headers: { ...getUserHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_answers: userAnswers,
        time_spent_seconds: solverSeconds
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        scoredData = data;
      }
    }
  } catch (err) {
    // 서버가 없는 GitHub Pages 환경이거나 통신 오류 시 클라이언트 사이드 채점으로 자동 전환
  }

  // 2. 클라이언트 사이드 채점 fallback (GitHub Pages 완전 지원)
  if (!scoredData) {
    const answerKeys = currentExamForSolving.answer_keys || {};
    let correctCount = 0;
    let scoredQ = 0;
    const reviews = [];

    // 매칭 결과 캐시 참조
    const matchingQList = (currentResults && currentResults.questions) ? currentResults.questions : [];

    qList.forEach((q, idx) => {
      const qNum = String(q.q_number || (idx + 1));
      const uChoice = userAnswers[qNum] || '';
      const cChoice = answerKeys[qNum] || '';

      const evalRes = evaluateQuestionAnswer(uChoice, cChoice);
      if (evalRes.hasKey) {
        scoredQ++;
        if (evalRes.isCorrect) {
          correctCount++;
        }
      }

      const matchedQ = matchingQList.find(mq => String(mq.q_number) === qNum);

      reviews.push({
        q_number: intOrStr(qNum),
        stem: q.stem || '',
        choices: q.choices || [],
        user_choice: uChoice,
        correct_choice: formatDisplayChoice(cChoice),
        is_correct: evalRes.isCorrect,
        has_answer_key: evalRes.hasKey,
        matched_analysis: matchedQ ? (matchedQ.choices || []) : []
      });
    });

    const finalScore = scoredQ > 0 ? Math.round((correctCount / scoredQ) * 1000) / 10 : 0;

    scoredData = {
      success: true,
      score: finalScore,
      correct_count: correctCount,
      total_scored: scoredQ,
      total_questions: total,
      time_spent_seconds: solverSeconds,
      reviews: reviews
    };
  }

  // 3. Supabase DB에 풀이 기록 저장 (로그인된 경우)
  if (currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const entries = Object.entries(userAnswers).map(([qNum, ans]) => {
        const correctKey = (currentExamForSolving.answer_keys || {})[qNum] || '';
        const ev = evaluateQuestionAnswer(ans, correctKey);
        return {
          user_id: currentUser.id,
          subject_id: currentSubjectId || 'default',
          exam_id: currentExamForSolving.id,
          q_num: parseInt(qNum, 10) || 0,
          user_answer: ans,
          is_correct: ev.isCorrect,
          updated_at: new Date().toISOString()
        };
      });

      if (entries.length > 0) {
        await supabaseClient.from('user_answers').upsert(entries, {
          onConflict: 'user_id,exam_id,q_num'
        });
      }
    } catch (sbErr) {
      console.warn('Supabase answer saving failed:', sbErr);
    }
  }

  currentReviewData = scoredData;
  renderReviewResult(scoredData);
}

function intOrStr(val) {
  const n = parseInt(val, 10);
  return isNaN(n) ? val : n;
}

// ------------------- 채점 결과 & 오답노트 뷰 -------------------

function renderReviewResult(data) {
  document.getElementById('wbView-solve').classList.add('hidden');
  document.getElementById('wbView-list').classList.add('hidden');
  document.getElementById('wbView-result').classList.remove('hidden');

  document.getElementById('resultExamTitle').textContent = currentExamForSolving.title;

  const min = Math.floor(data.time_spent_seconds / 60);
  const sec = data.time_spent_seconds % 60;
  const timeStr = `${String(min).padStart(2, '0')}분 ${String(sec).padStart(2, '0')}초`;
  document.getElementById('resultMeta').textContent = `소요 시간: ${timeStr} | 총 ${data.total_questions}문항 중 ${data.total_scored}문항 채점`;

  document.getElementById('resultScoreText').innerHTML = `${data.score}<span class="text-base text-white font-normal">점</span>`;
  document.getElementById('resultFractionText').textContent = `${data.correct_count} / ${data.total_scored} 정답`;

  // 문항별 리뷰 카드 목록
  const container = document.getElementById('reviewQuestionsContainer');
  container.innerHTML = (data.reviews || []).map(r => {
    const hasKey = r.has_answer_key;
    const isCorrect = r.is_correct;
    
    let statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">정답 미설정</span>';
    let borderColor = 'border-slate-200';

    if (hasKey) {
      if (isCorrect) {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-circle-check"></i> 정답</span>';
        borderColor = 'border-emerald-200';
      } else {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200"><i class="fa-solid fa-circle-xmark"></i> 오답</span>';
        borderColor = 'border-rose-200';
      }
    }

    return `
      <div class="rounded-2xl border-2 ${borderColor} p-6 space-y-4 bg-white shadow-xs">
        <div class="flex justify-between items-start gap-4">
          <div class="flex items-start gap-3 flex-1">
            <span class="w-8 h-8 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
              ${r.q_number}
            </span>
            <h4 class="font-bold text-slate-900 text-base leading-snug">${escapeHtml(cleanQuestionStem(r.stem))}</h4>
          </div>
          <div>${statusBadge}</div>
        </div>

        <!-- 내가 고른 답 vs 실제 정답 비교 바 -->
        <div class="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
          <span>내가 고른 답: <b class="font-bold ${isCorrect ? 'text-emerald-700' : 'text-rose-600'}">${r.user_choice || '미마킹'}</b></span>
          <span class="text-slate-300">|</span>
          <span>실제 정답: <b class="font-bold text-indigo-700">${r.correct_choice || '정답 미등록'}</b></span>
        </div>

        <!-- 선지 및 강의 자료 언급 위치 연계 -->
        <div class="space-y-3 pt-2">
          ${(r.choices || []).map((c, cIdx) => {
            const cLabel = c.label || `(${cIdx + 1})`;
            const anChoice = (r.matched_analysis || []).find(mc => mc.label === cLabel);
            const topMatch = anChoice?.analysis?.top_match;

            return `
              <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div class="flex justify-between items-center text-xs">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-indigo-700">${escapeHtml(cLabel)}</span>
                    <span class="font-semibold text-slate-800">${escapeHtml(c.text)}</span>
                  </div>
                  ${topMatch ? `
                    <span class="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                      ${escapeHtml(topMatch.doc_title)} [${topMatch.unit_type} ${topMatch.unit_number}]
                    </span>
                  ` : ''}
                </div>

                ${topMatch?.snippet ? `
                  <div class="bg-white p-2.5 rounded-lg border border-slate-200/80 text-[11px] text-slate-700 leading-relaxed font-sans">
                    <span class="text-[10px] font-bold text-slate-400 block mb-0.5">강의자료 언급 문맥:</span>
                    <div>${topMatch.highlighted_snippet || escapeHtml(topMatch.snippet)}</div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function retryCurrentExam() {
  if (currentExamForSolving) {
    startSolving(currentExamForSolving.id);
  }
}

function backToWorkbooksList() {
  document.getElementById('wbView-result').classList.add('hidden');
  document.getElementById('wbView-solve').classList.add('hidden');
  document.getElementById('wbView-list').classList.remove('hidden');
  loadWorkbooks();
}

// ------------------- 정답표(Answer Key) 관리 모달 (선지 개수 맞춤 동적 세팅) -------------------

async function openAnswerKeyModal(examId) {
  try {
    let exam = await smartFetchJson(`/api/exams/${examId}`, './data/exams.json');
    if (Array.isArray(exam)) {
      exam = exam.find(e => e.id === examId) || exam[0];
    }
    if (!exam) {
      alert('족보 데이터를 불러올 수 없습니다.');
      return;
    }
    currentExamForAnswerKey = exam;

    // 로컬스토리지에 저장된 커스텀 정답표가 있다면 병합
    const localSavedKeys = localStorage.getItem(`custom_answer_keys_${examId}`);
    if (localSavedKeys) {
      try {
        exam.answer_keys = { ...(exam.answer_keys || {}), ...JSON.parse(localSavedKeys) };
      } catch (e) {}
    }

    if (!exam.answer_keys) exam.answer_keys = {};
    (exam.questions || []).forEach((q, idx) => {
      const qNum = String(q.q_number || (idx + 1));
      if (!exam.answer_keys[qNum] && q.answer) {
        exam.answer_keys[qNum] = String(q.answer);
      }
    });

    document.getElementById('akModalTitle').textContent = `[${exam.title || '족보'}] 정답표 수정`;

    renderAnswerKeyQuestionsList();

    const modal = document.getElementById('answerKeyModal');
    if (modal) modal.classList.remove('hidden');
  } catch (err) {
    console.error('Answer key load error:', err);
    alert('정답표를 불러오지 못했습니다.');
  }
}

function renderAnswerKeyQuestionsList() {
  if (!currentExamForAnswerKey) return;
  const container = document.getElementById('akQuestionsList');
  if (!container) return;

  const existingKeys = currentExamForAnswerKey.answer_keys || {};
  const circleSymbols = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

  container.innerHTML = (currentExamForAnswerKey.questions || []).map((q, idx) => {
    const qNum = String(q.q_number || (idx + 1));
    const currentKey = existingKeys[qNum] || '';
    const cleanChoices = normalizeQuestionChoices(q.choices || []);
    const choicesCount = cleanChoices.length;
    const isSubjective = choicesCount === 0;

    // 문제에서 추출한 선지 개수(4개, 5개, 7개 등)에 맞추어 정확한 개수만큼 버튼 세팅
    let choiceButtonsHtml = '';
    if (!isSubjective) {
      const buttons = [];
      for (let cIdx = 0; cIdx < choicesCount; cIdx++) {
        const symbol = circleSymbols[cIdx] || `(${cIdx + 1})`;
        const digit = String(cIdx + 1);
        const isSelected = String(currentKey) === symbol || String(currentKey) === digit;
        const activeClass = isSelected
          ? 'bg-indigo-600 text-white font-bold border-indigo-600 shadow-sm ring-1 ring-indigo-400'
          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-200/70';
        buttons.push(`
          <button type="button" onclick="quickSetAnswerKey('${qNum}', '${symbol}')" 
                  class="min-w-[28px] h-7 px-1.5 flex items-center justify-center text-xs rounded-lg border transition ${activeClass}">
            ${symbol}
          </button>
        `);
      }
      choiceButtonsHtml = `
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-xs text-slate-500 font-semibold mr-1">객관식 (${choicesCount}지선다):</span>
          <div class="flex flex-wrap gap-1">
            ${buttons.join('')}
          </div>
        </div>
      `;
    } else {
      choiceButtonsHtml = `<span class="text-xs text-indigo-600 font-semibold"><i class="fa-solid fa-pen"></i> 주관식/서술형 문항</span>`;
    }

    return `
      <div class="p-4 bg-slate-50 hover:bg-slate-100/80 transition rounded-2xl border border-slate-200/90 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <p class="text-xs font-bold text-slate-800 flex items-start gap-2 flex-1 leading-snug">
            <span class="w-6 h-6 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
              ${qNum}
            </span>
            <span class="leading-relaxed pt-0.5">${escapeHtml(cleanQuestionStem(q.stem || '문항 ' + qNum))}</span>
          </p>
          <span class="text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0 ${currentKey ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-200 text-slate-600'}">
            ${currentKey ? '정답 ' + escapeHtml(currentKey) : '미지정'}
          </span>
        </div>
        
        <div class="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-200/60">
          ${choiceButtonsHtml}

          <!-- 직접 입력창 -->
          <div class="flex items-center gap-2 flex-1 max-w-xs justify-end">
            <span class="text-xs text-slate-500 font-semibold shrink-0">직접입력:</span>
            <input type="text" id="ak_input_${qNum}" value="${escapeHtml(currentKey)}" 
                   oninput="updateAnswerKeyText('${qNum}', this.value)"
                   placeholder="${isSubjective ? '주관식 정답 입력' : '예: ③ 또는 3,4'}" 
                   class="w-36 px-2.5 py-1 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-bold text-center">
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function quickSetAnswerKey(qNum, opt) {
  if (!currentExamForAnswerKey) return;
  if (!currentExamForAnswerKey.answer_keys) currentExamForAnswerKey.answer_keys = {};
  
  let cur = (currentExamForAnswerKey.answer_keys[qNum] || '').trim();
  if (cur === opt) {
    delete currentExamForAnswerKey.answer_keys[qNum];
  } else {
    currentExamForAnswerKey.answer_keys[qNum] = opt;
  }
  renderAnswerKeyQuestionsList();
}

function updateAnswerKeyText(qNum, val) {
  if (!currentExamForAnswerKey) return;
  if (!currentExamForAnswerKey.answer_keys) currentExamForAnswerKey.answer_keys = {};
  const trimmed = val.trim();
  if (trimmed) {
    currentExamForAnswerKey.answer_keys[qNum] = trimmed;
  } else {
    delete currentExamForAnswerKey.answer_keys[qNum];
  }
}

function closeAnswerKeyModal() {
  const modal = document.getElementById('answerKeyModal');
  if (modal) modal.classList.add('hidden');
}

async function saveAnswerKeyForm() {
  if (!currentExamForAnswerKey) return;
  const examId = currentExamForAnswerKey.id;
  const keys = currentExamForAnswerKey.answer_keys || {};

  if (Array.isArray(currentExamForAnswerKey.questions)) {
    currentExamForAnswerKey.questions.forEach((q, idx) => {
      const qNum = String(q.q_number || (idx + 1));
      if (keys[qNum]) q.answer = keys[qNum];
    });
  }

  localStorage.setItem(`custom_answer_keys_${examId}`, JSON.stringify(keys));

    // Supabase 클라우드에 정답표 실시간 영구 보존 (다른 모든 이용자 화면에 자동 반영)
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const author = currentUser ? `${currentUser.name} (${currentUser.username})` : '사용자';
        await supabaseClient.from('exam_overrides').upsert({
          exam_id: examId,
          subject_id: currentSubjectId,
          exam_data: currentExamForAnswerKey,
          updated_by: author,
          updated_at: new Date().toISOString()
        });
      } catch (e) {
        console.warn('Supabase answer key sync warning:', e);
      }
    }

  if (currentExamForSolving && currentExamForSolving.id === examId) {
    currentExamForSolving.answer_keys = { ...keys };
    if (Array.isArray(currentExamForSolving.questions)) {
      currentExamForSolving.questions.forEach((q, idx) => {
        const qNum = String(q.q_number || (idx + 1));
        if (keys[qNum]) q.answer = keys[qNum];
      });
    }
  }

  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      await supabaseClient.from('exam_answer_keys').upsert({
        exam_id: examId,
        keys: keys,
        updated_at: new Date().toISOString()
      });
    } catch (e) {}
  }

  alert(`[${currentExamForAnswerKey.title || '족보'}] 정답표가 저장되었습니다!\n\n문제 풀이 및 채점 시 수정된 정답이 바로 적용됩니다.`);
  closeAnswerKeyModal();
  if (typeof loadWorkbooks === 'function') loadWorkbooks();
}

async function downloadAnswerKeyExamsJson() {
  if (!currentExamForAnswerKey) return;
  try {
    let allExams = await smartFetchJson('/api/exams', './data/exams.json');
    if (!Array.isArray(allExams)) allExams = [currentExamForAnswerKey];
    
    const idx = allExams.findIndex(e => e.id === currentExamForAnswerKey.id);
    if (idx !== -1) {
      allExams[idx] = currentExamForAnswerKey;
    } else {
      allExams.push(currentExamForAnswerKey);
    }

    const jsonStr = JSON.stringify(allExams, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exams.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('다운로드 중 오류가 발생했습니다.');
  }
}
// ------------------- 시스템 관리자 콘솔 모달 (내장형) -------------------

let isAdminUnlocked = false;

function openAdminModal() {
  const modal = document.getElementById('adminConsoleModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  if (isAdminUnlocked || (currentUser && currentUser.role === 'admin')) {
    showAdminDashboardUI();
  } else {
    document.getElementById('adminAuthLockBox').classList.remove('hidden');
    document.getElementById('adminDashboardPanel').classList.add('hidden');
    document.getElementById('adminMasterPassword').value = '';
    document.getElementById('adminLockError').classList.add('hidden');
  }
}

function closeAdminModal() {
  const modal = document.getElementById('adminConsoleModal');
  if (modal) modal.classList.add('hidden');
}

function handleAdminUnlock(e) {
  e.preventDefault();
  const pwInput = document.getElementById('adminMasterPassword');
  const errEl = document.getElementById('adminLockError');
  errEl.classList.add('hidden');

  const pw = pwInput.value.trim();
  if (pw === 'admin2026!' || (currentUser && currentUser.role === 'admin')) {
    isAdminUnlocked = true;
    showAdminDashboardUI();
  } else {
    errEl.textContent = '관리자 마스터 비밀번호가 올바르지 않습니다.';
    errEl.classList.remove('hidden');
  }
}

function showAdminDashboardUI() {
  document.getElementById('adminAuthLockBox').classList.add('hidden');
  document.getElementById('adminDashboardPanel').classList.remove('hidden');
  fetchAdminProfiles();
}

async function fetchAdminProfiles() {
  if (typeof supabaseClient === 'undefined' || !supabaseClient) {
    alert('Supabase 연결이 필요합니다.');
    return;
  }

  try {
    const { data: profiles, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Profiles fetch error:', error);
      return;
    }

    const all = profiles || [];
    const pending = all.filter(p => p.status === 'pending');
    const approved = all.filter(p => p.status === 'approved');

    document.getElementById('adminPendingCountText').textContent = pending.length;
    document.getElementById('adminApprovedCountText').textContent = approved.length;
    document.getElementById('adminTotalUsersText').textContent = all.length;

    const headerBadge = document.getElementById('headerPendingBadge');
    if (headerBadge) {
      if (pending.length > 0) headerBadge.classList.remove('hidden');
      else headerBadge.classList.add('hidden');
    }

    const pBody = document.getElementById('adminPendingTableBody');
    if (pending.length === 0) {
      pBody.innerHTML = `<tr><td colspan="5" class="px-4 py-5 text-center text-slate-500">현재 대기 중인 가입 신청이 없습니다.</td></tr>`;
    } else {
      pBody.innerHTML = pending.map(u => `
        <tr class="hover:bg-slate-800/60">
          <td class="px-4 py-3 font-bold text-white">${escapeHtml(u.name || '-')}</td>
          <td class="px-4 py-3 font-mono text-indigo-300">${escapeHtml(u.email || '-')}</td>
          <td class="px-4 py-3 text-slate-300">${escapeHtml(u.note || '-')}</td>
          <td class="px-4 py-3 text-slate-400 text-[11px]">${u.created_at ? u.created_at.slice(0, 16).replace('T', ' ') : '-'}</td>
          <td class="px-4 py-3 text-right space-x-1.5">
            <button onclick="updateProfileStatus('${u.id}', 'approved')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition shadow">
              <i class="fa-solid fa-check text-[10px]"></i> 승인
            </button>
            <button onclick="updateProfileStatus('${u.id}', 'rejected')" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition shadow">
              <i class="fa-solid fa-xmark text-[10px]"></i> 거절
            </button>
          </td>
        </tr>
      `).join('');
    }

    const allBody = document.getElementById('adminAllUsersTableBody');
    if (all.length === 0) {
      allBody.innerHTML = `<tr><td colspan="5" class="px-4 py-5 text-center text-slate-500">등록된 회원이 없습니다.</td></tr>`;
    } else {
      allBody.innerHTML = all.map(u => {
        let badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">대기</span>';
        if (u.status === 'approved') badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">승인됨</span>';
        if (u.status === 'rejected') badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300">거절/정지</span>';

        return `
          <tr class="hover:bg-slate-800/60">
            <td class="px-4 py-2.5 font-semibold text-white">${escapeHtml(u.name || '-')}</td>
            <td class="px-4 py-2.5 font-mono text-slate-300">${escapeHtml(u.email || '-')}</td>
            <td class="px-4 py-2.5">${badge}</td>
            <td class="px-4 py-2.5 text-slate-400 text-[11px]">${u.created_at ? u.created_at.slice(0, 10) : '-'}</td>
            <td class="px-4 py-2.5 text-right space-x-1">
              ${u.status === 'approved' ? `
                <button onclick="updateProfileStatus('${u.id}', 'rejected')" class="px-2 py-0.5 text-xs text-amber-400 hover:bg-amber-400/20 rounded border border-amber-400/40">정지</button>
              ` : `
                <button onclick="updateProfileStatus('${u.id}', 'approved')" class="px-2 py-0.5 text-xs text-emerald-400 hover:bg-emerald-400/20 rounded border border-emerald-400/40">승인</button>
              `}
              <button onclick="deleteProfileUser('${u.id}')" class="px-2 py-0.5 text-xs text-rose-400 hover:bg-rose-400/20 rounded border border-rose-400/40">삭제</button>
            </td>
          </tr>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('Admin profiles error:', err);
  }
}

async function updateProfileStatus(userId, status) {
  const label = status === 'approved' ? '승인' : '거절/정지';
  if (!confirm(`이 회원을 ${label} 처리하시겠습니까?`)) return;

  try {
    const { error } = await supabaseClient
      .from('profiles')
      .update({ status: status })
      .eq('id', userId);

    if (error) {
      alert('상태 변경 실패: ' + error.message);
      return;
    }

    alert(`${label} 처리가 완료되었습니다.`);
    fetchAdminProfiles();
  } catch (err) {
    alert('처리 오류');
  }
}

async function deleteProfileUser(userId) {
  if (!confirm('정말 이 회원을 삭제하시겠습니까? 관련 데이터가 모두 삭제됩니다.')) return;

  try {
    const { error } = await supabaseClient
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) {
      alert('삭제 실패: ' + error.message);
      return;
    }

    alert('회원이 삭제되었습니다.');
    fetchAdminProfiles();
  } catch (err) {
    alert('삭제 오류');
  }
}


// 문제은행 단축키: 문제에서 추출한 선지 개수(choicesCount)에 맞추어 1~N번만 선택 허용
document.addEventListener('keydown', (e) => {
  const solveView = document.getElementById('wbView-solve');
  if (!solveView || solveView.classList.contains('hidden')) return;
  if (!currentExamForSolving) return;

  // textarea나 input 입력 중에는 숫자 단축키 무시
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

  const qList = currentExamForSolving.questions || [];
  const q = qList[currentQuestionIndex];
  if (!q) return;

  const cleanChoices = normalizeQuestionChoices(q.choices || []);
  const choicesCount = cleanChoices.length;

  // 숫자 키 1~9 입력 감지
  if (e.key >= '1' && e.key <= '9') {
    const num = parseInt(e.key, 10);
    // 문제에서 추출한 선지 개수 이내일 때만 선택 세팅! (선지가 4개면 1~4만 허용)
    if (num >= 1 && num <= choicesCount) {
      const targetChoice = cleanChoices[num - 1];
      const circleSymbols = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
      const label = targetChoice.label || circleSymbols[num - 1] || `(${num})`;
      selectAnswer(label);
      e.preventDefault();
    }
  } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
    navigateQuestion(1);
    e.preventDefault();
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    navigateQuestion(-1);
    e.preventDefault();
  }
});
