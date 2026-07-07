"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Card, Badge, Button, Input, ErrorBanner, EmptyState } from "@/components/ui";

const FIELDS = [
  ["max_order_value", "Max order value (₹)"],
  ["max_daily_loss", "Max daily loss (₹)"],
  ["max_risk_per_trade_pct", "Max risk per trade (%)"],
  ["max_open_positions", "Max open positions"],
  ["max_position_exposure_pct", "Max per-stock exposure (%)"],
  ["max_total_exposure_pct", "Max total exposure (%)"],
];

export default function RiskPage() {
  const [settings, setSettings] = useState(null);
  const [killSwitch, setKillSwitch] = useState(null);
  const [orderLog, setOrderLog] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expandedLog, setExpandedLog] = useState(null);

  const load = async () => {
    try {
      setSettings(await api.get("/api/risk/settings"));
      setKillSwitch(await api.get("/api/risk/kill-switch"));
      setOrderLog(await api.get("/api/risk/order-log?limit=50"));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/api/risk/settings", settings);
      load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleKillSwitch = async () => {
    try {
      if (killSwitch.active) await api.post("/api/risk/kill-switch/deactivate", {});
      else await api.post("/api/risk/kill-switch/activate", { reason: reason || "Manually activated" });
      setReason("");
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Risk & safety</h1>
      <ErrorBanner message={error} />

      <Card title="Kill switch">
        <div className="flex items-center gap-3">
          <Badge status={killSwitch?.active ? "critical" : "good"}>{killSwitch?.active ? "ACTIVE — all order creation blocked" : "Inactive"}</Badge>
        </div>
        {killSwitch?.reason && <p className="mt-2 text-sm text-[#898781]">Reason: {killSwitch.reason}</p>}
        <div className="mt-3 flex items-center gap-2">
          {!killSwitch?.active && <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="w-64" />}
          <Button variant={killSwitch?.active ? "primary" : "danger"} onClick={handleToggleKillSwitch}>
            {killSwitch?.active ? "Deactivate kill switch" : "Activate kill switch"}
          </Button>
        </div>
      </Card>

      {settings && (
        <Card title="Risk limits">
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {FIELDS.map(([key, label]) => (
              <div key={key}>
                <label className="mb-1 block text-xs text-[#898781]">{label}</label>
                <Input type="number" value={settings[key]} onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })} />
              </div>
            ))}
            <Button type="submit" disabled={saving} className="sm:col-span-3 justify-self-start">{saving ? "Saving…" : "Save limits"}</Button>
          </form>
        </Card>
      )}

      <Card title="Order attempt log">
        {orderLog === null ? (
          <EmptyState>Loading…</EmptyState>
        ) : orderLog.length === 0 ? (
          <EmptyState>No order attempts logged yet.</EmptyState>
        ) : (
          <div className="space-y-1">
            {orderLog.map((o) => (
              <div key={o.id} className="rounded-md border border-black/5 dark:border-white/5">
                <button
                  onClick={() => setExpandedLog(expandedLog === o.id ? null : o.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <span className="flex items-center gap-2">
                    <Badge status={o.passed ? "good" : "critical"}>{o.passed ? "passed" : "rejected"}</Badge>
                    <span>{o.mode} · {o.symbol} · {o.side} · qty {o.quantity}</span>
                  </span>
                  <span className="text-xs text-[#898781]">{formatDateTime(o.created_at)}</span>
                </button>
                {expandedLog === o.id && (
                  <div className="border-t border-black/5 px-3 py-2 text-xs dark:border-white/5">
                    <p className="mb-2 text-[#898781]">{o.reason}</p>
                    <ul className="space-y-1">
                      {o.risk_checks.map((c) => (
                        <li key={c.check} className="flex items-center gap-2">
                          <Badge status={c.passed ? "good" : c.blocking === false ? "warning" : "critical"}>{c.check}</Badge>
                          <span className="text-[#52514e] dark:text-[#c3c2b7]">{c.detail}{c.blocking === false ? " (advisory only in paper mode)" : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
