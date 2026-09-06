"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    apiGet("/api/contacts").then((d) => setContacts(d.contacts || []));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Контакты</h1>
      {contacts.map((c) => (
        <a
          key={c.id}
          href={`https://t.me/${c.telegram_username}`}
          target="_blank"
          rel="noreferrer"
          className="card flex justify-between items-center block"
        >
          <div>
            <div className="font-medium">@{c.telegram_username}</div>
            {c.label && <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>}
          </div>
          <span className="text-lg">→</span>
        </a>
      ))}
      {contacts.length === 0 && (
        <p className="text-sm text-gray-500">
          Пусто. Отправь боту «@username Подпись» — контакт появится здесь.
        </p>
      )}
    </div>
  );
}
