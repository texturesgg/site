#!/usr/bin/env bash
# Get the build pipeline ready to deploy to ENV: find or build the builder
# image for image/layouts.json, make code_mod_layouts match the layouts it
# carries, and pin its digest in wrangler.toml for the deploy that follows.
#
#   scripts/prepare-deploy.sh preview|production
set -euo pipefail

env=${1:?usage: prepare-deploy.sh preview|production}
here=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
layouts=$(mktemp)
trap 'rm -f "$layouts"' EXIT

image=$("$here/image/build.sh" "$layouts")
"$here/scripts/sync-layouts.sh" "$env" "$layouts"
sed -i "s#registry.cloudflare.com/[^\"]*/tgg-mod-builder@sha256:[0-9a-f]*#$image#g" "$here/wrangler.toml"
echo "prepare-deploy: $image"
