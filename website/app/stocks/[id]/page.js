"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, API_URL } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Card, Badge, Button, Textarea, ErrorBanner, EmptyState } from "@/components/ui";

const SECTIONS = [
  ["bull_case", "Bull case"], ["bear_case", "Bear case"], ["history", "History"],
  ["quarterly", "Quarterly"], ["kpis", "KPIs"], ["risks", "Risks"],
  ["valuation", "Valuation"], ["observations", "Observations"], ["links", "Links"],
];

export default function StockDetailPage() {
  const { id } = useParams();
  const [stock, setStock] = useState(null);
  const [notes, setNotes] = useState({});
  const [activeSection, setActiveSection] = useState("bull_case");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const s = await api.get(`/api/stocks/${id}`);
      setStock(s);
      const notesByType = {};
      for (const n of s.notes) notesByType[n.section_type] = n;
      setNotes(notesByType);
      setAttachments(await api.get(`/api/attachments?stock_id=${id}`));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { if (id) load(); }, [id]);
  useEffect(() => { setDraft(notes[activeSection]?.body || ""); }, [activeSection, notes]);

  const saveNote = async () => {
    setSaving(true);
    try {
      await api.put(`/api/research/stocks/${id}/notes/${activeSection}`, { body: draft });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleWatchlist = async () => {
    try {
      if (stock.inWatchlist) await api.del(`/api/watchlist/${id}`);
      else await api.post("/api/watchlist", { stock_id: Number(id) });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const uploadFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("stock_id", id);
    try {
      await api.post("/api/attachments", formData);
      setAttachments(await api.get(`/api/attachments?stock_id=${id}`));
    } catch (e2) {
      setError(e2.message);
    }
    e.target.value = "";
  };

  if (!stock) {
    return error ? <ErrorBanner message={error} /> : <EmptyState>Loading…</EmptyState>;
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{stock.symbol} <span className="font-normal text-[#898781]">· {stock.name}</span></h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {stock.industries.map((i) => <Badge key={i.id} status="neutral">{i.name}</Badge>)}
          </div>
        </div>
        <Button variant={stock.inWatchlist ? "danger" : "primary"} onClick={toggleWatchlist}>
          {stock.inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
        </Button>
      </div>

      <Card title="Research notes">
        <div className="flex flex-wrap gap-1 border-b border-black/10 pb-3 dark:border-white/10">
          {SECTIONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                activeSection === key ? "bg-[#2a78d6] text-white" : "text-[#52514e] hover:bg-black/5 dark:text-[#c3c2b7] dark:hover:bg-white/10"
              }`}
            >
              {label}{notes[key]?.body ? " •" : ""}
            </button>
          ))}
        </div>
        <Textarea rows={10} className="mt-3" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Write ${activeSection.replace("_", " ")} notes…`} />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-[#898781]">{notes[activeSection]?.updated_at ? `Last updated ${formatDateTime(notes[activeSection].updated_at)}` : "Not saved yet"}</p>
          <Button onClick={saveNote} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </Card>

      <Card title="Attachments" action={
        <label className="cursor-pointer rounded-md border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">
          Upload file
          <input type="file" className="hidden" onChange={uploadFile} />
        </label>
      }>
        {attachments.length === 0 ? (
          <EmptyState>No filings or attachments uploaded yet.</EmptyState>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <a href={`${API_URL}/api/attachments/${a.id}/download`} className="text-[#2a78d6] hover:underline dark:text-[#3987e5]">{a.original_name}</a>
                <span className="text-xs text-[#898781]">{formatDateTime(a.uploaded_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
