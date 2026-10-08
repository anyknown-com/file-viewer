# 03 viewer-core — `FileViewer`：丟進一個檔，在容器裡顯示它，能編輯的多一顆「編輯」

狀態：planned（2026-10-08，CTO）。blocker：02 contract 全部完成（型別、`kindOf`、`readBlob`、`ViewerError`、i18n、`ViewerRoot`、`Button`、`src/styles.css`）。model：Phase 01、02 sonnet；Phase 03 opus。
做完這份，04 markdown-excalidraw、05 site、07 / 08 / 10 的編輯器才有地方接。

## 判斷

- 行為來源是兩份現有程式，整理成一份：
  - storage `src/components/files/preview.tsx` 的 `Body`：依種類分成 image / video / audio / pdf / text；整檔讀成 objectURL；文字 ≤ 1 MiB 用等寬 `<pre>`；不支援顯示圖示加說明；載入中顯示 spinner（「Decrypting…」）；失敗顯示錯誤。外框（全螢幕 Dialog、檔名、下載、✕、← → 與滑動切換）歸宿主，不搬。
  - storage `docs/plans/05-dropbox-ux.md` §3「預覽」與 §4.4「預覽 modal」：≤ 64 MiB 的 image / video / audio / pdf / text / markdown 用 objectURL；其他類型顯示「無法預覽」加下載；超過 64 MiB 一律走下載；image 依原尺寸置中，超過就縮小；video / audio 用原生播放器。
  - product `packages/shell-ui/src/memory/entry-detail/entry-assets/`：`asset-body.tsx` 的 `AssetBody`（image、markdown、其他文字、pdf、其餘），`pdf-frame.tsx` 的 `PdfFrame`（讀到 Blob 才把 objectURL 指給 iframe，cleanup 時 revoke；讀不到就改顯示 `NoPreview`），`no-preview.tsx` 的 `NoPreview`（「這種檔案在這裡看不了，下載後用系統的 app 打開。」）。H2 刪掉這三個檔之前，下面兩個 product 測試保護的行為本元件都要有，所以 Phase 02 有對應的測試：
    - `pdf-frame.test.tsx`「keeps the page it shows when the same attachment is read again」：同一個檔重新 render，不重讀、不重建 objectURL。
    - `asset-body.test.tsx`「previews the next pdf after one it could not read」：前一個檔讀失敗，換下一個檔還是正常顯示。
- 「是同一個檔」以 `file.source` 的物件身分判斷，不看 `FileRef` 物件本身。宿主常在 render 裡寫 `file={{ name, mime, source }}`，這樣每次 render 都是新的 `FileRef`，但 `source` 沒變，就不重讀。宿主要換檔，就給新的 `ByteSource`。
- PDF 的 iframe **不加 `sandbox`**。storage 09 加了 `sandbox=""`，但 Chromium 在有 sandbox 的 iframe 裡不顯示 PDF。2026-10-08 用 headless Chrome 實測：同一個 `application/pdf` 的 blob URL，`sandbox=""` 的 iframe 只出現「破掉的檔案」圖示，沒有 sandbox 的那個正常開出 PDF viewer。所以 storage 現在的 PDF 預覽在 Chrome 上是壞的，H1 換上本元件就會修好。product 的 `PdfFrame` 本來就沒有 sandbox。安全靠兩件事：
  1. 交給 iframe 的 Blob 一律建成 `type: "application/pdf"`，不用宿主給的 mime。這樣瀏覽器一定用 PDF viewer 打開，不會把內容當成同源的 HTML 執行。
  2. 宿主的 CSP 只開 `frame-src blob:`（00-overview §3）。
- SVG 只放進 `<img>`，所以檔案裡的 script 不會執行。上傳的檔常常沒有 mime，而 Blob 沒有 `image/svg+xml` 型別時 `<img>` 畫不出 SVG，所以 Blob 型別用 `mimeOf(file)`（`src/contract/kinds.ts`，副檔名優先，`.svg` 得到 `image/svg+xml`）。
- 「太大」和「不支援」分開顯示。`kindOf(file, limits)` 回 `view: null` 時，看 `tooLarge`：true 就是 `too_large`，false 才是 `unsupported`（不再用無上限的 limits 呼叫第二次）。這兩種都是正常狀態，不呼叫 `onError`。`onError` 只回報真正的失敗：`read_failed`、`decode_failed`、`codec_unsupported`、`render_failed`。
- 錯誤分得比 storage 細。storage 的 `<video>` 解不了時只剩一個空白的播放器；這裡依 `MediaError.code` 分成「這個瀏覽器播不了這種格式」（`codec_unsupported`）和「檔可能壞了」（`decode_failed`），`<img>` 載入失敗是 `decode_failed`。
- 不用 `useEffect`。載入掛在 ref callback 上（React 19 會在 cleanup 時 abort 讀取並 revoke objectURL），同一個檔只會 mount 一次，靠 `key` 做到。宿主常傳 inline 的 `onError`，如果放進 ref callback 的依賴，每次 render 都會重新載入，所以 `FileViewer` 把 `onError` 存在一個 ref 裡（`onErrorRef.current = onError`），整份 plan 只有這一處在 render 時寫 ref。這個穩定的 `report` 也傳給 `ViewerRoot` 的 `onError`，編輯器經 `useRoot().report` 回報時走同一條路。
- 編輯切換點：
  - `FileViewer` 有 `onSave`，`kindOf` 回了 `edit`（第 8 步起 `kindOf` 只在 `src/viewer/editors.ts` 的 `editors` 有登錄這種 kind 時才回 `edit`），頂列才出現「編輯」。編輯器由 04 / 07 / 08 在 `editors` 加一行 `lazy(() => import(...))` 登錄，`image` 由 v0.3 發版 commit 加。有沒有登錄就是上線開關，不另外加旗標（storage 13 的 `IMAGE_EDITOR_ENABLED` 不需要了）。
  - 編輯器在同一個容器裡取代 viewer，不開新的 Dialog。
  - 編輯器開著的時候，`file` 換了編輯器也不重開：存檔時宿主會把 `file` 換成剛存好的檔，影像編輯器存完還要留在原地（storage 13 §3）。為了讓宿主知道現在在編輯（要藏「上一個 / 下一個」與下載），`FileViewerProps` 加 `onEditingChange`。
  - 編輯器區的 keydown 不往外冒，宿主的 ← → 與 Esc 處理器就收不到。
- 超過預覽上限的影片 / 音訊顯示 `too_large`，「編輯」照樣出現（00-overview §1；storage 14 §2、15 §2）。
- `.md` 與 `.excalidraw` 在 03 先當純文字顯示（storage 11 第 1 步也是這樣過渡），04 再換掉 `bodies` 裡的這兩行。
- 不做：縮放與平移、pdf.js、重試鈕、語法上色、「上一個 / 下一個」、下載。


## 契約

只加，不改 00-overview §3。符號的路徑、簽名、擁有者以 00-overview §9 為準；下面「用到 02 的符號」是這份 plan 會 import 的全部外部符號。

- `src/index.ts` 新增匯出：`FileViewer`（`src/viewer/file-viewer.tsx`，00-overview §9.4），以及 `export type { EditorProps }`（`src/contract/editor.ts`，§9.1）。
- `FileViewerProps`（02 定義，`src/contract/props.ts`）加一個欄位（第 8 步）：
  ```ts
  onEditingChange?: (editing: boolean) => void; // 按「編輯」時 true；編輯器 onClose 時 false
  ```
- `ViewerErrorCode`（02 定義，`src/contract/errors.ts`）加一個值：`"render_failed"`（第 4 步）。lazy chunk 載不到、或 body / 編輯器在 render 時丟錯，都用這個 code。字串是 `error.render_failed`（`src/i18n/en.ts`、`src/i18n/zh-tw.ts`，第 4 步加）。
- `EditorProps`，新檔 `src/contract/editor.ts`（第 8 步）。每個編輯器的 props 都是它，subpath 單獨匯出的編輯器也用它；`VideoEditorProps`、`AudioEditorProps`、`ImageEditorProps` 只是別名：
  ```ts
  import type { AssetProvider, CommonProps } from "./props";
  import type { SaveHandler } from "./save";
  export type EditorProps = CommonProps & {
    onSave: SaveHandler;
    onClose: () => void;              // 取消，或存完要回 viewer；dirty 時由編輯器自己先問「放棄修改？」
    onDirtyChange?: (dirty: boolean) => void;
    maxOutputBytes?: number;
    assets?: AssetProvider;
  };
  ```
  `CommonProps` 帶 `file`、`locale`、`messages`、`theme`、`limits`、`onError`；`file` 只在 mount 時讀一次，之後 `file` 換了，編輯器不用理。
- 編輯器登錄表，新檔 `src/viewer/editors.ts`（第 8 步，空表）：
  ```ts
  export type EditorRegistry = Partial<Record<EditKind, ComponentType<EditorProps>>>;
  export const editors: EditorRegistry = {}; // 04 / 07 / 08 / v0.3 發版 commit 各加一行：<kind>: lazy(() => import("../<dir>/index").then((m) => ({ default: m.<Editor> })))
  ```
- body 的介面，`src/viewer/bodies.tsx`（第 5 步）。04 P01-4 換掉 markdown、P02-3 換掉 excalidraw 那兩行，10 第 9 步加 `comp`：
  ```ts
  export type Loaded = { blob: Blob; url: string | null; text: string | null }; // 定義在 src/viewer/load.ts（第 3 步）
  export type BodyProps = { file: FileRef; loaded: Loaded; fail: (e: ViewerError) => void; viewer: FileViewerProps };
  export const bodies: Record<ViewKind, ComponentType<BodyProps>>;
  ```
  body 要字串時自己呼叫 `useT(...)`，不從 props 收 `m`。
- 宿主換檔與編輯的規則（寫進 05 的 API 頁）：
  - 換檔就給新的 `source`。同一個 `source` 配新的 `FileRef` 物件，不會重讀。
  - 編輯中（`onEditingChange(true)` 到 `false` 之間），只能把 `file` 換成剛存好的那個檔；編輯器不會重開，回到 viewer 時才顯示目前的 `file`。
  - 編輯中，宿主要藏起或停用自己的「上一個 / 下一個」與下載。
- i18n：`viewer.*` 的表在 `src/viewer/messages.ts`（`ViewerKey`、`ViewerMessages`、`viewerMessages: MessageTable<ViewerKey>`；第 4 步），同一個 commit 在 `src/i18n/messages.ts` 的 `Messages` 加 `& ViewerMessages`（`import type`）。只有三個 key：

| key | en | zh-TW |
| --- | --- | --- |
| `viewer.loading` | Loading… | 載入中… |
| `viewer.downloadHint` | Download it and open it with an app on your device. | 下載後用裝置上的 app 打開。 |
| `viewer.back` | Back | 返回 |

  其他字串都用 02 的：標題查 `error.<code>`（`unsupported`、`too_large`、`read_failed`、`decode_failed`、`codec_unsupported`，以及 03 加的 `render_failed`），「編輯」用 `common.edit`。宿主沒有下載鍵時，可以把 `viewer.downloadHint` 覆寫成 `""`，那一行就不顯示。storage 把 `viewer.loading` 覆寫成「Decrypting… / 解密中…」。

- 用到 02 的符號（路徑與簽名照 00-overview §9.1–§9.3，都從擁有的檔 import，不從 `src/index.ts`）：
  - `kindOf(file: FileInfo, limits?: Partial<Limits>): KindResult`、`mimeOf(file): string`（`src/contract/kinds.ts`）。
  - `readBlob(source: ByteSource, opts: { type: string; signal?: AbortSignal }): Promise<Blob>`（`src/contract/byte-source.ts`）：讀錯包成 `read_failed`，中止原樣丟。
  - `bytesSource(bytes: Uint8Array<ArrayBuffer>): ByteSource`（`src/contract/byte-source.ts`，測試用）。
  - `ViewerError`（`new ViewerError(code, { message?, cause? })`）、`toViewerError(e: unknown, code: ViewerErrorCode): ViewerError`、`isAbortError(e: unknown): boolean`（`src/contract/errors.ts`）。
  - `resolveLimits`（`src/contract/limits.ts`）只在測試裡用。
  - `ViewerRoot(props: Omit<CommonProps, "file"> & { className?: string; children: ReactNode })`（`src/primitives/root.tsx`）：畫 `.fv-root`（加上 `className`）、`data-theme`、`lang`、`.fv-portal`；巢狀時直接渲染 children。
  - `useT<K extends string>(table: MessageTable<K>): (key: K, vars?: Vars) => string`（`src/i18n/use-t.ts`），只能在 `ViewerRoot` 裡面呼叫。`commonMessages`（`src/i18n/messages.ts`，表 `MessageTable<CommonKey>`）、`MessageTable`（同檔）。
  - `Button(props: ComponentProps<"button"> & { variant?; icon? })`（`src/primitives/button.tsx`）、`Spinner(props: { label: string })`（`src/primitives/spinner.tsx`）、`FileIcon`、`AlertIcon`（`src/primitives/glyphs.tsx`，`(props: { size?: "sm" | "md" | "lg"; label?: string })`）。
  - 型別（`import type`）：`ByteSource`、`FileRef`（`src/contract/byte-source.ts`）；`ViewKind`、`EditKind`（`src/contract/formats.ts`）；`FileInfo`、`KindResult`（`src/contract/kinds.ts`）；`Limits`（`src/contract/limits.ts`）；`SaveHandler`（`src/contract/save.ts`）；`ViewerErrorCode`（`src/contract/errors.ts`）；`CommonProps`、`FileViewerProps`、`AssetProvider`（`src/contract/props.ts`）。
- 宿主要做的事（寫進宿主自己的 plan，不在這份 plan 的 step 裡）：
  - H1（storage 22 Phase 1）：`preview.tsx` 的 `Body` 換成 `<FileViewer theme="dark" messages={{ "viewer.loading": t("preview.decrypting") }} …>`。`previewKind` 改用 `kindOf`。編輯中藏起 ← →。拿掉 PDF 的 `sandbox=""`（本元件已處理）。
  - H2（product）：`AssetBody` 換成 `FileViewer`。容器要給高度（原本 image 與 pdf 是 `70vh`）。`PdfFrame` / `NoPreview` 和它們的測試一起刪掉（行為已由本 plan 的測試接手）。


## 形式

- `FileViewer` 撐滿宿主給的容器（`block-size: 100%`），由上到下是：
  - 頂列 `.fv-bar`：只有「編輯」可用時才畫出來，按鈕靠右。不放檔名，檔名是宿主的事。
  - 舞台 `.fv-stage`：內容置中，超出就在舞台裡捲動。
- image：依原尺寸置中，比容器大就等比縮小，不放大。圓角 `--ak-radius-md`。
- video：原生播放器，`controls`、`playsInline`、`preload="metadata"`，在容器裡等比縮放。audio：原生播放器，寬度是 `min(100%, 480px)`。
- pdf：iframe 填滿舞台，用瀏覽器內建的 viewer。底色 `--ak-layer3`，圓角 `--ak-radius-md`。
- text（03 時也包含 markdown 與 excalidraw）：置中的面板，最寬 `80ch`，可捲動。`--ak-font-mono`、`--ak-type-t2`、`white-space: pre-wrap`、`overflow-wrap: anywhere`。底色 `--ak-surface`，padding `--ak-space-lg`。
- 狀態面板 `.fv-status`：在舞台正中，上下排著圖示（40px）、標題、提示（`--ak-text-muted`、`--ak-type-t2`）。
  - 載入中：spinner。延遲 200 ms 才淡入（用 CSS `animation-delay`，不用 JS timer），讀得快的檔不會閃一下。`prefers-reduced-motion` 時 spinner 不轉。
  - 不支援 / 太大：檔案圖示。
  - 失敗：警示圖示，顏色用 `--ak-danger`。
  - 動畫曲線用 `--ak-motion-ease-out`（沒有回彈）。
- 編輯中：頂列與舞台換成編輯器，編輯器占滿整個 `FileViewer`。編輯器 chunk 還在載入時，顯示同一個載入狀態。編輯器載不到時，顯示 `render_failed` 加一顆「返回」。


## Phase 01 — 種類判斷、載入

blocker：02 完成。model：sonnet。步驟編號從 2 開始：原本的第 1 步（整檔讀取）已刪，改用 02 的 `readBlob`；編號不重排，因為 00-overview §9 與其他 plan 都用第 3、4、5、6、8、9 步來指這份 plan。

2. **種類判斷**。新檔 `src/viewer/resolve.ts`：
   - 型別：
     ```ts
     export type Resolved =
       | { status: "view"; view: ViewKind; edit: EditKind | null }
       | { status: "too_large"; edit: EditKind | null }
       | { status: "unsupported"; edit: EditKind | null };
     export function resolve(file: FileRef, limits?: Partial<Limits>): Resolved;
     ```
   - 流程：只呼叫一次 `const k = kindOf({ name: file.name, mime: file.mime, size: file.source.size }, limits)`。
     1. `k.view` 不是 null，回 `{ status: "view", view: k.view, edit: k.edit }`。
     2. `k.tooLarge` 是 true，回 `{ status: "too_large", edit: k.edit }`。
     3. 其他回 `{ status: "unsupported", edit: k.edit }`。
   - 匯入：`kindOf` 從 `src/contract/kinds.ts`；`FileRef` 用 `import type` 從 `src/contract/byte-source.ts`；`ViewKind`、`EditKind` 用 `import type` 從 `src/contract/formats.ts`；`Limits` 用 `import type` 從 `src/contract/limits.ts`。
   - 測試 `src/viewer/resolve.test.ts`。source 用 `{ size, read: () => { throw new Error("read called"); } }` 這種只有 `size` 的假 source（型別 `ByteSource`）：
     - `a.png`，10 B → `status: "view"`、`view: "image"`。
     - `a.png`，65 MiB → `too_large`。
     - `notes.txt`，2 MiB → `too_large`。
     - `notes.txt`，2 MiB，`limits: { textBytes: 4 * 1024 * 1024 }` → `view` / `text`。
     - `a.zip`，1 KiB → `unsupported`。
     - `clip.mp4`，100 MiB → `too_large`，而且 `edit` 等於 `kindOf({ name: "clip.mp4", size: 100 * 1024 * 1024 }).edit`（這一步 `editors` 還不存在，所以只檢查 `edit` 是原樣帶過來的）。
     - 以上每個案例都沒有呼叫 `read`（`read` 一被呼叫就 throw，測試會失敗）。
   - verify：`pnpm test src/viewer/resolve.test.ts && pnpm check`
   - commit：`feat(viewer-core): tell too-large files apart from unsupported ones`

3. **載入**。新檔 `src/viewer/load.ts`：
   - 型別：
     ```ts
     export type Loaded = { blob: Blob; url: string | null; text: string | null };
     export async function load(view: ViewKind, file: FileRef, signal: AbortSignal): Promise<Loaded>;
     ```
   - 流程：
     1. `blob = await readBlob(file.source, { type: view === "pdf" ? "application/pdf" : mimeOf(file), signal })`。`mimeOf` 依副檔名優先，所以沒有 mime 的 `.svg` 得到 `image/svg+xml`；pdf 一律用 `application/pdf`，不用宿主給的 mime（判斷段第一個 PDF 條件）。
     2. `view` 是 `"text"`、`"markdown"` 或 `"excalidraw"` 時，`text = await blob.text()`，`url = null`。
     3. 其他種類時，先 `signal.throwIfAborted()`，再 `url = URL.createObjectURL(blob)`，`text = null`。
   - 錯誤（整段包在 try/catch 裡）：
     - `signal.aborted` 或 `isAbortError(err)` 時，原樣 rethrow。
     - 錯誤已經是 `ViewerError` 時，原樣 rethrow（`readBlob` 已把讀錯包成 `read_failed`）。
     - 其他錯誤（例如 `blob.text()` 失敗）丟 `toViewerError(err, "read_failed")`。
   - 匯入：`readBlob` 從 `src/contract/byte-source.ts`；`mimeOf` 從 `src/contract/kinds.ts`；`ViewerError`、`toViewerError`、`isAbortError` 從 `src/contract/errors.ts`；`FileRef` 用 `import type` 從 `src/contract/byte-source.ts`；`ViewKind` 用 `import type` 從 `src/contract/formats.ts`。
   - 測試 `src/viewer/load.test.ts`（`vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x")`；source 用 `bytesSource(new TextEncoder().encode(…))`，`src/contract/byte-source.ts`）：
     - `text` 種類，內容是 UTF-8 的 `"héllo 你好"`：`text` 正確，`url` 是 null，`createObjectURL` 沒被呼叫。
     - `markdown` 與 `excalidraw` 種類：也回 `text`。
     - `image` 種類，檔名 `a.png`：`url === "blob:x"`，`text` 是 null，`createObjectURL` 收到的 Blob 的 `type` 是 `image/png`。
     - `image` 種類，檔名 `LOGO.SVG`、沒有 mime：`createObjectURL` 收到的 Blob 的 `type` 是 `image/svg+xml`。
     - `pdf` 種類，`file.mime` 是 `"application/octet-stream"`：`createObjectURL` 收到的 Blob 的 `type` 是 `application/pdf`。
     - source 的 `read` reject 一般的 `Error("404")`：`load` reject 的是 `ViewerError`，`code` 是 `read_failed`。
     - source 的 `read` reject `new ViewerError("decode_failed")`：原樣 rethrow（同一個物件）。
     - 開始前就 abort（`AbortController` 先 `abort()`）：reject，`createObjectURL` 沒被呼叫。
   - verify：`pnpm test src/viewer/load.test.ts && pnpm check`
   - commit：`feat(viewer-core): load a file as an object URL or as text`

phase 結尾的 verify：`pnpm test src/viewer && pnpm check`

## Phase 02 — 檢視：狀態面板、各種 body、`FileViewer`

blocker：Phase 01。model：sonnet。

4. **狀態面板、i18n key、錯誤碼、樣式**。
   - `src/contract/errors.ts` 的 `ViewerErrorCode` 加 `"render_failed"`。
   - `src/i18n/en.ts` 加 `"error.render_failed": "Something went wrong while showing this file."`；`src/i18n/zh-tw.ts` 加 `"error.render_failed": "顯示這個檔案時出了問題。"`。（`en` 用 `satisfies … Record<\`error.${ViewerErrorCode}\`, string>`，漏加會是型別錯誤。）02 的 `src/i18n/messages.test.ts` 若有逐一列出 `ViewerErrorCode` 的案例，把 `render_failed` 加進去。
   - 新檔 `src/viewer/messages.ts`：`export type ViewerKey = "viewer.loading" | "viewer.downloadHint" | "viewer.back"`；`export type ViewerMessages = Record<ViewerKey, string>`；`export const viewerMessages: MessageTable<ViewerKey> = { en: {…}, "zh-TW": {…} }`，字串照「契約」i18n 表。`MessageTable` 用 `import type` 從 `src/i18n/messages.ts`。
   - `src/i18n/messages.ts` 的 `Messages` 加 `& ViewerMessages`（`import type { ViewerMessages } from "../viewer/messages"`）。
   - 新檔 `src/viewer/status.tsx`：
     ```ts
     export type StatusKind = "loading" | ViewerErrorCode; // unsupported、too_large 也是 ViewerErrorCode
     export function Status(props: { kind: StatusKind; children?: ReactNode }): JSX.Element;
     ```
     - 在元件裡 `const tv = useT(viewerMessages)`、`const tc = useT(commonMessages)`（`useT` 從 `src/i18n/use-t.ts`；`commonMessages` 從 `src/i18n/messages.ts`）。所以 `Status` 一定要在 `ViewerRoot` 裡面。
     - 標題：`kind === "loading"` 時是 `tv("viewer.loading")`，其他是 `tc(\`error.${kind}\`)`。
     - 提示：`loading` 以外都顯示 `tv("viewer.downloadHint")`；字串是空的就不畫那個 `<p>`。
     - 圖示：`loading` 用 `<Spinner label={tv("viewer.loading")} />`（`src/primitives/spinner.tsx`）；`unsupported`、`too_large` 用 `<FileIcon size="lg" />`；其餘用 `<AlertIcon size="lg" />`（`src/primitives/glyphs.tsx`）。
     - 根元素：`<div className="fv-status" data-tone={"busy" | "info" | "error"}>`。`loading` 是 busy，`unsupported` 與 `too_large` 是 info，其餘是 error。error 加 `role="alert"`，info 加 `role="status"`；busy 不加 role（`Spinner` 自己是 `role="status"`）。`children` 畫在提示下面，編輯器載入失敗時的「返回」鈕放在這裡。
   - `src/styles.css` 檔尾加段落 `/* == viewer (03) == */`。所有值都用 `--ak-*` 變數：
     - `.fv-viewer`：`display: flex; flex-direction: column; block-size: 100%; min-block-size: 0`。（顏色與字型已由 02 的 `.fv-root` 設好。）
     - `.fv-bar`：`display: flex; justify-content: flex-end; padding: var(--ak-space-sm)`。
     - `.fv-stage`：`flex: 1; min-block-size: 0; display: grid; place-items: center; overflow: auto`。
     - `.fv-image`、`.fv-video`：`max-inline-size: 100%; max-block-size: 100%; object-fit: contain`。`.fv-image` 再加 `border-radius: var(--ak-radius-md)`。
     - `.fv-audio`：`inline-size: min(100%, 480px)`。
     - `.fv-pdf`：`inline-size: 100%; block-size: 100%; border: 0; background: var(--ak-layer3); border-radius: var(--ak-radius-md)`。
     - `.fv-text`：`align-self: start; inline-size: 100%; max-inline-size: 80ch; max-block-size: 100%; overflow: auto; margin: 0 auto; padding: var(--ak-space-lg); background: var(--ak-surface); border-radius: var(--ak-radius-md); font-family: var(--ak-font-mono); font-size: var(--ak-type-t2); white-space: pre-wrap; overflow-wrap: anywhere`。
     - `.fv-status`：`display: flex; flex-direction: column; align-items: center; gap: var(--ak-space-md); text-align: center; color: var(--ak-text-muted); font-size: var(--ak-type-t2); line-height: var(--ak-type-body); padding: var(--ak-space-xl)`。
     - `.fv-status .fv-icon, .fv-status .fv-spinner`：`inline-size: 40px; block-size: 40px`（把 02 的圖示與 spinner 放大到 40 px）。
     - `.fv-status[data-tone="error"] .fv-icon`：`color: var(--ak-danger)`。
     - `.fv-status[data-tone="busy"]`：`animation: fv-appear var(--ak-motion-fast) var(--ak-motion-ease-out) 200ms both`。
     - `@keyframes fv-appear { from { opacity: 0 } }`。（`fv-spin` 已由 02 定義，不重複。）
     - `@media (prefers-reduced-motion: reduce) { .fv-status .fv-spinner { animation: none } }`。
     - `.fv-edit`：`display: flex; flex-direction: column; block-size: 100%; min-block-size: 0`。
     - 不准出現 `transform`、`filter`、`contain`（02 的規則）。
   - 測試 `src/viewer/status.test.tsx`（`afterEach(cleanup)`）。每個案例用 `<ViewerRoot locale="en">`（`src/primitives/root.tsx`）包住 `<Status>`：
     - 每個 `ViewerErrorCode`（十個）的標題文字都等於 `commonMessages.en[\`error.${code}\`]`；`loading` 的標題等於 `viewerMessages.en["viewer.loading"]`。
     - `loading` 沒有提示，`getByRole("status", { name: "Loading…" })` 找得到（`Spinner`）。
     - `read_failed` 是 `role="alert"`，`data-tone="error"`；`unsupported` 是 `role="status"`，`data-tone="info"`。
     - `render_failed` 與 `webgl_unavailable` 的標題各自是自己的 `error.<code>` 字串。
     - `<ViewerRoot messages={{ "viewer.downloadHint": "" }}>` 時不畫提示。
     - `<ViewerRoot locale="zh-TW">` 的 `unsupported` 標題是 `commonMessages["zh-TW"]["error.unsupported"]`（「這種檔案無法預覽。」），提示是「下載後用裝置上的 app 打開。」。
     - `children` 有畫出來。
     - `viewerMessages` 的 `en` 與 `"zh-TW"` key 集合相同，而且剛好 3 個。
   - verify：`pnpm test src/viewer/status.test.tsx src/i18n && pnpm check`
   - commit：`feat(viewer-core): add the loading, unsupported, too-large and error panels`

5. **各種 body**。新檔 `src/viewer/bodies.tsx`：
   - 型別：
     ```ts
     export type BodyProps = { file: FileRef; loaded: Loaded; fail: (e: ViewerError) => void; viewer: FileViewerProps };
     export const bodies: Record<ViewKind, ComponentType<BodyProps>> = {
       image: ImageBody, video: VideoBody, audio: AudioBody, pdf: PdfBody, text: TextBody,
       markdown: TextBody,   // 04 P01-4 換成 Markdown 的 body
       excalidraw: TextBody, // 04 P02-3 換成 Excalidraw 的 body
     };
     ```
     `Loaded` 用 `import type` 從 `src/viewer/load.ts` 匯入。（`ViewKind` 還沒有 `"comp"`；10 第 9 步加 `"comp"` 時會同時加 `bodies.comp`。）
   - `ImageBody`：`<img className="fv-image" src={loaded.url} alt={file.name} decoding="async" onError={() => fail(new ViewerError("decode_failed"))} />`。
   - `VideoBody`：`<video className="fv-video" src={loaded.url} controls playsInline preload="metadata" onError={(e) => fail(mediaError(e.currentTarget))} />`。
   - `AudioBody`：`<audio className="fv-audio" src={loaded.url} controls preload="metadata" onError={(e) => fail(mediaError(e.currentTarget))} />`。
   - video 與 audio 共用 `mediaError(el: HTMLMediaElement): ViewerError`：`el.error?.code === 4` 時是 `new ViewerError("codec_unsupported")`，其他情況是 `new ViewerError("decode_failed")`。4 是 `MEDIA_ERR_SRC_NOT_SUPPORTED`；jsdom 沒有 `MediaError`，所以直接寫常數 4 並加註解。
   - 檔頭加 `/* oxlint-disable jsx-a11y/media-has-caption -- user files have no caption tracks. */`。
   - `PdfBody`：`<iframe className="fv-pdf" src={loaded.url} title={file.name} />`，不加 `sandbox`。前一行加 `// oxlint-disable-next-line react/iframe-missing-sandbox -- Chromium will not show a PDF in a sandboxed frame; the blob is always typed application/pdf (see load.ts).`
   - `TextBody`：`<pre className="fv-text">{loaded.text}</pre>`。
   - 匯入：`ViewerError` 從 `src/contract/errors.ts`；`FileRef` 用 `import type` 從 `src/contract/byte-source.ts`；`ViewKind` 用 `import type` 從 `src/contract/formats.ts`；`FileViewerProps` 用 `import type` 從 `src/contract/props.ts`。
   - 測試 `src/viewer/bodies.test.tsx`（`@testing-library/react`，`afterEach(cleanup)`，`fail` 用 `vi.fn()`，`viewer` 傳 `{ file }`）：
     - `ImageBody`：`alt` 是檔名；`fireEvent.error(img)` 後 `fail` 收到 `code === "decode_failed"`。
     - `VideoBody`：有 `controls`、`playsinline`、`preload="metadata"`。`Object.defineProperty(video, "error", { value: { code: 4 } })` 後 `fireEvent.error`，收到 `codec_unsupported`；code 3 時收到 `decode_failed`。
     - `AudioBody`：code 4 與 code 3 對應的結果跟 `VideoBody` 一樣。
     - `PdfBody`：沒有 `sandbox` 屬性，`title` 是檔名，`src` 是 `loaded.url`。
     - `TextBody`：`<pre>` 的內容等於 `loaded.text`。
     - `Object.keys(bodies).sort()` 恰好是 `["audio", "excalidraw", "image", "markdown", "pdf", "text", "video"]`；`bodies.markdown === bodies.text`。（10 第 9 步加 `comp` 時改這個案例。）
   - verify：`pnpm test src/viewer/bodies.test.tsx && pnpm check`
   - commit：`feat(viewer-core): render images, media, pdf and text`

6. **`FileViewer`（只有檢視）**。
   - 新檔 `src/viewer/boundary.tsx`：
     ```ts
     export class Boundary extends Component<{ fallback: (error: ViewerError) => ReactNode; report: (e: ViewerError) => void; children: ReactNode }, { error: ViewerError | null }>
     ```
     - `getDerivedStateFromError(err)`：`err` 是 `ViewerError` 就用它，否則 `new ViewerError("render_failed", { cause: err })`。
     - `componentDidCatch` 呼叫 `report(this.state.error)`（`this.state.error` 不是 null 才呼叫）。
     - 有錯時畫 `fallback(error)`。`fallback` 是在 class 的 render 裡呼叫的，不能在裡面用 hook；要 hook 就回傳一個元件。
     - 這是整個套件唯一的 class component，檔頭註解說明原因：React 只有 class 能當 error boundary。
     - `ViewerError` 從 `src/contract/errors.ts` 匯入。
   - 新檔 `src/viewer/view-pane.tsx`：
     - `export function sourceKey(source: ByteSource): number`：用模組層的 `WeakMap<ByteSource, number>` 和遞增計數器發號。`FileViewer` 用它當 key。
     - `export function ViewPane(props: { file: FileRef; view: ViewKind; viewer: FileViewerProps; report: (e: ViewerError) => void })`
     - state 是 `{ status: "loading" } | { status: "ready"; loaded: Loaded } | { status: "error"; error: ViewerError }`，初始值 `loading`。
     - `fail = (e) => { setState({ status: "error", error: e }); report(e); }`
     - 載入寫在 `useCallback` 的 ref callback 裡，掛在外層 `<div className="fv-stage">`。依賴是 `[file.source, file.name, file.mime, view, report]`；ref callback 不能用到 `file` 物件本身，要在 callback 裡用這三個欄位重組 `FileRef`。流程：
       1. 建 `AbortController`。
       2. `load(view, file, signal)`（`src/viewer/load.ts`）。成功時，如果已經 abort，就 revoke 剛拿到的 url（url 不是 null 時）；否則記下 url 並 `setState(ready)`。失敗時，如果已經 abort，就什麼都不做；否則呼叫 `fail(err)`（`err` 用 `toViewerError(err, "read_failed")` 確保是 `ViewerError`）。
       3. cleanup（ref callback 回傳的函式）：`abort()`，有 url 就 `URL.revokeObjectURL(url)`。
     - 畫面：`loading` 時畫 `<Status kind="loading" />`；`error` 時畫 `<Status kind={error.code} />`；`ready` 時畫 `bodies[view]`（`src/viewer/bodies.tsx`，傳 `file`、`loaded`、`fail`、`viewer`），外面包 `<Suspense fallback={<Status kind="loading" />}>`。
     - 匯入：`load`、`Loaded` 從 `src/viewer/load.ts`；`Status` 從 `src/viewer/status.tsx`；`toViewerError`、`ViewerError` 從 `src/contract/errors.ts`；型別（`ByteSource`、`FileRef`、`ViewKind`、`FileViewerProps`）照第 5 步的路徑。
   - 新檔 `src/viewer/file-viewer.tsx`：
     - `export function FileViewer(props: FileViewerProps): JSX.Element`：
       - `const onErrorRef = useRef(props.onError); onErrorRef.current = props.onError;`
       - `const report = useCallback((e: ViewerError) => onErrorRef.current?.(e), [])`
       - 畫面：`<ViewerRoot locale={props.locale} messages={props.messages} theme={props.theme} limits={props.limits} onError={report} className="fv-viewer"><Content viewer={props} report={report} /></ViewerRoot>`（`ViewerRoot` 從 `src/primitives/root.tsx`）。
     - 同一個檔裡的內部元件 `function Content(props: { viewer: FileViewerProps; report: (e: ViewerError) => void })`，跑在 `ViewerRoot` 裡面（之後要用 `useT`）：
       - `r = resolve(props.viewer.file, props.viewer.limits)`（`src/viewer/resolve.ts`）。
       - `r.status === "view"` 時，畫 `<Boundary report={report} fallback={(e) => <div className="fv-stage"><Status kind={e.code} /></div>}>` 包住 `<ViewPane key={\`${sourceKey(file.source)}:${r.view}\`} file={file} view={r.view} viewer={props.viewer} report={report} />`。
       - `too_large` 或 `unsupported` 時，畫 `<div className="fv-stage"><Status kind={r.status} /></div>`。
     - 這一步還沒有頂列與「編輯」，第 9 步才加。
   - `src/index.ts` 加 `export { FileViewer } from "./viewer/file-viewer";`。如果 02 已經放了 `FileViewer` 的佔位匯出（`rg -n "FileViewer" src/index.ts`），換成這一行。
   - 測試 `src/viewer/file-viewer.test.tsx`（`afterEach(cleanup)`）。source 用 `bytesSource`（`src/contract/byte-source.ts`），要數 `read` 次數時 `vi.spyOn(source, "read")`；大小很大又不能被讀的 source 用 `{ size, read: vi.fn() }`；`URL.createObjectURL` / `revokeObjectURL` 用 `vi.spyOn` mock：
     - `a.txt` 內容 `"hello"`：先出現 `getByRole("status", { name: "Loading…" })`，之後 `<pre>` 的內容是 `hello`。
     - `a.png`：`img.src` 是 mock 回的 `blob:…`，`alt` 是 `a.png`；unmount 後 `revokeObjectURL` 收到同一個 url。
     - `doc.pdf`，沒有 mime：iframe 沒有 `sandbox`；`createObjectURL` 收到的 Blob 的 `type` 是 `application/pdf`。
     - `a.zip`：顯示 `commonMessages.en["error.unsupported"]` 與 `viewerMessages.en["viewer.downloadHint"]`，`read` 沒被呼叫，`onError` 沒被呼叫。
     - 2 MiB 的 `a.txt`：顯示 `error.too_large` 的字串，`read` 沒被呼叫，`onError` 沒被呼叫。
     - `read` reject：顯示 `error.read_failed` 的字串；`onError` 被呼叫 1 次，code 是 `read_failed`。接著 rerender 成另一個正常的 pdf source，iframe 出現（對應 product 的 `asset-body.test.tsx`）。
     - 同一個 `source` 包在新的 `FileRef` 物件裡 rerender：`read` 只被呼叫過一次，`createObjectURL` 只被呼叫過一次，`revokeObjectURL` 沒被呼叫（對應 product 的 `pdf-frame.test.tsx`）。
     - 每次 render 都傳新的 inline `onError`：`read` 仍然只被呼叫一次。
     - 載入中 unmount：`read` 收到的 signal 變成 aborted；`onError` 沒被呼叫。
     - source 有 `blob()`：`read` 沒被呼叫。
     - `locale="zh-TW"` 時 `getByRole("status", { name: "載入中…" })` 找得到；`messages={{ "viewer.loading": "Decrypting…" }}` 時找得到 name 為 `Decrypting…` 的 status。
     - `theme="dark"`：根元素有 class `fv-root` 與 `fv-viewer`，`data-theme="dark"`。
     - `notes.md`：先用 `<pre>` 顯示原文。
     - 把 `bodies.text` 暫時換成會 throw 的元件（`const orig = bodies.text; bodies.text = Thrower;`，`afterEach` 還原）：顯示 `error.render_failed` 的字串；`onError` 收到 `render_failed`。
   - verify：`pnpm test src/viewer/file-viewer.test.tsx && pnpm check`
   - commit：`feat(viewer-core): add FileViewer for viewing files`

7. **真瀏覽器的檢查**。新檔 `src/viewer/file-viewer.browser.test.tsx`。用 vitest browser 模式（Chromium），不 mock `URL`，fixture 在測試檔裡用 base64 或 `TextEncoder` 產生，source 用 `bytesSource`：
   - 1×1 的 PNG：`img` 載入完成，`naturalWidth === 1`。
   - 內容是 PNG 檔頭加亂碼的 `bad.png`：顯示 `commonMessages.en["error.decode_failed"]`，`onError` 收到 `decode_failed`。
   - `logo.svg`，沒有 mime，內容是 `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>window.__fvSvg=1</script><rect width="10" height="10"/></svg>`：`naturalWidth === 10`，而且 `window.__fvSvg` 是 undefined（script 沒有執行）。
   - `你好.txt`，UTF-8 的「你好，世界」：`<pre>` 的文字一字不差。
   - `junk.mp4`，內容是 1 KiB 亂碼：最後顯示 `error.decode_failed` 或 `error.codec_unsupported` 的字串其中之一（用 `expect.poll` 等，最多 5 秒）。
   - `doc.pdf`（測試裡用字串拼一個最小的單頁 PDF）：iframe 的 `src` 以 `blob:` 開頭，沒有 `sandbox` 屬性。iframe 是跨行程的 PDF viewer，內容讀不到，所以只檢查屬性。
   - 檔名規則：`*.browser.test.tsx` 由 01 的 vitest 設定分到 browser 模式。
   - verify：`pnpm test:browser src/viewer/file-viewer.browser.test.tsx && pnpm check`
   - commit：`test(viewer-core): check image, svg, text, media and pdf in a real browser`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/viewer && pnpm check`

## Phase 03 — 編輯切換點

blocker：Phase 02。model：opus。

8. **`EditorProps`、登錄表、`EditPane`、`kindOf` 只回有登錄的編輯器**。
   - 新檔 `src/contract/editor.ts`：`EditorProps` 照本檔「契約」的型別原文寫。`src/index.ts` 加 `export type { EditorProps } from "./contract/editor";`。`rg -n "export type EditorProps" src/contract/props.ts` 如果有結果（02 的舊版），刪掉那一段，用到的地方改從 `src/contract/editor.ts` import。
   - `src/contract/props.ts` 的 `FileViewerProps` 加 `onEditingChange?: (editing: boolean) => void;`，註解照「契約」寫。
   - 新檔 `src/viewer/editors.ts`：
     ```ts
     import type { ComponentType } from "react";
     import type { EditorProps } from "../contract/editor";
     import type { EditKind } from "../contract/formats";
     export type EditorRegistry = Partial<Record<EditKind, ComponentType<EditorProps>>>;
     export const editors: EditorRegistry = {};
     ```
     檔頭註解：「04 / 07 / 08 在這裡加一行 `<kind>: lazy(() => import("../<dir>/index").then((m) => ({ default: m.<Editor> })))`，`image` 由 v0.3 發版 commit 加。只能用 dynamic import，`scripts/check-entry-deps.mjs` 會擋靜態 import。」
   - 改 `src/contract/kinds.ts` 的 `kindOf`：`edit` 先照 `editKindOf(file, resolveLimits(limits))` 算，再 `editors[kind] ? kind : null`（`editors` 從 `src/viewer/editors.ts` import；`resolveLimits` 從 `src/contract/limits.ts`）。這是 contract 指向 viewer 的唯一一條依賴（00-overview §3）。`rg -n "SHIPPED_EDITORS" src` 如果有結果（02 的舊版），整個刪掉（包括 `src/contract/shipped-editors.ts`），並把 `src/contract/kinds.test.ts` 裡的 `SHIPPED_EDITORS.has(e)` 換成 `editors[e] !== undefined`。
   - 新檔 `src/contract/kinds-editors.test.ts`：
     - 檔頭 `vi.mock("../viewer/editors", () => ({ editors: {} }))`（空表）：`d.excalidraw`（1 KiB）、`a.png`、`clip.mp4`、`a.mp3`、`x.comp.zip` 的 `kindOf(...).edit` 全部是 `null`，`view` 不受影響（`a.png` 的 `view` 還是 `"image"`）。
     - 另一個檔 `src/contract/kinds-editors-registered.test.ts`，檔頭 `vi.mock("../viewer/editors", () => ({ editors: { excalidraw: () => null } }))`：`d.excalidraw` 的 `edit` 是 `"excalidraw"`；`a.png` 的 `edit` 仍是 `null`。
   - 新檔 `src/viewer/edit-pane.tsx`：
     ```ts
     export function EditPane(props: { Editor: ComponentType<EditorProps>; editorProps: EditorProps; report: (e: ViewerError) => void }): JSX.Element
     ```
     - 根元素是 `<div className="fv-edit" onKeyDown={(e) => e.stopPropagation()}>`，鍵盤事件不會冒到宿主。
     - 裡面是 `<Boundary report={report} fallback={(e) => <EditFailure error={e} onClose={editorProps.onClose} />}>`（`src/viewer/boundary.tsx`）包住 `<Suspense fallback={<div className="fv-stage"><Status kind="loading" /></div>}><Editor {...editorProps} /></Suspense>`。
     - 同檔的 `function EditFailure(props: { error: ViewerError; onClose: () => void })`：`const tv = useT(viewerMessages)`，畫 `<div className="fv-stage"><Status kind={error.code}><Button onClick={onClose}>{tv("viewer.back")}</Button></Status></div>`。
     - 匯入：`Status` 從 `src/viewer/status.tsx`；`viewerMessages` 從 `src/viewer/messages.ts`；`useT` 從 `src/i18n/use-t.ts`；`Button` 從 `src/primitives/button.tsx`；`EditorProps` 從 `src/contract/editor.ts`。
   - 測試 `src/viewer/edit-pane.test.tsx`（每個案例包在 `<ViewerRoot>` 裡）：
     - 同步的假 Editor：畫出來了，收到的 props 跟 `editorProps` 是同一組值。
     - `lazy(() => new Promise(() => {}))`：顯示 `getByRole("status", { name: "Loading…" })`。
     - `lazy(() => Promise.reject(new Error("chunk")))`：顯示 `error.render_failed` 的字串加「Back」鈕；`report` 收到 `render_failed`；按「Back」會呼叫 `onClose`。
     - render 時 throw 的 Editor：結果同上一條。
     - 包在 `<div onKeyDown={spy}>` 裡，對 Editor 裡的 `<input>` 觸發 `fireEvent.keyDown(input, { key: "ArrowRight" })` 與 `{ key: "Escape" }`：`spy` 沒被呼叫。
   - verify：`pnpm test src/contract src/viewer/edit-pane.test.tsx && pnpm check`
   - commit：`feat(viewer-core): add EditorProps, the editor registry, the editor pane, and registry-gated edit kinds`

9. **`FileViewer` 接上「編輯」**。
   - 新檔 `src/viewer/edit-bar.tsx`：`export function EditBar(props: { onEdit: () => void }): JSX.Element`，畫 `<div className="fv-bar"><Button onClick={onEdit}>{tc("common.edit")}</Button></div>`，`const tc = useT(commonMessages)`。
   - 改 `src/viewer/file-viewer.tsx` 的 `Content`（第 6 步建立；`FileViewer` 本身不動）加上編輯模式：
     - 可不可以編輯：`r.edit`（`resolve` 的結果）不是 null，`props.viewer.onSave` 有給，而且 `editors[r.edit]`（`src/viewer/editors.ts`）存在，才算可以編輯；這時那個編輯器元件記作 `Editor`。
     - state：`const [editing, setEditing] = useState(false)`。
     - 頂列：檢視模式下可以編輯時，在舞台上方畫 `<EditBar onEdit={open} />`（`src/viewer/edit-bar.tsx`）。三種狀態都會出現：`view`、`too_large`、`unsupported`。`unsupported` 照理不會有 `edit`，但不特別擋。
     - `open`：`setEditing(true)`，再呼叫 `props.viewer.onEditingChange?.(true)`。
     - `close`：`setEditing(false)`，再呼叫 `props.viewer.onEditingChange?.(false)` 與 `props.viewer.onDirtyChange?.(false)`。
     - 編輯模式：`editing && Editor` 時，只畫 `<EditPane Editor={Editor} editorProps={…} report={report} />`（`src/viewer/edit-pane.tsx`）。不畫頂列，也不畫 `ViewPane`。
       - `editorProps` = `{ file: props.viewer.file, locale, messages, theme, limits, onError: report, onSave, onClose: close, onDirtyChange: props.viewer.onDirtyChange, maxOutputBytes: props.viewer.editor?.maxOutputBytes, assets: props.viewer.editor?.assets }`（`locale`、`messages`、`theme`、`limits` 都取自 `props.viewer`）。
       - `EditPane` 不加 key，所以 `file` 換了，編輯器也不會重新 mount。
     - 回到檢視：照常算 `resolve(props.viewer.file, props.viewer.limits)`，`ViewPane` 的 key 用目前的 `file.source`，所以會顯示宿主最新給的檔。
     - 編輯器在 `FileViewer` 的 `ViewerRoot` 裡面，自己的 `ViewerRoot` 是巢狀，不會多包一層。
   - 測試 `src/viewer/file-viewer-edit.test.tsx`（`afterEach(cleanup)`）：
     - 用 `vi.mock("./editors", () => ({ editors: { excalidraw: FakeEditor, video: FakeEditor } }))` 換掉登錄表（`kindOf` 也會看到這個表，因為 `src/contract/kinds.ts` import 的是同一個模組）。
     - `FakeEditor` 是測試裡的元件：每次 mount 計數加一；畫出 `file.name`；有三顆按鈕，分別呼叫 `onSave(req)`、`onDirtyChange(true)`、`onClose()`；還有一個 `<input>`。
     - 案例：
       - `d.excalidraw`，沒有 `onSave`：沒有「Edit」鈕。
       - `d.excalidraw`，有 `onSave`：有「Edit」鈕。
       - `a.png`，有 `onSave`（登錄表沒有 image，`kindOf` 回 `edit: null`）：沒有「Edit」鈕。
       - 按「Edit」：`onEditingChange(true)`；`FakeEditor` 畫出 `d.excalidraw`；`<pre>` 不見了。
       - 編輯器呼叫 `onDirtyChange(true)`：宿主的 `onDirtyChange` 收到 true。
       - 編輯器呼叫 `onClose`：宿主依序收到 `onEditingChange(false)` 與 `onDirtyChange(false)`；`<pre>` 回來了，「Edit」鈕回來了。
       - 宿主的 `onSave` 裡 `rerender` 成新的 `source`（內容 `"v2"`）：`FakeEditor` 的 mount 次數還是 1；接著 `onClose` 後 `<pre>` 是 `v2`。
       - 100 MiB 的 `clip.mp4`（`{ size, read: vi.fn() }`），有 `onSave`：顯示 `error.too_large` 的字串，而且有「Edit」鈕；按下去 `FakeEditor` 出現。
       - 編輯中，外層 `<div onKeyDown={spy}>` 收不到 `FakeEditor` 的 `<input>` 的 `ArrowLeft`。
       - 按「Edit」前後，`onSave` 都沒有被 `FileViewer` 自己呼叫。
   - verify：`pnpm test src/viewer/file-viewer-edit.test.tsx && pnpm check`
   - commit：`feat(viewer-core): switch FileViewer to a registered editor and back`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/viewer && pnpm build && pnpm check`

## 之後再做

- 圖片的縮放、平移、旋轉。
- 用 pdf.js 取代 iframe（Android Chrome 的 iframe 不顯示 PDF，iOS 只顯示第一頁；00-overview §5 已列）。
- 載入失敗時的「重試」鈕。
- 文字檔語法上色，以及 UTF-8 以外的編碼（Big5、UTF-16）。
- 窄螢幕或沒有 WebCodecs 時，「編輯」改成說明 tooltip：由 07 在 `VideoEditor` 裡自己顯示說明，不改登錄表。
- `.comp.zip` 的預覽圖：由 10 加 body 與種類。
- 「編輯」的鍵盤快捷鍵。
