import { logger } from "@vgskins/logger";
import { WorkerEntrypoint } from "cloudflare:workers";
import { Hono } from "hono";
import type { ApplyGlobalResponse } from "hono/client";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { authHandler, siteOrigins } from "./lib/auth";
import {
  getPackOpenGraphData,
  getPublicSitemapData,
  getUserOpenGraphData,
} from "./lib/public-catalog";
import { generalApiRateLimit, rateLimitByIp } from "./lib/rate-limit";
import adminRoutes from "./routes/admin";
import editorRoutes from "./routes/editor";
import filesRoutes from "./routes/files";
import flagsRoutes from "./routes/flags";
import gamesRoutes from "./routes/games";
import packsRoutes from "./routes/packs";
import reportsRoutes from "./routes/reports";
import sitemapRoutes from "./routes/sitemap";
import statsRoutes from "./routes/stats";
import tagsRoutes from "./routes/tags";
import usersRoutes from "./routes/users";
import type { Env, HonoEnv } from "./types";

const app = new Hono<HonoEnv>()
  .use(
    "*",
    cors({
      origin: (origin, c) => (siteOrigins(c.env).includes(origin) ? origin : null),
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization", "Cookie"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      exposeHeaders: ["Set-Cookie", "Content-Disposition"],
    })
  )
  .use("*", async (c, next) => {
    await next();
    if (c.env.ENVIRONMENT === "preview") {
      c.res.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
    }
  })
  .use("/api/*", generalApiRateLimit())
  .route("/api/files", filesRoutes)
  .route("/api/flags", flagsRoutes)
  .route("/api/games", gamesRoutes)
  .route("/api/packs", packsRoutes)
  .route("/api/stats", statsRoutes)
  .route("/api/tags", tagsRoutes)
  .route("/api/users", usersRoutes)
  .route("/api/reports", reportsRoutes)
  .route("/api/sitemap", sitemapRoutes)
  .route("/api/admin", adminRoutes)
  .route("/api/editor", editorRoutes);

// Health check
app.get("/", (c) =>
  c.json(
    {
      status: "ok",
      service: "vgskins-api",
    },
    200
  )
);

// Mount Better Auth with its separate 100 req/min per-IP ceiling.
app.use(
  "/api/auth/*",
  rateLimitByIp((env) => env.RATE_LIMIT_AUTH)
);
app.all("/api/auth/*", authHandler);

// Handlers return their expected errors. Anything thrown is unexpected, except
// Hono's own HTTPException (for example a malformed JSON body).
app.onError((err, c) => {
  const url = new URL(c.req.url);

  if (err instanceof HTTPException && err.status < 500) {
    return c.json({ error: err.message || "Bad request" }, err.status);
  }

  logger.error(
    {
      method: c.req.method,
      path: url.pathname,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      name: err instanceof Error ? err.name : undefined,
    },
    "Request failed"
  );

  const message = err instanceof Error ? err.message : String(err);
  const isProductionLike = c.env.ENVIRONMENT !== "development";
  return c.json(
    {
      error: isProductionLike ? "Something went wrong. Please try again." : message,
    },
    500
  );
});

type ErrorBody = { json: { error: string } };

/**
 * The client type. Hono does not infer responses from middleware or onError, so
 * the errors every route can return are declared here (Hono RPC guide:
 * ApplyGlobalResponse). Route-specific errors are inferred from the handlers.
 */
export type AppType = ApplyGlobalResponse<
  typeof app,
  { 400: ErrorBody; 401: ErrorBody; 403: ErrorBody; 429: ErrorBody; 500: ErrorBody }
>;
export type { PackOpenGraphData, PublicSitemapData, UserOpenGraphData } from "./lib/public-catalog";

/** Internal, read-only catalog methods exposed only through a Service Binding. */
export class PublicCatalogEntrypoint extends WorkerEntrypoint<Env> {
  getPackOpenGraph(gameSlug: string, packSlug: string) {
    return getPackOpenGraphData(this.env, gameSlug, packSlug);
  }

  getUserOpenGraph(identifier: string) {
    return getUserOpenGraphData(this.env, identifier);
  }

  getSitemap() {
    return getPublicSitemapData(this.env);
  }
}

export default app;
