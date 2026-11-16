"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";

export default function DailyPage() {
  const [goals, setGoals] = useState([]);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiGet("/api/goals"), apiGet("/api/goals/daily")])
      .then(([g, d]) => {
        setGoals((g.goals || []).filter((x) => x.is_daily && x.status === "active"));
        setDays((d.days || []).slice(-7).reverse());
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <header className="rise-in">
        <h1 className="font-display text-[26px] leading-tight">Ежедневные</h1>
      </header>

      {loading ? (
        <GlassPanel className="h-32 p-4"><div className="h-full w-full animate-pulse" /></GlassPanel>
      ) : goals.length === 0 ? (
        <GlassPanel className="p-5 text-center" delay={60}>
          <p className="text-sm text-white/60">
            На сегодня целей нет. Поставь цель командой <span className="font-mono text-white">/dailygoal</span> в боте.
          </p>
        </GlassPanel>
      ) : (
        goals.map((g, i) => {
          const pct = Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100) || 0);
          return (
            <GlassPanel key={g.id} className="p-4" delay={60 + i * 50}>
              <div className="flex justify-between gap-3">
                <span className="font-medium">{g.title}</span>
                <span className="font-mono text-sm text-white/60">{pct}%</span>
              </div>
              <div className="progress-track mt-3"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
              <p className="font-mono text-xs text-white/40 mt-2">
                {g.current_value} / {g.target_value} {g.metric_unit || ""}
              </p>
            </GlassPanel>
          );
        })
      )}

      {days.length > 0 && (
        <GlassPanel strong className="p-4" delay={200}>
          <p className="text-sm mb-3">Последние дни</p>
          <div className="space-y-2">
            {days.map((d) => (
              <div key={d.date} className="flex items-center gap-3 text-xs">
                <span className="font-mono w-20 text-white/70">{d.date.slice(5).split("-").reverse().join(".")}</span>
                <div className="progress-track flex-1"><div className="progress-fill is-done" style={{ width: `${d.pct}%` }} /></div>
                <span className="font-mono w-14 text-right">{d.done}/{d.total}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      <Link href="/miniapp/charts" className="chip glass-tap block text-center py-3 text-xs">Динамика по дням</Link>
    </div>
  );
}
