// Запуск из корня репозитория:  node scripts/apply-redesign.mjs [--dry]
// 1) переводит остальные страницы на палитру нового дашборда;
// 2) подключает Telegram Business (bot.js), цепочку ИИ-провайдеров (qwen.js),
//    секрет вебхука (route.js) и sharp (package.json).
// Скрипт идемпотентный: повторный запуск ничего не ломает.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const DRY = process.argv.includes("--dry");
const norm = (f) => f.replaceAll("\\", "/");

const COLORS = [
  ["#8b7bff", "#2f6bff"], ["#5ee6c8", "#d6e2ff"], ["#ff9f6e", "#1c4099"], ["#ff8bd6", "#7fa3ff"],
  ["#7fd1ff", "#ffffff"], ["#f4e07a", "#5b8bff"], ["#8ff7d8", "#ffffff"],
  ["rgba(139, 123, 255", "rgba(47, 107, 255"], ["rgba(139,123,255", "rgba(47,107,255"],
  ["rgba(94, 230, 200", "rgba(214, 226, 255"], ["rgba(94,230,200", "rgba(214,226,255"]
];

// { file, from, to } — точная замена; { file, append, marker } — дописать в конец, если marker ещё нет
const PATCHES = [
  { file: "app/miniapp/goals/page.js", from: 'goals.filter((g) => g.status === "active"), [goals]', to: 'goals.filter((g) => g.status === "active" && !g.is_daily), [goals]' },
  { file: "app/miniapp/goals/page.js", from: 'goals.filter((g) => g.status !== "active"), [goals]', to: 'goals.filter((g) => g.status !== "active" && !g.is_daily), [goals]' },

  // Telegram Business: обработчики регистрируем ДО session(), чтобы не плодить мусорные сессии на чужие чаты
  { file: "lib/bot.js", from: 'import { propagateDailyCompletion } from "./goalLinks";', to: 'import { propagateDailyCompletion } from "./goalLinks";\nimport { registerBusiness } from "./business";' },
  { file: "lib/bot.js", from: "bot.use(\n  session({", to: "registerBusiness(bot);\n\nbot.use(\n  session({" },

  // Цепочка ИИ: Qwen -> OpenRouter -> BazaarLink
  { file: "lib/qwen.js", from: 'import { supabaseAdmin as db } from "./supabase";', to: 'import { supabaseAdmin as db } from "./supabase";\nimport { callLLM } from "./llm";' },
  { file: "lib/qwen.js", from: "async function callQwen(messages, options = {}) {", to: "async function callQwenLegacy(messages, options = {}) {" },
  {
    file: "lib/qwen.js",
    marker: "// [redesign] provider chain",
    append:
      "\n\n// [redesign] provider chain: Qwen -> OpenRouter -> BazaarLink (см. lib/llm.js)\n" +
      "async function callQwen(messages, options = {}) {\n" +
      "  const {\n    toolsOverride = tools,\n    toolChoiceOverride = \"auto\",\n    responseFormat,\n    modelOverride = QWEN_MODEL,\n    timeoutMs = QWEN_TIMEOUT_MS\n  } = options;\n" +
      "  return callLLM(messages, {\n    tools: toolsOverride,\n    toolChoice: toolChoiceOverride,\n    responseFormat,\n    timeoutMs,\n    models: { qwen: modelOverride }\n  });\n}\n"
  },

  // Секрет вебхука: без него любой может отправить боту поддельный апдейт
  { file: "app/api/telegram/route.js", from: '  onTimeout: "return",', to: '  onTimeout: "return",\n  secretToken: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,' }
];

const SKIP = new Set(["node_modules", ".next", ".git"]);
const OWN = [
  "app/miniapp/dashboard/page.js", "app/miniapp/telegram/page.js", "app/miniapp/daily/page.js",
  "components/AmbientBackground.js", "components/BottomNav.js", "components/ShapeCard.js", "components/navIcons.js",
  "app/globals.css", "app/layout.js"
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ([".js", ".jsx", ".css"].includes(extname(p))) out.push(p);
  }
  return out;
}

const write = (f, s) => !DRY && writeFileSync(f, s);
let changed = 0;

// 1) палитра
for (const f of [...walk("app"), ...walk("components"), "tailwind.config.js"]) {
  if (OWN.includes(norm(f))) continue;
  const src = readFileSync(f, "utf8");
  let out = src;
  for (const [a, b] of COLORS) out = out.split(a).join(b);
  if (out !== src) {
    changed++;
    console.log(`${DRY ? "[dry] " : ""}цвета: ${f}`);
    write(f, out);
  }
}

// 2) точечные правки
for (const p of PATCHES) {
  let src;
  try {
    src = readFileSync(p.file, "utf8");
  } catch {
    console.warn(`⚠ нет файла ${p.file}`);
    continue;
  }
  let out = src;
  if (p.append) {
    if (!src.includes(p.marker)) out = src + p.append;
  } else if (src.includes(p.to) && !p.to.includes(p.from) ) {
    continue; // уже применено
  } else if (src.includes(p.from) && !(p.to.includes(p.from) && src.includes(p.to))) {
    out = src.replace(p.from, p.to);
  } else if (!src.includes(p.from) && !src.includes(p.to)) {
    console.warn(`⚠ не нашёл фрагмент в ${p.file}: ${p.from.split("\n")[0]}  — поправь вручную`);
  }
  if (out !== src) {
    changed++;
    console.log(`${DRY ? "[dry] " : ""}патч: ${p.file}`);
    write(p.file, out);
  }
}

// 3) sharp для .stories
try {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  if (!pkg.dependencies?.sharp) {
    pkg.dependencies = { ...pkg.dependencies, sharp: "^0.33.5" };
    console.log(`${DRY ? "[dry] " : ""}package.json: +sharp`);
    write("package.json", JSON.stringify(pkg, null, 2) + "\n");
    changed++;
  }
} catch (e) {
  console.warn("⚠ package.json:", e.message);
}

console.log(`Готово, изменений: ${changed}. Дальше: npm install`);
