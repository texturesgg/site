// Ordering code mod versions and matching them against `depends` ranges, as
// tgg-mod does (core's crates/tgg-mod/src/depends.rs), and choosing which
// approved releases are worth building for a layout.

/** A version's major, minor and patch, and its pre-release. */
function versionKey(version: string): { core: number[]; pre: string | null } {
  const [core, ...pre] = version.split("+")[0].split("-");
  const parts = core.split(".").map((part) => Number(part) || 0);
  return { core: [0, 1, 2].map((i) => parts[i] ?? 0), pre: pre.length ? pre.join("-") : null };
}

/** Newest first; a pre-release comes after (is older than) its release. */
export function byVersionDescending(a: string, b: string): number {
  const [x, y] = [versionKey(a), versionKey(b)];
  const part = x.core.findIndex((value, i) => value !== y.core[i]);
  if (part !== -1) return y.core[part] - x.core[part];
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return -1;
  if (y.pre === null) return 1;
  return y.pre.localeCompare(x.pre, "en", { numeric: true });
}

/**
 * Whether `version` is in `range` (codeModRangeSchema's syntax): `1.2.3`
 * exactly, `1.2` any 1.2.x, `^1.2` the same leftmost non-zero part and at
 * least 1.2, `~1.2` the same minor and at least 1.2, `>=1.2`, or `*`. Only
 * major, minor and patch count; a pre-release or build suffix is ignored. A
 * range that doesn't parse matches nothing.
 */
export function rangeMatches(range: string, version: string): boolean {
  if (range === "*") return true;
  const match = /^(>=|\^|~)?(\d+(?:\.\d+){0,2})(?:[-+].*)?$/.exec(range);
  if (!match) return false;
  const op = match[1] ?? "";
  const given = match[2].split(".").map(Number);
  const low = [0, 1, 2].map((i) => given[i] ?? 0);
  const have = versionKey(version).core;
  const below = have.findIndex((value, i) => value !== low[i]);
  if (below !== -1 && have[below] < low[below]) return false;
  if (op === ">=") return true;
  // The last part that must stay the same.
  let fixed: number;
  if (op === "^") {
    fixed = 0;
    while (fixed < given.length - 1 && low[fixed] === 0) fixed++;
  } else if (op === "~") {
    fixed = given.length > 1 ? 1 : 0;
  } else {
    fixed = given.length - 1;
  }
  return have.slice(0, fixed + 1).every((value, i) => value === low[i]);
}

/**
 * The releases among `releases` (a mod's approved ones, by its slug) worth a
 * build for a new target: each mod's newest version, and for each range a
 * set takes the mod in (`ranges`) that the newest is outside, the newest
 * version inside it. Older versions nothing points players at get none.
 */
export function releasesWorthBuilding<R extends { mod: string; version: string }>(
  releases: R[],
  ranges: { mod: string; range: string }[]
): R[] {
  const byMod = new Map<string, R[]>();
  for (const release of releases) {
    const list = byMod.get(release.mod) ?? [];
    list.push(release);
    byMod.set(release.mod, list);
  }
  const wanted = new Set<R>();
  for (const [mod, list] of byMod) {
    const sorted = [...list].sort((a, b) => byVersionDescending(a.version, b.version));
    wanted.add(sorted[0]);
    for (const { range } of ranges.filter((entry) => entry.mod === mod)) {
      const inside = sorted.find((release) => rangeMatches(range, release.version));
      if (inside) wanted.add(inside);
    }
  }
  return releases.filter((release) => wanted.has(release));
}
