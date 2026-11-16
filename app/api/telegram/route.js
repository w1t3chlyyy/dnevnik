import { webhookCallback } from "grammy";
import bot from "@/lib/bot";

export const maxDuration = 60; // даём serverless-функции больше времени на выполнение

export const POST = webhookCallback(bot, "std/http", {
  onTimeout: "return", // не падать с ошибкой при долгой обработке — просто ответить Telegram
  timeoutMilliseconds: 55000 // почти весь бюджет maxDuration отдаём под обработку апдейта
});
