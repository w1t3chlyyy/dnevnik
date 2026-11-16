// Единицы макета Figma. Рабочая ширина контента во фрейме = 687px.
// u(n) = n «пикселей макета» -> cqw относительно ближайшего контейнера .cq
// (ShapeCard, шапка страницы и нижняя панель — все они .cq).
export const u = (n) => `${(n / 6.87).toFixed(3)}cqw`;
// Шрифт: масштаб макета, но не меньше min px (иначе в Telegram 390px текст нечитаем).
export const fs = (n, min = 9) => `max(${min}px, ${u(n)})`;
export const at = (x, y, extra = {}) => ({ position: "absolute", left: u(x), top: u(y), ...extra });
export const box = (x, y, w, h, extra = {}) => ({
  position: "absolute",
  left: u(x),
  top: u(y),
  width: u(w),
  height: u(h),
  ...extra
});
// Горизонтальный отступ страницы как во фрейме: 107 / 900 от ширины экрана.
export const PAGE_PAD = "min(11.89vw, 53.3px)";
