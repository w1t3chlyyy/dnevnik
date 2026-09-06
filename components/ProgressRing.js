"use client";
import { useEffect, useState } from "react";

export default function ProgressRing({
  value = 0, // 0..100
  size = 128,
  stroke = 6,
  label,
  sublabel,
  className = ""
}) {
  const [mounted, setMounted] = useState(false);
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
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(245,245,243,0.13)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#F5F5F3"
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
