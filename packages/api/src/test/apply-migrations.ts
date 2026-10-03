import { env } from "cloudflare:workers";

// Runs before each test file, whose D1 database starts empty. Importing
// "cloudflare:test" here would load the whole Worker for every file, including
// the unit tests that never touch a binding.
await env.DB.batch(
  env.TEST_MIGRATIONS.flatMap((migration) =>
    migration.queries.map((query) => env.DB.prepare(query))
  )
);
