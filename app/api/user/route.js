import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";

export async function GET(req) {
  const initData = req.headers.get("x-telegram-init-data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: user } = await db
    .from("users")
    .select("first_name, username, telegram_id, google_refresh_token")
    .eq("telegram_id", tgUser.id)
    .maybeSingle();

  return Response.json({
    first_name: user?.first_name || tgUser.first_name || null,
    username: user?.username || tgUser.username || null,
    driveConnected: Boolean(user?.google_refresh_token)
  });
}
