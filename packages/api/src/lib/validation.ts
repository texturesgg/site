/**
 * Shared validation utilities for API endpoints.
 * Centralizes input validation to prevent bugs and security issues.
 */

import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";

// ============================================================================
// Request validation
// ============================================================================

/**
 * zValidator hook: a failed parse returns the first issue as `{ error }`, the
 * API's error body, instead of Zod's issue object. Pass it as the third
 * argument: `zValidator("json", schema, validationHook)`.
 */
export function validationHook(
  result: { success: true } | { success: false; error: { issues: readonly { message: string }[] } },
  c: Context
) {
  if (!result.success) {
    return c.json({ error: result.error.issues[0]?.message ?? "Invalid request" }, 400);
  }
}

// ============================================================================
// Pagination
// ============================================================================

/**
 * Query schema for paginated routes. Declaring it with zValidator lets
 * hono/client type the `query` argument; parsePagination still clamps bounds.
 */
export const PaginationQuery = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

export interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
}

export interface PaginationDefaults {
  defaultPage?: number;
  defaultPageSize?: number;
  maxPageSize?: number;
  maxPage?: number;
}

/**
 * Parse and validate pagination parameters.
 * Ensures bounds are respected to prevent DoS via large page sizes.
 */
export function parsePagination(
  query: { page?: string; pageSize?: string },
  defaults: PaginationDefaults = {}
): PaginationParams {
  const { defaultPage = 1, defaultPageSize = 20, maxPageSize = 100, maxPage = 10000 } = defaults;

  const page = Math.max(
    1,
    Math.min(parseInt(query.page || String(defaultPage), 10) || defaultPage, maxPage)
  );
  const pageSize = Math.max(
    1,
    Math.min(
      parseInt(query.pageSize || String(defaultPageSize), 10) || defaultPageSize,
      maxPageSize
    )
  );
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}

/**
 * Build pagination response with correct total count.
 */
export function paginationResponse<T>(
  items: T[],
  total: number,
  params: PaginationParams
): { items: T[]; page: number; pageSize: number; total: number; totalPages: number } {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.ceil(total / params.pageSize),
  };
}

// ============================================================================
// Search
// ============================================================================

/**
 * Sanitize search input: trim and enforce a length limit.
 * Returns the raw search term; LIKE wildcard escaping is owned by
 * `likeContains`, which pairs it with the required ESCAPE clause.
 */
export function sanitizeSearch(input: string | undefined, maxLength = 100): string | undefined {
  if (!input) return undefined;

  const trimmed = input.trim().slice(0, maxLength);
  return trimmed || undefined;
}

/**
 * Escape LIKE pattern metacharacters (`\`, `%`, `_`) in a user-supplied term.
 * Only meaningful when the resulting pattern is used with `ESCAPE '\'`;
 * SQLite's LIKE has no default escape character, so without that clause the
 * backslashes are matched literally and wildcards stay active.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Case-insensitive substring condition for user-controlled search terms.
 * Emits `column LIKE '%term%' ESCAPE '\'` with wildcards neutralized.
 */
export function likeContains(column: SQLWrapper, term: string): SQL {
  return sql`${column} LIKE ${`%${escapeLikePattern(term)}%`} ESCAPE '\\'`;
}

// ============================================================================
// File Paths
// ============================================================================

const ALLOWED_PATH_PREFIXES = ["packs/", "games/", "users/"] as const;

/**
 * Validate an R2 object key against the allow-list of known prefixes.
 * Returns null rather than rewriting: single-pass sequence stripping can be
 * defeated by nested sequences (`....//`), so any traversal-shaped input
 * (`..` segments, `./` segments, doubled slashes) is refused outright.
 * Legitimately stored keys never contain these sequences.
 */
export function validateFilePath(path: string): string | null {
  const isAllowed = ALLOWED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));

  if (
    !isAllowed ||
    path.toLowerCase().endsWith(".glb") ||
    path.includes("..") ||
    path.includes("//") ||
    /(^|\/)\.\//.test(path)
  ) {
    return null;
  }

  return path;
}

// ============================================================================
// Enums
// ============================================================================

/**
 * Type-safe enum validation.
 */
export function validateEnum<T extends string>(
  value: string | undefined,
  validValues: readonly T[],
  defaultValue?: T
): T | undefined {
  if (!value) return defaultValue;
  if (validValues.includes(value as T)) return value as T;
  return defaultValue;
}
