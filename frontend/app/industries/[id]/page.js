"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, Textarea, Button, ErrorBanner, EmptyState } from "@/components/ui";

const SECTIONS = [["overview", "Overview"], ["trends", "Trends"], ["regulatory", "Regulatory"], ["outlook", "Outlook"]];
const COMPARE_SECTIONS = ["bull_case", "bear_case", "valuation"];

export default function IndustryDetailPage() {
  const { id } = useParams();
  const [industry, setIndustry] = useState(null);
  const [notes, setNotes] = useState({});
  const [activeSection, setActiveSection] = useState("overview");
  const [draft, setDraft] = useState("");
  const [compare, setCompare] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const i = await api.get(`/api/industries/${id}`);
      setIndustry(i);
      const notesByType = {};
      for (const n of i.notes) notesByType[n.section_type] = n;
      setNotes(notesByType);
      setCompare(await api.get(`/api/research/compare?industry_id=${id}`));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { if (id) load(); }, [id]);
  useEffect(() => { setDraft(notes[activeSection]?.body || ""); }, [activeSection, notes]);

  const saveNote = async () => {
    setSaving(true);
    try {
      await api.put(`/api/industries/${id}/notes/${activeSection}`, { body: draft });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!industry) return error ? <ErrorBanner message={error} /> : <EmptyState>Loading…</EmptyState>;

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      <h1 className="text-xl font-semibold">{industry.name}</h1>

      <Card title="Industry notes">
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
        <Textarea rows={8} className="mt-3" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="mt-2 flex justify-end">
          <Button onClick={saveNote} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </Card>

      <Card title={`Companies in this industry (${industry.stocks.length})`}>
        {industry.stocks.length === 0 ? (
          <EmptyState>No stocks assigned to this industry yet.</EmptyState>
        ) : (
          <div className="flex flex-wrap gap-2">
            {industry.stocks.map((s) => (
              <Link key={s.id} href={`/stocks/${s.id}`} className="rounded-md border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">
                {s.symbol}
              </Link>
            ))}
          </div>
        )}
      </Card>

      {compare && compare.length > 0 && (
        <Card title="Company comparison">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-[#898781] dark:border-white/10">
                  <th className="py-2 pr-4">Company</th>
                  {COMPARE_SECTIONS.map((s) => <th key={s} className="py-2 pr-4">{s.replace("_", " ")}</th>)}
                </tr>
              </thead>
              <tbody>
                {compare.map((s) => (
                  <tr key={s.id} className="border-b border-black/5 align-top last:border-0 dark:border-white/5">
                    <td className="py-2 pr-4 font-medium"><Link href={`/stocks/${s.id}`} className="text-[#2a78d6] hover:underline dark:text-[#3987e5]">{s.symbol}</Link></td>
                    {COMPARE_SECTIONS.map((sec) => (
                      <td key={sec} className="max-w-xs py-2 pr-4 text-[#52514e] dark:text-[#c3c2b7]">
                        {s.notes[sec]?.body ? (s.notes[sec].body.length > 140 ? s.notes[sec].body.slice(0, 140) + "…" : s.notes[sec].body) : <span className="text-[#898781]">—</span>}
                      </td>
                    ))}
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
