import { supabaseAdmin as db } from "./supabase";

function monthRangeUTC(offsetMonths = 0) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + offsetMonths;
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" })
  };
}

function yearRangeUTC(offsetYears = 0) {
  const now = new Date();
  const y = now.getUTCFullYear() + offsetYears;
  const start = new Date(Date.UTC(y, 0, 1));
  const end = new Date(Date.UTC(y + 1, 0, 1));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    label: String(y)
  };
}

export function getRanges(period) {
  if (period === "year") return { current: yearRangeUTC(0), previous: yearRangeUTC(-1) };
  return { current: monthRangeUTC(0), previous: monthRangeUTC(-1) };
}

async function statsForRange(userId, range) {
  const { data: userGoals } = await db
    .from("goals")
    .select("id, status, completed_at, created_at")
    .eq("user_id", userId)
    .eq("is_daily", false);

  const goalIds = (userGoals || []).map((g) => g.id);

  const goalsCreated = (userGoals || []).filter(
    (g) => g.created_at >= range.startIso && g.created_at < range.endIso
  ).length;
  const goalsCompleted = (userGoals || []).filter(
    (g) =>
      g.status === "done" &&
      g.completed_at &&
      g.completed_at >= range.startIso &&
      g.completed_at < range.endIso
  ).length;

  let progressSum = 0;
  if (goalIds.length) {
    const { data: progressRows } = await db
      .from("goal_progress")
      .select("value, created_at")
      .in("goal_id", goalIds)
      .gte("created_at", range.startIso)
      .lt("created_at", range.endIso);
    progressSum = (progressRows || []).reduce((s, r) => s + Number(r.value), 0);
  }

  const { data: dailyGoals } = await db
    .from("goals")
    .select("id, status")
    .eq("user_id", userId)
    .eq("is_daily", true)
    .gte("goal_date", range.startDate)
    .lt("goal_date", range.endDate);

  const dailyTotal = dailyGoals?.length || 0;
  const dailyDone = (dailyGoals || []).filter((g) => g.status === "done").length;
  const dailyFailed = (dailyGoals || []).filter((g) => g.status === "failed").length;

  const { data: foodLogs } = await db
    .from("food_logs")
    .select("calories, logged_at")
    .eq("user_id", userId)
    .gte("logged_at", range.startIso)
    .lt("logged_at", range.endIso);

  const caloriesByDay = {};
  for (const f of foodLogs || []) {
    const d = String(f.logged_at).slice(0, 10);
    caloriesByDay[d] = (caloriesByDay[d] || 0) + Number(f.calories);
  }
  const loggedDays = Object.keys(caloriesByDay).length;
  const avgCalories = loggedDays
    ? Math.round(Object.values(caloriesByDay).reduce((s, v) => s + v, 0) / loggedDays)
    : 0;

  return {
    goalsCreated,
    goalsCompleted,
    dailyTotal,
    dailyDone,
    dailyFailed,
    dailyPct: dailyTotal ? Math.round((dailyDone / dailyTotal) * 100) : 0,
    progressSum,
    nutritionLoggedDays: loggedDays,
    avgCalories
  };
}

function delta(curr, prev) {
  const diff = curr - prev;
  const pct = prev ? Math.round((diff / prev) * 100) : curr ? 100 : 0;
  return { diff, pct };
}

// Основная функция: итоги за месяц/год + сравнение с предыдущим таким же периодом.
export async function buildSummary(userId, period = "month") {
  const { current, previous } = getRanges(period);
  const [curr, prev] = await Promise.all([
    statsForRange(userId, current),
    statsForRange(userId, previous)
  ]);

  const compare = {};
  for (const key of Object.keys(curr)) {
    compare[key] = delta(curr[key], prev[key]);
  }

  return {
    period,
    label: current.label,
    previousLabel: previous.label,
    current: curr,
    previous: prev,
    compare
  };
}
