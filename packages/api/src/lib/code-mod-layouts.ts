import type { codeModLayouts } from "@vgskins/db";
import { z } from "zod";

const ApiVersion = z
  .string()
  .regex(/^\d+\.\d+$/)
  .transform((text) => {
    const [major, minor] = text.split(".").map(Number);
    return { major, minor };
  });

/**
 * What the catalog reads from a packed manifest to serve it beyond its own
 * layout: the tier, target and API the packer recorded from the library, and
 * whether it uses experimental calls.
 */
export const StableManifest = z.object({
  tier: z.literal("stable"),
  target: z.string().min(1),
  api_version: ApiVersion,
  experimental: z.boolean().optional(),
});
export type StableManifest = z.infer<typeof StableManifest>;

/**
 * Whether a port offering API `offers` (`major.minor`) loads a stable-tier
 * package built against `manifest.api_version`. The major has to match. From
 * 1.0 a port loads packages built for its minor or an older one, unless the
 * package uses experimental calls; before 1.0, and for experimental calls,
 * the minor has to match exactly.
 */
export function stableLoadsOn(manifest: StableManifest, offers: string): boolean {
  const port = ApiVersion.safeParse(offers);
  if (!port.success) return false;
  const needs = manifest.api_version;
  if (needs.major !== port.data.major) return false;
  if (needs.major === 0 || manifest.experimental === true) return needs.minor === port.data.minor;
  return needs.minor <= port.data.minor;
}

/** The systems a tgg-melee port runs on. */
export const CODE_MOD_SYSTEMS = ["linux", "windows", "macos"] as const;
export type CodeModSystem = (typeof CODE_MOD_SYSTEMS)[number];

/** The system a layout's target triple builds for, or `other`. */
export function layoutSystem(target: string): CodeModSystem | "other" {
  if (target.includes("-linux")) return "linux";
  if (target.includes("-windows")) return "windows";
  if (target.includes("-apple-darwin")) return "macos";
  return "other";
}

/**
 * A layout as the API shows it: `GET /api/registry/layouts` lists these, and
 * each build on a mod's page carries its layout's.
 */
export function layoutSummary(
  layout: Pick<typeof codeModLayouts.$inferSelect, "id" | "target" | "portVersion" | "active">
) {
  return {
    id: layout.id,
    target: layout.target,
    system: layoutSystem(layout.target),
    portVersion: layout.portVersion,
    active: layout.active,
  };
}
