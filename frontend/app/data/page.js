"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Card, Input, Select, Button, ErrorBanner, EmptyState } from "@/components/ui";

export default function DataPage() {
  const [symbols, setSymbols] = useState(null);
  const [selected, setSelected] = useState(null);
  const [candles, setCandles] = useState([]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  const [csvSymbol, setCsvSymbol] = useState("");
  const [csvFile, setCsvFile] = useState(null);
  const [yahooSymbol, setYahooSymbol] = useState("");
  const [yahooExchange, setYahooExchange] = useState("NSE");
  const [yahooRange, setYahooRange] = useState("1y");
  const [busy, setBusy] = useState(false);

  const loadSymbols = () => api.get("/api/prices").then(setSymbols).catch((e) => setError(e.message));

  useEffect(() => { loadSymbols(); }, []);

  const viewCandles = async (symbol, source) => {
    setSelected({ symbol, source });
    try {
      setCandles(await api.get(`/api/prices/${symbol}?source=${source}`));
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCsvImport = async (e) => {
    e.preventDefault();
    if (!csvFile || !csvSymbol) return;
    setBusy(true);
    setStatus(null);
    try {
      const formData = new FormData();
      formData.append("symbol", csvSymbol);
      formData.append("file", csvFile);
      const res = await api.post("/api/prices/import/csv", formData);
      setStatus(`Imported ${res.imported} candles for ${res.symbol} (csv)`);
      setCsvSymbol(""); setCsvFile(null);
      loadSymbols();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const handleYahooImport = async (e) => {
    e.preventDefault();
    if (!yahooSymbol) return;
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const res = await api.post("/api/prices/import/yahoo", { symbol: yahooSymbol, exchange: yahooExchange, range: yahooRange });
      setStatus(`Imported ${res.imported} candles for ${res.symbol} (yahoo)`);
      setYahooSymbol("");
      loadSymbols();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Market data</h1>
      <ErrorBanner message={error} />
      {status && <p className="text-sm text-[#006300] dark:text-[#0ca30c]">{status}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Import from Yahoo Finance (free, .NS/.BO)">
          <form onSubmit={handleYahooImport} className="space-y-3">
            <Input placeholder="Symbol (e.g. RELIANCE)" value={yahooSymbol} onChange={(e) => setYahooSymbol(e.target.value.toUpperCase())} required />
            <div className="flex gap-2">
              <Select value={yahooExchange} onChange={(e) => setYahooExchange(e.target.value)}>
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
              </Select>
              <Select value={yahooRange} onChange={(e) => setYahooRange(e.target.value)}>
                {["1mo", "3mo", "6mo", "1y", "2y", "5y", "max"].map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </div>
            <Button type="submit" disabled={busy}>{busy ? "Importing…" : "Import"}</Button>
          </form>
        </Card>

        <Card title="Import from CSV (date,open,high,low,close,volume)">
          <form onSubmit={handleCsvImport} className="space-y-3">
            <Input placeholder="Symbol" value={csvSymbol} onChange={(e) => setCsvSymbol(e.target.value.toUpperCase())} required />
            <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files[0])} className="text-sm" required />
            <Button type="submit" disabled={busy}>{busy ? "Importing…" : "Import"}</Button>
          </form>
        </Card>
      </div>

      <Card title="Imported symbols">
        {symbols === null ? (
          <EmptyState>Loading…</EmptyState>
        ) : symbols.length === 0 ? (
          <EmptyState>No candle data imported yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-[#898781] dark:border-white/10">
                  <th className="py-2 pr-4">Symbol</th><th className="py-2 pr-4">Source</th><th className="py-2 pr-4">Candles</th><th className="py-2 pr-4">Range</th>
                </tr>
              </thead>
              <tbody>
                {symbols.map((s) => (
                  <tr key={`${s.symbol}-${s.source}`} className="cursor-pointer border-b border-black/5 last:border-0 hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/10" onClick={() => viewCandles(s.symbol, s.source)}>
                    <td className="py-2 pr-4 font-medium">{s.symbol}</td>
                    <td className="py-2 pr-4 text-[#898781]">{s.source}</td>
                    <td className="py-2 pr-4">{s.candle_count}</td>
                    <td className="py-2 pr-4 text-[#898781]">{formatDate(s.first_date)} – {formatDate(s.last_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <Card title={`${selected.symbol} (${selected.source}) — ${candles.length} candles`}>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#fcfcfb] dark:bg-[#1a1a19]">
                <tr className="border-b border-black/10 text-left text-xs text-[#898781] dark:border-white/10">
                  <th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Open</th><th className="py-2 pr-4">High</th><th className="py-2 pr-4">Low</th><th className="py-2 pr-4">Close</th><th className="py-2 pr-4">Volume</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {candles.slice().reverse().map((c) => (
                  <tr key={c.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-1.5 pr-4">{formatDate(c.date)}</td>
                    <td className="py-1.5 pr-4">{c.open}</td><td className="py-1.5 pr-4">{c.high}</td><td className="py-1.5 pr-4">{c.low}</td><td className="py-1.5 pr-4">{c.close}</td><td className="py-1.5 pr-4">{c.volume}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
