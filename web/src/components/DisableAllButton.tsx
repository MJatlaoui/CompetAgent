"use client";

import { useEffect, useState } from "react";
import { PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DisableAllButton() {
  const [allDisabled, setAllDisabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((d) => {
        const all = [...(d.competitors ?? []), ...(d.industry ?? [])];
        setAllDisabled(all.length > 0 && all.every((s: { disabled?: boolean }) => s.disabled === true));
      })
      .catch(() => setAllDisabled(false));
  }, []);

  async function toggle() {
    if (allDisabled === null) return;
    setLoading(true);
    const res = await fetch("/api/sources", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: allDisabled }),
    });
    const data = await res.json();
    setAllDisabled(data.allDisabled ?? !allDisabled);
    setLoading(false);
  }

  if (allDisabled === null) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={toggle}
      disabled={loading}
      className={
        allDisabled
          ? "border-green-400 text-green-700 hover:bg-green-50"
          : "border-red-300 text-red-600 hover:bg-red-50"
      }
      title={allDisabled ? "Enable all sources" : "Disable all sources"}
    >
      <PowerOff className="w-3.5 h-3.5 mr-1.5" />
      {loading ? "Saving…" : allDisabled ? "Enable All Sources" : "Disable All Sources"}
    </Button>
  );
}
