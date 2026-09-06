import { supabaseAdmin as db } from "./supabase";
import { localDayBoundsUtc } from "./time";

export async function buildDailyDigest(user) {
  const { startIso, endIso } = localDayBoundsUtc();

  const { data: goals } = await db
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active");

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
    `Цели:\n${goalLines.join("\n")}\n\n` +
    `✅ Выполнено разовых напоминаний сегодня: ${onceSentToday || 0}\n` +
    `⏳ Ещё запланировано разовых напоминаний: ${oncePending || 0}\n\n` +
    `Если что-то не успел — просто заведи новое напоминание или отметь прогресс завтра.`
  );
}
