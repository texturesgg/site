# The builder image

The image the build Workflow compiles mods in: GCC (the nixpkgs revision
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
    "version": "0.1.0-rc.8",
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
  still checks its SDK and lists its layout with builder `none`, so the
  registry knows the layout and serves it the packages without a library, but
  the Workflow builds nothing for it.

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
   with who builds them (`image`, or `none` for macOS), and every other one is
   retired (no new builds; its packages stay downloadable);
4. pins the image's digest in `../wrangler.toml` for this Worker's deploy
   (`pnpm deploy:production:mod-build`, or `:preview`).

So adding, updating or retiring a port release is an edit to `layouts.json`.
Once the deploy is live, `../scripts/build-layouts.sh` starts the build Workflow
for each active layout the image builds, which builds every mod's latest
approved release that has no build for it (a package without a library already
serves every layout). Those builds need no new review.

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
