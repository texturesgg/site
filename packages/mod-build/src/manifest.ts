// The manifest fields a release records, read from a tag's manifest.json
// before anything is built.

export type SourceManifest = {
  id: string;
  version: string;
  license: string | null;
  // The mods it needs, each id with the version range it accepts.
  depends: Record<string, string>;
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
  return {
    manifest: {
      id,
      version,
      license: typeof license === "string" ? license : null,
      depends: dependsOk ? (depends as Record<string, string>) : {},
      // The game refuses both too.
      refusal:
        "netplay" in json
          ? "manifest.json has a netplay field; remove it, the game works out what counts"
          : !dependsOk
            ? "manifest.json's depends has to map mod ids to version ranges"
            : null,
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
