"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";

const statusLabel = { active: "В работе", done: "Достигнута", failed: "Не достигнута", paused: "На паузе" };

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    apiGet("/api/goals").then((d) => setGoals(d.goals || []));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Все цели</h1>
      {goals.map((g) => {
        const pct = Math.min(100, Math.round((g.current_value / g.target_value) * 100));
        return (
          <div key={g.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{g.title}</div>
                {g.deadline && (
                  <div className="text-xs text-gray-500 mt-0.5">до {g.deadline}</div>
                )}
              </div>
              <span className="text-xs border border-black px-2 py-0.5">
                {statusLabel[g.status]}
              </span>
            </div>
            <div className="progress-track mt-3">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{g.current_value} / {g.target_value} {g.metric_unit}</span>
              <span>{pct}%</span>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-gray-500 pt-2">
        Новая цель и отметка прогресса — командами /goal и /progress в чате с ботом.
      </p>
    </div>
  );
}
