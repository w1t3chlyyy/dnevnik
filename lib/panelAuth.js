import { supabaseAdmin as db } from "./supabase";
import { verifyInitData } from "./verifyTelegram";

// Пользователь мини-аппа по подписанному initData; null — если подпись неверна.
export async function panelUser(req) {
  const tg = verifyInitData(req.headers.get("x-telegram-init-data"));
  if (!tg) return null;
  const { data } = await db.from("users").select("*").eq("telegram_id", tg.id).maybeSingle();
  return data || null;
}
export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
