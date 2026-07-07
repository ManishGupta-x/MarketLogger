"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, Button, Input, ErrorBanner, EmptyState } from "@/components/ui";

export default function IndustriesPage() {
  const [industries, setIndustries] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);

  const load = () => api.get("/api/industries").then(setIndustries).catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/industries", { name });
      setName("");
      load();
    } catch (e2) {
      setError(e2.message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Industries</h1>
      <ErrorBanner message={error} />

      <Card title="Add an industry">
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input placeholder="Industry name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Button type="submit">Add</Button>
        </form>
      </Card>

      <Card title={`All industries${industries ? ` (${industries.length})` : ""}`}>
        {industries === null ? (
          <EmptyState>Loading…</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map((i) => (
              <Link key={i.id} href={`/industries/${i.id}`} className="flex items-center justify-between rounded-md border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">
                <span>{i.name}</span>
                <span className="text-xs text-[#898781]">{i.stock_count}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
