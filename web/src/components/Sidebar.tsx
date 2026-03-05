"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/review", label: "Review Queue", icon: "inbox" },
  { href: "/history", label: "History", icon: "clock" },
  { href: "/dashboard", label: "Dashboard", icon: "chart" },
];

const ICONS: Record<string, string> = {
  inbox: "\u{1F4E5}",
  clock: "\u{1F552}",
  chart: "\u{1F4CA}",
};

export function Sidebar({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-gray-50 p-4 flex flex-col gap-1">
      <h1 className="text-lg font-bold mb-4">CompetAgent</h1>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm",
            pathname === item.href
              ? "bg-gray-200 font-medium"
              : "hover:bg-gray-100"
          )}
        >
          <span>{ICONS[item.icon]}</span>
          <span>{item.label}</span>
          {item.href === "/review" && pendingCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {pendingCount}
            </span>
          )}
        </Link>
      ))}
    </aside>
  );
}
