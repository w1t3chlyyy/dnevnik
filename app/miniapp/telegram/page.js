"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";

const FILTERS = [
  ["selected", "Выбранные"],
  ["new", "Новые"],
  ["all", "Все"]
];
const STATUS = { new: "Новый", selected: "Выбран", ignored: "Игнор" };
const COMMANDS = [
  [".gpt вопрос", "вопрос нейросети прямо в чате"],
  [".a_gpt_off / .a_gpt_on", "выключить / включить автоответ ИИ в этом чате"],
  [".mute / .a_mute", "автоудаление сообщений собеседника (вкл/выкл)"],
  [".stories", "фото → 9 частей → 9 историй (подпись к фото или ответом на него)"],
  [".circle", "видео → видео-кружок"],
  [".save ссылка", "видео из TikTok, Shorts, Reels, VK"]
];

function Toggle({ on, onChange, label, hint }) {
  return (
    <button onClick={() => onChange(!on)} className="w-full flex items-center justify-between gap-3 py-2 text-left">
      <span>
        <span className="text-sm block">{label}</span>
        {hint && <span className="text-[11px] text-white/40 block mt-0.5">{hint}</span>}
      </span>
      <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${on ? "bg-[#2f6bff]" : "bg-white/15"}`}>
        <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

function Label({ children }) {
  return <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-2">{children}</p>;
}

export default function TelegramPage() {
  const [conn, setConn] = useState(null);
  const [s, setS] = useState(null);
  const [providers, setProviders] = useState([]);
  const [chats, setChats] = useState([]);
  const [kb, setKb] = useState([]);
  const [kbText, setKbText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiGet("/api/telegram-panel/settings"), apiGet("/api/telegram-panel/chats"), apiGet("/api/telegram-panel/knowledge")])
      .then(([a, c, k]) => {
        setConn(a.connection || null);
        setS(a.settings || null);
        setProviders(a.providers || []);
        setChats(c.chats || []);
        setKb(k.items || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const upd = (patch) => {
    setS((v) => ({ ...v, ...patch }));
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    const r = await apiPost("/api/telegram-panel/settings", s);
    if (r.settings) setS(r.settings);
    setSaving(false);
    setSaved(true);
  }

  async function patchChat(chat_id, patch) {
    setChats((list) => list.map((c) => (c.chat_id === chat_id ? { ...c, ...patch } : c)));
    await apiPost("/api/telegram-panel/chats", { chat_id, ...patch });
  }

  async function addKb() {
    const content = kbText.trim();
    if (!content) return;
    setKbText("");
    const r = await apiPost("/api/telegram-panel/knowledge", { content });
    if (r.item) setKb((l) => [r.item, ...l]);
  }

  async function delKb(id) {
    setKb((l) => l.filter((x) => x.id !== id));
    await apiDelete(`/api/telegram-panel/knowledge?id=${id}`);
  }

  const connected = conn?.is_enabled;
  const rights = conn?.rights || {};
  const visibleChats = chats.filter((c) => !c.is_bot);
  const botsCount = chats.length - visibleChats.length;

  return (
    <div className="space-y-5">
      <header className="rise-in">
        <h1 className="font-display text-[26px] leading-tight">Telegram</h1>
      </header>

      {loading || !s ? (
        <GlassPanel className="h-40 p-4"><div className="h-full w-full animate-pulse" /></GlassPanel>
      ) : (
        <>
          {/* ---------- подключение ---------- */}
          <GlassPanel strong={connected} className="p-5" delay={40}>
            <p className="font-display text-base">{connected ? "Бот подключён" : "Бот не подключён"}</p>
            {connected ? (
              <div className="text-xs mt-2 space-y-0.5 text-white/80">
                <p>Отвечать в чатах: {rights.can_reply ? "да" : "нет"}</p>
                <p>Удалять свои сообщения: {rights.can_delete_sent_messages ? "да" : "нет"}</p>
                <p>Удалять любые сообщения: {rights.can_delete_all_messages ? "да" : "нет"}</p>
                <p>Управлять историями: {rights.can_manage_stories ? "да" : "нет"}</p>
              </div>
            ) : (
              <ol className="text-xs text-white/60 mt-3 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>Нужен Telegram Premium.</li>
                <li>В @BotFather: Bot Settings → Business Mode → включить.</li>
                <li>В Telegram: Настройки → Telegram для бизнеса → Чат-боты → выбрать этого бота.</li>
                <li>Выдать права: отвечать, удалять сообщения, управлять историями.</li>
              </ol>
            )}
          </GlassPanel>

          {/* ---------- настройки ---------- */}
          <GlassPanel className="p-5" delay={80}>
            <Label>Автоответ</Label>
            <Toggle on={s.auto_reply} onChange={(v) => upd({ auto_reply: v })} label="Отвечать нейросетью" hint="Выключает автоответ везде; в отдельном чате — командой .a_gpt_off" />

            <div className="mt-3">
              <p className="text-sm mb-2">Кому отвечать</p>
              <div className="flex gap-2">
                {FILTERS.map(([k, t]) => (
                  <button key={k} onClick={() => upd({ chat_filter: k })} className={`chip px-3.5 py-2 text-xs ${s.chat_filter === k ? "is-active" : "text-white/50"}`}>
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-white/40 mt-2">
                {s.chat_filter === "selected" && "Только чаты, которые ты отметил ниже."}
                {s.chat_filter === "new" && "Только новые чаты, где ты ещё не отвечал сам."}
                {s.chat_filter === "all" && "Всем личным чатам, кроме ботов и игнорируемых."}
              </p>
            </div>

            <div className="mt-4">
              <p className="text-sm mb-2">Как отвечать</p>
              <textarea
                value={s.persona}
                onChange={(e) => upd({ persona: e.target.value })}
                rows={5}
                placeholder="Тон, правила, чем занимаешься, что можно и нельзя обещать…"
                className="w-full bg-white/5 rounded-2xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[#2f6bff] resize-none"
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-sm">Пауза перед ответом, сек</span>
              <input
                type="number"
                min="0"
                max="30"
                value={s.reply_delay_sec}
                onChange={(e) => upd({ reply_delay_sec: e.target.value })}
                className="w-16 text-center bg-white/5 rounded-xl py-1.5 text-sm font-mono outline-none"
              />
            </div>
            <Toggle
              on={s.pause_on_owner_reply}
              onChange={(v) => upd({ pause_on_owner_reply: v })}
              label="Молчать, если я ответил сам"
              hint={`Пауза ИИ в чате на ${s.owner_pause_hours} ч после твоего ручного ответа`}
            />

            <button onClick={save} disabled={saving} className="mt-4 w-full rounded-full py-3 text-sm bg-[#2f6bff] disabled:opacity-50">
              {saving ? "Сохраняю…" : saved ? "Сохранено ✓" : "Сохранить настройки"}
            </button>
          </GlassPanel>

          {/* ---------- чаты ---------- */}
          <GlassPanel className="p-5" delay={120}>
            <Label>Чаты ({visibleChats.length})</Label>
            {visibleChats.length === 0 ? (
              <p className="text-xs text-white/45 leading-relaxed">
                Пока пусто. Чаты появятся, когда в них напишут. Группы, каналы и боты игнорируются автоматически{botsCount ? ` (ботов отсеяно: ${botsCount})` : ""}.
              </p>
            ) : (
              <div className="space-y-3">
                {visibleChats.map((c) => (
                  <div key={c.chat_id} className="rounded-2xl bg-white/5 p-3">
                    <p className="text-sm truncate">{c.name || (c.username ? `@${c.username}` : c.chat_id)}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(STATUS).map(([k, t]) => (
                        <button key={k} onClick={() => patchChat(c.chat_id, { status: k })} className={`chip px-3 py-1.5 text-[11px] ${c.status === k ? "is-active" : "text-white/45"}`}>
                          {t}
                        </button>
                      ))}
                      <button onClick={() => patchChat(c.chat_id, { ai_off: !c.ai_off })} className={`chip px-3 py-1.5 text-[11px] ${c.ai_off ? "is-active" : "text-white/45"}`}>
                        ИИ выкл
                      </button>
                      <button onClick={() => patchChat(c.chat_id, { mute: !c.mute })} className={`chip px-3 py-1.5 text-[11px] ${c.mute ? "is-active" : "text-white/45"}`}>
                        Мут
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>

          {/* ---------- база знаний ---------- */}
          <GlassPanel className="p-5" delay={160}>
            <Label>База знаний ({kb.length})</Label>
            <div className="flex gap-2">
              <input
                value={kbText}
                onChange={(e) => setKbText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKb()}
                placeholder="Факт, цена, условие…"
                className="flex-1 min-w-0 bg-white/5 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[#2f6bff]"
              />
              <button onClick={addKb} className="shrink-0 rounded-full px-4 text-sm bg-[#2f6bff]">+</button>
            </div>
            <div className="mt-3 space-y-2">
              {kb.map((k) => (
                <div key={k.id} className="flex items-start gap-2 text-xs text-white/75 leading-relaxed">
                  <span className="flex-1">{k.content}</span>
                  <button onClick={() => delKb(k.id)} className="shrink-0 text-white/35 px-1" aria-label="Удалить">✕</button>
                </div>
              ))}
            </div>
          </GlassPanel>

          {/* ---------- команды и ИИ ---------- */}
          <GlassPanel className="p-5" delay={200}>
            <Label>Команды в любом чате</Label>
            <div className="space-y-2.5">
              {COMMANDS.map(([c, d]) => (
                <p key={c} className="text-xs leading-relaxed">
                  <span className="font-mono text-white">{c}</span>
                  <span className="text-white/45"> — {d}</span>
                </p>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-white/10">
              <Label>Нейросети</Label>
              {providers.length === 0 ? (
                <p className="text-xs text-white/45">Не настроены ключи.</p>
              ) : (
                providers.map((p) => (
                  <p key={p.name} className="text-xs flex justify-between">
                    <span>{p.name}</span>
                    <span className="text-white/45">{p.blockedUntil ? `лимит до ${new Date(p.blockedUntil).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "работает"}</span>
                  </p>
                ))
              )}
            </div>
          </GlassPanel>
        </>
      )}
    </div>
  );
}
