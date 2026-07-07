"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatINR, formatPct, formatDateTime } from "@/lib/format";
import { Card, Input, Select, Button, Badge, ErrorBanner, EmptyState } from "@/components/ui";

export default function BacktestsPage() {
  const [backtests, setBacktests] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [symbols, setSymbols] = useState([]);
  const [form, setForm] = useState({ strategy_id: "", symbol: "", source: "", start_date: "", end_date: "", initial_capital: 100000 });
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const load = () => api.get("/api/backtests").then(setBacktests).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api.get("/api/strategies").then(setStrategies).catch(() => {});
    api.get("/api/prices").then(setSymbols).catch(() => {});
  }, []);

  const handleRun = async (e) => {
    e.preventDefault();
    setRunning(true);
    setError(null);
    try {
      await api.post("/api/backtests", {
        ...form,
        strategy_id: Number(form.strategy_id),
        initial_capital: Number(form.initial_capital),
      });
      load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setRunning(false);
    }
  };

  const selectedSymbolData = symbols.find((s) => s.symbol === form.symbol && (!form.source || s.source === form.source));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Backtests</h1>
      <ErrorBanner message={error} />

      <Card title="Run a backtest">
        <form onSubmit={handleRun} className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Select value={form.strategy_id} onChange={(e) => setForm({ ...form, strategy_id: e.target.value })} required>
              <option value="">Strategy…</option>
              {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select value={`${form.symbol}|${form.source}`} onChange={(e) => { const [symbol, source] = e.target.value.split("|"); setForm({ ...form, symbol, source }); }} required>
              <option value="|">Symbol…</option>
              {symbols.map((s) => <option key={`${s.symbol}-${s.source}`} value={`${s.symbol}|${s.source}`}>{s.symbol} ({s.source})</option>)}
            </Select>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
            <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
          </div>
          {selectedSymbolData && (
            <p className="text-xs text-[#898781]">Data available: {selectedSymbolData.first_date} to {selectedSymbolData.last_date}</p>
          )}
          <div className="flex items-center gap-3">
            <div>
              <label className="mb-1 block text-xs text-[#898781]">Initial capital</label>
              <Input type="number" value={form.initial_capital} onChange={(e) => setForm({ ...form, initial_capital: e.target.value })} className="w-40" />
            </div>
            <Button type="submit" disabled={running} className="self-end">{running ? "Running…" : "Run backtest"}</Button>
          </div>
        </form>
      </Card>

      <Card title="History">
        {backtests === null ? (
          <EmptyState>Loading…</EmptyState>
        ) : backtests.length === 0 ? (
          <EmptyState>No backtests run yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-[#898781] dark:border-white/10">
                  <th className="py-2 pr-4">Symbol</th><th className="py-2 pr-4">Strategy</th><th className="py-2 pr-4">Range</th><th className="py-2 pr-4">Return</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Run</th>
                </tr>
              </thead>
              <tbody>
                {backtests.map((b) => (
                  <tr key={b.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-2 pr-4 font-medium"><Link href={`/backtests/${b.id}`} className="text-[#2a78d6] hover:underline dark:text-[#3987e5]">{b.symbol}</Link></td>
                    <td className="py-2 pr-4">{b.strategy_name}</td>
                    <td className="py-2 pr-4 text-[#898781]">{b.start_date} – {b.end_date}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {b.results ? (
                        <span className={b.results.metrics.totalReturnPct >= 0 ? "text-[#006300] dark:text-[#0ca30c]" : "text-[#d03b3b] dark:text-[#e66767]"}>
                          {formatPct(b.results.metrics.totalReturnPct)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-2 pr-4"><Badge status={b.status === "completed" ? "good" : b.status === "failed" ? "critical" : "neutral"}>{b.status}</Badge></td>
                    <td className="py-2 pr-4 text-xs text-[#898781]">{formatDateTime(b.created_at)}</td>
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
