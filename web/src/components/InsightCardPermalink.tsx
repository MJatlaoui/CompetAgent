"use client";

import { useState } from "react";
import { Link } from "lucide-react";
import { InsightCard } from "./InsightCard";
import type { Insight } from "@/lib/types";

export function InsightCardPermalink({ insight }: { insight: Insight }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border rounded-md px-3 py-1.5 hover:bg-gray-50 transition"
        >
          <Link className="w-3.5 h-3.5" />
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
      <InsightCard insight={insight} showActions={false} variant="bulletin" />
    </div>
  );
}
