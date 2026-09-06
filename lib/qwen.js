import { supabaseAdmin as db } from "./supabase";

// Dedicated workspace endpoint (Model Studio -> API References -> OpenAI compatible - Chat).
// Пример: https://ws-xxxxxxxx.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions
const QWEN_API_URL = process.env.QWEN_API_URL;
const QWEN_MODEL = process.env.QWEN_MODEL || "qwen3.8-flash";

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

  const messages = [
    {
      role: "system",
      content:
        "Ты — деловой AI-ассистент внутри Telegram MiniApp для управления бизнес-целями. " +
        "Отвечай кратко и по делу. Когда пользователь просит создать/изменить цель или " +
        "отметить прогресс — используй функции, а не просто описывай это словами."
    },
    ...history.reverse().map((h) => ({ role: h.role, content: h.content }))
  ];

  let response = await callQwen(messages);
  if (!response.choices) {
    throw new Error(
      `Qwen API вернул ошибку: ${JSON.stringify(response.error || response)}`
    );
  }
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
    if (!response.choices) {
      throw new Error(
        `Qwen API вернул ошибку: ${JSON.stringify(response.error || response)}`
      );
    }
    choice = response.choices[0];
  }

  const finalText = choice.message.content;
  await db
    .from("ai_chat_history")
    .insert({ user_id: user.id, role: "assistant", content: finalText });

  return finalText;
}

async function callQwen(messages) {
  if (!QWEN_API_URL || !process.env.QWEN_API_KEY) {
    throw new Error(
      "Не заданы QWEN_API_URL и/или QWEN_API_KEY в переменных окружения Vercel. " +
        "Добавь их в Settings -> Environment Variables и сделай Redeploy."
    );
  }

  const res = await fetch(QWEN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.QWEN_API_KEY}`
    },
    body: JSON.stringify({
      model: QWEN_MODEL,
      messages,
      tools,
      tool_choice: "auto"
    })
  });
  return res.json();
}
