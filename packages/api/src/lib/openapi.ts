/**
 * The OpenAPI document and its reference page.
 *
 * Both exist in development and preview only: production answers 404, so the
 * deployed API keeps no documentation surface. The browser reaches the API
 * through the typed hono/client `AppType`; this pair is how a developer reads
 * the same surface locally, and how an annotation in a route file gets checked
 * before it ships.
 *
 * Routes appear in the document when their handler chain carries
 * `describeRoute({ ... })`. A route without it is simply absent, so the
 * document grows one route at a time and never blocks adding a route.
 */

import { Hono } from "hono";
import type { Env, Schema } from "hono/types";
import { generateSpecs } from "hono-openapi";
import type { HonoEnv } from "../types";

/**
 * Scalar's CDN bundle reads the document from `data-url`, so the page needs no
 * build step and no dependency of its own.
 */
const DOCS_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>textures.gg API</title>
  </head>
  <body>
    <script id="api-reference" data-url="/api/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>
`;

/**
 * Mounts `/api/openapi.json` and `/api/docs` on the API Worker.
 *
 * `api` is the app the document describes, so this is mounted from
 * `src/index.ts` after the route chain, outside it: the two paths stay out of
 * the hono/client `AppType`, like the health check and better-auth's handler.
 */
export function openApiRoutes<E extends Env, S extends Schema, P extends string>(
  api: Hono<E, S, P>
): Hono<HonoEnv> {
  return new Hono<HonoEnv>()
    .get("/openapi.json", async (c) => {
      // Production is excluded here rather than at the deploy: the Worker has
      // one bundle, and the check costs one comparison per request.
      if (c.env.ENVIRONMENT === "production") {
        return c.notFound();
      }

      // Generated per request, which keeps `servers` honest for the
      // environment answering: development, preview, or a local wrangler.
      const document = await generateSpecs(api, {
        documentation: {
          info: {
            title: "textures.gg API",
            version: "0.1.0",
            description:
              "Development and preview only. The deployed API is consumed through the typed hono/client AppType.",
          },
          servers: [{ url: c.env.API_BASE_URL }],
        },
      });

      c.header("Cache-Control", "no-store");
      return c.json(document);
    })
    .get("/docs", (c) => {
      if (c.env.ENVIRONMENT === "production") {
        return c.notFound();
      }

      c.header("Cache-Control", "no-store");
      return c.html(DOCS_PAGE);
    });
}
