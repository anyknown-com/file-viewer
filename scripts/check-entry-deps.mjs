import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { init, parse } from "es-module-lexer";

export const FORBIDDEN = [
  /^@excalidraw\//,
  /^mediabunny$/,
  /^react-markdown$/,
  /^remark-/,
  /^rehype-/,
  /^unified$/,
  /^fflate$/,
];
export const MAX_BYTES = 65536;

const isRelative = (specifier) => specifier.startsWith("./") || specifier.startsWith("../");

export async function staticGraph(entryFile) {
  await init;
  const files = [];
  const bare = [];
  const seen = new Set();
  let bytes = 0;
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    files.push(file);
    const source = readFileSync(file, "utf8");
    bytes += statSync(file).size;
    const [imports] = parse(source);
    for (const imp of imports) {
      if (imp.type === "dynamic" || imp.type === "import-meta") continue;
      const specifier = imp.specifier;
      if (typeof specifier !== "string") continue;
      if (isRelative(specifier)) walk(path.resolve(path.dirname(file), specifier));
      else bare.push({ specifier, from: file });
    }
  };
  walk(path.resolve(entryFile));
  return { files, bare, bytes };
}

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

export async function dynamicIndexTargets(distDir) {
  await init;
  const lines = [];
  for (const file of jsFiles(distDir)) {
    const source = readFileSync(file, "utf8");
    const [imports] = parse(source);
    for (const imp of imports) {
      if (imp.type !== "dynamic" || imp.glob) continue;
      const specifier = imp.specifier;
      if (typeof specifier !== "string" || !`"'`.includes(source[imp.start])) continue;
      if (!isRelative(specifier)) continue;
      if (/^index[.-]/.test(path.basename(specifier))) {
        lines.push(
          `dynamic import of ${specifier} in ${file}: the target file must not be named index.*`,
        );
      }
    }
  }
  return lines;
}

export function findViolations(graph) {
  const lines = [];
  for (const { specifier, from } of graph.bare) {
    if (FORBIDDEN.some((re) => re.test(specifier))) {
      lines.push(`${specifier} imported by ${from}`);
    }
  }
  if (graph.bytes > MAX_BYTES) {
    lines.push(`entry graph is ${graph.bytes} bytes, limit ${MAX_BYTES}`);
  }
  return lines;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const graph = await staticGraph(path.join(root, "dist/index.js"));
  const violations = [
    ...findViolations(graph),
    ...(await dynamicIndexTargets(path.join(root, "dist"))),
  ];
  if (violations.length > 0) {
    for (const line of violations) console.error(line);
    process.exit(1);
  }
  console.log(`entry graph ok: ${graph.files.length} files, ${graph.bytes} bytes`);
}
