"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavDashboard, NavContacts, NavLinks, NavTelegram } from "./navIcons";
import { u, fs, at, PAGE_PAD } from "@/lib/fx";

// cx — центр иконки/подписи относительно левого края панели (координаты Figma).
const items = [
  { href: "/miniapp/dashboard", label: "Дашборд", Icon: NavDashboard, cx: 87 },
  { href: "/miniapp/contacts", label: "Контакты", Icon: NavContacts, cx: 261.5 },
  { href: "/miniapp/links", label: "Связки", Icon: NavLinks, cx: 428.5 },
  { href: "/miniapp/telegram", label: "Telegram", Icon: NavTelegram, cx: 594.5 }
];

// Цели, питание, графики, итоги… — «дети» дашборда, подсвечиваем первую вкладку.
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
      <div className="cq relative" style={{ aspectRatio: "687 / 109", borderRadius: u(50), background: "rgba(217,217,217,0.2)" }}>
        {/* активная «таблетка»: 157x93, в макете смещена на +5.5 от центра иконки */}
        <div
          style={{
            position: "absolute",
            top: u(8),
            width: u(157),
            height: u(93),
            left: u(items[idx].cx + 5.5 - 78.5),
            borderRadius: u(50),
            background: "rgba(217,217,217,0.2)",
            transition: "left .45s cubic-bezier(.16,1,.3,1)"
          }}
        />
        {items.map(({ href, label, Icon, cx }) => (
          <Link key={href} href={href} className="text-white" style={at(cx - 60, 0, { width: u(120), height: "100%" })}>
            <span style={at(60 - 24, 23, { width: u(48), height: u(48), display: "block" })}>
              <Icon />
            </span>
            <span
              style={at(0, 76, { width: "100%", textAlign: "center", fontSize: fs(12), lineHeight: "normal", whiteSpace: "nowrap" })}
            >
              {label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
