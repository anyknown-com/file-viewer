#!/usr/bin/env bash
# Regenerates src/image-editor/adjust/__fixtures__/*.json from Compositor's C kernels.
# Usage: scripts/gen-adjust-fixtures.sh <Compositor clone at 11d8d7a>
set -euo pipefail

clone="$1"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
out="$root/src/image-editor/adjust/__fixtures__"
rendering="$clone/Compositor/Rendering"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/adjust-fixtures.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$out"
cc -O2 -I"$rendering" "$here/adjust-fixtures/levels.c" "$rendering/LevelsPixels.c" -lm -o "$tmp/levels"
"$tmp/levels" > "$out/levels.json"
cc -O2 -I"$rendering" "$here/adjust-fixtures/color.c" "$rendering/AdjustPixels.c" "$rendering/LensPixels.c" -lm -o "$tmp/color"
"$tmp/color" > "$out/color.json"
# Same layout as the committed files, so `pnpm check` (oxfmt --check) stays green.
(cd "$root" && pnpm exec oxfmt "$out"/*.json)
