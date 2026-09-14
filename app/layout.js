import "./globals.css";
import Script from "next/script";
import BottomNav from "@/components/BottomNav";
import TelegramInit from "@/components/TelegramInit";
import AmbientBackground from "@/components/AmbientBackground";

export const metadata = { title: "Business Goals" };

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body className="max-w-md mx-auto min-h-screen pb-28">
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <AmbientBackground />
        <TelegramInit />
        <main className="px-4 pt-6">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
