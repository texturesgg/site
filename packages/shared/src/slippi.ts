// The Slippi mapping (core docs/mod-profiles.md): which mods reproduce the
// gecko codes a Slippi replay ran. A mod declares the codes it reproduces in
// its manifest's `slippi` field; the registry builds the mapping from each
// mod's newest approved release, adds what the game does itself and the codes
// that don't change gameplay (slippi-mapping.json), and serves it at
// GET /api/registry/slippi.

import data from "./slippi-mapping.json";

/** Game Start facts a mapping entry may name instead of an address. */
export const SLIPPI_FACTS = ["frozen-stadium", "ucf-off"] as const;
const MAX_DECLS = 64;
const MAX_NAME = 100;
const MAX_VERSIONS = 64;

/** A code a mod reproduces, as its manifest's `slippi` field declares it. */
export type SlippiCodeDecl = { code: string; name: string; versions: string };

/** Built-in module states a code implies, by module id (`tgg.ucf`). */
export type SlippiGame = Record<string, boolean>;

/**
 * One `codes` entry of the mapping. It holds for a replay on one of `stages`
 * (Game Start stage ids; every stage when absent) whose console ran none of
 * `unless`.
 */
export type SlippiCode = {
  code: string;
  name: string;
  versions: string;
  stages?: number[];
  unless?: string[];
  id?: string;
  range?: string;
  game?: SlippiGame;
};

/**
 * One `minor` entry (a gameplay code nothing reproduces yet that rarely
 * changes a replay) or `ignore` entry (a code that doesn't change gameplay).
 */
export type SlippiIgnore = { code: string; name: string; versions: string; stages?: number[] };

/**
 * A code as the mapping names it: `0x` and eight upper-case hex digits (the
 * address a `C2` inject or a write names), or a Game Start fact.
 */
export function isSlippiCode(code: unknown): code is string {
  return (
    typeof code === "string" &&
    (/^0x[0-9A-F]{8}$/.test(code) || (SLIPPI_FACTS as readonly string[]).includes(code))
  );
}

/**
 * Whether `text` is a Slippi version requirement as tgg-mod reads one (a
 * semver requirement): `*`, or comparators joined by commas, each an
 * operator (`=`, `>`, `>=`, `<`, `<=`, `~`, `^`, or none) and a version of
 * one to three numbers: `<3.19`, `>=3.9, <3.17`.
 */
export function isSlippiVersions(text: unknown): text is string {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_VERSIONS) return false;
  if (text.trim() === "*") return true;
  return text
    .split(",")
    .every((part) => /^\s*(=|>=|<=|>|<|~|\^)?\s*\d+(\.\d+){0,2}\s*$/.test(part));
}

/**
 * The `slippi` field of a manifest: a list of `{code, name, versions}`,
 * `name` defaulting to empty and `versions` to `*`, as tgg-mod reads it.
 * The error says what's wrong with it.
 */
export function readSlippiDecls(value: unknown): { decls: SlippiCodeDecl[] } | { error: string } {
  if (value === undefined) return { decls: [] };
  if (!Array.isArray(value)) {
    return { error: "manifest.json's slippi has to be a list of {code, name, versions}" };
  }
  if (value.length > MAX_DECLS) {
    return { error: `manifest.json's slippi has more than ${MAX_DECLS} codes` };
  }
  const decls: SlippiCodeDecl[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { error: "manifest.json's slippi has to be a list of {code, name, versions}" };
    }
    const { code, name = "", versions = "*" } = entry as Record<string, unknown>;
    if (!isSlippiCode(code)) {
      return {
        error: `manifest.json's slippi code ${JSON.stringify(code)} has to be an address like 0x801D45EC (upper-case hex) or one of ${SLIPPI_FACTS.join(", ")}`,
      };
    }
    if (typeof name !== "string" || name.length > MAX_NAME) {
      return {
        error: `manifest.json's slippi name for ${code} has to be text of at most ${MAX_NAME} characters`,
      };
    }
    if (!isSlippiVersions(versions)) {
      return {
        error: `manifest.json's slippi versions for ${code} has to be a version requirement like *, <3.19 or >=3.9, <3.17`,
      };
    }
    decls.push({ code, name, versions });
  }
  return { decls };
}

/** What the registry keeps itself, beside what mods declare (slippi-mapping.json). */
export type SlippiData = {
  // Codes the game reproduces itself, by its built-in modules.
  game: (SlippiCode & { why: string })[];
  // What every code a mod declares also says, by mod id: the built-in
  // module states it implies and the codes that keep it from holding
  // (tgg.ucf-legacy replaces the built-in UCF, but not where UCF 0.84 ran).
  mods: Record<string, { game?: SlippiGame; unless?: string[] }>;
  // Gameplay codes nothing reproduces yet that rarely change a replay.
  minor: (SlippiIgnore & { why: string })[];
  // Codes that don't change gameplay, each with why.
  ignore: (SlippiIgnore & { why: string })[];
};

export const SLIPPI_DATA: SlippiData = data;

/** A mod with its approved releases, as the mapping is built from them. */
export type SlippiMod = {
  id: string;
  official: boolean;
  releases: { version: string; slippi: SlippiCodeDecl[] | null }[];
};

/**
 * The mapping's `codes`, `minor` and `ignore`: first what the game does itself, then
 * each code the newest approved release of a mod declares, by code (official
 * mods first where two claim one), with the range of that mod's releases
 * that declare it (from the oldest of the newest run that does); then the
 * registry's minor and ignored codes.
 */
export function buildSlippiMapping(
  mods: SlippiMod[],
  byVersionDescending: (a: string, b: string) => number,
  registry: SlippiData = SLIPPI_DATA
): { codes: SlippiCode[]; minor: SlippiIgnore[]; ignore: SlippiIgnore[] } {
  const declared: (SlippiCode & { official: boolean })[] = [];
  for (const mod of mods) {
    const releases = [...mod.releases].sort((a, b) => byVersionDescending(a.version, b.version));
    const newest = releases[0];
    if (!newest?.slippi) continue;
    const extra = registry.mods[mod.id] ?? {};
    for (const decl of newest.slippi) {
      let oldest = newest;
      for (const release of releases.slice(1)) {
        if (!release.slippi?.some((other) => other.code === decl.code)) break;
        oldest = release;
      }
      declared.push({
        ...decl,
        id: mod.id,
        range: `>=${oldest.version}`,
        ...(extra.unless ? { unless: extra.unless } : {}),
        ...(extra.game ? { game: extra.game } : {}),
        official: mod.official,
      });
    }
  }
  declared.sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      Number(b.official) - Number(a.official) ||
      (a.id ?? "").localeCompare(b.id ?? "")
  );
  return {
    codes: [
      ...registry.game.map(({ why: _, ...entry }) => entry),
      ...declared.map(({ official: _, ...entry }) => entry),
    ],
    minor: registry.minor.map(({ why: _, ...entry }) => entry),
    ignore: registry.ignore.map(({ why: _, ...entry }) => entry),
  };
}
