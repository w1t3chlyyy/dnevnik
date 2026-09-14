// lib/goalLinks.js
import { supabaseAdmin as db } from "./supabase";

// Вызывается при выполнении цели дня — если для неё настроена связь
// (через drag-конструктор в мини-аппе или через AI), прибавляет достигнутое
// значение к связанной обычной цели.
//
// Защита от повторного начисления: если цель-получатель уже скрыта
// (удалена пользователем) или уже отмечена как достигнутая — прогресс
// больше не добавляется. Без этой проверки повторное закрытие одной и той
// же цели дня (например, по протухшей кнопке «Выполнено» после того, как
// прогресс уже довёл цель до 100% другим путём) задваивало прогресс у
// родительской цели.
export async function propagateDailyCompletion(dailyGoal) {
  const normalizedTitle = String(dailyGoal.title || "").trim().toLowerCase();
  if (!normalizedTitle || !dailyGoal.user_id) return null;

  const { data: link } = await db
    .from("goal_links")
    .select("*, goals:parent_goal_id(id, title, target_value, current_value, status, hidden)")
    .eq("user_id", dailyGoal.user_id)
    .eq("daily_title", normalizedTitle)
    .maybeSingle();

  if (!link || !link.goals || link.goals.hidden) return null;
  if (link.goals.status === "done") return null; // уже достигнута — не начисляем повторно

  const achieved =
    Number(dailyGoal.current_value) > 0
      ? Number(dailyGoal.current_value)
      : Number(dailyGoal.target_value) || 0;
  const addAmount = achieved * (Number(link.multiplier) || 1);
  if (!addAmount) return null;

  await db.from("goal_progress").insert({
    goal_id: link.parent_goal_id,
    value: addAmount,
    note: `связанная цель дня «${dailyGoal.title}»`
  });

  const { data: progressRows } = await db
    .from("goal_progress")
    .select("value")
    .eq("goal_id", link.parent_goal_id);
  const total = (progressRows || []).reduce((s, r) => s + Number(r.value), 0);
  const parentTarget = Number(link.goals.target_value) || 0;
  const completed = parentTarget > 0 && total >= parentTarget;

  const patch = { current_value: total, status: completed ? "done" : "active" };
  if (completed) {
    patch.completed_at = new Date().toISOString();
    // Достигнутая цель сразу прячется из мини-аппа — видна только в
    // «Итогах» и дайджестах (там расчёт идёт напрямую по БД, hidden на
    // них не влияет).
    patch.hidden = true;
  }

  await db.from("goals").update(patch).eq("id", link.parent_goal_id);

  return {
    parentGoalId: link.parent_goal_id,
    parentTitle: link.goals.title,
    addAmount,
    total,
    completed
  };
}
