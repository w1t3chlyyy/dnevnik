"use client";
import { useEffect } from "react";

export default function TelegramInit() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
    webApp?.setHeaderColor("#08080a");
    webApp?.setBackgroundColor("#08080a");
  }, []);
  return null;
}
