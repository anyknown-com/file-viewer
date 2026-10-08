import type { ApiExport } from "../../scripts/api-docs.d.mts";
import { Markdown } from "./markdown";

export function ApiExportCard({ item }: { item: ApiExport }): React.JSX.Element {
  return (
    <article className="api-card" id={"api-" + item.name}>
      <h3>{item.name}</h3>
      <pre className="api-signature">
        <code>{item.signature}</code>
      </pre>
      <Markdown source={item.description} />
      {item.deprecated !== false ? (
        <p className="api-deprecated">
          Deprecated: {typeof item.deprecated === "string" ? item.deprecated : ""}
        </p>
      ) : null}
      {item.members.length > 0 ? (
        <div className="api-table-wrap">
          <table className="api-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {item.members.map((m) => (
                <tr key={m.name}>
                  <td>
                    <code>{m.name}</code>
                    {m.required ? <span className="api-required">required</span> : null}
                  </td>
                  <td>
                    <code>{m.type}</code>
                  </td>
                  <td>{m.default === null ? "" : <code>{m.default}</code>}</td>
                  <td>{m.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}
