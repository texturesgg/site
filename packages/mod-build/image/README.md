# The builder image

The image the build Workflow compiles mods in: GCC (the nixpkgs revision
tgg-mod-runtime builds ports with), coreutils and `tgg` (tgg-cli), built with Nix
(`flake.nix`), plus one folder per active game layout at
`/opt/tgg/sdks/<layout id>/` holding that port build's game SDK and symbol list.
The SDKs hold decomp headers, so the image lives only in the account's private
registry.

`layouts.json` lists the active layouts, each as a port and the
tgg-mod-runtime revision to build it from (the runtime's flake pins the port's
own revision). Each deploy runs `../scripts/prepare-deploy.sh`, which:

1. finds the image for the current inputs in the registry
   (`tgg-mod-builder:inputs-<hash of layouts.json, the flake, the tgg-cli
lock and build.sh's format number>`), or builds it with `build.sh`: each
   port built with the mod loader, its game SDK copied out, its symbol list
   added with `tgg mod layout`, all repacked as one owner-writable layer
   (Cloudflare's image preparation fails on Nix's read-only store) and pushed;
2. waits until Cloudflare has prepared the image to run (a new image can take
   ten minutes or more);
3. makes `code_mod_layouts` match the layouts the image carries: those are
   active, every other one is retired (no new builds; its packages stay
   downloadable);
4. pins the image's digest in `../wrangler.toml` for the deploy.

So adding, updating or retiring a layout is an edit to `layouts.json`. A
release built before a layout was added has no build for it until its author
tags a new version.
