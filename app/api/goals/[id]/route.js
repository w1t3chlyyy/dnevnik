import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";

// Удаляет цель "навсегда" из интерфейса, но не из базы: ставим hidden=true
// вместо DELETE. Так goal_progress по ней не каскадно стирается, и она
// продолжает учитываться в /api/summary за прошлые периоды, в которых уже
// была посчитана. Разрешаем скрывать только неактивные (архивные) цели —
// активную нужно сперва закрыть/выполнить.
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
    .select("id, user_id, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!goal || goal.user_id !== user.id) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (goal.status === "active") {
    return Response.json({ error: "only_archived_can_be_removed" }, { status: 400 });
  }

  const { error } = await db.from("goals").update({ hidden: true }).eq("id", goal.id);
  if (error) return Response.json({ error: "db_error" }, { status: 500 });

  return Response.json({ ok: true });
}
