# textures.gg

A place to share and find texture mods for Super Smash Bros. Melee, with a 3D
preview of every skin. The site runs on Cloudflare.

The model parser, the renderer and the desktop app are in
[texturesgg/texturesgg](https://github.com/texturesgg/texturesgg). This
repository uses those crates, compiled to WebAssembly, to validate uploads and
draw the previews.

## Packages

```text
packages/
  web/              React site (TanStack Router and Query, StyleX), served by a Worker
  api/              Hono API Worker and better-auth
  db/               Drizzle schema and D1 migrations
  queue/            Queue consumer: DAT validation, thumbnails, image optimization
  shared/           Zod schemas, queue contracts and constants used across packages
  logger/           Structured logging for the Workers
  preview-sync/     Refreshes the preview environment's public catalog
  dat-parser-wasm/  WebAssembly adapter for the queue's DAT validation
  hsd-render-web/   WebAssembly adapter drawing the 3D preview on a canvas
```

`docs/` holds the conventions:

- `docs/PATTERNS.md`, `docs/DATA_MODEL.md`, `docs/DESIGN_SYSTEM.md`: the API
  conventions, schema and design system.
- `docs/ALGORITHMS.md`: ranking.
- `docs/PREVIEW_ENVIRONMENT.md`: the shared preview deployment.

## Development

The toolchain (Node, pnpm, Rust, wasm-pack, Binaryen) is pinned by `flake.nix`
and loaded by direnv on entering the repository. `CONTRIBUTING.md` lists the
same tools for a setup without Nix.

```bash
pnpm install
pnpm db:migrate:local
pnpm db:seed:local       # the Melee game, targets and slots
pnpm dev                 # builds the WebAssembly packages; API on :8787, site on :5174

pnpm test                # TypeScript and Rust tests
pnpm check               # Oxlint and Oxfmt
pnpm typecheck
pnpm build
```

`vgskins` is the internal codename: the package scope (`@vgskins/*`) and the
Cloudflare resources (Workers, the D1 database, the R2 bucket, the queues) carry
it.

## Running locally

`pnpm db:migrate:local && pnpm db:seed:local && pnpm dev` runs the whole site
against local D1, R2, and Queues, with no secrets and no Cloudflare account.

- `pnpm dev` compiles the two WebAssembly packages first, so it needs Rust and
  wasm-pack.
- Email and password sign-up works as is: the verification email is written to
  a local file whose path `pnpm dev` prints. Signing in with Discord or Google
  needs that provider's client id and secret in `packages/api/.dev.vars`; copy
  `packages/api/.dev.vars.example`. `TURNSTILE_SECRET` and the
  `DISCORD_WEBHOOK_*` variables are optional: without them uploads skip bot
  verification and no notification is posted.
- The 3D preview draws a skin in its bind pose. The idle animation comes from
  Melee reference files that are not distributed with this repository, so it
  cannot play locally.

## License

GPL-3.0-or-later. See `LICENSE`; `NOTICE` lists the third-party material.

Copyright (C) 2026 SaavyLab LLC
