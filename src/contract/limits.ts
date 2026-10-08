/** Size limits, in bytes. A file over its limit is not opened. */
export type Limits = {
  /** Largest image, video, audio or PDF file to preview. */
  previewBytes: number;
  /** Largest plain-text file to open. */
  textBytes: number;
  /** Largest Markdown or Excalidraw document to open. */
  docBytes: number;
  /** Largest project archive (.comp.zip) to open. */
  projectBytes: number;
};

/** The limits used when none are given: 64 MiB previews, 1 MiB text, 8 MiB documents, 1 GiB projects. */
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
