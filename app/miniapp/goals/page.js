"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";
import { IconTarget } from "@/components/icons";

const statusLabel = { active: "В работе", done: "Достигнута", failed: "Не достигнута", paused: "На паузе" };

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet("/api/goals").then((d) => {
      setGoals(d.goals || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-5">
      <header className="rise-in">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-1">Все цели</p>
        <h1 className="font-display text-[28px] leading-none">Список целей</h1>
      </header>

      <div className="space-y-3">
        {loading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="glass h-[92px] animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          ))}

        {!loading &&
          goals.map((g, i) => {
            const pct = Math.min(100, Math.round((g.current_value / g.target_value) * 100) || 0);
            return (
              <GlassPanel key={g.id} className="p-4" delay={i * 60}>
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{g.title}</div>
                    {g.deadline && (
                      <div className="font-mono text-[11px] text-white/35 mt-0.5">до {g.deadline}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide border border-white/20 px-2 py-1 text-white/60">
                    {statusLabel[g.status]}
                  </span>
                </div>
                <div className="progress-track mt-3">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between font-mono text-xs text-white/40 mt-1.5">
                  <span>{g.current_value} / {g.target_value} {g.metric_unit}</span>
                  <span>{pct}%</span>
                </div>
              </GlassPanel>
            );
          })}

        {!loading && goals.length === 0 && (
          <GlassPanel className="p-6 flex flex-col items-center text-center gap-2">
            <IconTarget size={22} className="text-white/30" />
            <p className="text-sm text-white/45">
              Пусто. Создай цель командой <span className="font-mono text-white/70">/goal</span> в чате с ботом.
            </p>
          </GlassPanel>
        )}
      </div>

      <p className="text-xs text-white/30 pt-1 text-center">
        Новая цель и отметка прогресса — командами /goal и /progress в чате с ботом.
      </p>
    </div>
  );
}
