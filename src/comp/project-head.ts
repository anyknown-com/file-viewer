import { ProjectError } from "./errors";
import { parseManifest } from "./manifest";
import type { Manifest } from "./manifest";
import { validateLikeCompositor } from "./validate";
import { readHeadEntries } from "./zip-head";

/** Reads the bytes in [start, end) of the archive. */
export type ReadRange = (start: number, end: number) => Promise<Uint8Array>;

/** Manifest (and preview) from the first zip entries only; null = read the whole file instead. */
export async function readHead(
  read: ReadRange,
): Promise<{ manifest: Manifest; preview?: Uint8Array } | null> {
  const head = await readHeadEntries(read);
  if (!head) return null;
  const manifest = parseManifest(head.manifest);
  const problems = validateLikeCompositor(manifest);
  if (problems.length > 0) throw new ProjectError("invalid", problems);
  return head.preview ? { manifest, preview: head.preview } : { manifest };
}
