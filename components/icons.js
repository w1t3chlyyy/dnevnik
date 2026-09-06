// Небольшой набор SVG-иконок, нарисованных вручную под стиль приложения —
// тонкая линия (1.5px), без заливки, чтобы не тянуть отдельную библиотеку.

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

export function IconDashboard({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3.5" y="3.5" width="7" height="9" />
      <rect x="13.5" y="3.5" width="7" height="5" />
      <rect x="13.5" y="11.5" width="7" height="9" />
      <rect x="3.5" y="15.5" width="7" height="5" />
    </svg>
  );
}

export function IconTarget({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="12" cy="12" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChart({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 20V9" />
      <path d="M12 20V4" />
      <path d="M20 20v-7" />
      <path d="M3 20.5h18" strokeOpacity="0.4" />
    </svg>
  );
}

export function IconUsers({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3 19.5c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5" />
      <path d="M15.5 6.5c1.5.3 2.75 1.6 2.75 3.25S17 12.7 15.5 13" />
      <path d="M17.5 14.3c2 .6 3.5 2.2 3.5 5.2" />
    </svg>
  );
}

export function IconSettings({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.6 6.4l-1.6 1.6M8 16l-1.6 1.6M17.6 17.6L16 16M8 8 6.4 6.4" />
    </svg>
  );
}

export function IconCloud({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M7 18.5a4 4 0 0 1-.5-7.97 5 5 0 0 1 9.66-1.86A4.5 4.5 0 0 1 17.5 18.5H7Z" />
    </svg>
  );
}

export function IconCheck({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4.5 12.5L9.5 17.5L19.5 6.5" />
    </svg>
  );
}

export function IconArrowRight({ size = 18, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconPlus({ size = 18, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconAlert({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}
