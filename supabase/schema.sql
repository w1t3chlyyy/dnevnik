-- ==========================================================
-- BUSINESS GOALS MINIAPP — SUPABASE SCHEMA
-- ==========================================================
-- Полная и актуальная схема: включает всё, что реально использует
-- код (бот, cron, mini-app, qwen.js), включая то, что раньше было
-- добавлено только вручную через SQL Editor и не попало в этот файл.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  username text,
  first_name text,
  google_refresh_token text,          -- OAuth refresh token для Google Drive
  google_drive_folder_id text,        -- корневая папка юзера на Drive

  -- дедупликация ежедневных пушей из app/api/cron/dispatch
  last_morning_date date,
  last_breakfast_prompt_date date,
  last_lunch_prompt_date date,
  last_dinner_prompt_date date,
  last_digest_date date,

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

  -- "цель на сегодня" (см. /dailygoal, dgoal_* в bot.js)
  is_daily boolean default false,
  goal_date date,

  -- дата фактического завершения — нужна для точных месячных/годовых итогов (lib/summary.js)
  completed_at timestamptz,

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

  type text default 'daily',           -- 'once' | 'daily'

  -- ежедневные (type = 'daily')
  cron_time time,
  last_sent_date date,

  -- разовые (type = 'once')
  remind_at timestamptz,
  is_sent boolean default false,
  sent_at timestamptz,

  message text,
  active boolean default true,
  created_at timestamptz default now()
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

-- Связи "цель дня" -> "обычная цель": при выполнении цели дня с этим
-- названием прогресс автоматически прибавляется к обычной цели.
create table if not exists goal_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  daily_title text not null,
  parent_goal_id uuid references goals(id) on delete cascade,
  multiplier numeric not null default 1,
  created_at timestamptz default now(),
  unique (user_id, daily_title)
);

-- Трекер питания: приёмы пищи с посчитанными КБЖУ (lib/nutrition.js)
create table if not exists food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  meal_type text not null,             -- breakfast | lunch | dinner | snack
  description text,
  calories numeric default 0,
  protein numeric default 0,
  fat numeric default 0,
  carbs numeric default 0,
  logged_at timestamptz default now()
);

-- Профиль питания — один на пользователя. user_id как первичный ключ
-- обязателен: код делает upsert({ user_id, ... }) БЕЗ onConflict, а
-- supabase-js по умолчанию разрешает конфликт по первичному ключу.
-- Если тут будет обычный id + просто unique(user_id), upsert перестанет
-- обновлять профиль и будет плодить дубликаты строк.
create table if not exists nutrition_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  weight_kg numeric,
  height_cm numeric,
  age integer,
  gender text,                         -- male | female
  activity_level text,                 -- sedentary | light | moderate | active | very_active
  goal text,                           -- lose | maintain | gain
  target_calories numeric,
  target_protein numeric,
  target_fat numeric,
  target_carbs numeric,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- База знаний для AI-ассистента (save_knowledge / list_knowledge / delete_knowledge)
create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- Внешнее хранилище сессий grammy (lib/bot.js -> session({ storage: ... }))
-- Обязательно на serverless: разные апдейты может обрабатывать разный
-- процесс, общей оперативной памяти между ними нет.
create table if not exists bot_sessions (
  key text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

create index if not exists idx_goals_user on goals(user_id);
create index if not exists idx_goals_daily on goals(user_id, is_daily, goal_date);
create index if not exists idx_progress_goal on goal_progress(goal_id);
create index if not exists idx_contacts_user on contacts(user_id);
create index if not exists idx_reminders_user on reminders(user_id);
create index if not exists idx_goal_links_user on goal_links(user_id);
create index if not exists idx_food_logs_user on food_logs(user_id);
create index if not exists idx_food_logs_logged_at on food_logs(logged_at);
create index if not exists idx_knowledge_base_user on knowledge_base(user_id);
create index if not exists idx_ai_chat_history_user on ai_chat_history(user_id, created_at);

-- ==========================================================
-- Если у вас УЖЕ есть база, созданная по старой (неполной) версии
-- этого файла — выполните вместо create table следующие ALTER'ы,
-- чтобы не потерять данные:
--
-- alter table users add column if not exists last_morning_date date;
-- alter table users add column if not exists last_breakfast_prompt_date date;
-- alter table users add column if not exists last_lunch_prompt_date date;
-- alter table users add column if not exists last_dinner_prompt_date date;
-- alter table users add column if not exists last_digest_date date;
--
-- alter table goals add column if not exists is_daily boolean default false;
-- alter table goals add column if not exists goal_date date;
-- alter table goals add column if not exists completed_at timestamptz;
--
-- alter table reminders add column if not exists type text default 'daily';
-- alter table reminders add column if not exists last_sent_date date;
-- alter table reminders add column if not exists remind_at timestamptz;
-- alter table reminders add column if not exists is_sent boolean default false;
-- alter table reminders add column if not exists sent_at timestamptz;
-- ==========================================================
