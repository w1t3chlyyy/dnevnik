import { Bot, session, InlineKeyboard } from "grammy";
import { supabaseAdmin as db } from "./supabase";
import { uploadToDrive } from "./googleDrive";
import { askQwen } from "./qwen";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

const MINIAPP_URL = process.env.MINIAPP_URL; // https://your-app.vercel.app

bot.use(
  session({
    initial: () => ({ step: null, draft: {} }),
    storage: {
      // Supabase как внешнее хранилище сессий — необходимо, т.к. Vercel
      // serverless не гарантирует, что два подряд идущих сообщения
      // обработает один и тот же процесс с общей оперативной памятью.
      // Обёрнуто в try/catch: сбой БД не должен ронять весь webhook.
      read: async (key) => {
        try {
          const { data, error } = await db
            .from("bot_sessions")
            .select("data")
            .eq("key", key)
            .maybeSingle();
          if (error) throw error;
          return data?.data;
        } catch (e) {
          console.error("session read failed:", e.message);
          return undefined;
        }
      },
      write: async (key, value) => {
        try {
          const { error } = await db
            .from("bot_sessions")
            .upsert({ key, data: value, updated_at: new Date() });
          if (error) throw error;
        } catch (e) {
          console.error("session write failed:", e.message);
        }
      },
      delete: async (key) => {
        try {
          await db.from("bot_sessions").delete().eq("key", key);
        } catch (e) {
          console.error("session delete failed:", e.message);
        }
      }
    }
  })
);

// ---------- helpers ----------
async function getOrCreateUser(ctx) {
  const tg = ctx.from;
  try {
    let { data: user, error } = await db
      .from("users")
      .select("*")
      .eq("telegram_id", tg.id)
      .maybeSingle();
    if (error) throw error;

    if (!user) {
      const { data, error: insertError } = await db
        .from("users")
        .insert({ telegram_id: tg.id, username: tg.username, first_name: tg.first_name })
        .select()
        .single();
      if (insertError) throw insertError;
      user = data;
    }
    return user;
  } catch (e) {
    console.error("getOrCreateUser failed:", e.message || e);
    throw new Error(
      "Не удалось связаться с базой данных (Supabase). Проверь SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY."
    );
  }
}

// ---------- /start ----------
bot.command("start", async (ctx) => {
  const kb = new InlineKeyboard().webApp("📊 Открыть панель", MINIAPP_URL);
  await ctx.reply(
    "Бизнес-ассистент готов к работе.\n\n" +
      "/goal — новая цель\n" +
      "/progress — отметить прогресс\n" +
      "/contact @username Подпись — добавить контакт\n" +
      "/remind — настроить напоминание\n" +
      "/ai — спросить AI\n\n" +
      "Просто пришли фото/видео/файл — я загружу его в твой Google Drive.",
    { reply_markup: kb }
  );
});

// ---------- Цели ----------
bot.command("goal", async (ctx) => {
  ctx.session.step = "goal_title";
  ctx.session.draft = {};
  await ctx.reply("Название цели?");
});

bot.command("progress", async (ctx) => {
  const user = await getOrCreateUser(ctx);
  const { data: goals } = await db
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!goals?.length) return ctx.reply("Активных целей нет. Создай через /goal");

  const kb = new InlineKeyboard();
  goals.forEach((g) => kb.text(g.title, `progress:${g.id}`).row());
  await ctx.reply("По какой цели отметить прогресс?", { reply_markup: kb });
});

bot.callbackQuery(/^progress:(.+)/, async (ctx) => {
  ctx.session.step = "progress_value";
  ctx.session.draft = { goal_id: ctx.match[1] };
  await ctx.answerCallbackQuery();
  await ctx.reply("Какое значение добавить? (число)");
});

// ---------- Контакты: @username + подпись одним сообщением ----------
bot.command("contact", async (ctx) => {
  const text = ctx.match?.trim();
  if (!text || !text.startsWith("@")) {
    return ctx.reply("Формат: /contact @username Подпись/описание");
  }
  const [handle, ...rest] = text.split(" ");
  const user = await getOrCreateUser(ctx);
  await db.from("contacts").insert({
    user_id: user.id,
    telegram_username: handle.replace("@", ""),
    label: rest.join(" ") || null
  });
  await ctx.reply(`Контакт ${handle} сохранён в разделе «Контакты» панели.`);
});

// Также ловим просто "@username подпись" без команды — быстрее в бою
bot.hears(/^@[\w_]+\s+.+/, async (ctx) => {
  const [handle, ...rest] = ctx.message.text.trim().split(" ");
  const user = await getOrCreateUser(ctx);
  await db.from("contacts").insert({
    user_id: user.id,
    telegram_username: handle.replace("@", ""),
    label: rest.join(" ")
  });
  await ctx.reply(`Добавлено: ${handle} — «${rest.join(" ")}»`);
});

// ---------- Напоминания ----------
bot.command("remind", async (ctx) => {
  ctx.session.step = "remind_time";
  await ctx.reply("В какое время каждый день напоминать о целях? Формат ЧЧ:ММ (напр. 09:00)");
});

// ---------- Файлы -> Google Drive ----------
bot.on(["message:photo", "message:video", "message:document"], async (ctx) => {
  const user = await getOrCreateUser(ctx);
  if (!user.google_refresh_token) {
    return ctx.reply(
      "Google Drive ещё не подключён. Открой панель → Настройки → «Подключить Drive»."
    );
  }
  await ctx.reply("Загружаю файл на Drive…");
  const file = await ctx.getFile();
  const result = await uploadToDrive(user, file, ctx.message);
  await ctx.reply(`Готово ✅\n${result.link}`);
});

// ---------- AI (Qwen) ----------
bot.command("ai", async (ctx) => {
  ctx.session.step = "ai_chat";
  await ctx.reply("Слушаю. Спроси что угодно про твои цели, или попроси что-то изменить.");
});

// ---------- Универсальный обработчик текстового ввода (машина состояний) ----------
bot.on("message:text", async (ctx) => {
  const step = ctx.session.step;
  const user = await getOrCreateUser(ctx);

  if (step === "goal_title") {
    ctx.session.draft.title = ctx.message.text;
    ctx.session.step = "goal_target";
    return ctx.reply("Целевое значение (число)? Например: 1000000");
  }

  if (step === "goal_target") {
    ctx.session.draft.target_value = Number(ctx.message.text.replace(",", "."));
    ctx.session.step = "goal_unit";
    return ctx.reply("Единица измерения? (руб / клиенты / % / шт)");
  }

  if (step === "goal_unit") {
    ctx.session.draft.metric_unit = ctx.message.text;
    ctx.session.step = "goal_deadline";
    return ctx.reply("Дедлайн в формате ГГГГ-ММ-ДД (или «-» если без срока)");
  }

  if (step === "goal_deadline") {
    const deadline = ctx.message.text === "-" ? null : ctx.message.text;
    await db.from("goals").insert({
      user_id: user.id,
      title: ctx.session.draft.title,
      target_value: ctx.session.draft.target_value,
      metric_unit: ctx.session.draft.metric_unit,
      deadline
    });
    ctx.session.step = null;
    return ctx.reply("Цель создана 🎯 Смотри в панели → Цели / Диаграммы.");
  }

  if (step === "progress_value") {
    const value = Number(ctx.message.text.replace(",", "."));
    const goalId = ctx.session.draft.goal_id;
    await db.from("goal_progress").insert({ goal_id: goalId, value });

    const { data: progressRows } = await db
      .from("goal_progress")
      .select("value")
      .eq("goal_id", goalId);
    const total = progressRows.reduce((s, r) => s + Number(r.value), 0);
    await db.from("goals").update({ current_value: total }).eq("id", goalId);

    ctx.session.step = null;
    return ctx.reply(`Записано. Текущий прогресс: ${total}`);
  }

  if (step === "remind_time") {
    await db.from("reminders").insert({
      user_id: user.id,
      cron_time: ctx.message.text,
      message: "Как продвигаются твои цели сегодня?"
    });
    ctx.session.step = null;
    return ctx.reply("Напоминание настроено ⏰");
  }

  if (step === "ai_chat") {
    const reply = await askQwen(user, ctx.message.text);
    return ctx.reply(reply);
  }

  // fallback — короткая помощь
  return ctx.reply("Не понял команду. /start покажет список действий.");
});

export default bot;

// Глобальный перехват ошибок: без этого любой сбой (например, не заданная
// переменная окружения или таймаут внешнего API) роняет весь webhook.
// С этим — пользователь просто увидит вежливое сообщение, а вы — лог с деталями.
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Ошибка при обработке апдейта ${ctx.update.update_id}:`, err.error);
  ctx
    .reply("Что-то пошло не так на моей стороне. Попробуй ещё раз через минуту.")
    .catch((e) => console.error("Не удалось отправить сообщение об ошибке:", e));
});
