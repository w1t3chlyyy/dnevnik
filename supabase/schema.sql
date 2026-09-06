-- ==========================================================
-- BUSINESS GOALS MINIAPP — SUPABASE SCHEMA
-- ==========================================================

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  username text,
  first_name text,
  google_refresh_token text,          -- OAuth refresh token для Google Drive
  google_drive_folder_id text,        -- корневая папка юзера на Drive
  created_at timestamptz default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  description text,
  metric_unit text,                   -- напр. "руб", "клиенты", "%"
  target_value numeric not null,
  current_value numeric default 0,
  deadline date,
  status text default 'active',       -- active | done | failed | paused
  created_at timestamptz default now()
);

-- ежедневные/периодические отметки прогресса — основа для графиков
create table if not exists goal_progress (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  value numeric not null,
  note text,
  logged_at date default current_date,
  created_at timestamptz default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  telegram_username text not null,
  label text,                          -- подпись, которую дал пользователь
  note text,
  created_at timestamptz default now()
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  goal_id uuid references goals(id) on delete cascade,
  cron_time time not null,             -- время ежедневного напоминания
  message text,
  active boolean default true
);

create table if not exists files_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  file_name text,
  drive_file_id text,
  drive_link text,
  file_type text,                      -- photo | video | document
  created_at timestamptz default now()
);

create table if not exists ai_chat_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  role text not null,                  -- user | assistant | tool
  content text not null,
  created_at timestamptz default now()
);

create index if not exists idx_goals_user on goals(user_id);
create index if not exists idx_progress_goal on goal_progress(goal_id);
create index if not exists idx_contacts_user on contacts(user_id);
