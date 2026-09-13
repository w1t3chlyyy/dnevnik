import { supabaseAdmin as db } from "./supabase";
import { computeNutritionTargets, estimateFoodMacros, getTodayTotals } from "./nutrition";
import { parseHHMM, nextOccurrenceUtcIso, formatLocalHuman, localDateStr } from "./time";
import { propagateDailyCompletion } from "./goalLinks";
import { buildSummary } from "./summary";

const QWEN_API_URL = process.env.QWEN_API_URL;
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
      description: "Удалить обычную цель по названию",
      parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] }
    }
  },
  {
    type: "function",
    function: {
      name: "update_goal_progress",
      description: "Добавить значение прогресса к существующей обычной цели по её названию",
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
      description: "Создать цель на сегодняшний день",
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
      description: "Добавить прогресс к сегодняшней цели дня по названию",
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
      description: "Получить итоги за месяц или год со сравнением с предыдущим периодом",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: ["month", "year"] } },
        required: ["period"]
      }
    }
  }
];

async function sumGoalProgress(goalId) {
  const { data: rows } = await db.from("goal_progress").select("value").eq("goal_id", goalId);
  return (rows || []).reduce((s, r) => s + Number(r.value), 0);
}

async function applyGoalProgress(goal, value, note) {
  await db.from("goal_progress").insert({ goal_id: goal.id, value, note });
  const total = await sumGoalProgress(goal.id);
  const completed = total >= Number(goal.target_value);
  const patch = { current_value: total, status: completed ? "done" : "active" };
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
      const { data: goal } = await db
        .from("goals")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_daily", false)
        .ilike("title", args.title)
        .maybeSingle();
      if (!goal) return { error: "Цель не найдена" };
      await db.from("goals").delete().eq("id", goal.id);
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
        .eq("is_daily", false);
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

      const outcome = args.outcome === "failed" ? "failed" : "done";
      const patch = { status: outcome };
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
        .select("daily_title, multiplier, goals:parent_goal_id(title)")
        .eq("user_id", user.id);
      return { links: data };
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

  const messages = [
    {
      role: "system",
      content:
        "Ты — деловой AI-ассистент внутри Telegram MiniApp для управления бизнес-целями, привычками, " +
        "питанием, напоминаниями и контактами пользователя. У тебя есть полный набор функций, которые " +
        "дают реальный доступ ко всем данным пользователя: обычные цели и цели дня (создание, " +
        "изменение, прогресс, закрытие, удаление), связи между целями дня и обычными целями, " +
        "контакты, напоминания, профиль питания и трекер еды, база знаний, а также итоги за " +
        "месяц/год. Когда пользователь просит что-то сделать с этими данными — вызывай " +
        "соответствующую функцию, а не описывай действие словами. Если пользователь рассказывает " +
        "что-то важное и долгосрочное о себе, бизнесе или проекте — сохрани через save_knowledge." +
        kbBlock
    },
    ...history.reverse().map((h) => ({ role: h.role, content: h.content }))
  ];

  // Один повтор при таймауте/сбое сети — до того, как показать ошибку пользователю.
  async function callWithRetry(msgs) {
    try {
      return await callQwen(msgs, { timeoutMs: QWEN_CHAT_TIMEOUT_MS });
    } catch (e) {
      console.error("askQwen: первая попытка не удалась, пробую ещё раз:", e.message);
      return await callQwen(msgs, { timeoutMs: QWEN_CHAT_TIMEOUT_MS });
    }
  }

  let response = await callWithRetry(messages);
  let choice = response.choices[0];

  while (choice.finish_reason === "tool_calls") {
    messages.push(choice.message);
    for (const call of choice.message.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      const result = await runTool(user, call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
    response = await callWithRetry(messages);
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

  if (!QWEN_API_URL || !process.env.QWEN_API_KEY) {
    throw new Error(
      "Не заданы QWEN_API_URL и/или QWEN_API_KEY в переменных окружения Vercel. " +
        "Добавь их в Settings -> Environment Variables и сделай Redeploy."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = Date.now();
  let res;
  try {
    const body = { model: modelOverride, messages };
    if (toolsOverride.length) {
      body.tools = toolsOverride;
      body.tool_choice = toolChoiceOverride;
    }
    if (responseFormat) body.response_format = responseFormat;

    res = await fetch(QWEN_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.QWEN_API_KEY}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    const elapsed = Date.now() - startedAt;
    if (e.name === "AbortError") {
      console.error(`[qwen] timeout after ${elapsed}ms (model=${modelOverride}, json=${!!responseFormat})`);
      throw new Error(`Qwen API не ответил за ${timeoutMs / 1000} секунд (таймаут).`);
    }
    console.error(`[qwen] fetch failed after ${elapsed}ms: ${e.message}`);
    throw new Error(`Не удалось связаться с Qwen API: ${e.message}`);
  } finally {
    clearTimeout(timeout);
  }

  console.log(
    `[qwen] ok in ${Date.now() - startedAt}ms (model=${modelOverride}, json=${!!responseFormat}, status=${res.status})`
  );

  const rawText = await res.text();
  let data;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new Error(`Qwen API вернул не-JSON (status ${res.status}): ${rawText.slice(0, 300)}`);
  }

  if (!res.ok || !data || !data.choices) {
    throw new Error(`Qwen API вернул ошибку (status ${res.status}): ${JSON.stringify(data || rawText).slice(0, 300)}`);
  }

  return data;
}
