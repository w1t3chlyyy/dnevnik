// Распознавание речи через Qwen ASR (DashScope, OpenAI-совместимый эндпоинт —
// тот же QWEN_API_URL, что и для чата).
const ASR_MODEL = process.env.QWEN_ASR_MODEL || "qwen3-asr-flash";

export async function transcribeTelegramVoice(filePath, mime = "audio/ogg") {
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const fileRes = await fetch(url);
  if (!fileRes.ok) throw new Error(`Не скачался файл из Telegram (${fileRes.status})`);
  const b64 = Buffer.from(await fileRes.arrayBuffer()).toString("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(process.env.QWEN_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.QWEN_API_KEY}` },
      body: JSON.stringify({
        model: ASR_MODEL,
        messages: [
          {
            role: "user",
            content: [{ type: "input_audio", input_audio: { data: `data:${mime};base64,${b64}` } }]
          }
        ],
        stream: false,
        asr_options: { language: "ru", enable_itn: false }
      }),
      signal: controller.signal
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.choices) {
      throw new Error(`ASR вернул ошибку (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
    }
    return String(data.choices[0].message.content || "").trim();
  } finally {
    clearTimeout(timeout);
  }
}
