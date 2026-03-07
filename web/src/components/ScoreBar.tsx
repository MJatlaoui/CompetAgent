import type { SubScores } from "@/lib/types";

const LABELS: Record<keyof SubScores, string> = {
  f: "Factuality",
  n: "Novelty",
  a: "Authority",
  d: "Depth",
  s: "Threat",
};

interface ScoreBarProps {
  subScores: SubScores;
}

export function ScoreBar({ subScores }: ScoreBarProps) {
  const keys = (["f", "n", "a", "d", "s"] as (keyof SubScores)[]);
  return (
    <div className="space-y-1 mb-3">
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-16 shrink-0">{LABELS[k]}</span>
          <div className="flex-1 h-1.5 bg-gray-100 rounded overflow-hidden">
            <div
              className="h-full rounded bg-blue-400"
              style={{ width: `${subScores[k]}%` }}
            />
          </div>
          <span className="w-6 text-right">{subScores[k]}</span>
        </div>
      ))}
    </div>
  );
}
