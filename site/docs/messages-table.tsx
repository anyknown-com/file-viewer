import type { MessageRow } from "../../scripts/api-docs.d.mts";

export function MessagesTable({ rows }: { rows: MessageRow[] }): React.JSX.Element {
  return (
    <div className="api-table-wrap">
      <table className="api-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>English</th>
            <th>繁體中文</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <code>{r.key}</code>
              </td>
              <td>{r.en}</td>
              <td>{r["zh-TW"]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
