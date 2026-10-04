# Code Patterns & Conventions

This document defines the coding patterns and conventions for the textures.gg monorepo.

## Type Safety

### Prefer hono/client Inferred Types

Use hono/client types for API responses. These are automatically inferred from Hono route handlers when routes are chained.

```typescript
// Good - hono/client infers types from API
const data = await parseResponse(api.games.$get());
// data is fully typed

// Bad - raw fetch with manual types
const res = await fetch(`/api/games/${slug}`);
const data = (await res.json()) as Game; // manual type assertion
```

### Use Zod for Validation

For validation, external API responses, or form data, use Zod schemas.

```typescript
// Good - Zod schema
import { z } from "zod";

const GameSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

type Game = z.infer<typeof GameSchema>;

// Bad - raw interface
interface Game {
  id: string;
  name: string;
  slug: string;
}
```

### Avoid Inline Types

Types should be defined in `@vgskins/shared` or derived from Zod/hono inference. Avoid inline type definitions.

```typescript
// Good - shared types
import type { PackStatus, TargetCategory } from "@vgskins/shared";

// Good - validate user input against a shared enum tuple
import { PACK_STATUSES } from "@vgskins/shared";
import { validateEnum } from "../lib/validation";
const status = validateEnum(query.status, PACK_STATUSES, "approved");

// Bad - inline enum
const status = query.status as "pending" | "approved" | "rejected";
```

## Hono API Patterns

### Route Chaining (Critical for Type Inference)

Routes MUST be chained for hono/client type inference to work. Standalone `app.get()` statements don't update the `AppType`.

```typescript
// Good - chained routes (types are inferred by hono/client)
const app = new Hono<HonoEnv>()
  .get("/", async (c) => {
    return c.json(items);
  })
  .get("/:id", async (c) => {
    return c.json(item);
  })
  .post("/", requireAuth, async (c) => {
    return c.json(created);
  });

export default app;

// Bad - standalone statements (types NOT inferred)
const app = new Hono<HonoEnv>();
app.get("/", async (c) => {
  return c.json(items);
});
app.post("/", requireAuth, async (c) => {
  return c.json(created);
});
export default app;
```

Two routes in `packages/api/src/index.ts` are deliberately left off the chain,
and so off the client type: the `/` health check and `/api/auth/*`, which
better-auth handles and the browser reaches through better-auth's own client.

### Worker-to-Worker Calls

Browser clients use the typed Hono HTTP API. For internal Worker calls, follow
Cloudflare's Service Binding guidance:

- use a narrow named `WorkerEntrypoint` RPC interface for purpose-built internal
  methods;
- keep the Hono default export intact rather than creating a second public API;
- validate RPC arguments at runtime and return narrow serializable values;
- generate the caller `Env` with Wrangler using both Worker configs; the service
  binding should resolve to `Service<import(...).Entrypoint>`;
- declare the binding explicitly in every Wrangler environment because service
  bindings are non-inheritable;
- deploy the compatible target entrypoint before its caller, using a GitHub
  Stack when the rollout requires dependent PRs.

Use a fetch-style Service Binding instead when the caller specifically needs to
preserve HTTP Request/Response semantics. Do not route internal calls through a
public Worker hostname merely to reuse an existing deployment.

References:

- [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [RPC with WorkerEntrypoint](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)

### Worker Binding Types

Each deployed Worker checks in `src/worker-configuration.d.ts`, generated from
its Wrangler configuration. Do not edit these files by hand. Run the package's
`cf-typegen` script after changing bindings, variables, environments, entrypoints,
or local secret-name examples; package typechecks run `cf-typegen --check` before
TypeScript so stale declarations fail CI.

Use each package-specific generated environment interface as the source of
platform binding types. A source file that exports Worker types across package
boundaries must reference its generated declaration explicitly so callers do not
resolve it against their own Worker environment. Handwritten types should contain
only application refinements that Wrangler cannot express, such
as Hono context variables, a `Queue<QueueMessage>` body contract, or bindings
and secrets that one environment omits. Never duplicate D1,
R2, Images, Analytics Engine, Rate Limiting, Workflow, or Service Binding types.

The API type-generation command reads `.dev.vars.example` only for secret names;
real secret values remain in ignored files or Cloudflare. Preview-sync generates
against its production environment because that explicitly triggered Workflow is
only deployed there.

### Error Handling

Return expected errors from the handler with `c.json({ error }, status)`.
hono/client infers every response a handler returns, so the client sees each
error status and its body, and `res.status === 404` narrows the response type.
A thrown error is invisible to those types.

```typescript
// Good - the 404 is part of the route's client type
.get("/:id", async (c) => {
  const pack = await db.query.packs.findFirst({
    where: eq(packs.id, c.req.param("id")),
  });

  if (!pack) {
    return c.json({ error: "Pack not found" }, 404);
  }

  return c.json(pack, 200);
})

// Bad - the client cannot see this error
.get("/:id", async (c) => {
  // ...
  if (!pack) {
    throw new Error("Pack not found");
  }
  return c.json(pack);
})
```

- Every error body is `{ error: string }`, a message safe to show the user.
- Give success responses an explicit status (`c.json(data, 200)`) so the
  client can tell success from error bodies.
- Helpers return a value (`undefined`, `null`, or a result) instead of
  throwing for expected cases; the handler chooses the status.
- Throw only for unexpected failures (a missing binding, a broken invariant).
  `app.onError` logs them and returns a generic 500.
- Middleware (auth, role guards, rate limits), validators, and `app.onError`
  return 400, 401, 403, 429, and 500 with the same `{ error }` body. Hono does
  not infer those, so `AppType` declares them once with `ApplyGlobalResponse`
  from `hono/client`, as Hono's RPC guide recommends. Every route's client type
  then includes them.
- Validate requests with `zValidator(target, schema, validationHook)`, passing
  `validationHook` from `lib/validation.ts`. The hook returns the first issue
  as `{ error }`, so a 400 matches the declared body instead of Zod's issue
  object.

### Authentication Middleware

Use `requireAuth` and `optionalAuth` middleware for protected routes.
`requireAuth` returns 401 when there is no session and types `user` as
non-null for the handler, so no assertion is needed.

```typescript
import { requireAuth, optionalAuth } from "../lib/auth";

// Protected route
.get("/me", requireAuth, async (c) => {
  const user = c.get("user"); // AuthUser
  return c.json(user, 200);
})

// Optional auth (user may or may not be logged in)
.get("/:slug/packs/:packSlug", optionalAuth, async (c) => {
  const user = c.get("user"); // AuthUser | null
  const isOwner = user?.id === pack.userId;
  // ...
})
```

### Analytics Engine Events

Every API producer must use `writeAnalyticsEvent` in
`packages/api/src/lib/analytics.ts`; do not call `ANALYTICS.writeDataPoint`
directly. The helper validates the versioned discriminated union and owns the
ordered Analytics Engine column layout:

| Column    | Version 1 meaning                              |
| --------- | ---------------------------------------------- |
| `blob1`   | pack ID                                        |
| `blob2`   | event type: `pack_view`, `vote`, or `download` |
| `blob3`   | D1 download row ID, or an empty string         |
| `blob4`   | contract version (`1`)                         |
| `double1` | event count (`1`)                              |
| `index1`  | pack ID sampling key                           |

The pack ID schema enforces Analytics Engine's 96-byte index limit. Version 1
deliberately excludes user IDs, client IPs, and referrers; adding user-level
dimensions requires a separate privacy decision. A write is best-effort:
rejected events and synchronous binding-call failures are logged and must not
roll back the product operation that produced the event. Cloudflare completes
delivery in the background, so later platform delivery failures are not exposed
to the Worker. Queries aggregating sampled data must multiply counts by
`_sample_interval`.

Stored rows without `blob4` carry the same `blob1`, `blob2`, `double1`, and
`index1` meanings, so a query must not require a version unless it
intentionally selects only versioned rows. Column positions are fixed: add new
event variants and columns through this contract rather than assigning array
positions at a route call site.

References:

- [Analytics Engine data points](https://developers.cloudflare.com/analytics/analytics-engine/get-started/#2-write-data-points-from-your-worker)
- [Analytics Engine limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/)
- [Sampling with Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/sampling/)

### Asynchronous Queue Correlation

Every `PROCESSING_QUEUE` producer must use the helpers in
`packages/api/src/lib/processing-queue.ts`; do not call the binding directly.
The helpers validate the shared `QueueMessage`, add one UUID correlation ID per
send or batch, and record it on a custom publisher span and structured log. The
Queue consumer validates the message again and records the same ID on its
processing span and completion/error log. Retries retain the message body and
therefore retain the correlation ID.

`correlationId` is optional in the shared schema, so a message without one is
still processable. Producers always set it. Keep Queue contract changes
expand-compatible in the same way: a message already in a Queue during a
deployment must stay processable.

The correlation ID links two native traces; it is not a Cloudflare trace ID and
does not create a cross-Queue parent-child relationship. Cloudflare's
[custom spans API](https://developers.cloudflare.com/workers/observability/traces/custom-spans/#limitations)
does not expose span context or manual parent wiring. Query
`vgskins.queue.correlation_id` to find the publisher and consumer spans without
misrepresenting them as one native trace.

### Rate Limiting

Use the configured Cloudflare Rate Limiting bindings through
`packages/api/src/lib/rate-limit.ts`; do not add in-memory counters or a second
limiter convention.

- `RATE_LIMIT_API` is a generous abuse ceiling, not a product quota. It is
  partitioned by client and top-level API area so normal requests to one area do
  not consume another area's allowance.
- CORS preflights, Better Auth, file/download delivery (code mod packages
  included), and routes already using a stricter limiter (pack upload, code mod
  creation, mod retry, comments, reports, editor reports) are excluded from the
  general counter.
- Better Auth uses `RATE_LIMIT_AUTH` by IP; pack upload, code mod creation, mod
  retry, comments, and reports use `RATE_LIMIT_UPLOAD` by user; editor reports use
  `RATE_LIMIT_EDITOR_REPORT` by IP. These limits must not also consume the general
  counter.
- Pack downloads are never refused. `RATE_LIMIT_DOWNLOAD_COUNT`, keyed by IP and
  pack, gates only whether a served download is counted: once per client and
  pack per minute.
- Development bypasses platform rate limiting. Preview and production use
  separate namespaces.
- Treat the binding as permissive and eventually consistent per Cloudflare
  location. It is abuse protection, not exact accounting or authorization.
- Return the centralized 429 error with `Retry-After`; monitor rejections through
  Workers observability before lowering a limit.

### Request Data Access

```typescript
// Path params
const slug = c.req.param("slug");

// Query params and JSON body declared with zValidator
const query = c.req.valid("query");
const body = c.req.valid("json");

// Multipart form data: parse, then validate and narrow. A pack upload sends
// one modFiles[], modSlotIds[], and modLabels[] entry per mod, in the same order.
const raw = await c.req.parseBody({ all: true });
const parsed = UploadPackForm.safeParse(raw);
if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
const modFiles = toFileArray(raw["modFiles[]"]);
if (modFiles.length === 0) return c.json({ error: "At least one mod file is required" }, 400);
const images = toFileArray(raw.images);

// Environment bindings
const db = createDb(c.env.DB);
const bucket = c.env.BUCKET;
```

## Migrations

Production and preview apply migrations before the Workers deploy, so the
Workers still running during a deploy read the migrated schema.

- A migration that only adds (a table, a nullable or defaulted column, an
  index, a constraint the existing data satisfies) ships with the code that
  uses it.
- A drop or rename ships one deploy later, once no running Worker reads the
  old shape.
- Rebuilding a table in SQLite drops the old one. D1 keeps foreign keys on, so
  a rebuilt table must never reference the table it replaces: the drop would
  cascade into the copy. `0012_comment_replies_and_indexes.sql` shows the
  pattern.

## Frontend Patterns

### API Client (`@/lib/api`)

Use the typed client from `@/lib/api` with Hono's own helpers; there is no
wrapper.

```typescript
import { notFound } from "@tanstack/react-router";
import { parseResponse } from "hono/client";
import { api, apiError, uploadFormData } from "@/lib/api";

// 1. Reads: parseResponse returns the typed success body and throws
//    hono/client's DetailedError for any other status.
const games = await parseResponse(api.games.$get());

// 2. A status the caller handles itself: check the typed response first.
const res = await api.games[":slug"].packs[":packSlug"].$get({ param: { slug, packSlug } });
if (res.status === 404) throw notFound();
const pack = await parseResponse(res);

// 3. A mutation whose error message the user sees: apiError reads the API's
//    `{ error }` and keeps the status, as a DetailedError.
const res = await api.users.me.$put({ json: profile });
if (!res.ok) throw await apiError(res);
return res.json();

// 4. uploadFormData() - uploads that report progress (fetch cannot)
const result = await uploadFormData<{ id: string; slug: string }>("/api/packs", formData, {
  onProgress: (pct) => setProgress(pct),
});
```

`parseResponse`'s `DetailedError` message is the HTTP status text ("404 Not
Found"), so show it only as a generic failure. Use pattern 3 when the API's
message matters. Every chained route is called through `api`; there is no
untyped fetch helper.

Queries retry once, and only after a network error or a 5xx
(`shouldRetryQuery` in `main.tsx`'s defaults): a 4xx will not change on retry.

### Type Inference with TanStack Query

Let types flow from hono/client through TanStack Query.

```typescript
// Good - types flow through naturally
const { data: games = [] } = useQuery({
  queryKey: ["games"],
  queryFn: () => parseResponse(api.games.$get()),
});

// Good - mutations also get automatic typing
const voteMutation = useMutation({
  mutationFn: (packId: string) =>
    parseResponse(api.packs["by-id"][":id"].vote.$post({ param: { id: packId } })),
});
```

### Query Keys

Use consistent query key patterns with TanStack Query.

```typescript
// Good - descriptive, hierarchical keys
useQuery({
  queryKey: ["game", gameSlug],
  queryFn: async () => {
    /* ... */
  },
});

useQuery({
  queryKey: ["game", gameSlug, "packs"],
  queryFn: async () => {
    /* ... */
  },
});

// Good - with filters
useQuery({
  queryKey: ["packs", { game: gameSlug, status: "approved" }],
  queryFn: async () => {
    /* ... */
  },
});
```

### Error Handling in Queries

Let errors bubble up - TanStack Query handles error states.

```typescript
// Good - parseResponse throws on error, TanStack Query catches it
queryFn: () => parseResponse(api.games[":slug"].$get({ param: { slug } }));

// Bad - swallow errors
queryFn: async () => {
  try {
    return await parseResponse(api.games[":slug"].$get({ param: { slug } }));
  } catch {
    return null; // Hides errors from error boundary
  }
};
```

Route loaders follow the same rule. A missing resource throws TanStack Router's
`notFound()` so the router renders the not-found page; any other failure
reaches the router's default error page. Both render inside the root layout.

## Input Validation

### Validation Utilities

Use centralized validation utilities from `lib/validation.ts` for consistent handling of user input.

```typescript
import {
  parsePagination,
  paginationResponse,
  sanitizeSearch,
  validateEnum,
  validateFilePath,
} from "../lib/validation";

// Pagination - bounds are enforced automatically
const pagination = parsePagination(query);
const items = await db.query.packs.findMany({
  limit: pagination.pageSize,
  offset: pagination.offset,
});

// Important: Use separate COUNT query for total, not items.length
const [{ count }] = await db
  .select({ count: sql<number>`COUNT(*)` })
  .from(packs)
  .where(whereClause);

return paginationResponse(items, count, pagination);
```

### Search Sanitization

Always sanitize user search input and use `likeContains` for LIKE queries.
`sanitizeSearch` trims and length-limits the term; `likeContains` escapes LIKE
metacharacters (`\`, `%`, `_`) and emits the required `ESCAPE '\'` clause so
wildcards in user input are neutralized.

```typescript
import { likeContains, sanitizeSearch } from "../lib/validation";

// Good - sanitized search with escaped LIKE
const search = sanitizeSearch(query.search);
if (search) {
  conditions.push(or(likeContains(packs.title, search), likeContains(packs.description, search))!);
}

// Bad - raw input in LIKE query (SQL injection / wildcard injection risk)
const searchPattern = `%${query.search}%`;
conditions.push(like(packs.title, searchPattern));
```

### Enum Validation

Use `validateEnum` for type-safe query parameter validation against shared enum tuples.

```typescript
import { PACK_STATUSES } from "@vgskins/shared";
import { validateEnum } from "../lib/validation";

// Good - type-safe with default, using shared enum tuple
const status = validateEnum(query.status, PACK_STATUSES, "approved");

// Bad - unsafe cast
const status = query.status as PackStatus;
```

### Path Validation

Always validate file paths to prevent path traversal attacks.

```typescript
// Good - validated path
const key = validateFilePath(rawKey);
if (!key) return c.json({ error: "Invalid file path" }, 400);
const file = await env.BUCKET.get(key);

// Bad - raw path (traversal attack possible)
const file = await env.BUCKET.get(rawKey);
```

## Authorization

### Role Guards

Use the `requireModerator` and `requireAdmin` middleware after `requireAuth`.
They return 403 when the role is insufficient.

```typescript
import { requireAuth, requireModerator, requireAdmin, isModerator } from "../lib/auth";

.post("/packs/:id/approve", requireAuth, requireModerator, async (c) => {
  // ... proceed with moderation action
})

.post("/users/:id/ban-purge", requireAuth, requireAdmin, async (c) => {
  // ... proceed with admin action
})

// For conditional logic (not guards), use boolean checks
const canManage = isModerator(user) || user.id === pack.userId;
```

### Pack Visibility

Routes never query `packs` directly for a single pack. They call `loadPack`
from `lib/queries.ts`, which applies the visibility rule in one place: a pack
is readable when it is not deleted and is approved, or the requester owns it,
or the requester moderates. A pack the requester may not see is `undefined`,
the same as a missing one, so the route answers 404 and never confirms that a
hidden pack exists.

```typescript
import { loadPack } from "../lib/queries";

// By id, as the signed-in user (optionalAuth) sees it
const pack = await loadPack(db, { id }, { requester: c.get("user") });
if (!pack) return c.json({ error: "Pack not found" }, 404);

// By slug: the game resolves first, so the (game_id, slug) index is used
const pack = await loadPack(
  db,
  { gameSlug, slug },
  { requester: user, with: { mods: true, images: true } }
);

// Public only (downloads, votes, comments, Open Graph): no requester
const pack = await loadPack(db, { id }, { requester: null });
```

Lists and aggregates filter on `status = 'approved'` and `deleted_at IS NULL`
in their own query.

### Code Mod Visibility

Code mods follow the same rule through `lib/queries.ts`. A code mod is visible
when it is not deleted and has an approved release, or the requester owns it
or moderates; its unapproved releases and builds are only for its owner and
moderators (`canViewUnapprovedReleases`). Routes load a single mod with
`loadCodeMod` and a build (for its log or package) with `loadCodeModBuild`,
lists filter with `visibleCodeMods`, and anything hidden answers 404 as if
missing. `transitionRelease` in `packages/db` is the only writer of a
release's status after the build pipeline inserts it, as `transitionPack` is
for packs, and moderators review releases in `routes/admin.ts`.

### Role Hierarchy

Roles follow this hierarchy: `admin > moderator > user`

- `requireAdmin` - Only admins
- `requireModerator` - Moderators AND admins
- `isModerator(user)` - Returns true for moderators AND admins

### Feature Flags

Flags come from Cloudflare Flagship through the `FLAGS` binding; there is no
flag table or wrapper around it. `lib/feature-flags.ts` asks Flagship with the
user's id and role as context (`codeModsEnabled`), and `GET /api/flags/me`
tells the signed-in viewer which flags are on. A route area behind a flag
mounts its middleware (`requireCodeMods`), which answers 404 so the area reads
as missing to anyone the flag is off for.

## Shared Package

### When to Add to @vgskins/shared

Add to shared only when a contract is genuinely consumed by more than one
package. Shared holds:

- **Enum const tuples with derived types** — `PACK_STATUSES`,
  `PACK_SORT_OPTIONS`, `PACK_PERIODS`, `TARGET_CATEGORIES`, `REPORT_REASONS`,
  `REPORT_TARGET_TYPES`, `REPORT_STATUSES`, `USER_ROLES`. Each follows the
  `export const X = [...] as const; export type X = (typeof X)[number];` pattern.
- **`LIMITS`** — validation constants shared between client and server.
- **Input/upload Zod schemas** — `UploadPackForm`, `CommentInput`,
  `OnboardingInput`, `UpdateProfileInput`.
- **File validators** — `fileError`, `modFileError`, `imagesError` (each returns a message or null),
  and `toFileArray`.
- **File-name helpers** — `isModFileName`, `canonicalDatFileName`,
  `parseCostumeFileName`.
- **Utilities** — `slugify`, `generateId`, `displayName`, `validateUsername`.
- **Queue contract** — `QueueMessage` discriminated union in
  `@vgskins/shared/queue`.
- **Permissions** — role definitions and access-control statements in
  `@vgskins/shared/permissions`.
- **Melee animation reference catalog** — in
  `@vgskins/shared/melee-animation-reference`.

```typescript
// packages/shared/src/types/constants.ts
export const PACK_STATUSES = [
  "processing",
  "pending",
  "approved",
  "rejected",
  "corrupted",
] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];

export const PACK_SORT_OPTIONS = ["hot", "newest", "top", "downloads"] as const;
export type PackSortBy = (typeof PACK_SORT_OPTIONS)[number];
```

### When NOT to Add to Shared

- **Response DTOs** — the API response contract is the inferred hono/client
  `AppType`. Do not hand-write response schemas in shared; let the route
  handler's return type flow to callers.
- API-only types (use hono/client inference)
- Web-only component props
- Package-specific utilities

## Tests

`packages/api` and `packages/queue` run every test inside workerd through
`@cloudflare/vitest-plugin`. Each package's `vitest.config.ts` gives the tests
the top-level bindings of its `wrangler.toml`: real local D1, R2, queues, rate
limits, and the runtime's own `cloudflare:workers` module. No test builds a
binding by hand or mocks the runtime.

- **Storage is per file.** Every test file starts with an empty D1 database,
  bucket, and queue, and keeps what it writes until the file ends. Tests in one
  file share rows, so seed shared parents in `beforeAll` and give each test its
  own ids.
- **The schema is already there.** `src/test/apply-migrations.ts` applies the
  committed migrations in `packages/db/migrations` before each file.
- **Variables come from `wrangler.toml` only.** `.dev.vars` and `.env` files are
  not read into the test bindings. A secret a test needs is bound in
  `vitest.config.ts`, as `BETTER_AUTH_SECRET` is for the API.
- **The plugin version is exact.** It pins the wrangler, miniflare, and workerd
  it runs on, so `@cloudflare/vitest-plugin` and the locked `wrangler` move
  together.

### Writing a handler test

Put the test beside the route as `<rule>.test.ts`. Mount the route under test,
or import the whole app from `src/index.ts` when middleware matters, and call
it with the pool's bindings:

```typescript
import { createExecutionContext, env } from "cloudflare:test";
import { createDb } from "@vgskins/db";
import { Hono } from "hono";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import packsRoutes from "./packs";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/packs", packsRoutes);

it("only the owner reads a rejected pack", async () => {
  const owner = await signIn(db, "owner");
  const response = await app.request(
    "/api/packs/by-id/rejected/comments",
    { headers: { cookie: owner } },
    env,
    createExecutionContext()
  );
  expect(response.status).toBe(200);
});
```

- `signIn(db, id, role?)` in `packages/api/src/test/session.ts` inserts a user
  with a live session and returns its cookie; `sessionCookie(token)` signs a
  cookie for a session the test inserted itself.
- To vary a variable for one request, pass `{ ...env, ENVIRONMENT: "preview" }`.
- Assert on the response and on the rows or objects the handler left behind,
  read through `createDb(env.DB)` and `env.BUCKET`.
- An outbound `fetch` is answered inside the test with
  `vi.spyOn(globalThis, "fetch")`; tests never reach a real host.
- A route that publishes to the processing queue is asserted through the real
  producer: `vi.spyOn(env.PROCESSING_QUEUE, "sendBatch")` (or `"send"`) records
  the messages and still publishes them. See
  `packages/api/src/routes/pack-upload.test.ts`.

The queue Worker's rules are tested the same way against its own bindings, by
calling the function that owns the rule with `createDb(env.DB)`; see
`packages/queue/src/pack-status.test.ts`.

Pure functions keep plain unit tests beside their module (`lib/*.test.ts`).
They run in the same pool and need no bindings.
