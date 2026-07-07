"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Select, Input, Textarea, Button, ErrorBanner, EmptyState } from "@/components/ui";

export default function PromptsPage() {
  const [templates, setTemplates] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [values, setValues] = useState({});
  const [rendered, setRendered] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/api/prompts").then((rows) => {
      setTemplates(rows);
      if (rows.length > 0) setSelectedId(String(rows[0].id));
    }).catch((e) => setError(e.message));
  }, []);

  const selected = templates?.find((t) => String(t.id) === selectedId);

  useEffect(() => {
    setValues({});
    setRendered("");
  }, [selectedId]);

  const handleRender = async () => {
    try {
      const res = await api.post(`/api/prompts/${selectedId}/render`, { values });
      setRendered(res.rendered);
      setCopied(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(rendered);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Prompt templates</h1>
      <ErrorBanner message={error} />

      {templates === null ? (
        <EmptyState>Loading…</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Fill a template">
            <label className="mb-3 block text-xs text-[#898781]">Template</label>
            <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.category.replace("_", " ")})</option>)}
            </Select>

            {selected && (
              <div className="mt-4 space-y-3">
                {selected.placeholders.length === 0 ? (
                  <p className="text-sm text-[#898781]">This template has no placeholders.</p>
                ) : (
                  selected.placeholders.map((p) => (
                    <div key={p}>
                      <label className="mb-1 block text-xs text-[#898781]">{p}</label>
                      <Input value={values[p] || ""} onChange={(e) => setValues({ ...values, [p]: e.target.value })} />
                    </div>
                  ))
                )}
                <Button onClick={handleRender}>Render prompt</Button>
              </div>
            )}
          </Card>

          <Card title="Rendered prompt" action={rendered && <Button variant="ghost" onClick={handleCopy}>{copied ? "Copied!" : "Copy"}</Button>}>
            {rendered ? (
              <p className="whitespace-pre-wrap text-sm">{rendered}</p>
            ) : (
              <EmptyState>Fill placeholders and render to see the prompt here.</EmptyState>
            )}
          </Card>
        </div>
      )}

      <Card title="Template library">
        {templates && (
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {templates.map((t) => (
              <details key={t.id} className="py-2">
                <summary className="cursor-pointer text-sm font-medium">{t.name} <span className="font-normal text-[#898781]">— {t.category.replace("_", " ")}</span></summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[#52514e] dark:text-[#c3c2b7]">{t.body}</p>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
