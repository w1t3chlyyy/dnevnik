"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";
import ShapeCard from "@/components/ShapeCard";
import { u, fs, at, box, PAGE_PAD, FONT } from "@/lib/fx";

// Контуры карточек — 1:1 из Figma (Rectangle 411 / 417 / 419).
const PATH_STATS =
  "M0 50C0 22.3858 22.3858 0 50 0H637C664.614 0 687 22.3858 687 50V279C687 306.614 664.614 329 637 329H393.5C365.886 329 343.5 351.386 343.5 379V391C343.5 418.614 321.114 441 293.5 441H50C22.3858 441 0 418.614 0 391V50Z";
const PATH_FOOD =
  "M0 50C0 22.3858 22.3858 0 50 0H637C664.614 0 687 22.3858 687 50V312C687 339.614 664.614 362 637 362H411.5C383.886 362 361.5 339.614 361.5 312V298C361.5 270.386 339.114 248 311.5 248H50C22.3858 248 0 225.614 0 198V50Z";
const PATH_CHART =
  "M254.5 113C282.114 113 304.5 90.6142 304.5 63V50C304.5 22.3858 326.886 0 354.5 0H637C664.614 0 687 22.3858 687 50V257C687 284.614 664.614 307 637 307H50C22.3858 307 0 284.614 0 257V163C0 135.386 22.3858 113 50 113H254.5Z";

const FOOD_MASK = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 687 362'><path d='${PATH_FOOD}' fill='black'/></svg>`
)}")`;
const maskStyle = {
  WebkitMaskImage: FOOD_MASK,
  maskImage: FOOD_MASK,
  WebkitMaskSize: "100% 100%",
  maskSize: "100% 100%",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat"
};

const BLUE = "#2F6BFF";
const GRADIENT_TEXT = {
  backgroundImage: "linear-gradient(187.9deg, #1C4099 10.47%, rgba(47,107,255,0.86) 88%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent"
};
const display = (n, min, extra = {}) => ({
  fontFamily: FONT.unb,
  fontWeight: 500,
  fontSize: fs(n, min),
  lineHeight: "normal",
  whiteSpace: "nowrap",
  ...extra
});
const pillBtn = (x, y, bg) => ({
  ...box(x, y, 331, 88),
  background: bg,
  borderRadius: u(50),
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: FONT.unb,
  fontWeight: 400,
  fontSize: fs(20, 11),
  color: "#fff"
});

const GOAL_LABEL = { lose: "Похудение", maintain: "Поддержание", gain: "Набор массы" };

function greeting(name) {
  const h = Number(
    new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Moscow" }).format(new Date())
  );
  const g = h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
  return name ? `${g}, ${name}` : g;
}

const pctOf = (g) => Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100) || 0);

// Плавная кривая (Catmull-Rom -> Bezier), значения зажаты в область графика.
const Y0 = 259; // нулевая линия графика в координатах карточки
const Y100 = Y0 - 228; // 100% (шаг 25% = 57px, как в макете)
const clampY = (y) => Math.max(Y100, Math.min(Y0, y));
function smooth(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
    d += ` C${p1.x + (p2.x - p0.x) / 6} ${c1y} ${p2.x - (p3.x - p1.x) / 6} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function Dashboard() {
  const [data, setData] = useState({});

  useEffect(() => {
    Promise.all([
      apiGet("/api/user"),
      apiGet("/api/goals"),
      apiGet("/api/summary?period=year"),
      apiGet("/api/nutrition/today"),
      apiGet("/api/goals/daily")
    ])
      .then(([user, goals, summary, food, daily]) => setData({ user, goals, summary, food, daily }))
      .catch(() => {});
  }, []);

  const active = useMemo(
    () => (data.goals?.goals || []).filter((g) => g.status === "active" && !g.is_daily),
    [data.goals]
  );
  const overall = active.length ? Math.round(active.reduce((s, g) => s + pctOf(g), 0) / active.length) : 0;
  const completed = data.summary?.current?.goalsCompleted ?? 0;

  const totals = data.food?.totals;
  const profile = data.food?.profile;

  // ----- график: % выполнения целей дня по дням текущего месяца -----
  const chart = useMemo(() => {
    const ymd = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" }); // YYYY-MM-DD
    const [yy, mm] = ymd.split("-");
    const dim = new Date(Number(yy), Number(mm), 0).getDate();
    const days = (data.daily?.days || []).filter((d) => d.date?.startsWith(`${yy}-${mm}`));
    const pts = days.map((d) => ({
      x: 68 + ((Number(d.date.slice(8, 10)) - 1) / Math.max(1, dim - 1)) * 550,
      y: Y0 - (d.pct / 100) * 228
    }));
    const avg = days.length ? Math.round(days.reduce((s, d) => s + d.pct, 0) / days.length) : 0;
    return {
      avg,
      pts,
      path: smooth(pts),
      from: `01.${mm}.${yy.slice(2)}`,
      to: `${String(dim).padStart(2, "0")}.${mm}.${yy.slice(2)}`
    };
  }, [data.daily]);

  const R = 102.68;
  const C = 2 * Math.PI * R;

  return (
    <div className="-mx-5" style={{ paddingInline: PAGE_PAD, paddingTop: "calc(min(100vw, 448px) * 0.1556 - 2rem)" }}>
      <div className="cq flex flex-col" style={{ gap: u(23.5) }}>
        <h1 className="rise-in break-words" style={display(48, 20, { whiteSpace: "normal", marginBottom: u(1) })}>
          {greeting(data.user?.first_name)}
        </h1>

        {/* ---------- карточка 1: прогресс ---------- */}
        <ShapeCard w={687} h={441} d={PATH_STATS} fill={BLUE} className="rise-in" style={{ animationDelay: "60ms" }}>
          <svg style={box(36, 54, 222, 222)} viewBox="0 0 222 222" fill="none" aria-hidden="true">
            <circle cx="111" cy="111" r={R} stroke="#000" strokeWidth="16.64" />
            <circle
              cx="111"
              cy="111"
              r={R}
              stroke="#fff"
              strokeWidth="16.64"
              strokeDasharray={`${(C * overall) / 100} ${C}`}
              transform="rotate(-90 111 111)"
              style={{ transition: "stroke-dasharray 1s cubic-bezier(.16,1,.3,1)" }}
            />
          </svg>
          <div style={at(147, 123, { transform: "translateX(-50%)", color: "#fff", ...display(64, 26, { letterSpacing: u(-5.76) }) })}>
            {overall}%
          </div>
          <div style={at(147, 186, { transform: "translateX(-50%)", fontSize: fs(16, 9), whiteSpace: "nowrap" })}>в среднем</div>

          <div style={at(318, 38, { display: "flex", alignItems: "baseline", gap: u(8), whiteSpace: "nowrap" })}>
            <span style={display(64, 26, { letterSpacing: u(-5.76) })}>{active.length}</span>
            <span style={{ fontSize: fs(20, 11) }}>в работе</span>
          </div>
          <div style={at(318, 107, { display: "flex", alignItems: "baseline", gap: u(8), whiteSpace: "nowrap" })}>
            <span style={display(64, 26, { letterSpacing: u(-5.76) })}>{completed}</span>
            <span style={{ fontSize: fs(20, 11) }}>достигнуто</span>
          </div>
          <p style={at(318, 204, { width: u(343), fontSize: fs(20, 11), lineHeight: "normal" })}>
            Отмечай прогресс на вкладке «Цели» или командой /progress в боте.
          </p>

          <Link href="/miniapp/goals" style={pillBtn(6, 345, "#171717")}>Список целей</Link>
          <Link href="/miniapp/daily" style={pillBtn(356, 345, BLUE)}>Ежедневные</Link>
        </ShapeCard>

        {/* ---------- карточка 2: питание ---------- */}
        <ShapeCard w={687} h={362} d={PATH_FOOD} fill="#171717" className="rise-in" style={{ animationDelay: "120ms" }}>
          <div className="absolute inset-0 overflow-hidden" style={maskStyle}>
            <div style={box(-32, -173, 353, 589, { display: "flex", alignItems: "center", justifyContent: "center" })}>
              {/* public/figma/hero.png — см. docs/REDESIGN.md (скрипт fetch-figma-assets) */}
              <img
                src="/figma/hero.png"
                alt=""
                onError={(e) => (e.currentTarget.style.display = "none")}
                style={{
                  width: u(321.844),
                  height: u(572.168),
                  flex: "none",
                  objectFit: "cover",
                  transform: "rotate(3.18deg)",
                  mixBlendMode: "luminosity"
                }}
              />
            </div>
            <div
              style={{
                ...at(0, -37, { right: u(-6), left: "auto", textAlign: "right" }),
                ...display(128, 44, { letterSpacing: u(-6.4) }),
                ...GRADIENT_TEXT
              }}
            >
              {Math.round(totals?.calories || 0)}
            </div>
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 687 362" preserveAspectRatio="none" aria-hidden="true">
              <g stroke="#fff" strokeOpacity="0.2">
                <line x1="0" x2="679" y1="202.5" y2="202.5" />
                <line x1="0" x2="679" y1="246.5" y2="246.5" />
                <line x1="369.5" x2="369.5" y1="0" y2="362" />
                <line x1="567.5" x2="567.5" y1="0" y2="362" />
              </g>
            </svg>
            <div style={at(404, 99, { fontSize: fs(20), lineHeight: 0.895, color: "rgba(255,255,255,.8)", whiteSpace: "nowrap" })}>
              {profile ? `из ${profile.target_calories} ккал ${GOAL_LABEL[profile.goal] || ""}` : "профиль не настроен"}
            </div>
            {[
              ["Белки", totals?.protein, 166],
              ["Жиры", totals?.fat, 211],
              ["Углеводы", totals?.carbs, 256]
            ].map(([label, val, y]) => (
              <div key={label}>
                <div style={at(404, y, { fontFamily: FONT.unb, fontWeight: 300, fontSize: fs(20, 11) })}>{label}</div>
                <div
                  style={at(630, y, {
                    transform: "translateX(-50%)",
                    fontFamily: FONT.unb,
                    fontWeight: 300,
                    fontSize: fs(20, 11),
                    color: "rgba(255,255,255,.8)"
                  })}
                >
                  {Math.round(val || 0)}
                </div>
              </div>
            ))}
          </div>
          <Link href="/miniapp/nutrition" style={pillBtn(6, 271, BLUE)}>Питание</Link>
        </ShapeCard>

        {/* ---------- карточка 3: график ---------- */}
        <ShapeCard
          as={Link}
          href="/miniapp/charts"
          w={687}
          h={307}
          d={PATH_CHART}
          fill="#fff"
          className="rise-in"
          style={{ animationDelay: "180ms" }}
        >
          <div style={{ ...box(0, 0, 300, 106), background: "#fff", borderRadius: u(50) }} />
          <div
            style={{
              ...at(150, 13, { transform: "translateX(-50%)" }),
              ...display(64, 28, { letterSpacing: u(-3.2) }),
              ...GRADIENT_TEXT
            }}
          >
            {chart.avg}%
          </div>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 687 307" preserveAspectRatio="none" aria-hidden="true">
            <g stroke="#000" strokeOpacity="0.2">
              <line x1="68" x2="618" y1="88.5" y2="88.5" />
              <line x1="68" x2="618" y1="145.5" y2="145.5" />
              <line x1="68" x2="618" y1="202.5" y2="202.5" />
            </g>
            <g stroke="#000" strokeOpacity="0.5" strokeWidth="4">
              <line x1="68" x2="618" y1="259" y2="259" />
              <line x1="618" x2="618" y1="28" y2="259" />
            </g>
            {chart.path && <path d={chart.path} stroke={BLUE} strokeWidth="4" fill="none" />}
            {chart.pts.length === 1 && <circle cx={chart.pts[0].x} cy={chart.pts[0].y} r="6" fill={BLUE} />}
          </svg>
          {[["0", 240], ["25", 183], ["50", 126], ["75", 69]].map(([t, y]) => (
            <span
              key={t}
              style={at(623, y, { fontFamily: FONT.unb, fontSize: fs(15, 8), color: "rgba(0,0,0,.5)" })}
            >
              {t}
            </span>
          ))}
          <span style={at(68, 263, { fontFamily: FONT.unb, fontSize: fs(15, 8), color: "rgba(0,0,0,.5)", whiteSpace: "nowrap" })}>
            {chart.from}
          </span>
          <span style={at(554, 263, { fontFamily: FONT.unb, fontSize: fs(15, 8), color: "rgba(0,0,0,.5)", whiteSpace: "nowrap" })}>
            {chart.to}
          </span>
          {!chart.pts.length && (
            <span style={at(343, 150, { transform: "translateX(-50%)", fontSize: fs(18, 10), color: "rgba(0,0,0,.4)", whiteSpace: "nowrap" })}>
              пока нет данных за месяц
            </span>
          )}
        </ShapeCard>
      </div>
    </div>
  );
}
