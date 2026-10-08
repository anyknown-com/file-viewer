import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// comp-preview.tsx is loaded by the viewer; it must not pull in the editor engine or worker.
const allowed = (path: string): boolean =>
  path === "react" ||
  path === "../comp/index" ||
  path === "./messages" ||
  /^\.\.\/(contract|i18n|primitives)\/[\w-]+$/.test(path);

it("comp-preview imports only the allowed modules", () => {
  const code = readFileSync("src/image-editor/comp-preview.tsx", "utf8");
  const paths = [...code.matchAll(/(?:import|from)\s*\(?\s*"([^"]+)"/g)].map((m) => m[1]!);
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.filter((p) => !allowed(p))).toEqual([]);
});
