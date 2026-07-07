"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Card, Button, ErrorBanner, EmptyState } from "@/components/ui";

export default function WatchlistPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api.get("/api/watchlist").then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const remove = async (stockId) => {
    try {
      await api.del(`/api/watchlist/${stockId}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Watchlist</h1>
      <ErrorBanner message={error} />

      <Card title={`Watched stocks${items ? ` (${items.length})` : ""}`}>
        {items === null ? (
          <EmptyState>Loading…</EmptyState>
        ) : items.length === 0 ? (
          <EmptyState>Nothing on your watchlist yet — add stocks from their detail page.</EmptyState>
        ) : (
          <div className="space-y-2">
            {items.map((s) => (
              <div key={s.watchlist_id} className="flex items-center justify-between rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                <div>
                  <Link href={`/stocks/${s.id}`} className="font-medium text-[#2a78d6] hover:underline dark:text-[#3987e5]">{s.symbol}</Link>
                  <span className="ml-2 text-[#898781]">{s.name}</span>
                  {s.watchlist_notes && <p className="mt-0.5 text-xs text-[#898781]">{s.watchlist_notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#898781]">Added {formatDateTime(s.added_at)}</span>
                  <Button variant="ghost" onClick={() => remove(s.id)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
