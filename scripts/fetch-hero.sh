#!/usr/bin/env sh
# Скачивает картинку персонажа для карточки питания в public/figma/hero.png.
# Токен Figma не нужен: ссылка — публичный временный URL ассета из макета.
# Ссылка живёт около недели; если скрипт пишет «не скачалось» — запроси свежую
# или экспортируй слой «image 200» из Figma вручную (PNG, 2x) и положи в public/figma/hero.png.
#
#   sh scripts/fetch-hero.sh                      # ссылка по умолчанию
#   HERO_URL="https://..." sh scripts/fetch-hero.sh
set -eu
URL="${HERO_URL:-https://www.figma.com/api/mcp/asset/5a0a5554-2342-4b7b-a351-4ba15a631ad6}"
OUT="public/figma/hero.png"
mkdir -p public/figma
if curl -fsSL --retry 3 --max-time 60 -o "$OUT.tmp" "$URL"; then
  # проверяем, что скачали именно PNG, а не страницу с ошибкой
  if head -c 8 "$OUT.tmp" | od -An -tx1 | tr -d ' \n' | grep -q '^89504e47'; then
    mv "$OUT.tmp" "$OUT"
    echo "OK: $OUT ($(wc -c < "$OUT") байт)"
    exit 0
  fi
fi
rm -f "$OUT.tmp"
echo "Не скачалось: ссылка устарела или недоступна." >&2
echo "Экспортируй слой «image 200» из Figma (PNG) в $OUT или задай HERO_URL." >&2
exit 1
