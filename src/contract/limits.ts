export type Limits = {
  previewBytes: number;
  textBytes: number;
  docBytes: number;
  projectBytes: number;
};

export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  previewBytes: 64 * 1024 * 1024,
  textBytes: 1024 * 1024,
  docBytes: 8 * 1024 * 1024,
  projectBytes: 1024 * 1024 * 1024,
});

export function resolveLimits(partial?: Partial<Limits>): Limits {
  const out: Limits = { ...DEFAULT_LIMITS };
  if (partial) {
    for (const key of Object.keys(out) as (keyof Limits)[]) {
      const v = partial[key];
      if (v !== undefined) out[key] = v;
    }
  }
  return out;
}
