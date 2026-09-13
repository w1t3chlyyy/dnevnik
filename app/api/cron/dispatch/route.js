import { NextResponse } from "next/server";
import { InlineKeyboard } from "grammy";
import { supabaseAdmin as db } from "@/lib/supabase";
import bot from "@/lib/bot";
import { isDueNow, localDateStr } from "@/lib/time";
import { buildDailyDigest } from "@/lib/digest";

export const maxDuration = 60;

// Во сколько по МСК слать вечерний итог и утреннюю мотивацию.
// Можно переопределить через env, не трогая код.
const DIGEST_TIME_MSK = process.env.DIGEST_TIME_MSK || "22:00";
const MORNING_TIME_MSK = process.env.MORNING_TIME_MSK || "10:00";

const MORNING_MESSAGES = [
  "Доброе утро ☀️ Новый день — новые результаты. Какую цель поставишь на сегодня?",
  "Утро доброе 🌤 Маленький шаг сегодня — заметный прогресс через месяц. Зафиксируем цель на день?",
  "Привет! Сегодня отличный день, чтобы сдвинуть что-то важное с места. Есть цель на сегодня?",
  "Доброе утро 🚀 Что одно действие сегодня приблизит тебя к главной цели?"
];
function pickMorningMessage() {
  return MORNING_MESSAGES[Math.floor(Math.random() * MORNING_MESSAGES.length)];
}

// Приёмы пищи, о которых бот напоминает занести в трекер питания.
// Время каждого настраивается через env, дедупликация — через отдельную
// дата-колонку в users на каждый приём пищи (аналогично last_morning_date).
const MEAL_PROMPTS = [
  {
    type: "breakfast",
    envVar: "BREAKFAST_TIME_MSK",
    defaultTime: "08:30",
    dateCol: "last_breakfast_prompt_date",
    label: "Завтрак",
    emoji: "🍳"
  },
  {
    type: "lunch",
    envVar: "LUNCH_TIME_MSK",
    defaultTime: "13:00",
    dateCol: "last_lunch_prompt_date",
    label: "Обед",
    emoji: "🍲"
  },
  {
    type: "dinner",
    envVar: "DINNER_TIME_MSK",
    defaultTime: "19:30",
    dateCol: "last_dinner_prompt_date",
    label: "Ужин",
    emoji: "🍝"
  }
];

// Простая защита эндпоинта: если задан CRON_SECRET — требуем его в
// query (?secret=...) или в заголовке x-cron-secret / Authorization: Bearer.
// Если не задан — не блокируем (но это не рекомендуется для продакшена).
function checkSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("secret");
  const auth = req.headers.get("authorization") || "";
  const fromHeader = req.headers.get("x-cron-secret") || auth.replace(/^Bearer\s+/i, "");
  return fromQuery === secret || fromHeader === secret;
}

export async function GET(req) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = {
    onceSent: 0,
    dailySent: 0,
    digestSent: 0,
    morningSent: 0,
    dailyGoalPrompts: 0,
    mealPrompts: 0,
    errors: []
  };
  const nowIso = new Date().toISOString();
  const today = localDateStr();

  // 1) Разовые напоминания ("помыть посуду в 22:00")
  try {
    const { data: due, error } = await db
      .from("reminders")
      .select("id, message, users!inner(telegram_id)")
      .eq("type", "once")
      .eq("is_sent", false)
      .lte("remind_at", nowIso);
    if (error) throw error;

    for (const r of due || []) {
      try {
        await bot.api.sendMessage(r.users.telegram_id, `⏰ ${r.message}`);
        await db.from("reminders").update({ is_sent: true, sent_at: nowIso }).eq("id", r.id);
        results.onceSent++;
      } catch (e) {
        results.errors.push(`once:${r.id}:${e.message}`);
      }
    }
  } catch (e) {
    results.errors.push(`once-query:${e.message}`);
  }

  // 2) Ежедневные напоминания о целях (старый механизм, теперь реально отправляется)
  try {
    const { data: dailyRows, error } = await db
      .from("reminders")
      .select("id, cron_time, message, last_sent_date, users!inner(telegram_id)")
      .or("type.is.null,type.eq.daily");
    if (error) throw error;

    for (const r of dailyRows || []) {
      if (!isDueNow(r.cron_time)) continue;
      if (r.last_sent_date === today) continue; // уже отправляли сегодня в этом окне
      try {
        await bot.api.sendMessage(r.users.telegram_id, r.message);
        await db.from("reminders").update({ last_sent_date: today }).eq("id", r.id);
        results.dailySent++;
      } catch (e) {
        results.errors.push(`daily:${r.id}:${e.message}`);
      }
    }
  } catch (e) {
    results.errors.push(`daily-query:${e.message}`);
  }

  // 3) Утренняя мотивация + предложение поставить цель на день
  try {
    if (isDueNow(MORNING_TIME_MSK)) {
      const { data: users, error } = await db.from("users").select("*");
      if (error) throw error;
      for (const user of users || []) {
        if (user.last_morning_date === today) continue;
        try {
          const kb = new InlineKeyboard().text("🎯 Поставить цель на день", "daily_goal:new");
          await bot.api.sendMessage(user.telegram_id, pickMorningMessage(), { reply_markup: kb });
          await db.from("users").update({ last_morning_date: today }).eq("id", user.id);
          results.morningSent++;
        } catch (e) {
          results.errors.push(`morning:${user.id}:${e.message}`);
        }
      }
    }
  } catch (e) {
    results.errors.push(`morning-query:${e.message}`);
  }

  // 4) Приёмы пищи — напоминание занести еду в трекер питания
  try {
    const { data: users, error } = await db.from("users").select("*");
    if (error) throw error;

    for (const meal of MEAL_PROMPTS) {
      const time = process.env[meal.envVar] || meal.defaultTime;
      if (!isDueNow(time)) continue;

      for (const user of users || []) {
        if (user[meal.dateCol] === today) continue;
        try {
          const kb = new InlineKeyboard().text(`${meal.emoji} Добавить в трекер`, `food_meal:${meal.type}`);
          await bot.api.sendMessage(
            user.telegram_id,
            `${meal.emoji} ${meal.label}! Что съел(а)? Занесём в трекер питания.`,
            { reply_markup: kb }
          );
          await db.from("users").update({ [meal.dateCol]: today }).eq("id", user.id);
          results.mealPrompts++;
        } catch (e) {
          results.errors.push(`meal-${meal.type}:${user.id}:${e.message}`);
        }
      }
    }
  } catch (e) {
    results.errors.push(`meal-query:${e.message}`);
  }

  // 5) Вечерний итог дня по всем пользователям + отдельные карточки по целям дня
  try {
    if (isDueNow(DIGEST_TIME_MSK)) {
      const { data: users, error } = await db.from("users").select("*");
      if (error) throw error;
      for (const user of users || []) {
        if (user.last_digest_date === today) continue;
        try {
          const text = await buildDailyDigest(user);
          await bot.api.sendMessage(user.telegram_id, text);
          await db.from("users").update({ last_digest_date: today }).eq("id", user.id);
          results.digestSent++;

          // Отдельное сообщение с кнопками на каждую активную цель дня —
          // чтобы можно было сразу отметить прогресс или закрыть её.
          const { data: dailyGoals } = await db
            .from("goals")
            .select("*")
            .eq("user_id", user.id)
            .eq("is_daily", true)
            .eq("goal_date", today)
            .eq("status", "active");

          for (const dg of dailyGoals || []) {
            try {
              const unit = dg.metric_unit ? ` ${dg.metric_unit}` : "";
              const dkb = new InlineKeyboard()
                .text("➕ Прогресс", `dgoal_progress:${dg.id}`)
                .row()
                .text("✅ Выполнено", `dgoal_close:done:${dg.id}`)
                .text("❌ Не вышло", `dgoal_close:failed:${dg.id}`);
              await bot.api.sendMessage(
                user.telegram_id,
                `Цель на сегодня: ${dg.title}\n${dg.current_value ?? 0}/${dg.target_value}${unit}`,
                { reply_markup: dkb }
              );
              results.dailyGoalPrompts++;
            } catch (e) {
              results.errors.push(`dgoal-prompt:${dg.id}:${e.message}`);
            }
          }
        } catch (e) {
          results.errors.push(`digest:${user.id}:${e.message}`);
        }
      }
    }
  } catch (e) {
    results.errors.push(`digest-query:${e.message}`);
  }

  return NextResponse.json({ ok: true, ...results });
}
