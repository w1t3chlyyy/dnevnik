"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/miniapp/dashboard", label: "Дэшборд" },
  { href: "/miniapp/goals", label: "Цели" },
  { href: "/miniapp/charts", label: "Графики" },
  { href: "/miniapp/contacts", label: "Контакты" }
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-black flex">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 text-center py-3 nav-item ${
              active ? "bg-black text-white" : "text-black"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
