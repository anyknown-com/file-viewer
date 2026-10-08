// Everything that moves a file in or out of the playground: a picked or dropped File becomes a
// FileRef, and a save becomes a browser download. "Save back to the original file" or several
// open files would change only this file and the playground's state.
import { blobSource, type FileRef, type SaveRequest } from "@anyknown/file-viewer";

export function fileRefOf(file: File): FileRef {
  return { name: file.name, mime: file.type || undefined, source: blobSource(file) };
}

export function savedRefOf(req: SaveRequest): FileRef {
  return { name: req.suggestedName, mime: req.mime, source: blobSource(req.blob) };
}

export function downloadSave(req: SaveRequest): Promise<void> {
  const url = URL.createObjectURL(req.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = req.suggestedName;
  document.body.append(a);
  a.click();
  a.remove();
  // The download may still be reading the blob; give it a minute before letting go.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return Promise.resolve();
}
