"use client";
import { useEffect } from "react";

export default function TelegramInit() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.onload = () => {
      const webApp = window.Telegram?.WebApp;
      webApp?.ready();
      webApp?.expand();
      webApp?.setHeaderColor("#08080a");
      webApp?.setBackgroundColor("#08080a");
    };
    document.head.appendChild(script);
  }, []);
  return null;
}
