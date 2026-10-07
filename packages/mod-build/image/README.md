# The builder image

The image the build Workflow compiles mods in: GCC (the nixpkgs revision
tgg-melee releases are built with), binutils, CMake, Ninja, bash, coreutils and
`tgg`, assembled with Nix (`flake.nix`), plus one folder per active game layout at
`/opt/tgg/sdks/<layout id>/` holding that tgg-melee release's game SDK. `tgg mod
build` builds each mod with the SDK's own CMake files and checks its hooks against
the SDK's `symbols.txt`. The SDKs hold decomp headers and the game's source, so
the image lives only in the
account's private registry.

`layouts.json` lists the active layouts, each as a tgg-melee release version
and the SHA-256 of its SDK archive (`files.sdk.sha256` in the release's
`release.json`):

```json
[{ "version": "0.1.0", "sdk_sha256": "032d0c…" }]
```

A patch release keeps its minor's layout id, so the list names one release per
layout. Each deploy runs `../scripts/prepare-deploy.sh` once the site's other
Workers are out, so a slow or failed image only holds back this pipeline. It:

1. finds the image for the current inputs in the registry
   (`tgg-mod-builder:inputs-<hash of layouts.json, the flake, its lock and
build.sh's format number>`), or builds it with `build.sh`: each release's
   SDK downloaded and checked by `fetch-sdks.sh`, unpacked under its layout
   id, all repacked with the toolchain as one owner-writable layer
   (Cloudflare's image preparation fails on Nix's read-only store) and pushed;
2. waits until Cloudflare has prepared the image to run (a new image has taken
   close to an hour; the wait gives up after 90 minutes);
3. makes `code_mod_layouts` match the layouts the image carries: those are
   active, every other one is retired (no new builds; its packages stay
   downloadable);
4. pins the image's digest in `../wrangler.toml` for this Worker's deploy
   (`pnpm deploy:production:mod-build`, or `:preview`).

So adding, updating or retiring a layout is an edit to `layouts.json`. Once
the deploy is live, `../scripts/build-layouts.sh` starts the build Workflow
for each active layout, which builds every mod's latest approved release that
has no build for it (a package without a library already serves every
layout). Those builds need no new review.

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
