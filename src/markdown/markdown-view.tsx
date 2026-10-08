import { createContext, use, useMemo, type ComponentProps, type ReactNode } from "react";
import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { CommonProps } from "../contract/props";
import type { ImageResolver } from "../contract/image-resolver";
import { ViewerRoot } from "../primitives/root";
import { findFences, maskFences, type Fence } from "./fences";
import { InLinkContext } from "./in-link";
import { MarkdownImage } from "./markdown-image";
import { markdownSchema } from "./sanitize-schema";

/** Props of MarkdownView. */
export type MarkdownViewProps = Omit<CommonProps, "file"> & {
  /** The Markdown text to render. */
  source: string;
  /** Maps image references in the text to URLs or links; without it images are not loaded. */
  resolveImage?: ImageResolver;
  /** Renders an excalidraw code fence; without it the fence shows its raw text. */
  renderDiagram?: (fence: Fence) => ReactNode;
};

type ContentProps = Pick<MarkdownViewProps, "source" | "resolveImage" | "renderDiagram">;

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

function textOf(node: HastNode): string {
  return node.value ?? node.children?.map(textOf).join("") ?? "";
}

function diagramIndex(node: HastNode | undefined): number | null {
  const code = node?.children?.find((c) => c.type === "element" && c.tagName === "code");
  const cls = code?.properties?.className;
  if (!code || !Array.isArray(cls) || !cls.includes("language-excalidraw")) return null;
  const n = Number(textOf(code).trim());
  return Number.isInteger(n) ? n : null;
}

type Ctx = {
  fences: Fence[];
  resolveImage?: ImageResolver;
  renderDiagram?: (fence: Fence) => ReactNode;
};
const MarkdownContext = createContext<Ctx>({ fences: [] });

function MdLink({ href, children }: ComponentProps<"a">): React.JSX.Element {
  if (!href) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <InLinkContext value={true}>{children}</InLinkContext>
    </a>
  );
}

function MdImage({ src, alt }: ComponentProps<"img">): React.JSX.Element {
  const { resolveImage } = use(MarkdownContext);
  return (
    <MarkdownImage src={String(src ?? "")} alt={String(alt ?? "")} resolveImage={resolveImage} />
  );
}

function MdPre({ node, children }: ComponentProps<"pre"> & { node?: unknown }): React.JSX.Element {
  const { fences, renderDiagram } = use(MarkdownContext);
  const i = diagramIndex(node as HastNode | undefined);
  const fence = i === null ? undefined : fences[i];
  if (!fence) return <pre>{children}</pre>;
  if (renderDiagram) return <>{renderDiagram(fence)}</>;
  return (
    <pre className="fv-md-diagram-raw">
      <code>{fence.json}</code>
    </pre>
  );
}

const components: Components = { a: MdLink, img: MdImage, pre: MdPre };

function MarkdownContent({ source, resolveImage, renderDiagram }: ContentProps): React.JSX.Element {
  const fences = useMemo(() => findFences(source), [source]);
  const masked = useMemo(() => maskFences(source, fences), [source, fences]);
  const ctx = useMemo(
    () => ({ fences, resolveImage, renderDiagram }),
    [fences, resolveImage, renderDiagram],
  );

  return (
    <MarkdownContext value={ctx}>
      <div className="fv-md">
        <article className="fv-prose">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeSanitize, markdownSchema]]}
            skipHtml
            urlTransform={(url, key) => (key === "src" ? url : defaultUrlTransform(url))}
            components={components}
          >
            {masked}
          </Markdown>
        </article>
      </div>
    </MarkdownContext>
  );
}

/** Renders Markdown as sanitized HTML, with an optional hook for excalidraw diagrams. */
export function MarkdownView(props: MarkdownViewProps): React.JSX.Element {
  const { source, resolveImage, renderDiagram, ...root } = props;
  return (
    <ViewerRoot {...root}>
      <MarkdownContent source={source} resolveImage={resolveImage} renderDiagram={renderDiagram} />
    </ViewerRoot>
  );
}
