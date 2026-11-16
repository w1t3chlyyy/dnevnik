"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavDashboard, NavContacts, NavLinks, NavTelegram } from "./navIcons";
import { u, fs, PAGE_PAD } from "@/lib/fx";

const items = [
  { href: "/miniapp/dashboard", label: "Дашборд", Icon: NavDashboard },
  { href: "/miniapp/contacts", label: "Контакты", Icon: NavContacts },
  { href: "/miniapp/links", label: "Связки", Icon: NavLinks },
  { href: "/miniapp/telegram", label: "Telegram", Icon: NavTelegram }
];

// Всё, что не контакты/связки/telegram (цели, питание, графики, итоги…), —
// «дети» дашборда, поэтому подсвечиваем первую вкладку.
function activeIndex(path) {
  if (path.startsWith("/miniapp/contacts")) return 1;
  if (path.startsWith("/miniapp/links")) return 2;
  if (path.startsWith("/miniapp/telegram")) return 3;
  return 0;
}

export default function BottomNav() {
  const pathname = usePathname() || "";
  const idx = activeIndex(pathname);

  return (
    <nav
      className="fixed inset-x-0 z-40 mx-auto w-full max-w-md"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + min(3.78vw, 17px))", paddingInline: PAGE_PAD }}
    >
      <div
        className="cq relative"
        style={{
          aspectRatio: "687 / 109",
          borderRadius: u(50),
          background: "rgba(217,217,217,0.2)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)"
        }}
      >
        <div
          className="absolute"
          style={{
            top: u(8),
            height: u(93),
            width: u(157),
            left: `calc(${idx} * 25% + (25% - ${u(157)}) / 2)`,
            borderRadius: u(50),
            background: "rgba(217,217,217,0.2)",
            transition: "left .45s cubic-bezier(.16,1,.3,1)"
          }}
        />
        <div className="absolute inset-0 grid grid-cols-4">
          {items.map(({ href, label, Icon }, i) => (
            <Link
              key={href}
              href={href}
              className="relative flex flex-col items-center text-white"
              style={{ paddingTop: u(23), opacity: i === idx ? 1 : 0.8 }}
            >
              <span style={{ width: u(48), height: u(48), display: "block" }}>
                <Icon />
              </span>
              <span style={{ fontSize: fs(12, 10), marginTop: u(5), lineHeight: "normal" }}>{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
