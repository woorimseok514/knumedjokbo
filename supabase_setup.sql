-- ========================================================
-- knumed2026jokbo (문제은행) Supabase 초기 세팅 SQL
-- Supabase 대시보드 -> SQL Editor 에서 전체 복사 후 실행(Run)하세요.
-- ========================================================

-- 1. 사용자 프로필 테이블 (관리자 승인 상태 관리)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  name text,
  status text not null default 'pending', -- 'pending': 승인대기, 'approved': 승인완료, 'rejected': 거절
  role text not null default 'user',     -- 'user': 일반사용자, 'admin': 관리자
  note text default '',                  -- 가입 시 비고/학번 등
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- RLS 활성화
alter table public.profiles enable row level security;

-- 본인 프로필 조회 허용
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- 본인 프로필 기본 정보 수정 허용 (status/role은 제외하도록 client에서 제어)
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. 신규 회원가입 시 profiles 자동 생성 트리거 함수
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, note, status, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'note', ''),
    'pending', -- 기본값: 관리자 승인 대기
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- 회원가입 트리거 바인딩
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. 문제은행 풀이 및 채점 기록 테이블 (user_answers)
create table if not exists public.user_answers (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  subject_id text not null,
  exam_id text not null,
  q_num integer not null,
  user_answer text,
  is_correct boolean,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  constraint unique_user_exam_q unique (user_id, exam_id, q_num)
);

-- RLS 활성화
alter table public.user_answers enable row level security;

-- 본인 풀이 기록만 조회/작성/수정
drop policy if exists "Users can view own answers" on public.user_answers;
create policy "Users can view own answers"
  on public.user_answers for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own answers" on public.user_answers;
create policy "Users can insert own answers"
  on public.user_answers for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own answers" on public.user_answers;
create policy "Users can update own answers"
  on public.user_answers for update
  using (auth.uid() = user_id);
