import { NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabase";
import bot from "@/lib/bot";
import { isDueNow, localDateStr } from "@/lib/time";
import { buildDailyDigest } from "@/lib/digest";

export const maxDuration = 60;

// Во сколько по МСК слать вечерний итог. Можно переопределить через env,
// не трогая код.
const DIGEST_TIME_MSK = process.env.DIGEST_TIME_MSK || "22:00";

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

  const results = { onceSent: 0, dailySent: 0, digestSent: 0, errors: [] };
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

  // 3) Вечерний итог дня по всем пользователям
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
