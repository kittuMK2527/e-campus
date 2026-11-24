"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

interface Announcement {
  id: string;
  title: string;
  description?: string | null;
  created_by?: string | null;
  created_at?: string | null;
}

export default function AnnouncementsPage() {
  const [announcementId, setAnnouncementId] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setAnnouncementId(new URLSearchParams(window.location.search).get("id") || "");
    setReady(true);
  }, []);

  const announcementsQuery = useQuery<Announcement[]>({
    queryKey: ["announcements", "notification-feed", announcementId],
    enabled: ready,
    queryFn: async () => {
      const qs = announcementId ? `?id=${encodeURIComponent(announcementId)}` : "";
      const data = await apiFetch<any>(`/api/announcements${qs}`);
      if (!data?.success) throw new Error(data?.message || "Could not load announcements");
      return data.announcements || [];
    },
  });

  const items = announcementsQuery.data || [];
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <section className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><Megaphone className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Announcements</h1>
            <p className="text-sm text-slate-500">Updates for your role and campus.</p>
          </div>
        </header>

        {announcementsQuery.isPending ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading announcements…</div>
        ) : announcementsQuery.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center text-sm text-rose-600">Could not load announcements.</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{announcementId ? "This announcement is no longer available." : "No announcements yet."}</div>
        ) : items.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">{item.title}</h2>
            {item.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.description}</p>}
            <p className="mt-4 text-xs text-slate-400">
              {item.created_by ? `Posted by ${item.created_by}` : "Campus announcement"}
              {item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ""}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
