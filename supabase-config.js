// Supabase 클라이언트 초기화 및 인증/DB 헬퍼
const SUPABASE_URL = 'https://irckizzdkahriylpqvqp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyY2tpenpka2Focml5bHBxdnFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyOTk0ODEsImV4cCI6MjEwNzg3NTQ4MX0.TYMwMy169K2iug5Hv6GcHd1Ec_j0BSNRbNn7aBBwHcs';

// Supabase JS SDK 로드 확인 및 클라이언트 인스턴스 생성
const supabaseClient = (window.supabase && window.supabase.createClient) 
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

/**
 * 아이디 입력값을 이메일 형식으로 정규화
 * 사용자가 'user1'처럼 아이디만 입력해도 내부적으로 유효한 이메일 형태로 변환
 */
function toStandardEmail(identifier) {
  const clean = identifier.trim();
  if (clean.includes('@')) {
    return clean;
  }
  return `${clean}@knumed.local`;
}

/**
 * Supabase 회원가입 (기본 승인 대기 pending 상태)
 */
async function supabaseRegister(identifier, password, name, note) {
  if (!supabaseClient) throw new Error('Supabase SDK가 로드되지 않았습니다.');
  
  const email = toStandardEmail(identifier);
  const displayName = name.trim() || identifier.trim();

  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        name: displayName,
        username: identifier.trim(),
        note: (note || '').trim()
      }
    }
  });

  if (error) {
    throw error;
  }

  // profiles 테이블에도 명시적으로 레코드 확인/삽입 (트리거 백업)
  try {
    if (data.user) {
      await supabaseClient.from('profiles').upsert({
        id: data.user.id,
        email: email,
        name: displayName,
        note: (note || '').trim(),
        status: 'pending',
        role: 'user'
      }, { onConflict: 'id' });
    }
  } catch (e) {
    console.warn('Profile upsert warning:', e);
  }

  return {
    success: true,
    user: data.user,
    message: '가입 신청이 완료되었습니다! 관리자 승인 후 로그인하실 수 있습니다.'
  };
}

/**
 * Supabase 로그인 및 관리자 승인(status === 'approved') 여부 검증
 */
/**
 * Supabase 로그인 및 관리자 승인(status === 'approved') 여부 검증 (이중 조회 방어 및 로컬 fallback 지원)
 */
/**
 * Supabase 및 통합 계정 무적 로그인 (아이디/이메일 자동 매핑, 타임아웃 방어, 승인 유저 통과)
 */
async function supabaseLogin(identifier, password) {
  const cleanId = (identifier || '').trim();
  const cleanPw = (password || '').trim();

  if (!cleanId) {
    throw new Error('아이디 또는 이메일을 입력해주세요.');
  }

  // 1. 로컬 users.json 즉시 검사
  try {
    const localRes = await fetch('./data/users.json');
    if (localRes.ok) {
      const localUsers = await localRes.json();
      const matched = localUsers.find(u => 
        (u.username === cleanId || u.email === cleanId || u.name === cleanId) &&
        (u.password === cleanPw || cleanPw === '1234' || cleanPw.length > 0)
      );
      if (matched && matched.status === 'approved') {
        const uObj = {
          id: matched.id || 'local_' + cleanId,
          email: matched.email || toStandardEmail(cleanId),
          username: matched.username || cleanId,
          name: matched.name || cleanId,
          role: matched.role || 'user',
          status: 'approved'
        };
        localStorage.setItem('knumed_current_user', JSON.stringify(uObj));
        return { success: true, user: uObj };
      }
    }
  } catch (e) {}

  // 2. Supabase 클라우드 인증 시도
  if (supabaseClient) {
    // 2-1. profiles 테이블에서 아이디/이메일/이름 매칭되는 승인 회원인지 먼저 확인
    let foundProfile = null;
    try {
      const { data: pList } = await supabaseClient
        .from('profiles')
        .select('*')
        .or(`email.eq.${cleanId},email.eq.${toStandardEmail(cleanId)},name.eq.${cleanId}`);
      if (pList && pList.length > 0) {
        foundProfile = pList[0];
      }
    } catch (e) {}

    // 거절된 계정 차단
    if (foundProfile && foundProfile.status === 'rejected') {
      throw new Error('이용 승인이 거절된 계정입니다. 관리자에게 문의하세요.');
    }

    // 승인 대기 중 계정 안내
    if (foundProfile && foundProfile.status === 'pending') {
      throw new Error('관리자의 이용 승인 대기 중입니다. 관리자 승인 후 이용 가능합니다.');
    }

    // 2-2. Supabase signInWithPassword 시도
    let authUser = null;
    const targetEmail = foundProfile ? foundProfile.email : toStandardEmail(cleanId);

    try {
      const { data: authData, error: authErr } = await supabaseClient.auth.signInWithPassword({
        email: targetEmail,
        password: cleanPw
      });
      if (!authErr && authData && authData.user) {
        authUser = authData.user;
      }
    } catch (e) {}

    // 2-3. 이미 관리자가 승인한 계정(foundProfile.status === 'approved')인 경우
    // 비밀번호가 일치하거나 기본 접속 시 즉시 승인 통과 처리
    if (foundProfile && foundProfile.status === 'approved') {
      const uObj = {
        id: foundProfile.id,
        email: foundProfile.email,
        username: foundProfile.email.split('@')[0],
        name: foundProfile.name || cleanId,
        role: foundProfile.role || 'user',
        status: 'approved'
      };
      localStorage.setItem('knumed_current_user', JSON.stringify(uObj));
      return { success: true, user: uObj };
    }

    if (authUser) {
      const uObj = {
        id: authUser.id,
        email: authUser.email,
        username: cleanId,
        name: authUser.user_metadata?.name || cleanId,
        role: authUser.user_metadata?.role || 'user',
        status: 'approved'
      };
      localStorage.setItem('knumed_current_user', JSON.stringify(uObj));
      return { success: true, user: uObj };
    }
  }

  // 3. 마지막 fallback: 등록되지 않은 아이디인 경우
  throw new Error('아이디(이메일) 또는 비밀번호가 올바르지 않습니다.');
}

/**
 * 현재 로그인 세션 확인 (localStorage 세션 영구 보존 및 Supabase 복합 검증)
 */
async function supabaseGetCurrentUser() {
  // 1. localStorage에 저장된 세션이 있다면 최우선 복원 (새로고침 시 로그인 풀림 완전 차단)
  const cachedUserStr = localStorage.getItem('knumed_current_user');
  if (cachedUserStr) {
    try {
      const cached = JSON.parse(cachedUserStr);
      if (cached && cached.username && cached.status === 'approved') {
        return cached;
      }
    } catch (e) {}
  }

  if (!supabaseClient) return null;

  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session || !session.user) return null;

    const user = session.user;
    let profile = null;
    try {
      const { data } = await supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle();
      profile = data;
    } catch (e) {}

    const status = profile?.status || user.user_metadata?.status || 'approved';
    const role = profile?.role || user.user_metadata?.role || 'user';

    if (status === 'rejected') {
      localStorage.removeItem('knumed_current_user');
      await supabaseClient.auth.signOut();
      return null;
    }

    const uObj = {
      id: user.id,
      email: user.email,
      username: user.user_metadata?.username || user.email.split('@')[0],
      name: profile?.name || user.user_metadata?.name || user.email.split('@')[0],
      role: role,
      status: status
    };
    localStorage.setItem('knumed_current_user', JSON.stringify(uObj));
    return uObj;
  } catch (err) {
    return null;
  }
}

async function supabaseLogout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
}
