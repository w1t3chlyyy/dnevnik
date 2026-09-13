import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";

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

  const since = new Date();
  since.setDate(since.getDate() - 13);

  const { data: rows } = await db
    .from("food_logs")
    .select("logged_at, calories, protein, fat, carbs")
    .eq("user_id", user.id)
    .gte("logged_at", since.toISOString())
    .order("logged_at", { ascending: true });

  const byDate = {};
  for (const r of rows || []) {
    // sv-SE даёт готовый формат YYYY-MM-DD, с учётом московской таймзоны
    const d = new Date(r.logged_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
    byDate[d] = byDate[d] || { date: d, calories: 0, protein: 0, fat: 0, carbs: 0 };
    byDate[d].calories += Number(r.calories);
    byDate[d].protein += Number(r.protein);
    byDate[d].fat += Number(r.fat);
    byDate[d].carbs += Number(r.carbs);
  }

  const days = Object.values(byDate)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => ({
      ...d,
      calories: Math.round(d.calories),
      protein: Math.round(d.protein),
      fat: Math.round(d.fat),
      carbs: Math.round(d.carbs)
    }));

  return Response.json({ days });
}
