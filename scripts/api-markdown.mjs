// Renders the generated API data as Markdown for /docs/api.md and llms-full.txt.

const cell = (text) => String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");

/** @param {import("./api-docs.d.mts").ApiDocs} api */
export function apiMarkdown(api) {
  const lines = ["# @anyknown/file-viewer API", ""];
  for (const entry of api.entries) {
    lines.push(`## ${entry.importPath}`, "");
    for (const item of entry.exports) {
      lines.push(`### ${item.name}`, "", "```ts", item.signature, "```", "");
      if (item.description !== "") lines.push(item.description, "");
      if (item.deprecated !== false) {
        lines.push(`Deprecated: ${typeof item.deprecated === "string" ? item.deprecated : ""}`, "");
      }
      if (item.members.length > 0) {
        lines.push("| Name | Type | Default | Description |", "| --- | --- | --- | --- |");
        for (const m of item.members) {
          const name = `\`${m.name}\`${m.required ? " (required)" : ""}`;
          const def = m.default === null ? "" : `\`${cell(m.default)}\``;
          lines.push(`| ${name} | \`${cell(m.type)}\` | ${def} | ${cell(m.description)} |`);
        }
        lines.push("");
      }
    }
  }
  lines.push("## Messages", "", "| Key | English | 繁體中文 |", "| --- | --- | --- |");
  for (const r of api.messages) {
    lines.push(`| \`${r.key}\` | ${cell(r.en)} | ${cell(r["zh-TW"])} |`);
  }
  return `${lines.join("\n")}\n`;
}
