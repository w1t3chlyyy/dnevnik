import { supabaseAdmin as db } from "./supabase";
import { localDayBoundsUtc, localDateStr } from "./time";

export async function buildDailyDigest(user) {
  const { startIso, endIso } = localDayBoundsUtc();
  const today = localDateStr();

  const { data: goals } = await db
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("is_daily", false);

  const goalLines = [];
  if (goals?.length) {
    for (const g of goals) {
      const { data: todayRows } = await db
        .from("goal_progress")
        .select("value")
        .eq("goal_id", g.id)
        .gte("created_at", startIso)
        .lt("created_at", endIso);

      const todayDelta = (todayRows || []).reduce((s, r) => s + Number(r.value), 0);
      const current = g.current_value ?? 0;
      const unit = g.metric_unit ? ` ${g.metric_unit}` : "";
      const remain =
        g.target_value != null ? Math.max(g.target_value - current, 0) : null;

      let line = `• ${g.title}: ${current}${unit}`;
      line += todayDelta ? ` (сегодня +${todayDelta})` : " (сегодня без движения)";
      if (remain != null) line += ` · осталось ${remain}${unit}`;
      goalLines.push(line);
    }
  } else {
    goalLines.push("Активных целей нет — создай через «🎯 Цель» в меню.");
  }

  // Цели дня (is_daily=true, goal_date=сегодня) — отдельный блок в итоге,
  // с ними работают через собственные инлайн-кнопки после этого сообщения
  // (см. app/api/cron/dispatch/route.js), поэтому здесь только статус-строки.
  const { data: dailyGoals } = await db
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_daily", true)
    .eq("goal_date", today);

  let dailyBlock = "";
  if (dailyGoals?.length) {
    const lines = dailyGoals.map((g) => {
      const mark = g.status === "done" ? "✅" : g.status === "failed" ? "❌" : "🟡";
      const unit = g.metric_unit ? ` ${g.metric_unit}` : "";
      return `${mark} ${g.title}: ${g.current_value ?? 0}/${g.target_value}${unit}`;
    });
    dailyBlock = `\n\nЦели на сегодня:\n${lines.join("\n")}`;
  }

  const { count: onceSentToday } = await db
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("type", "once")
    .eq("is_sent", true)
    .gte("sent_at", startIso)
    .lt("sent_at", endIso);

  const { count: oncePending } = await db
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("type", "once")
    .eq("is_sent", false);

  const dateLabel = new Date().toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });

  return (
    `🌙 Итог дня — ${dateLabel}\n\n` +
    `Цели:\n${goalLines.join("\n")}` +
    dailyBlock +
    `\n\n✅ Выполнено разовых напоминаний сегодня: ${onceSentToday || 0}\n` +
    `⏳ Ещё запланировано разовых напоминаний: ${oncePending || 0}\n\n` +
    `Если что-то не успел — просто заведи новое напоминание или отметь прогресс завтра.`
  );
}
