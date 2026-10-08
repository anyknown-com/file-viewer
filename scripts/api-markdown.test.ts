// @vitest-environment node
import { expect, it } from "vitest";
import type { ApiDocs } from "./api-docs.d.mts";
import { apiMarkdown } from "./api-markdown.mjs";

const member = { default: null, deprecated: false as const };
const api: ApiDocs = {
  generatedFrom: "package.json#exports",
  entries: [
    {
      subpath: ".",
      importPath: "@anyknown/file-viewer",
      file: "src/index.ts",
      exports: [
        {
          name: "FileViewer",
          kind: "component",
          file: "src/viewer/file-viewer.tsx",
          signature: "FileViewer(props: FileViewerProps): JSX.Element",
          description: "Shows a file.",
          deprecated: false,
          members: [
            { ...member, name: "file", type: "FileRef", required: true, description: "The file." },
            {
              ...member,
              name: "locale",
              type: "Locale",
              required: false,
              description: "Language.",
            },
          ],
        },
        {
          name: "Theme",
          kind: "type",
          file: "src/contract/theme.ts",
          signature: 'type Theme = "light" | "dark"',
          description: "Color theme.",
          deprecated: false,
          members: [],
        },
      ],
    },
  ],
  messages: [
    { key: "common.close", en: "Close", "zh-TW": "關閉" },
    { key: "error.too_large", en: "Too large", "zh-TW": "太大" },
  ],
};

it("renders entries, exports, member tables and messages", () => {
  const md = apiMarkdown(api);
  expect(md).toContain("## @anyknown/file-viewer");
  expect(md).toContain("### FileViewer");
  expect(md).toContain("| Name | Type | Default | Description |");
  expect(md).toContain("| `file` (required) |");
  expect(md).toContain("| `locale` |");
  expect(md).not.toContain("`locale` (required)");
  expect(md).toContain("## Messages");
  expect(md).toContain("| `error.too_large` | Too large | 太大 |");
});
