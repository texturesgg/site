import { codeModBuilds, type Database } from "@vgskins/db";
import { and, eq } from "drizzle-orm";

/**
 * Why a release can't be a display mod, or null when it can: the same check
 * tgg makes when the builder stamps one (`tgg mod build --class display`,
 * tgg-mod's `netplay::display_check`). A display mod's library replaces no
 * game function and doesn't subscribe to `pad_read`, where input could be
 * rewritten before netplay sends it. It reads the manifest of the release's
 * succeeded check build; a release without one, or without a library, can't
 * be one.
 */
export async function displayBlocker(db: Database, releaseId: string): Promise<string | null> {
  const builds = await db
    .select({ manifest: codeModBuilds.manifest })
    .from(codeModBuilds)
    .where(and(eq(codeModBuilds.releaseId, releaseId), eq(codeModBuilds.status, "succeeded")));
  const manifest = builds.find((build) => build.manifest != null)?.manifest as
    | { entry?: unknown; hooks?: { replaces?: unknown }; events?: unknown }
    | undefined;
  if (!manifest) return "it has no successful build to check";
  if (typeof manifest.entry !== "string") return "it has no code, so it never counts anyway";
  const replaces = Array.isArray(manifest.hooks?.replaces) ? manifest.hooks.replaces : [];
  if (replaces.length > 0) return `it replaces a game function (${String(replaces[0])})`;
  const events = Array.isArray(manifest.events) ? manifest.events : [];
  if (events.includes("pad_read")) return "it rewrites input (the pad_read event)";
  return null;
}
