// Скачивает картинку персонажа (image 200) из Figma в public/figma/hero.png.
// Нужен personal access token Figma (Settings -> Security -> Personal access tokens, право File content: read).
//   FIGMA_TOKEN=figd_xxx node scripts/fetch-figma-assets.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const FILE_KEY = "HBdxopn77lBdsC9ORMXkPW";
const IMAGE_HASH = "9986e46f181c7e4294d6e5013941327902e3a144"; // imageHash слоя «image 200»
const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error("Задай FIGMA_TOKEN: FIGMA_TOKEN=figd_xxx node scripts/fetch-figma-assets.mjs");
  process.exit(1);
}

const res = await fetch(`https://api.figma.com/v1/files/${FILE_KEY}/images`, {
  headers: { "X-Figma-Token": token }
});
if (!res.ok) {
  console.error(`Figma API: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const url = (await res.json())?.meta?.images?.[IMAGE_HASH];
if (!url) {
  console.error("Картинка с таким hash не найдена — возможно, слой заменили в макете.");
  process.exit(1);
}
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
mkdirSync("public/figma", { recursive: true });
writeFileSync("public/figma/hero.png", buf);
console.log(`Сохранено public/figma/hero.png (${buf.length} байт)`);
