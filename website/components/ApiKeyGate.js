"use client";

import { useEffect, useState } from "react";
import { getApiKey, setApiKey, clearApiKey } from "@/lib/api";
import { Card, Button, Input } from "@/components/ui";

// Overlays the app with a key prompt whenever the backend answers 401. The key
// is stored in this browser's localStorage only — it is never baked into the
// deployed bundle.
export default function ApiKeyGate({ children }) {
  const [needsKey, setNeedsKey] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    const onUnauthorized = () => {
      clearApiKey();
      setNeedsKey(true);
    };
    window.addEventListener("api-unauthorized", onUnauthorized);
    return () => window.removeEventListener("api-unauthorized", onUnauthorized);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    setApiKey(value.trim());
    // Reload so every page refetches with the new key.
    window.location.reload();
  };

  if (!needsKey) return children;

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <Card title="API key required">
        <p className="mb-4 text-sm text-[#52514e] dark:text-[#c3c2b7]">
          This dashboard talks to your private backend. Enter the API key from
          the server&apos;s <code>.env</code> file to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            placeholder="API key"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={!value.trim()}>
            Unlock
          </Button>
        </form>
        {getApiKey() === null && (
          <p className="mt-3 text-xs text-[#898781]">
            The key is checked against the server — nothing is stored until it
            works.
          </p>
        )}
      </Card>
    </div>
  );
}
