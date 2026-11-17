// Единая точка вызова ИИ: Qwen -> OpenRouter -> BazaarLink (порядок задаётся AI_PROVIDERS).
// Если у бесплатной квоты кончился лимит / 429 / 5xx / таймаут — провайдер на время
// «выключается» (общее состояние в таблице ai_provider_state) и берётся следующий.
import { supabaseAdmin as db } from "./supabase";

function providers() {
  const all = {
    qwen: {
      name: "qwen",
      url: process.env.QWEN_API_URL,
      key: process.env.QWEN_API_KEY,
      model: process.env.QWEN_MODEL || "qwen3.7-plus"
    },
    openrouter: {
      name: "openrouter",
      url: process.env.OPENROUTER_API_URL || "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || "openrouter/free", // роутер бесплатных моделей
      headers: { "HTTP-Referer": process.env.MINIAPP_URL || "https://localhost", "X-Title": "Business Goals" }
    },
    bazaar: {
      name: "bazaar",
      url: process.env.BAZAAR_API_URL || "https://api.bazaarlink.ai/v1/chat/completions",
      key: process.env.BAZAAR_API_KEY,
      model: process.env.BAZAAR_MODEL || "auto:free" // авто-выбор бесплатной модели
    }
  };
  const order = (process.env.AI_PROVIDERS || "qwen,openrouter,bazaar").split(",").map((s) => s.trim());
  return order.map((n) => all[n]).filter((p) => p && p.url && p.key);
}

async function blockedUntil(name) {
  const { data } = await db.from("ai_provider_state").select("blocked_until").eq("provider", name).maybeSingle();
  return data?.blocked_until ? new Date(data.blocked_until).getTime() : 0;
}

async function block(name, ms, reason) {
  await db.from("ai_provider_state").upsert({
    provider: name,
    blocked_until: new Date(Date.now() + ms).toISOString(),
    last_error: String(reason).slice(0, 300),
    updated_at: new Date().toISOString()
  });
}

// Сколько «отдыхать» провайдеру после ошибки.
function cooldownFor(status, text, retryAfterSec) {
  const t = String(text || "").toLowerCase();
  const dailyHit = /per[- ]day|daily|free-models-per-day|quota|exceeded your current/.test(t);
  if (status === 429 && dailyHit) {
    const next = new Date();
    next.setUTCHours(24, 0, 5, 0); // до следующих суток UTC
    return Math.max(60_000, next.getTime() - Date.now());
  }
  if (status === 429) return Math.max(15_000, (retryAfterSec || 60) * 1000); // лимит в минуту
  if (status === 402) return 60 * 60_000; // кончились кредиты
  if (status === 401 || status === 403) return 60 * 60_000; // ключ/доступ
  return 30_000; // 5xx, таймаут, сеть
}

async function callOne(p, messages, o) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs);
  const body = { model: o.models?.[p.name] || p.model, messages };
  if (o.tools?.length) {
    body.tools = o.tools;
    body.tool_choice = o.toolChoice || "auto";
  }
  if (o.responseFormat) body.response_format = o.responseFormat;
  if (o.maxTokens) body.max_tokens = o.maxTokens;
  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}`, ...(p.headers || {}) },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {}
    if (!res.ok || !data?.choices?.length) {
      const err = new Error(`${p.name}: ${res.status} ${raw.slice(0, 200)}`);
      err.status = res.status;
      err.raw = raw;
      err.retryAfter = Number(res.headers.get("retry-after")) || 0;
      throw err;
    }
    // OpenRouter иногда отдаёт 200 с ошибкой внутри choices[0].error
    if (data.choices[0].error) {
      const err = new Error(`${p.name}: ${JSON.stringify(data.choices[0].error).slice(0, 200)}`);
      err.status = Number(data.choices[0].error.code) || 502;
      err.raw = JSON.stringify(data.choices[0].error);
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error(`${p.name}: таймаут ${o.timeoutMs / 1000}с`);
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// messages — как в OpenAI Chat Completions. Возвращает тот же объект ответа (choices[0].message ...).
// opts: { tools, toolChoice, responseFormat, timeoutMs, maxTokens, models: { qwen: "qwen-turbo" } }
export async function callLLM(messages, opts = {}) {
  const o = { timeoutMs: 25_000, ...opts };
  const list = providers();
  if (!list.length) throw new Error("Не настроен ни один ИИ-провайдер (QWEN_*, OPENROUTER_API_KEY, BAZAAR_API_KEY).");

  const errors = [];
  for (const p of list) {
    if ((await blockedUntil(p.name)) > Date.now()) {
      errors.push(`${p.name}: на паузе`);
      continue;
    }
    try {
      const data = await callOne(p, messages, o);
      console.log(`[llm] ok via ${p.name}`);
      return data;
    } catch (e) {
      console.error(`[llm] ${e.message}`);
      errors.push(e.message);
      // Ошибки запроса (400/422) — не вина провайдера, не блокируем и идём дальше
      if (e.status && e.status >= 400 && e.status < 500 && ![401, 402, 403, 429].includes(e.status)) continue;
      await block(p.name, cooldownFor(e.status, e.raw || e.message, e.retryAfter), e.message).catch(() => {});
    }
  }
  throw new Error(`Все ИИ-провайдеры недоступны: ${errors.join(" | ")}`);
}

// Удобная обёртка: просто текст в ответ.
export async function askText(messages, opts = {}) {
  const data = await callLLM(messages, { ...opts, toolChoice: undefined, tools: undefined });
  return String(data.choices[0].message.content || "").trim();
}

// Для страницы Telegram: какие провайдеры настроены и не на паузе.
export async function providerStatus() {
  const out = [];
  for (const p of providers()) {
    const until = await blockedUntil(p.name);
    out.push({ name: p.name, model: p.model, blockedUntil: until > Date.now() ? new Date(until).toISOString() : null });
  }
  return out;
}
