// app/api/goal-links/route.js
import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";

async function getUser(req) {
  const initData = req.headers.get("x-telegram-init-data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return null;
  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("telegram_id", tgUser.id)
    .maybeSingle();
  return user;
}

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: links } = await db
    .from("goal_links")
    .select("*, goals:parent_goal_id(id, title, target_value, current_value, metric_unit, status, hidden)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Связи на цели, которые пользователь удалил/цель уже достигнута
  // (hidden=true), нигде не должны быть видны — исключаем их из ответа.
  const visible = (links || []).filter((l) => l.goals && !l.goals.hidden);

  return Response.json({ links: visible });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dailyTitle = String(body.daily_title || "").trim();
  const parentGoalId = body.parent_goal_id;
  const multiplier = Number(body.multiplier) || 1;

  if (!dailyTitle || !parentGoalId) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  const { data: parentGoal } = await db
    .from("goals")
    .select("id")
    .eq("id", parentGoalId)
    .eq("user_id", user.id)
    .eq("hidden", false)
    .maybeSingle();
  if (!parentGoal) return Response.json({ error: "not_found" }, { status: 404 });

  const { data: link, error } = await db
    .from("goal_links")
    .upsert(
      {
        user_id: user.id,
        daily_title: dailyTitle.toLowerCase(),
        parent_goal_id: parentGoalId,
        multiplier
      },
      { onConflict: "user_id,daily_title" }
    )
    .select("*, goals:parent_goal_id(id, title)")
    .maybeSingle();

  if (error) return Response.json({ error: "db_error" }, { status: 500 });
  return Response.json({ link });
}

export async function DELETE(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "invalid_input" }, { status: 400 });

  await db.from("goal_links").delete().eq("id", id).eq("user_id", user.id);
  return Response.json({ ok: true });
}
