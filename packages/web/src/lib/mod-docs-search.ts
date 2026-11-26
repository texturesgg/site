import type { ModDocsSearchIndex, ModDocsSearchRecord } from "@vgskins/shared/mod-docs";
import MiniSearch from "minisearch";

export type DocsSearchGroup = {
  label: string;
  items: ModDocsSearchRecord[];
};

const MAX_SYMBOLS = 12;
const MAX_HEADINGS = 12;
const SECTION_ORDER = ["Start", "Guides", "Concepts", "Ship", "Reference", "Overview", "Native C"];

/**
 * Tokenize docs text and API identifiers so Luau (`fighter:set_percent`,
 * `tgg.draw.rect`), C (`tgg_fighter_set_percent`, `TGG_ACTION_WAIT`), and plain
 * prose all match both as whole identifiers and by sub-words.
 */
function tokenizeDocs(text: string): string[] {
  const parts = text.split(/[\s.:/(),<>[\]{}"'`]+/).filter(Boolean);
  const tokens: string[] = [];
  for (const part of parts) {
    tokens.push(part);
    if (part.includes("_")) {
      for (const sub of part.split("_")) {
        if (sub.length > 0) tokens.push(sub);
      }
    }
  }
  return tokens;
}

export type DocsSearchEngine = {
  search: (query: string) => DocsSearchGroup[];
};

/** Build an in-browser MiniSearch index over one version's docs/search.json. */
export function createDocsSearchEngine(index: ModDocsSearchIndex): DocsSearchEngine {
  const byId = new Map<string, ModDocsSearchRecord>();
  for (const rec of index.records) {
    byId.set(rec.id, rec);
  }

  const mini = new MiniSearch<ModDocsSearchRecord>({
    idField: "id",
    fields: ["title", "cName", "signature", "pageTitle", "text"],
    tokenize: tokenizeDocs,
    searchOptions: {
      boost: { title: 5, cName: 4.5, pageTitle: 2.2, signature: 1.4, text: 1 },
      prefix: true,
      fuzzy: (term) => (term.length > 3 ? 0.2 : false),
    },
  });
  mini.addAll(index.records);

  return {
    search(rawQuery: string): DocsSearchGroup[] {
      const q = rawQuery.trim();
      if (!q) return [];
      const qLower = q.toLowerCase();

      let hits = mini.search(q, { combineWith: "AND" });
      if (hits.length === 0) {
        hits = mini.search(q, { combineWith: "OR" });
      }
      if (hits.length === 0) return [];

      const symbols: Array<{ rec: ModDocsSearchRecord; score: number }> = [];
      const others: Array<{ rec: ModDocsSearchRecord; score: number }> = [];

      for (const hit of hits) {
        const rec = byId.get(String(hit.id));
        if (!rec) continue;
        let score = hit.score;
        const titleLower = rec.title.toLowerCase();
        const cLower = rec.cName?.toLowerCase() ?? "";

        if (titleLower === qLower || cLower === qLower || cLower.split(" ").includes(qLower)) {
          score *= 6;
        } else if (titleLower.endsWith(`.${qLower}`) || titleLower.endsWith(`:${qLower}`)) {
          score *= 4;
        } else if (titleLower.includes(qLower) || cLower.includes(qLower)) {
          score *= 2;
        }

        if (rec.kind === "symbol") {
          // Keep functions, methods, properties, events, and types ahead of large
          // constant tables unless the query strongly targets the constant itself.
          if (
            rec.symbolKind === "constant" &&
            !titleLower.includes(qLower) &&
            !cLower.includes(qLower)
          ) {
            score *= 0.35;
          }
          symbols.push({ rec, score });
        } else {
          if (rec.kind === "page") score *= 1.15;
          others.push({ rec, score });
        }
      }

      symbols.sort((a, b) => b.score - a.score);
      others.sort((a, b) => b.score - a.score);

      const groups: DocsSearchGroup[] = [];
      const topSymbols = symbols.slice(0, MAX_SYMBOLS).map((s) => s.rec);
      if (topSymbols.length > 0) {
        groups.push({ label: "API symbols", items: topSymbols });
      }

      const bySection = new Map<string, ModDocsSearchRecord[]>();
      for (const { rec } of others.slice(0, MAX_HEADINGS)) {
        const list = bySection.get(rec.section) ?? [];
        list.push(rec);
        bySection.set(rec.section, list);
      }

      const sectionNames = [...bySection.keys()].sort((a, b) => {
        const ia = SECTION_ORDER.indexOf(a);
        const ib = SECTION_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
      });
      for (const section of sectionNames) {
        const items = bySection.get(section);
        if (items && items.length > 0) {
          groups.push({ label: section, items });
        }
      }

      return groups;
    },
  };
}
