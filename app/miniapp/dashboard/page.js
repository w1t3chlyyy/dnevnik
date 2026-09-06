"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";

export default function Dashboard() {
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    apiGet("/api/goals").then((d) => setGoals(d.goals || []));
  }, []);

  const active = goals.filter((g) => g.status === "active");
  const done = goals.filter((g) => g.status === "done");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Панель</h1>
        <p className="text-gray-500 text-sm">{active.length} активных · {done.length} завершено</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <div className="text-3xl font-semibold">{active.length}</div>
          <div className="nav-item text-gray-500 mt-1">В работе</div>
        </div>
        <div className="card">
          <div className="text-3xl font-semibold">{done.length}</div>
          <div className="nav-item text-gray-500 mt-1">Достигнуто</div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="nav-item text-gray-500">Активные цели</h2>
        {active.map((g) => {
          const pct = Math.min(100, Math.round((g.current_value / g.target_value) * 100));
          return (
            <div key={g.id} className="card">
              <div className="flex justify-between items-baseline">
                <span className="font-medium">{g.title}</span>
                <span className="text-sm">{pct}%</span>
              </div>
              <div className="progress-track mt-2">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {g.current_value} / {g.target_value} {g.metric_unit}
              </div>
            </div>
          );
        })}
        {active.length === 0 && (
          <p className="text-sm text-gray-500">
            Целей пока нет. Создай через команду /goal в чате с ботом.
          </p>
        )}
      </section>
    </div>
  );
}
