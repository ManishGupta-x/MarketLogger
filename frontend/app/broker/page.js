"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge, Button, Select, ErrorBanner, EmptyState } from "@/components/ui";

export default function BrokerPage() {
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState(null);
  const [holdings, setHoldings] = useState(null);
  const [positions, setPositions] = useState(null);
  const [margins, setMargins] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setStatus(await api.get("/api/broker/status"));
      setMode(await api.get("/api/broker/mode"));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!status?.connected) return;
    api.get("/api/broker/holdings").then(setHoldings).catch(() => setHoldings([]));
    api.get("/api/broker/positions").then(setPositions).catch(() => setPositions(null));
    api.get("/api/broker/margins").then(setMargins).catch(() => setMargins(null));
  }, [status?.connected]);

  const handleLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/broker/login", {});
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleModeChange = async (newMode) => {
    setError(null);
    try {
      await api.put("/api/broker/mode", { mode: newMode });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Broker</h1>
      <ErrorBanner message={error} />

      <Card title="Connection">
        <div className="flex items-center justify-between">
          <Badge status={status?.connected ? "good" : "neutral"}>{status?.connected ? "Connected to Zerodha" : "Not connected"}</Badge>
          {!status?.connected && <Button onClick={handleLogin} disabled={busy}>{busy ? "Logging in…" : "Trigger login"}</Button>}
        </div>
        {!status?.connected && status?.loginUrl && (
          <p className="mt-2 text-xs text-[#898781]">Or log in manually via <a href={status.loginUrl} target="_blank" rel="noreferrer" className="text-[#2a78d6] hover:underline dark:text-[#3987e5]">Kite Connect</a>, then trigger a refresh.</p>
        )}
      </Card>

      <Card title="Trading mode">
        <div className="flex items-center gap-2">
          <Select value={mode?.mode || "paper"} onChange={(e) => handleModeChange(e.target.value)} className="w-48">
            {mode?.availableModes?.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          {mode && mode.mode !== "paper" && <Badge status="warning">Live-adjacent mode selected</Badge>}
        </div>
        {mode && !mode.liveTradingUnlocked && (
          <p className="mt-2 text-xs text-[#898781]">Live modes are locked. Set <code>LIVE_TRADING_UNLOCKED=true</code> in <code>.env</code> to unlock them — and note this build has no live order-placement code at all, so even unlocked, the broker stays read-only.</p>
        )}
      </Card>

      {status?.connected && (
        <>
          <Card title="Holdings">
            {holdings === null ? <EmptyState>Loading…</EmptyState> : holdings.length === 0 ? <EmptyState>No holdings.</EmptyState> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-black/10 text-left text-xs text-[#898781] dark:border-white/10">
                      <th className="py-2 pr-4">Symbol</th><th className="py-2 pr-4">Qty</th><th className="py-2 pr-4">Avg price</th><th className="py-2 pr-4">LTP</th><th className="py-2 pr-4">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => (
                      <tr key={h.tradingsymbol} className="border-b border-black/5 last:border-0 dark:border-white/5">
                        <td className="py-2 pr-4 font-medium">{h.tradingsymbol}</td>
                        <td className="py-2 pr-4">{h.quantity}</td>
                        <td className="py-2 pr-4">₹{h.average_price?.toFixed(2)}</td>
                        <td className="py-2 pr-4">₹{h.last_price?.toFixed(2)}</td>
                        <td className={`py-2 pr-4 ${h.pnl >= 0 ? "text-[#006300] dark:text-[#0ca30c]" : "text-[#d03b3b] dark:text-[#e66767]"}`}>₹{h.pnl?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Positions">
            {positions === null ? <EmptyState>Loading…</EmptyState> : (
              <pre className="overflow-x-auto text-xs text-[#52514e] dark:text-[#c3c2b7]">{JSON.stringify(positions, null, 2)}</pre>
            )}
          </Card>

          <Card title="Margins">
            {margins === null ? <EmptyState>Loading…</EmptyState> : (
              <pre className="overflow-x-auto text-xs text-[#52514e] dark:text-[#c3c2b7]">{JSON.stringify(margins, null, 2)}</pre>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
