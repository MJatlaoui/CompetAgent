interface HeatBadgeProps {
  heat: number;
  delta?: number;
}

export function HeatBadge({ heat, delta = 0 }: HeatBadgeProps) {
  const bg =
    heat >= 90
      ? "bg-red-500 text-white"
      : heat >= 70
      ? "bg-orange-400 text-white"
      : heat >= 50
      ? "bg-yellow-300 text-gray-800"
      : "bg-gray-200 text-gray-600";

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${bg}`}>
      {heat >= 90 && "🔥"}
      {heat}
      {delta !== 0 && (
        <span className="font-normal opacity-80">({delta > 0 ? `+${delta}` : delta})</span>
      )}
    </span>
  );
}
