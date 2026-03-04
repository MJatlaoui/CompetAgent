import json, anthropic
from pathlib import Path

client = anthropic.Anthropic()
SYSTEM_PROMPT = Path("prompts/intel_filter.txt").read_text()


def analyze_item(item: dict) -> dict | None:
    """Run Claude Haiku on a single item. Returns parsed insight or None on failure."""
    user_content = f"""
Competitor: {item['competitor']}
Title: {item['title']}
URL: {item['url']}
Content: {item['summary'][:3000]}
Published: {item['published']}
"""
    try:
        resp = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=800,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}]
        )
        raw = resp.content[0].text.strip()
        # Strip markdown code fences if Claude wraps the JSON
        if raw.startswith("```"):
            lines = raw.splitlines()
            # Remove first line (```json or ```) and last line (```)
            inner = lines[1:] if lines[-1].strip() == "```" else lines[1:]
            if inner and inner[-1].strip() == "```":
                inner = inner[:-1]
            raw = "\n".join(inner).strip()
        return json.loads(raw)
    except Exception as e:
        print(f"[WARN] Intelligence filter failed for {item['url']}: {e}")
        return None
