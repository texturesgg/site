import type { codeModLayouts } from "@vgskins/db";

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
