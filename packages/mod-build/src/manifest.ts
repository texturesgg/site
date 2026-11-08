// The manifest fields a release records, read from a tag's manifest.json
// before anything is built.

import { readSlippiDecls, type SlippiCodeDecl } from "@vgskins/shared";

// The tags a manifest's `tags` may name, as tgg-mod's `manifest::TAGS`.
export const MOD_TAGS = [
  "competitive",
  "netplay",
  "replays",
  "training",
  "visual",
  "audio",
  "quality-of-life",
  "stage",
  "fighter",
] as const;
const MAX_TAGS = 5;
const MAX_SCREENSHOTS = 8;
const MAX_HOMEPAGE = 256;

export type SourceManifest = {
  id: string;
  version: string;
  license: string | null;
  // The mods it needs, each id with the version range it accepts.
  depends: Record<string, string>;
  // What a store shows: PNGs under assets/ by their path there, tags from
  // MOD_TAGS and a web page.
  icon: string | null;
  screenshots: string[];
  tags: string[];
  homepage: string | null;
  // The Slippi gecko codes it reproduces, for the registry's Slippi mapping.
  slippi: SlippiCodeDecl[];
  // Why the release fails without a build, or null when it can be built.
  refusal: string | null;
};

/**
 * Read `text` as a manifest. An error means there is no release to record
 * (not JSON, or no id and version); a refusal is a release that fails.
 */
export function parseManifest(text: string): { manifest: SourceManifest } | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "manifest.json is not JSON" };
  }
  if (!isObject(json)) return { error: "manifest.json is not an object" };
  const { id, version, license, depends = {} } = json;
  if (typeof id !== "string" || typeof version !== "string") {
    return { error: "manifest.json needs an id and a version" };
  }
  const dependsOk =
    isObject(depends) && Object.values(depends).every((range) => typeof range === "string");
  const listing = readListingFields(json);
  const slippi = readSlippiDecls(json.slippi);
  return {
    manifest: {
      id,
      version,
      license: typeof license === "string" ? license : null,
      depends: dependsOk ? (depends as Record<string, string>) : {},
      icon: listing.icon,
      screenshots: listing.screenshots,
      tags: listing.tags,
      homepage: listing.homepage,
      slippi: "decls" in slippi ? slippi.decls : [],
      // The game refuses the first two too; tgg refuses the listing's.
      refusal:
        "netplay" in json
          ? "manifest.json has a netplay field; remove it, the game works out what counts"
          : !dependsOk
            ? "manifest.json's depends has to map mod ids to version ranges"
            : (listing.refusal ?? ("error" in slippi ? slippi.error : null)),
    },
  };
}

/** The listing fields of `json`, as tgg-mod's `Manifest::check_listing` checks them. */
function readListingFields(json: Record<string, unknown>): {
  icon: string | null;
  screenshots: string[];
  tags: string[];
  homepage: string | null;
  refusal: string | null;
} {
  const { icon = null, screenshots = [], tags = [], homepage = null } = json;
  const none = { icon: null, screenshots: [], tags: [], homepage: null };
  const refuse = (refusal: string) => ({ ...none, refusal });
  if (icon !== null && !isPngPath(icon)) {
    return refuse("manifest.json's icon has to be the path of a .png under assets/");
  }
  if (!Array.isArray(screenshots) || !screenshots.every(isPngPath)) {
    return refuse("manifest.json's screenshots have to be paths of .png files under assets/");
  }
  if (screenshots.length > MAX_SCREENSHOTS) {
    return refuse(`manifest.json has more than ${MAX_SCREENSHOTS} screenshots`);
  }
  const known: readonly string[] = MOD_TAGS;
  if (
    !Array.isArray(tags) ||
    !tags.every((tag) => typeof tag === "string" && known.includes(tag))
  ) {
    return refuse(`manifest.json's tags have to be from: ${MOD_TAGS.join(", ")}`);
  }
  if (tags.length > MAX_TAGS || new Set(tags).size !== tags.length) {
    return refuse(`manifest.json's tags have to be at most ${MAX_TAGS}, each once`);
  }
  if (homepage !== null && !isWebUrl(homepage)) {
    return refuse("manifest.json's homepage has to be an http or https URL");
  }
  return {
    icon: icon as string | null,
    screenshots: screenshots as string[],
    tags: tags as string[],
    homepage: homepage as string | null,
    refusal: null,
  };
}

/** A relative path under assets/ to a .png, by tgg's rules for asset paths. */
function isPngPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length <= 255 &&
    path.toLowerCase().endsWith(".png") &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    path.split("/").every((part) => part !== "" && !part.startsWith("."))
  );
}

function isWebUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length > MAX_HOMEPAGE || /\s/.test(url)) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.host !== "";
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
