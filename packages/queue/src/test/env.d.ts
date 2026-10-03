declare namespace Cloudflare {
  // Bound only by vitest.config.ts.
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
