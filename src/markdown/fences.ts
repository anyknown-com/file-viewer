import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/** One excalidraw code fence found in a Markdown document. */
export type Fence = {
  /** Position of the fence among the document's excalidraw fences, from 0. */
  index: number;
  /** Offset in the source where the fence starts. */
  start: number;
  /** Offset in the source where the fence ends. */
  end: number;
  /** The diagram text inside the fence. */
  json: string;
};

type MdNode = {
  type: string;
  lang?: string | null;
  value?: string;
  children?: MdNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

/** Finds every excalidraw code fence in a Markdown document, in order. */
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

/** Replaces the body of one fence with new text, keeping its markers, line endings and list or quote prefix. */
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

/** Replaces every fence body with its index, so the rest of the document can be rendered without the diagram text. */
export function maskFences(source: string, fences: Fence[]): string {
  let out = source;
  for (const f of fences.toReversed()) out = replaceFence(out, f, String(f.index));
  return out;
}
