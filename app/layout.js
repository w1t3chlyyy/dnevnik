import "./globals.css";
import Script from "next/script";
import { Unbounded, Montserrat, IBM_Plex_Mono } from "next/font/google";
import BottomNav from "@/components/BottomNav";
import TelegramInit from "@/components/TelegramInit";
import AmbientBackground from "@/components/AmbientBackground";

// Шрифты скачиваются при сборке и отдаются с вашего домена — не зависят от доступа к Google.
const unbounded = Unbounded({ subsets: ["cyrillic", "latin"], weight: ["300", "400", "500"], variable: "--font-unbounded", display: "swap" });
const montserrat = Montserrat({ subsets: ["cyrillic", "latin"], weight: ["400", "500", "600"], variable: "--font-montserrat", display: "swap" });
const plex = IBM_Plex_Mono({ subsets: ["cyrillic", "latin"], weight: ["400", "500"], variable: "--font-plex", display: "swap" });

export const metadata = { title: "Business Goals" };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }) {
  return (
    <html lang="ru" className={`${unbounded.variable} ${montserrat.variable} ${plex.variable}`}>
      <body className="max-w-md mx-auto min-h-screen pb-40">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <AmbientBackground />
        <TelegramInit />
        <main className="px-5 pt-8">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
