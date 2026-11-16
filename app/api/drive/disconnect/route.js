import { verifyInitData } from "@/lib/verifyTelegram";
import { disconnectDrive } from "@/lib/googleDrive";

export async function POST(req) {
  const initData = req.headers.get("x-telegram-init-data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return Response.json({ error: "unauthorized" }, { status: 401 });

  await disconnectDrive(tgUser.id);
  return Response.json({ ok: true });
}
