#!/usr/bin/env sh
# Установка воркера на Ubuntu/Debian VPS (нужен root). Запускать из папки worker/:
#   sudo sh setup.sh
# Ставит ffmpeg, Node 20, yt-dlp, зависимости и systemd-сервис biz-worker (автозапуск).
set -eu
cd "$(dirname "$0")"

apt-get update
apt-get install -y ffmpeg curl python3 ca-certificates
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod +x /usr/local/bin/yt-dlp
npm install --omit=dev

if [ ! -f .env ]; then
  cp .env.example .env
  echo ">>> Заполни $(pwd)/.env и запусти скрипт ещё раз."
  exit 0
fi

cat > /etc/systemd/system/biz-worker.service <<UNIT
[Unit]
Description=Business bot worker (.circle / .save)
After=network-online.target

[Service]
WorkingDirectory=$(pwd)
EnvironmentFile=$(pwd)/.env
# yt-dlp часто ломается из-за обновлений сайтов — обновляем при каждом старте
ExecStartPre=-/usr/local/bin/yt-dlp -U
ExecStart=$(command -v node) index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now biz-worker
echo "Готово. Логи: journalctl -u biz-worker -f"
