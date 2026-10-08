// TypeScript helpers for scripts/api-docs.mjs.
// Copied from anyknown-com/ui scripts/api-docs.mjs (MIT, same owner), without externalBases,
// and with createProgram taking the repo root.
import { join } from "node:path";
import ts from "typescript";

export function createProgram(root, entries) {
  const configPath = join(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile).config;
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, root);
  return ts.createProgram(entries, { ...options, noEmit: true });
}

export const docText = (checker, symbol) =>
  ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();

export function tagsOf(symbol, checker) {
  const tags = {};
  for (const tag of symbol.getJsDocTags(checker))
    tags[tag.name] = ts.displayPartsToString(tag.text ?? []).trim();
  return tags;
}

export const isOurs = (node) => !node.getSourceFile().fileName.includes("node_modules");

/** The function node behind a component export, to read destructuring defaults from. */
export function functionNode(declaration) {
  if (ts.isFunctionDeclaration(declaration)) return declaration;
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    const init = declaration.initializer;
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
  }
  return undefined;
}

/** `DEFAULT_TIMEOUT` → `5000` when it names a module-level const with a literal value. */
export function literalOf(node, checker) {
  if (ts.isIdentifier(node)) {
    const decl = checker.getSymbolAtLocation(node)?.valueDeclaration;
    const init = decl && ts.isVariableDeclaration(decl) ? decl.initializer : undefined;
    if (init && (ts.isLiteralExpression(init) || ts.isPrefixUnaryExpression(init)))
      return init.getText();
  }
  return node.getText();
}

/** `{ size = "md", variant = "primary" }` → { size: '"md"', variant: '"primary"' } */
export function destructuringDefaults(fn, checker) {
  const defaults = {};
  const param = fn?.parameters[0];
  if (param == null || !ts.isObjectBindingPattern(param.name)) return defaults;
  for (const element of param.name.elements) {
    if (element.initializer == null) continue;
    const key = element.propertyName ?? element.name;
    if (ts.isIdentifier(key)) defaults[key.text] = literalOf(element.initializer, checker);
  }
  return defaults;
}

/**
 * The type as written in the source (`ReactNode`, not its expansion), unless it names something
 * the reader cannot import: a private alias (`Variant`) or `keyof typeof X` is expanded instead.
 */
export function typeText(prop, checker, location, publicNames) {
  const decl = prop.declarations?.[0];
  const written =
    decl && (ts.isPropertySignature(decl) || ts.isPropertyDeclaration(decl)) && decl.type
      ? decl.type.getText().replace(/\s+/g, " ")
      : undefined;
  if (written != null) {
    const names = written.match(/\b[A-Z]\w*/g) ?? [];
    const known = (n) => publicNames.has(n) || GLOBAL_TYPES.has(n);
    if (!written.includes("typeof") && names.every(known)) return written;
  }
  const expanded = expandedType(prop, checker, location, publicNames);
  // `keyof JSX.IntrinsicElements` expands to a hundred tags; the source text says more.
  return expanded.length > 120 ? (written ?? "ReactNode") : expanded;
}

export function expandedType(prop, checker, location, publicNames) {
  const type = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(prop, location));
  const print = (t) => checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);
  // A private union alias prints as its name; spell out its members instead.
  if (type.isUnion() && type.aliasSymbol && !publicNames.has(type.aliasSymbol.getName()))
    return type.types.map(print).join(" | ");
  return print(type);
}

// Types a reader knows without importing them from this package.
export const GLOBAL_TYPES = new Set([
  "React",
  "JSX",
  "ReactNode",
  "ReactElement",
  "CSSProperties",
  "Ref",
  "RefObject",
  "Partial",
  "Record",
  "Promise",
  "Array",
  "ReadonlyArray",
  "File",
  "FileList",
  "Date",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLButtonElement",
  "HTMLDivElement",
  "KeyboardEvent",
  "MouseEvent",
  "ChangeEvent",
  "Error",
  "StyleArg",
  "StyleXStyles",
  "Omit",
  "Pick",
  "ComponentProps",
  "ComponentType",
  "Set",
  "Map",
  "AbortSignal",
  "Blob",
  "Uint8Array",
]);
