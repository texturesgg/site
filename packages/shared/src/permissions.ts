import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";
import type { UserRole } from "./types/constants.js";

/**
 * Permission statements for the application.
 * Extends better-auth's default statements with custom pack moderation.
 */
const statement = {
  ...defaultStatements,
  pack: ["approve", "reject", "delete"],
} as const;

export const ac = createAccessControl(statement);

/**
 * Regular user role - inherits default user permissions
 */
export const user = ac.newRole({
  ...userAc.statements,
});

/**
 * Moderator role - can moderate packs, review reports, and look users up.
 * Banning is admin-only: better-auth's ban endpoints never compare the
 * caller's role with the target's.
 */
export const moderator = ac.newRole({
  ...userAc.statements,
  user: ["list", "get"],
  pack: ["approve", "reject"],
});

/**
 * Admin role - full control over all resources
 */
export const admin = ac.newRole({
  ...adminAc.statements,
  pack: ["approve", "reject", "delete"],
});

// `satisfies` keeps these keys in compile-time sync with the USER_ROLES tuple.
export const roles = { user, moderator, admin } satisfies Record<UserRole, unknown>;

export type { UserRole } from "./types/constants.js";
