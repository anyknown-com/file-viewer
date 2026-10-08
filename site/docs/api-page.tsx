import type { ApiDocs } from "../../scripts/api-docs.d.mts";
import api from "../generated/api.json";
import { ApiExportCard } from "./api-export";
import { MessagesTable } from "./messages-table";

const docs = api as ApiDocs;

function scrollToAnchor(anchor: string | undefined): (el: HTMLElement | null) => void {
  return (el) => {
    if (el === null || anchor === undefined) return;
    el.querySelector(`[id="api-${anchor}"]`)?.scrollIntoView();
  };
}

export function ApiPage({ anchor }: { anchor?: string }): React.JSX.Element {
  return (
    <div className="api" ref={scrollToAnchor(anchor)}>
      <h1>API</h1>
      {docs.entries.map((entry) => (
        <section key={entry.subpath}>
          <h2>{entry.importPath}</h2>
          <pre className="api-import">
            <code>
              {`import { ${entry.exports.map((e) => e.name).join(", ")} } from "${entry.importPath}"`}
            </code>
          </pre>
          {entry.exports.map((item) => (
            <ApiExportCard key={item.name} item={item} />
          ))}
        </section>
      ))}
      <section>
        <h2>Messages</h2>
        <MessagesTable rows={docs.messages} />
      </section>
    </div>
  );
}
