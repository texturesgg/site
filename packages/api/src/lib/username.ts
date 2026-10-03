import { type Database, users } from "@vgskins/db";
import { LIMITS, validateUsername } from "@vgskins/shared";
import { eq, or } from "drizzle-orm";

const SUFFIX_ATTEMPTS = 8;

/**
 * Turn an OAuth display name or email local part into a valid username
 * candidate. Onboarding lets the user choose their real name afterwards.
 */
export function usernameCandidate(raw: string): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, LIMITS.USERNAME_MAX)
    .replace(/[-_]+$/, "");

  if (cleaned.length >= LIMITS.USERNAME_MIN && validateUsername(cleaned).valid) return cleaned;
  return cleaned.length > 0 ? `${cleaned}-user`.slice(0, LIMITS.USERNAME_MAX) : "user";
}

function withSuffix(base: string, suffix: string): string {
  return `${base.slice(0, LIMITS.USERNAME_MAX - suffix.length - 1)}-${suffix}`;
}

/**
 * Pick a username that is not taken, preferring the unmodified candidate.
 * `users.name` is unique, so a collision would otherwise fail account creation.
 */
export async function uniqueUsername(
  raw: string,
  isTaken: (name: string) => Promise<boolean>,
  randomSuffix: () => string = () => String(Math.floor(1000 + Math.random() * 9000))
): Promise<string> {
  const base = usernameCandidate(raw);
  if (base !== "user" && !(await isTaken(base))) return base;

  for (let attempt = 0; attempt < SUFFIX_ATTEMPTS; attempt++) {
    const candidate = withSuffix(base, randomSuffix());
    if (!(await isTaken(candidate))) return candidate;
  }
  return withSuffix("user", crypto.randomUUID().slice(0, 8));
}

/**
 * Why a user may not take `name`, or null when they may. Keeping the current
 * name is always allowed: an imported creator's name may predate today's rules.
 */
export async function usernameError(
  db: Database,
  name: unknown,
  self: { id: string; name: string }
): Promise<string | null> {
  if (typeof name !== "string") return "Choose a username";
  if (name === self.name) return null;
  const check = validateUsername(name);
  if (!check.valid) return check.error;
  // A profile is looked up by name, then by id, so a name may be neither.
  const taken = await db.query.users.findFirst({
    where: or(eq(users.name, name), eq(users.id, name)),
    columns: { id: true },
  });
  return taken && taken.id !== self.id ? "Name already taken" : null;
}
