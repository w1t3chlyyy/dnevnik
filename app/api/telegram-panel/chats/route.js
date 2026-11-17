import { supabaseAdmin as db } from "@/lib/supabase";
import { panelUser, unauthorized } from "@/lib/panelAuth";

export async function GET(req) {
  const user = await panelUser(req);
  if (!user) return unauthorized();
  const { data } = await db
    .from("business_chats")
    .select("chat_id, name, username, is_bot, status, ai_off, mute, last_message_at")
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false })
    .limit(200);
  return Response.json({ chats: data || [] });
}

export async function POST(req) {
  const user = await panelUser(req);
  if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (!b.chat_id) return Response.json({ error: "invalid_input" }, { status: 400 });

  const patch = {};
  if (["new", "selected", "ignored"].includes(b.status)) patch.status = b.status;
  if (typeof b.ai_off === "boolean") patch.ai_off = b.ai_off;
  if (typeof b.mute === "boolean") patch.mute = b.mute;

  const { error } = await db.from("business_chats").update(patch).eq("user_id", user.id).eq("chat_id", b.chat_id);
  if (error) return Response.json({ error: "db_error" }, { status: 500 });
  return Response.json({ ok: true });
}
