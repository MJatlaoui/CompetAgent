import { notFound } from "next/navigation";
import Link from "next/link";
import { getInsightById } from "@/lib/db";
import { InsightCardPermalink } from "@/components/InsightCardPermalink";

export default async function InsightPermalinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const insight = getInsightById(id);

  if (!insight) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/review"
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          ← Back to Inbox
        </Link>
        <div className="text-xs text-gray-400">Insight permalink</div>
      </div>
      <InsightCardPermalink insight={insight} />
    </div>
  );
}
