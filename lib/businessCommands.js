// Команды владельца внутри любого подключённого чата (пишутся от своего аккаунта).
//   .gpt <вопрос>    — вопрос нейросети прямо в чате
//   .a_gpt_off/_on   — выключить/включить автоответ ИИ в этом чате
//   .a_mute          — автоудаление сообщений собеседника (вкл/выкл)
//   .stories         — фото (подпись или ответом) -> 9 частей -> 9 историй
//   .circle          — видео -> видео-кружок (тяжёлое, делает воркер)
//   .save <ссылка>   — видео из TikTok/Shorts/Reels/VK (тяжёлое, делает воркер)
// Ответы-подтверждения идут владельцу в личку с ботом, а не в чат — собеседник их не видит.
import { InputFile } from "grammy";
import { supabaseAdmin as db } from "./supabase";
import { askText } from "./llm";
import { sliceInto9, downloadTelegramFile } from "./media";

const NAMES = new Set(["gpt", "a_gpt_off", "a_gpt_on", "a_mute", "stories", "circle", "save"]);

export function parseCommand(m) {
  const t = (m.text ?? m.caption ?? "").trim();
  const x = /^\.([a-z_]+)(?:\s+([\s\S]*))?$/i.exec(t);
  if (!x || !NAMES.has(x[1].toLowerCase())) return null;
  return { name: x[1].toLowerCase(), arg: (x[2] || "").trim() };
}

const notify = (ctx, conn, text) => ctx.api.sendMessage(conn.owner_tg_id, text).catch(() => {});

// Удалить сообщения в чате (например, саму команду). Нужно право «удалять отправленные».
async function del(ctx, conn, ids) {
  if (!conn.rights?.can_delete_sent_messages) return;
  await ctx.api.raw
    .deleteBusinessMessages({ business_connection_id: conn.id, message_ids: ids })
    .catch((e) => console.error("deleteBusinessMessages:", e.message));
}

async function setChatFlag(userId, chatId, patch) {
  await db.from("business_chats").upsert({ user_id: userId, chat_id: chatId, ...patch }, { onConflict: "user_id,chat_id" });
}

async function getFlag(userId, chatId, key) {
  const { data } = await db.from("business_chats").select(key).eq("user_id", userId).eq("chat_id", chatId).maybeSingle();
  return Boolean(data?.[key]);
}

function chatLabel(m) {
  const c = m.chat;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || String(c.id);
}

export async function runOwnerCommand({ ctx, m, conn, user, cmd }) {
  const chatId = m.chat.id;
  const reply = m.reply_to_message;

  if (cmd.name === "a_gpt_off" || cmd.name === "a_gpt_on") {
    const off = cmd.name === "a_gpt_off";
    await setChatFlag(user.id, chatId, { ai_off: off });
    await notify(ctx, conn, `🤖 Автоответ ИИ в чате «${chatLabel(m)}» ${off ? "выключен" : "включён"}.`);
    return del(ctx, conn, [m.message_id]);
  }

  if (cmd.name === "a_mute") {
    const next = !(await getFlag(user.id, chatId, "mute"));
    await setChatFlag(user.id, chatId, { mute: next });
    const note = next && !conn.rights?.can_delete_all_messages ? "\n⚠️ Боту не выдано право «Удалять любые сообщения» — удалять нечем." : "";
    await notify(ctx, conn, `🔇 Автоудаление сообщений собеседника в «${chatLabel(m)}» ${next ? "включено" : "выключено"}.${note}`);
    return del(ctx, conn, [m.message_id]);
  }

  if (cmd.name === "gpt") {
    let q = cmd.arg;
    const quoted = reply?.text || reply?.caption;
    if (!q && quoted) q = quoted;
    else if (q && quoted) q = `${q}\n\nСообщение, на которое отвечаю:\n${quoted}`;
    if (!q) return notify(ctx, conn, "Формат: .gpt вопрос (или ответом на сообщение).");

    ctx.api.raw.sendChatAction({ chat_id: chatId, action: "typing", business_connection_id: conn.id }).catch(() => {});
    const { data: hist } = await db
      .from("business_history")
      .select("role, content")
      .eq("user_id", user.id)
      .eq("chat_id", chatId)
      .order("id", { ascending: false })
      .limit(10);
    const messages = [
      {
        role: "system",
        content:
          "Ты — ИИ-помощник владельца Telegram-аккаунта. Отвечай по делу, коротко, без markdown. " +
          "Ниже может быть история переписки в этом чате — используй её, если вопрос о ней."
      },
      ...(hist || []).reverse().map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: h.content })),
      { role: "user", content: q }
    ];
    let answer;
    try {
      answer = await askText(messages, { timeoutMs: 40_000 });
    } catch (e) {
      return notify(ctx, conn, `Не получилось спросить ИИ: ${e.message}`);
    }
    if (!conn.rights?.can_reply) return notify(ctx, conn, "У бота нет права отвечать в чатах.");
    await ctx.api.raw.sendMessage({ chat_id: chatId, business_connection_id: conn.id, text: answer.replace(/\*\*(.*?)\*\*/g, "$1") });
    return del(ctx, conn, [m.message_id]);
  }

  if (cmd.name === "stories") {
    const photos = m.photo || reply?.photo;
    if (!photos?.length) return notify(ctx, conn, "Пришли фото с подписью .stories (или ответь .stories на фото).");
    if (!conn.rights?.can_manage_stories)
      return notify(ctx, conn, "Боту не выдано право «Управлять историями». Включи его в Настройки → Telegram для бизнеса → Чат-боты.");
    try {
      const file = await ctx.api.getFile(photos[photos.length - 1].file_id);
      const tiles = await sliceInto9(await downloadTelegramFile(file.file_path));
      // В профиле новые истории идут сверху-слева, поэтому публикуем с конца: 9 -> 1.
      for (let i = tiles.length - 1; i >= 0; i--) {
        await ctx.api.raw.postStory({
          business_connection_id: conn.id,
          content: { type: "photo", photo: new InputFile(tiles[i], `tile${i + 1}.jpg`) },
          active_period: 86400,
          post_to_chat_page: true
        });
      }
      await notify(ctx, conn, "✅ Опубликовано 9 историй (сетка 3×3 в профиле).");
    } catch (e) {
      console.error("stories failed:", e.message);
      await notify(ctx, conn, `Истории не опубликовались: ${e.message}`);
    }
    return del(ctx, conn, [m.message_id]);
  }

  if (cmd.name === "circle") {
    const src = m.video || m.video_note || m.animation || reply?.video || reply?.video_note || reply?.animation;
    if (!src) return notify(ctx, conn, "Пришли видео с подписью .circle (или ответь .circle на видео).");
    if (src.file_size && src.file_size > 20 * 1024 * 1024)
      return notify(ctx, conn, "Видео больше 20 МБ — Bot API не отдаст такой файл. Пришли покороче/полегче.");
    await db.from("jobs").insert({
      kind: "circle",
      payload: { connection_id: conn.id, chat_id: chatId, owner_id: conn.owner_tg_id, file_id: src.file_id, command_message_id: m.message_id }
    });
    return notify(ctx, conn, "⏳ Делаю кружок…");
  }

  if (cmd.name === "save") {
    const text = cmd.arg || reply?.text || reply?.caption || "";
    const url = /https?:\/\/[^\s]+/.exec(text)?.[0];
    if (!url) return notify(ctx, conn, "Формат: .save ссылка (TikTok, Shorts, Reels, VK).");
    await db.from("jobs").insert({
      kind: "save",
      payload: { connection_id: conn.id, chat_id: chatId, owner_id: conn.owner_tg_id, url, command_message_id: m.message_id }
    });
    return notify(ctx, conn, "⏳ Скачиваю видео…");
  }
}
