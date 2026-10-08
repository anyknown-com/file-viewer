import { inflateSync } from "fflate";
import { crc32 } from "./crc32";
import { ProjectError } from "./errors";

// Limits mirror Compositor IO/ProjectStore.swift readPackage (checkFile) and storage 17.
const MAX_ENTRY = 512 * 1024 * 1024;
const MAX_MANIFEST = 4 * 1024 * 1024;
const MAX_TOTAL = 4 * 1024 * 1024 * 1024;
const MAX_EOCD_SEARCH = 65557;

type CentralEntry = {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
};

const decoder = new TextDecoder();

function notZip(detail: string): never {
  throw new ProjectError("not_zip", [detail]);
}

function findEocd(bytes: Uint8Array, view: DataView): number {
  const lowest = Math.max(0, bytes.length - MAX_EOCD_SEARCH);
  for (let i = bytes.length - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return notZip("end of central directory not found");
}

function readCentral(bytes: Uint8Array, view: DataView): CentralEntry[] {
  const eocd = findEocd(bytes, view);
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === 0x07064b50)
    notZip("zip64 is not supported");
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    notZip("zip64 is not supported");
  }
  if (cdOffset + cdSize > eocd) notZip("central directory is out of range");
  const entries: CentralEntry[] = [];
  let pos = cdOffset;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50) {
      notZip("bad central directory entry");
    }
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const size = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    if (pos + 46 + nameLen > bytes.length) notZip("bad central directory entry");
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    if (flags & 1) notZip(`${name} is encrypted`);
    if (method !== 0 && method !== 8) notZip(`${name} uses unsupported method ${method}`);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      notZip("zip64 is not supported");
    }
    entries.push({
      name,
      method,
      crc: view.getUint32(pos + 16, true),
      compressedSize,
      size,
      localOffset,
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function checkNames(entries: CentralEntry[]): void {
  const seen = new Set<string>();
  for (const { name } of entries) {
    const unsafe =
      name.startsWith("/") ||
      name.includes("\\") ||
      name.includes(":") ||
      name.split("/").includes("..");
    if (unsafe) throw new ProjectError("unsafe_entry", [`unsafe entry name: ${name}`]);
    if (seen.has(name)) throw new ProjectError("unsafe_entry", [`duplicate entry: ${name}`]);
    seen.add(name);
  }
}

function checkSizes(entries: CentralEntry[]): void {
  let total = 0;
  for (const { name, size } of entries) {
    if (size > MAX_ENTRY) throw new ProjectError("too_large", [`${name} is over 512 MiB`]);
    total += size;
  }
  if (total > MAX_TOTAL) throw new ProjectError("too_large", ["archive is over 4 GiB"]);
}

function isIgnored(name: string): boolean {
  if (name.endsWith("/") || name.startsWith("__MACOSX/")) return true;
  return name.slice(name.lastIndexOf("/") + 1) === ".DS_Store";
}

// Finder / `ditto --keepParent` zips put everything under one `<name>.comp/` folder.
function rootToStrip(names: string[]): string {
  if (names.length === 0) return "";
  const root = names[0]!.slice(0, names[0]!.indexOf("/") + 1);
  if (!root.endsWith(".comp/") || root === "") return "";
  return names.every((n) => n.startsWith(root)) ? root : "";
}

function extract(bytes: Uint8Array, view: DataView, entry: CentralEntry): Uint8Array {
  const { name, localOffset } = entry;
  if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
    notZip(`bad local header for ${name}`);
  }
  // The local header's own name and extra lengths, not the central directory's.
  const start =
    localOffset +
    30 +
    view.getUint16(localOffset + 26, true) +
    view.getUint16(localOffset + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.length) notZip(`${name} is truncated`);
  const raw = bytes.subarray(start, end);
  let data: Uint8Array;
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.size) notZip(`${name} has inconsistent sizes`);
    data = raw.slice();
  } else {
    try {
      data = inflateSync(raw, { out: new Uint8Array(entry.size) });
    } catch {
      return notZip(`${name} could not be inflated`);
    }
    if (data.length !== entry.size) notZip(`${name} inflated to the wrong size`);
  }
  if (crc32(data) !== entry.crc) notZip(`${name} crc mismatch`);
  return data;
}

export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22) notZip("too short to be a zip");
  const entries = readCentral(bytes, view);
  checkNames(entries);
  checkSizes(entries);
  const kept = entries.filter((e) => !isIgnored(e.name));
  const strip = rootToStrip(kept.map((e) => e.name));
  const result = new Map<string, Uint8Array>();
  for (const entry of kept) {
    const name = entry.name.slice(strip.length);
    if (name === "manifest.json" && entry.size > MAX_MANIFEST) {
      throw new ProjectError("too_large", ["manifest.json is over 4 MiB"]);
    }
    result.set(name, extract(bytes, view, entry));
  }
  return result;
}
