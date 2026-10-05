// The manifest fields a release records, read from a tag's manifest.json
// before anything is built.

export type SourceManifest = {
  id: string;
  version: string;
  license: string | null;
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
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { error: "manifest.json is not an object" };
  }
  const fields = json as Record<string, unknown>;
  const { id, version, license } = fields;
  if (typeof id !== "string" || typeof version !== "string") {
    return { error: "manifest.json needs an id and a version" };
  }
  return {
    manifest: {
      id,
      version,
      license: typeof license === "string" ? license : null,
      // The game refuses it too.
      refusal:
        "netplay" in fields
          ? "manifest.json has a netplay field; remove it, the game works out what counts"
          : null,
    },
  };
}
