"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong px-3 py-2 text-xs font-mono">
      <div className="text-white/40">{label}</div>
      <div className="text-white mt-0.5">{payload[0].value}</div>
    </div>
  );
}

export default function ChartsPage() {
  const [goals, setGoals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet("/api/goals").then((d) => {
      setGoals(d.goals || []);
      if (d.goals?.length) setSelected(d.goals[0].id);
      setLoading(false);
    });
  }, []);

  const goal = goals.find((g) => g.id === selected);
  const chartData = (goal?.goal_progress || [])
    .slice()
    .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at))
    .reduce((acc, row) => {
      const prevTotal = acc.length ? acc[acc.length - 1].total : 0;
      acc.push({ date: row.logged_at, total: prevTotal + Number(row.value) });
      return acc;
    }, []);

  return (
    <div className="space-y-5">
      <header className="rise-in">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-1">Аналитика</p>
        <h1 className="font-display text-[28px] leading-none">Динамика</h1>
      </header>

      {!loading && goals.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 rise-in" style={{ animationDelay: "80ms" }}>
          {goals.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelected(g.id)}
              className={`nav-item px-3 py-2 whitespace-nowrap border transition-colors ${
                selected === g.id
                  ? "border-white/40 bg-white/10 text-white"
                  : "border-white/12 text-white/45"
              }`}
            >
              {g.title}
            </button>
          ))}
        </div>
      )}

      <GlassPanel className="h-72 p-4" delay={140}>
        {loading ? (
          <div className="h-full w-full animate-pulse" />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F5F5F3" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#F5F5F3" stopOpacity={0} />
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
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#F5F5F3"
                strokeWidth={2}
                fill="url(#fillTotal)"
                animationDuration={900}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-white/35">
            Нет данных по прогрессу
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
