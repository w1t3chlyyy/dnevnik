// Единицы макета Figma. Рабочая ширина контента во фрейме = 687px (фрейм 900px).
// u(n) = n «пикселей макета» -> cqw ближайшего контейнера .cq (ShapeCard, шапка, нижняя панель).
export const u = (n) => `${(n / 6.87).toFixed(3)}cqw`;

// Коэффициент текста. 1 = строго как в макете (900px -> ширина экрана).
// Если на телефоне подписи слишком мелкие — поставь 1.15–1.3 (меняются только шрифты).
export const TYPE_SCALE = 1;
export const fs = (n) => u(n * TYPE_SCALE);

// Шрифты подключены через next/font (layout.js), а не с Google по сети —
// иначе в РФ/Telegram они часто не успевают загрузиться и текст «прыгает».
export const FONT = {
  unb: "var(--font-unbounded), Unbounded, sans-serif",
  mont: "var(--font-montserrat), Montserrat, sans-serif",
  mono: "var(--font-plex), 'IBM Plex Mono', monospace"
};

export const at = (x, y, extra = {}) => ({ position: "absolute", left: u(x), top: u(y), ...extra });
export const box = (x, y, w, h, extra = {}) => ({
  position: "absolute",
  left: u(x),
  top: u(y),
  width: u(w),
  height: u(h),
  ...extra
});
// Горизонтальный отступ нижней панели = боковые поля страниц (px-5 в layout).
export const PAGE_PAD = "1.25rem";