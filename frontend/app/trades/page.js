"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Card, Badge, ErrorBanner, EmptyState } from "@/components/ui";

export default function TradesPage() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/api/paper/orders").then(setOrders).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Paper order history</h1>
      <ErrorBanner message={error} />

      <Card title={`All orders${orders ? ` (${orders.length})` : ""}`}>
        {orders === null ? (
          <EmptyState>Loading…</EmptyState>
        ) : orders.length === 0 ? (
          <EmptyState>No paper orders placed yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-[#898781] dark:border-white/10">
                  <th className="py-2 pr-4">Time</th><th className="py-2 pr-4">Symbol</th><th className="py-2 pr-4">Side</th><th className="py-2 pr-4">Qty</th><th className="py-2 pr-4">Fill price</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Reason</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-2 pr-4 text-xs text-[#898781]">{formatDateTime(o.created_at)}</td>
                    <td className="py-2 pr-4 font-medium">{o.symbol}</td>
                    <td className="py-2 pr-4"><Badge status={o.side === "buy" ? "good" : "critical"}>{o.side}</Badge></td>
                    <td className="py-2 pr-4">{o.quantity}</td>
                    <td className="py-2 pr-4">{o.filled_price ? `₹${o.filled_price.toFixed(2)}` : "—"}</td>
                    <td className="py-2 pr-4"><Badge status={o.status === "filled" ? "good" : "critical"}>{o.status}</Badge></td>
                    <td className="py-2 pr-4 text-[#898781]">{o.reason || o.reject_reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
