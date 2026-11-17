import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { unstable_getMiniflareWorkerOptions, unstable_readConfig } from "wrangler";

// Every test file runs inside workerd with wrangler.toml's top-level bindings
// (ENVIRONMENT "development", so `?ticket=dev:<name>` signs a test player in).
// A stub stands in for the API Worker behind the API Service Binding: it
// names a queue with the competitive rules "Competitive" and has no name otherwise,
// so the queue falls back to its own name.
const STUB_API = `
import { WorkerEntrypoint } from "cloudflare:workers";
export class MeetEntrypoint extends WorkerEntrypoint {
  verifyTicket() { return null; }
  queueLabel({ names }) {
    if (names.includes("tgg.competitive-rules")) return "Competitive";
    return null;
  }
}
export default { fetch() { return new Response("stub"); } };
`;

const config = unstable_readConfig({ config: "./wrangler.toml" });
const { main, workerOptions } = unstable_getMiniflareWorkerOptions(config);

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main,
      miniflare: {
        ...workerOptions,
        bindings: { ...config.vars },
        workers: [
          {
            name: "vgskins-api-dev",
            modules: true,
            compatibilityDate: "2026-09-01",
            script: STUB_API,
          },
        ],
      },
    })),
  ],
});
