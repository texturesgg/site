#!/usr/bin/env bash
# Start the build Workflow in ENV once per active layout, after a deploy has
# put the builder image carrying those layouts live. Each run builds every
# mod's latest approved release that has no build for its layout yet, so a run
# for a layout with nothing missing does nothing.
#
#   scripts/build-layouts.sh preview|production
set -euo pipefail

env=${1:?usage: build-layouts.sh preview|production}
here=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
workflow=tgg-mod-build
[ "$env" = preview ] && workflow=tgg-mod-build-preview

# The db package's wrangler.toml is production at its top level, with preview
# as its one environment.
env_args=()
[ "$env" = preview ] && env_args=(--env preview)
layouts=$(cd "$here/../db" && pnpm exec wrangler d1 execute DB "${env_args[@]}" --remote --json \
  --command "SELECT id FROM code_mod_layouts WHERE active = 1" | jq -r '.[0].results[].id')

cd "$here"
for layout in $layouts; do
  pnpm exec wrangler workflows trigger "$workflow" \
    "$(jq -cn --arg layout "$layout" '{type: "layout", layout: $layout}')"
done
