import {
  Terminal,
  Rocket,
  DollarSign,
  Handshake,
  Megaphone,
  Trash2,
  Pin,
} from "lucide-react";

const MAP: Record<string, { Icon: React.ElementType; color: string; bg: string }> = {
  TECHNICAL_SHIFT: { Icon: Terminal, color: "text-blue-600", bg: "bg-blue-50" },
  FEATURE_LAUNCH:  { Icon: Rocket,   color: "text-purple-600", bg: "bg-purple-50" },
  PRICING_CHANGE:  { Icon: DollarSign, color: "text-green-600", bg: "bg-green-50" },
  PARTNERSHIP:     { Icon: Handshake, color: "text-teal-600", bg: "bg-teal-50" },
  MARKETING_NOISE: { Icon: Megaphone, color: "text-gray-500", bg: "bg-gray-100" },
  IRRELEVANT:      { Icon: Trash2,   color: "text-red-500", bg: "bg-red-50" },
};

interface CategoryAnchorProps {
  classification: string;
}

export function CategoryAnchor({ classification }: CategoryAnchorProps) {
  const entry = MAP[classification] || { Icon: Pin, color: "text-gray-400", bg: "bg-gray-50" };
  const { Icon, color, bg } = entry;
  return (
    <div className="flex shrink-0 w-12 items-start justify-center pt-1">
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${bg}`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </span>
    </div>
  );
}
