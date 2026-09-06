import { google } from "googleapis";
import { verifyState } from "@/lib/oauthState";
import { saveRefreshToken } from "@/lib/googleDrive";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return page({
      ok: false,
      title: "Доступ не выдан",
      message:
        "Подключение отменено в Google. Ничего не сломалось — просто вернись в бота и открой /settings, чтобы попробовать снова."
    });
  }

  const telegramId = verifyState(state);
  if (!telegramId || !code) {
    return page({
      ok: false,
      title: "Ссылка недействительна",
      message: "Эта ссылка устарела или повреждена. Открой /settings в боте и получи новую."
    });
  }

  try {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return page({
        ok: false,
        title: "Google не выдал refresh token",
        message:
          "Обычно это значит, что доступ уже был выдан раньше. Открой myaccount.google.com/permissions, отзови доступ для этого приложения и попробуй /settings ещё раз."
      });
    }

    await saveRefreshToken(telegramId, tokens.refresh_token);

    return page({
      ok: true,
      title: "Google Drive подключён",
      message: "Готово. Вернись в Telegram — теперь файлы, которые ты присылаешь боту, будут сохраняться на Drive."
    });
  } catch (e) {
    console.error("oauth-callback failed:", e.message);
    return page({
      ok: false,
      title: "Не удалось завершить подключение",
      message: "Что-то пошло не так на стороне сервера. Попробуй ещё раз через /settings в боте через минуту."
    });
  }
}

function page({ ok, title, message }) {
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at 30% 20%, #17171a 0%, #060607 60%);
    font-family: 'Inter', -apple-system, sans-serif;
    color: #F5F5F3;
    padding: 24px;
  }
  .card {
    max-width: 380px;
    width: 100%;
    padding: 32px 28px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.05);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    text-align: center;
  }
  .mark {
    width: 44px;
    height: 44px;
    margin: 0 auto 20px;
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  h1 { font-size: 19px; font-weight: 600; margin: 0 0 10px; letter-spacing: -0.01em; }
  p { font-size: 14px; line-height: 1.5; color: rgba(245,245,243,0.65); margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <div class="mark">
      ${
        ok
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12.5L9.5 18L20 6" stroke="#F5F5F3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 6L18 18M18 6L6 18" stroke="#F5F5F3" stroke-width="2" stroke-linecap="round"/></svg>'
      }
    </div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
