"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, Button, Input, Select, ErrorBanner, EmptyState } from "@/components/ui";

export default function StocksPage() {
  const [stocks, setStocks] = useState(null);
  const [industries, setIndustries] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ symbol: "", name: "", exchange: "NSE", industry_id: "" });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async (q) => {
    try {
      const path = q ? `/api/stocks?search=${encodeURIComponent(q)}` : "/api/stocks";
      setStocks(await api.get(path));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
    api.get("/api/industries").then(setIndustries).catch(() => {});
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    load(search);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/stocks", {
        symbol: form.symbol,
        name: form.name,
        exchange: form.exchange,
        industry_ids: form.industry_id ? [Number(form.industry_id)] : [],
      });
      setForm({ symbol: "", name: "", exchange: "NSE", industry_id: "" });
      load(search);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Stocks</h1>
      <ErrorBanner message={error} />

      <Card title="Add a stock">
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Input placeholder="Symbol (RELIANCE)" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} required />
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="sm:col-span-2" />
          <Select value={form.exchange} onChange={(e) => setForm({ ...form, exchange: e.target.value })}>
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </Select>
          <Select value={form.industry_id} onChange={(e) => setForm({ ...form, industry_id: e.target.value })}>
            <option value="">No industry</option>
            {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
          <Button type="submit" disabled={submitting} className="sm:col-span-5 justify-self-start">Add stock</Button>
        </form>
      </Card>

      <Card title="All stocks" action={
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input placeholder="Search symbol or name" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
          <Button type="submit" variant="ghost">Search</Button>
        </form>
      }>
        {stocks === null ? (
          <EmptyState>Loading…</EmptyState>
        ) : stocks.length === 0 ? (
          <EmptyState>No stocks yet — add one above.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-[#898781] dark:border-white/10">
                  <th className="py-2 pr-4">Symbol</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Exchange</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((s) => (
                  <tr key={s.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-2 pr-4">
                      <Link href={`/stocks/${s.id}`} className="font-medium text-[#2a78d6] hover:underline dark:text-[#3987e5]">{s.symbol}</Link>
                    </td>
                    <td className="py-2 pr-4">{s.name}</td>
                    <td className="py-2 pr-4 text-[#898781]">{s.exchange}</td>
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
