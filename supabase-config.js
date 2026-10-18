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
async function supabaseLogin(identifier, password) {
  if (!supabaseClient) throw new Error('Supabase SDK가 로드되지 않았습니다.');

  const email = toStandardEmail(identifier);

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password
  });

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      throw new Error('아이디(이메일) 또는 비밀번호가 올바르지 않습니다.');
    }
    throw error;
  }

  const user = data.user;
  if (!user) throw new Error('사용자 정보를 가져올 수 없습니다.');

  // 프로필 조회 및 승인 상태 확인
  const { data: profile, error: pErr } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (pErr && pErr.code !== 'PGRST116') {
    console.warn('Profile fetch warning:', pErr);
  }

  const status = profile?.status || 'pending';
  const role = profile?.role || 'user';
  const name = profile?.name || user.user_metadata?.name || identifier;

  // 관리자(admin) 계정은 승인 상태 무관하게 통과
  if (role === 'admin' || status === 'approved') {
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: identifier,
        name: name,
        role: role,
        status: status
      }
    };
  }

  // 미승인 상태인 경우 강제 로그아웃 후 예외 발생
  await supabaseClient.auth.signOut();

  if (status === 'rejected') {
    throw new Error('이용 승인이 거절된 계정입니다. 관리자에게 문의하세요.');
  } else {
    throw new Error('관리자의 이용 승인 대기 중입니다. 승인 완료 후 이용하실 수 있습니다.');
  }
}

/**
 * 현재 로그인 세션 확인
 */
async function supabaseGetCurrentUser() {
  if (!supabaseClient) return null;

  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) return null;

  const user = session.user;
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const status = profile?.status || 'pending';
  const role = profile?.role || 'user';

  if (role !== 'admin' && status !== 'approved') {
    await supabaseClient.auth.signOut();
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    username: user.user_metadata?.username || user.email.split('@')[0],
    name: profile?.name || user.user_metadata?.name || user.email.split('@')[0],
    role: role,
    status: status
  };
}

/**
 * 로그아웃
 */
async function supabaseLogout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
}
