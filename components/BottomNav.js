"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDashboard, IconTarget, IconChart, IconUsers, IconSettings } from "./icons";

const items = [
  { href: "/miniapp/dashboard", label: "Дэшборд", Icon: IconDashboard },
  { href: "/miniapp/goals", label: "Цели", Icon: IconTarget },
  { href: "/miniapp/charts", label: "Графики", Icon: IconChart },
  { href: "/miniapp/contacts", label: "Контакты", Icon: IconUsers },
  { href: "/miniapp/settings", label: "Настройки", Icon: IconSettings }
];

export default function BottomNav() {
  const pathname = usePathname();
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.href === pathname)
  );

  return (
    <nav className="fixed bottom-4 left-0 right-0 px-4 z-40">
      <div className="max-w-md mx-auto glass-strong relative flex rounded-pill overflow-hidden p-1">
        <div
          className="absolute top-1 bottom-1 rounded-pill transition-transform duration-500 ease-out"
          style={{
            width: `calc(${100 / items.length}% - 4px)`,
            transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 4}px))`,
            background: "linear-gradient(135deg, rgba(139,123,255,0.35), rgba(94,230,200,0.22))",
            boxShadow: "0 4px 16px -4px rgba(139,123,255,0.4)"
          }}
        />
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 rounded-pill transition-colors duration-300 ${
                active ? "text-white" : "text-white/40"
              }`}
            >
              <Icon size={18} className={active ? "float-slow" : ""} />
              <span className="nav-item">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
