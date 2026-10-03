import { customAlphabet } from "nanoid";

// Generate short, URL-safe IDs
const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

export function generateId(): string {
  return nanoid();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Username validation ──────────────────────────────────

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "mod",
  "moderator",
  "system",
  "support",
  "help",
  "api",
  "www",
  "mail",
  "email",
  "root",
  "null",
  "undefined",
]);

// Accounts imported from ssbmtextures end in "-" and the old site's 8-digit user
// id, which only kept imported names unique. Native names may not use the form.
const LEGACY_NAME_SUFFIX = /-\d{8}$/;

/** The name to show for a user: the username without an imported account's id suffix. */
export function displayName(username: string): string {
  return username.replace(LEGACY_NAME_SUFFIX, "") || username;
}

export function validateUsername(
  username: string
): { valid: true } | { valid: false; error: string } {
  if (username.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters" };
  }
  if (username.length > 20) {
    return { valid: false, error: "Username must be at most 20 characters" };
  }
  if (!USERNAME_REGEX.test(username)) {
    return {
      valid: false,
      error: "Username can only contain letters, numbers, underscores, and hyphens",
    };
  }
  if (LEGACY_NAME_SUFFIX.test(username)) {
    return {
      valid: false,
      error: "Username can't end with a hyphen followed by 8 digits",
    };
  }
  if (RESERVED_USERNAMES.has(username.toLowerCase())) {
    return { valid: false, error: "This username is reserved" };
  }
  return { valid: true };
}
