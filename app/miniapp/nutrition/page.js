"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell
} from "recharts";

const MEAL_LABELS = { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин", snack: "Перекус" };
const MEAL_EMOJI = { breakfast: "🍳", lunch: "🍲", dinner: "🍝", snack: "🍎" };
const MACRO_COLORS = { protein: "#5ee6c8", fat: "#ff9f6e", carbs: "#8b7bff" };

function CustomTooltip({ active, payload, label, suffix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong px-3 py-2 text-xs font-mono rounded-xl">
      <div className="text-white/40">{label}</div>
      <div className="text-white mt-0.5">{payload[0].value}{suffix}</div>
    </div>
  );
}

function ProgressBar({ label, value, target, unit, color }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-white/55">{label}</span>
        <span className="font-mono text-white/70">
          {Math.round(value)}{unit} {target ? `/ ${target}${unit}` : ""}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/8 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function NutritionPage() {
  const [profile, setProfile] = useState(null);
  const [totals, setTotals] = useState(null);
  const [meals, setMeals] = useState([]);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiGet("/api/nutrition/today"), apiGet("/api/nutrition/logs")]).then(
      ([today, logs]) => {
        setProfile(today.profile);
        setTotals(today.totals);
        setMeals(today.meals || []);
        setDays(logs.days || []);
        setLoading(false);
      }
    );
  }, []);

  const macroPie = totals
    ? [
        { name: "Белки", value: totals.protein, color: MACRO_COLORS.protein },
        { name: "Жиры", value: totals.fat, color: MACRO_COLORS.fat },
        { name: "Углеводы", value: totals.carbs, color: MACRO_COLORS.carbs }
      ].filter((m) => m.value > 0)
    : [];

  const goalLabel = profile
    ? { lose: "Похудение", maintain: "Поддержание веса", gain: "Набор массы" }[profile.goal]
    : null;

  return (
    <div className="space-y-5">
      <header className="rise-in">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-1">Трекер</p>
        <h1 className="font-display text-[26px] leading-tight">Питание</h1>
      </header>

      {loading ? (
        <GlassPanel className="h-40 p-4">
          <div className="h-full w-full animate-pulse" />
        </GlassPanel>
      ) : !profile ? (
        <GlassPanel className="p-5 text-center" delay={80}>
          <p className="text-sm text-white/60 leading-relaxed">
            Профиль питания ещё не настроен.
            <br />
            Открой бота и напиши <span className="font-mono text-white/80">/nutrition</span> →
            «Настроить профиль», чтобы посчитать норму калорий и БЖУ.
          </p>
        </GlassPanel>
      ) : (
        <>
          <GlassPanel strong className="p-5 space-y-4" delay={80}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display text-4xl">{Math.round(totals?.calories || 0)}</div>
                <p className="text-xs text-white/40 mt-0.5">
                  из {profile.target_calories} ккал · {goalLabel}
                </p>
              </div>
              {macroPie.length > 0 && (
                <ResponsiveContainer width={92} height={92}>
                  <PieChart>
                    <Pie
                      data={macroPie}
                      dataKey="value"
                      innerRadius={28}
                      outerRadius={44}
                      paddingAngle={3}
                      animationDuration={800}
                    >
                      {macroPie.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="space-y-3 pt-1">
              <ProgressBar
                label="Белки"
                value={totals?.protein || 0}
                target={profile.target_protein}
                unit="г"
                color={MACRO_COLORS.protein}
              />
              <ProgressBar
                label="Жиры"
                value={totals?.fat || 0}
                target={profile.target_fat}
                unit="г"
                color={MACRO_COLORS.fat}
              />
              <ProgressBar
                label="Углеводы"
                value={totals?.carbs || 0}
                target={profile.target_carbs}
                unit="г"
                color={MACRO_COLORS.carbs}
              />
            </div>
          </GlassPanel>

          <GlassPanel className="h-56 p-4" delay={140}>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-2">
              Калории за 14 дней
            </p>
            {days.length > 0 ? (
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={days} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(245,245,243,0.08)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "rgba(245,245,243,0.4)" }}
                    axisLine={{ stroke: "rgba(245,245,243,0.13)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "rgba(245,245,243,0.4)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip suffix=" ккал" />} cursor={{ fill: "rgba(245,245,243,0.04)" }} />
                  <Bar dataKey="calories" radius={[6, 6, 0, 0]} fill="#8b7bff" animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-white/35">
                Пока нет записей о еде
              </div>
            )}
          </GlassPanel>

          <GlassPanel className="p-4" delay={200}>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-3">Сегодня</p>
            {meals.length > 0 ? (
              <div className="space-y-3">
                {meals.map((m) => (
                  <div key={m.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-white/80">
                        {MEAL_EMOJI[m.meal_type] || "🍽"} {MEAL_LABELS[m.meal_type] || m.meal_type}
                      </p>
                      <p className="text-xs text-white/40 truncate">{m.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono text-white/70">{Math.round(m.calories)} ккал</p>
                      <p className="text-[10px] text-white/30 font-mono">
                        Б{Math.round(m.protein)} Ж{Math.round(m.fat)} У{Math.round(m.carbs)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/35 text-center py-2">
                Сегодня ещё ничего не занесено — ответь на сообщение бота о завтраке/обеде/ужине
                или напиши <span className="font-mono">/nutrition</span>.
              </p>
            )}
          </GlassPanel>
        </>
      )}
    </div>
  );
}
