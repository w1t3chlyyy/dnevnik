"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";
import { IconLink, IconClose, IconTarget } from "@/components/icons";

export default function LinksPage() {
  const [goals, setGoals] = useState([]);
  const [dailyTitles, setDailyTitles] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(null); // { title, x, y }
  const [hoverGoalId, setHoverGoalId] = useState(null);
  const [toast, setToast] = useState(null);

  const cardRefs = useRef(new Map());

  async function loadAll() {
    const [goalsRes, dailyRes, linksRes] = await Promise.all([
      apiGet("/api/goals"),
      apiGet("/api/goals/daily"),
      apiGet("/api/goal-links")
    ]);
    setGoals((goalsRes.goals || []).filter((g) => !g.is_daily && g.status === "active"));
    setDailyTitles(dailyRes.titles || []);
    setLinks(linksRes.links || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const setCardRef = useCallback((id, el) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  function hitTest(x, y) {
    for (const [id, el] of cardRefs.current.entries()) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  }

  function handlePointerDown(e, title) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ title, x: e.clientX, y: e.clientY });
  }

  function handlePointerMove(e) {
    if (!drag) return;
    e.preventDefault();
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    setHoverGoalId(hitTest(e.clientX, e.clientY));
  }

  async function handlePointerUp(e) {
    if (!drag) return;
    const targetId = hitTest(e.clientX, e.clientY);
    const title = drag.title;
    setDrag(null);
    setHoverGoalId(null);
    if (!targetId) return;

    const res = await apiPost("/api/goal-links", {
      daily_title: title,
      parent_goal_id: targetId,
      multiplier: 1
    });
    if (res?.error) {
      setToast({ type: "error", text: "Не получилось связать." });
      return;
    }
    setToast({ type: "info", text: "Связано 🔗" });
    loadAll();
  }

  async function handleMultiplierChange(link, value) {
    const num = Number(value);
    if (!num || num <= 0) return;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, multiplier: num } : l)));
    await apiPost("/api/goal-links", {
      daily_title: link.daily_title,
      parent_goal_id: link.parent_goal_id,
      multiplier: num
    });
  }

  async function handleDeleteLink(id) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    await apiDelete(`/api/goal-links?id=${id}`);
  }

  const linkedTitles = new Set(links.map((l) => l.daily_title));

  return (
    <div
      className="space-y-5 select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <header className="rise-in">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-1">Автоматизация</p>
        <h1 className="font-display text-[26px] leading-tight">Конструктор целей</h1>
      </header>

      <GlassPanel className="p-4" delay={40}>
        <p className="text-xs text-white/45 leading-relaxed">
          Зажми цель дня внизу и перетащи на обычную цель — они свяжутся, и прогресс дневной цели
          будет автоматически прибавляться к общей при каждом выполнении.
        </p>
      </GlassPanel>

      {loading ? (
        <GlassPanel className="h-40 p-4">
          <div className="h-full w-full animate-pulse" />
        </GlassPanel>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-white/35 px-1">Обычные цели</h2>
            {goals.length === 0 && (
              <GlassPanel className="p-5 text-center">
                <p className="text-sm text-white/40">
                  Нет активных целей. Создай через <span className="font-mono">/goal</span> в боте.
                </p>
              </GlassPanel>
            )}
            <div className="space-y-2.5">
              {goals.map((g) => (
                <div
                  key={g.id}
                  ref={(el) => setCardRef(g.id, el)}
                  className={`glass p-4 flex items-center gap-3 transition-all duration-150 ${
                    hoverGoalId === g.id ? "border-accent/70 scale-[1.02] bg-white/10" : ""
                  }`}
                >
                  <div className="w-9 h-9 rounded-2xl shrink-0 flex items-center justify-center border border-white/20">
                    <IconTarget size={15} className="text-white/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{g.title}</div>
                    <div className="font-mono text-[11px] text-white/35 mt-0.5">
                      {g.current_value}/{g.target_value} {g.metric_unit || ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-white/35 px-1">
              Цели дня — зажми и тяни вверх
            </h2>
            {dailyTitles.length === 0 ? (
              <GlassPanel className="p-5 text-center">
                <p className="text-sm text-white/40">Пока нет ни одной цели дня.</p>
              </GlassPanel>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {dailyTitles.map((title) => (
                  <div
                    key={title}
                    onPointerDown={(e) => handlePointerDown(e, title)}
                    className={`chip shrink-0 px-3.5 py-2.5 text-xs flex items-center gap-1.5 cursor-grab ${
                      linkedTitles.has(title) ? "border-accent-2/50 text-white/80" : "text-white/60"
                    } ${drag?.title === title ? "opacity-30" : ""}`}
                    style={{ touchAction: "none" }}
                  >
                    {linkedTitles.has(title) && <IconLink size={11} />}
                    {title}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {links.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-white/35 px-1">Активные связи</h2>
          <div className="space-y-2.5">
            {links.map((l, i) => (
              <GlassPanel key={l.id} className="p-3.5 flex items-center gap-3" delay={i * 40}>
                <IconLink size={14} className="text-white/40 shrink-0" />
                <div className="flex-1 min-w-0 text-xs">
                  <span className="text-white/80">«{l.daily_title}»</span>
                  <span className="text-white/30 mx-1">→</span>
                  <span className="text-white/80">{l.goals?.title || "удалено"}</span>
                </div>
                <input
                  inputMode="decimal"
                  value={l.multiplier}
                  onChange={(e) => handleMultiplierChange(l, e.target.value)}
                  className="w-14 text-center bg-white/5 border border-white/15 rounded-lg py-1 text-xs font-mono outline-none focus:border-accent/60"
                />
                <button
                  onClick={() => handleDeleteLink(l.id)}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-white/15 text-white/40"
                >
                  <IconClose size={12} />
                </button>
              </GlassPanel>
            ))}
          </div>
        </section>
      )}

      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 chip px-4 py-2 text-xs bg-black/70 z-50">
          {toast.text}
        </div>
      )}

      {drag && (
        <div
          className="fixed z-50 pointer-events-none chip px-3.5 py-2.5 text-xs border-accent/60"
          style={{ left: drag.x - 40, top: drag.y - 20, background: "rgba(139,123,255,0.35)" }}
        >
          {drag.title}
        </div>
      )}
    </div>
  );
}
