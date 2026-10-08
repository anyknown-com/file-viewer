import { COMP_SUFFIX } from "./formats";

/** How the result relates to the original: replace it, save a copy, or export to another format. */
export type SaveMode = "replace" | "copy" | "export";
/** What the host receives when the user saves. */
export type SaveRequest = {
  /** The bytes to save. */
  blob: Blob;
  /** MIME type of the bytes. */
  mime: string;
  /** File extension with the dot, for example ".png". */
  ext: string;
  /** Whether to replace the original, save a copy or export. */
  mode: SaveMode;
  /** A file name to offer, built from the original's name and the new extension. */
  suggestedName: string;
};
/** Called with the result when the user saves. Resolve when stored; reject to show a save error. */
export type SaveHandler = (req: SaveRequest) => Promise<void>;

/** `ext` includes the dot; ".comp.zip" counts as one extension. */
export function splitName(name: string): { stem: string; ext: string } {
  if (name.toLowerCase().endsWith(COMP_SUFFIX) && name.length > COMP_SUFFIX.length) {
    const at = name.length - COMP_SUFFIX.length;
    return { stem: name.slice(0, at), ext: name.slice(at) };
  }
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) return { stem: name.slice(0, dot), ext: name.slice(dot) };
  return { stem: name, ext: "" };
}

export function suggestedName(original: string, ext: string, mode: SaveMode): string {
  const { stem } = splitName(original);
  return mode === "replace" ? `${stem}${ext}` : `${stem} (edited)${ext}`;
}
