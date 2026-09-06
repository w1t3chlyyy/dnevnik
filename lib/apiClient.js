export async function apiGet(path) {
  const initData = window.Telegram?.WebApp?.initData || "";
  const res = await fetch(path, {
    headers: { "x-telegram-init-data": initData }
  });
  return res.json();
}

export async function apiPost(path, body) {
  const initData = window.Telegram?.WebApp?.initData || "";
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": initData
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}
