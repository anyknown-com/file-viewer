import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { guideKeyOfFile } from "./content";

const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

function guideHref(href: string): string {
  if (EXTERNAL.test(href) || href.startsWith("/") || href.startsWith("#")) return href;
  const match = /^([^#]+\.md)(#.*)?$/.exec(href);
  if (match === null) return href;
  const key = guideKeyOfFile(match[1] ?? "");
  return key === undefined ? href : `#/guide/${key}`;
}

const components: Components = {
  a: ({ href, children, node: _node, ...rest }) => {
    if (href === undefined) return <a {...rest}>{children}</a>;
    const external = EXTERNAL.test(href);
    return (
      <a {...rest} href={guideHref(href)} rel={external ? "noreferrer" : undefined}>
        {children}
      </a>
    );
  },
};

export function Markdown({ source }: { source: string }): React.JSX.Element {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {source}
    </ReactMarkdown>
  );
}
