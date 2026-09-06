"use client";
import { useEffect } from "react";

export default function TelegramInit() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.onload = () => {
      window.Telegram?.WebApp?.ready();
      window.Telegram?.WebApp?.expand();
      window.Telegram?.WebApp?.setHeaderColor("#0A0A0A");
    };
    document.head.appendChild(script);
  }, []);
  return null;
}
