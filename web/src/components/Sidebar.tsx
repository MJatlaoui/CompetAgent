"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Inbox, Flag, Newspaper, Clock, Database, BarChart2, Settings, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

const PRIMARY_NAV = [
  { href: "/ingested", label: "Feed",     Icon: Database,  countKey: null      },
  { href: "/review",   label: "Inbox",    Icon: Inbox,     countKey: "pending" },
  { href: "/flagged",  label: "Flagged",  Icon: Flag,      countKey: "review"  },
  { href: "/bulletin", label: "Intelligence Digest", Icon: Newspaper, countKey: null      },
  { href: "/history",  label: "History",  Icon: Clock,     countKey: null      },
];

const SECONDARY_NAV = [
  { href: "/dashboard", label: "Dashboard",          Icon: BarChart2, countKey: null },
  { href: "/sources",   label: "Sources & Settings", Icon: Settings,  countKey: null },
  { href: "/about",     label: "About",              Icon: Info,      countKey: null },
];

function NavItem({
  href, label, Icon, countKey, counts,
}: {
  href: string; label: string; Icon: React.ElementType;
  countKey: string | null; counts: Record<string, number>;
}) {
  const pathname = usePathname();
  const count = countKey ? counts[countKey] : 0;
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
        active
          ? "bg-gray-200 text-gray-900 font-medium"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {count > 0 && (
        <span className={cn(
          "text-xs px-1.5 py-0.5 rounded-full font-medium",
          countKey === "pending" ? "bg-red-500 text-white" : "bg-amber-400 text-amber-900"
        )}>
          {count}
        </span>
      )}
    </Link>
  );
}

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function Sidebar() {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Record<string, number>>({ pending: 0, review: 0 });
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    function refresh() {
      fetch("/api/stats")
        .then((r) => r.json())
        .then((d) => {
          setCounts({ pending: d.pending ?? 0, review: d.review ?? 0 });
          setLastSyncAt(d.lastSyncAt ?? null);
        })
        .catch(() => {});
    }
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [pathname]);

  return (
    <aside className="w-52 border-r bg-gray-50 p-4 flex flex-col shrink-0">
      <div className="mb-5 px-1">
        <h1 className="text-base font-bold text-gray-900 tracking-tight">
          {theme === "tactical" ? "INTEL-X" : "CompetAgent"}
        </h1>
        {theme === "tactical" && (
          <p className="text-[10px] font-mono mt-0.5 text-green-500 uppercase tracking-widest opacity-70">
            ◆ Tactical Mode
          </p>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        {PRIMARY_NAV.map((item) => (
          <NavItem key={item.href} {...item} counts={counts} />
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-0.5">
        <p className="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">More</p>
        {SECONDARY_NAV.map((item) => (
          <NavItem key={item.href} {...item} counts={counts} />
        ))}
      </div>

      <div className="mt-auto pt-4 border-t border-gray-200">
        <div className="px-3 flex items-start gap-1.5">
          <span className={cn(
            "mt-0.5 text-xs leading-none",
            lastSyncAt ? "text-green-500" : "text-gray-400"
          )}>●</span>
          <div>
            <p className="text-xs text-gray-500 font-medium">Last synced</p>
            <p className="text-xs text-gray-400">
              {lastSyncAt ? relativeTime(lastSyncAt) : "Never synced"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
