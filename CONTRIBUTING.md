# Contributing

`README.md` lists the packages and how to run the site locally. The
conventions are in `docs/`: read `docs/PATTERNS.md` before changing an API
route or a shared contract, `docs/DESIGN_SYSTEM.md` before changing UI,
`docs/DATA_MODEL.md` before changing the schema (every schema change needs a
committed Drizzle migration), and `docs/PREVIEW_ENVIRONMENT.md` before touching
the shared preview.

## Prerequisites

Either of:

- **Nix and direnv.** `flake.nix` pins the whole toolchain; `direnv allow`
  loads it on entering the repository.
- **A manual toolchain:** Node 24, pnpm 12 (the exact version is the
  `packageManager` field in `package.json`), Rust stable with the
  `wasm32-unknown-unknown` target (`rust-toolchain.toml` names the release),
  wasm-pack, and Binaryen (`wasm-opt` on `PATH`).

## Before opening a pull request

```bash
pnpm check && pnpm test
```

`pnpm check` runs Oxlint and the Oxfmt format check; `pnpm test` runs the
TypeScript and Rust tests. Run `pnpm typecheck` as well when TypeScript
changed. CI runs all three, plus a build and a migration smoke test.

Keep a pull request to one reviewable change, use a conventional commit
subject, and say what changed and why in the description.

## License

Contributions are accepted under the repository's license, GPL-3.0-or-later.

Report a security problem privately; see `SECURITY.md`.
