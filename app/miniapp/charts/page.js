"use client";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell, LabelList
} from "recharts";

const ALL = "__all__";
const PALETTE = ["#8b7bff", "#5ee6c8", "#ff9f6e", "#ff8bd6", "#7fd1ff", "#f4e07a"];

function CustomTooltip({ active, payload, label, suffix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong px-3 py-2 text-xs font-mono rounded-xl">
      <div className="text-white/40">{label}</div>
      <div className="text-white mt-0.5">{payload[0].value}{suffix}</div>
    </div>
  );
}

function pctAt(cumByDate, dates, target) {
  // step-function lookup: значение на дату или последнее известное до неё
  const out = [];
  let last = 0;
  let idx = 0;
  for (const d of dates) {
    while (idx < cumByDate.length && cumByDate[idx].date <= d) {
      last = cumByDate[idx].total;
      idx++;
    }
    out.push(Math.min(100, Math.round((last / target) * 100) || 0));
  }
  return out;
}

export default function ChartsPage() {
  const [mode, setMode] = useState("goals"); // "goals" | "daily"
  const [goals, setGoals] = useState([]);
  const [selected, setSelected] = useState(ALL);
  const [loading, setLoading] = useState(true);

  const [dailyDays, setDailyDays] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(true);

  useEffect(() => {
    apiGet("/api/goals").then((d) => {
      setGoals(d.goals || []);
      setLoading(false);
    });
    apiGet("/api/goals/daily").then((d) => {
      setDailyDays(d.days || []);
      setDailyLoading(false);
    });
  }, []);

  const goal = goals.find((g) => g.id === selected);

  const chartData = useMemo(() => {
    if (!goal) return [];
    return (goal.goal_progress || [])
      .slice()
      .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at))
      .reduce((acc, row) => {
        const prevTotal = acc.length ? acc[acc.length - 1].total : 0;
        acc.push({ date: row.logged_at, total: prevTotal + Number(row.value) });
        return acc;
      }, []);
  }, [goal]);

  // ---------- агрегированный график по всем (не дневным) целям ----------
  const overallData = useMemo(() => {
    const withProgress = goals.filter((g) => (g.goal_progress || []).length > 0 && Number(g.target_value) > 0);
    if (withProgress.length === 0) return [];

    const perGoalCum = withProgress.map((g) => {
      const rows = g.goal_progress
        .slice()
        .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
      let running = 0;
      return rows.map((r) => {
        running += Number(r.value);
        return { date: r.logged_at, total: running };
      });
    });

    const allDates = Array.from(
      new Set(perGoalCum.flat().map((r) => r.date))
    ).sort((a, b) => new Date(a) - new Date(b));

    const perGoalPct = withProgress.map((g, i) =>
      pctAt(perGoalCum[i], allDates, Number(g.target_value))
    );

    return allDates.map((date, di) => {
      const values = perGoalPct.map((series) => series[di]);
      const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
      return { date, total: avg };
    });
  }, [goals]);

  const snapshot = useMemo(
    () =>
      goals
        .filter((g) => Number(g.target_value) > 0)
        .map((g) => ({
          name: g.title.length > 12 ? g.title.slice(0, 11) + "…" : g.title,
          pct: Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100) || 0),
          done: g.status === "done"
        })),
    [goals]
  );

  const overallAvg = snapshot.length
    ? Math.round(snapshot.reduce((s, g) => s + g.pct, 0) / snapshot.length)
    : 0;

  const isAll = selected === ALL;
  const activeData = isAll ? overallData : chartData;

  // среднее по всем дням для дневных целей — общая цифра сверху
  const dailyOverallAvg = dailyDays.length
    ? Math.round(dailyDays.reduce((s, d) => s + d.pct, 0) / dailyDays.length)
    : 0;
  const dailyTotalGoals = dailyDays.reduce((s, d) => s + d.total, 0);

  return (
    <div className="space-y-5">
      <header className="rise-in">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-1">Аналитика</p>
        <h1 className="font-display text-[26px] leading-tight">Динамика</h1>
      </header>

      <div className="flex gap-2 rise-in" style={{ animationDelay: "40ms" }}>
        <button
          onClick={() => setMode("goals")}
          className={`nav-item px-3.5 py-2 chip ${mode === "goals" ? "is-active" : "text-white/45"}`}
        >
          Обычные цели
        </button>
        <button
          onClick={() => setMode("daily")}
          className={`nav-item px-3.5 py-2 chip ${mode === "daily" ? "is-active" : "text-white/45"}`}
        >
          Ежедневные
        </button>
      </div>

      {mode === "goals" && (
        <>
          {!loading && goals.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 rise-in" style={{ animationDelay: "80ms" }}>
              <button
                onClick={() => setSelected(ALL)}
                className={`nav-item px-3.5 py-2 whitespace-nowrap chip ${selected === ALL ? "is-active" : "text-white/45"}`}
              >
                Все цели
              </button>
              {goals.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelected(g.id)}
                  className={`nav-item px-3.5 py-2 whitespace-nowrap chip ${selected === g.id ? "is-active" : "text-white/45"}`}
                >
                  {g.title}
                </button>
              ))}
            </div>
          )}

          {isAll && !loading && snapshot.length > 0 && (
            <GlassPanel strong className="p-5 flex items-center gap-5" delay={100}>
              <div className="font-display text-4xl">{overallAvg}%</div>
              <div className="flex-1">
                <p className="text-sm text-white/70 leading-snug">Средний прогресс по всем целям</p>
                <p className="text-xs text-white/35 mt-0.5">{snapshot.length} {snapshot.length === 1 ? "цель" : "целей"} в расчёте</p>
              </div>
            </GlassPanel>
          )}

          <GlassPanel className="h-72 p-4" delay={140}>
            {loading ? (
              <div className="h-full w-full animate-pulse" />
            ) : activeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isAll ? "#8b7bff" : "#5ee6c8"} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={isAll ? "#8b7bff" : "#5ee6c8"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(245,245,243,0.08)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "rgba(245,245,243,0.4)" }}
                    axisLine={{ stroke: "rgba(245,245,243,0.13)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "rgba(245,245,243,0.4)" }}
                    axisLine={false}
                    tickLine={false}
                    {...(isAll ? { domain: [0, 100] } : {})}
                  />
                  <Tooltip content={<CustomTooltip suffix={isAll ? "%" : ""} />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke={isAll ? "#8b7bff" : "#5ee6c8"}
                    strokeWidth={2.5}
                    fill="url(#fillTotal)"
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-white/35 text-center px-6">
                {isAll ? "Пока нет отметок прогресса ни по одной цели" : "Нет данных по прогрессу"}
              </div>
            )}
          </GlassPanel>

          {isAll && !loading && snapshot.length > 0 && (
            <GlassPanel className="p-4" delay={200}>
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-3">Снимок по целям</p>
              <ResponsiveContainer width="100%" height={Math.max(120, snapshot.length * 44)}>
                <BarChart
                  data={snapshot}
                  layout="vertical"
                  margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
                  barCategoryGap={14}
                >
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fontSize: 11, fill: "rgba(245,245,243,0.55)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip suffix="%" />} cursor={{ fill: "rgba(245,245,243,0.04)" }} />
                  <Bar dataKey="pct" radius={[8, 8, 8, 8]} animationDuration={800} barSize={14}>
                    {snapshot.map((entry, idx) => (
                      <Cell key={idx} fill={entry.done ? "#5ee6c8" : PALETTE[idx % PALETTE.length]} />
                    ))}
                    <LabelList
                      dataKey="pct"
                      position="right"
                      formatter={(v) => `${v}%`}
                      style={{ fill: "rgba(245,245,243,0.55)", fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </GlassPanel>
          )}
        </>
      )}

      {mode === "daily" && (
        <>
          {!dailyLoading && dailyDays.length > 0 && (
            <GlassPanel strong className="p-5 flex items-center gap-5" delay={100}>
              <div className="font-display text-4xl">{dailyOverallAvg}%</div>
              <div className="flex-1">
                <p className="text-sm text-white/70 leading-snug">Средний % выполнения целей дня</p>
                <p className="text-xs text-white/35 mt-0.5">
                  {dailyDays.length} {dailyDays.length === 1 ? "день" : "дней"} · {dailyTotalGoals} {dailyTotalGoals === 1 ? "цель" : "целей"} всего
                </p>
              </div>
            </GlassPanel>
          )}

          <GlassPanel className="h-72 p-4" delay={140}>
            {dailyLoading ? (
              <div className="h-full w-full animate-pulse" />
            ) : dailyDays.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyDays} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(245,245,243,0.08)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "rgba(245,245,243,0.4)" }}
                    axisLine={{ stroke: "rgba(245,245,243,0.13)" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "rgba(245,245,243,0.4)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip suffix="%" />} cursor={{ fill: "rgba(245,245,243,0.04)" }} />
                  <Bar dataKey="pct" radius={[6, 6, 0, 0]} fill="#5ee6c8" animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-white/35 text-center px-6">
                Пока нет ни одной цели дня — они появятся здесь после утреннего сообщения от бота.
              </div>
            )}
          </GlassPanel>

          <p className="text-xs text-white/30 pt-1 text-center">
            Отдельных графиков по каждой цели дня нет — только общая динамика выполнения.
          </p>
        </>
      )}
    </div>
  );
}
