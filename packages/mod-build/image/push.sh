#!/usr/bin/env bash
# Build the builder image and push it to the account's private registry:
# the Nix toolchain image plus one game SDK per active layout, as one layer.
#
#   push.sh REPOSITORY [LAYOUT_DIR...]
#
# REPOSITORY is registry.cloudflare.com/<account id>/<name>. Each LAYOUT_DIR is
# a port build's self-contained game SDK (tgg-game-sdk.json and its headers)
# with the layout's symbol list beside it as tgg-layout.json, from
# `tgg-mod layout`. With no layouts, the image is the toolchain alone. Prints
# the pushed image, pinned by digest, for wrangler.toml.
#
# Cloudflare's image preparation for Durable Object containers fails on
# read-only folders, and every Nix store path is read-only. So the image is
# unpacked, made owner-writable and repacked as one layer, in a fixed order
# with fixed owners and times so the same inputs give the same image.
#
# Needs registry credentials in DOCKER_CONFIG, for example from
#   cf containers registries credentials generate registry.cloudflare.com \
#     --expiration-minutes 30 --permissions push pull
set -euo pipefail

if [ $# -lt 1 ]; then
  sed -n '5p' "$0" >&2
  exit 2
fi
repository=$1
shift
here=$(dirname "$(realpath "$0")")

stage=$(mktemp -d)
trap 'chmod -R u+w "$stage"; rm -rf "$stage"' EXIT
mkdir -p "$stage/root/opt/tgg/sdks"

nix build "$here#image" --out-link "$stage/image"
"$stage/image" >"$stage/image.tar"
# A docker-archive: each layer is a tar named in manifest.json, in order.
mkdir "$stage/archive"
tar -xf "$stage/image.tar" -C "$stage/archive"
for layer in $(jq -r '.[0].Layers[]' "$stage/archive/manifest.json"); do
  tar -xf "$stage/archive/$layer" -C "$stage/root"
done
config=$(jq -r '.[0].Config' "$stage/archive/manifest.json")

for sdk in "$@"; do
  abi=$(jq -r .game_abi "$sdk/tgg-game-sdk.json")
  [[ $abi =~ ^[0-9a-f]{16}$ ]] || { echo "no game_abi in $sdk" >&2; exit 1; }
  [ "$(jq -r '.game_abi + " " + .target' "$sdk/tgg-layout.json")" = \
    "$(jq -r '.game_abi + " " + .target' "$sdk/tgg-game-sdk.json")" ] ||
    { echo "$sdk/tgg-layout.json is missing or for another layout" >&2; exit 1; }
  cp -r "$sdk" "$stage/root/opt/tgg/sdks/$abi"
done

chmod -R u+w "$stage/root"
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 \
  -C "$stage/root" -cf "$stage/layer.tar" .

cmd=$(jq -r '.config.Cmd | join(",")' "$stage/archive/$config")
env=$(jq -r '.config.Env[] | "--env=" + .' "$stage/archive/$config")
pushed=$(crane append --oci-empty-base -f "$stage/layer.tar" -t "$repository:latest" 2>/dev/null)
# shellcheck disable=SC2086
crane mutate "$pushed" --set-platform linux/amd64 --cmd "$cmd" \
  --workdir "$(jq -r .config.WorkingDir "$stage/archive/$config")" $env \
  -t "$repository:latest" 2>/dev/null
