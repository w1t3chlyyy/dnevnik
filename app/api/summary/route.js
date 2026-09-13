import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";
import { buildSummary } from "@/lib/summary";

export async function GET(req) {
  const initData = req.headers.get("x-telegram-init-data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("telegram_id", tgUser.id)
    .maybeSingle();
  if (!user) return Response.json({ error: "not_found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") === "year" ? "year" : "month";

  const summary = await buildSummary(user.id, period);
  return Response.json(summary);
}
