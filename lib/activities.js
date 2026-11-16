import { supabaseAdmin as db } from "./supabase";
import { formatLocalHuman, localDayBoundsUtc } from "./time";

export function fmtDuration(min) {
  const m = Math.round(Number(min) || 0);
  if (m < 1) return "меньше минуты";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} мин`;
  return r ? `${h} ч ${r} мин` : `${h} ч`;
}

export async function listKnownActivities(userId, limit = 300) {
  const { data } = await db
    .from("activity_sessions")
    .select("activity")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  return [...new Set((data || []).map((r) => r.activity))];
}

export async function getRunning(userId) {
  const { data } = await db
    .from("activity_sessions")
    .select("*")
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false });
  return data || [];
}

// Страховка от расхождений в регистре: если такое название уже есть — берём его.
// Основная нормализация смысла ("зал" = "спорт") делается в промпте AI.
async function canonicalName(userId, name) {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  const known = await listKnownActivities(userId);
  const hit = known.find((k) => k.toLowerCase() === clean.toLowerCase());
  return hit || clean.charAt(0).toUpperCase() + clean.slice(1);
}

export async function startActivity(user, name, { minutesAgo, note } = {}) {
  if (!String(name || "").trim()) return { error: "Не указано название дела" };
  const activity = await canonicalName(user.id, name);
  const running = await getRunning(user.id);
  const same = running.find((r) => r.activity === activity);
  if (same) return { error: `«${activity}» уже идёт с ${formatLocalHuman(same.started_at)} (МСК)` };

  const startedAt = new Date(Date.now() - Math.max(0, Number(minutesAgo) || 0) * 60000).toISOString();
  const { error } = await db
    .from("activity_sessions")
    .insert({ user_id: user.id, activity, started_at: startedAt, note: note || null });
  if (error) return { error: error.message };
  return { ok: true, activity, started_at_msk: formatLocalHuman(startedAt) };
}

export async function stopActivity(user, name, { minutesAgo } = {}) {
  const running = await getRunning(user.id);
  if (!running.length) return { error: "Сейчас нет запущенных таймеров" };

  let target = null;
  if (name) {
    const n = String(name).trim().toLowerCase();
    target = running.find((r) => r.activity.toLowerCase() === n) || null;
  }
  if (!target) {
    if (running.length === 1) target = running[0]; // единственный таймер — его и останавливаем
    else {
      return {
        error: "Запущено несколько таймеров, уточни какой остановить",
        running: running.map((r) => r.activity)
      };
    }
  }

  const now = Date.now();
  const started = new Date(target.started_at).getTime();
  let ended = now - Math.max(0, Number(minutesAgo) || 0) * 60000;
  if (ended < started) ended = now;
  const minutes = Math.round(((ended - started) / 60000) * 10) / 10;

  const { error } = await db
    .from("activity_sessions")
    .update({ ended_at: new Date(ended).toISOString(), duration_min: minutes })
    .eq("id", target.id);
  if (error) return { error: error.message };

  const res = { ok: true, activity: target.activity, duration_min: minutes, duration_human: fmtDuration(minutes) };
  if (minutes > 12 * 60) res.warning = "Больше 12 часов — возможно, таймер забыли выключить";
  return res;
}

// Уже завершённое дело: "читал час", "потренировался 45 минут"
export async function logActivity(user, name, minutes, { minutesAgo } = {}) {
  const m = Number(minutes);
  if (!m || m <= 0) return { error: "Нужна длительность в минутах" };
  const activity = await canonicalName(user.id, name);
  const endedAt = new Date(Date.now() - Math.max(0, Number(minutesAgo) || 0) * 60000);
  const startedAt = new Date(endedAt.getTime() - m * 60000);
  const { error } = await db.from("activity_sessions").insert({
    user_id: user.id,
    activity,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_min: m
  });
  if (error) return { error: error.message };
  return { ok: true, activity, duration_min: m, duration_human: fmtDuration(m) };
}

// Для вечернего итога: завершённые + ещё идущие (считаем до текущего момента)
export async function getTodayActivityTotals(userId) {
  const { startIso, endIso } = localDayBoundsUtc();
  const { data } = await db
    .from("activity_sessions")
    .select("activity, started_at, ended_at, duration_min")
    .eq("user_id", userId)
    .gte("started_at", startIso)
    .lt("started_at", endIso);

  const map = {};
  for (const s of data || []) {
    const running = !s.ended_at;
    const mins = running
      ? (Date.now() - new Date(s.started_at).getTime()) / 60000
      : Number(s.duration_min) || 0;
    map[s.activity] = map[s.activity] || { activity: s.activity, minutes: 0, running: false };
    map[s.activity].minutes += mins;
    if (running) map[s.activity].running = true;
  }
  return Object.values(map).sort((a, b) => b.minutes - a.minutes);
}
