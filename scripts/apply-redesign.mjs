// Запуск из корня репозитория:  node scripts/apply-redesign.mjs [--dry]
// Переводит остальные страницы на палитру нового дашборда (без ручной правки
// каждого файла) и убирает цели дня из «Списка целей» (у них своя вкладка).
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const DRY = process.argv.includes("--dry");

// старый цвет -> цвет из Figma
const COLORS = [
  ["#8b7bff", "#2f6bff"], // фиолетовый акцент -> синий
  ["#5ee6c8", "#d6e2ff"], // бирюзовый -> светло-голубой
  ["#ff9f6e", "#1c4099"], // оранжевый -> тёмно-синий
  ["#ff8bd6", "#7fa3ff"],
  ["#7fd1ff", "#ffffff"],
  ["#f4e07a", "#5b8bff"],
  ["#8ff7d8", "#ffffff"],
  ["rgba(139, 123, 255", "rgba(47, 107, 255"],
  ["rgba(139,123,255", "rgba(47,107,255"],
  ["rgba(94, 230, 200", "rgba(214, 226, 255"],
  ["rgba(94,230,200", "rgba(214,226,255"]
];

// точечные правки (ищем точную строку и проверяем, что нашли)
const PATCHES = [
  {
    file: "app/miniapp/goals/page.js",
    from: 'goals.filter((g) => g.status === "active"), [goals]',
    to: 'goals.filter((g) => g.status === "active" && !g.is_daily), [goals]'
  },
  {
    file: "app/miniapp/goals/page.js",
    from: 'goals.filter((g) => g.status !== "active"), [goals]',
    to: 'goals.filter((g) => g.status !== "active" && !g.is_daily), [goals]'
  }
];

const SKIP = new Set(["node_modules", ".next", ".git"]);
const NEW_FILES = ["app/miniapp/dashboard/page.js", "components/AmbientBackground.js", "components/BottomNav.js", "components/ShapeCard.js", "components/navIcons.js", "app/globals.css"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ([".js", ".jsx", ".css"].includes(extname(p))) out.push(p);
  }
  return out;
}

let changed = 0;
const files = [...walk("app"), ...walk("components"), "tailwind.config.js"].filter(
  (f) => !NEW_FILES.includes(f.replaceAll("\\", "/"))
);
for (const f of files) {
  const src = readFileSync(f, "utf8");
  let out = src;
  for (const [a, b] of COLORS) out = out.split(a).join(b);
  for (const p of PATCHES) if (f.replaceAll("\\", "/") === p.file) out = out.split(p.from).join(p.to);
  if (out !== src) {
    changed++;
    console.log(`${DRY ? "[dry] " : ""}обновлён: ${f}`);
    if (!DRY) writeFileSync(f, out);
  }
}

for (const p of PATCHES) {
  const ok = readFileSync(p.file, "utf8").includes(DRY ? p.from : p.to);
  if (!ok) console.warn(`⚠ не нашёл фрагмент в ${p.file}: ${p.from}  — поправь вручную`);
}
console.log(`Готово, файлов изменено: ${changed}`);
