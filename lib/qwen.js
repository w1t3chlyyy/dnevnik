// lib/qwen.js
import { supabaseAdmin as db } from "./supabase";
import { callLLM } from "./llm";
import { computeNutritionTargets, estimateFoodMacros, getTodayTotals } from "./nutrition";
import { parseHHMM, nextOccurrenceUtcIso, formatLocalHuman, localDateStr } from "./time";
import { propagateDailyCompletion } from "./goalLinks";
import { buildSummary } from "./summary";
import {
  startActivity,
  stopActivity,
  logActivity,
  listKnownActivities,
  getRunning
} from "./activities";

const QWEN_MODEL = process.env.QWEN_MODEL || "qwen3.7-plus";
const QWEN_FAST_MODEL = process.env.QWEN_FAST_MODEL || "qwen-turbo";
const QWEN_TIMEOUT_MS = 12000;        // для быстрых вызовов (расчёт КБЖУ и т.п.)
const QWEN_CHAT_TIMEOUT_MS = 25000;   // для основного чата /ai с function calling

const tools = [
  {
    type: "function",
    function: {
      name: "create_goal",
      description: "Создать новую обычную (не дневную) бизнес-цель пользователя",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          target_value: { type: "number" },
          metric_unit: { type: "string" },
          deadline: { type: "string", description: "YYYY-MM-DD или null" }
        },
        required: ["title", "target_value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_goal",
      description: "Изменить название/цифру/единицу/дедлайн у существующей обычной цели",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Текущее название цели, по которому её найти" },
          new_title: { type: "string" },
          target_value: { type: "number" },
          metric_unit: { type: "string" },
          deadline: { type: "string", description: "YYYY-MM-DD или пустая строка, чтобы убрать дедлайн" }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_goal",
      description:
        "Удалить цель по названию — подходит и для обычных целей, и для целей дня за сегодня. Цель " +
        "скрывается из мини-аппа и бота, но её прошлый прогресс не стирается из статистики " +
        "(get_summary) — удаление необратимо только в интерфейсе.",
      parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] }
    }
  },
  {
    type: "function",
    function: {
      name: "update_goal_progress",
      description:
        "Добавить значение прогресса к существующей обычной цели по её названию. Значение может " +
        "быть отрицательным, чтобы наоборот убавить прогресс.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" }, value: { type: "number" } },
        required: ["title", "value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_goals",
      description: "Получить список обычных (не дневных) целей пользователя с текущим прогрессом",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "create_daily_goal",
      description: "Создать цель на сегодняшний день. На выполнение даётся 24 часа — после смены суток незакрытая цель автоматически становится невыполненной.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          target_value: { type: "number", description: "По умолчанию 1" },
          metric_unit: { type: "string" }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_daily_goal_progress",
      description:
        "Добавить прогресс к сегодняшней цели дня по названию. Значение может быть отрицательным, " +
        "чтобы убавить прогресс.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" }, value: { type: "number" } },
        required: ["title", "value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "close_daily_goal",
      description: "Закрыть сегодняшнюю цель дня как выполненную или невыполненную",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          outcome: { type: "string", enum: ["done", "failed"] }
        },
        required: ["title", "outcome"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_daily_goals",
      description: "Получить список целей дня за конкретную дату (по умолчанию — сегодня)",
      parameters: { type: "object", properties: { date: { type: "string" } } }
    }
  },
  {
    type: "function",
    function: {
      name: "link_goals",
      description:
        "Связать название цели дня с обычной целью: при каждом выполнении цели дня с этим " +
        "названием прогресс автоматически прибавится к обычной цели",
      parameters: {
        type: "object",
        properties: {
          daily_title: { type: "string" },
          goal_title: { type: "string" },
          multiplier: { type: "number", description: "По умолчанию 1" }
        },
        required: ["daily_title", "goal_title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "unlink_goals",
      description: "Убрать связь цели дня с обычной целью по названию цели дня",
      parameters: {
        type: "object",
        properties: { daily_title: { type: "string" } },
        required: ["daily_title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_goal_links",
      description: "Получить список всех текущих связей между целями дня и обычными целями",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "add_contact",
      description: "Сохранить новый контакт (телеграм-username) с необязательной подписью",
      parameters: {
        type: "object",
        properties: { telegram_username: { type: "string" }, label: { type: "string" } },
        required: ["telegram_username"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_contacts",
      description: "Получить список сохранённых контактов",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_contact",
      description: "Удалить контакт по username",
      parameters: {
        type: "object",
        properties: { telegram_username: { type: "string" } },
        required: ["telegram_username"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_reminder",
      description: "Настроить разовое или ежедневное напоминание",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["once", "daily"] },
          time: { type: "string", description: "ЧЧ:ММ" },
          message: { type: "string" }
        },
        required: ["type", "time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "Получить список всех напоминаний пользователя",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_reminder",
      description: "Удалить напоминание по фрагменту текста сообщения",
      parameters: {
        type: "object",
        properties: { message_contains: { type: "string" } },
        required: ["message_contains"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_nutrition_profile",
      description: "Настроить или обновить профиль питания и рассчитать дневную норму КБЖУ",
      parameters: {
        type: "object",
        properties: {
          weight_kg: { type: "number" },
          height_cm: { type: "number" },
          age: { type: "number" },
          gender: { type: "string", enum: ["male", "female"] },
          activity_level: {
            type: "string",
            enum: ["sedentary", "light", "moderate", "active", "very_active"]
          },
          goal: { type: "string", enum: ["lose", "maintain", "gain"] }
        },
        required: ["weight_kg", "height_cm", "age", "gender", "activity_level", "goal"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "log_food",
      description: "Записать приём пищи в трекер питания по текстовому описанию (КБЖУ посчитается сам)",
      parameters: {
        type: "object",
        properties: {
          meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
          description: { type: "string" }
        },
        required: ["meal_type", "description"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_nutrition_today",
      description: "Получить сводку по питанию за сегодня и норму из профиля",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "save_knowledge",
      description: "Сохранить важный долгосрочный факт о пользователе, бизнесе или проекте",
      parameters: {
        type: "object",
        properties: { content: { type: "string" } },
        required: ["content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_knowledge",
      description: "Получить последние записи из базы знаний",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_knowledge",
      description: "Удалить запись из базы знаний по фрагменту текста",
      parameters: {
        type: "object",
        properties: { content_contains: { type: "string" } },
        required: ["content_contains"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_summary",
      description: "Получить итоги за месяц или год со сравнением с предыдущим периодом (включая время по делам)",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: ["month", "year"] } },
        required: ["period"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "start_activity",
      description:
        "Запустить таймер дела: «зашёл в зал», «начал работать», «сел читать». Название — короткое " +
        "обобщённое, с заглавной буквы; если по смыслу подходит уже известная активность — бери её точное название.",
      parameters: {
        type: "object",
        properties: {
          activity: { type: "string" },
          minutes_ago: { type: "number", description: "Если дело началось раньше: «20 минут назад»" },
          note: { type: "string" }
        },
        required: ["activity"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "stop_activity",
      description:
        "Остановить таймер и зафиксировать время: «вышел», «закончил», «всё». Если запущен один таймер — " +
        "название можно не указывать.",
      parameters: {
        type: "object",
        properties: {
          activity: { type: "string" },
          minutes_ago: { type: "number", description: "Если закончил раньше: «10 минут назад»" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "log_activity",
      description: "Записать уже завершённое дело с длительностью: «читал час», «тренировался 45 минут»",
      parameters: {
        type: "object",
        properties: {
          activity: { type: "string" },
          duration_minutes: { type: "number" },
          minutes_ago: { type: "number", description: "Сколько минут назад закончил (по умолчанию 0)" }
        },
        required: ["activity", "duration_minutes"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_activities",
      description: "Список известных активностей и запущенных сейчас таймеров",
      parameters: { type: "object", properties: {} }
    }
  }
];

async function sumGoalProgress(goalId) {
  const { data: rows } = await db.from("goal_progress").select("value").eq("goal_id", goalId);
  return (rows || []).reduce((s, r) => s + Number(r.value), 0);
}

// Общая функция начисления прогресса для обычных и дневных целей.
// Как только цель достигнута — она сразу помечается hidden=true, чтобы
// пропасть из мини-аппа/бота, но продолжает учитываться в get_summary.
async function applyGoalProgress(goal, value, note) {
  await db.from("goal_progress").insert({ goal_id: goal.id, value, note });
  const total = Math.max(0, await sumGoalProgress(goal.id)); // убавление ниже нуля не имеет смысла
  const completed = total >= Number(goal.target_value);
  const patch = {
    current_value: total,
    status: completed ? "done" : "active",
    hidden: completed
  };
  if (completed && goal.status !== "done") patch.completed_at = new Date().toISOString();
  await db.from("goals").update(patch).eq("id", goal.id);
  return { total, completed };
}

async function runTool(user, name, args) {
  try {
    if (name === "create_goal") {
      await db.from("goals").insert({
        user_id: user.id,
        title: args.title,
        target_value: args.target_value,
        metric_unit: args.metric_unit || null,
        deadline: args.deadline || null
      });
      return { ok: true };
    }

    if (name === "update_goal") {
      const { data: goal } = await db
        .from("goals")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_daily", false)
        .ilike("title", args.title)
        .maybeSingle();
      if (!goal) return { error: "Цель не найдена" };

      const patch = {};
      if (args.new_title) patch.title = args.new_title;
      if (args.target_value != null) patch.target_value = args.target_value;
      if (args.metric_unit != null) patch.metric_unit = args.metric_unit;
      if (args.deadline !== undefined) patch.deadline = args.deadline || null;
      if (Object.keys(patch).length === 0) return { error: "Нечего обновлять" };

      await db.from("goals").update(patch).eq("id", goal.id);
      return { ok: true };
    }

    if (name === "delete_goal") {
      // Ищем сначала среди обычных целей, затем — среди сегодняшних целей
      // дня (по названию), чтобы AI мог удалить оба типа целей.
      let { data: goal } = await db
        .from("goals")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_daily", false)
        .eq("hidden", false)
        .ilike("title", args.title)
        .maybeSingle();

      if (!goal) {
        const today = localDateStr();
        const res = await db
          .from("goals")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_daily", true)
          .eq("goal_date", today)
          .eq("hidden", false)
          .ilike("title", args.title)
          .maybeSingle();
        goal = res.data;
      }

      if (!goal) return { error: "Цель не найдена" };

      // Не удаляем физически — иначе вместе с целью каскадно удалится её
      // goal_progress, и прошлые периоды в get_summary задним числом
      // "похудеют". Вместо этого помечаем hidden=true: цель пропадает из
      // мини-аппа и бота, но продолжает учитываться в статистике.
      await db.from("goals").update({ hidden: true }).eq("id", goal.id);
      // Если это была родительская цель для каких-то связей — удаляем их,
      // чтобы выполнение цели дня больше не пыталось прибавлять прогресс
      // к уже удалённой цели.
      await db.from("goal_links").delete().eq("parent_goal_id", goal.id);
      return { ok: true };
    }

    if (name === "update_goal_progress") {
      const { data: goal } = await db
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_daily", false)
        .ilike("title", args.title)
        .maybeSingle();
      if (!goal) return { error: "Цель не найдена" };
      if (goal.status !== "active") return { error: "Цель уже закрыта" };

      const result = await applyGoalProgress(goal, args.value, "от AI-ассистента");
      return { ok: true, ...result };
    }

    if (name === "list_goals") {
      const { data } = await db
        .from("goals")
        .select("title, target_value, current_value, metric_unit, status, deadline")
        .eq("user_id", user.id)
        .eq("is_daily", false)
        .eq("hidden", false);
      return { goals: data };
    }

    if (name === "create_daily_goal") {
      const today = localDateStr();
      await db.from("goals").insert({
        user_id: user.id,
        title: args.title,
        target_value: args.target_value || 1,
        metric_unit: args.metric_unit || null,
        deadline: today,
        is_daily: true,
        goal_date: today
      });
      return { ok: true };
    }

    if (name === "update_daily_goal_progress") {
      const today = localDateStr();
      const { data: goal } = await db
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_daily", true)
        .eq("goal_date", today)
        .ilike("title", args.title)
        .maybeSingle();
      if (!goal) return { error: "Цель дня с таким названием на сегодня не найдена" };
      if (goal.status !== "active") return { error: "Цель дня уже закрыта" };

      const result = await applyGoalProgress(goal, args.value, "дневная цель, от AI");
      if (result.completed) {
        const link = await propagateDailyCompletion({ ...goal, current_value: result.total, status: "active" });
        if (link) result.linkedGoal = link;
      }
      return { ok: true, ...result };
    }

    if (name === "close_daily_goal") {
      const today = localDateStr();
      const { data: goal } = await db
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_daily", true)
        .eq("goal_date", today)
        .ilike("title", args.title)
        .maybeSingle();
      if (!goal) return { error: "Цель дня с таким названием на сегодня не найдена" };
      // Защита от повторного закрытия уже закрытой цели дня — иначе можно
      // задвоить прогресс у связанной цели.
      if (goal.status !== "active") return { error: "Цель дня уже закрыта" };

      const outcome = args.outcome === "failed" ? "failed" : "done";
      const patch = { status: outcome, hidden: true };
      if (outcome === "done") patch.completed_at = new Date().toISOString();
      await db.from("goals").update(patch).eq("id", goal.id);

      let linkedGoal = null;
      if (outcome === "done") {
        const link = await propagateDailyCompletion(goal);
        if (link) linkedGoal = link;
      }
      return { ok: true, linkedGoal };
    }

    if (name === "list_daily_goals") {
      const date = args.date || localDateStr();
      const { data } = await db
        .from("goals")
        .select("title, target_value, current_value, metric_unit, status")
        .eq("user_id", user.id)
        .eq("is_daily", true)
        .eq("goal_date", date);
      return { daily_goals: data };
    }

    if (name === "link_goals") {
      const { data: parentGoal } = await db
        .from("goals")
        .select("id, title")
        .eq("user_id", user.id)
        .eq("is_daily", false)
        .eq("hidden", false)
        .ilike("title", args.goal_title)
        .maybeSingle();
      if (!parentGoal) return { error: "Обычная цель не найдена" };

      const { error } = await db.from("goal_links").upsert(
        {
          user_id: user.id,
          daily_title: String(args.daily_title).trim().toLowerCase(),
          parent_goal_id: parentGoal.id,
          multiplier: args.multiplier || 1
        },
        { onConflict: "user_id,daily_title" }
      );
      if (error) return { error: "Не удалось сохранить связь" };
      return { ok: true, linked_to: parentGoal.title };
    }

    if (name === "unlink_goals") {
      await db
        .from("goal_links")
        .delete()
        .eq("user_id", user.id)
        .eq("daily_title", String(args.daily_title).trim().toLowerCase());
      return { ok: true };
    }

    if (name === "list_goal_links") {
      const { data } = await db
        .from("goal_links")
        .select("daily_title, multiplier, goals:parent_goal_id(title, hidden)")
        .eq("user_id", user.id);
      // Связи на удалённые/уже достигнутые цели не показываем.
      const links = (data || []).filter((l) => l.goals && !l.goals.hidden);
      return { links };
    }

    if (name === "add_contact") {
      await db.from("contacts").insert({
        user_id: user.id,
        telegram_username: String(args.telegram_username).replace("@", ""),
        label: args.label || null
      });
      return { ok: true };
    }

    if (name === "list_contacts") {
      const { data } = await db.from("contacts").select("telegram_username, label").eq("user_id", user.id);
      return { contacts: data };
    }

    if (name === "delete_contact") {
      await db
        .from("contacts")
        .delete()
        .eq("user_id", user.id)
        .ilike("telegram_username", String(args.telegram_username).replace("@", ""));
      return { ok: true };
    }

    if (name === "set_reminder") {
      if (args.type === "daily") {
        await db.from("reminders").insert({
          user_id: user.id,
          cron_time: args.time,
          message: args.message || "Как продвигаются твои цели сегодня?",
          type: "daily"
        });
        return { ok: true };
      }
      const parsed = parseHHMM(args.time);
      if (!parsed) return { error: "Неверный формат времени, нужно ЧЧ:ММ" };
      const remindAt = nextOccurrenceUtcIso(parsed.h, parsed.m);
      await db.from("reminders").insert({
        user_id: user.id,
        type: "once",
        remind_at: remindAt,
        message: args.message,
        is_sent: false
      });
      return { ok: true, remind_at_msk: formatLocalHuman(remindAt) };
    }

    if (name === "list_reminders") {
      const { data } = await db
        .from("reminders")
        .select("type, cron_time, remind_at, message, active, is_sent")
        .eq("user_id", user.id);
      return { reminders: data };
    }

    if (name === "delete_reminder") {
      const { data: rows } = await db
        .from("reminders")
        .select("id")
        .eq("user_id", user.id)
        .ilike("message", `%${args.message_contains}%`)
        .limit(1);
      if (!rows?.length) return { error: "Напоминание не найдено" };
      await db.from("reminders").delete().eq("id", rows[0].id);
      return { ok: true };
    }

    if (name === "set_nutrition_profile") {
      const targets = computeNutritionTargets(args);
      await db.from("nutrition_profiles").upsert({
        user_id: user.id,
        weight_kg: args.weight_kg,
        height_cm: args.height_cm,
        age: args.age,
        gender: args.gender,
        activity_level: args.activity_level,
        goal: args.goal,
        ...targets,
        updated_at: new Date()
      });
      return { ok: true, targets };
    }

    if (name === "log_food") {
      const macros = await estimateFoodMacros(user, args.description);
      const { approx, ...toSave } = macros;
      await db.from("food_logs").insert({
        user_id: user.id,
        meal_type: args.meal_type,
        description: args.description,
        ...toSave
      });
      return { ok: true, macros };
    }

    if (name === "get_nutrition_today") {
      const totals = await getTodayTotals(user.id);
      const { data: profile } = await db
        .from("nutrition_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return { totals, profile };
    }

    if (name === "save_knowledge") {
      await db.from("knowledge_base").insert({ user_id: user.id, content: args.content });
      return { ok: true };
    }

    if (name === "list_knowledge") {
      const { data } = await db
        .from("knowledge_base")
        .select("content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      return { knowledge: data };
    }

    if (name === "delete_knowledge") {
      const { data: rows } = await db
        .from("knowledge_base")
        .select("id")
        .eq("user_id", user.id)
        .ilike("content", `%${args.content_contains}%`)
        .limit(1);
      if (!rows?.length) return { error: "Запись не найдена" };
      await db.from("knowledge_base").delete().eq("id", rows[0].id);
      return { ok: true };
    }

    if (name === "get_summary") {
      const summary = await buildSummary(user.id, args.period === "year" ? "year" : "month");
      return summary;
    }

    if (name === "start_activity") {
      return await startActivity(user, args.activity, { minutesAgo: args.minutes_ago, note: args.note });
    }

    if (name === "stop_activity") {
      return await stopActivity(user, args.activity, { minutesAgo: args.minutes_ago });
    }

    if (name === "log_activity") {
      return await logActivity(user, args.activity, args.duration_minutes, { minutesAgo: args.minutes_ago });
    }

    if (name === "list_activities") {
      const running = await getRunning(user.id);
      return {
        known: await listKnownActivities(user.id),
        running: running.map((r) => ({ activity: r.activity, since_msk: formatLocalHuman(r.started_at) }))
      };
    }

    return { error: "unknown tool" };
  } catch (e) {
    console.error(`runTool[${name}] failed:`, e.message);
    return { error: `Ошибка при выполнении: ${e.message}` };
  }
}

export async function askQwen(user, userMessage) {
  await db.from("ai_chat_history").insert({ user_id: user.id, role: "user", content: userMessage });

  const { data: history } = await db
    .from("ai_chat_history")
    .select("role, content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: kb } = await db
    .from("knowledge_base")
    .select("content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const kbBlock = kb?.length
    ? "\n\nБаза знаний о пользователе и его проекте (используй как контекст):\n" +
      kb.map((k) => `- ${k.content}`).join("\n")
    : "";

  const knownActivities = await listKnownActivities(user.id);
  const runningNow = await getRunning(user.id);
  const activityBlock =
    "\n\nУчёт времени: когда пользователь говорит, что начал/зашёл/приступил к делу — вызови start_activity; " +
    "когда закончил/вышел/ушёл/всё — stop_activity; если назвал уже прошедшее дело с длительностью — log_activity. " +
    "Название активности — короткая обобщённая категория с заглавной буквы («Спорт», «Работа», «Чтение», «Сон»). " +
    "Разные формулировки одного смысла — ОДНА активность: «зашёл в зал», «пошёл на тренировку», «начал " +
    "заниматься спортом» = «Спорт». Сначала сверяйся со списком известных активностей и, если дело подходит " +
    "по смыслу, используй именно это название, а не выдумывай новое. После остановки сообщи, сколько времени " +
    "зафиксировано.\n" +
    `Известные активности: ${knownActivities.length ? knownActivities.join(", ") : "пока нет"}.\n` +
    `Сейчас запущены: ${
      runningNow.length
        ? runningNow.map((r) => `${r.activity} (с ${formatLocalHuman(r.started_at)} МСК)`).join(", ")
        : "ничего"
    }.`;

  const messages = [
    {
      role: "system",
      content:
        "Ты — деловой AI-ассистент внутри Telegram MiniApp для управления бизнес-целями, привычками, " +
        "питанием, напоминаниями и контактами пользователя. У тебя есть полный набор функций, которые " +
        "дают реальный доступ ко всем данным пользователя: обычные цели и цели дня (создание, " +
        "изменение, прогресс, закрытие, удаление), связи между целями дня и обычными целями, " +
        "контакты, напоминания, профиль питания и трекер еды, база знаний, учёт времени по делам, а также итоги за " +
        "месяц/год. Когда пользователь просит что-то сделать с этими данными — вызывай " +
        "соответствующую функцию, а не описывай действие словами. Если пользователь рассказывает " +
        "что-то важное и долгосрочное о себе, бизнесе или проекте — сохрани через save_knowledge. " +
        "Сообщения могут приходить из распознанной речи — возможны неточности в словах, трактуй по смыслу." +
        kbBlock +
        activityBlock
    },
    ...history.reverse().map((h) => ({ role: h.role, content: h.content }))
  ];

  let response = await callQwen(messages, { timeoutMs: QWEN_CHAT_TIMEOUT_MS });
  let choice = response.choices[0];

  while (choice.finish_reason === "tool_calls") {
    messages.push(choice.message);
    for (const call of choice.message.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      const result = await runTool(user, call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
    response = await callQwen(messages, { timeoutMs: QWEN_CHAT_TIMEOUT_MS });
    choice = response.choices[0];
  }

  const finalText = choice.message.content;
  await db.from("ai_chat_history").insert({ user_id: user.id, role: "assistant", content: finalText });
  return finalText;
}

export async function askQwenRaw(systemPrompt, userPrompt, options = {}) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
  const response = await callQwen(messages, {
    toolsOverride: [],
    toolChoiceOverride: "none",
    responseFormat: options.jsonMode ? { type: "json_object" } : undefined,
    modelOverride: options.model || QWEN_FAST_MODEL
  });
  const choice = response.choices[0];
  return choice.message.content;
}

async function callQwen(messages, options = {}) {
  const {
    toolsOverride = tools,
    toolChoiceOverride = "auto",
    responseFormat,
    modelOverride = QWEN_MODEL,
    timeoutMs = QWEN_TIMEOUT_MS
  } = options;

  return callLLM(messages, {
    tools: toolsOverride,
    toolChoice: toolChoiceOverride,
    responseFormat,
    timeoutMs,
    models: { qwen: modelOverride }
  });
}
