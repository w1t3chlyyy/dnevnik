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
      <div className="max-w-md mx-auto glass-strong relative flex rounded-none overflow-hidden">
        <div
          className="absolute top-0 bottom-0 bg-white/10 transition-transform duration-300 ease-out"
          style={{
            width: `${100 / items.length}%`,
            transform: `translateX(${activeIndex * 100}%)`
          }}
        />
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                active ? "text-white" : "text-white/40"
              }`}
            >
              <Icon size={18} />
              <span className="nav-item">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
