export default function GlassPanel({
  children,
  className = "",
  strong = false,
  delay = 0,
  as: Tag = "div",
  ...rest
}) {
  return (
    <Tag
      className={`rise-in ${strong ? "glass-strong" : "glass"} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
