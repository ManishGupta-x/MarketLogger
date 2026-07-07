"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatINR, formatPct } from "@/lib/format";
import { Card, Badge, StatTile, ErrorBanner } from "@/components/ui";

export default function HomePage() {
  const [state, setState] = useState({ loading: true, error: null });
  const [data, setData] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled([
        api.get("/api/paper/account"),
        api.get("/api/paper/positions"),
        api.get("/api/broker/mode"),
        api.get("/api/broker/status"),
        api.get("/api/risk/kill-switch"),
        api.get("/api/watchlist"),
        api.get("/api/backtests"),
        api.get("/api/risk/order-log?limit=5"),
      ]);
      if (cancelled) return;
      const [account, positions, mode, brokerStatus, killSwitch, watchlist, backtests, orderLog] = results.map((r) =>
        r.status === "fulfilled" ? r.value : null
      );
      const failed = results.find((r) => r.status === "rejected");
      setData({ account, positions, mode, brokerStatus, killSwitch, watchlist, backtests, orderLog });
      setState({ loading: false, error: failed ? "Couldn't reach the backend API — is it running on :4000?" : null });
    })();
    return () => { cancelled = true; };
  }, []);

  const { account, positions, mode, brokerStatus, killSwitch, watchlist, backtests, orderLog } = data;
  const equity = account ? account.cash + (positions || []).reduce((s, p) => s + p.quantity * p.avg_price, 0) : null;
  const pnlPct = account && equity != null ? ((equity - account.starting_capital) / account.starting_capital) * 100 : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-[#898781]">Research, backtest, and paper-trade Indian equities.</p>
      </div>

      <ErrorBanner message={state.error} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Paper equity" value={equity != null ? formatINR(equity) : "—"} sub={pnlPct != null ? formatPct(pnlPct) : undefined} tone={pnlPct > 0 ? "good" : pnlPct < 0 ? "bad" : "default"} />
        <StatTile label="Open positions" value={positions ? positions.filter((p) => p.quantity !== 0).length : "—"} />
        <StatTile label="Watchlist" value={watchlist ? watchlist.length : "—"} />
        <StatTile label="Backtests run" value={backtests ? backtests.length : "—"} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Broker mode">
          <div className="flex items-center gap-2">
            <Badge status={mode?.mode === "paper" ? "good" : "warning"}>{mode?.mode || "—"}</Badge>
            <Badge status={brokerStatus?.connected ? "good" : "neutral"}>{brokerStatus?.connected ? "Connected" : "Not connected"}</Badge>
          </div>
          <Link href="/broker" className="mt-3 inline-block text-sm text-[#2a78d6] hover:underline dark:text-[#3987e5]">Manage broker →</Link>
        </Card>

        <Card title="Kill switch">
          <Badge status={killSwitch?.active ? "critical" : "good"}>{killSwitch?.active ? "ACTIVE — orders blocked" : "Inactive"}</Badge>
          {killSwitch?.reason && <p className="mt-2 text-sm text-[#898781]">{killSwitch.reason}</p>}
          <Link href="/risk" className="mt-3 inline-block text-sm text-[#2a78d6] hover:underline dark:text-[#3987e5]">Risk settings →</Link>
        </Card>

        <Card title="Recent order attempts">
          {orderLog && orderLog.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {orderLog.map((o) => (
                <li key={o.id} className="flex items-center justify-between">
                  <span>{o.symbol} · {o.side}</span>
                  <Badge status={o.passed ? "good" : "critical"}>{o.passed ? "passed" : "rejected"}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#898781]">No order attempts yet.</p>
          )}
          <Link href="/trades" className="mt-3 inline-block text-sm text-[#2a78d6] hover:underline dark:text-[#3987e5]">Order log →</Link>
        </Card>
      </div>

      <Card title="Quick links">
        <div className="flex flex-wrap gap-2">
          {[
            ["Stocks", "/stocks"],
            ["Industries", "/industries"],
            ["Prompt templates", "/prompts"],
            ["Market data", "/data"],
            ["Strategies", "/strategies"],
            ["Backtests", "/backtests"],
            ["Paper trading", "/paper"],
          ].map(([label, href]) => (
            <Link key={href} href={href} className="rounded-md border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">
              {label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
