import { z } from "zod";
import {
  CODE_MOD_KINDS,
  CODE_MOD_NETPLAY_CLASSES,
  codeModSetNameSchema,
  codeModSlugSchema,
} from "./code-mods.js";
import { ModDocsPage } from "./mod-docs.js";

// What the API's public catalog (PublicCatalogEntrypoint) tells the web
// Worker about a code mod or set, for the tags and share card a link shows.
// The web Worker parses each answer with these.

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/** A listed code mod, as its newest approved release describes it. */
export const ModShareSchema = z.object({
  id: codeModSlugSchema,
  name: z.string(),
  description: z.string().nullable(),
  publisher: z.object({ name: z.string(), official: z.boolean() }),
  version: z.string(),
  kind: z.enum(CODE_MOD_KINDS).nullable(),
  netplay: z.enum(CODE_MOD_NETPLAY_CLASSES).nullable(),
  /** The listing icon (a PNG), by its SHA-256, or null for none. */
  icon: sha256Schema.nullable(),
});
export type ModShare = z.infer<typeof ModShareSchema>;

/** A set of mods. */
export const SetShareSchema = z.object({
  name: codeModSetNameSchema,
  title: z.string(),
  description: z.string(),
  version: z.number().int(),
  modCount: z.number().int().nonnegative(),
});
export type SetShare = z.infer<typeof SetShareSchema>;

/** A listing icon's bytes, or null when no approved release has it. */
export const ShareIconSchema = z.instanceof(Uint8Array).nullable();

/** Per-page metadata for a mod docs page's HTML title, description, and Open Graph tags. */
export const ModDocsMetaSchema = z.object({
  title: z.string(),
  description: z.string(),
  /** Canonical path on textures.gg (for example "/docs/mods/latest/guides/hud"). */
  canonicalPath: z.string(),
});
export type ModDocsMeta = z.infer<typeof ModDocsMetaSchema>;

/** A raw text docs file served directly by the web Worker (.md, llms.txt, tgg.luau). */
export const ModDocsRawFileSchema = z.object({
  contentType: z.string(),
  cacheControl: z.string(),
  body: z.string(),
});
export type ModDocsRawFile = z.infer<typeof ModDocsRawFileSchema>;

/** Every public page the sitemap lists. */
export const PublicSitemapSchema = z.object({
  games: z.array(z.object({ slug: z.string(), updatedAt: z.date() })),
  packs: z.array(
    z.object({ slug: z.string(), gameSlug: z.string(), publishedAt: z.date().nullable() })
  ),
  users: z.array(z.object({ name: z.string(), updatedAt: z.date() })),
  /** Code mods, sets, and mod docs pages: empty unless code mods are on for everyone. */
  mods: z.array(z.object({ id: codeModSlugSchema, updatedAt: z.date().nullable() })),
  sets: z.array(z.object({ name: codeModSetNameSchema })),
  docs: z.array(ModDocsPage),
});
export type PublicSitemap = z.infer<typeof PublicSitemapSchema>;
