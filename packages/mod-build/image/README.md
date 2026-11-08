# The builder image

The image the build Workflow compiles mods in. A pushed tag builds once
before review, on the newest tgg-melee release's Linux layout (an author gets
10 of these a day unless trusted); approving the release builds it for the
image's other layouts; see `docs/DATA_MODEL.md` (Code Mods) for when each
build runs. The image holds GCC (the nixpkgs revision
tgg-melee releases are built with), MinGW-w64 GCC for Windows layouts,
binutils, CMake, Ninja, bash, coreutils and `tgg`, assembled with Nix
(`flake.nix`), plus one folder per layout it builds at
`/opt/tgg/sdks/<layout id>/` holding that tgg-melee release's game SDK. `tgg mod
build` builds each mod with the SDK's own CMake files and checks its hooks against
the SDK's `symbols.txt`. The SDKs hold decomp headers and the game's source, so
the image lives only in the account's private registry.

`layouts.json` lists the active tgg-melee releases, each as a version and, for
each target it was released for, the SHA-256 of that target's SDK archive
(`files.sdk.sha256` in the release's `release-<target>.json`):

```json
[
  {
    "version": "0.1.0-rc.9",
    "sdks": {
      "x86_64-linux-gnu": "5a2d…",
      "x86_64-windows-gnu": "55e1…",
      "aarch64-apple-darwin": "848d…"
    }
  }
]
```

Each target's SDK is its own layout. A patch release keeps its minor's layout
ids, so the list names one release per layout.

## Targets

- **Linux** (`x86_64-linux-gnu`) builds with the image's GCC, its own system.
- **Windows** (`x86_64-windows-gnu`) cross-compiles with MinGW-w64 GCC, the
  compiler tgg-melee's Windows build uses (its flake's `windows` shell). The
  Builder runs `tgg mod build --cc x86_64-w64-mingw32-gcc` with
  `CMAKE_TOOLCHAIN_FILE` set to `toolchains/x86_64-windows-gnu.cmake`, which
  the image carries at `/opt/tgg/toolchains/`. It names the target and links
  without a timestamp, so a mod's `mod.dll` is the same on every build; the
  struct-layout options (`-mno-ms-bitfields`) come from the Windows SDK.
- **macOS** (`aarch64-apple-darwin`) isn't built here: its mods link with
  Apple's linker against Apple's SDK and assemble through the SDK's
  `tools/macos-as.sh`, which the Linux image doesn't have. `fetch-sdks.sh`
  still checks its SDK and lists its layout with builder `external`: a Mac
  builds it once a release is approved (see [macOS](#macos) below), and until
  then the registry serves the layout the packages without a library.

## Deploys

Each deploy runs `../scripts/prepare-deploy.sh` once the site's other Workers
are out, so a slow or failed image only holds back this pipeline. It:

1. finds the image for the current inputs in the registry
   (`tgg-mod-builder:inputs-<hash of layouts.json, the flake, its lock, the
toolchain files and build.sh's format number>`), or builds it with
   `build.sh`: each SDK downloaded and checked by `fetch-sdks.sh`, those the
   image builds unpacked under their layout ids, all repacked with the
   toolchain as one owner-writable layer (Cloudflare's image preparation fails
   on Nix's read-only store) and pushed;
2. waits until Cloudflare has prepared the image to run (a new image has taken
   close to an hour; the wait gives up after 90 minutes);
3. makes `code_mod_layouts` match `layouts.json`: those layouts are active,
   with who builds them (`image`, or `external` for macOS), and every other one is
   retired (no new builds; its packages stay downloadable);
4. pins the image's digest in `../wrangler.toml` for this Worker's deploy
   (`pnpm deploy:production:mod-build`, or `:preview`).

So adding, updating or retiring a port release is an edit to `layouts.json`.
Once the deploy is live, `../scripts/build-layouts.sh` starts the build Workflow
for each active layout the image builds, which builds every approved release
worth building (each mod's newest, and the newest inside a set's range when
the newest is outside it) that has no build for it (a package without a
library already serves every layout). Those builds need no new review. Once a
new port release is active, pushes are checked on its Linux layout.

SDK archives come from `https://dl.textures.gg/tgg-melee/<version>/`, so a
release has to be mirrored there before `layouts.json` names it.
`TGG_MELEE_DOWNLOADS` points `fetch-sdks.sh` somewhere else, such as a local
mirror; it runs on its own without the registry:

```bash
TGG_MELEE_DOWNLOADS=http://127.0.0.1:8000/tgg-melee ./fetch-sdks.sh /tmp/root /tmp/layouts.json
```

`tgg` is a release's static Linux build, fetched by version and SHA-256, so
the registry packs with the same binary a mod maker's `tgg mod build` runs. To
move to a new release, change `version` and `hash` in `flake.nix` (the hash is
in the release's `SHA256SUMS`, as `nix hash convert --to sri <hex>`).

To try a build as the container runs it, without the registry:

```bash
nix build .#toolchain .#toolchains --out-link /tmp/tgg-image
env -i PATH=/tmp/tgg-image/bin TMPDIR=/tmp \
  CMAKE_TOOLCHAIN_FILE=/tmp/tgg-image-1/opt/tgg/toolchains/x86_64-windows-gnu.cmake \
  tgg mod build <mod> --sdk <windows sdk> --cc x86_64-w64-mingw32-gcc -o /tmp/mod.zip --json
```

## macOS

macOS layouts (builder `external`) build on a Mac, outside Cloudflare, with
`../scripts/external-build.sh`. GitHub Actions runs it on an Apple silicon
runner (`.github/workflows/macos-mod-builds.yml`, at :17 and :47 past each hour
and on demand); any Mac with Homebrew's `gcc@15`, `cmake` and `ninja`, Xcode's
command line tools, `jq` and `curl` runs it the same way, so the job can move to
another CI service unchanged. Each run:

1. asks the API which approved releases worth building (each mod's newest,
   and a set's pin) lack a build for each external layout
   (`GET /api/external-builds/pending?target=aarch64-apple-darwin`), and stops
   there when none do, before installing anything;
2. fetches the `tgg` release the image packs with (pinned by version and
   SHA-256 in the script; keep it in step with `flake.nix`) and each layout's
   SDK (pinned by `layouts.json`), and checks the SDK is that layout;
3. builds the SDK's template mod, so a broken toolchain stops the run instead
   of failing a mod's build;
4. for each release (at most `MAX_BUILDS`, 10 by default): fetches its source
   (`GET /api/external-builds/releases/<id>/source`, the same files the image's
   builds get), runs `tgg mod build --source-zip <it> --sdk <SDK> --json`,
   and uploads the package with tgg's report and log, or the log of a
   mod that doesn't compile (`PUT /api/external-builds/releases/<id>/builds/<layout>`).

The API checks an upload before recording it: the release is approved and the
layout active and external; the package's `manifest.json` is the report's and
names the release's mod and version and the layout's API, id and target; its
library is in the zip; and the Worker hashes the package itself. A recorded
success is never replaced (the same package again is a no-op), so a run that
dies halfway is simply run again. A failure is not offered again unless the
run asks (`RETRY_FAILED=1`, the workflow's "retry failed" input). Builds can't
see the token: tgg runs without it in its environment, and the checkout keeps
no credentials.

Only approved releases are offered, so the Mac compiles reviewed source; a
newly approved release builds on the next run (within half an hour), or right
away from the workflow's "Run workflow" button.

### Setting it up

1. Make a token: `openssl rand -hex 32`.
2. Give it to the API Worker, per environment:
   `pnpm --filter @vgskins/api exec wrangler secret put MOD_BUILDER_TOKEN --env production`
   (and `--env preview` with its own token to build for preview). Without it the
   `/api/external-builds` routes answer 404.
3. In the site repository's settings, make the environment `mod-builds`
   (Settings, Environments), limit it to the `main` branch, and add the token as
   its secret `MOD_BUILDER_TOKEN`. To build for preview instead, set its
   variable `TGG_API` to `https://api-preview.textures.gg` and use preview's
   token.
4. Mark the macOS layout external. The next deploy of this pipeline does it
   (`scripts/sync-layouts.sh`); to do it at once:
   `pnpm --filter @vgskins/db exec wrangler d1 execute DB --remote --command "UPDATE code_mod_layouts SET builder = 'external' WHERE target = 'aarch64-apple-darwin'"`
   (`--env preview` for preview).
5. Run the workflow once by hand (Actions, macOS mod builds, Run workflow) and
   check the catalog for the macOS layout lists the mods with libraries.

To try the script on a Mac without the workflow:

```bash
TGG_BUILDER_TOKEN=<token> TGG_API=https://api-preview.textures.gg \
  packages/mod-build/scripts/external-build.sh build aarch64-apple-darwin
```
