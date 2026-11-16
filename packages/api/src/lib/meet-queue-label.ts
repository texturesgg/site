import { codeModReleases, codeModSetMods, codeModSets, codeMods, createDb } from "@vgskins/db";
import { byVersionDescending, rangeMatches } from "@vgskins/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Env } from "../types";

/**
 * A name for a matchmaking queue (packages/meet's Queue DO), from the mods
 * that count in it: the set whose gameplay mods they are ("Competitive"),
 * with any others after it ("Competitive + Volleyball"), or the mods' own
 * names. Only what the game and an app show; pairing never looks at it.
 */

/** The longest name. */
export const MAX_LABEL = 48;

/** Mods every online game has, left out of a name made from mods' names. */
const PLUMBING = new Set(["tgg.netplay", "tgg.direct-connect", "tgg.http", "tgg.unlocks"]);

export type ProfileMod = { id: string; version: string };

/** "id version, id version" (tgg_mod_set_names) as a list. */
export function parseNames(names: string): ProfileMod[] {
  const mods: ProfileMod[] = [];
  for (const part of names.split(",")) {
    const [id, version, ...rest] = part.trim().split(/\s+/);
    if (id && version && rest.length === 0) mods.push({ id, version });
    if (mods.length >= 64) break;
  }
  return mods;
}

export type LabelSet = {
  title: string;
  /** Its mods, and whether each counts for netplay at the release the set
   * takes (a gameplay mod; display and offline ones don't). */
  mods: { mod: string; range: string; counted: boolean }[];
};

export function labelFor(
  profile: ProfileMod[],
  sets: LabelSet[],
  names: Map<string, string>
): string {
  const nameOf = (id: string) => names.get(id) ?? id;
  let best: { set: LabelSet; size: number } | null = null;
  for (const set of sets) {
    const counted = set.mods.filter((m) => m.counted);
    if (counted.length === 0) continue;
    const fits = set.mods.every((m) => {
      const have = profile.find((p) => p.id === m.mod);
      return have ? rangeMatches(m.range, have.version) : !m.counted;
    });
    if (fits && (!best || counted.length > best.size)) best = { set, size: counted.length };
  }
  const extras = profile
    .filter((p) => !best?.set.mods.some((m) => m.mod === p.id))
    .filter((p) => !PLUMBING.has(p.id))
    .map((p) => nameOf(p.id));
  const listed =
    extras.length <= 2
      ? extras.join(" + ")
      : `${extras.slice(0, 2).join(" + ")} + ${extras.length - 2} more`;
  let label: string;
  if (best) label = extras.length ? `${best.set.title} + ${listed}` : best.set.title;
  else label = extras.length ? listed : "No gameplay mods";
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 3)}...` : label;
}

/** The queue's name for the mods in `names`, from the registry. */
export async function queueLabel(env: Env, names: string): Promise<string> {
  const profile = parseNames(names);
  const db = createDb(env.DB);
  const setRows = await db
    .select({
      set: codeModSets.name,
      title: codeModSets.title,
      mod: codeModSetMods.mod,
      range: codeModSetMods.range,
    })
    .from(codeModSetMods)
    .innerJoin(codeModSets, eq(codeModSets.name, codeModSetMods.setName));
  const releases = await db
    .select({
      slug: codeMods.slug,
      name: codeMods.name,
      version: codeModReleases.version,
      class: codeModReleases.class,
    })
    .from(codeModReleases)
    .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
    .where(and(eq(codeModReleases.status, "approved"), isNull(codeMods.deletedAt)));

  const modNames = new Map(releases.map((r) => [r.slug, r.name]));
  const sets = new Map<string, LabelSet>();
  for (const row of setRows) {
    const set = sets.get(row.set) ?? { title: row.title, mods: [] };
    const newest = releases
      .filter((r) => r.slug === row.mod && rangeMatches(row.range, r.version))
      .sort((a, b) => byVersionDescending(a.version, b.version))[0];
    set.mods.push({
      mod: row.mod,
      range: row.range,
      counted: newest ? newest.class === null : false,
    });
    sets.set(row.set, set);
  }
  return labelFor(profile, [...sets.values()], modNames);
}
