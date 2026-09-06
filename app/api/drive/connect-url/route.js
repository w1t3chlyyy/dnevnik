import { verifyInitData } from "@/lib/verifyTelegram";
import { getGoogleAuthUrl } from "@/lib/googleDrive";

export async function GET(req) {
  const initData = req.headers.get("x-telegram-init-data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) {
    return Response.json(
      { error: "Google OAuth не настроен на сервере (GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI)" },
      { status: 500 }
    );
  }

  const url = getGoogleAuthUrl(tgUser.id);
  return Response.json({ url });
}
