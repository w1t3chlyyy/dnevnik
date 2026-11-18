// Запуск из корня репозитория:  node scripts/recolor.mjs
// Приводит страницы charts и nutrition к палитре «синий / белый / чёрный».
// Идемпотентный: повторный запуск ничего не меняет.
import { readFileSync, writeFileSync } from "node:fs";

const FILES = ["app/miniapp/charts/page.js", "app/miniapp/nutrition/page.js"];
const MAP = [
  ["#8b7bff", "#2f6bff"],
  ["#5ee6c8", "#ffffff"],
  ["#ff9f6e", "#1c4099"],
  ["#ff8bd6", "#d6e2ff"],
  ["#7fd1ff", "#d6e2ff"],
  ["#f4e07a", "#2f6bff"]
];

for (const f of FILES) {
  let src;
  try { src = readFileSync(f, "utf8"); } catch { console.warn(`нет файла ${f}`); continue; }
  let out = src;
  for (const [a, b] of MAP) out = out.split(a).join(b);
  if (out !== src) { writeFileSync(f, out); console.log(`перекрашен: ${f}`); }
  else console.log(`без изменений: ${f}`);
}
