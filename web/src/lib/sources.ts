import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const CONFIG_DIR = path.join(process.cwd(), "..", "config");
const COMPETITOR_FILE = path.join(CONFIG_DIR, "sources.yaml");
const INDUSTRY_FILE = path.join(CONFIG_DIR, "industry_sources.yaml");

export interface Feed {
  type: "rss" | "html";
  url: string;
  selector?: string;
  base_url?: string;
  follow_links?: boolean;
  title_selector?: string;
}

export interface CompetitorSource {
  name: string;
  feeds: Feed[];
  refresh_hours?: number;
  disabled?: boolean;
}

export interface IndustrySource {
  name: string;
  category: string;
  tier: 1 | 2;
  feeds: Feed[];
  refresh_hours?: number;
  disabled?: boolean;
}

function readCompetitors(): CompetitorSource[] {
  const raw = yaml.load(fs.readFileSync(COMPETITOR_FILE, "utf8")) as any;
  return raw?.competitors ?? [];
}

function writeCompetitors(competitors: CompetitorSource[]) {
  fs.writeFileSync(COMPETITOR_FILE, yaml.dump({ competitors }, { lineWidth: 120 }), "utf8");
}

function readIndustry(): IndustrySource[] {
  const raw = yaml.load(fs.readFileSync(INDUSTRY_FILE, "utf8")) as any;
  return raw?.industry_sources ?? [];
}

function writeIndustry(industry_sources: IndustrySource[]) {
  fs.writeFileSync(INDUSTRY_FILE, yaml.dump({ industry_sources }, { lineWidth: 120 }), "utf8");
}

export function getSources() {
  return {
    competitors: readCompetitors(),
    industry: readIndustry(),
  };
}

export function addCompetitorSource(name: string, feedUrl: string): void {
  const competitors = readCompetitors();
  const existing = competitors.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (!existing.feeds.some((f) => f.url === feedUrl)) {
      existing.feeds.push({ type: "rss", url: feedUrl });
    }
  } else {
    competitors.push({ name, feeds: [{ type: "rss", url: feedUrl }] });
  }
  writeCompetitors(competitors);
}

export function removeCompetitorSource(name: string): void {
  const competitors = readCompetitors().filter((c) => c.name !== name);
  writeCompetitors(competitors);
}

export function addIndustrySource(name: string, category: string, tier: 1 | 2, feedUrl: string): void {
  const industry = readIndustry();
  if (!industry.some((s) => s.name === name)) {
    industry.push({ name, category, tier, feeds: [{ type: "rss", url: feedUrl }] });
    writeIndustry(industry);
  }
}

export function removeIndustrySource(name: string): void {
  const industry = readIndustry().filter((s) => s.name !== name);
  writeIndustry(industry);
}

export function toggleSourceEnabled(
  sourceType: "competitor" | "industry",
  name: string,
  enabled: boolean,
): void {
  if (sourceType === "competitor") {
    const competitors = readCompetitors();
    const src = competitors.find((c) => c.name === name);
    if (src) {
      if (enabled) { delete src.disabled; } else { src.disabled = true; }
      writeCompetitors(competitors);
    }
  } else {
    const industry = readIndustry();
    const src = industry.find((s) => s.name === name);
    if (src) {
      if (enabled) { delete src.disabled; } else { src.disabled = true; }
      writeIndustry(industry);
    }
  }
}

export function setAllSourcesEnabled(enabled: boolean): void {
  const competitors = readCompetitors();
  competitors.forEach((s) => { if (enabled) { delete s.disabled; } else { s.disabled = true; } });
  writeCompetitors(competitors);

  const industry = readIndustry();
  industry.forEach((s) => { if (enabled) { delete s.disabled; } else { s.disabled = true; } });
  writeIndustry(industry);
}

export function getAllSourcesDisabled(): boolean {
  const competitors = readCompetitors();
  const industry = readIndustry();
  const all = [...competitors, ...industry];
  return all.length > 0 && all.every((s) => s.disabled === true);
}

export function updateRefreshHours(
  sourceType: "competitor" | "industry",
  name: string,
  refreshHours: number,
): void {
  if (sourceType === "competitor") {
    const competitors = readCompetitors();
    const src = competitors.find((c) => c.name === name);
    if (src) { src.refresh_hours = refreshHours; writeCompetitors(competitors); }
  } else {
    const industry = readIndustry();
    const src = industry.find((s) => s.name === name);
    if (src) { src.refresh_hours = refreshHours; writeIndustry(industry); }
  }
}
