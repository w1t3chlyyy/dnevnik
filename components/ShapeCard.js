// Карточка-«конструктор» из Figma: фон — SVG-контур (со вырезами), внутри
// всё позиционируется абсолютно в координатах макета (см. lib/fx.js).
export default function ShapeCard({
  w,
  h,
  d,
  fill,
  children,
  className = "",
  style,
  as: Tag = "div",
  ...rest
}) {
  return (
    <Tag
      className={`cq relative block ${className}`}
      style={{ aspectRatio: `${w} / ${h}`, ...style }}
      {...rest}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={d} fill={fill} />
      </svg>
      {children}
    </Tag>
  );
}
