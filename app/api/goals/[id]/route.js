// app/api/goals/[id]/route.js
import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";

// Удаляет цель из мини-аппа/бота (мягко: hidden = true), не трогая
// goal_progress — поэтому прошлый прогресс продолжает учитываться в
// /api/summary и дайджестах за периоды, которые уже наступили.
// Разрешено удалять цель в любом статусе, включая активную — пользователь
// мог просто передумать.
// Если у цели были настроены связи с целями дня (goal_links), они
// удаляются вместе с целью, чтобы выполнение цели дня больше не пыталось
// прибавлять прогресс к уже удалённой цели.
export async function DELETE(req, { params }) {
  const initData = req.headers.get("x-telegram-init-data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("telegram_id", tgUser.id)
    .maybeSingle();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: goal } = await db
    .from("goals")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!goal || goal.user_id !== user.id) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await db.from("goals").update({ hidden: true }).eq("id", goal.id);
  if (error) return Response.json({ error: "db_error" }, { status: 500 });

  // Чистим связи, где эта цель выступала родителем.
  await db.from("goal_links").delete().eq("parent_goal_id", goal.id);

  return Response.json({ ok: true });
}
