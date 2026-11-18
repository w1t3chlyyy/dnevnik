// Воркер для тяжёлых команд (.circle, .save): нужен ffmpeg и yt-dlp, на Vercel их не запустить.
// Берёт задачи из таблицы jobs (их кладёт бот), делает видео и отправляет через Bot API
// от имени владельца (business_connection_id). Запуск: node index.mjs (см. setup.sh).
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const requiredEnv = ["TELEGRAM_BOT_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length) throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const API = `https://api.telegram.org/bot${TOKEN}`;
const LIMIT = 49 * 1024 * 1024; // Bot API принимает файлы до 50 МБ

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d).slice(-800)));
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`${cmd}: ${err.trim().split("\n").pop() || "код " + c}`))));
  });

async function tg(method, fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, typeof v === "string" ? v : JSON.stringify(v));
  if (file) fd.append(file.field, new Blob([file.buf]), file.name);
  const r = await fetch(`${API}/${method}`, { method: "POST", body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}

const notify = (id, text) =>
  tg("sendMessage", { chat_id: id, text }).catch((e) => {
    console.error("notification failed:", e.message);
  });

async function heartbeat() {
  const { error } = await db.from("worker_status").upsert({ id: "media", last_seen_at: new Date().toISOString() });
  if (error) throw error;
}

async function downloadFile(fileId, dest) {
  const info = await tg("getFile", { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${info.file_path}`);
  if (!r.ok) throw new Error(`скачивание из Telegram: ${r.status}`);
  await writeFile(dest, Buffer.from(await r.arrayBuffer()));
}

async function deleteCommand(p) {
  await tg("deleteBusinessMessages", { business_connection_id: p.connection_id, message_ids: [p.command_message_id] }).catch((e) => {
    console.error("deleteBusinessMessages:", e.message);
  });
}

// ---------- .circle ----------
async function circle(p, dir) {
  const src = join(dir, "in.mp4");
  const out = join(dir, "circle.mp4");
  await downloadFile(p.file_id, src);
  await run("ffmpeg", [
    "-y", "-i", src, "-t", "59",
    "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=640:640,format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "27",
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out
  ]);
  await tg(
    "sendVideoNote",
    { chat_id: p.chat_id, business_connection_id: p.connection_id, length: 640 },
    { field: "video_note", buf: await readFile(out), name: "circle.mp4" }
  );
  await deleteCommand(p);
}

// ---------- .save ----------
async function save(p, dir) {
  const args = [
    "--no-playlist", "--no-warnings", "--max-filesize", "300M",
    "-S", "res:720,+size", "-f", "bv*+ba/b", "--merge-output-format", "mp4",
    "-o", join(dir, "video.%(ext)s")
  ];
  if (process.env.YTDLP_COOKIES) args.push("--cookies", process.env.YTDLP_COOKIES); // для Instagram/VK часто нужны
  await run("yt-dlp", [...args, p.url]);

  const name = (await readdir(dir)).find((f) => f.startsWith("video."));
  if (!name) throw new Error("yt-dlp ничего не скачал");
  let path = join(dir, name);

  if ((await stat(path)).size > LIMIT) {
    const small = join(dir, "small.mp4");
    await run("ffmpeg", ["-y", "-i", path, "-vf", "scale=-2:540", "-c:v", "libx264", "-preset", "veryfast", "-crf", "31", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", small]);
    path = small;
    if ((await stat(path)).size > LIMIT) throw new Error("видео больше 50 МБ даже после сжатия");
  }
  await tg(
    "sendVideo",
    { chat_id: p.chat_id, business_connection_id: p.connection_id, supports_streaming: true },
    { field: "video", buf: await readFile(path), name: "video.mp4" }
  );
  await deleteCommand(p);
}

const HANDLERS = { circle, save };

async function claim() {
  const { data, error } = await db.from("jobs").select("*").eq("status", "queued").order("created_at").limit(1);
  if (error) throw error;
  if (!data?.length) return null;
  const { data: got, error: claimError } = await db
    .from("jobs")
    .update({ status: "running", started_at: new Date().toISOString(), attempts: (data[0].attempts || 0) + 1 })
    .eq("id", data[0].id)
    .eq("status", "queued") // защита от гонки, если воркеров несколько
    .select();
  if (claimError) throw claimError;
  return got?.[0] || null;
}

async function process_(job) {
  const dir = await mkdtemp(join(tmpdir(), "job-"));
  try {
    await HANDLERS[job.kind](job.payload, dir);
    const { error } = await db.from("jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", job.id);
    if (error) throw error;
    await notify(job.payload.owner_id, `✅ .${job.kind} готово. Отправлено в чат.`);
  } catch (e) {
    console.error(`job ${job.id} (${job.kind}) failed:`, e.message);
    try {
      const { error } = await db
        .from("jobs")
        .update({ status: "failed", error: e.message.slice(0, 500), finished_at: new Date().toISOString() })
        .eq("id", job.id);
      if (error) throw error;
    } catch (statusError) {
      console.error(`job ${job.id} status update failed:`, statusError.message);
    }
    await notify(job.payload.owner_id, `❌ .${job.kind}: ${e.message.slice(0, 300)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

await heartbeat();
const heartbeatTimer = setInterval(() => {
  heartbeat().catch((e) => console.error("worker heartbeat failed:", e.message));
}, 15_000);
heartbeatTimer.unref();
console.log("worker started");
for (;;) {
  try {
    const job = await claim();
    if (job) await process_(job);
    else await new Promise((r) => setTimeout(r, 2000));
  } catch (e) {
    console.error("loop error:", e.message);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
