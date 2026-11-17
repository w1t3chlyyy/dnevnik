import { supabaseAdmin as db } from "@/lib/supabase";
import { panelUser, unauthorized } from "@/lib/panelAuth";
import { getSettings } from "@/lib/business";
import { providerStatus } from "@/lib/llm";

export async function GET(req) {
  const user = await panelUser(req);
  if (!user) return unauthorized();

  const { data: conns } = await db
    .from("business_connections")
    .select("id, rights, is_enabled, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  return Response.json({
    connection: conns?.[0] || null,
    settings: await getSettings(user.id),
    providers: await providerStatus().catch(() => [])
  });
}

export async function POST(req) {
  const user = await panelUser(req);
  if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));

  const patch = {};
  if (typeof b.auto_reply === "boolean") patch.auto_reply = b.auto_reply;
  if (["selected", "new", "all"].includes(b.chat_filter)) patch.chat_filter = b.chat_filter;
  if (typeof b.persona === "string") patch.persona = b.persona.slice(0, 4000);
  if (typeof b.pause_on_owner_reply === "boolean") patch.pause_on_owner_reply = b.pause_on_owner_reply;
  if (Number.isFinite(Number(b.reply_delay_sec))) patch.reply_delay_sec = Math.min(30, Math.max(0, Math.round(Number(b.reply_delay_sec))));
  if (Number.isFinite(Number(b.owner_pause_hours))) patch.owner_pause_hours = Math.min(168, Math.max(1, Math.round(Number(b.owner_pause_hours))));

  const { error } = await db.from("bot_settings").upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() });
  if (error) return Response.json({ error: "db_error" }, { status: 500 });
  return Response.json({ settings: await getSettings(user.id) });
}
