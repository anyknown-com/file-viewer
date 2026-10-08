// Writes /llms.txt (index), /llms-full.txt (everything) and /docs/*.md (sources) to site/dist.
//
// The docs site is a hash-routed SPA, so a crawler fetching `#/guide/connect` gets an empty
// shell. The Markdown sources therefore also ship at stable URLs, and llms.txt points at them.
// Format per https://llmstxt.org. Modelled on anyknown-com/ui scripts/llms-txt.mjs.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apiMarkdown } from "./api-markdown.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "site/dist");
const site = "https://file-viewer.anyknown.com";

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const guides = JSON.parse(readFileSync(join(root, "docs/guides/guides.json"), "utf8"));
const api = JSON.parse(readFileSync(join(root, "site/generated/api.json"), "utf8"));

const read = (guide) => readFileSync(join(root, guide.file), "utf8").trim();
const apiMd = apiMarkdown(api);

mkdirSync(join(out, "docs"), { recursive: true });
for (const g of guides) writeFileSync(join(out, `docs/${g.key}.md`), `${read(g)}\n`);
writeFileSync(join(out, "docs/api.md"), apiMd);

const subpaths = Object.keys(pkg.exports).map((k) =>
  k === "." ? pkg.name : `${pkg.name}/${k.slice(2)}`,
);

const index = `# ${pkg.name}

> ${pkg.description}

The site is a hash-routed app with a playground on the home page. Every entry below links the Markdown source; the #/ link is the same document on the site.

## Guides

${guides.map((g) => `- [${g.title}](${site}/docs/${g.key}.md): ${g.note}`).join("\n")}

## API

- [API reference](${site}/docs/api.md): every export of every subpath with signatures, props and the message tables.

## Optional

- [Everything in one file](${site}/llms-full.txt): every guide and the API reference, for loading into one context.

## Package

- npm: https://www.npmjs.com/package/${pkg.name} (${pkg.license})
- Source: https://github.com/anyknown-com/file-viewer
- Entry points: ${subpaths.map((s) => `\`${s}\``).join(", ")}
`;
writeFileSync(join(out, "llms.txt"), index);

const full = [
  `# ${pkg.name}: all documentation`,
  "",
  `> ${pkg.description} This file is the full text of every guide and the API reference listed in ${site}/llms.txt.`,
  "",
  ...guides.flatMap((g) => ["---", "", `<!-- ${g.file} -->`, "", read(g), ""]),
  "---",
  "",
  apiMd,
].join("\n");
writeFileSync(join(out, "llms-full.txt"), `${full}\n`);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} kB`;
console.log(`  llms.txt        ${kb(index)}`);
console.log(`  llms-full.txt   ${kb(full)}`);
console.log(`  docs/api.md     ${kb(apiMd)}`);
console.log(`  docs/*.md       ${guides.length} guides`);
