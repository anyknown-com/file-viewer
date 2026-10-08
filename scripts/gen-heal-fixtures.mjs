// Regenerates src/image-editor/tools/heal/__fixtures__/* from Compositor's C kernels
// (Compositor/Rendering/HealPixels.c and ContentFill.c @11d8d7a). Run by hand when the fixtures change, not in CI:
//   COMPOSITOR=$SCRATCH/compositor node scripts/gen-heal-fixtures.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const clone = process.env.COMPOSITOR;
if (!clone) throw new Error("Set COMPOSITOR to a Compositor clone at 11d8d7a.");
const rendering = join(clone, "Compositor/Rendering");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src/image-editor/tools/heal/__fixtures__");

/** Horizontal gradient plus noise from a fixed LCG (seed 1), opaque. */
function input(size) {
  let seed = 1;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const base = Math.round((x / (size - 1)) * 180) + 40;
      for (let c = 0; c < 3; c++) data[i + c] = base - 16 + (next() % 33) - c * 8;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** 255 inside the circle of `radius` around the center, 0 elsewhere. */
function mask(size, radius) {
  const data = new Uint8Array(size * size);
  const c = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if ((x - c) ** 2 + (y - c) ** 2 <= radius ** 2) data[y * size + x] = 255;
  return data;
}

// spot_heal(rgba, coverage, width, height, stride, opacity 1, mode, seed 1), in place.
const harness = `#include <stdio.h>
#include <stdlib.h>
#include "HealPixels.h"
int main(int argc, char **argv) {
  size_t w = (size_t)atol(argv[1]), n = w * w;
  uint8_t *rgba = malloc(n * 4), *cov = malloc(n);
  FILE *f = fopen(argv[3], "rb"); fread(rgba, 1, n * 4, f); fclose(f);
  f = fopen(argv[4], "rb"); fread(cov, 1, n, f); fclose(f);
  if (spot_heal(rgba, cov, w, w, w * 4, 1.0f, atoi(argv[2]), 1u)) return 1;
  f = fopen(argv[5], "wb"); fwrite(rgba, 1, n * 4, f); fclose(f);
  return 0;
}
`;

// content_fill(rgba, stride, mask, maskStride, width, height), in place.
const fillHarness = `#include <stdio.h>
#include <stdlib.h>
#include "ContentFill.h"
int main(int argc, char **argv) {
  size_t w = (size_t)atol(argv[1]), n = w * w;
  uint8_t *rgba = malloc(n * 4), *hole = malloc(n);
  FILE *f = fopen(argv[2], "rb"); fread(rgba, 1, n * 4, f); fclose(f);
  f = fopen(argv[3], "rb"); fread(hole, 1, n, f); fclose(f);
  if (content_fill(rgba, w * 4, hole, w, (int)w, (int)w) != 1) return 1;
  f = fopen(argv[4], "wb"); fwrite(rgba, 1, n * 4, f); fclose(f);
  return 0;
}
`;

const tmp = mkdtempSync(join(tmpdir(), "heal-fixtures-"));
try {
  writeFileSync(join(tmp, "harness.c"), harness);
  const bin = join(tmp, "harness");
  execFileSync("cc", [
    "-O2",
    `-I${rendering}`,
    join(tmp, "harness.c"),
    join(rendering, "HealPixels.c"),
    "-lm",
    "-o",
    bin,
  ]);
  mkdirSync(out, { recursive: true });
  // Name prefix, image size, spot radius, and the modes to run (0 Content-Aware, 1 Create Texture).
  const cases = [
    ["heal", 64, 6, { "content-aware": 0, texture: 1 }],
    // A spot over 32 px across, so the solver's coarse-to-fine pass runs.
    ["heal-large", 96, 20, { texture: 1 }],
  ];
  for (const [name, size, radius, modes] of cases) {
    writeFileSync(join(out, `${name}-input.rgba`), input(size));
    writeFileSync(join(out, `${name}-mask.r8`), mask(size, radius));
    for (const [mode, n] of Object.entries(modes)) {
      execFileSync(bin, [
        String(size),
        String(n),
        join(out, `${name}-input.rgba`),
        join(out, `${name}-mask.r8`),
        join(out, `${name === "heal" ? "spot-heal" : name}-${mode}.rgba`),
      ]);
    }
  }
  writeFileSync(join(tmp, "fill.c"), fillHarness);
  const fill = join(tmp, "fill");
  execFileSync("cc", [
    "-O2",
    `-I${rendering}`,
    join(tmp, "fill.c"),
    join(rendering, "ContentFill.c"),
    "-o",
    fill,
  ]);
  execFileSync(fill, [
    "64",
    join(out, "heal-input.rgba"),
    join(out, "heal-mask.r8"),
    join(out, "content-fill.rgba"),
  ]);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
