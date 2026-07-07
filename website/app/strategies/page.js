"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Input, Select, Button, ErrorBanner, EmptyState } from "@/components/ui";

const TYPE_FIELDS = {
  sma_crossover: [["fastPeriod", "Fast period", 10], ["slowPeriod", "Slow period", 30]],
  rsi: [["period", "RSI period", 14], ["oversold", "Oversold level", 30], ["overbought", "Overbought level", 70]],
  breakout: [["lookbackPeriod", "Lookback period (days)", 20]],
};

const TYPE_LABELS = { sma_crossover: "SMA Crossover", rsi: "RSI Mean-Reversion", breakout: "Channel Breakout" };

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("sma_crossover");
  const [params, setParams] = useState({ fastPeriod: 10, slowPeriod: 30 });
  const [error, setError] = useState(null);

  const load = () => api.get("/api/strategies").then(setStrategies).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const changeType = (t) => {
    setType(t);
    const defaults = {};
    for (const [key, , def] of TYPE_FIELDS[t]) defaults[key] = def;
    setParams(defaults);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/strategies", { name, type, params });
      setName("");
      load();
    } catch (e2) {
      setError(e2.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.del(`/api/strategies/${id}`);
      load();
    } catch (e2) {
      setError(e2.message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Strategies</h1>
      <ErrorBanner message={error} />

      <Card title="Create a strategy">
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Select value={type} onChange={(e) => changeType(e.target.value)}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {TYPE_FIELDS[type].map(([key, label]) => (
              <div key={key}>
                <label className="mb-1 block text-xs text-[#898781]">{label}</label>
                <Input type="number" value={params[key] ?? ""} onChange={(e) => setParams({ ...params, [key]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
          <Button type="submit">Create strategy</Button>
        </form>
      </Card>

      <Card title="Your strategies">
        {strategies === null ? (
          <EmptyState>Loading…</EmptyState>
        ) : strategies.length === 0 ? (
          <EmptyState>No strategies yet — create one above.</EmptyState>
        ) : (
          <div className="space-y-2">
            {strategies.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                <div>
                  <p className="font-medium">{s.name} <span className="font-normal text-[#898781]">— {TYPE_LABELS[s.type] || s.type}</span></p>
                  <p className="text-xs text-[#898781]">{Object.entries(s.params).map(([k, v]) => `${k}: ${v}`).join(", ")}</p>
                </div>
                <Button variant="ghost" onClick={() => handleDelete(s.id)}>Delete</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
