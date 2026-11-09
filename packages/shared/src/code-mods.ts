import { z } from "zod";

/**
 * A code mod's id, as its manifest's `id`: 1 to 64 lowercase letters,
 * digits, `.`, `-` or `_`, not starting with `.`. It also names the folder
 * the mod installs into, so tgg-mod and the runtime apply the same rule.
 */
export const codeModSlugSchema = z
  .string()
  .min(1, "A mod id is required")
  .max(64, "A mod id is at most 64 characters")
  .regex(
    /^[a-z0-9_-][a-z0-9._-]*$/,
    "Use lowercase letters, digits, '.', '-' and '_', not starting with '.'"
  );

/**
 * The id prefix no registry mod may take: tgg names the skins it makes on
 * the player's machine `skin.<file>`.
 */
export const RESERVED_CODE_MOD_ID_PREFIX = "skin.";

export const createCodeModSchema = z.object({
  slug: codeModSlugSchema.refine(
    (slug) => !slug.startsWith(RESERVED_CODE_MOD_ID_PREFIX),
    `Ids starting with ${RESERVED_CODE_MOD_ID_PREFIX} are kept for skins`
  ),
  name: z.string().trim().min(1, "A name is required").max(80),
  description: z.string().trim().max(2000).optional(),
});

export type CreateCodeMod = z.infer<typeof createCodeModSchema>;

/**
 * What a code mod's package counts as for netplay, as `tgg mod build` infers
 * it from what the package holds: a library (`code`), a disc file that can
 * affect play (`files`), only fighter costumes, which the game checks for
 * changes beyond looks (`costumes`), or menu and trophy files and assets
 * alone (`data`, which is free).
 */
export const CODE_MOD_NETPLAY_CLASSES = ["code", "files", "costumes", "data"] as const;
export type CodeModNetplay = (typeof CODE_MOD_NETPLAY_CLASSES)[number];

/**
 * A version range in the game's `depends` syntax, as tgg-mod reads it: a
 * version (`1.2.3` exactly, `1.2` any 1.2.x), `^1.2`, `~1.2`, `>=1.2`, or
 * `*`. A pre-release or build suffix on the version is allowed and ignored.
 */
export const codeModRangeSchema = z
  .string()
  .max(64)
  .regex(
    /^(\*|(>=|\^|~)?\d+(\.\d+){0,2}([-+].*)?)$/,
    "Use a version range: 1.2.3, 1.2, ^1.2, ~1.2, >=1.2 or *"
  );

/** A set's name, its id: lowercase letters, digits, `-` and `_`. */
export const codeModSetNameSchema = z
  .string()
  .min(1, "A set name is required")
  .max(64, "A set name is at most 64 characters")
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Use lowercase letters, digits, '-' and '_'");

/** A set as an admin writes it; the registry keeps its version. */
export const putCodeModSetSchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(80),
  description: z.string().trim().max(2000).default(""),
  mods: z
    .array(z.object({ id: codeModSlugSchema, range: codeModRangeSchema }))
    .max(200)
    .refine(
      (mods) => new Set(mods.map((mod) => mod.id)).size === mods.length,
      "A set lists each mod once"
    ),
});

export type PutCodeModSet = z.infer<typeof putCodeModSetSchema>;
