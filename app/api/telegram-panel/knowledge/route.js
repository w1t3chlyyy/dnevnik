import { supabaseAdmin as db } from "@/lib/supabase";
import { panelUser, unauthorized } from "@/lib/panelAuth";

export async function GET(req) {
  const user = await panelUser(req);
  if (!user) return unauthorized();
  const { data } = await db
    .from("knowledge_base")
    .select("id, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return Response.json({ items: data || [] });
}

export async function POST(req) {
  const user = await panelUser(req);
  if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const content = String(b.content || "").trim().slice(0, 2000);
  if (!content) return Response.json({ error: "invalid_input" }, { status: 400 });
  const { data, error } = await db.from("knowledge_base").insert({ user_id: user.id, content }).select("id, content, created_at").single();
  if (error) return Response.json({ error: "db_error" }, { status: 500 });
  return Response.json({ item: data });
}

export async function DELETE(req) {
  const user = await panelUser(req);
  if (!user) return unauthorized();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "invalid_input" }, { status: 400 });
  await db.from("knowledge_base").delete().eq("id", id).eq("user_id", user.id);
  return Response.json({ ok: true });
}
