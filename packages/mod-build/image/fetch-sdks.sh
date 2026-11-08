#!/usr/bin/env bash
# The game SDKs of the tgg-melee releases in layouts.json, unpacked into ROOT
# at opt/tgg/sdks/<layout id>/, and the layouts they make written to
# LAYOUTS_OUT as JSON. build.sh runs this for the image; it runs alone too.
#
#   fetch-sdks.sh ROOT LAYOUTS_OUT
#
# Each layouts.json entry is a release version and, for each target triple it
# was released for, the SHA-256 of that target's SDK archive (files.sdk.sha256
# in the release's release-<target>.json). Archives come from
# $TGG_MELEE_DOWNLOADS/<version>/, https://dl.textures.gg/tgg-melee by default.
#
# The image builds mods for Linux and, with MinGW, Windows. A macOS mod needs
# Apple's linker and SDK, so a macOS SDK is checked and its layout listed
# (builder "external": a Mac builds it, scripts/external-build.sh) but not put in
# the image.
#
# Needs curl, jq, sha256sum and tar. A change to what this puts in the image
# bumps build.sh's format.
set -euo pipefail

root=${1:?usage: fetch-sdks.sh ROOT LAYOUTS_OUT}
out=${2:?usage: fetch-sdks.sh ROOT LAYOUTS_OUT}
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
downloads=${TGG_MELEE_DOWNLOADS:-https://dl.textures.gg/tgg-melee}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$root/opt/tgg/sdks"

# The name a release gives a target's archives, and who builds its mods.
archive_suffix() {
  case $1 in
  x86_64-linux-gnu) echo x86_64-linux ;;
  x86_64-windows-gnu) echo x86_64-windows ;;
  aarch64-apple-darwin) echo aarch64-macos ;;
  *) return 1 ;;
  esac
}
builder() {
  case $1 in
  x86_64-linux-gnu | x86_64-windows-gnu) echo image ;;
  *) echo external ;;
  esac
}

layouts="[]"
seen=" "
while IFS=$'\t' read -r version target want; do
  suffix=$(archive_suffix "$target") || {
    echo "fetch-sdks.sh: no archive name for target $target" >&2
    exit 1
  }
  name="tgg-melee-sdk-$version-$suffix"
  archive="$work/$name.tar.gz"
  curl -fsSL "$downloads/$version/$name.tar.gz" -o "$archive"
  got=$(sha256sum "$archive" | cut -d' ' -f1)
  if [ "$got" != "$want" ]; then
    echo "fetch-sdks.sh: $name.tar.gz hashes to $got, not $want" >&2
    exit 1
  fi
  tar -xzf "$archive" -C "$work"
  sdk="$work/$name"
  abi=$(jq -er .game_abi "$sdk/tgg-game-sdk.json")
  if [ "$(jq -er .version "$sdk/tgg-game-sdk.json")" != "$version" ] ||
    [ "$(jq -er .target "$sdk/tgg-game-sdk.json")" != "$target" ]; then
    echo "fetch-sdks.sh: $name.tar.gz holds the SDK of another version or target" >&2
    exit 1
  fi
  # A patch release keeps its minor's layout ids, so list one release per id.
  if [[ $seen == *" $abi "* ]]; then
    echo "fetch-sdks.sh: two SDKs in layouts.json have layout $abi; keep one" >&2
    exit 1
  fi
  seen+="$abi "
  who=$(builder "$target")
  layouts=$(jq -c --slurpfile sdk "$sdk/tgg-game-sdk.json" --arg builder "$who" \
    '. + [{id: $sdk[0].game_abi, api: $sdk[0].api, port: $sdk[0].name,
           target: $sdk[0].target, portVersion: $sdk[0].version, builder: $builder}]' \
    <<<"$layouts")
  if [ "$who" = image ]; then
    mv "$sdk" "$root/opt/tgg/sdks/$abi"
  fi
  echo "fetch-sdks.sh: tgg-melee $version for $target is layout $abi (builder: $who)" >&2
done < <(jq -r '.[] | .version as $v | .sdks | to_entries[] | [$v, .key, .value] | @tsv' \
  "$here/layouts.json")

printf '%s\n' "$layouts" >"$out"
