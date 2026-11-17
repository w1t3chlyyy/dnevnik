-- Telegram Business: подключения, настройки, чаты, история, очередь тяжёлых задач.
-- Выполнить в Supabase -> SQL Editor.

create table if not exists business_connections (
  id text primary key,                         -- business_connection_id из Telegram
  user_id uuid references users(id) on delete cascade,
  owner_tg_id bigint not null,
  rights jsonb default '{}'::jsonb,            -- can_reply, can_delete_*, can_manage_stories ...
  is_enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_bconn_user on business_connections(user_id);

create table if not exists bot_settings (
  user_id uuid primary key references users(id) on delete cascade,
  auto_reply boolean default true,
  chat_filter text default 'selected',         -- selected | new | all
  persona text default '',                     -- как отвечать: тон, правила, о чём говорить
  reply_delay_sec int default 4,               -- пауза перед ответом (заодно «склеивает» серию сообщений)
  pause_on_owner_reply boolean default true,   -- молчать, если владелец сам ответил в чате
  owner_pause_hours int default 12,
  updated_at timestamptz default now()
);

create table if not exists business_chats (
  user_id uuid references users(id) on delete cascade,
  chat_id bigint not null,
  name text,
  username text,
  is_bot boolean default false,
  status text default 'new',                   -- new | selected | ignored
  ai_off boolean default false,                -- .a_gpt_off
  mute boolean default false,                  -- .a_mute
  owner_replied_at timestamptz,
  first_seen_at timestamptz default now(),
  last_message_at timestamptz default now(),
  primary key (user_id, chat_id)
);
create index if not exists idx_bchats_last on business_chats(user_id, last_message_at desc);

create table if not exists business_history (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  chat_id bigint not null,
  message_id bigint,
  role text not null,                          -- user | assistant | owner
  content text not null,
  created_at timestamptz default now(),
  unique (user_id, chat_id, message_id)        -- защита от повторной доставки вебхука
);
create index if not exists idx_bhist_chat on business_history(user_id, chat_id, id desc);

-- Общее состояние провайдеров ИИ между serverless-инстансами (кто в «бане» по лимитам)
create table if not exists ai_provider_state (
  provider text primary key,
  blocked_until timestamptz,
  last_error text,
  updated_at timestamptz default now()
);

-- Очередь для воркера (.circle, .save)
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                          -- circle | save
  payload jsonb not null,
  status text default 'queued',                -- queued | running | done | failed
  attempts int default 0,
  error text,
  created_at timestamptz default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists idx_jobs_queue on jobs(status, created_at);
