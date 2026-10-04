import type { Context, MiddlewareHandler } from "hono";
import type { HonoEnv } from "../types";

const FILE_DELIVERY_PATH = /^\/api\/packs\/by-id\/[^/]+\/(?:download|mods\/[^/]+\/download)$/;
const CODE_MOD_PACKAGE_PATH = /^\/api\/code-mods\/packages\/[^/]+$/;
const MOD_RETRY_PATH = /^\/api\/packs\/by-id\/[^/]+\/mods\/[^/]+\/retry$/;
const COMMENT_PATH = /^\/api\/packs\/by-id\/[^/]+\/comments$/;
const EDITOR_REPORT_PATH = "/api/editor/reports";
const REPORT_PATH = "/api/reports";

/**
 * Get the client IP from the request.
 * CF Workers set CF-Connecting-IP header automatically.
 */
export function getClientIp(c: Context<HonoEnv>): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
}

const RETRY_AFTER_SECONDS = 60;

function rateLimitExceeded(c: Context<HonoEnv>) {
  c.header("Retry-After", String(RETRY_AFTER_SECONDS));
  return c.json({ error: "Rate limit exceeded" }, 429);
}

/**
 * Keep the broad abuse ceiling separate from preflight, file delivery, and
 * routes protected by a stricter purpose-specific limiter.
 */
export function shouldApplyGeneralApiRateLimit(method: string, pathname: string): boolean {
  const normalizedMethod = method.toUpperCase();
  const isWithin = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

  if (normalizedMethod === "OPTIONS" || !pathname.startsWith("/api/")) {
    return false;
  }
  if (isWithin("/api/auth") || isWithin("/api/files")) {
    return false;
  }
  if (FILE_DELIVERY_PATH.test(pathname) || CODE_MOD_PACKAGE_PATH.test(pathname)) {
    return false;
  }
  if (normalizedMethod !== "POST") {
    return true;
  }
  return !(
    pathname === "/api/packs" ||
    pathname === "/api/code-mods" ||
    pathname === EDITOR_REPORT_PATH ||
    pathname === REPORT_PATH ||
    MOD_RETRY_PATH.test(pathname) ||
    COMMENT_PATH.test(pathname)
  );
}

/** Partition the generous ceiling so one API area cannot exhaust another. */
export function getGeneralApiRateLimitBucket(pathname: string): string {
  return pathname.split("/")[2] || "api";
}

/** Apply the configured general API abuse ceiling by client and API area. */
export function generalApiRateLimit(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    if (
      c.env.ENVIRONMENT === "development" ||
      !shouldApplyGeneralApiRateLimit(c.req.method, pathname)
    ) {
      await next();
      return;
    }

    const key = `${getClientIp(c)}:${getGeneralApiRateLimitBucket(pathname)}`;
    const { success } = await c.env.RATE_LIMIT_API.limit({ key });
    if (!success) {
      return rateLimitExceeded(c);
    }

    await next();
  };
}

/** Rate limit by IP address using the specified rate limiter binding. */
export function rateLimitByIp(
  getBinding: (env: HonoEnv["Bindings"]) => RateLimit
): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    if (c.env.ENVIRONMENT === "development") {
      await next();
      return;
    }
    const limiter = getBinding(c.env);
    const ip = getClientIp(c);
    const { success } = await limiter.limit({ key: ip });

    if (!success) {
      return rateLimitExceeded(c);
    }

    await next();
  };
}

/** Rate limit by authenticated user ID, falling back to IP. */
export function rateLimitByUser(
  getBinding: (env: HonoEnv["Bindings"]) => RateLimit
): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    if (c.env.ENVIRONMENT === "development") {
      await next();
      return;
    }
    const limiter = getBinding(c.env);
    const user = c.get("user");
    const key = user?.id ?? getClientIp(c);
    const { success } = await limiter.limit({ key });

    if (!success) {
      return rateLimitExceeded(c);
    }

    await next();
  };
}
