import { supabaseAdmin as db } from "./supabase";
import { localDayBoundsUtc } from "./time";
import { askQwenRaw } from "./qwen";

// Формула Миффлина-Сан Жеора — общепринятый способ прикинуть базовый обмен
// веществ (BMR) по весу/росту/возрасту/полу. Дальше умножаем на коэффициент
// активности (TDEE) и корректируем под цель по весу.
const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2, // мало/сидячий образ жизни
  light: 1.375, // лёгкая активность, 1-3 тренировки в неделю
  moderate: 1.55, // средняя активность, 3-5 тренировок в неделю
  active: 1.725, // высокая активность, 6-7 тренировок в неделю
  very_active: 1.9 // очень высокая (физ. работа + тренировки)
};

// −20% от нормы для похудения, +15% для набора массы — стандартные,
// не экстремальные значения дефицита/профицита.
const GOAL_MULTIPLIERS = { lose: 0.8, maintain: 1, gain: 1.15 };

export function computeNutritionTargets(profile) {
  const { weight_kg: w, height_cm: h, age, gender, activity_level, goal } = profile;

  const bmr =
    gender === "male"
      ? 10 * w + 6.25 * h - 5 * age + 5
      : 10 * w + 6.25 * h - 5 * age - 161;

  const tdee = bmr * (ACTIVITY_MULTIPLIERS[activity_level] || ACTIVITY_MULTIPLIERS.moderate);
  const calories = Math.round(tdee * (GOAL_MULTIPLIERS[goal] ?? 1));

  const proteinPerKg = goal === "gain" ? 2 : 1.8;
  const protein = Math.round(proteinPerKg * w);
  const fat = Math.round((calories * 0.25) / 9);
  const proteinCals = protein * 4;
  const fatCals = fat * 9;
  const carbs = Math.max(0, Math.round((calories - proteinCals - fatCals) / 4));

  return {
    target_calories: calories,
    target_protein: protein,
    target_fat: fat,
    target_carbs: carbs
  };
}

const MACRO_SYSTEM_PROMPT =
  "Ты — нутрициолог-калькулятор калорий. По текстовому описанию приёма пищи оцени суммарную " +
  "калорийность и БЖУ на ВЕСЬ описанный приём пищи (сумма всех продуктов), основываясь на " +
  "типичных порциях и составе продуктов. Отвечай СТРОГО одним JSON-объектом без пояснений, " +
  "без markdown-разметки, в формате: " +
  '{"calories": число, "protein": число, "fat": число, "carbs": число}. ' +
  "calories — ккал, остальное — граммы. Только числа, без единиц измерения внутри значений.";

// Использует облегчённый вызов Qwen (без истории чата и базы знаний) — это
// быстрее, чем полноценный askQwen(), и не засоряет ai_chat_history
// техническими промптами про расчёт КБЖУ. LLM иногда добавляет пояснения
// вокруг JSON, поэтому парсим через regex, а не JSON.parse(raw) напрямую.
export async function estimateFoodMacros(user, description) {
  const raw = await askQwenRaw(MACRO_SYSTEM_PROMPT, `Приём пищи: "${description}"`);
  const cleaned = String(raw).replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AI не вернул JSON: " + cleaned.slice(0, 200));
  }

  const parsed = JSON.parse(match[0]);
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  };

  return {
    calories: toNum(parsed.calories),
    protein: toNum(parsed.protein),
    fat: toNum(parsed.fat),
    carbs: toNum(parsed.carbs)
  };
}

export async function getTodayTotals(userId) {
  const { startIso, endIso } = localDayBoundsUtc();
  const { data } = await db
    .from("food_logs")
    .select("calories, protein, fat, carbs")
    .eq("user_id", userId)
    .gte("logged_at", startIso)
    .lt("logged_at", endIso);

  return (data || []).reduce(
    (acc, r) => ({
      calories: acc.calories + Number(r.calories),
      protein: acc.protein + Number(r.protein),
      fat: acc.fat + Number(r.fat),
      carbs: acc.carbs + Number(r.carbs)
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );
}

export function mealLabel(type) {
  return { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин", snack: "Перекус" }[type] || "Приём пищи";
}
