import list from "../../docs/guides/guides.json";

export type Guide = { key: string; file: string; title: string; note: string; body: string };

const bodies: Record<string, string> = import.meta.glob(
  ["../../docs/guides/*.md", "../../README.md", "../../CHANGELOG.md"],
  { query: "?raw", import: "default", eager: true },
);

export const GUIDES: Guide[] = list.map((g) => ({ ...g, body: bodies[`../../${g.file}`] ?? "" }));

export function guideByKey(key: string): Guide | undefined {
  return GUIDES.find((g) => g.key === key);
}

/**
 * Maps a link target to a guide key. Leading `./` and `../` segments are dropped, then the rest
 * matches a guide's repo-relative `file` exactly or as its trailing path, so `./CHANGELOG.md`
 * and `./connect.md` (from `docs/guides/`) both resolve.
 */
export function guideKeyOfFile(file: string): string | undefined {
  const path = file.replace(/^(\.\.?\/)+/, "");
  return GUIDES.find((g) => g.file === path || g.file.endsWith(`/${path}`))?.key;
}
