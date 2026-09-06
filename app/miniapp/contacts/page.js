"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import GlassPanel from "@/components/GlassPanel";
import { IconArrowRight, IconUsers } from "@/components/icons";

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet("/api/contacts").then((d) => {
      setContacts(d.contacts || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-5">
      <header className="rise-in">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-1">Контакты</p>
        <h1 className="font-display text-[28px] leading-none">Записная книжка</h1>
      </header>

      <div className="space-y-2.5">
        {loading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="glass h-[62px] animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          ))}

        {!loading &&
          contacts.map((c, i) => (
            <GlassPanel
              key={c.id}
              as="a"
              href={`https://t.me/${c.telegram_username}`}
              target="_blank"
              rel="noreferrer"
              className="p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform"
              delay={i * 60}
            >
              <div className="w-10 h-10 shrink-0 flex items-center justify-center border border-white/20 font-display text-sm">
                {c.telegram_username?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">@{c.telegram_username}</div>
                {c.label && <div className="text-xs text-white/40 truncate mt-0.5">{c.label}</div>}
              </div>
              <IconArrowRight size={16} className="text-white/30 shrink-0" />
            </GlassPanel>
          ))}

        {!loading && contacts.length === 0 && (
          <GlassPanel className="p-6 flex flex-col items-center text-center gap-2">
            <IconUsers size={22} className="text-white/30" />
            <p className="text-sm text-white/45">
              Пусто. Отправь боту «@username Подпись» — контакт появится здесь.
            </p>
          </GlassPanel>
        )}
      </div>
    </div>
  );
}
