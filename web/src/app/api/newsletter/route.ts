import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAllInsights } from "@/lib/db";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are a competitive intelligence analyst writing a newsletter for the Zoom Contact Center sales and product team.

Your task: Write a polished editorial digest from the provided JSON array of competitive insights.

Structure (follow exactly):
1. Subject line — punchy, < 12 words, starts with "CC Intel:"
2. Date range header — e.g. "Week of March 3–10, 2026"
3. Intro paragraph — 2-3 sentences, top-level strategic takeaway for Zoom Contact Center
4. Per-competitor sections — ordered by highest average score descending. Each section:
   - Heading = competitor name + classification badge in parentheses
   - 1-2 paragraph prose synthesising the insights
   - Key facts as bullet points (drawn from productFacts)
   - Sales angle callout (from salesAngle field)
5. Closing one-liner under the heading "What to Watch Next"

When format is "html":
- Return a complete, self-contained HTML document with inline CSS (clean, professional, max-width 680px)
- Use <title> for the subject line
- Use semantic HTML: <h1> subject, <h2> for date range, <h3> for competitor sections
- Sales angle callout: a styled <blockquote> or <div> with a left border accent
- No external resources, no JavaScript

When format is "md":
- Return clean GitHub-flavored Markdown
- # for subject line, ## for date range, ### for competitor sections
- Sales angle as > blockquote
- Bullet points with -

Write confidently. Be specific. Avoid filler phrases like "It's worth noting". Do not invent facts not present in the source data.`;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { from, to, format = "html" } = body as { from: string; to: string; format: "html" | "md" };

  if (!from || !to) {
    return NextResponse.json({ error: "from and to dates are required" }, { status: 400 });
  }

  const { insights } = getAllInsights({ status: "approved", from, to, limit: 200 });

  if (insights.length === 0) {
    return NextResponse.json({ error: "No approved insights in this date range" }, { status: 400 });
  }

  const payload = insights.map((i) => ({
    competitor: i.competitor,
    classification: i.classification,
    score: i.score,
    headline: i.headline,
    productFacts: i.productFacts,
    competitiveGap: i.competitiveGap,
    salesAngle: i.salesAngle,
    strategicPrioritiesHit: i.strategicPrioritiesHit,
    sourceUrl: i.sourceUrl,
    postedAt: i.postedAt,
  }));

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate a Contact Center competitive intelligence newsletter in ${format.toUpperCase()} format.

Date range: ${from} to ${to}
Insights (${insights.length} total):
${JSON.stringify(payload, null, 2)}`,
      },
    ],
  });

  const content = (message.content[0] as { type: string; text: string }).text;

  const dateSlug = to.slice(0, 10);
  const filename = `cc-intel-${dateSlug}.${format}`;
  const contentType = format === "html" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8";

  return new NextResponse(content, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
