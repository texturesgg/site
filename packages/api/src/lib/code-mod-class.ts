import { codeModBuilds, type Database } from "@vgskins/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

/**
 * What the display check reads of a packed manifest. A package has a library
 * when its manifest names the target it was built for (or, in packages from
 * before API 1.0, the library itself in `entry`); a script or a files-only
 * package has neither.
 */
const CheckedManifest = z.object({
  script: z.boolean().optional().catch(undefined),
  entry: z.string().optional().catch(undefined),
  target: z.string().optional().catch(undefined),
  hooks: z
    .object({ replaces: z.array(z.string()).catch([]) })
    .optional()
    .catch(undefined),
  events: z.array(z.string()).catch([]).optional(),
});

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
  const found = builds.find((build) => build.manifest != null)?.manifest;
  if (!found) return "it has no successful build to check";
  const manifest = CheckedManifest.parse(found);
  if (manifest.script === true) return "a script's class comes from its scripts";
  if (manifest.entry === undefined && manifest.target === undefined) {
    return "it has no code, so it never counts anyway";
  }
  const replaces = manifest.hooks?.replaces ?? [];
  if (replaces.length > 0) return `it replaces a game function (${replaces[0]})`;
  if (manifest.events?.includes("pad_read")) return "it rewrites input (the pad_read event)";
  return null;
}
