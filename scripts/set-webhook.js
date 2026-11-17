// Запуск: node scripts/set-webhook.js
// Привязывает бота к Vercel и включает необходимые типы Telegram-обновлений.
const token = process.env.TELEGRAM_BOT_TOKEN;
const miniAppUrl = process.env.MINIAPP_URL || "https://dnevnik-nine.vercel.app/miniapp/dashboard";

async function main() {
  if (!token) throw new Error("Не задан TELEGRAM_BOT_TOKEN");

  const webhookUrl = new URL("/api/telegram", miniAppUrl).toString();
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: [
        "message",
        "callback_query",
        "business_connection",
        "business_message",
        "edited_business_message",
        "deleted_business_messages"
      ]
    })
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`setWebhook failed (${response.status}): ${result.description || "unknown error"}`);
  }

  console.log(result);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
