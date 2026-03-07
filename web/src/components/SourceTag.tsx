interface SourceTagProps {
  sourceName: string;
  isPrimary: boolean;
}

export function SourceTag({ sourceName, isPrimary }: SourceTagProps) {
  return (
    <span
      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
        isPrimary
          ? "bg-orange-100 text-orange-700"
          : "bg-gray-100 text-gray-600"
      }`}
    >
      {isPrimary ? "Primary" : "Secondary"} · {sourceName}
    </span>
  );
}
