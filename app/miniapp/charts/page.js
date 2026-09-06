"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function ChartsPage() {
  const [goals, setGoals] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    apiGet("/api/goals").then((d) => {
      setGoals(d.goals || []);
      if (d.goals?.length) setSelected(d.goals[0].id);
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
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Динамика</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {goals.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelected(g.id)}
            className={`nav-item px-3 py-2 border border-black whitespace-nowrap ${
              selected === g.id ? "bg-black text-white" : "bg-white text-black"
            }`}
          >
            {g.title}
          </button>
        ))}
      </div>

      <div className="card h-64">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#E5E5E5" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#0A0A0A" }} />
              <YAxis tick={{ fontSize: 10, fill: "#0A0A0A" }} />
              <Tooltip
                contentStyle={{ border: "1px solid #0A0A0A", borderRadius: 0, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="total" stroke="#0A0A0A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            Нет данных по прогрессу
          </div>
        )}
      </div>
    </div>
  );
}
