import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { unstable_getMiniflareWorkerOptions, unstable_readConfig } from "wrangler";

// Every test file runs inside workerd with the top-level bindings of
// wrangler.toml and its own empty D1 and R2. The Builder's container needs an
// image Cloudflare prepares, so tests run without one; nothing tested starts a
// build.
const config = unstable_readConfig({ config: "./wrangler.toml" });
const { main, workerOptions } = unstable_getMiniflareWorkerOptions({ ...config, containers: [] });

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
