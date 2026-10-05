#!/usr/bin/env bash
# The game SDKs of the tgg-melee releases in layouts.json, unpacked into ROOT
# at opt/tgg/sdks/<layout id>/, and the layouts they make written to
# LAYOUTS_OUT as JSON. build.sh runs this for the image; it runs alone too.
#
#   fetch-sdks.sh ROOT LAYOUTS_OUT
#
# Each layouts.json entry is a release version and the SHA-256 of its SDK
# archive (release.json's files.sdk.sha256). Archives come from
# $TGG_MELEE_DOWNLOADS/<version>/, https://dl.textures.gg/tgg-melee by default.
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

layouts="[]"
count=$(jq length "$here/layouts.json")
for ((i = 0; i < count; i++)); do
  version=$(jq -r ".[$i].version" "$here/layouts.json")
  want=$(jq -r ".[$i].sdk_sha256" "$here/layouts.json")
  name="tgg-melee-sdk-$version-x86_64-linux"
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
  if [ "$(jq -er .version "$sdk/tgg-game-sdk.json")" != "$version" ]; then
    echo "fetch-sdks.sh: $name.tar.gz holds the SDK of another version" >&2
    exit 1
  fi
  # A patch release keeps its minor's layout id, so list one per id.
  if [ -e "$root/opt/tgg/sdks/$abi" ]; then
    echo "fetch-sdks.sh: two releases in layouts.json have layout $abi; keep one" >&2
    exit 1
  fi
  mv "$sdk" "$root/opt/tgg/sdks/$abi"
  layouts=$(jq -c --slurpfile sdk "$root/opt/tgg/sdks/$abi/tgg-game-sdk.json" \
    '. + [{id: $sdk[0].game_abi, api: $sdk[0].api, port: $sdk[0].name,
           target: $sdk[0].target, portVersion: $sdk[0].version}]' <<<"$layouts")
  echo "fetch-sdks.sh: tgg-melee $version is layout $abi" >&2
done

printf '%s\n' "$layouts" >"$out"
