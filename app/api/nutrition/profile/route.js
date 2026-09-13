import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";

// Профиль редактируется через бота (/nutrition → «Настроить профиль»),
// здесь только чтение — мини-апп его показывает, но не изменяет.
export async function GET(req) {
  const initData = req.headers.get("x-telegram-init-data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("telegram_id", tgUser.id)
    .maybeSingle();
  if (!user) return Response.json({ profile: null });

  const { data: profile } = await db
    .from("nutrition_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return Response.json({ profile: profile || null });
}
