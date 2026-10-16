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

// ------------------- 인증 및 로그인 -------------------

async function checkUserAuth() {
  if (!userToken) {
    showLoginModal(true);
    return;
  }
  try {
    const res = await fetch('/api/auth/me', { headers: getUserHeaders() });
    const data = await res.json();
    if (data.authenticated) {
      currentUser = data.user;
      document.getElementById('userNameDisplay').textContent = `${currentUser.name} (${currentUser.username})`;
      showLoginModal(false);
      await loadSubjects();
    } else {
      showLoginModal(true);
    }
  } catch (err) {
    showLoginModal(true);
  }
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
  // 로그인 폼
  const loginForm = document.getElementById('loginForm');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uInput = document.getElementById('loginUsername');
    const pInput = document.getElementById('loginPassword');
    const errEl = document.getElementById('loginError');
    errEl.classList.add('hidden');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: uInput.value.trim(),
          password: pInput.value
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        userToken = data.token;
        localStorage.setItem('user_token', userToken);
        showLoginModal(false);
        checkUserAuth();
      } else {
        errEl.textContent = data.detail || '로그인 실패';
        errEl.classList.remove('hidden');
      }
    } catch (err) {
      errEl.textContent = '서버 통신 오류';
      errEl.classList.remove('hidden');
    }
  });

  // 가입 신청 폼
  const regForm = document.getElementById('registerForm');
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const note = document.getElementById('regNote').value.trim();
    const msgEl = document.getElementById('regMsg');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password, note })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        msgEl.textContent = data.message;
        msgEl.className = 'text-xs text-emerald-600 font-bold block p-2 bg-emerald-50 rounded-lg';
        regForm.reset();
        setTimeout(() => switchAuthTab('login'), 2500);
      } else {
        msgEl.textContent = data.detail || '신청 실패';
        msgEl.className = 'text-xs text-rose-500 font-semibold block';
      }
    } catch (err) {
      msgEl.textContent = '서버 통신 오류';
      msgEl.className = 'text-xs text-rose-500 font-semibold block';
    }
  });
}

function userLogout() {
  if (confirm('로그아웃 하시겠습니까?')) {
    localStorage.removeItem('user_token');
    userToken = '';
    window.location.reload();
  }
}

// ------------------- 과목 관리 -------------------

async function loadSubjects() {
  try {
    const res = await fetch('/api/subjects', { headers: getUserHeaders() });
    if (!res.ok) return;
    const subs = await res.json();

    const sel = document.getElementById('activeSubjectSelect');
    if (subs.length === 0) {
      sel.innerHTML = '<option value="">등록된 과목이 없습니다 (관리자 문의)</option>';
      return;
    }

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
    const res = await fetch(`/api/lectures?subject_id=${currentSubjectId}`, { headers: getUserHeaders() });
    if (!res.ok) return;
    const docs = await res.json();

    document.getElementById('badgeLectureCount').textContent = docs.length;
    document.getElementById('lectureTotalCountText').textContent = `총 ${docs.length}개 문서`;

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
  if (!confirm('이 강의 자료를 삭제하시겠습니까?')) return;
  try {
    const res = await fetch(`/api/lectures/${docId}`, {
      method: 'DELETE',
      headers: getUserHeaders()
    });
    if (res.ok) {
      loadLectures();
    }
  } catch (err) {
    alert('삭제 실패');
  }
}

async function viewLectureUnits(docId) {
  try {
    const res = await fetch(`/api/lectures/${docId}/units`, { headers: getUserHeaders() });
    if (!res.ok) return;
    const data = await res.json();

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
    const res = await fetch(`/api/exams?subject_id=${currentSubjectId}`, { headers: getUserHeaders() });
    if (!res.ok) return;
    const exams = await res.json();

    document.getElementById('badgeExamCount').textContent = exams.length;
    document.getElementById('examTotalCountText').textContent = `총 ${exams.length}개 세트`;

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

async function submitPastedExam() {
  if (!currentSubjectId) return;
  const title = document.getElementById('pasteExamTitle').value.trim() || '붙여넣은 족보';
  const content = document.getElementById('pasteExamContent').value.trim();

  if (!content) {
    alert('족보 문항 텍스트를 입력해주세요.');
    return;
  }

  try {
    const res = await fetch('/api/exams/paste', {
      method: 'POST',
      headers: { ...getUserHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: currentSubjectId, title, text_content: content })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`족보가 등록되었습니다. 총 ${data.question_count}개 문항이 자동 추출되었습니다.`);
      document.getElementById('pasteExamContent').value = '';
      document.getElementById('pasteExamTitle').value = '';
      loadExams();
    } else {
      alert('등록 실패: ' + (data.detail || ''));
    }
  } catch (err) {
    alert('서버 에러');
  }
}

async function deleteExam(examId) {
  if (!confirm('이 족보 세트를 삭제하시겠습니까?')) return;
  try {
    const res = await fetch(`/api/exams/${examId}`, {
      method: 'DELETE',
      headers: getUserHeaders()
    });
    if (res.ok) {
      loadExams();
    }
  } catch (err) {
    alert('삭제 실패');
  }
}

// ------------------- 선지 매칭 및 분석 -------------------

async function populateExamSelect() {
  if (!currentSubjectId) return;
  try {
    const res = await fetch(`/api/exams?subject_id=${currentSubjectId}`, { headers: getUserHeaders() });
    if (!res.ok) return;
    const exams = await res.json();
    const sel = document.getElementById('matchSelectExam');
    
    sel.innerHTML = '<option value="">현재 과목에서 분석할 족보를 선택하세요</option>' +
      exams.map(e => `<option value="${e.id}">${escapeHtml(e.title)} (${e.question_count}문항)</option>`).join('');
  } catch (err) {
    console.error(err);
  }
}

function startMatchForExam(examId) {
  switchTab('matching');
  setTimeout(() => {
    const sel = document.getElementById('matchSelectExam');
    sel.value = examId;
    runAnalysis();
  }, 200);
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
    const res = await fetch('/api/match/run', {
      method: 'POST',
      headers: { ...getUserHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: currentSubjectId, exam_id: examId })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadResultDetail(data.result_id);
      document.getElementById('badgeResultReady').classList.remove('hidden');
    } else {
      alert('분석 실행 실패: ' + (data.detail || '이 과목에 등록된 강의 자료가 있는지 확인하세요.'));
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
    const res = await fetch(`/api/match/results?subject_id=${currentSubjectId}`, { headers: getUserHeaders() });
    if (!res.ok) return;
    const results = await res.json();
    if (results && results.length > 0) {
      await loadResultDetail(results[0].id);
    } else {
      document.getElementById('noResultsGuide').classList.remove('hidden');
      document.getElementById('resultsDashboard').classList.add('hidden');
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadResultDetail(resultId) {
  try {
    const res = await fetch(`/api/match/results/${resultId}`, { headers: getUserHeaders() });
    if (!res.ok) return;
    currentResults = await res.json();

    document.getElementById('noResultsGuide').classList.add('hidden');
    document.getElementById('resultsDashboard').classList.remove('hidden');

    document.getElementById('currentExamTitleBadge').textContent = currentResults.exam_title || '분석 결과';
    document.getElementById('currentResultMeta').textContent = 
      `분석 시각: ${currentResults.analyzed_at} | 분석자: ${currentResults.analyzed_by || '사용자'} | 참조 강의자료: ${currentResults.lecture_count}개`;

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
              <h4 class="font-bold text-slate-900 text-sm leading-snug">${escapeHtml(stem)}</h4>
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
  const unitLoc = top ? `${top.unit_type} ${top.unit_number}` : '-';
  const score = top ? `${top.score}%` : '0%';
  const highlightedSnippet = top?.highlighted_snippet || (top?.snippet ? escapeHtml(top.snippet) : '강의 자료에서 관련 구문을 찾을 수 없습니다.');

  return `
    <div class="pt-3.5 first:pt-0">
      <div class="bg-slate-50/50 border border-slate-200/80 rounded-xl p-4 border-l-4 ${borderLeft}">
        <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-2.5">
          <div class="flex items-start gap-2.5 flex-1">
            <span class="font-bold text-indigo-700 text-sm shrink-0">${escapeHtml(label)}</span>
            <p class="font-semibold text-slate-900 text-sm">${escapeHtml(text)}</p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <span class="text-xs font-bold px-2.5 py-1 rounded-full border ${badgeColor} flex items-center gap-1.5">
              <i class="fa-solid ${badgeIcon} text-[11px]"></i>
              ${badgeText} (${score})
            </span>
          </div>
        </div>

        ${top ? `
          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-2 bg-white px-3 py-1.5 rounded-lg border border-slate-100">
            <span class="font-semibold text-slate-700 flex items-center gap-1">
              <i class="fa-regular fa-file-powerpoint text-indigo-500"></i>
              ${escapeHtml(docTitle)}
            </span>
            <span class="text-slate-300">|</span>
            <span class="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">${unitLoc}</span>
            <span class="text-slate-300">|</span>
            <span class="text-slate-400">일치 키워드: ${(top.matched_keywords || []).map(k => `<b class="text-slate-600">${escapeHtml(k)}</b>`).join(', ') || '없음'}</span>
          </div>
        ` : ''}

        <div class="bg-white p-3 rounded-lg border border-slate-200 text-xs leading-relaxed text-slate-700 font-sans">
          <p class="text-[11px] font-bold text-slate-400 mb-1 flex items-center gap-1">
            <i class="fa-solid fa-quote-left text-[10px]"></i>
            강의 자료 언급 문맥 발췌
          </p>
          <div class="text-slate-800">${highlightedSnippet}</div>
        </div>

        ${top ? `
          <div class="mt-2.5 flex items-center justify-end gap-2 text-xs">
            <button onclick="previewRawSlide('${escapeHtml(docTitle)}', '${unitLoc}', ${qIdx}, ${cIdx})" 
                    class="text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition">
              <i class="fa-regular fa-eye text-[11px]"></i> 해당 ${top.unit_type} 전체 본문 보기
            </button>
          </div>
        ` : ''}
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
    const [examsRes, histRes] = await Promise.all([
      fetch(`/api/exams?subject_id=${currentSubjectId}`, { headers: getUserHeaders() }),
      fetch(`/api/workbooks/history?subject_id=${currentSubjectId}`, { headers: getUserHeaders() })
    ]);

    const exams = examsRes.ok ? await examsRes.json() : [];
    const history = histRes.ok ? await histRes.json() : [];

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

async function startSolving(examId) {
  try {
    const res = await fetch(`/api/exams/${examId}`, { headers: getUserHeaders() });
    if (!res.ok) return;
    const exam = await res.json();

    if (!exam.questions || exam.questions.length === 0) {
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
  document.getElementById('currentQStem').textContent = q.stem || '';
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

  try {
    const res = await fetch(`/api/workbooks/${currentExamForSolving.id}/submit`, {
      method: 'POST',
      headers: { ...getUserHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_answers: userAnswers,
        time_spent_seconds: solverSeconds
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      currentReviewData = data;
      renderReviewResult(data);
    } else {
      alert('채점 처리 실패: ' + (data.detail || ''));
    }
  } catch (err) {
    alert('채점 중 오류가 발생했습니다.');
  }
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
            <h4 class="font-bold text-slate-900 text-base leading-snug">${escapeHtml(r.stem)}</h4>
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

// ------------------- 정답표(Answer Key) 관리 모달 -------------------

async function openAnswerKeyModal(examId) {
  try {
    const res = await fetch(`/api/exams/${examId}`, { headers: getUserHeaders() });
    if (!res.ok) return;
    const exam = await res.json();
    currentExamForAnswerKey = exam;

    document.getElementById('akModalTitle').textContent = `[${exam.title}] 정답표 설정`;
    const container = document.getElementById('akQuestionsList');
    const existingKeys = exam.answer_keys || {};

    container.innerHTML = (exam.questions || []).map((q, idx) => {
      const qNum = String(q.q_number || (idx + 1));
      const currentKey = existingKeys[qNum] || '';

      const standardChoices = ['①', '②', '③', '④', '⑤'];

      return `
        <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
          <p class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-md bg-slate-800 text-white flex items-center justify-center text-[10px]">${qNum}</span>
            <span>${escapeHtml(q.stem || '문항 ' + qNum)}</span>
          </p>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500 font-semibold">정답:</span>
            <div class="flex gap-1.5">
              ${standardChoices.map(opt => `
                <label class="px-2.5 py-1 text-xs rounded-lg border cursor-pointer transition ${currentKey === opt ? 'bg-indigo-600 text-white font-bold border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}">
                  <input type="radio" name="ak_q_${qNum}" value="${opt}" ${currentKey === opt ? 'checked' : ''} class="hidden" onchange="updateAnswerKeyRadio('${qNum}', '${opt}')">
                  ${opt}
                </label>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('answerKeyModal').classList.remove('hidden');
  } catch (err) {
    alert('정답표를 불러오지 못했습니다.');
  }
}

function updateAnswerKeyRadio(qNum, opt) {
  if (!currentExamForAnswerKey) return;
  if (!currentExamForAnswerKey.answer_keys) currentExamForAnswerKey.answer_keys = {};
  currentExamForAnswerKey.answer_keys[qNum] = opt;
}

function closeAnswerKeyModal() {
  document.getElementById('answerKeyModal').classList.add('hidden');
}

async function saveAnswerKeyForm() {
  if (!currentExamForAnswerKey) return;
  const examId = currentExamForAnswerKey.id;
  const keys = currentExamForAnswerKey.answer_keys || {};

  try {
    const res = await fetch(`/api/workbooks/${examId}/answers`, {
      method: 'POST',
      headers: { ...getUserHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer_keys: keys })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert('정답표가 성공적으로 저장되었습니다.');
      closeAnswerKeyModal();
      loadWorkbooks();
    } else {
      alert('저장 실패: ' + (data.detail || ''));
    }
  } catch (err) {
    alert('서버 오류');
  }
}

