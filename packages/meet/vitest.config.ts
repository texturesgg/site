import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { unstable_getMiniflareWorkerOptions, unstable_readConfig } from "wrangler";

// Every test file runs inside workerd with wrangler.toml's top-level bindings
// (ENVIRONMENT "development", so `?ticket=dev:<name>` signs a test player in).
// A stub stands in for the API Worker behind the API Service Binding: a
// queue with the competitive rules is the standing "Competitive" queue, and
// any other has no name, so it falls back to its own. "Doubles" is a
// standing queue nobody searches in.
const STUB_API = `
import { WorkerEntrypoint } from "cloudflare:workers";
const COMPETITIVE = [{ id: "tgg.competitive-rules", version: "1.0.0" }];
export class MeetEntrypoint extends WorkerEntrypoint {
  verifyTicket() { return null; }
  queueInfo({ names }) {
    if (names.includes("tgg.competitive-rules")) return { label: "Competitive", set: "competitive", mods: COMPETITIVE };
    return null;
  }
  standingQueues() {
    return [
      { set: "competitive", label: "Competitive", mods: COMPETITIVE },
      { set: "doubles", label: "Doubles", mods: [{ id: "tgg.doubles", version: "1.0.0" }] },
    ];
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
