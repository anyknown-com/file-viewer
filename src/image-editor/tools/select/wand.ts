// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/WandPixels.c), MIT, Copyright (c) 2026 Wonder Assembly LLC

export type WandInput = {
  width: number;
  height: number;
  data: Uint8Array; // RGBA8, straight alpha
  x: number;
  y: number;
  tolerance: number;
  sample: 1 | 3 | 5;
  contiguous: boolean;
};

const CHECK_EVERY = 65536;

function abortError(): DOMException {
  return new DOMException("The job was aborted.", "AbortError");
}

type Reference = [number, number, number, number];

/** The average (rounded) of the sample box around (x, y), clamped to the image. */
function referenceColor(input: WandInput, x: number, y: number): Reference {
  const { width, height, data } = input;
  const radius = (input.sample - 1) / 2;
  const sums = [0, 0, 0, 0];
  let samples = 0;
  for (let sy = Math.max(0, y - radius); sy <= Math.min(height - 1, y + radius); sy++) {
    for (let sx = Math.max(0, x - radius); sx <= Math.min(width - 1, x + radius); sx++) {
      samples++;
      for (let c = 0; c < 4; c++) sums[c] += data[(sy * width + sx) * 4 + c];
    }
  }
  const [r, g, b, a] = sums.map((s) => Math.floor((s + Math.floor(samples / 2)) / samples));
  return [r, g, b, a];
}

/** Counts work and throws AbortError once per `CHECK_EVERY` units when the signal is aborted. */
function ticker(signal?: AbortSignal): (n: number) => void {
  let work = 0;
  return (n) => {
    work += n;
    if (work < CHECK_EVERY) return;
    work = 0;
    if (signal?.aborted) throw abortError();
  };
}

/**
 * Scanline flood fill: each popped seed fills its horizontal run, then pushes one seed per
 * matching run in the rows directly above and below it.
 */
function fill(
  mask: Uint8Array,
  width: number,
  height: number,
  seed: [number, number],
  matches: (i: number) => boolean,
  tick: (n: number) => void,
): void {
  const stack: number[] = [...seed];
  while (stack.length) {
    const sy = stack.pop() as number;
    const sx = stack.pop() as number;
    const row = sy * width;
    if (mask[row + sx] || !matches(row + sx)) continue;
    let left = sx;
    let right = sx;
    while (left > 0 && !mask[row + left - 1] && matches(row + left - 1)) left--;
    while (right + 1 < width && !mask[row + right + 1] && matches(row + right + 1)) right++;
    mask.fill(255, row + left, row + right + 1);
    tick(right - left + 1);
    for (const ny of [sy - 1, sy + 1]) {
      if (ny < 0 || ny >= height) continue;
      let inRun = false;
      for (let nx = left; nx <= right; nx++) {
        const candidate = !mask[ny * width + nx] && matches(ny * width + nx);
        if (candidate && !inRun) stack.push(nx, ny);
        inRun = candidate;
      }
      tick(right - left + 1);
    }
  }
}

/**
 * R8 mask (255 = matches) of the pixels whose four channels, alpha included, are all within
 * `tolerance` of the average of the sample box around (x, y). `contiguous` limits it to the
 * 4-connected region around the click. The edge gets a 1 px anti-aliasing blur that keeps
 * matching pixels at 128 or more and the others below 128.
 */
export function wandMask(input: WandInput, signal?: AbortSignal): Uint8Array {
  const { width, height, data, tolerance } = input;
  const mask = new Uint8Array(width * height);
  if (signal?.aborted) throw abortError();
  const x = Math.floor(input.x);
  const y = Math.floor(input.y);
  if (!width || !height || x < 0 || y < 0 || x >= width || y >= height) return mask;

  const ref = referenceColor(input, x, y);
  const matches = (i: number): boolean =>
    ref.every((v, c) => Math.abs(data[i * 4 + c] - v) <= tolerance);
  const tick = ticker(signal);
  if (input.contiguous) {
    fill(mask, width, height, [x, y], matches, tick);
  } else {
    for (let i = 0; i < mask.length; i++) {
      if (matches(i)) mask[i] = 255;
      tick(1);
    }
  }
  return soften(mask, width, height);
}

/** A 1-2-1 blur in both directions; matching pixels stay >= 128 and others stay <= 127. */
function soften(mask: Uint8Array, width: number, height: number): Uint8Array {
  const tmp = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const l = x > 0 ? mask[i - 1] : mask[i];
      const r = x + 1 < width ? mask[i + 1] : mask[i];
      tmp[i] = l + 2 * mask[i] + r;
    }
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const u = y > 0 ? tmp[i - width] : tmp[i];
      const d = y + 1 < height ? tmp[i + width] : tmp[i];
      const blur = Math.round((u + 2 * tmp[i] + d) / 16);
      out[i] = mask[i] ? Math.max(blur, 128) : Math.min(blur, 127);
    }
  }
  return out;
}
