import { supabaseAdmin as db } from "@/lib/supabase";
import { Bot } from "grammy";

// Настраивается в vercel.json как Cron Job (напр. раз в час),
// сверяет cron_time каждого пользователя с текущим временем.
export async function GET() {
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
  const now = new Date();
  const hhmm = now.toISOString().slice(11, 16);

  const { data: reminders } = await db
    .from("reminders")
    .select("*, users(*)")
    .eq("active", true)
    .eq("cron_time", hhmm);

  for (const r of reminders || []) {
    const { data: goals } = await db
      .from("goals")
      .select("*")
      .eq("user_id", r.users.id)
      .eq("status", "active");

    if (!goals?.length) continue;

    const lines = goals.map((g) => {
      const pct = Math.min(100, Math.round((g.current_value / g.target_value) * 100));
      const mark = pct >= 100 ? "✅" : pct >= 50 ? "🟡" : "🔴";
      return `${mark} ${g.title}: ${g.current_value}/${g.target_value} ${g.metric_unit || ""} (${pct}%)`;
    });

    await bot.api.sendMessage(
      r.users.telegram_id,
      `Итоги дня по целям:\n\n${lines.join("\n")}`
    );

    // Автозакрытие целей, у которых наступил дедлайн
    const today = now.toISOString().slice(0, 10);
    for (const g of goals) {
      if (g.deadline && g.deadline <= today) {
        const status = g.current_value >= g.target_value ? "done" : "failed";
        await db.from("goals").update({ status }).eq("id", g.id);
      }
    }
  }

  return Response.json({ processed: reminders?.length || 0 });
}
