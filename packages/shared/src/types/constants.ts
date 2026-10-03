// Plain enum tuples, limits, and file-name helpers. Kept free of zod so route
// configs and app-shell code can import them without loading the schemas.

// === User roles ===

// Access-control role objects live in ./permissions.ts, which derives its
// keys from this tuple at compile time.
export const USER_ROLES = ["user", "moderator", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// === Target categories ===

export const TARGET_CATEGORIES = ["character", "stage", "ui", "audio"] as const;
export type TargetCategory = (typeof TARGET_CATEGORIES)[number];

// === Pack enums ===

export const PACK_STATUSES = [
  "processing",
  "pending",
  "approved",
  "rejected",
  "corrupted",
] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];

export const PACK_SORT_OPTIONS = ["hot", "newest", "top", "downloads"] as const;
export type PackSortBy = (typeof PACK_SORT_OPTIONS)[number];

export const PACK_PERIODS = ["week", "month", "year", "all"] as const;
export type PackPeriod = (typeof PACK_PERIODS)[number];

// === Report enums ===

/** The game the site leads with: the header's Browse link and empty states point here. */
export const PRIMARY_GAME_SLUG = "melee";

export const REPORT_REASONS = ["inappropriate", "stolen", "spam", "broken", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_TARGET_TYPES = ["pack", "comment"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_STATUSES = ["pending", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// === Validation constants (shared between client & server) ===

export const LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 20,
  BIO_MAX: 500,
  PRONOUNS_MAX: 30,
  TWITTER_HANDLE_MAX: 50,
  PACK_TITLE_MIN: 1,
  PACK_TITLE_MAX: 100,
  PACK_DESCRIPTION_MAX: 5000,
  TAG_NAME_MAX: 50,
  TAG_COUNT_MAX: 5,
  COMMENT_MIN: 1,
  COMMENT_MAX: 2000,
  REPORT_DETAILS_MAX: 1000,
  // The largest Melee reference file is 2.2 MB and stages run a few MB. The
  // queue Worker holds a DAT about three times over while parsing it (the
  // upload, the parser's copy, its data section), inside a 128 MB isolate.
  FILE_SIZE_DAT: 8 * 1024 * 1024,
  FILE_SIZE_IMAGE: 10 * 1024 * 1024,
  // An upload is parsed in memory, and multipart parsing can briefly hold the
  // body twice, so the whole request stays under half the 128 MB isolate.
  PACK_UPLOAD_BODY_MAX: 48 * 1024 * 1024,
  // What a pack's files may add up to, leaving the body room for its form fields.
  PACK_FILES_MAX: 47 * 1024 * 1024,
  PACK_MODS_MAX: 20,
  PACK_IMAGES_MAX: 5,
  MOD_LABEL_MAX: 100,
} as const;

export const MOD_FILE_EXTENSIONS = [".dat"] as const;
export const MOD_FILE_ACCEPT = MOD_FILE_EXTENSIONS.join(",");

export function isModFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return MOD_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Split a Melee costume filename into its character and costume codes:
 * "PlFxLa.dat" and "PlFxLa_SpecOp.dat" give { characterCode: "Fx", costumeCode: "La" }.
 * Returns null for anything else, such as a shared character file ("PlFx.dat") or
 * an extra model ("PlFx_Pistol.dat").
 */
export function parseCostumeFileName(
  fileName: string
): { characterCode: string; costumeCode: string } | null {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  const match = /^pl([a-z]{2})([a-z]{2})(?=[._\s-]|$)/i.exec(baseName);
  if (!match) return null;
  const code = (value: string) => value[0].toUpperCase() + value[1].toLowerCase();
  return { characterCode: code(match[1]), costumeCode: code(match[2]) };
}

// Control characters, the quote, and the characters Windows refuses in a name.
const UNSAFE_FILE_NAME_CHARACTERS = /[\p{Cc}"*:<>?|]/gu;
const FILE_NAME_STEM_MAX = 120;

/**
 * Reduce an uploaded name to a `.dat` file name that is safe as a storage key
 * segment, a zip entry, and a download name: no directories, no quotes or
 * control characters, and never empty.
 */
export function canonicalDatFileName(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop() ?? "";
  const extensionIndex = leaf.lastIndexOf(".");
  const stem = (extensionIndex >= 0 ? leaf.slice(0, extensionIndex) : leaf)
    .replace(UNSAFE_FILE_NAME_CHARACTERS, "")
    .slice(0, FILE_NAME_STEM_MAX)
    .replace(/^[.\s]+|[.\s]+$/g, "");
  return `${stem || "mod"}.dat`;
}

/** The storage extension for each image type an upload may declare. */
export const IMAGE_TYPE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
