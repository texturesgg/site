import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { unstable_getMiniflareWorkerOptions, unstable_readConfig } from "wrangler";

// Every test file runs inside workerd with the top-level bindings of
// wrangler.toml and its own empty D1, R2 and queues. Wrangler folds .dev.vars
// (or .env) into the bindings it derives and says so on stdout, so the
// variables are taken from the config alone: a developer's local secrets never
// reach a test.
const config = unstable_readConfig({ config: "./wrangler.toml" });
const { main, workerOptions } = unstable_getMiniflareWorkerOptions(config);

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main,
      miniflare: {
        ...workerOptions,
        bindings: {
          ...config.vars,
          BETTER_AUTH_SECRET: "handler-test-secret-of-32-characters",
          TEST_MIGRATIONS: await readD1Migrations("../db/migrations"),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./src/test/apply-migrations.ts"],
    // Vite hands workerd a dependency one module at a time, which costs each
    // handler file about two seconds for better-auth, drizzle and hono. The
    // list is every bare import the Worker reaches, so no package is loaded
    // both pre-bundled and module by module.
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            "@hono/zod-validator",
            "better-auth",
            "better-auth/adapters/drizzle",
            "better-auth/api",
            "better-auth/plugins",
            "better-auth/plugins/access",
            "better-auth/plugins/admin/access",
            "drizzle-orm",
            "drizzle-orm/d1",
            "drizzle-orm/sqlite-core",
            "fflate",
            "hono",
            "hono/body-limit",
            "hono/client",
            "hono/cors",
            "hono/factory",
            "hono/http-exception",
            "@vgskins/shared > nanoid",
            "@vgskins/logger > pino",
            "zod",
          ],
          rolldownOptions: { external: [/^node:/, /^cloudflare:/] },
        },
      },
    },
    // better-auth throws an APIError inside AsyncLocalStorage.run to refuse a
    // request and catches it to build the response. workerd still reports the
    // rejection as unhandled; the response a test asserts on is unaffected.
    onUnhandledError: (error) => error.name !== "APIError",
  },
});
