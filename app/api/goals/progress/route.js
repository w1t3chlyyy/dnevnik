import { supabaseAdmin as db } from "@/lib/supabase";
import { verifyInitData } from "@/lib/verifyTelegram";
import { propagateDailyCompletion } from "@/lib/goalLinks"; // ← добавить

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
    .from("users").select("id").eq("telegram_id", tgUser.id).maybeSingle();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: goal } = await db
    .from("goals")
    .select("id, user_id, title, target_value, status, is_daily") // ← добавили title, is_daily
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
    .from("goal_progress").select("value").eq("goal_id", goalId);
  const rawTotal = (progressRows || []).reduce((s, r) => s + Number(r.value), 0);
  const total = Math.max(0, rawTotal);
  const completed = total >= Number(goal.target_value);

  const patch = {
    current_value: total,
    status: completed ? "done" : "active",
    hidden: completed
  };
  if (completed) patch.completed_at = new Date().toISOString();

  const { data: updated } = await db
    .from("goals")
    .update(patch)
    .eq("id", goalId)
    .select("*, goal_progress(value, logged_at)")
    .maybeSingle();

  // ← вот этого блока не было: пробрасываем прогресс в связанную обычную цель
  let linkedGoal = null;
  if (completed && goal.is_daily) {
    linkedGoal = await propagateDailyCompletion({ ...goal, current_value: total, status: "active" });
  }

  return Response.json({ goal: updated, completed, linkedGoal });
}
