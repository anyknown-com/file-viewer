import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export type Fence = { index: number; start: number; end: number; json: string };

type MdNode = {
  type: string;
  lang?: string | null;
  value?: string;
  children?: MdNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

export function findFences(source: string): Fence[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source) as MdNode;
  const fences: Fence[] = [];
  const walk = (node: MdNode): void => {
    if (node.type === "code" && node.lang === "excalidraw") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        fences.push({ index: fences.length, start, end, json: node.value ?? "" });
      }
    }
    node.children?.forEach(walk);
  };
  walk(tree);
  return fences;
}

const LIST_MARKER = /(?:[-*+]|\d+[.)])(?=\s|$)/g;

function lineStartOf(source: string, offset: number): number {
  return source.lastIndexOf("\n", offset - 1) + 1;
}

export function replaceFence(source: string, fence: Fence, content: string): string {
  const openLineStart = lineStartOf(source, fence.start);
  const nlAt = source.indexOf("\n", fence.start);
  if (nlAt === -1 || nlAt >= fence.end) return source;
  const eol = source[nlAt - 1] === "\r" ? "\r\n" : "\n";
  const bodyStart = nlAt + 1;

  const marker = /^(`{3,}|~{3,})/.exec(source.slice(fence.start))?.[1] ?? "```";
  const lastLineStart = lineStartOf(source, fence.end);
  const closed =
    lastLineStart >= bodyStart &&
    new RegExp(`^[\\s>]*${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`).test(
      source.slice(lastLineStart, fence.end),
    );

  const prefix = source
    .slice(openLineStart, fence.start)
    .replace(LIST_MARKER, (m) => " ".repeat(m.length));
  const lines = content === "" ? [] : content.split(/\r?\n/);
  const rendered = lines.map((l) => prefix + l);
  const body = closed ? rendered.map((l) => l + eol).join("") : rendered.join(eol);
  const bodyEnd = closed ? lastLineStart : fence.end;
  return source.slice(0, bodyStart) + body + source.slice(bodyEnd);
}

export function maskFences(source: string, fences: Fence[]): string {
  let out = source;
  for (const f of [...fences].reverse()) out = replaceFence(out, f, String(f.index));
  return out;
}
