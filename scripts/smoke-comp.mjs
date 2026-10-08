// Plain-Node smoke test of the built ./comp subpath: run `pnpm build` first.
import {
  fromImage,
  readHead,
  readProject,
  stringifyManifest,
  summarize,
  writeProject,
} from "@anyknown/file-viewer/comp";

function fail(message) {
  console.error(`smoke-comp: ${message}`);
  process.exit(1);
}

const rgba = new Uint8Array(2 * 2 * 4).map((_, i) => (i * 37) % 256);
const project = fromImage({ width: 2, height: 2, rgba }, "Smoke");
const bytes = new Uint8Array(await writeProject(project).arrayBuffer());

const back = readProject(bytes);
if (stringifyManifest(back.manifest) !== stringifyManifest(project.manifest)) {
  fail("readProject returned a different manifest");
}
for (const [name, png] of project.assets) {
  const got = back.assets.get(name);
  if (!got || got.length !== png.length || got.some((b, i) => b !== png[i])) {
    fail(`asset ${name} changed`);
  }
}

const head = await readHead(async (start, end) => bytes.subarray(start, end));
if (!head || stringifyManifest(head.manifest) !== stringifyManifest(project.manifest)) {
  fail("readHead did not return the manifest");
}

const summary = summarize(back.manifest, "smoke.comp.zip");
if (!summary.includes("2×2") || !summary.includes('"Smoke"')) fail("summary looks wrong");
console.log(summary);
