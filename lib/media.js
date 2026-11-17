// Обработка картинок для .stories. Видео (.circle/.save) делает воркер — см. worker/.
export async function sliceInto9(buf, tileW = 720, tileH = 1280) {
  const sharp = (await import("sharp")).default;
  const W = tileW * 3;
  const H = tileH * 3; // общий холст 9:16 -> каждая плитка тоже 9:16 (формат историй)
  const base = await sharp(buf).rotate().resize(W, H, { fit: "cover", position: "centre" }).jpeg({ quality: 92 }).toBuffer();
  const tiles = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      tiles.push(
        await sharp(base)
          .extract({ left: c * tileW, top: r * tileH, width: tileW, height: tileH })
          .jpeg({ quality: 90 })
          .toBuffer()
      );
    }
  }
  return tiles; // порядок: слева направо, сверху вниз
}

export async function downloadTelegramFile(filePath) {
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`);
  if (!res.ok) throw new Error(`Не скачался файл из Telegram (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
