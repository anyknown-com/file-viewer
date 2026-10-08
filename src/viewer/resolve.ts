import type { FileRef } from "../contract/byte-source";
import type { EditKind, ViewKind } from "../contract/formats";
import { kindOf } from "../contract/kinds";
import type { Limits } from "../contract/limits";

export type Resolved =
  | { status: "view"; view: ViewKind; edit: EditKind | null }
  | { status: "too_large"; edit: EditKind | null }
  | { status: "unsupported"; edit: EditKind | null };

export function resolve(file: FileRef, limits?: Partial<Limits>): Resolved {
  const k = kindOf({ name: file.name, mime: file.mime, size: file.source.size }, limits);
  if (k.view !== null) return { status: "view", view: k.view, edit: k.edit };
  if (k.tooLarge) return { status: "too_large", edit: k.edit };
  return { status: "unsupported", edit: k.edit };
}
