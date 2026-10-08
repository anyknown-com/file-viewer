# Getting started

`@anyknown/file-viewer` shows and edits files inside the browser. You hand it bytes; when someone saves, it hands you a `Blob`. It never talks to a server.

## Install

The package needs React 19 (`react` and `react-dom` are peer dependencies) and the design tokens from `@anyknown/ui`.

```sh
pnpm add @anyknown/file-viewer @anyknown/ui
```

## CSS

Import the tokens first, then the viewer's styles. Do this once, at the top of your app.

```ts
import "@anyknown/ui/tokens.css";
import "@anyknown/file-viewer/styles.css";
```

## Show a file

Wrap a `File` or `Blob` with `blobSource` and pass it to `FileViewer`. The viewer fills its container, so give the container a height. It does not open a modal; put it in your own dialog or page if you want one.

```tsx
import { blobSource, FileViewer } from "@anyknown/file-viewer";

export function Preview({ file }: { file: File }) {
  return (
    <div style={{ height: "80vh" }}>
      <FileViewer file={{ name: file.name, mime: file.type, source: blobSource(file) }} />
    </div>
  );
}
```

`mime` is optional. Without it, the viewer picks a view from the file name.

## Let people edit

Pass `onSave` to show the Edit button. When someone saves, `onSave` receives a `SaveRequest` with five fields:

- `blob`: the new bytes.
- `mime`: the type of `blob`.
- `ext`: the extension, with the dot (for example `.png`).
- `mode`: `"replace"` (overwrite the original), `"copy"` (keep both) or `"export"` (a different format).
- `suggestedName`: a file name built from the original name, `ext` and `mode`.

Resolve the promise when the file is stored. Reject it to keep the editor open with the changes unsaved; the editor shows `error.message`. Use `onDirtyChange` to know if there are unsaved changes, for example before your own close button closes the dialog.

If you do not pass `onSave`, no editor code is loaded.

```tsx
import { blobSource, FileViewer } from "@anyknown/file-viewer";
import type { SaveRequest } from "@anyknown/file-viewer";
import { useState } from "react";

async function upload(req: SaveRequest): Promise<void> {
  const body = new FormData();
  body.append("file", req.blob, req.suggestedName);
  const res = await fetch(`/api/files?mode=${req.mode}`, { method: "POST", body });
  if (!res.ok) throw new Error("The server didn't accept the file. Try again.");
}

export function EditableFile({ file, onClose }: { file: File; onClose: () => void }) {
  const [dirty, setDirty] = useState(false);
  return (
    <div style={{ height: "80vh" }}>
      <button
        type="button"
        onClick={() => {
          if (!dirty || confirm("Discard your changes?")) onClose();
        }}
      >
        Close
      </button>
      <FileViewer
        file={{ name: file.name, mime: file.type, source: blobSource(file) }}
        onSave={upload}
        onDirtyChange={setDirty}
      />
    </div>
  );
}
```

## Bring your own bytes

`blobSource` covers files that are already in memory. For anything else, implement `ByteSource` yourself:

- `size`: the total number of bytes.
- `read(start, end, signal)`: resolves with the bytes from `start` up to, but not including, `end` (a half-open range). The result length must be `end - start`. Reject when `signal` aborts.
- `blob(signal)`: optional. When present, the viewer uses it for whole-file reads instead of calling `read` in chunks.

The example below serves an encrypted file. `decryptRange` stands in for your own code.

```ts
import type { ByteSource } from "@anyknown/file-viewer";

declare function decryptRange(
  fileId: string,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>>;

export function encryptedSource(fileId: string, size: number): ByteSource {
  return {
    size,
    read: (start, end, signal) => decryptRange(fileId, start, end, signal),
  };
}
```

## Limits and errors

The viewer refuses files that are too large to handle in a tab. Change the thresholds with `limits`; any field you leave out keeps its value from `DEFAULT_LIMITS`.

| Field          | Default | Applies to                               |
| -------------- | ------- | ---------------------------------------- |
| `previewBytes` | 64 MiB  | Images, video, audio and PDF previews    |
| `textBytes`    | 1 MiB   | Plain text and code                      |
| `docBytes`     | 8 MiB   | Markdown and Excalidraw diagrams         |
| `projectBytes` | 1 GiB   | Image editor projects (`.comp.zip`)      |

Use `kindOf` to know, before you mount the viewer, what it will do with a file: `view` is the view kind (or `null`), `edit` is the editor kind (or `null`), and `tooLarge` is `true` when a limit stops the preview.

```ts
import { DEFAULT_LIMITS, kindOf } from "@anyknown/file-viewer";

const limits = { previewBytes: 2 * DEFAULT_LIMITS.previewBytes };

export function canPreview(file: File): boolean {
  const kind = kindOf({ name: file.name, mime: file.type, size: file.size }, limits);
  return kind.view !== null;
}
```

When something goes wrong, the viewer shows the error itself. `onError` is only for your logs: it receives a `ViewerError` whose `code` is one of the [`ViewerErrorCode`](#/api/ViewerErrorCode) values.

```tsx
import { FileViewer } from "@anyknown/file-viewer";
import type { FileRef, ViewerError } from "@anyknown/file-viewer";

export function LoggedViewer({ file }: { file: FileRef }) {
  return (
    <FileViewer file={file} onError={(e: ViewerError) => console.warn(e.code, e.message)} />
  );
}
```

## Language

`locale` is `"en"` (the default) or `"zh-TW"`. To change a few strings, pass `messages` with only the keys you want to replace. The [API page](#/api) lists every key with its English and Traditional Chinese text.

```tsx
import { FileViewer } from "@anyknown/file-viewer";
import type { FileRef } from "@anyknown/file-viewer";

export function ChineseViewer({ file }: { file: FileRef }) {
  return <FileViewer file={file} locale="zh-TW" messages={{ "common.save": "儲存副本" }} />;
}
```
