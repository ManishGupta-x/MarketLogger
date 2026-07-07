"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatINR, formatPct } from "@/lib/format";
import { Card, Input, Select, Button, Badge, StatTile, ErrorBanner, EmptyState } from "@/components/ui";

export default function PaperPage() {
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [symbols, setSymbols] = useState([]);
  const [order, setOrder] = useState({ symbol: "", side: "buy", quantity: 1, reason: "" });
  const [signalForm, setSignalForm] = useState({ strategy_id: "", symbol: "" });
  const [resetCapital, setResetCapital] = useState(1000000);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setAccount(await api.get("/api/paper/account"));
      setPositions(await api.get("/api/paper/positions"));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
    api.get("/api/strategies").then(setStrategies).catch(() => {});
    api.get("/api/prices").then(setSymbols).catch(() => {});
  }, []);

  const equity = account ? account.cash + positions.reduce((s, p) => s + p.quantity * p.avg_price, 0) : null;
  const pnlPct = account && equity != null ? ((equity - account.starting_capital) / account.starting_capital) * 100 : null;

  const placeOrder = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await api.post("/api/paper/orders", { ...order, quantity: Number(order.quantity) });
      setStatus(res.success ? `Order filled at ₹${res.order.filled_price.toFixed(2)}` : `Rejected: ${res.reason}`);
      if (res.success) { load(); setOrder({ ...order, quantity: 1, reason: "" }); }
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const placeSignalOrder = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await api.post("/api/paper/orders/signal", { strategy_id: Number(signalForm.strategy_id), symbol: signalForm.symbol });
      setStatus(res.success ? `Signal order (${res.signal}) filled at ₹${res.order.filled_price.toFixed(2)}` : `${res.reason || "No action"} (signal: ${res.signal || "none"})`);
      if (res.success) load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(`Reset paper account to ₹${resetCapital}? This clears all positions and order history.`)) return;
    try {
      await api.post("/api/paper/account/reset", { startingCapital: Number(resetCapital) });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Paper trading</h1>
      <ErrorBanner message={error} />
      {status && <p className="text-sm text-[#52514e] dark:text-[#c3c2b7]">{status}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Equity" value={equity != null ? formatINR(equity) : "—"} tone={pnlPct > 0 ? "good" : pnlPct < 0 ? "bad" : "default"} sub={pnlPct != null ? formatPct(pnlPct) : undefined} />
        <StatTile label="Cash" value={account ? formatINR(account.cash) : "—"} />
        <StatTile label="Starting capital" value={account ? formatINR(account.starting_capital) : "—"} />
        <StatTile label="Open positions" value={positions.filter((p) => p.quantity !== 0).length} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Place manual order">
          <form onSubmit={placeOrder} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Symbol" value={order.symbol} onChange={(e) => setOrder({ ...order, symbol: e.target.value.toUpperCase() })} required />
              <Select value={order.side} onChange={(e) => setOrder({ ...order, side: e.target.value })}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </Select>
            </div>
            <Input type="number" min="1" placeholder="Quantity" value={order.quantity} onChange={(e) => setOrder({ ...order, quantity: e.target.value })} required />
            <Input placeholder="Reason / note (optional)" value={order.reason} onChange={(e) => setOrder({ ...order, reason: e.target.value })} />
            <Button type="submit" disabled={busy}>{busy ? "Placing…" : "Place order"}</Button>
            <p className="text-xs text-[#898781]">Fills at the latest imported close price. Every order runs through the risk engine and kill switch first.</p>
          </form>
        </Card>

        <Card title="Signal-driven order">
          <form onSubmit={placeSignalOrder} className="space-y-3">
            <Select value={signalForm.strategy_id} onChange={(e) => setSignalForm({ ...signalForm, strategy_id: e.target.value })} required>
              <option value="">Strategy…</option>
              {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select value={signalForm.symbol} onChange={(e) => setSignalForm({ ...signalForm, symbol: e.target.value })} required>
              <option value="">Symbol…</option>
              {[...new Set(symbols.map((s) => s.symbol))].map((sym) => <option key={sym} value={sym}>{sym}</option>)}
            </Select>
            <Button type="submit" disabled={busy}>{busy ? "Evaluating…" : "Run strategy on latest bar"}</Button>
            <p className="text-xs text-[#898781]">Runs the strategy against the most recent imported candle and places an order if it signals.</p>
          </form>
        </Card>
      </div>

      <Card title="Open positions">
        {positions.filter((p) => p.quantity !== 0).length === 0 ? (
          <EmptyState>No open positions.</EmptyState>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-[#898781] dark:border-white/10">
                <th className="py-2 pr-4">Symbol</th><th className="py-2 pr-4">Qty</th><th className="py-2 pr-4">Avg price</th><th className="py-2 pr-4">Realized P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.filter((p) => p.quantity !== 0).map((p) => (
                <tr key={p.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="py-2 pr-4 font-medium">{p.symbol}</td>
                  <td className="py-2 pr-4">{p.quantity}</td>
                  <td className="py-2 pr-4">₹{p.avg_price.toFixed(2)}</td>
                  <td className={`py-2 pr-4 ${p.realized_pnl >= 0 ? "text-[#006300] dark:text-[#0ca30c]" : "text-[#d03b3b] dark:text-[#e66767]"}`}>{formatINR(p.realized_pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Reset account">
        <div className="flex items-center gap-2">
          <Input type="number" value={resetCapital} onChange={(e) => setResetCapital(e.target.value)} className="w-40" />
          <Button variant="danger" onClick={handleReset}>Reset</Button>
        </div>
      </Card>
    </div>
  );
}
