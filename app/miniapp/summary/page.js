"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";
import CountUp from "@/components/CountUp";

function DeltaBadge({ diff, pct }) {
  if (!diff) return <span className="text-[10px] text-white/30 font-mono">без изменений</span>;
  const up = diff > 0;
  return (
    <span className={`text-[10px] font-mono ${up ? "text-accent-2" : "text-white/50"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% к прошлому периоду
    </span>
  );
}

function StatCard({ title, value, unit, diff, pct, delay }) {
  return (
    <GlassPanel className="p-4" delay={delay}>
      <p className="text-[11px] text-white/40 mb-1.5">{title}</p>
      <div className="flex items-baseline gap-1.5">
        <CountUp value={value} className="font-display text-2xl" />
        {unit && <span className="text-xs text-white/40">{unit}</span>}
      </div>
      <div className="mt-1.5">
        <DeltaBadge diff={diff} pct={pct} />
      </div>
    </GlassPanel>
  );
}

export default function SummaryPage() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGet(`/api/summary?period=${period}`).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [period]);

  return (
    <div className="space-y-5">
      <header className="rise-in">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-1">Обзор</p>
        <h1 className="font-display text-[26px] leading-tight">Итоги</h1>
      </header>

      <div className="flex gap-2 rise-in" style={{ animationDelay: "40ms" }}>
        <button
          onClick={() => setPeriod("month")}
          className={`nav-item px-3.5 py-2 chip ${period === "month" ? "is-active" : "text-white/45"}`}
        >
          Месяц
        </button>
        <button
          onClick={() => setPeriod("year")}
          className={`nav-item px-3.5 py-2 chip ${period === "year" ? "is-active" : "text-white/45"}`}
        >
          Год
        </button>
      </div>

      {loading || !data ? (
        <GlassPanel className="h-40 p-4">
          <div className="h-full w-full animate-pulse" />
        </GlassPanel>
      ) : (
        <>
          <GlassPanel strong className="p-5" delay={80}>
            <p className="text-sm text-white/70">
              {period === "month" ? "Текущий месяц" : "Текущий год"}: <b>{data.label}</b>
            </p>
            <p className="text-xs text-white/35 mt-1">
              Сравнение с {period === "month" ? "предыдущим месяцем" : "предыдущим годом"} (
              {data.previousLabel})
            </p>
          </GlassPanel>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              title="Целей достигнуто"
              value={data.current.goalsCompleted}
              diff={data.compare.goalsCompleted.diff}
              pct={data.compare.goalsCompleted.pct}
              delay={120}
            />
            <StatCard
              title="Новых целей"
              value={data.current.goalsCreated}
              diff={data.compare.goalsCreated.diff}
              pct={data.compare.goalsCreated.pct}
              delay={150}
            />
            <StatCard
              title="Выполнение целей дня"
              value={data.current.dailyPct}
              unit="%"
              diff={data.compare.dailyPct.diff}
              pct={data.compare.dailyPct.pct}
              delay={180}
            />
            <StatCard
              title="Целей дня всего"
              value={data.current.dailyTotal}
              diff={data.compare.dailyTotal.diff}
              pct={data.compare.dailyTotal.pct}
              delay={210}
            />
            <StatCard
              title="Прогресса записано"
              value={data.current.progressSum}
              diff={data.compare.progressSum.diff}
              pct={data.compare.progressSum.pct}
              delay={240}
            />
            <StatCard
              title="Ккал/день в среднем"
              value={data.current.avgCalories}
              diff={data.compare.avgCalories.diff}
              pct={data.compare.avgCalories.pct}
              delay={270}
            />
          </div>

          <p className="text-xs text-white/30 text-center pt-1">
            Дней с записями питания: {data.current.nutritionLoggedDays}
          </p>
        </>
      )}
    </div>
  );
}
