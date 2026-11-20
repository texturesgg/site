# AGENTS.md

Rules for agents working in this repository. The workspace guide in
`~/dev/AGENTS.md` applies too; this file overrides it where they differ.

Platform-wide facts (the other repositories, the merge and release policy for
every repo, mod platform rules, identity, copy, test machines) are in the
"Platform overview" section of `../core/AGENTS.md`. Read it first.

This repository is `texturesgg/site` (public): textures.gg on Cloudflare, the
code-mod registry and builder, and the meeting point for online play
(`packages/meet`, `meet.textures.gg`). `README.md` lists the packages and
`CONTRIBUTING.md` the checks.

## Merging is deploying

- Changes land through a branch and a PR. You may merge your own PR once the
  required checks (Lint & Typecheck, Tests & Migrations, Rust) are green,
  unless the owner asked to review or hold it.
- A push to `main` deploys production once CI passes
  (`.github/workflows/deploy.yml`): D1 migrations, every Worker, the mod
  builder image and its layouts. textures.gg has real users, so merge with
  that in mind.
- Owner only: production data writes (D1, R2, the admin API's writes such as
  sets, publishers and approvals), Cloudflare secrets and resources, turning
  the `code-mods` Flagship flag (`packages/api/src/lib/feature-flags.ts`) on
  for everyone. Read production through the public API, not
  `wrangler d1 --remote`.
- The shared preview is one environment. Add the `deploy-preview` label only
  when a change needs checking there: UI, renderer or visual changes that need
  real data, or flows local data can't exercise. Verify small fixes locally.
  `docs/PREVIEW_ENVIRONMENT.md` explains it.

## Pull requests

- Every PR goes through `gh stack`, single ones included:
  `gh stack submit --auto --open` (ready, not draft). Stack layers that build
  on an open PR; after a lower layer merges, `gh stack sync` and check
  `git log origin/main`.
- This checkout has two remotes (`origin` and the archived `saavylab`), so
  give gh stack the push remote:
  `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.pushDefault GIT_CONFIG_VALUE_0=origin gh stack submit --auto --open`.
- A PR with a visible change carries screenshots in its description: desktop
  and phone, before and after where it applies. `gh` can't upload images:
  use the browse skill on the PR page (session allowlisted to github.com),
  add the files through the comment box's attachment button, copy the
  `user-attachments` URLs, clear the box without posting, then
  `gh pr edit --body-file`. Never commit screenshots. Say so if an upload is
  impossible.
- Before pushing: `pnpm check && pnpm test`, and `pnpm typecheck` when
  TypeScript changed. Run the root `pnpm test`, not only one package's.

## Code conventions

- Read `docs/PATTERNS.md` and the nearest existing route or page, and mirror
  them. Reuse the helpers: one visibility loader per entity in
  `packages/api/src/lib/queries.ts`, one guarded status writer per entity in
  `packages/db` (like `transitionPack`), moderation in
  `packages/api/src/routes/admin.ts`, `{ error }` bodies with explicit
  statuses, `generateId`, `parsePagination`, `zValidator(target, schema,
  validationHook)`.
- Zod at every boundary: request bodies and queries, responses, WebSocket
  messages, RPC and Durable Object payloads, rows read back. The type is
  inferred from the schema and parsed once at the edge. No `as` casts or
  `typeof` ladders to shape data. Shared shapes go in `packages/shared`.
  Tests don't reach into private fields. Put this rule in every brief for
  site work.
- Handler tests: one per rule that matters, and confirm each fails against
  the old code. Handler tests run in workerd through
  `@cloudflare/vitest-plugin` (`cloudflare:test`); sign in with `signIn`
  from `packages/api/src/test/session.ts`.
- `docs/DATA_MODEL.md` before a schema change; every schema change has a
  committed Drizzle migration.
- Calls to paid outside APIs (the X API for competition checks) keep a hard
  spend cap in code.

## UI

- Build from the primitives and patterns in `packages/web/src/ui/` and follow
  `docs/DESIGN_SYSTEM.md`. Check the result in a browser.
- The site is a catalog for many games, Melee first. Copy stays restrained,
  never "punchy" hero text. The owner dislikes the look of Nexus Mods,
  Thunderstore, itch.io and Letterboxd.
- Sign-in and sign-up stay one email-first dialog with one password field. Fix
  dead ends there (such as better-auth's duplicate sign-up response) with the
  `emailAndPassword.onExistingUserSignUp` hook in `packages/api/src/lib/auth.ts`
  and neutral copy, not by splitting the flow. Creators imported from the old
  site claim their packs by signing in with the same email.
- The competition pages name no person; they say "textures.gg admins".

## Rust and WebAssembly

- `packages/dat-parser-wasm` and `packages/hsd-render-web` wrap the core
  crates from crates.io (0.2.0). A change they need lands in `core` and is
  published first.
- `pnpm build:wasm` rebuilds both browser builds (`pkg-webgpu`, `pkg-webgl`);
  run it before a browser check, or the dev server serves stale wasm.
- `packages/shared/src/melee-animation-reference.json` is a copy of
  melee-dat's catalog, checked by `packages/hsd-render-web/tests/catalog.rs`.
  Re-copy it when the crate's catalog changes.

## Dependencies

- pnpm is the version in `package.json`'s `packageManager` (a 12 beta).
  Editing the root `package.json` and running `pnpm install` re-resolves
  unrelated root dependencies. For one dependency use
  `pnpm update -r <name>`, then read `git diff pnpm-lock.yaml` for packages
  that moved.
- CI's `pnpm install --frozen-lockfile` refuses packages published less than
  about a day ago, and local installs don't catch it. After any lockfile
  change, check new entries with `npm view <pkg> time` and pin an exact older
  version when needed (see the overrides in `pnpm-workspace.yaml`). On a
  lockfile rebase conflict, take main's lockfile and rerun `pnpm install`.
- `@cloudflare/vitest-plugin` is pinned exactly and expects a matching
  wrangler; bump them together.

## Code-mod registry

- The registry is publish, review, build, serve. Linux and Windows builds
  run in Cloudflare containers (`packages/mod-build`); macOS builds run on a
  Blacksmith Mac runner (`.github/workflows/macos-mod-builds.yml`) through the
  external-build queue. Review holds back every build but the pre-approval
  check; approving a release starts the rest. The builder
  gets minimal fixes until its planned rewrite after launch.
- `packages/mod-build/image/README.md` explains the builder image and its
  Cloudflare quirks. Deploy it with wrangler, as `deploy.yml` does.
- Admin routes take a mod's internal id, not its slug.
