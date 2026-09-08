"use client";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";
import ProgressRing from "@/components/ProgressRing";
import { IconTarget, IconPlus, IconTrophy, IconClose } from "@/components/icons";

const statusLabel = { active: "В работе", done: "Достигнута", failed: "Не достигнута", paused: "На паузе" };

function pct(g) {
  return Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100) || 0);
}

function GoalCard({ g, i, onLogProgress, leaving }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const value_pct = pct(g);
  const remaining = Math.max(0, Number(g.target_value) - Number(g.current_value));

  async function submit() {
    const num = Number(String(value).replace(",", "."));
    if (!num || saving) return;
    setSaving(true);
    await onLogProgress(g.id, num);
    setSaving(false);
    setValue("");
    setOpen(false);
  }

  return (
    <GlassPanel
      className={`p-4 ${leaving ? "goal-leaving" : ""}`}
      delay={i * 60}
    >
      {leaving && <div className="completion-glow" />}
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{g.title}</div>
          {g.deadline && (
            <div className="font-mono text-[11px] text-white/35 mt-0.5">до {g.deadline}</div>
          )}
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-wide chip px-2.5 py-1 text-white/60">
          {statusLabel[g.status]}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <div className="flex-1">
          <div className="progress-track">
            <div
              className={`progress-fill ${value_pct >= 100 ? "is-done" : ""}`}
              style={{ width: `${value_pct}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-xs text-white/40 mt-1.5">
            <span>{g.current_value} / {g.target_value} {g.metric_unit}</span>
            <span>{value_pct}%</span>
          </div>
        </div>
      </div>

      {g.status === "active" && (
        <div className="mt-3">
          {!open ? (
            <button
              onClick={() => setOpen(true)}
              className="chip glass-tap w-full flex items-center justify-center gap-1.5 py-2 text-xs text-white/70"
            >
              <IconPlus size={13} />
              Отметить прогресс
            </button>
          ) : (
            <div className="flex items-center gap-2 pop-in">
              <input
                autoFocus
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={`+ ${g.metric_unit || "значение"}`}
                className="flex-1 min-w-0 bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-accent/60 transition-colors font-mono"
              />
              <button
                onClick={submit}
                disabled={saving || !value}
                className="shrink-0 rounded-xl px-3 py-2 text-xs font-medium disabled:opacity-30 transition"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "#08080a" }}
              >
                {saving ? "…" : "Ок"}
              </button>
              <button
                onClick={() => { setOpen(false); setValue(""); }}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl border border-white/15 text-white/40"
              >
                <IconClose size={14} />
              </button>
            </div>
          )}
          {remaining > 0 && !open && (
            <p className="text-[11px] text-white/30 mt-1.5 text-center">
              Осталось {remaining} {g.metric_unit} до цели
            </p>
          )}
        </div>
      )}
    </GlassPanel>
  );
}

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leavingIds, setLeavingIds] = useState([]);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    apiGet("/api/goals").then((d) => {
      setGoals(d.goals || []);
      setLoading(false);
    });
  }, []);

  async function handleLogProgress(goalId, value) {
    const res = await apiPost("/api/goals/progress", { goal_id: goalId, value });
    if (res?.error) return;

    if (res.completed) {
      // проиграть анимацию завершения, затем убрать из активного списка
      setLeavingIds((ids) => [...ids, goalId]);
      setTimeout(() => {
        setGoals((prev) => prev.map((g) => (g.id === goalId ? res.goal : g)));
        setLeavingIds((ids) => ids.filter((id) => id !== goalId));
      }, 680);
    } else if (res.goal) {
      setGoals((prev) => prev.map((g) => (g.id === goalId ? res.goal : g)));
    }
  }

  const active = useMemo(() => goals.filter((g) => g.status === "active"), [goals]);
  const archived = useMemo(() => goals.filter((g) => g.status !== "active"), [goals]);

  return (
    <div className="space-y-5">
      <header className="rise-in">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-1">Все цели</p>
        <h1 className="font-display text-[26px] leading-tight">Список целей</h1>
      </header>

      <div className="space-y-3">
        {loading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="glass h-[110px] animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          ))}

        {!loading &&
          active.map((g, i) => (
            <GoalCard
              key={g.id}
              g={g}
              i={i}
              onLogProgress={handleLogProgress}
              leaving={leavingIds.includes(g.id)}
            />
          ))}

        {!loading && active.length === 0 && (
          <GlassPanel className="p-6 flex flex-col items-center text-center gap-2">
            <IconTarget size={22} className="text-white/30" />
            <p className="text-sm text-white/45">
              Пусто. Создай цель командой <span className="font-mono text-white/70">/goal</span> в чате с ботом.
            </p>
          </GlassPanel>
        )}
      </div>

      {!loading && archived.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowArchive((v) => !v)}
            className="w-full flex items-center justify-between px-1 py-2 text-[11px] uppercase tracking-[0.14em] text-white/35"
          >
            <span className="flex items-center gap-1.5">
              <IconTrophy size={13} />
              Архив ({archived.length})
            </span>
            <span className={`transition-transform duration-300 ${showArchive ? "rotate-180" : ""}`}>⌄</span>
          </button>

          {showArchive && (
            <div className="space-y-3">
              {archived.map((g, i) => {
                const value_pct = pct(g);
                return (
                  <GlassPanel key={g.id} className="p-4 opacity-70" delay={i * 50}>
                    <div className="flex items-center gap-3">
                      <ProgressRing value={value_pct} size={38} stroke={3} done={g.status === "done"} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate text-sm">{g.title}</div>
                        <div className="font-mono text-[11px] text-white/35 mt-0.5">
                          {g.current_value} / {g.target_value} {g.metric_unit}
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide chip px-2.5 py-1 text-white/50">
                        {statusLabel[g.status]}
                      </span>
                    </div>
                  </GlassPanel>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-white/30 pt-1 text-center">
        Новую цель можно создать командой /goal в чате с ботом.
      </p>
    </div>
  );
}
