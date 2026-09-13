import { Bot, session, InlineKeyboard } from "grammy";
import { supabaseAdmin as db, withSupabaseRetry } from "./supabase";
import { uploadToDrive, getGoogleAuthUrl, disconnectDrive } from "./googleDrive";
import { askQwen } from "./qwen";
import { parseHHMM, nextOccurrenceUtcIso, formatLocalHuman, localDateStr } from "./time";
import { computeNutritionTargets, estimateFoodMacros, getTodayTotals, mealLabel } from "./nutrition";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

const MINIAPP_URL = process.env.MINIAPP_URL; // https://your-app.vercel.app

// Показываем в "/" меню Telegram — не критично, но раз уж наводим порядок в командах.
bot.api
  .setMyCommands([
    { command: "start", description: "Открыть меню" },
    { command: "goal", description: "Новая цель" },
    { command: "progress", description: "Отметить прогресс" },
    { command: "dailygoal", description: "Цель на сегодня" },
    { command: "nutrition", description: "Трекер питания" },
    { command: "contact", description: "Добавить контакт" },
    { command: "remind", description: "Напоминания" },
    { command: "note", description: "Запомнить факт в базе знаний" },
    { command: "ai", description: "Спросить AI" },
    { command: "settings", description: "Настройки" }
  ])
  .catch((e) => console.error("setMyCommands failed:", e.message));

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

// Раньше ошибки Supabase при insert/update просто игнорировались (клиент не
// кидает исключение, а возвращает {data, error}), из-за чего бот мог
// подтвердить сохранение, которого на самом деле не произошло. Теперь любой
// insert/update явно проверяется через эту функцию.
async function reportDbError(ctx, error, label) {
  if (!error) return false;
  console.error(`Supabase error [${label}]:`, error.message, error.details || "");
  await ctx.reply(
    `Не получилось сохранить (${label}): ${error.message}\n\n` +
      "Это ошибка базы данных — проверь миграцию/переменные окружения. Попробуй ещё раз.",
    { reply_markup: backToMenuKb() }
  );
  return true;
}

function mainMenu() {
  const kb = new InlineKeyboard()
    .text("🎯 Цель", "menu:goal")
    .text("📈 Прогресс", "menu:progress")
    .row()
    .text("☀️ Цель на сегодня", "daily_goal:new")
    .row()
    .text("🍽 Питание", "menu:nutrition")
    .row()
    .text("👤 Контакт", "menu:contact")
    .text("⏰ Напоминания", "menu:remind")
    .row()
    .text("🧠 База знаний", "menu:kb")
    .text("🤖 Спросить AI", "menu:ai")
    .row()
    .text("⚙️ Настройки", "menu:settings");
  if (MINIAPP_URL) kb.row().webApp("📊 Открыть панель", MINIAPP_URL);
  return kb;
}

// Маленькая кнопка "в меню", чтобы после любого действия не нужно было
// вспоминать команду — можно просто ткнуть.
function backToMenuKb() {
  return new InlineKeyboard().text("🏠 Меню", "menu:home");
}

async function sendMainMenu(ctx) {
  await ctx.reply(
    "Бизнес-ассистент готов к работе. Выбери действие в меню ниже 👇\n\n" +
      "(команды вроде /goal, /remind тоже по-прежнему работают, если так привычнее)\n\n" +
      "Просто пришли фото/видео/файл — я загружу его в твой Google Drive.",
    { reply_markup: mainMenu() }
  );
}

// ---------- /start ----------
bot.command("start", sendMainMenu);
bot.command("menu", sendMainMenu);
bot.callbackQuery("menu:home", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendMainMenu(ctx);
});

// ---------- Настройки / Google Drive ----------
async function showSettings(ctx) {
  const user = await getOrCreateUser(ctx);
  const kb = new InlineKeyboard();

  if (user.google_refresh_token) {
    kb.text("🔌 Отключить Google Drive", "drive:disconnect").row();
    if (MINIAPP_URL) kb.webApp("📊 Открыть панель", MINIAPP_URL).row();
    kb.text("🏠 Меню", "menu:home");
    return ctx.reply("Настройки\n\nGoogle Drive: подключён ✅", { reply_markup: kb });
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) {
    return ctx.reply(
      "Настройки\n\nGoogle Drive: не настроен на сервере (нет GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI в переменных окружения).",
      { reply_markup: backToMenuKb() }
    );
  }

  const authUrl = getGoogleAuthUrl(ctx.from.id);
  kb.url("🔗 Подключить Google Drive", authUrl).row();
  if (MINIAPP_URL) kb.webApp("📊 Открыть панель", MINIAPP_URL).row();
  kb.text("🏠 Меню", "menu:home");

  await ctx.reply(
    "Настройки\n\nGoogle Drive: не подключён.\n\n" +
      "Нажми кнопку ниже. Если Telegram откроет ссылку во встроенном браузере и Google " +
      "пожалуется на него — скопируй ссылку и открой в обычном браузере телефона:\n\n" +
      authUrl,
    { reply_markup: kb }
  );
}
bot.command("settings", showSettings);
bot.callbackQuery("menu:settings", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSettings(ctx);
});

bot.callbackQuery("drive:disconnect", async (ctx) => {
  await disconnectDrive(ctx.from.id);
  await ctx.answerCallbackQuery({ text: "Google Drive отключён" });
  await ctx.editMessageText("Google Drive отключён. Открой настройки, чтобы подключить снова.");
});

// ---------- Цели ----------
async function startGoalFlow(ctx) {
  ctx.session.step = "goal_title";
  ctx.session.draft = {};
  await ctx.reply("Название цели?");
}
bot.command("goal", startGoalFlow);
bot.callbackQuery("menu:goal", async (ctx) => {
  await ctx.answerCallbackQuery();
  await startGoalFlow(ctx);
});

async function startProgressFlow(ctx) {
  const user = await getOrCreateUser(ctx);
  const { data: goals } = await db
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("is_daily", false);

  if (!goals?.length) {
    return ctx.reply("Активных целей нет. Создай через «🎯 Цель».", {
      reply_markup: backToMenuKb()
    });
  }

  const kb = new InlineKeyboard();
  goals.forEach((g) => kb.text(g.title, `progress:${g.id}`).row());
  kb.text("🏠 Меню", "menu:home");
  await ctx.reply("По какой цели отметить прогресс?", { reply_markup: kb });
}
bot.command("progress", startProgressFlow);
bot.callbackQuery("menu:progress", async (ctx) => {
  await ctx.answerCallbackQuery();
  await startProgressFlow(ctx);
});

bot.callbackQuery(/^progress:(.+)/, async (ctx) => {
  ctx.session.step = "progress_value";
  ctx.session.draft = { goal_id: ctx.match[1] };
  await ctx.answerCallbackQuery();
  await ctx.reply("Какое значение добавить? (число)");
});

// ---------- Дневные цели ("цель на сегодня") ----------
// Можно создавать сколько угодно целей за один день — каждая сохраняется
// отдельной строкой goals с is_daily=true и goal_date=сегодня. Отдельных
// графиков по ним нет — только общий агрегированный (см. /api/goals/daily),
// поэтому в списке "Цели" мини-аппа они не показываются.
async function startDailyGoalFlow(ctx) {
  ctx.session.step = "dgoal_title";
  ctx.session.draft = { is_daily: true };
  await ctx.reply("Какую цель поставишь на сегодня?");
}
bot.command("dailygoal", startDailyGoalFlow);
bot.callbackQuery("daily_goal:new", async (ctx) => {
  await ctx.answerCallbackQuery();
  await startDailyGoalFlow(ctx);
});

bot.callbackQuery(/^dgoal_progress:(.+)/, async (ctx) => {
  ctx.session.step = "dgoal_progress_value";
  ctx.session.draft = { goal_id: ctx.match[1] };
  await ctx.answerCallbackQuery();
  await ctx.reply("Какое значение добавить?");
});

bot.callbackQuery(/^dgoal_close:(done|failed):(.+)/, async (ctx) => {
  const [, outcome, goalId] = ctx.match;
  const { error } = await db.from("goals").update({ status: outcome }).eq("id", goalId);
  await ctx.answerCallbackQuery({ text: outcome === "done" ? "Отмечено ✅" : "Закрыто" });
  try {
    await ctx.editMessageReplyMarkup();
  } catch {
    // сообщение могло быть уже отредактировано ранее — не критично
  }
  if (error) return;
  await ctx.reply(
    outcome === "done" ? "Отлично, цель дня выполнена ✅" : "Хорошо, закрыл эту цель без выполнения."
  );
});

// ---------- Трекер питания ----------
// Профиль (вес/рост/возраст/пол/активность/цель) хранится в
// nutrition_profiles, каждый приём пищи — отдельная строка в food_logs с
// уже посчитанными калориями/белками/жирами/углеводами. Расчёт КБЖУ по
// текстовому описанию делает Qwen (estimateFoodMacros, облегчённый вызов
// без истории чата); функция сама делает ретраи и в крайнем случае
// возвращает локальную эвристику — поэтому ручного ввода чисел от
// пользователя мы больше не просим. Записи в food_logs/nutrition_profiles
// идут через withSupabaseRetry — спасает от разовых Gateway Timeout на
// стороне Supabase (например, при пробуждении бесплатного проекта после
// паузы).
function nutritionMenu() {
  return new InlineKeyboard()
    .text("🍽 Добавить приём пищи", "food:new")
    .row()
    .text("📊 Сводка за сегодня", "nutrition:today")
    .row()
    .text("⚙️ Настроить профиль", "nutrition:setup")
    .row()
    .text("🏠 Меню", "menu:home");
}
async function showNutritionMenu(ctx) {
  await ctx.reply("Трекер питания 🍽\n\nВыбери действие:", { reply_markup: nutritionMenu() });
}
bot.command("nutrition", showNutritionMenu);
bot.callbackQuery("menu:nutrition", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showNutritionMenu(ctx);
});

// -- настройка профиля --
bot.callbackQuery("nutrition:setup", async (ctx) => {
  ctx.session.step = "nutr_weight";
  ctx.session.draft = {};
  await ctx.answerCallbackQuery();
  await ctx.reply("Твой текущий вес в кг? (например 78)");
});

bot.callbackQuery(/^nutr_gender:(male|female)/, async (ctx) => {
  ctx.session.draft.gender = ctx.match[1];
  ctx.session.step = "nutr_activity";
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text("Мало/сидячий", "nutr_activity:sedentary")
    .row()
    .text("Лёгкая активность", "nutr_activity:light")
    .row()
    .text("Средняя активность", "nutr_activity:moderate")
    .row()
    .text("Высокая активность", "nutr_activity:active")
    .row()
    .text("Очень высокая", "nutr_activity:very_active");
  await ctx.reply("Уровень активности?", { reply_markup: kb });
});

bot.callbackQuery(/^nutr_activity:(sedentary|light|moderate|active|very_active)/, async (ctx) => {
  ctx.session.draft.activity_level = ctx.match[1];
  ctx.session.step = "nutr_goal";
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text("📉 Похудение", "nutr_goal:lose")
    .text("⚖️ Поддержание", "nutr_goal:maintain")
    .text("📈 Набор массы", "nutr_goal:gain");
  await ctx.reply("Какая цель по весу?", { reply_markup: kb });
});

bot.callbackQuery(/^nutr_goal:(lose|maintain|gain)/, async (ctx) => {
  ctx.session.draft.goal = ctx.match[1];
  const user = await getOrCreateUser(ctx);
  const profile = { ...ctx.session.draft };
  const targets = computeNutritionTargets(profile);

  const { error } = await withSupabaseRetry(() =>
    db.from("nutrition_profiles").upsert({
      user_id: user.id,
      weight_kg: profile.weight_kg,
      height_cm: profile.height_cm,
      age: profile.age,
      gender: profile.gender,
      activity_level: profile.activity_level,
      goal: profile.goal,
      ...targets,
      updated_at: new Date()
    })
  );

  await ctx.answerCallbackQuery();
  if (await reportDbError(ctx, error, "nutrition_profiles")) return;

  ctx.session.step = null;
  const goalLabel = { lose: "похудение", maintain: "поддержание веса", gain: "набор массы" }[profile.goal];
  await ctx.reply(
    `Профиль сохранён ✅\nЦель: ${goalLabel}\n\n` +
      `Дневная норма:\n🔥 ${targets.target_calories} ккал\n🥩 Белки: ${targets.target_protein} г\n` +
      `🥑 Жиры: ${targets.target_fat} г\n🍞 Углеводы: ${targets.target_carbs} г`,
    { reply_markup: backToMenuKb() }
  );
});

// -- сводка за сегодня --
bot.callbackQuery("nutrition:today", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(ctx);
  const totals = await getTodayTotals(user.id);
  const { data: profile } = await db
    .from("nutrition_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return ctx.reply("Сначала настрой профиль питания, чтобы видеть норму.", {
      reply_markup: nutritionMenu()
    });
  }

  const remain = Math.max(0, profile.target_calories - totals.calories);
  await ctx.reply(
    `Сегодня:\n🔥 ${Math.round(totals.calories)} / ${profile.target_calories} ккал (осталось ${Math.round(remain)})\n` +
      `🥩 Белки: ${Math.round(totals.protein)} / ${profile.target_protein} г\n` +
      `🥑 Жиры: ${Math.round(totals.fat)} / ${profile.target_fat} г\n` +
      `🍞 Углеводы: ${Math.round(totals.carbs)} / ${profile.target_carbs} г`,
    { reply_markup: backToMenuKb() }
  );
});

// -- добавление приёма пищи --
async function askMealType(ctx) {
  const kb = new InlineKeyboard()
    .text("🍳 Завтрак", "food_meal:breakfast")
    .row()
    .text("🍲 Обед", "food_meal:lunch")
    .row()
    .text("🍝 Ужин", "food_meal:dinner")
    .row()
    .text("🍎 Перекус", "food_meal:snack");
  await ctx.reply("Какой это приём пищи?", { reply_markup: kb });
}
bot.callbackQuery("food:new", async (ctx) => {
  await ctx.answerCallbackQuery();
  await askMealType(ctx);
});

// Эти же callback-и используются в сообщениях-напоминаниях в 8:30/13:00/19:30
// (см. app/api/cron/dispatch/route.js) — там тип приёма пищи уже известен,
// поэтому шаг выбора типа пропускается.
bot.callbackQuery(/^food_meal:(breakfast|lunch|dinner|snack)/, async (ctx) => {
  ctx.session.step = "food_desc";
  ctx.session.draft = { meal_type: ctx.match[1] };
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Опиши, что съел(а) — я оценю калории и БЖУ.\nНапример: «овсянка на молоке 300г, банан, кофе с молоком»"
  );
});

// ---------- Контакты: @username + подпись одним сообщением ----------
async function saveContact(ctx, rawText) {
  const text = rawText?.trim();
  if (!text || !text.startsWith("@")) {
    return ctx.reply("Формат: @username Подпись/описание", {
      reply_markup: backToMenuKb()
    });
  }
  const [handle, ...rest] = text.split(" ");
  const user = await getOrCreateUser(ctx);
  const { error } = await db.from("contacts").insert({
    user_id: user.id,
    telegram_username: handle.replace("@", ""),
    label: rest.join(" ") || null
  });
  if (await reportDbError(ctx, error, "contacts")) return;
  await ctx.reply(`Контакт ${handle} сохранён в разделе «Контакты» панели.`, {
    reply_markup: backToMenuKb()
  });
}

bot.command("contact", async (ctx) => saveContact(ctx, ctx.match));
bot.callbackQuery("menu:contact", async (ctx) => {
  ctx.session.step = "contact_input";
  await ctx.answerCallbackQuery();
  await ctx.reply("Пришли в формате: @username Подпись/описание");
});

// Также ловим просто "@username подпись" без команды — быстрее в бою
bot.hears(/^@[\w_]+\s+.+/, async (ctx) => saveContact(ctx, ctx.message.text));

// ---------- Напоминания ----------
async function startRemindFlow(ctx) {
  const kb = new InlineKeyboard()
    .text("📅 Ежедневно (о целях)", "remind:daily")
    .row()
    .text("⏰ Разовое напоминание", "remind:once")
    .row()
    .text("🏠 Меню", "menu:home");
  await ctx.reply("Какое напоминание настроить?", { reply_markup: kb });
}
bot.command("remind", startRemindFlow);
bot.callbackQuery("menu:remind", async (ctx) => {
  await ctx.answerCallbackQuery();
  await startRemindFlow(ctx);
});

bot.callbackQuery("remind:daily", async (ctx) => {
  ctx.session.step = "remind_time";
  await ctx.answerCallbackQuery();
  await ctx.reply("В какое время каждый день напоминать о целях? Формат ЧЧ:ММ (напр. 09:00)");
});

bot.callbackQuery("remind:once", async (ctx) => {
  ctx.session.step = "remind_once_input";
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Во сколько и о чём напомнить? Формат: ЧЧ:ММ Текст\n" +
      "Например: 22:00 Помыть посуду\n\n" +
      "Если это время сегодня уже прошло — напомню завтра в это же время."
  );
});

// ---------- База знаний AI ----------
async function startKbFlow(ctx) {
  const kb = new InlineKeyboard()
    .text("➕ Добавить факт", "kb:add")
    .row()
    .text("📋 Последние записи", "kb:list")
    .row()
    .text("🏠 Меню", "menu:home");
  await ctx.reply(
    "База знаний — то, что AI будет держать в контексте, когда ты просишь его что-то сделать " +
      "(например, контент-план по проекту, о котором ты уже рассказывал).",
    { reply_markup: kb }
  );
}
bot.command("kb", startKbFlow);
bot.callbackQuery("menu:kb", async (ctx) => {
  await ctx.answerCallbackQuery();
  await startKbFlow(ctx);
});

bot.callbackQuery("kb:add", async (ctx) => {
  ctx.session.step = "kb_add";
  await ctx.answerCallbackQuery();
  await ctx.reply("Напиши, что запомнить (например, расскажи про свой проект).");
});

bot.callbackQuery("kb:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(ctx);
  const { data: rows } = await db
    .from("knowledge_base")
    .select("content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!rows?.length) {
    return ctx.reply("Пока пусто. Нажми «➕ Добавить факт».", { reply_markup: backToMenuKb() });
  }
  const text = rows.map((r) => `• ${r.content}`).join("\n");
  await ctx.reply(`Последние записи:\n\n${text}`, { reply_markup: backToMenuKb() });
});

// Быстрый способ добавить факт одной командой, без кнопок
bot.command("note", async (ctx) => {
  const text = ctx.match?.trim();
  if (!text) {
    return ctx.reply("Формат: /note текст, который нужно запомнить");
  }
  const user = await getOrCreateUser(ctx);
  const { error } = await db.from("knowledge_base").insert({ user_id: user.id, content: text });
  if (await reportDbError(ctx, error, "knowledge_base")) return;
  await ctx.reply("Запомнил 🧠", { reply_markup: backToMenuKb() });
});

// ---------- Файлы -> Google Drive ----------
bot.on(["message:photo", "message:video", "message:document"], async (ctx) => {
  const user = await getOrCreateUser(ctx);
  if (!user.google_refresh_token) {
    return ctx.reply(
      "Google Drive ещё не подключён. Открой «⚙️ Настройки», чтобы подключить."
    );
  }
  await ctx.reply("Загружаю файл на Drive…");
  const file = await ctx.getFile();
  const result = await uploadToDrive(user, file, ctx.message);
  await ctx.reply(`Готово ✅\n${result.link}`);
});

// ---------- AI (Qwen) ----------
async function startAiFlow(ctx) {
  ctx.session.step = "ai_chat";
  await ctx.reply(
    "Слушаю. Спроси что угодно про твои цели, расскажи про проект (запомню через базу знаний) " +
      "или попроси что-то изменить."
  );
}
bot.command("ai", startAiFlow);
bot.callbackQuery("menu:ai", async (ctx) => {
  await ctx.answerCallbackQuery();
  await startAiFlow(ctx);
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
    const { error } = await db.from("goals").insert({
      user_id: user.id,
      title: ctx.session.draft.title,
      target_value: ctx.session.draft.target_value,
      metric_unit: ctx.session.draft.metric_unit,
      deadline
    });
    if (await reportDbError(ctx, error, "goals")) return;
    ctx.session.step = null;
    return ctx.reply("Цель создана 🎯 Смотри в панели → Цели / Диаграммы.", {
      reply_markup: backToMenuKb()
    });
  }

  if (step === "progress_value") {
    const value = Number(ctx.message.text.replace(",", "."));
    const goalId = ctx.session.draft.goal_id;
    const { error: progressError } = await db
      .from("goal_progress")
      .insert({ goal_id: goalId, value });
    if (await reportDbError(ctx, progressError, "goal_progress")) return;

    const { data: progressRows } = await db
      .from("goal_progress")
      .select("value")
      .eq("goal_id", goalId);
    const total = progressRows.reduce((s, r) => s + Number(r.value), 0);
    const { data: goalRow } = await db
      .from("goals")
      .select("target_value")
      .eq("id", goalId)
      .maybeSingle();
    const completed = goalRow && total >= Number(goalRow.target_value);
    const { error: updateError } = await db
      .from("goals")
      .update({ current_value: total, status: completed ? "done" : "active" })
      .eq("id", goalId);
    if (await reportDbError(ctx, updateError, "goals.update")) return;

    ctx.session.step = null;
    return ctx.reply(
      completed
        ? `Готово 🎯 Цель достигнута! Итог: ${total}`
        : `Записано. Текущий прогресс: ${total}`,
      { reply_markup: backToMenuKb() }
    );
  }

  // ---- дневные цели ----
  if (step === "dgoal_title") {
    ctx.session.draft.title = ctx.message.text;
    ctx.session.step = "dgoal_target";
    return ctx.reply("Целевое значение (число)? Если цель просто «сделать/не сделать» — напиши 1");
  }

  if (step === "dgoal_target") {
    const target = Number(ctx.message.text.replace(",", "."));
    if (!target || Number.isNaN(target)) {
      return ctx.reply("Нужно число. Например: 1, 5, 30000");
    }
    ctx.session.draft.target_value = target;
    ctx.session.step = "dgoal_unit";
    return ctx.reply("Единица измерения? (или «-», если не нужна)");
  }

  if (step === "dgoal_unit") {
    const unit = ctx.message.text === "-" ? null : ctx.message.text;
    const today = localDateStr();
    const { error } = await db.from("goals").insert({
      user_id: user.id,
      title: ctx.session.draft.title,
      target_value: ctx.session.draft.target_value,
      metric_unit: unit,
      deadline: today,
      is_daily: true,
      goal_date: today
    });
    if (await reportDbError(ctx, error, "goals.daily")) return;
    ctx.session.step = null;
    const kb = new InlineKeyboard()
      .text("➕ Ещё одна цель на день", "daily_goal:new")
      .row()
      .text("🏠 Меню", "menu:home");
    return ctx.reply("Цель на сегодня зафиксирована 🎯 Удачи! Можешь добавить ещё одну.", {
      reply_markup: kb
    });
  }

  if (step === "dgoal_progress_value") {
    const value = Number(ctx.message.text.replace(",", "."));
    const goalId = ctx.session.draft.goal_id;
    const { data: goalRow } = await db.from("goals").select("*").eq("id", goalId).maybeSingle();
    if (!goalRow) {
      ctx.session.step = null;
      return ctx.reply("Не нашёл эту цель — возможно, уже закрыта.", { reply_markup: backToMenuKb() });
    }
    const { error: progressError } = await db
      .from("goal_progress")
      .insert({ goal_id: goalId, value, note: "дневная цель" });
    if (await reportDbError(ctx, progressError, "goal_progress")) return;

    const { data: rows } = await db.from("goal_progress").select("value").eq("goal_id", goalId);
    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    const completed = total >= Number(goalRow.target_value);
    const { error: updErr } = await db
      .from("goals")
      .update({ current_value: total, status: completed ? "done" : "active" })
      .eq("id", goalId);
    if (await reportDbError(ctx, updErr, "goals.update")) return;

    ctx.session.step = null;
    return ctx.reply(
      completed ? `Цель дня выполнена 🎯 Итог: ${total}` : `Записано. Текущий прогресс: ${total}`,
      { reply_markup: backToMenuKb() }
    );
  }

  // ---- профиль питания ----
  if (step === "nutr_weight") {
    const w = Number(ctx.message.text.replace(",", "."));
    if (!w) return ctx.reply("Нужно число, например: 78");
    ctx.session.draft.weight_kg = w;
    ctx.session.step = "nutr_height";
    return ctx.reply("Рост в см? (например 178)");
  }

  if (step === "nutr_height") {
    const h = Number(ctx.message.text.replace(",", "."));
    if (!h) return ctx.reply("Нужно число, например: 178");
    ctx.session.draft.height_cm = h;
    ctx.session.step = "nutr_age";
    return ctx.reply("Возраст (полных лет)?");
  }

  if (step === "nutr_age") {
    const age = parseInt(ctx.message.text, 10);
    if (!age) return ctx.reply("Нужно целое число, например: 29");
    ctx.session.draft.age = age;
    ctx.session.step = "nutr_gender";
    const kb = new InlineKeyboard().text("Мужской", "nutr_gender:male").text("Женский", "nutr_gender:female");
    return ctx.reply("Пол?", { reply_markup: kb });
  }

  // ---- приём пищи ----
  if (step === "food_desc") {
    const description = ctx.message.text;
    const mealType = ctx.session.draft.meal_type;
    await ctx.reply("Считаю КБЖУ… 🧮");

    // estimateFoodMacros теперь никогда не кидает наружу — она сама делает
    // ретраи и в крайнем случае возвращает локальную эвристику с approx:true.
    const macros = await estimateFoodMacros(user, description);
    const { approx, ...toSave } = macros;

    const { error } = await withSupabaseRetry(() =>
      db.from("food_logs").insert({
        user_id: user.id,
        meal_type: mealType,
        description,
        ...toSave
      })
    );
    if (await reportDbError(ctx, error, "food_logs")) return;

    ctx.session.step = null;
    const totals = await getTodayTotals(user.id);
    const prefix = approx ? "≈ " : "";
    return ctx.reply(
      `Записал ✅ ${mealLabel(mealType)}: ${description}\n` +
        `${prefix}🔥 ${macros.calories} ккал · 🥩 ${macros.protein} г · 🥑 ${macros.fat} г · 🍞 ${macros.carbs} г\n\n` +
        `Итого за сегодня: 🔥 ${Math.round(totals.calories)} ккал · 🥩 ${Math.round(totals.protein)} г · ` +
        `🥑 ${Math.round(totals.fat)} г · 🍞 ${Math.round(totals.carbs)} г`,
      { reply_markup: backToMenuKb() }
    );
  }

  if (step === "contact_input") {
    ctx.session.step = null;
    return saveContact(ctx, ctx.message.text);
  }

  if (step === "remind_time") {
    const { error } = await db.from("reminders").insert({
      user_id: user.id,
      cron_time: ctx.message.text,
      message: "Как продвигаются твои цели сегодня?",
      type: "daily"
    });
    if (await reportDbError(ctx, error, "reminders.daily")) return;
    ctx.session.step = null;
    return ctx.reply("Ежедневное напоминание настроено ⏰", { reply_markup: backToMenuKb() });
  }

  if (step === "remind_once_input") {
    const parsed = parseHHMM(ctx.message.text);
    const rest = ctx.message.text.trim().replace(/^\d{1,2}:\d{2}\s*/, "");
    if (!parsed || !rest) {
      return ctx.reply(
        "Не понял формат. Пришли так: ЧЧ:ММ Текст\nНапример: 22:00 Помыть посуду"
      );
    }
    const remindAt = nextOccurrenceUtcIso(parsed.h, parsed.m);
    const { error } = await db.from("reminders").insert({
      user_id: user.id,
      type: "once",
      remind_at: remindAt,
      message: rest,
      is_sent: false
    });
    if (await reportDbError(ctx, error, "reminders.once")) return;
    ctx.session.step = null;
    return ctx.reply(`Напомню ${formatLocalHuman(remindAt)} (МСК): «${rest}» ⏰`, {
      reply_markup: backToMenuKb()
    });
  }

  if (step === "kb_add") {
    const { error } = await db
      .from("knowledge_base")
      .insert({ user_id: user.id, content: ctx.message.text });
    if (await reportDbError(ctx, error, "knowledge_base")) return;
    ctx.session.step = null;
    return ctx.reply("Запомнил 🧠", { reply_markup: backToMenuKb() });
  }

  if (step === "ai_chat") {
    const reply = await askQwen(user, ctx.message.text);
    return ctx.reply(reply);
  }

  // fallback — короткая помощь
  return ctx.reply("Не понял команду. Открой /start, там меню со всеми действиями.");
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
