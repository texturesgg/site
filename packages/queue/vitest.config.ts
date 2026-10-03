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
          TEST_MIGRATIONS: await readD1Migrations("../db/migrations"),
        },
      },
    })),
  ],
  test: { setupFiles: ["./src/test/apply-migrations.ts"] },
});
