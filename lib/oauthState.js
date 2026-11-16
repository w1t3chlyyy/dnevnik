import crypto from "crypto";

// Подписываем telegram_id, чтобы callback от Google нельзя было подделать
// (нет отдельного секрета — переиспользуем TELEGRAM_BOT_TOKEN, он уже
// приватный и доступен только на сервере).
function secret() {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

export function signState(telegramId) {
  const payload = String(telegramId);
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyState(state) {
  if (!state || typeof state !== "string" || !state.includes(".")) return null;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return payload; // telegram_id как строка
}
