import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";

export async function GET(req) {
  const initData = req.headers.get("x-telegram-init-data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: user } = await db
    .from("users")
    .select("*")
    .eq("telegram_id", tgUser.id)
    .maybeSingle();
  if (!user) return Response.json({ goals: [] });

  const { data: goals } = await db
    .from("goals")
    .select("*, goal_progress(value, logged_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return Response.json({ goals });
}
