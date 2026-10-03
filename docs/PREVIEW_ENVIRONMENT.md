# Shared preview environment

> Goal: production-shaped testing with isolated writes and minimal routine
> maintenance.

## Principles

- One persistent shared preview, not one complete stack per pull request.
- Preview deployment is on demand: label a pull request or dispatch the GitHub
  workflow manually.
- A dedicated Cloudflare Workflow can explicitly refresh preview from the
  approved public production catalog. It never writes through its production
  binding.
- Existing public R2 objects are reused by URL instead of copied.
- Preview writes go only to preview D1, R2, Queue, Analytics Engine, and auth
  state, and persist across normal deployments.
- The Images binding is an account-level transformation service. Preview image
  bytes are still written only to preview R2, while transformations share the
  account's Images billing and limits.
- Deployment and data refresh are independent. Deploying never deletes preview
  test data.
- No Cloudflare Access layer. Preview uses application auth and contains no
  production sessions, OAuth tokens, verification tokens, reports, real email
  addresses, favorites, or individual download history.

## Topology

```text
preview.textures.gg
  -> vgskins-web-preview
     -> PublicCatalogEntrypoint Service Binding
        -> vgskins-api-preview

Browser API and OAuth requests
  -> api-preview.textures.gg
     -> vgskins-api-preview
     -> vgskins-preview-db
     -> vgskins-preview-assets
     -> vgskins-preview-processing
        -> vgskins-queue-preview
        -> vgskins-preview-processing-dlq

Existing snapshot assets
  -> https://assets.textures.gg

New preview uploads
  -> vgskins-preview-assets

vgskins-preview-sync (manually triggered Cloudflare Workflow)
  -> vgskins-db (source)
  -> vgskins-preview-db (target)
```

The web Worker's server-side Open Graph and sitemap reads use a named RPC
Service Binding that targets `vgskins-api-preview` directly. Browser API,
OAuth, and preview artifact requests continue to use the public preview API
domain.

The preview API reads its writable R2 bucket first. Any validated artifact key
that is absent there falls back to the fixed public production asset host.
Preview never receives a binding or credential that can write to the
production bucket.

`vgskins-queue-preview` has no cron trigger. The hourly sweep that fails lost
processing jobs runs only in production, so a preview pack whose job is lost
stays in `processing`.

## Deployment triggers

The `Preview` GitHub Actions workflow runs in two cases:

1. A same-repository pull request has the `deploy-preview` label. Subsequent
   pushes to that labeled pull request replace the shared preview.
2. A manual workflow dispatch deploys the selected ref.

Deployments use one serialized concurrency group. Fork pull requests cannot
deploy with repository secrets.

## Data refresh

Data refresh is explicit and destructive. It is not scheduled and does not run
as part of preview deployment. Trigger it only when the shared catalog needs a
fresh production-shaped baseline:

```bash
pnpm preview:refresh-data
```

`vgskins-preview-sync` performs a replace-from-snapshot refresh as durable,
retryable steps:

1. confirm the target is preview: `TARGET_DB` has the `_preview_marker` table
   and `SOURCE_DB` does not, or stop without writing anything;
2. acquire a preview-D1 refresh lock;
3. create isolated staging tables in preview D1;
4. page the public catalog directly from production D1;
5. copy only approved, non-deleted packs and their public related records;
6. replace real emails, verification state, roles, and ban data, and prefix
   each copied user's name with `⟦production⟧`;
7. omit reports, auth state, favorites, and individual download history;
8. write parameterized multi-row batches to the staging tables;
9. verify table counts, user collisions, and sanitization invariants;
10. atomically replace the live preview catalog;
11. remove staging tables and release the refresh lock.

No SQL dump, local SQLite database, generated snapshot file, or CI runner is
involved. Each copied table is its own retryable Workflow step. The operation
is idempotent, live preview data remains available while staging is built, and
the refresh lock is renewed throughout the copy.
Public creator names (behind the `⟦production⟧` prefix) and profile fields
remain recognizable so the catalog is production-shaped; authentication and
private relationship data are not copied.

Normal deployments preserve preview users, uploads, comments, votes,
collections, and processing state. Running the explicit refresh preserves
preview auth users while replacing preview-created catalog state, including
preview reports, favorites, and download history. Preview R2 objects are not
copied to production.

## Rate limiting

Preview runs the same rate limiters as production (`RATE_LIMIT_API`,
`RATE_LIMIT_AUTH`, `RATE_LIMIT_UPLOAD`, and `RATE_LIMIT_EDITOR_REPORT`) with
the same limits and with namespaces that are separate from production. Local
development bypasses these limiters.

## Search-engine safety

Preview responses include:

```text
X-Robots-Tag: noindex, nofollow, noarchive
```

Preview also serves a `robots.txt` that disallows all crawling.

## One-time setup

The durable resources and Wrangler environment declarations are committed in
the repository. Complete these account-specific steps:

Provision the named resources referenced by Wrangler before the first deploy:

```bash
pnpm exec wrangler d1 create vgskins-preview-db
pnpm exec wrangler r2 bucket create vgskins-preview-assets
pnpm exec wrangler queues create vgskins-preview-processing
pnpm exec wrangler queues create vgskins-preview-processing-dlq
```

Copy the D1 database ID returned by Wrangler into the preview environments in
`packages/api/wrangler.toml`, `packages/db/wrangler.toml`,
`packages/queue/wrangler.toml`, and `packages/preview-sync/wrangler.toml`.

The `custom_domain = true` routes create their DNS records and certificates
during deployment. The `textures.gg` zone must already be active in the
account, and the preview hostnames must not have conflicting CNAME records.
Analytics Engine creates its dataset on first write. Rate-limit namespace IDs
are binding identifiers rather than separately provisioned resources. The
Images transformation binding is enabled per Worker and has no named preview
resource to create.

1. Create a GitHub `preview` environment.
2. Add environment-scoped `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` secrets, or confirm the repository-level secrets
   are intentionally shared with preview.
3. Add the `VITE_PREVIEW_TURNSTILE_SITE_KEY` environment variable. Use a
   preview-specific Turnstile widget, or allow `preview.textures.gg` on the
   chosen widget.
4. Create the `deploy-preview` repository label.
5. Dispatch the Preview workflow once. This creates the Worker scripts and
   provisions the custom-domain DNS records and certificates.
6. Set Worker secrets for `vgskins-api-preview`, at minimum:
   - `BETTER_AUTH_SECRET`
   - the Discord and Google client IDs and secrets, the providers the login
     dialog offers
   - `TURNSTILE_SECRET`
     Email/password authentication is disabled in preview.
7. Add preview callback URLs to each OAuth application, for example:
   `https://api-preview.textures.gg/api/auth/callback/discord`.
8. Preview intentionally omits the Email Sending bindings and Discord webhook
   secrets. To test outbound email, temporarily add an environment-specific
   binding restricted to verified destination addresses, then remove it.
9. Merge and run the production deployment once so `vgskins-preview-sync`
   exists.
10. Mark the preview database, so a refresh can tell it from production. Run
    this against preview only:

    ```bash
    pnpm exec wrangler d1 execute DB --config packages/db/wrangler.toml \
      --env preview --remote \
      --command "CREATE TABLE _preview_marker (id INTEGER PRIMARY KEY CHECK (id = 1))"
    ```

11. Optionally run `pnpm preview:refresh-data`, wait for the Workflow instance
    to complete, and inspect the resulting catalog.

Generate and store the auth secret without printing it:

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET \
  --config packages/api/wrangler.toml --env preview
```

## Routine operation

Normal maintenance is limited to:

- add `deploy-preview` to a pull request when shared preview testing is useful;
- remove the label when the pull request should stop replacing preview;
- push updates to redeploy without resetting preview data;
- run `pnpm preview:refresh-data` only when a destructive catalog refresh is
  wanted;
- inspect or restart a manually triggered refresh in Cloudflare Workflows.

Schema changes use the same committed D1 migrations as production; the Preview
workflow applies them to preview D1 before it deploys the Workers. New storage
products should receive preview resources only when the application actually
starts using them.

The experimental `cloudflare/ci` project is the preferred long-term seam for
replacing GitHub Actions with Cloudflare Workflows and Sandbox. It is not yet
used here because it currently has no published release and runner logs are not
secret-redacted.

## Deliberate non-goals

- No full R2 clone.
- No Analytics Engine history clone.
- No Queue state copy.
- No production auth/session copy.
- No generalized bidirectional synchronization framework.
- No per-PR database or bucket fleet.
- No Cloudflare Access dependency.
- No automatic or nightly production-data refresh.
