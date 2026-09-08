import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";

// Отметить прогресс по цели прямо из мини-аппа (по частям).
// Как только сумма отметок достигает цели — статус меняется на "done",
// а фронт проигрывает анимацию завершения и убирает карточку из активных.
export async function POST(req) {
  const initData = req.headers.get("x-telegram-init-data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const goalId = body.goal_id;
  const rawValue = Number(String(body.value ?? "").replace(",", "."));

  if (!goalId || !Number.isFinite(rawValue) || rawValue === 0) {
    return Response.json({ error: "invalid_value" }, { status: 400 });
  }

  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("telegram_id", tgUser.id)
    .maybeSingle();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: goal } = await db
    .from("goals")
    .select("id, user_id, target_value, status")
    .eq("id", goalId)
    .maybeSingle();

  if (!goal || goal.user_id !== user.id) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (goal.status !== "active") {
    return Response.json({ error: "not_active" }, { status: 400 });
  }

  const { error: insertError } = await db
    .from("goal_progress")
    .insert({ goal_id: goalId, value: rawValue, note: "из мини-аппа" });
  if (insertError) return Response.json({ error: "db_error" }, { status: 500 });

  const { data: progressRows } = await db
    .from("goal_progress")
    .select("value")
    .eq("goal_id", goalId);
  const total = (progressRows || []).reduce((s, r) => s + Number(r.value), 0);
  const completed = total >= Number(goal.target_value);

  const { data: updated } = await db
    .from("goals")
    .update({
      current_value: total,
      status: completed ? "done" : "active"
    })
    .eq("id", goalId)
    .select("*, goal_progress(value, logged_at)")
    .maybeSingle();

  return Response.json({ goal: updated, completed });
}
