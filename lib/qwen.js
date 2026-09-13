import { supabaseAdmin as db } from "./supabase";

// Dedicated workspace endpoint (Model Studio -> API References -> OpenAI compatible - Chat).
// Пример: https://ws-xxxxxxxx.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions
const QWEN_API_URL = process.env.QWEN_API_URL;
const QWEN_MODEL = process.env.QWEN_MODEL || "qwen3.7-plus";

// Инструменты, которые AI может вызывать сам — это и есть "AI может редактировать MiniApp"
const tools = [
  {
    type: "function",
    function: {
      name: "create_goal",
      description: "Создать новую бизнес-цель пользователя",
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
      name: "update_goal_progress",
      description: "Добавить значение прогресса к существующей цели по её названию",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          value: { type: "number" }
        },
        required: ["title", "value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_goals",
      description: "Получить список целей пользователя с текущим прогрессом",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "save_knowledge",
      description:
        "Сохранить важный долгосрочный факт о пользователе, его бизнесе или проекте в базу знаний, " +
        "чтобы использовать его в будущих ответах (например, детали проекта, для которого потом просят контент-план).",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Факт в свободной форме, по-русски" }
        },
        required: ["content"]
      }
    }
  }
];

async function runTool(user, name, args) {
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

  if (name === "update_goal_progress") {
    const { data: goal } = await db
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .ilike("title", args.title)
      .maybeSingle();
    if (!goal) return { error: "Цель не найдена" };

    await db.from("goal_progress").insert({ goal_id: goal.id, value: args.value });
    return { ok: true };
  }

  if (name === "list_goals") {
    const { data } = await db.from("goals").select("*").eq("user_id", user.id);
    return { goals: data };
  }

  if (name === "save_knowledge") {
    await db.from("knowledge_base").insert({ user_id: user.id, content: args.content });
    return { ok: true };
  }

  return { error: "unknown tool" };
}

export async function askQwen(user, userMessage) {
  await db
    .from("ai_chat_history")
    .insert({ user_id: user.id, role: "user", content: userMessage });

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
    ? "\n\nБаза знаний о пользователе и его проекте (используй как контекст, не пересказывай " +
      "дословно без необходимости):\n" +
      kb.map((k) => `- ${k.content}`).join("\n")
    : "";

  const messages = [
    {
      role: "system",
      content:
        "Ты — деловой AI-ассистент внутри Telegram MiniApp для управления бизнес-целями. " +
        "Отвечай кратко и по делу. Когда пользователь просит создать/изменить цель или " +
        "отметить прогресс — используй функции, а не просто описывай это словами. " +
        "Если пользователь рассказывает что-то важное и долгосрочное о себе, бизнесе или " +
        "проекте (не разовую мелочь) — сохрани это через save_knowledge, чтобы не забыть, " +
        "и используй эту базу знаний, когда просят что-то в тему проекта (например, контент-план)." +
        kbBlock
    },
    ...history.reverse().map((h) => ({ role: h.role, content: h.content }))
  ];

  let response = await callQwen(messages);
  let choice = response.choices[0];

  // Обработка вызовов функций (AI редактирует данные в MiniApp)
  while (choice.finish_reason === "tool_calls") {
    messages.push(choice.message);
    for (const call of choice.message.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      const result = await runTool(user, call.function.name, args);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });
    }
    response = await callQwen(messages);
    choice = response.choices[0];
  }

  const finalText = choice.message.content;
  await db
    .from("ai_chat_history")
    .insert({ user_id: user.id, role: "assistant", content: finalText });

  return finalText;
}

// Облегчённый вызов Qwen БЕЗ истории чата, базы знаний и function calling — привет
// для внутренних технических задач вроде разбора текста в структурированные
// данные (например, расчёт КБЖУ по описанию еды). Ничего не пишет в
// ai_chat_history, поэтому не засоряет диалог с AI-ассистентом и не тянет
// за собой лишние запросы к Supabase — меньше суммарная задержка запроса.
//
// options.jsonMode === true включает response_format: { type: "json_object" },
// чтобы модель возвращала строгий JSON (поддержано OpenAI-совместимым
// эндпоинтом DashScope для части моделей Qwen).
export async function askQwenRaw(systemPrompt, userPrompt, options = {}) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
  const response = await callQwen(messages, {
    toolsOverride: [],
    toolChoiceOverride: "none",
    responseFormat: options.jsonMode ? { type: "json_object" } : undefined
  });
  const choice = response.choices[0];
  return choice.message.content;
}

async function callQwen(messages, options = {}) {
  const {
    toolsOverride = tools,
    toolChoiceOverride = "auto",
    responseFormat
  } = options;

  if (!QWEN_API_URL || !process.env.QWEN_API_KEY) {
    throw new Error(
      "Не заданы QWEN_API_URL и/или QWEN_API_KEY в переменных окружения Vercel. " +
        "Добавь их в Settings -> Environment Variables и сделай Redeploy."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let res;
  try {
    const body = { model: QWEN_MODEL, messages };
    if (toolsOverride.length) {
      body.tools = toolsOverride;
      body.tool_choice = toolChoiceOverride;
    }
    // response_format: json_object поддержан OpenAI-совместимым режимом DashScope
    // для части моделей Qwen — просим модель структурно, а не только промптом.
    if (responseFormat) body.response_format = responseFormat;

    res = await fetch(QWEN_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.QWEN_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("Qwen API не ответил за 20 секунд (таймаут). Проверь QWEN_API_URL.");
    }
    throw new Error(`Не удалось связаться с Qwen API: ${e.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const rawText = await res.text();
  let data;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new Error(`Qwen API вернул не-JSON (status ${res.status}): ${rawText.slice(0, 300)}`);
  }

  if (!res.ok || !data || !data.choices) {
    throw new Error(
      `Qwen API вернул ошибку (status ${res.status}): ${JSON.stringify(data || rawText).slice(0, 300)}`
    );
  }

  return data;
}
