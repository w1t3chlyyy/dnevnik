# Business Goals — Telegram MiniApp

Личный бизнес-ассистент: цели, прогресс, графики, контакты, файлы на Google Drive, AI (Qwen) с function calling. Дизайн — строго чёрно-белый.

## Как устроено

- **Бот** (`lib/bot.js`) — весь ввод (цели, прогресс, контакты, напоминания, файлы, AI-чат) происходит здесь, в переписке с ботом.
- **MiniApp** (`app/miniapp/*`) — только просмотр: дэшборд, список целей, графики, контакты.
- **Cron** (`app/api/cron/daily-check`) — раз в час проверяет, кому пора прислать сводку по целям; логика достижения/провала цели тоже здесь.
- **Qwen** (`lib/qwen.js`) — может не только отвечать, но и вызывать функции `create_goal`, `update_goal_progress`, `list_goals`, то есть реально редактировать данные, которые видно в MiniApp.

## Деплой, шаг за шагом

### 1. GitHub
```
git init && git add . && git commit -m "init"
# создать репозиторий на github.com и запушить
```

### 2. Supabase
1. Создать проект на supabase.com.
2. SQL Editor → вставить содержимое `supabase/schema.sql` → Run.
3. Settings → API → скопировать `Project URL` и `service_role key`.

### 3. Telegram-бот
1. `@BotFather` → `/newbot` → получить `TELEGRAM_BOT_TOKEN`.
2. `/setmenubutton` можно не трогать — кнопка запуска MiniApp зашита в `/start`.

### 4. Google Drive OAuth
1. console.cloud.google.com → новый проект → включить **Google Drive API**.
2. OAuth consent screen → External → заполнить минимум (только вы как тестовый пользователь).
3. Credentials → Create OAuth Client → Web application → Redirect URI: `https://<домен>/api/drive/oauth-callback`.
4. Скопировать `Client ID` и `Client Secret`.

### 5. Qwen (DashScope)
1. Зарегистрироваться на dashscope.console.aliyun.com (есть intl-версия).
2. Создать API key → `QWEN_API_KEY`.

### 6. Vercel
1. Импортировать репозиторий на vercel.com.
2. Добавить все переменные из `.env.example` в Settings → Environment Variables.
3. Deploy.
4. После первого деплоя: `MINIAPP_URL=https://<домен>/miniapp/dashboard`, передеплоить.

### 7. Привязать webhook бота к Vercel
```
TELEGRAM_BOT_TOKEN=xxx MINIAPP_URL=https://<домен>/miniapp/dashboard node scripts/set-webhook.js
```

### 8. Проверка
Открыть бота в Telegram → `/start` → нажать «Открыть панель».

## Что осталось доделать под себя

- `app/api/drive/oauth-callback/route.js` — принять код от Google, обменять на refresh_token через `googleapis`, сохранить `saveRefreshToken()`. Ссылку для старта OAuth удобно отдавать через `/settings` в боте.
- Разбить `daily-check` cron на реальный per-user `cron_time` с точностью до минуты (Vercel Hobby cron — раз в час; на Pro можно чаще, либо дергать вручную через внешний cron типа cron-job.org раз в минуту на `/api/cron/daily-check`).
- Кнопка «Изменить цель» из чата с AI уже работает через function calling — расширяйте набор `tools` в `lib/qwen.js` под свои сценарии (удаление цели, перенос дедлайна и т.д.).
