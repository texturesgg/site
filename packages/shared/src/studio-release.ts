import { z } from "zod";

// The newest textures.gg app release, as its release workflow writes it to
// https://assets.textures.gg/studio/latest.json. The download page reads it
// when it loads, so a release needs no site change. docs/STUDIO_RELEASES.md
// has the contract.

/** The platforms the download page lists, in its order. */
export const STUDIO_PLATFORMS = ["windows", "macos", "linux"] as const;
export type StudioPlatform = (typeof STUDIO_PLATFORMS)[number];

/** One file to download. */
export const StudioAsset = z.object({
  /** What it is, shown on its button when it isn't the first: "Installer", "Zip", "dmg". */
  kind: z.string().min(1).max(40),
  /** Where it downloads from, a full https URL. */
  url: z.url({ protocol: /^https$/ }),
  /** Its size in bytes. */
  size: z.number().int().nonnegative(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  /** What it runs on, as shown: "Windows 10 or later, 64-bit". */
  min_os: z.string().min(1).max(120).optional(),
});
export type StudioAsset = z.infer<typeof StudioAsset>;

const Assets = z.array(StudioAsset).max(10);

/**
 * studio/latest.json. A platform without assets shows "Coming soon", and so
 * does every platform for a file with only `version` (the editor's old shape).
 */
export const StudioRelease = z.object({
  version: z.string().min(1).max(40),
  /** When it came out, as an ISO date. */
  released: z.iso.date().or(z.iso.datetime()).optional(),
  notes_url: z.url({ protocol: /^https$/ }).optional(),
  assets: z
    .object({ windows: Assets.optional(), macos: Assets.optional(), linux: Assets.optional() })
    .default({}),
});
export type StudioRelease = z.infer<typeof StudioRelease>;
