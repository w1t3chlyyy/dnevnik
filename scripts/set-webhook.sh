#!/usr/bin/env sh
# Привязывает вебхук и включает Business-апдейты (без allowed_updates бот их не получит).
#   TELEGRAM_BOT_TOKEN=... MINIAPP_URL=https://app.vercel.app/miniapp/dashboard \
#   TELEGRAM_WEBHOOK_SECRET=любая_длинная_строка  sh scripts/set-webhook.sh
set -eu
: "${TELEGRAM_BOT_TOKEN:?нужен TELEGRAM_BOT_TOKEN}"
: "${MINIAPP_URL:?нужен MINIAPP_URL}"
BASE="${MINIAPP_URL%/miniapp/dashboard}"

curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=${BASE}/api/telegram" \
  --data-urlencode 'allowed_updates=["message","edited_message","callback_query","business_connection","business_message","edited_business_message","deleted_business_messages"]' \
  ${TELEGRAM_WEBHOOK_SECRET:+--data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}"}
echo
