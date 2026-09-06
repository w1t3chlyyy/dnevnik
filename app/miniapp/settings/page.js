"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";
import { IconCloud, IconCheck } from "@/components/icons";

export default function SettingsPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = () => apiGet("/api/user").then((d) => setUser(d)).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  async function handleConnect() {
    setBusy(true);
    setNotice(null);
    try {
      const d = await apiGet("/api/drive/connect-url");
      if (d.error) {
        setNotice({ type: "error", text: d.error });
        return;
      }
      const webApp = window.Telegram?.WebApp;
      if (webApp?.openLink) {
        webApp.openLink(d.url);
      } else {
        window.open(d.url, "_blank");
      }
      setNotice({
        type: "info",
        text: "Открой ссылку в браузере и разреши доступ. После этого вернись сюда и обнови страницу."
      });
    } catch {
      setNotice({ type: "error", text: "Не удалось получить ссылку для подключения." });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await apiPost("/api/drive/disconnect");
      await load();
      setNotice({ type: "info", text: "Google Drive отключён." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="rise-in">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-1">Настройки</p>
        <h1 className="font-display text-[28px] leading-none">
          {loading ? "…" : user?.first_name ? `Привет, ${user.first_name}` : "Настройки"}
        </h1>
      </header>

      <GlassPanel strong className="p-5" delay={80}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center border border-white/20 shrink-0">
            <IconCloud size={18} className="text-white/70" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Google Drive</div>
            <div className="text-xs text-white/40 mt-0.5">
              {loading ? "Проверяю статус…" : user?.driveConnected ? "Подключён" : "Не подключён"}
            </div>
          </div>
          {!loading && user?.driveConnected && (
            <span className="w-6 h-6 flex items-center justify-center border border-white/25 rounded-full shrink-0">
              <IconCheck size={13} className="text-white/80" />
            </span>
          )}
        </div>

        <p className="text-xs text-white/40 leading-relaxed mt-4">
          Файлы, фото и видео, которые ты присылаешь боту, сохраняются в отдельную папку на твоём
          Google Drive — доступ есть только у тебя.
        </p>

        <button
          onClick={user?.driveConnected ? handleDisconnect : handleConnect}
          disabled={busy || loading}
          className="mt-4 w-full py-3 text-sm border border-white/25 hover:bg-white/5 active:scale-[0.99] transition disabled:opacity-40"
        >
          {user?.driveConnected ? "Отключить Google Drive" : "Подключить Google Drive"}
        </button>

        {notice && (
          <p className={`text-xs mt-3 ${notice.type === "error" ? "text-white" : "text-white/45"}`}>
            {notice.text}
          </p>
        )}
      </GlassPanel>

      <GlassPanel className="p-5" delay={160}>
        <div className="font-medium mb-1">AI-ассистент</div>
        <p className="text-xs text-white/40 leading-relaxed">
          Команда <span className="font-mono text-white/70">/ai</span> в чате с ботом — можно спросить
          про цели или попросить создать/обновить их голосом обычного разговора.
        </p>
      </GlassPanel>
    </div>
  );
}
