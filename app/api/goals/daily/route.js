import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";

// Агрегированная статистика по "целям дня" (is_daily=true), сгруппированная
// по дате: сколько целей поставлено в этот день и сколько выполнено (done).
// По отдельности дневные цели графиков не имеют — только эта общая сводка.
export async function GET(req) {
  const initData = req.headers.get("x-telegram-init-data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("telegram_id", tgUser.id)
    .maybeSingle();
  if (!user) return Response.json({ days: [] });

  const { data: rows } = await db
    .from("goals")
    .select("goal_date, status, title")
    .eq("user_id", user.id)
    .eq("is_daily", true)
    .order("goal_date", { ascending: true });

  const byDate = {};
  for (const r of rows || []) {
    const d = r.goal_date;
    if (!d) continue;
    byDate[d] = byDate[d] || { date: d, total: 0, done: 0, failed: 0 };
    byDate[d].total++;
    if (r.status === "done") byDate[d].done++;
    if (r.status === "failed") byDate[d].failed++;
  }

  const days = Object.values(byDate).map((d) => ({
    ...d,
    pct: d.total ? Math.round((d.done / d.total) * 100) : 0
  }));

  return Response.json({ days });
}
