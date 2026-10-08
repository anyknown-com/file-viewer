import { COMP_SUFFIX } from "./formats";

export type SaveMode = "replace" | "copy" | "export";
export type SaveRequest = {
  blob: Blob;
  mime: string;
  ext: string;
  mode: SaveMode;
  suggestedName: string;
};
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
