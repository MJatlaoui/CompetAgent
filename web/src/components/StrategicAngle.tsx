import { AlertTriangle } from "lucide-react";

interface StrategicAngleProps {
  competitiveGap: string;
}

export function StrategicAngle({ competitiveGap }: StrategicAngleProps) {
  if (!competitiveGap) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-2">
      <p className="text-xs font-bold text-amber-800 flex items-center gap-1 mb-1">
        <AlertTriangle className="w-3 h-3" />
        Competitive Gap:
      </p>
      <p className="text-sm text-amber-900">{competitiveGap}</p>
    </div>
  );
}
