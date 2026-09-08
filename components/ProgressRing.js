"use client";
import { useEffect, useId, useState } from "react";

export default function ProgressRing({
  value = 0, // 0..100
  size = 128,
  stroke = 6,
  label,
  sublabel,
  done = false,
  className = ""
}) {
  const [mounted, setMounted] = useState(false);
  const gradientId = useId();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const offset = circumference - (mounted ? clamped : 0) / 100 * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {done && <div className="absolute inset-0 rounded-full completion-glow" />}
      <svg width={size} height={size} className="-rotate-90 relative">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={done ? "#5ee6c8" : "#8b7bff"} />
            <stop offset="100%" stopColor={done ? "#8ff7d8" : "#5ee6c8"} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(245,245,243,0.12)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="font-mono text-xl">{label}</span>}
        {sublabel && <span className="text-[10px] text-white/40 mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
}
