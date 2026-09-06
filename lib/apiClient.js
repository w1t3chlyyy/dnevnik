export async function apiGet(path) {
  const initData = window.Telegram?.WebApp?.initData || "";
  const res = await fetch(path, {
    headers: { "x-telegram-init-data": initData }
  });
  return res.json();
}
