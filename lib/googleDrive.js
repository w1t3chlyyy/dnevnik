import { google } from "googleapis";
import { supabaseAdmin as db } from "./supabase";
import { signState } from "./oauthState";

function getOAuthClient(user) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials({ refresh_token: user.google_refresh_token });
  return client;
}

// Ссылка для подключения Google Drive конкретным telegram-пользователем.
// state подписан, чтобы в oauth-callback можно было безопасно узнать,
// кому именно сохранять refresh_token.
export function getGoogleAuthUrl(telegramId) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return client.generateAuthUrl({
    access_type: "offline", // обязателен, чтобы Google выдал refresh_token
    prompt: "consent", // иначе refresh_token придёт только при самом первом разрешении
    scope: ["https://www.googleapis.com/auth/drive.file"],
    state: signState(telegramId)
  });
}

// вызывается из app/api/drive/oauth-callback после первого разрешения доступа
export async function saveRefreshToken(telegramId, refreshToken) {
  await db
    .from("users")
    .update({ google_refresh_token: refreshToken })
    .eq("telegram_id", telegramId);
}

export async function disconnectDrive(telegramId) {
  await db
    .from("users")
    .update({ google_refresh_token: null, google_drive_folder_id: null })
    .eq("telegram_id", telegramId);
}

export async function uploadToDrive(user, telegramFile, message) {
  const auth = getOAuthClient(user);
  const drive = google.drive({ version: "v3", auth });

  // Создаём/находим корневую папку "Business Goals Bot" один раз
  let folderId = user.google_drive_folder_id;
  if (!folderId) {
    const folder = await drive.files.create({
      requestBody: {
        name: "Business Goals Bot",
        mimeType: "application/vnd.google-apps.folder"
      },
      fields: "id"
    });
    folderId = folder.data.id;
    await db.from("users").update({ google_drive_folder_id: folderId }).eq("id", user.id);
  }

  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${telegramFile.file_path}`;
  const fileRes = await fetch(fileUrl);
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  const fileType = message.photo ? "photo" : message.video ? "video" : "document";
  const fileName =
    message.document?.file_name || `${fileType}_${Date.now()}.${fileType === "photo" ? "jpg" : "mp4"}`;

  const { Readable } = await import("stream");
  const uploaded = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { body: Readable.from(buffer) },
    fields: "id, webViewLink"
  });

  await db.from("files_log").insert({
    user_id: user.id,
    file_name: fileName,
    drive_file_id: uploaded.data.id,
    drive_link: uploaded.data.webViewLink,
    file_type: fileType
  });

  return { link: uploaded.data.webViewLink };
}
