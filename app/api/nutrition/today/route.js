import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";
import { localDayBoundsUtc } from "@/lib/time";

export async function GET(req) {
  const initData = req.headers.get("x-telegram-init-data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("telegram_id", tgUser.id)
    .maybeSingle();
  if (!user) return Response.json({ meals: [], totals: null, profile: null });

  const { startIso, endIso } = localDayBoundsUtc();
  const { data: meals } = await db
    .from("food_logs")
    .select("*")
    .eq("user_id", user.id)
    .gte("logged_at", startIso)
    .lt("logged_at", endIso)
    .order("logged_at", { ascending: true });

  const totals = (meals || []).reduce(
    (acc, m) => ({
      calories: acc.calories + Number(m.calories),
      protein: acc.protein + Number(m.protein),
      fat: acc.fat + Number(m.fat),
      carbs: acc.carbs + Number(m.carbs)
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  const { data: profile } = await db
    .from("nutrition_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return Response.json({ meals: meals || [], totals, profile: profile || null });
}
