// Запуск: node scripts/set-webhook.js
// Привязывает бота к вашему Vercel-домену
const token = process.env.TELEGRAM_BOT_TOKEN;
const url = `${process.env.MINIAPP_URL.replace("/miniapp/dashboard", "")}/api/telegram`;

fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(url)}`)
  .then((r) => r.json())
  .then((d) => console.log(d));
