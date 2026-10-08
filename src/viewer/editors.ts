// 04 / 07 / 08 在這裡加一行 `<kind>: lazy(() => import("../<dir>/<定義元件的檔>").then((m) => ({ default: m.<Editor> })))`，
// `image` 由 v0.3 發版 commit 加。只能用 dynamic import，`scripts/check-entry-deps.mjs` 會擋靜態 import；
// 目標檔不能叫 `index.*`（宿主的 chunk 名取自目標檔名，product 的 chunks-check 拒絕 `index-*`），
// `check-entry-deps.mjs` 也會擋。
import { lazy, type ComponentType } from "react";
import type { EditorProps } from "../contract/editor";
import type { EditKind } from "../contract/formats";

export type EditorRegistry = Partial<Record<EditKind, ComponentType<EditorProps>>>;
export const editors: EditorRegistry = {
  audio: lazy(() =>
    import("../audio-editor/audio-editor").then((m) => ({ default: m.AudioEditor })),
  ),
  excalidraw: lazy(() =>
    import("../excalidraw/file-editor").then((m) => ({ default: m.ExcalidrawFileEditor })),
  ),
  video: lazy(() =>
    import("../video-editor/ui/video-editor").then((m) => ({ default: m.VideoEditor })),
  ),
};
