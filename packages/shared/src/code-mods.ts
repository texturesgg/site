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

export const createCodeModSchema = z.object({
  slug: codeModSlugSchema,
  name: z.string().trim().min(1, "A name is required").max(80),
  description: z.string().trim().max(2000).optional(),
});

export type CreateCodeMod = z.infer<typeof createCodeModSchema>;
