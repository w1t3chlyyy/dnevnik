import { createClient } from "@supabase/supabase-js";

// service-role ключ используется только в server-side (api routes / bot),
// никогда не попадает в MiniApp-фронт
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Транзитные сбои шлюза Supabase (например, "Gateway Timeout" при пробуждении
// бесплатного проекта после паузы, или разовый сетевой сбой) — их имеет смысл
// повторить, в отличие от постоянных ошибок (неверные креды, нет таблицы и т.п.).
export function isTransientSupabaseError(error) {
  if (!error) return false;
  const msg = String(error.message || "").toLowerCase();
  return (
    msg.includes("gateway timeout") ||
    msg.includes("timeout") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

// Оборачивает Supabase-запрос повторными попытками с небольшой задержкой.
// queryFn должна возвращать промис от supabase-js вызова (тот, что резолвится
// в {data, error}), например: () => db.from("food_logs").insert({...})
export async function withSupabaseRetry(queryFn, { retries = 2, delayMs = 500 } = {}) {
  let lastResult;
  for (let attempt = 0; attempt <= retries; attempt++) {
    lastResult = await queryFn();
    if (!lastResult?.error || !isTransientSupabaseError(lastResult.error)) {
      return lastResult;
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  return lastResult;
}
