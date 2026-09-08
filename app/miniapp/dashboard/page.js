"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";
import ProgressRing from "@/components/ProgressRing";
import CountUp from "@/components/CountUp";
import { IconTarget } from "@/components/icons";

function pct(g) {
  return Math.min(100, Math.round((g.current_value / g.target_value) * 100) || 0);
}

export default function Dashboard() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet("/api/goals").then((d) => {
      setGoals(d.goals || []);
      setLoading(false);
    });
  }, []);

  const active = goals.filter((g) => g.status === "active");
  const done = goals.filter((g) => g.status === "done");
  const overall = active.length
    ? Math.round(active.reduce((s, g) => s + pct(g), 0) / active.length)
    : 0;

  return (
    <div className="space-y-5">
      <header className="rise-in">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-1">Панель</p>
        <h1 className="font-display text-[28px] leading-none">Твой прогресс</h1>
      </header>

      <GlassPanel strong className="p-6 flex items-center gap-6" delay={60}>
        <ProgressRing value={overall} size={104} stroke={5} label={`${overall}%`} sublabel="в среднем" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <CountUp value={active.length} className="font-display text-3xl" />
            <span className="text-white/40 text-sm">в работе</span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <CountUp value={done.length} className="font-display text-3xl" />
            <span className="text-white/40 text-sm">достигнуто</span>
          </div>
          <div className="mt-3 h-px bg-white/10" />
          <p className="mt-3 text-xs text-white/35 leading-relaxed">
            {active.length
              ? "Отмечай прогресс на вкладке «Цели» или командой /progress в боте."
              : "Создай первую цель командой /goal в чате с ботом."}
          </p>
        </div>
      </GlassPanel>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-white/35">Активные цели</h2>

        {loading &&
          [0, 1].map((i) => (
            <div key={i} className="glass h-[74px] animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          ))}

        {!loading &&
          active.map((g, i) => {
            const value = pct(g);
            return (
              <GlassPanel key={g.id} as={Link} href="/miniapp/goals" className="p-4 flex glass-tap" delay={120 + i * 70}>
                <div className="flex items-center gap-4 w-full">
                  <ProgressRing value={value} size={46} stroke={3.5} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium truncate">{g.title}</span>
                      <span className="font-mono text-sm text-white/50">{value}%</span>
                    </div>
                    <div className="font-mono text-xs text-white/40 mt-0.5">
                      {g.current_value} / {g.target_value} {g.metric_unit}
                    </div>
                  </div>
                </div>
              </GlassPanel>
            );
          })}

        {!loading && active.length === 0 && (
          <GlassPanel className="p-6 flex flex-col items-center text-center gap-2" delay={120}>
            <IconTarget size={22} className="text-white/30" />
            <p className="text-sm text-white/45">
              Целей пока нет. Создай через команду <span className="font-mono text-white/70">/goal</span> в чате с ботом.
            </p>
          </GlassPanel>
        )}
      </section>
    </div>
  );
}
