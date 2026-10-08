/// <reference types="vite/client" />
import { blobSource, type FileRef } from "../../contract/byte-source";

const urls = import.meta.glob<string>("../../../test/fixtures/video-editor/*", {
  query: "?url",
  import: "default",
  eager: true,
});

export async function fixtureFile(name: string): Promise<File> {
  const url = urls[`../../../test/fixtures/video-editor/${name}`];
  if (!url) throw new Error(`no fixture ${name}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fixture ${name}: HTTP ${res.status}`);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type });
}

export async function fixtureRef(name: string): Promise<FileRef> {
  const file = await fixtureFile(name);
  return { name, source: blobSource(file) };
}
