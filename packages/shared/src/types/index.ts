import { z } from "zod";

// The API's response contract is the inferred hono/client `AppType`; do not
// add parallel response DTO schemas here. This module only carries values
// genuinely consumed by more than one package: enum tuples, validation
// limits, upload/input schemas, and file-name helpers.

import {
  IMAGE_TYPE_EXTENSIONS,
  isModFileName,
  LIMITS,
  MOD_FILE_EXTENSIONS,
  SUPPORT_LINK_KINDS,
  SUPPORT_SERVICES,
  type SupportLinkKind,
  type SupportService,
} from "./constants.js";

export * from "./constants.js";

// === Input schemas (used by API validators, importable by frontend) ===

// Messages here reach the user through the API's validation hook, so each names its field.
const maxLength = (field: string, max: number) => `${field} must be ${max} characters or fewer`;

const username = z
  .string()
  .min(LIMITS.USERNAME_MIN, `Username must be at least ${LIMITS.USERNAME_MIN} characters`)
  .max(LIMITS.USERNAME_MAX, `Username must be at most ${LIMITS.USERNAME_MAX} characters`);
const bio = z.string().max(LIMITS.BIO_MAX, maxLength("Bio", LIMITS.BIO_MAX));
const pronouns = z.string().max(LIMITS.PRONOUNS_MAX, maxLength("Pronouns", LIMITS.PRONOUNS_MAX));
const twitterHandle = z
  .string()
  .max(LIMITS.TWITTER_HANDLE_MAX, maxLength("X handle", LIMITS.TWITTER_HANDLE_MAX));
const websiteUrl = z
  .string()
  .transform((val) => (val === "" ? null : val))
  .pipe(z.httpUrl("Website must be a full URL starting with http:// or https://").nullable());

// Each service's name and the hosts its links live on. A GitHub Sponsors
// link is also under /sponsors/.
const SERVICES: Record<SupportService, { name: string; hosts: string[]; path?: RegExp }> = {
  kofi: { name: "Ko-fi", hosts: ["ko-fi.com", "www.ko-fi.com"] },
  patreon: { name: "Patreon", hosts: ["patreon.com", "www.patreon.com"] },
  "github-sponsors": {
    name: "GitHub Sponsors",
    hosts: ["github.com"],
    path: /^\/sponsors\/[^/]+\/?$/,
  },
  youtube: { name: "YouTube", hosts: ["youtube.com", "www.youtube.com"] },
  twitch: { name: "Twitch", hosts: ["twitch.tv", "www.twitch.tv"] },
};

/** Why `url` can't be a `kind` support link, or null when it can. */
function supportLinkUrlError(kind: SupportLinkKind, url: string): string | null {
  const service = kind === "other" ? null : SERVICES[kind];
  const name = service?.name ?? "Link";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `${name} link must be a full URL starting with https://`;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    return `${name} link must be a plain URL starting with https://`;
  }
  if (!service) return parsed.hostname.includes(".") ? null : "Link must be a public URL";
  if (
    !service.hosts.includes(parsed.hostname) ||
    (service.path && !service.path.test(parsed.pathname))
  ) {
    return `${name} link must be a ${service.name} page`;
  }
  return null;
}

const supportLinkUrl = z
  .string()
  .trim()
  .max(LIMITS.SUPPORT_LINK_URL_MAX, maxLength("Link", LIMITS.SUPPORT_LINK_URL_MAX));

export const SupportLink = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.enum(SUPPORT_SERVICES),
      url: supportLinkUrl,
    }),
    z.object({
      kind: z.literal("other"),
      label: z
        .string()
        .trim()
        .min(1, "Name the other link")
        .max(LIMITS.SUPPORT_LINK_LABEL_MAX, maxLength("Link name", LIMITS.SUPPORT_LINK_LABEL_MAX)),
      url: supportLinkUrl,
    }),
  ])
  .superRefine((link, ctx) => {
    const error = supportLinkUrlError(link.kind, link.url);
    if (error) ctx.addIssue({ code: "custom", message: error, path: ["url"] });
  });
export type SupportLink = z.infer<typeof SupportLink>;

/** A profile's support links: each kind at most once. */
const supportLinks = z
  .array(SupportLink)
  .max(SUPPORT_LINK_KINDS.length)
  .superRefine((links, ctx) => {
    const kinds = links.map((link) => link.kind);
    if (new Set(kinds).size !== kinds.length) {
      ctx.addIssue({ code: "custom", message: "Add each kind of support link once" });
    }
  });

export const OnboardingInput = z.object({
  // Bounds only: the API applies validateUsername unless the name is unchanged, since an
  // imported creator may keep a name that predates today's rules.
  name: z.string().min(1, "Choose a username").max(64, "Username is too long"),
  bio: bio.optional(),
  pronouns: pronouns.optional(),
  twitterHandle: twitterHandle.optional(),
  websiteUrl: websiteUrl.optional(),
});
export type OnboardingInput = z.infer<typeof OnboardingInput>;

export const UpdateProfileInput = z.object({
  name: username.optional(),
  bio: bio.optional(),
  pronouns: pronouns.optional(),
  showDiscord: z.boolean().optional(),
  showTwitter: z.boolean().optional(),
  showGithub: z.boolean().optional(),
  twitterHandle: twitterHandle.optional(),
  websiteUrl: websiteUrl.optional(),
  supportLinks: supportLinks.optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

export const CommentInput = z.object({
  body: z
    .string()
    .trim()
    .min(LIMITS.COMMENT_MIN, "Comment can't be empty")
    .max(LIMITS.COMMENT_MAX, maxLength("Comment", LIMITS.COMMENT_MAX)),
  parentId: z.string().optional(),
});
export type CommentInput = z.infer<typeof CommentInput>;

// === Upload form schemas (multipart — string fields only, files validated at runtime) ===

// Upload form — always creates a pack. Single mod or multi-mod.
export const UploadPackForm = z.object({
  title: z
    .string()
    .trim()
    .min(LIMITS.PACK_TITLE_MIN, "Title is required")
    .max(LIMITS.PACK_TITLE_MAX, maxLength("Title", LIMITS.PACK_TITLE_MAX)),
  gameId: z.string().min(1, "Choose a game"),
  targetId: z.string().min(1, "Choose a character or stage"),
  description: z
    .string()
    .max(LIMITS.PACK_DESCRIPTION_MAX, maxLength("Description", LIMITS.PACK_DESCRIPTION_MAX))
    .transform((v) => v || null)
    .nullable()
    .optional(),
  tags: z
    .string()
    .max(LIMITS.TAG_NAME_MAX * LIMITS.TAG_COUNT_MAX + LIMITS.TAG_COUNT_MAX, "Too many tags")
    .transform((v) => v || null)
    .nullable()
    .optional(),
  turnstileToken: z.string().optional(),
});
export type UploadPackForm = z.infer<typeof UploadPackForm>;

// === File validation helpers ===
// Each returns an error message to show the user, or null when the file is valid.

const ALLOWED_IMAGE_TYPES = new Set(Object.keys(IMAGE_TYPE_EXTENSIONS));

/** Check a File's size and optionally its MIME type. */
export function fileError(
  file: File,
  opts: { maxSize: number; allowedTypes?: Set<string>; label?: string }
): string | null {
  const label = opts.label ?? "File";
  if (file.size > opts.maxSize) {
    const mb = Math.round(opts.maxSize / 1024 / 1024);
    return `${label} must be less than ${mb}MB`;
  }
  if (opts.allowedTypes && !opts.allowedTypes.has(file.type)) {
    return `${label} has invalid type: ${file.type}`;
  }
  return null;
}

/** Normalize a parseBody({ all: true }) value into a File[]. */
export function toFileArray(raw: unknown): File[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.filter((f): f is File => f instanceof File);
}

export function modFileError(file: File, label = "Mod file"): string | null {
  return (
    fileError(file, { maxSize: LIMITS.FILE_SIZE_DAT, label }) ??
    (isModFileName(file.name)
      ? null
      : `${label} must use one of: ${MOD_FILE_EXTENSIONS.join(", ")}`)
  );
}

/** Check an array of image Files. */
export function imagesError(files: File[]): string | null {
  if (files.length > LIMITS.PACK_IMAGES_MAX) {
    return `Maximum ${LIMITS.PACK_IMAGES_MAX} preview images`;
  }
  for (const img of files) {
    const error = fileError(img, {
      maxSize: LIMITS.FILE_SIZE_IMAGE,
      allowedTypes: ALLOWED_IMAGE_TYPES,
      label: "Image",
    });
    if (error) return error;
  }
  return null;
}
