// В России нет перехода на летнее время, поэтому МСК = UTC+3 круглый год —
// можно спокойно работать с фиксированным смещением без tz-библиотек.
export const MSK_OFFSET_MIN = 180;

// "Локальный" Date, у которого UTC-геттеры (getUTCHours и т.д.) возвращают
// значения по московскому времени. Удобно для сравнений/форматирования
// без риска словить локальную таймзону сервера Vercel (там всегда UTC).
export function localNow() {
  return new Date(Date.now() + MSK_OFFSET_MIN * 60000);
}

export function localDateStr(d = localNow()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD по МСК
}

export function localMinutesOfDay(d = localNow()) {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// Парсит "22:00", "9:05" и т.п. Возвращает {h, m} или null.
export function parseHHMM(text) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(text).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return { h, m: mi };
}

// Наступило ли сейчас (в пределах 15-минутного окна крона) время cronTimeStr ("HH:MM")?
export function isDueNow(cronTimeStr, windowMinutes = 15) {
  const parsed = parseHHMM(cronTimeStr);
  if (!parsed) return false;
  const target = parsed.h * 60 + parsed.m;
  const current = localMinutesOfDay();
  return Math.floor(target / windowMinutes) === Math.floor(current / windowMinutes);
}

// Ближайший момент "HH:MM по МСК" (сегодня, если ещё не прошло, иначе завтра),
// в виде ISO-строки в реальном UTC — то, что нужно писать в timestamptz-колонку.
export function nextOccurrenceUtcIso(h, m) {
  const nowLocal = localNow();
  const candidateLocalAsUtc = Date.UTC(
    nowLocal.getUTCFullYear(),
    nowLocal.getUTCMonth(),
    nowLocal.getUTCDate(),
    h,
    m,
    0
  );
  let candidateMs = candidateLocalAsUtc;
  if (candidateMs <= nowLocal.getTime()) {
    candidateMs += 24 * 3600 * 1000; // время уже прошло сегодня — переносим на завтра
  }
  const realUtcMs = candidateMs - MSK_OFFSET_MIN * 60000;
  return new Date(realUtcMs).toISOString();
}

// Границы календарных суток по МСК (для dateStr вида "YYYY-MM-DD"), в реальном UTC.
export function localDayBoundsUtc(dateStr = localDateStr()) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const startLocalAsUtcMs = Date.UTC(y, mo - 1, d, 0, 0, 0);
  const startRealUtcMs = startLocalAsUtcMs - MSK_OFFSET_MIN * 60000;
  const endRealUtcMs = startRealUtcMs + 24 * 3600 * 1000;
  return {
    startIso: new Date(startRealUtcMs).toISOString(),
    endIso: new Date(endRealUtcMs).toISOString()
  };
}

// Человекочитаемая дата/время по МСК для сообщений пользователю.
export function formatLocalHuman(isoUtc) {
  return new Date(isoUtc).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
