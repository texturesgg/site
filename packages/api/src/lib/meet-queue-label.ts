import { codeModReleases, codeModSetMods, codeModSets, codeMods, createDb } from "@vgskins/db";
import {
  byVersionDescending,
  MEET_MAX_LABEL,
  type MeetQueueInfo,
  type MeetStandingQueue,
  MEET_STANDING_MAX,
  rangeMatches,
} from "@vgskins/shared";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Env } from "../types";

/**
 * A name for a matchmaking queue (packages/meet's Queue DO), from the mods
 * that count in it: the set whose gameplay mods they are ("Competitive"),
 * with any others after it ("Competitive + Volleyball"), or the mods' own
 * names. Only what the game and an app show; pairing never looks at it.
 */

/** Mods every online game has, left out of a name made from mods' names. */
const PLUMBING = new Set(["tgg.netplay", "tgg.direct-connect", "tgg.http", "tgg.unlocks"]);

/** The most mods read from a list. */
const MAX_MODS = 64;

export type ProfileMod = { id: string; version: string };

/** "id version, id version" (tgg_mod_set_names) as a list. */
export function parseNames(names: string): ProfileMod[] {
  const mods: ProfileMod[] = [];
  for (const part of names.split(",")) {
    const [id, version, ...rest] = part.trim().split(/\s+/);
    if (id && version && rest.length === 0) mods.push({ id, version });
    if (mods.length >= MAX_MODS) break;
  }
  return mods;
}

export type LabelSet = {
  /** The set's id; with `queue`, set only for a set that is a standing queue. */
  name?: string;
  queue?: boolean;
  title: string;
  /** Its mods, and whether each counts for netplay at the release the set
   * takes (a gameplay mod; display and offline ones don't). */
  mods: { mod: string; range: string; counted: boolean }[];
};

/** A name that fits a queue's label. */
function fit(label: string): string {
  return label.length > MEET_MAX_LABEL ? `${label.slice(0, MEET_MAX_LABEL - 3)}...` : label;
}

/**
 * The queue's name, and the standing queue it is: the set marked as a queue
 * whose gameplay mods are exactly the profile's (plumbing aside), or null.
 */
export function queueFor(
  profile: ProfileMod[],
  sets: LabelSet[],
  names: Map<string, string>
): { label: string; set: string | null } {
  const nameOf = (id: string) => names.get(id) ?? id;
  let best: { set: LabelSet; size: number } | null = null;
  for (const set of sets) {
    // Online plumbing alone doesn't name a queue: a set built to be built on
    // ("Online play") never wins over the set that holds the rules.
    const counted = set.mods.filter((m) => m.counted && !PLUMBING.has(m.mod));
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
  const standing = best && extras.length === 0 && best.set.queue && best.set.name;
  return { label: fit(label), set: standing || null };
}

type RegistrySet = {
  name: string;
  title: string;
  queue: boolean;
  /** Each mod at the newest approved release its range takes, if any. */
  mods: { mod: string; range: string; counted: boolean; version: string | null }[];
};

type Registry = {
  sets: Map<string, RegistrySet>;
  modNames: Map<string, string>;
};

/** Every set with its mods, each at the newest approved release its range takes. */
async function loadRegistry(env: Env): Promise<Registry> {
  const db = createDb(env.DB);
  const [setRows, releases] = await Promise.all([
    db
      .select({
        set: codeModSets.name,
        title: codeModSets.title,
        queue: codeModSets.queue,
        mod: codeModSetMods.mod,
        range: codeModSetMods.range,
      })
      .from(codeModSetMods)
      .innerJoin(codeModSets, eq(codeModSets.name, codeModSetMods.setName))
      .orderBy(asc(codeModSets.name), asc(codeModSetMods.position)),
    db
      .select({
        slug: codeMods.slug,
        name: codeMods.name,
        version: codeModReleases.version,
        class: codeModReleases.class,
      })
      .from(codeModReleases)
      .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
      .where(and(eq(codeModReleases.status, "approved"), isNull(codeMods.deletedAt))),
  ]);
  const modNames = new Map(releases.map((r) => [r.slug, r.name]));
  const sets: Registry["sets"] = new Map();
  for (const row of setRows) {
    const set: RegistrySet = sets.get(row.set) ?? {
      name: row.set,
      title: row.title,
      queue: row.queue,
      mods: [],
    };
    const newest = releases
      .filter((r) => r.slug === row.mod && rangeMatches(row.range, r.version))
      .sort((a, b) => byVersionDescending(a.version, b.version))[0];
    set.mods.push({
      mod: row.mod,
      range: row.range,
      counted: newest ? newest.class === null : false,
      version: newest?.version ?? null,
    });
    sets.set(row.set, set);
  }
  return { sets, modNames };
}

/** The queue's name for the mods in `names`, from the registry. */
export async function queueLabel(env: Env, names: string): Promise<string> {
  const info = await queueInfo(env, names);
  return info.label;
}

/** The queue's name, its standing set if it is one, and its mods, for the mods in `names`. */
export async function queueInfo(env: Env, names: string): Promise<NonNullable<MeetQueueInfo>> {
  const profile = parseNames(names);
  const { sets, modNames } = await loadRegistry(env);
  const { label, set } = queueFor(profile, [...sets.values()], modNames);
  return { label, set, mods: profile };
}

/**
 * The sets marked as queues, each with the gameplay mods it needs at their
 * newest approved release; a set none of whose mods have one is left out.
 */
export async function standingQueues(env: Env): Promise<MeetStandingQueue[]> {
  const { sets } = await loadRegistry(env);
  return [...sets.values()]
    .filter((set) => set.queue)
    .map((set) => ({
      set: set.name,
      label: fit(set.title),
      mods: set.mods.flatMap((m) =>
        m.counted && m.version ? [{ id: m.mod, version: m.version }] : []
      ),
    }))
    .filter((queue) => queue.mods.length > 0)
    .slice(0, MEET_STANDING_MAX);
}
