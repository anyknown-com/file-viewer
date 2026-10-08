# 10 image-editor — 圖層式影像編輯器的核心：文件、WebGL2 合成、24 種混合模式、遮色片、變形、undo、存檔匯出、`.comp.zip` 預覽

狀態：planned（2026-10-08）；blocker：02 contract（P02-1–P02-4 契約、P03-1–P03-3 i18n 與 `ViewerRoot`、P04-1–P04-5 基本元件）、03 viewer-core（第 3 步 `src/viewer/load.ts`、第 5 步 `src/viewer/bodies.tsx`、第 8 步 `src/contract/editor.ts` 的 `EditorProps`）、09 comp-format（`src/comp/index.ts` 的讀寫、PNG 編解碼、manifest 型別）；model：Phase 01–03 opus，Phase 04 sonnet；push：整份做完一次。11、12、13 的 blocker 是本份 Phase 01（第 1 到 3 步），那三步定下的介面寫在「契約 / 擴充介面」，之後只加不改；12、13 的 Phase 03 另等第 4 步（圖層面板、屬性欄）；11 的選單與圖層面板測試等第 4 步、移動選取像素（P01-5）等第 5 步（移動工具）。
來源：storage `docs/plans/13-image-editor.md`（2026-10-05 版，設計與選型照搬）。宿主段落（`EditorHost`、`save-file`、`edit-kind`、`editedName`、上傳、trash、toast、`files.reader`）歸 H1 storage 22 Phase 3，列在本文末「宿主要做」。

## 判斷

照搬 storage 13 的部分（不重開）：

- 品質標竿是 Compositor（github.com/robbietilton/Compositor，MIT，`main` @11d8d7a）。v1 範圍 = storage 13 §2 的五份一起：本份（圖層與資料夾、24 種混合模式、不透明度、圖層 / 資料夾遮色片、剪裁遮色片、不破壞的移動 / 縮放 / 旋轉 / 翻轉、裁切、畫布尺寸、影像尺寸、undo、存檔與匯出）加 09、11、12、13。
- GPU 用 WebGL2，GL 呼叫都包在 `src/image-editor/engine/gl/`，之後換 WebGPU 時轉 WGSL。合成的演算法照 Compositor 的 `IO/ImageExporter.swift`、`Rendering/LiveMaskRenderer.swift`：資料夾一律 pass-through；剪裁串（底 B 不是調整圖層、沒有 `maskSourceID`；緊接在 B 上面、同一個父資料夾、`maskSourceID == B` 的連續圖層）由底一起畫；調整圖層作用在下面已合成的全部；效果畫在遮色片之後；`coverage(S)` 不管 S 可不可見，鏈最多 256 層、有環當沒有。完整的虛擬碼見「契約 / 合成規則」。
- 混合模式 24 種，名字與順序照 Compositor `Document/LayerAppearance.swift`。W3C Compositing and Blending Level 1 有的 15 種照 W3C（非分離的四種用它的 `SetLum` / `SetSat`），Soft Light 改用 Photoshop 版（b ≤ 0.5：2ab + a²(1 − 2b)；否則 2a(1 − b) + √a(2b − 1)），其餘 8 種（Linear Burn、Linear Dodge、Vivid Light、Linear Light、Pin Light、Hard Mix、Subtract、Divide）用 Photoshop 通行公式。目標是跟 Photoshop 觀感一致，不追求和 Compositor 逐 bit 相同。
- 色彩：在 sRGB 編碼值上混合。圖層 texture 是 RGBA8 直通 alpha，進 shader 轉預乘；累積 buffer 用 RGBA16F（`EXT_color_buffer_float`，沒有就試 `EXT_color_buffer_half_float`），兩個都沒有退回 RGBA8。存檔與匯出最後轉回 8-bit。
- 遮色片 R8，白顯示黑隱藏；有 `maskPlacement` 時蓋住那個矩形，沒有時蓋住圖層自己的 transform 矩形；範圍外的值照 Compositor `Document/LayerMask.swift`：取遮色片邊緣多數的那一邊（白或黑）；`maskEnabled === false` 的照存、不參與合成。
- 變形不動像素：每層的 `transform`（origin、size、順時針 `rotation`、`flipX`、`flipY`、`sampling`）在合成時算成仿射矩陣；`"Nearest"` 用 NEAREST，`"Smooth"` 與 `"High quality"` 用 LINEAR + mipmap。
- 文件 = 09 的 `Manifest` 加每層像素來源；沒改過的層留原 PNG bytes（存檔原樣寫回），改過的層以 GPU texture 為準。格式存不下的（選取、工具、縮放、面板收合、畫在遮色片上）是 session 狀態。
- undo 是快照式（同 Compositor `Document/DocumentHistory.swift`）：文件每步一份；像素以 256 × 256 塊存改前改後，只存碰到的塊；上限 100 步或 256 MB（只算 undo 持有的像素塊），超過丟最舊的。
- 大圖：每層寬高 ≤ `MAX_TEXTURE_SIZE` 且 ≤ 30,000；圖層像素加總、遮色片像素加總各 ≤ 200 MP（`matchMedia("(pointer: coarse)").matches` 為真時 50 MP）；開檔前用 09 的 `pngSize` 讀 IHDR 算總數，超過就不解碼。一般影像另外 ≤ 64 MiB（`limits.previewBytes`）且 ≤ 40 MP；`.comp.zip` ≤ 1 GiB。
- 畫面只合成視窗看得到的範圍，解析度 = 視窗 CSS 尺寸 × `min(devicePixelRatio, 2)`，上限 4 MP；中間 buffer 從池子借（最多 8 個、每個 ≤ 32 MB）。匯出原尺寸分塊合成，每塊 2048 × 2048 加上調整與效果回報的 `reach`；塊加邊超過 `MAX_TEXTURE_SIZE` 時整張一起算。
- 存檔三顆：「儲存」「另存新檔」「匯出」，分支規則見「契約 / 存檔」。存完編輯器不關。匯出與一般影像的存檔不帶 EXIF、顏色是 sRGB。
- 一般影像用 `createImageBitmap(blob, { imageOrientation: "from-image", premultiplyAlpha: "none" })` 解、直接 `texImage2D`，不經 2D canvas 讀回；PNG 圖層用 09 的 `decodePng`。不開 GIF、SVG、HEIC、RAW。
- 同源 module worker（`new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`），不用 `blob:` worker、不要求宿主放寬 CSP。
- 不用 `useEffect`：GL context、worker、overlay canvas、ResizeObserver 掛在 ref callback + cleanup；載入用 `lazy` / `Suspense`。解密後的像素只在記憶體：不寫 IndexedDB、OPFS、localStorage。卸載時 `ImageBitmap.close()`、terminate worker、`WEBGL_lose_context.loseContext()`、revoke 所有 `blob:` URL。
- 抄 Compositor 的檔頭寫 `// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, <原路徑>), MIT, Copyright (c) 2026 Wonder Assembly LLC`；只照公式重寫的（混合模式）寫公式來源，不寫成抄的。每檔 ≤ 300 行。

跟 storage 13 不同的地方（本系列的決定）：

- 輸入是 `FileRef`（`ByteSource`），不是 Blob；props 是 03 的 `EditorProps`（`ImageEditorProps` 只是別名）。字串走 02 的 i18n：本份的 key 是 `image.*`，放 `src/image-editor/messages.ts`（`imageMessages`），不寫進 `src/i18n/en.ts`、`zh-tw.ts`；錯誤訊息一律查 02 的 `error.<code>`，只有比錯誤碼更具體的說明（哪一層太大、哪一種專案錯誤）才另立 `image.open.*`。互動元件全部用 02 的 `src/primitives/`（`Button`、`Spinner`、`Tooltip`、`Slider`、`Dialog`、`ConfirmDialog`、`DiscardDialog`、`ToggleGroup`、`Select`、`NumberField`、`ContextMenu`、`Menubar`），本份不在 `src/primitives/` 加檔；本份的圖示放 `src/image-editor/glyphs.tsx`。最外層包 02 的 `ViewerRoot`，錯誤經 `useRoot().report(e)` 交給宿主的 `onError`。
- 不開全螢幕 Dialog：`ImageEditor` 撐滿宿主給的容器（00-overview §3「版面」）。窄螢幕的規則在 editor 裡：`ImageEditor` 掛上後量自己的容器寬，< 768 px 時不建 GL，只顯示說明（`image.narrow`）與「回到預覽」（`image.back`，呼叫 `onClose`），同 07。viewer 的「編輯」鈕不知道這條規則（storage 是讓鈕停用並顯示 tooltip）。
- toast 歸宿主，所以編輯器自己的提示（WebP 改存 PNG、顯示卡重置、尚未支援的調整）顯示在編輯器頂列下方的提示條 `fv-ie-notice`。
- GL 測試用 `pnpm test:browser`（headless Chromium 的真 WebGL2），取代 storage 的 dev-only 自我測試頁與 agent-browser 走查；storage 第 6 步的 e2e Story 改成 `story.browser.test.tsx`。
- `.comp.zip` 的預覽元件在本套件（`src/image-editor/comp-preview.tsx`，用 09 的 `readHead` 經 `ByteSource.read` 只讀檔頭），storage 的 `project-preview.tsx` 不做。ViewKind 加 `"comp"`（00-overview §3 只加）。
- 文件 store 用 `useSyncExternalStore` 的外部 store（工具與 worker 回呼要在 React 外讀寫文件），不用 `useReducer`。
- 擴充點用明確的 `installExtensions()` 呼叫各份的 `register*()`，不靠 side-effect import：01 的 `package.json` 是 `"sideEffects": ["**/*.css"]`，bundler 會把只為了註冊而 import 的模組刪掉。
- 為了 11–13，storage 13 §5 之外再加：`registerMenuItem`（選單與快捷鍵）、`registerLayerDecor`（圖層列縮圖、`fx` 標記、變形後重畫、⌘ 點縮圖）、`registerOverlay`（常駐的 overlay，選取虛線）、`registerPropertyPanel`（選到圖層時屬性欄的面板，12 的調整與效果面板）、`registerSelection`（選取範圍的 slot：11 填內容，10 與 12 讀）、`registerSetup`（編輯器掛上時拿到 `api` 與 `.fv-root`，11 收 `paste`）、`ToolSpec.onDeactivate`（換工具時收尾）、`readComposite`、`layerMatrix`、`snapshotTiles`、`checkBudget`、`setSession`（`renderHidden`）、`requestRender`、`selection`、`pixelSize` / `resizePixels`（查與改圖層像素尺寸，undo 經 `commit` 的第 4 個參數）、`openDialog` / `showError` / `t`（擴充的 React 掛載點、錯誤顯示、翻譯），以及給擴充直接 import 的 `insertLayer` / `removeLayers` / `patchLayer`（`src/image-editor/doc/commands/layers.ts`）、`layerMatrixOf` / `resizedTransform`（`src/image-editor/doc/layer-matrix.ts`）、`compile` / `FULLSCREEN_VS` / `drawFullscreen`（`src/image-editor/engine/gl/program.ts`）、`createTarget`（`src/image-editor/engine/gl/target.ts`）。型別與註冊在第 1 步，純函式在第 2 步，GL 與 `EditorApi` 的實作在第 3 步；畫出來的地方（屬性欄、圖層列、快捷鍵順序、移動工具）在第 4、5 步。
- 快捷鍵衝突照 Photoshop，分派順序寫死在第 4 步的 `src/image-editor/ui/shortcuts.ts`：焦點在輸入框 → 不處理；目前工具的 `onKeyDown`；有選取（`api.selection()` 不是 null）而且按的是不帶修飾鍵的 Delete / Backspace，`SelectionProvider.clear` 存在時交給它（清掉選取範圍內的像素）；選單快捷鍵（`layer.delete` 在這裡，所以沒有選取時才刪圖層）；工具鍵。移動工具（`V`，第 5 步）在有選取時把這次拖曳、按鍵、overlay 與換工具的收尾交給 `SelectionProvider.move`（移動選取範圍內的像素），沒有選取或 provider 沒給 `move` 時才變形圖層。11 只要 `registerSelection` 就接手這兩個行為，不註冊 Delete 或 `V`。
- 按需載入的檔名：product 的 chunks-check 拒絕 `index-*` 這種 chunk 名，所以 `import()` 的目標一律是有辨識度的檔名。本份的 `bodies.comp` 載入 `src/image-editor/comp-preview.tsx`；v0.3 發版 commit 登錄 `editors.image` 時寫 `lazy(() => import("../image-editor/image-editor").then((m) => ({ default: m.ImageEditor })))`，不載入 `src/image-editor/index.ts`（那是 `./image-editor` subpath 的入口，不給 `import()`）。11–13 不用 `import()`。
- `.comp.zip` 的讀檔：03 的 `load`（`src/viewer/load.ts`）碰到 view `"comp"` 不讀整檔，直接把 `ByteSource` 交給 body，本份不改 `load.ts`；`CompPreview` 用 09 的 `readHead` 經 `file.source.read` 只讀檔頭。`Limits.projectBytes` 只在進入編輯時檢查（第 7 步 `openProject` 的第 1 條）。
- LUT 類調整（8 種）由 10 的合成 shader 查表（第 3 步的 `src/image-editor/engine/gl/composite.glsl.ts`）：12 的 `lut` 回已上傳的 texture，10 負責取樣；`pass` 類（4 種）由 12 自己畫。
- PNG 編碼一律走 worker 的 `encodePng` job（第 1 步）：存檔流程（第 8 步）把每個像素來源是 `"gpu"` 的層讀回、經這個 job 編成 PNG；背景快取（第 10 步）同一個 job；11 的剪貼簿直接呼叫它。13 只用 `writeRegion` 寫像素，不自己編 PNG。
- storage 的「一列一列編 PNG」不做：匯出與預覽圖的畫布上限 100 MP（Compositor 的來源像素總上限），整張讀回後交給 `encodePng`；超過就不給匯出並說明。串流編碼放「之後再做」。
- 沒有釋出閘門旗標。00-overview §3「編輯器開關」只有 `src/viewer/editors.ts` 的 `editors`：`image` 由 v0.3 發版的 commit（主 agent，在 11、12、13 都驗收後）登錄，本份任何一步都不登錄、不改 `editors.ts`。能不能編輯照 02 的 `editKindOf`（`src/contract/kinds.ts`：副檔名在 `EDITABLE_IMAGE_EXT` 且 ≤ `previewBytes`；`.comp.zip` 且 ≤ `Limits.projectBytes`），本份不改 `edit` 的規則。`./image-editor` subpath 照常可以直接用；`.comp.zip` 的檔頭預覽（`ViewKind` `"comp"`）不受開關影響。
- 進入 / 離開編輯的通知是 03 的 `FileViewerProps.onEditingChange`，本份不另加進入 / 離開編輯的回呼。
- 11–13 的工具與選單標籤是它們自己區域的 key（`image.select.*` 等，各在自己的 `messages.ts`），10 的外框要翻得出來，所以 `registry.ts` 多一個 `registerMessages(table)`：11–13 在自己的 `register…()` 第一行呼叫一次。跨區域翻譯的規則：交給 10 的 `MessageKey`（`ToolSpec.label`、`MenuItemSpec.label`、`dispatch` / `commit` 的 label、`showError` 的 key、`api.t`、`useLabel()`）一律用第 1 步 `src/image-editor/labels.ts` 的合併表翻：`commonMessages` → `imageMessages` → `messageTables()` 依註冊順序，同一個 key 取第一張有它的表；宿主 `messages`（`useRoot().overrides`）蓋過全部；語系是 `useRoot().locale`。擴充自己的 React 元件：自己區域的 key 用 `useT(<自己的表>)`，`common.*` / `error.*` 用 `useT(commonMessages)`，別的區域（例如 `image.layers.*`）用 `useLabel()`（第 4 步）；React 外（命令、圖層名稱）用 `api.t(key, vars)`。

## 契約

只加不改 00-overview §3。新 export 只有 `./image-editor` 的 `ImageEditor` 與 `ImageEditorProps`（第 7 步）；沒有新錯誤碼。下面的「擴充介面」是 repo 內部給 11–13 用的，不從任何 subpath 匯出。

### 公開（`src/image-editor/index.ts`，第 7 步）

```ts
import type { EditorProps } from "../contract/editor"; // 03 第 8 步
export type ImageEditorProps = EditorProps;           // file、locale、messages、theme、limits、onError、onSave、onClose、onDirtyChange?、maxOutputBytes?、assets?（本份不用 assets）
export { ImageEditor } from "./image-editor";         // ImageEditor(props: ImageEditorProps): JSX.Element
```

同一個 commit：`package.json` 的 `exports` 加 `"./image-editor": { "types": "./dist/image-editor/index.d.ts", "default": "./dist/image-editor/index.js" }`，`tsdown.config.ts` 的 `entry` 加 `"image-editor/index": "src/image-editor/index.ts"`（00-overview §4、01 的 exports 形狀）。

### §3 的增補（第 9 步）

- `src/contract/formats.ts` 的 `ViewKind` 加 `"comp"`；`src/contract/kinds.ts` 的 `formatOf` 第 1 條（檔名小寫後以 `COMP_SUFFIX` 結尾）從回 `null` 改成回 `"comp"`；`kindOf` 對 `"comp"` 不比大小（只讀檔頭），`tooLarge` 是 false。`edit` 的規則不動：02 的 `editKindOf` 已經對 ≤ `projectBytes` 的 `.comp.zip` 回 `"image"`，回不回給呼叫端由 03 的 `editors` 決定。
- 同一個 commit：`src/viewer/bodies.tsx` 的 `bodies` 加 `comp: lazy(() => import("../image-editor/comp-preview"))`。`src/viewer/load.ts` 不改：03 的 `load` 對 `"comp"` 不讀整檔，把 `ByteSource` 交給 body；`Limits.projectBytes` 只在進入編輯時由第 7 步的 `openProject` 檢查。

### 用到的外部符號（照 00-overview §9；一律從「檔案」欄的檔 import，不經 `src/index.ts`）

| 符號 | 檔案 | 簽名 | 擁有 |
| --- | --- | --- | --- |
| `ByteSource`、`FileRef`、`blobSource`、`bytesSource` | `src/contract/byte-source.ts` | `read(start, end, signal?): Promise<Uint8Array<ArrayBuffer>>`、`blob?(signal?)`；`FileRef = { name: string; mime?: string; source: ByteSource }`；`blobSource(blob: Blob): ByteSource`；`bytesSource(bytes: Uint8Array<ArrayBuffer>): ByteSource` | 02 P02-2 |
| `readBlob` | `src/contract/byte-source.ts` | `readBlob(source: ByteSource, opts: { type: string; signal?: AbortSignal }): Promise<Blob>`；讀錯包成 `read_failed`，中止原樣丟 | 02 P02-2 |
| `Limits` | `src/contract/limits.ts` | `{ previewBytes; textBytes; docBytes; projectBytes }` | 02 P02-1 |
| `ViewKind`、`COMP_SUFFIX`、`EDITABLE_IMAGE_EXT` | `src/contract/formats.ts` | §3；`COMP_SUFFIX = ".comp.zip"` | 02 P02-3（`"comp"` 由本份第 9 步加） |
| `kindOf`、`formatOf`、`extOf`、`mimeOf`、`editKindOf` | `src/contract/kinds.ts` | `extOf(name): string`（`.comp.zip` 回 `"comp.zip"`）；`mimeOf(file): string`；`formatOf(file): ViewKind \| null`；`editKindOf(file, limits: Limits): EditKind \| null` | 02 P02-3 |
| `SaveMode`、`SaveRequest`、`SaveHandler`、`splitName`、`suggestedName` | `src/contract/save.ts` | §3；`splitName(name): { stem; ext }`（`.comp.zip` 整個算副檔名）；`suggestedName(original: string, ext: string, mode: SaveMode): string` | 02 P02-4 |
| `ViewerError`、`ViewerErrorCode`、`toViewerError`、`isAbortError` | `src/contract/errors.ts` | `new ViewerError(code, { message?, cause? })`；`toViewerError(e: unknown, code: ViewerErrorCode): ViewerError`；`isAbortError(e: unknown): boolean` | 02 P02-1 |
| `EditorProps` | `src/contract/editor.ts` | `CommonProps & { onSave: SaveHandler; onClose: () => void; onDirtyChange?; maxOutputBytes?: number; assets?: AssetProvider }` | 03 第 8 步 |
| `MessageTable`、`Messages`、`Vars`、`translate`、`commonMessages` | `src/i18n/messages.ts` | `MessageTable<K> = Record<Locale, Record<K, string>>`；`translate(table, locale, overrides, key, vars?): string` | 02 P03-1 |
| `useT` | `src/i18n/use-t.ts` | `useT<K extends string>(table: MessageTable<K>): (key: K, vars?: Vars) => string` | 02 P03-3 |
| `ViewerRoot` | `src/primitives/root.tsx` | `ViewerRoot(props: Omit<CommonProps, "file"> & { className?: string; children: ReactNode })`；巢狀時直接渲染 children | 02 P03-3 |
| `useRoot` | `src/primitives/root-context.ts` | `useRoot(): { locale; overrides; limits; theme; portal: HTMLElement \| null; report(e: ViewerError): void }` | 02 P03-3 |
| 基本元件 | `src/primitives/` | 簽名照 00-overview §9.3：`Icon`、`IconSize`（`icon.tsx`）、`AlertIcon`、`FileIcon`（`glyphs.tsx`）、`Button`、`Spinner`、`Tooltip`、`Slider`、`Dialog`、`ConfirmDialog`、`DiscardDialog`（`dialog.tsx`）、`ToggleGroup`、`Select`、`NumberField`、`ContextMenu`、`Menubar`、`MenuItem`（`menu.tsx`）、`cx`（`cx.ts`） | 02 P03-3、P04-1–P04-5 |
| `bodies`、`BodyProps` | `src/viewer/bodies.tsx` | `bodies: Record<ViewKind, ComponentType<BodyProps>>`；`BodyProps = { file; loaded; fail(e: ViewerError): void; viewer }` | 03 第 5 步 |
| `load`、`Loaded` | `src/viewer/load.ts` | `load(view, file, signal, limits): Promise<Loaded>`；`Loaded = { blob: Blob; url: string \| null; text: string \| null }`；view `"comp"` 不讀檔、回空的 `Loaded`（本份不改這個檔） | 03 第 3 步 |
| `FileViewer` | `src/viewer/file-viewer.tsx` | `FileViewer(props: FileViewerProps): JSX.Element`（只在第 9 步的測試裡用） | 03 第 6 步 |
| `ProjectError`、`ProjectErrorCode` | `src/comp/index.ts` | `.code`：`not_zip`、`not_project`、`too_new`、`invalid`、`missing_asset`、`unsafe_entry`、`too_large`、`bad_png`；`.details: string[]` | 09 P01-1 |
| `PngImage`、`decodePng`、`encodePng`、`pngSize` | `src/comp/index.ts` | `PngImage = { width; height; channels: 1 \| 4; data: Uint8Array }`；`decodePng(bytes, kind: "layer" \| "mask"): PngImage`；`encodePng(image: PngImage): Uint8Array`；`pngSize(bytes): { width; height }` | 09 P02-1、P02-2 |
| `Manifest`、`LayerRecord`、`LayerTransform`、`LayerAdjustment`、`LayerEffects`、`BlendMode` | `src/comp/index.ts` | zod schema 推出的型別，欄位照 Compositor v11 | 09 P03-1–P03-3 |
| `validateLikeCompositor` | `src/comp/index.ts` | `(m: Manifest): string[]`，空陣列 = 合法 | 09 P03-4 |
| `Project`、`readProject`、`writeProject`、`fromImage` | `src/comp/index.ts` | `Project = { manifest; assets: Map<string, Uint8Array>; preview?: Uint8Array }`（`assets` 的 key 是 `"images/<ID>.png"`、`"images/<ID>.mask.png"`）；`readProject(bytes: Uint8Array): Project`；`writeProject(p: Project): Blob`；`fromImage(image: { width; height; rgba }, layerName: string): Project` | 09 P04-1 |
| `ReadRange`、`readHead` | `src/comp/index.ts` | `ReadRange = (start, end) => Promise<Uint8Array>`；`readHead(read): Promise<{ manifest; preview? } \| null>` | 09 P04-2 |

09 的 fixture：`src/comp/fixtures/ditto-project.comp.zip`（`ditto` / Finder 壓的 4×4 專案，沒有預覽圖，`readHead` 回 null）。

### 存檔（`SaveRequest` 的填法）

`stem`、`ext` 用 `src/contract/save.ts` 的 `splitName(file.name)`（`.comp.zip` 整個當一個副檔名，`a.comp.zip` → `a`）；`suggestedName` 用同檔的 `suggestedName(file.name, ext, mode)`：replace = `stem + ext`；copy / export = `` `${stem} (edited)${ext}` ``。撞名由宿主處理。本份不另寫命名函式。

| 情況 | 「儲存」 | 「另存新檔」 |
| --- | --- | --- |
| 來源是 `.comp.zip`，或本次 session 已存成專案 | `replace`，`ext ".comp.zip"`、`mime "application/zip"`、09 `writeProject` | `copy`，ext 與 mime 照左欄 |
| 來源是一般影像、文件是「平的」 | `replace`，同格式（png→`.png`；jpeg 保留原本的 `.jpg` / `.jpeg`；webp→`.webp`；avif、bmp→`.jpg` `image/jpeg`） | `copy`，ext 與 mime 照左欄 |
| 來源是一般影像、文件不是平的 | 對話框：「存成圖層專案」（預設，`copy` `.comp.zip`，成功後本 session 變成「已存成專案」）或「合併後取代原圖」（`replace`，格式規則照「平的」那一列的「儲存」） | `copy` `.comp.zip`，成功後同樣變成「已存成專案」 |

- 「平的」：只有一層、不是資料夾、沒有 `adjustment` / `maskFile` / `maskSourceID` / `effects` / `text` / `shape`、`opacity` 是 1 或沒寫、`blendMode` 是 `"Normal"` 或沒寫、`isVisible` 為 true、transform 蓋滿畫布（origin 0,0、size = 畫布、`rotation` 0、沒翻轉）。
- 「匯出」：對話框選 PNG / JPEG / WebP（JPEG、WebP 品質滑桿預設 0.92），`mode: "export"`、`` `${stem} (edited).png|.jpg|.webp` ``，不改變「目前的檔」。JPEG 鋪白底（同預覽圖）。`OffscreenCanvas.convertToBlob` 回來的 `type` 跟要的不同（Safari 的 WebP）時改存 PNG、副檔名改 `.png`，提示條說明。畫布 > 100 MP 時不給匯出；JPEG / WebP 在瀏覽器 canvas 建不出來（建 `OffscreenCanvas` 拿到 context、寫入再讀回一個像素確認）時只給 PNG 並說明。
- 「已存成專案」之後的 replace，`suggestedName` 是那次 copy 的 `suggestedName`。宿主規則（H1）：replace 永遠指本 session 最後一次 replace / copy 存成的那個檔，一開始是原檔；export 不改變它。
- 呼叫 `onSave` 前若 `blob.size > maxOutputBytes`：不呼叫，提示條顯示 `error.output_too_large` 並 `report(new ViewerError("output_too_large"))`。`onSave` reject：編輯器留在原地、保持未存，提示條顯示 `error.message`（沒有就 `error.save_failed`），`report(new ViewerError("save_failed", { cause: error }))`。replace / copy 成功後標成已存（`onDirtyChange(false)`）；export 不影響。
- 存檔中「儲存」轉 spinner，其他輸入照常；存的是按下當時的文件。

### 錯誤對應（全部用 §3 既有的碼；`ProjectError` 照 00-overview §3：`too_large` → `too_large`，其餘 → `decode_failed`）

| 情況 | 碼 | 顯示的字串 |
| --- | --- | --- |
| 容器寬 < 768 px | 不是錯誤，不 `report` | `image.narrow` |
| 拿不到 WebGL2 context | `webgl_unavailable` | `error.webgl_unavailable` |
| `readBlob` 失敗 | `read_failed` | `error.read_failed` |
| `createImageBitmap` 失敗 | `decode_failed` | `error.decode_failed` |
| 09 `ProjectError` 的 `not_zip` / `not_project` / `too_new` / `invalid` / `missing_asset` / `unsafe_entry` / `bad_png` | `decode_failed`（`cause` 是原本的 `ProjectError`） | `image.open.<code 的 camelCase>`：`notZip`、`notProject`、`tooNew`、`invalid`（`{details}` 列出 `details`）、`missingAsset`、`unsafeEntry`、`badPng` |
| 09 `ProjectError` 的 `too_large`；一般影像 > `limits.previewBytes`；`.comp.zip` > `limits.projectBytes` | `too_large` | `error.too_large` |
| 一般影像 > 40 MP、像素預算超過、某層超過 `MAX_TEXTURE_SIZE` 或 30,000 | `too_large` | `image.open.tooManyPixels` / `image.open.budget` / `image.open.layerTooLarge`（`{name}` 帶層名） |
| 輸出超過 `maxOutputBytes` | `output_too_large` | `error.output_too_large` |
| `onSave` reject | `save_failed` | `error.message`（沒有就 `error.save_failed`） |

### 擴充介面（第 1 到 3 步定下，之後只加不改）

型別在 `src/image-editor/api.ts`，註冊函式在 `src/image-editor/registry.ts`，執行時的介面由 `src/image-editor/editor-api.ts` 的 `createEditorApi` 建立。09 的型別與函式一律從 `src/comp/index.ts` 匯入（名字與簽名照上面「用到的外部符號」）。下面的區塊裡凡是 00-overview §9.7 列出的符號（註冊函式、`EditorApi` 的方法、型別、命令、GL helper、測試輔助），簽名就是 §9.7 的簽名；要改先改 §9.7。

```ts
// src/image-editor/api.ts
import type { BlendMode, LayerAdjustment, LayerRecord, Manifest } from "../comp/index"; // 09
import type { ViewerError } from "../contract/errors";                                // 02
import type { Messages, Vars } from "../i18n/messages";                               // 02；Messages 已含 & ImageMessages（第 1 步），11–13 加自己的區域
import type { ComponentType, ReactNode } from "react";
import type { JobInput, JobKind, JobOutput } from "./worker/jobs";
export type { BlendMode };                                  // 09 的 24 個字串，順序見 BLEND_MODES
export type Layer = LayerRecord;                            // 09 的 LayerRecord：id、name、isVisible、transform、imageFile?、parentID?、isGroup?、opacity?、blendMode?、maskFile?、maskEnabled?、maskSourceID?、maskPlacement?、maskLinked?、adjustment?、effects?、text?、shape?（以及 extra）
export type LayerId = string;                               // 大寫 UUID
export type AdjustmentSettings = LayerAdjustment;
export type AdjustmentKind = AdjustmentSettings["kind"];
export type MessageKey = Extract<keyof Messages, string>;   // 任何區域的 key；用 src/image-editor/labels.ts 的合併表翻譯（規則見「判斷」的跨區域翻譯）
export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Mat2D = readonly [a: number, b: number, c: number, d: number, e: number, f: number]; // x' = a x + c y + e；y' = b x + d y + f
export type PixelTarget = "image" | "mask";

export type LayerPixels =
  | { kind: "png"; bytes: Uint8Array }        // 沒改過：原 PNG，存檔原樣寫回
  | { kind: "gpu"; png?: Uint8Array };        // 改過：以 texture 為準；png 是背景編好的快取（第 10 步），存檔與 context 重建優先用
export type Doc = {
  manifest: Manifest;                          // 樹的順序（09 讀檔時已排好）
  pixels: ReadonlyMap<LayerId, { image?: LayerPixels; mask?: LayerPixels }>;
};
export type Command = (doc: Doc) => Doc;       // 純函式，src/image-editor/doc/commands/*
export type PixelTile = {                      // 256 × 256（右、下邊緣較小），圖層自己的像素座標
  layer: LayerId; target: PixelTarget; x: number; y: number; width: number; height: number;
  before: Uint8Array; after?: Uint8Array;      // RGBA8 直通 alpha（image）或 R8（mask）；after 由 commit 填
};
export type LayerResize = {                    // 改像素尺寸的 undo 紀錄：resizePixels 回傳，交給 commit 的第 4 個參數
  layer: LayerId; target: PixelTarget;
  before: { width: number; height: number; data: Uint8Array }; // 改之前整張
  after?: { width: number; height: number; data: Uint8Array }; // commit 讀回整張
};
export type Selection = {                      // 選取範圍（內容由 11 提供）：畫布大小的 R8，255 = 全選
  version: number;                             // 每次改動遞增
  texture: WebGLTexture;                       // 文件座標，寬高 = manifest.width × height，R8
  bounds: Rect;                                // 非零像素的外框（文件座標，非空）
  read(rect: Rect): Uint8Array;                // 文件座標的 R8；畫布外的部分是 0
};

export type Session = {
  active: LayerId | null;
  target: PixelTarget;                          // 「畫在遮色片上」
  tool: string;                                 // ToolSpec.id
  collapsed: ReadonlySet<LayerId>;
  renderHidden: ReadonlySet<LayerId>;           // 只影響畫面（13 編輯文字時藏那一層），不進文件、匯出照畫
};
export type ViewTransform = { zoom: number; dpr: number; docToScreen: Mat2D; screenToDoc: Mat2D }; // screen = canvas 元素的 CSS px
export type PassView = { scale: number; width: number; height: number; docFromPx: Mat2D; forExport: boolean }; // docFromPx：輸出 px → 文件座標；forExport = render 的 opts.forExport（存檔、匯出、readComposite 為 true，畫面為 false）
export type EffectTarget = { framebuffer: WebGLFramebuffer; width: number; height: number; pad: number };

export interface EditorApi {
  readonly gl: WebGL2RenderingContext;
  doc(): Doc;
  session(): Session;
  setSession(patch: Partial<Session>): void;
  dispatch(command: Command, label?: MessageKey): void;   // 有 label = 記一步 undo；沒有 = 即時預覽，不記，下一次有 label 的 dispatch / commit 從上一個記錄點算
  commit(label: MessageKey, doc: Doc, tiles: PixelTile[], resizes?: readonly LayerResize[]): void; // 像素已寫進 GPU；tiles 來自 snapshotTiles、resizes 來自 resizePixels，commit 讀回 after。undo：先寫回 tiles 的 before，再換回 resizes 的 before；redo：先換成 resizes 的 after，再寫 tiles 的 after
  snapshotTiles(id: LayerId, target: PixelTarget, rect: Rect): PixelTile[]; // 改像素之前呼叫，讀回 before
  layerTexture(id: LayerId): WebGLTexture;
  maskTexture(id: LayerId): WebGLTexture | null;
  pixelSize(id: LayerId, target: PixelTarget): Size | null; // texture 的像素尺寸；還沒有 texture（資料夾、調整圖層、還沒寫過的新層、沒有遮色片）回 null
  resizePixels(id: LayerId, target: PixelTarget, size: Size, opts?: { offset?: Point; pixels?: Uint8Array }): LayerResize; // 換成 size 大小的新 texture：有 pixels（size 大小，image RGBA8 直通 / mask R8）就整張寫入；否則舊像素放在新 texture 的 offset（預設 0,0，可為負），其餘 image 透明、mask 填舊遮色片邊緣多數的值。沒有舊 texture 時先當作 transform 大小的透明（mask 全 255）。邊長 > min(MAX_TEXTURE_SIZE, 30,000) 丟 ViewerError("too_large")；預算由呼叫端先 checkBudget。不改文件、不記 undo：呼叫端改 transform（resizedTransform、patchLayer）後把回傳值交給 commit
  writeRegion(id: LayerId, target: PixelTarget, rect: Rect, pixels: Uint8Array): void; // 圖層像素座標；image = RGBA8 直通 alpha，mask = R8
  readRegion(id: LayerId, target: PixelTarget, rect: Rect): Uint8Array;
  readComposite(rect: Rect): Uint8Array;                  // 文件座標，合併結果 RGBA8 直通 alpha（原尺寸，不受畫面縮放影響）
  layerMatrix(id: LayerId): Mat2D;                        // 文件座標 → 圖層像素座標（= layerMatrixOf(transform, pixelSize ?? transform 的大小)）
  checkBudget(add: { layerPx?: number; maskPx?: number }): ViewerError | null; // 超過回 too_large
  runInWorker<K extends JobKind>(job: { kind: K; input: JobInput<K> }, transfer?: Transferable[], signal?: AbortSignal): Promise<JobOutput<K>>;
  requestRender(): void;
  selection(): Selection | null;                          // selectionProvider()?.get(this) ?? null；沒註冊 provider 或沒有選取時 null
  openDialog(render: (close: () => void) => ReactNode): () => void; // 在編輯器自己的 React 樹裡（ViewerRoot 之內，主題、語系、宿主 messages 都生效）掛一個節點，通常是 02 的 Dialog；回傳 close
  showError(e: ViewerError, key?: MessageKey, vars?: Vars): void; // 交給宿主 onError（useRoot().report），提示條顯示 key（沒給用 `error.<code>`），直到下一次有 label 的 dispatch / commit 或下一個 showError
  t(key: MessageKey, vars?: Vars): string;                // 用合併表與目前語系、宿主 messages 翻譯（React 外用）
}

export type ToolSpec = {
  id: string; label: MessageKey; icon: ComponentType; cursor: string | ((api: EditorApi) => string);
  key: string;                                   // 單鍵（"V"）；同一鍵多個工具時 Shift + 鍵循環
  slot?: string;                                 // 工具列同一格（長按或右鍵展開）；沒給 = 自己一格
  onPointerDown?(p: Point, e: PointerEvent, api: EditorApi): void;   // p 是文件座標
  onPointerMove?(p: Point, e: PointerEvent, api: EditorApi): void;
  onPointerUp?(p: Point, e: PointerEvent, api: EditorApi): void;
  onKeyDown?(e: KeyboardEvent, api: EditorApi): boolean;            // 工具作用中的按鍵；回 true = 吃掉
  drawOverlay?(ctx: CanvasRenderingContext2D, view: ViewTransform, api: EditorApi): void;
  onDeactivate?(api: EditorApi): void;                              // session.tool 從這個工具換成別的之前呼叫一次（收尾：結束文字編輯、合併浮動像素）
  panel?: ComponentType<{ api: EditorApi }>;                        // 右上屬性欄最上面（工具選項）
};
export type SelectionProvider = {                // 11 用 registerSelection 註冊一次
  get(api: EditorApi): Selection | null;         // null = 沒有選取
  clear?(api: EditorApi): void;                  // 有選取時的 Delete / Backspace：清掉目前圖層（或遮色片）選取範圍內的像素，記一步
  move?: Pick<ToolSpec, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onKeyDown" | "drawOverlay" | "onDeactivate">; // 移動工具在有選取時改交給它：移動選取範圍內的像素
};
export type PropertyPanelSpec = {
  id: string; order?: number;                    // 屬性欄裡依 order 由上往下，排在目前工具的 panel 下面
  when(layer: Layer, api: EditorApi): boolean;   // layer = session.active 那一層；回 true 才畫
  component: ComponentType<{ api: EditorApi; layer: Layer }>; // undo / redo 後收到新的 layer
};
export type SetupFn = (api: EditorApi, root: HTMLElement) => (() => void) | void; // 每個編輯器掛上時呼叫一次；root = 編輯器的 .fv-root；回傳的函式在卸載時呼叫
export type AdjustmentHooks = {                  // lut 與 pass 擇一
  lut?(gl: WebGL2RenderingContext, s: AdjustmentSettings): { dims: 1 | 3; texture: WebGLTexture }; // 1：256×1 RGBA16F TEXTURE_2D，逐通道查；3：33³ RGBA16F TEXTURE_3D，三線性。10 的合成 shader 取樣；texture 歸 10 管理，換設定或刪層時由 10 `deleteTexture`
  pass?(gl: WebGL2RenderingContext, src: WebGLTexture, dst: WebGLFramebuffer, s: AdjustmentSettings, view: PassView): void; // src = 下面累積結果（預乘）
  reach(s: AdjustmentSettings, scale: number): number;             // 往外要幾 px（輸出 px）
};
export type EffectsHooks = {
  pass(gl: WebGL2RenderingContext, layer: Layer, src: WebGLTexture, dst: EffectTarget, view: PassView & { version: number }): void; // src = 套過自己遮色片的圖層像素；dst 四邊各多 pad；version 在該層像素改變時遞增
  reach(effects: NonNullable<Layer["effects"]>, scale: number): number;
};
export type MenuId = "edit" | "image" | "layer" | "select" | "layer-context" | "layer-new" | "hidden"; // hidden = 只有快捷鍵
export type MenuItemSpec = {
  id: string; menu: MenuId; label: MessageKey; order?: number;
  shortcut?: string;                             // "Mod+Shift+D"；Mod = macOS ⌘、其他 Ctrl；Alt、Shift；按鍵用 KeyboardEvent.key 的大寫
  enabled?(api: EditorApi): boolean;
  run(api: EditorApi): void;
};
export type LayerDecor = {
  id: string;
  thumbnail?(layer: Layer, api: EditorApi): ReactNode | null;  // 第一個回非 null 的取代預設縮圖
  badge?(layer: Layer, api: EditorApi): ReactNode | null;      // 名稱右邊（12 的 fx）
  onTransformEnd?(id: LayerId, before: Layer["transform"], api: EditorApi): void; // 變形工具每次 commit 後（13 的形狀重畫）
  onThumbnailClick?(layer: Layer, target: PixelTarget, mods: { mod: boolean; shift: boolean; alt: boolean }, api: EditorApi): boolean; // 點圖層縮圖（"image"）或遮色片縮圖（"mask"）時、10 的預設處理之前依註冊順序呼叫；回 true = 吃掉（11 的 ⌘ 點載入選取）；mod = macOS ⌘、其他 Ctrl
};
export type OverlaySpec = { id: string; draw(ctx: CanvasRenderingContext2D, view: ViewTransform, api: EditorApi, time: number): void; animated?(api: EditorApi): boolean };
```

```ts
// src/image-editor/registry.ts（模組層級的表；id 重複、快捷鍵或工具鍵衝突時丟 Error）
export function registerTool(spec: ToolSpec): void;
export function registerAdjustment(kind: AdjustmentKind, hooks: AdjustmentHooks): void;
export function registerEffects(hooks: EffectsHooks): void;
export function registerMenuItem(spec: MenuItemSpec): void;
export function registerLayerDecor(decor: LayerDecor): void;
export function registerOverlay(spec: OverlaySpec): void;
export function registerMessages(table: MessageTable<string>): void; // MessageTable 來自 src/i18n/messages.ts（02）；同一個表物件第二次呼叫略過
export function registerPropertyPanel(spec: PropertyPanelSpec): void; // id 重複丟 Error
export function registerSelection(provider: SelectionProvider): void; // 只能一個，第二次丟 Error
export function registerSetup(fn: SetupFn): void;                     // 同一個函式第二次略過
export function tools(): readonly ToolSpec[]; export function adjustment(kind: AdjustmentKind): AdjustmentHooks | undefined;
export function effects(): EffectsHooks | undefined; export function menuItems(menu: MenuId): readonly MenuItemSpec[];
export function layerDecors(): readonly LayerDecor[]; export function overlays(): readonly OverlaySpec[];
export function messageTables(): readonly MessageTable<string>[];
export function propertyPanels(): readonly PropertyPanelSpec[];       // 依 order 排序（沒給當 0），同 order 照註冊順序
export function selectionProvider(): SelectionProvider | undefined;
export function setups(): readonly SetupFn[];
export function resetRegistry(): void; // 只給測試；清空上面全部的表（含 messageTables、selection provider、setups）

// src/image-editor/labels.ts（第 1 步）
export function labelTable(): MessageTable<string>;  // commonMessages → imageMessages → messageTables()，同一個 key 取第一張有它的表；依 messageTables().length 快取
export function labelOf(locale: Locale, overrides: Partial<Record<string, string>>, key: MessageKey, vars?: Vars): string; // translate(labelTable(), locale, overrides, key, vars)

// src/image-editor/ui-slot.tsx（第 1 步）：EditorApi.openDialog / showError / t 的後台
export type UiSlot = {
  open(render: (close: () => void) => ReactNode): () => void;  // render 在 open 時呼叫一次，結果存起來
  error(e: ViewerError, key?: MessageKey, vars?: Vars): void;   // 記下提示，呼叫 attach 進來的 report（還沒 attach 時排隊，attach 時送出）
  dismiss(): void;                                              // 清掉提示
  attach(root: { report(e: ViewerError): void; locale: Locale; overrides: Partial<Record<string, string>> } | null): void;
  t(key: MessageKey, vars?: Vars): string;                      // labelOf(attach 進來的 locale ?? "en", overrides ?? {}, key, vars)
  dialogs(): readonly { id: number; node: ReactNode }[];
  notice(): { key: MessageKey; vars?: Vars } | null;
  subscribe(fn: () => void): () => void;
};
export function createUiSlot(): UiSlot;
export function UiOutlet(props: { slot: UiSlot }): JSX.Element; // 放在 ViewerRoot 之內；畫 dialogs()；外層 div 的 ref callback（useCallback 依 locale、overrides、report）把 useRoot() 的值 attach 進 slot，cleanup 時 attach(null)

// src/image-editor/doc/commands/layers.ts（第 2 步；11–13 直接 import）
export function insertLayer(record: Layer, above: LayerId | null): Command; // 插在 above 那層的正上方、沿用它的 parentID；above 是資料夾時插在整個子樹上方（同一個 parentID）；above 為 null 或找不到時放根層最上面。activeLayerID 設成新層；pixels：非資料夾、非調整圖層加 image { kind: "gpu" }，有 maskFile 時加 mask { kind: "gpu" }
export function removeLayers(ids: readonly LayerId[]): Command;             // 資料夾連子孫一起刪；pixels 一起刪；別層指向被刪層的 maskSourceID 拿掉；activeLayerID 指向被刪層時改成被刪層下方的同層兄弟（沒有就 null）
export function patchLayer(id: LayerId, patch: Partial<Layer>): Command;    // 淺合併；值為 undefined 的 key 從紀錄刪掉；id 不在文件裡回原文件

// src/image-editor/doc/layer-matrix.ts（第 2 步；純函式）
export function layerMatrixOf(t: Layer["transform"], px: Size): Mat2D;   // 文件座標 → 圖層像素座標；EditorApi.layerMatrix 用它
export function resizedTransform(t: Layer["transform"], from: Size, to: Size, offset: Point): Layer["transform"]; // 像素從 from 換成 to、舊像素放在 offset 時，讓舊像素留在原本文件位置、像素密度不變的新 transform（旋轉、翻轉照算）

// src/image-editor/engine/gl/program.ts、target.ts（第 3 步；11、12 直接 import，不另寫）
export const FULLSCREEN_VS: string;                          // #version 300 es，蓋滿 viewport 的三角形，輸出 `out vec2 v_uv`（0–1）
export function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram; // 以 gl + vs + fs 快取；失敗丟含 info log 的 Error
export function drawFullscreen(gl: WebGL2RenderingContext): void; // 每個 gl 一個空 VAO，drawArrays(TRIANGLES, 0, 3)
export function createTarget(gl: WebGL2RenderingContext, width: number, height: number, format: "rgba16f" | "rgba8" | "r8"): { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number; dispose(): void }; // "rgba16f" 在沒有 EXT_color_buffer_float / half_float 時退成 RGBA8；LINEAR、CLAMP_TO_EDGE

// src/image-editor/extensions.ts
export function installExtensions(): void; // 冪等；ImageEditor 掛載時呼叫。10 自己的工具與選單由 registerCore() 註冊；11、12、13 各加一行 import 與一行呼叫（各自的 register 函式），不改其他行

// src/image-editor/worker/jobs.ts
import { decodePng, encodePng, type PngImage } from "../../comp/index"; // 09
export const jobs = {
  encodePng: (input: PngImage, signal: AbortSignal): Uint8Array => …,                                    // 09 encodePng(input)
  decodePng: (input: { bytes: Uint8Array; kind: "layer" | "mask" }, signal: AbortSignal): PngImage => …, // 09 decodePng(input.bytes, input.kind)
  /* 11 加 wand、heal、contentFill；其他份照樣加一個 key */
};
export type JobKind = keyof typeof jobs; export type JobInput<K extends JobKind> = Parameters<(typeof jobs)[K]>[0]; export type JobOutput<K extends JobKind> = Awaited<ReturnType<(typeof jobs)[K]>>;
```

合成規則（`src/image-editor/engine/render.ts`，照 Compositor）：

```
acc = 透明
for L in 可見的非資料夾圖層（祖先資料夾也都可見），樹的順序由下往上：
  if L 在某個剪裁串裡（不是底）: continue
  op = L.opacity × 所有祖先資料夾的 opacity；folders = 所有祖先資料夾啟用中的遮色片相乘
  if L 是調整圖層:
    if L.maskSourceID: continue
    adj = hooks.lut ? 查表(acc) : hooks.pass(acc)；沒註冊的種類略過並在提示條顯示 image.notice.unsupported
    if L.blendMode != Normal: adj 以不透明方式混進 acc，再還原 acc 的 alpha
    acc = mix(acc, adj, op × L 的遮色片 × folders)
  elif L 是串的底:
    g = own(L)；a = alpha(g)；g 改成不透明
    for C in 串: 把 own(C)（調整圖層則對 g 套它的調整）以 C.blendMode 畫進 g
    g.alpha = a；acc = blend(g × folders, acc, L.blendMode)
  else:
    layer = own(L)；if L.maskSourceID: layer ×= coverage(L.maskSourceID)
    acc = blend(layer × folders, acc, L.blendMode)
own(L) = effects(L 的像素 × L 自己的遮色片) × op；coverage(S) = alpha(own(S))，S 有 maskSourceID 時再乘 coverage(那一個)；不管 S 可不可見；鏈 ≤ 256、有環當沒有
```

測試輔助（11–13 的測試也用）：`src/image-editor/test/make-doc.ts` 的 `makeDoc`（第 2 步）、`src/image-editor/test/mount-canvas.tsx` 的 `mountCanvas`（第 3 步）、`src/image-editor/test/mount-editor.tsx` 的 `mountEditor`（第 4 步）。`mountCanvas` 與 `mountEditor` 都在 `ViewerRoot` 裡畫 `UiOutlet`（所以 `api.openDialog` / `showError` / `t` 可用），掛上後對 `setups()` 每個函式呼叫一次（root = `.fv-root`），卸載時呼叫它們回傳的 cleanup。兩者都不呼叫 `installExtensions`（它有模組層級旗標）：`mountEditor` 只呼叫冪等的 `registerCore()`（`src/image-editor/core.ts`，第 4 步），擴充的測試在 `beforeEach` 先 `resetRegistry()` 再呼叫自己的 register 函式，然後才 mount。

i18n：本份的 key 都是 `image.*`。en 寫在 `src/image-editor/messages-en.ts`（`export const en = { … } as const`），zh-TW 寫在 `src/image-editor/messages-zh-tw.ts`（`export const zhTW: Record<ImageKey, string> = { … }`），`src/image-editor/messages.ts` 匯出 `type ImageKey = keyof typeof en`、`type ImageMessages = Record<ImageKey, string>`、`const imageMessages: MessageTable<ImageKey> = { en, "zh-TW": zhTW }`（第 1 步建立；兩種語言一開始就分檔，因為全部 key 合起來會超過 300 行）。每一步在 `messages-en.ts` 與 `messages-zh-tw.ts` 加自己列出的 key，兩種語言都要寫；不寫進 `src/i18n/en.ts`、`zh-tw.ts`。元件自己的字串用 `useT(imageMessages)`（`src/i18n/use-t.ts`）；`ToolSpec.label`、`MenuItemSpec.label`、提示條這類 `MessageKey` 用 `src/image-editor/ui/use-label.ts` 的 `useLabel()`（第 4 步）。

## 形式

- `ImageEditor` 撐滿容器。頂列：「關閉」、檔名（未存加 `•`）、undo / redo、「另存新檔」「匯出」「儲存」；頂列下方是選單列（編輯、影像、圖層，11 加選取）與提示條。左側直排工具列（本份放移動 / 變形 `V`、裁切 `C`、手形 `H`、縮放 `Z`；11、13 往裡加）。中間畫布：棋盤格底、滾輪 / 雙指 / `+` `-` `0` / 空白鍵拖曳縮放平移，左下顯示縮放比例；畫布外的底色在亮暗兩種主題都和棋盤格分得開。右側兩欄：上面是目前工具或選到圖層的屬性，下面是圖層面板。
- 圖層面板：每列眼睛、縮圖、名稱（雙擊改名）、遮色片縮圖（點它切換畫在遮色片上）；剪裁的列縮排加折角箭頭；資料夾可展開收合。上方混合模式下拉（照 Compositor 的六組分隔）與不透明度（可拖曳數字）。下方：新增圖層、新增資料夾、加遮色片、刪除。右鍵選單：複製、刪除、群組、解散群組、向下合併、合併資料夾、建立 / 解除剪裁、遮色片停用 / 刪除 / 反轉 / 連結切換。拖曳排序與拖進資料夾；Alt 點兩層交界建立剪裁。
- 變形：框、八個控制點、旋轉把手；Shift 等比、Alt 從中心；屬性欄輸入位置、尺寸、角度；方向鍵 1 px、Shift + 方向鍵 10 px；吸附畫布與其他圖層的邊與中心（螢幕上 10 px 內）。控制點畫在 GL canvas 上面的 2D overlay canvas。
- 裁切：自由、原圖、1:1、4:3、3:2、16:9、9:16、3:4；Alt 對稱；Enter 確認。畫布尺寸（錨點九宮格）、影像尺寸（等比、重新取樣）、翻轉畫布、轉 90° 在選單「影像」。
- 快捷鍵照 Photoshop：`V` `C` `H` `Z`、`Mod+Z` / `Mod+Shift+Z`、`Mod+J` 複製圖層、`Mod+G` 群組、`Mod+Shift+G` 解散、`Mod+E` 向下合併、`Mod+T` 變形、`Mod+S` 儲存、`Mod+Shift+S` 另存、`Mod+Alt+Shift+S` 匯出、`Mod+0` 符合視窗、`Mod+1` 100%。
- 改過沒存就關：02 的 `DiscardDialog`（`discard.*`）。
- `.comp.zip` 在 viewer：顯示 `QuickLook/Preview.jpg`（`<img>`）；沒有預覽圖（畫布 > 50 MP 或 Finder 壓的檔）時顯示圖示與「這個專案沒有預覽圖」。

## Phase 01 — 介面、文件模型、合成器

blocker：03、09；model：opus。這三步定下「契約 / 擴充介面」，11、12、13 從這裡開工。

1. **介面、註冊表、worker 與字串表。**
   - 新 `src/image-editor/messages-en.ts`、`src/image-editor/messages-zh-tw.ts`、`src/image-editor/messages.ts`：形狀照「契約 / 擴充介面」最後的 i18n 段（`ImageKey`、`ImageMessages`、`imageMessages`；`MessageTable` 從 `src/i18n/messages.ts`）。本步只有一個 key：`image.notice.unsupported`（en「This file uses an adjustment or effect this version can't show yet.」，zh-TW「這個檔案用到這一版還不能顯示的調整或效果。」）。改 `src/i18n/messages.ts`（02）：加 `import type { ImageMessages } from "../image-editor/messages";`，`Messages` 加 `& ImageMessages`。
   - 新 `src/image-editor/api.ts`：照「契約 / 擴充介面」的 api.ts 區塊逐字定義所有型別；另外匯出 `export const BLEND_MODES: readonly BlendMode[]`，24 個字串依序為 `"Normal"`、`"Darken"`、`"Multiply"`、`"Color Burn"`、`"Linear Burn"`、`"Lighten"`、`"Screen"`、`"Color Dodge"`、`"Linear Dodge (Add)"`、`"Overlay"`、`"Soft Light"`、`"Hard Light"`、`"Vivid Light"`、`"Linear Light"`、`"Pin Light"`、`"Hard Mix"`、`"Difference"`、`"Exclusion"`、`"Subtract"`、`"Divide"`、`"Hue"`、`"Saturation"`、`"Color"`、`"Luminosity"`；`export const BLEND_GROUPS: readonly (readonly BlendMode[])[]`：`[Normal]`、`[Darken…Linear Burn]`、`[Lighten…Linear Dodge (Add)]`、`[Overlay…Hard Mix]`、`[Difference…Divide]`、`[Hue…Luminosity]`（Compositor `Document/LayerAppearance.swift` 的 `groups`）。型別的來源：`Layer`、`BlendMode`、`LayerAdjustment`、`Manifest` 從 `src/comp/index.ts`（09）；`MessageKey` = `Extract<keyof Messages, string>`，`Messages` 從 `src/i18n/messages.ts`（02）；`ViewerError` 從 `src/contract/errors.ts`（02）；`JobKind`、`JobInput`、`JobOutput` 用 `import type` 從本步的 `src/image-editor/worker/jobs.ts`。
   - 新 `src/image-editor/registry.ts`：照「契約」的 registry 區塊；每個表是模組層級的 `Map`。`registerTool` 在 `id` 重複或 `key` 與已註冊的 `MenuItemSpec.shortcut` 衝突時丟 `Error`；`registerMenuItem` 在 `id` 重複或 `shortcut` 重複時丟 `Error`；`registerAdjustment` 同一個 kind 第二次丟 `Error`，`lut` 與 `pass` 同時給或都沒給也丟；`registerEffects` 第二次丟。`registerMessages(table)` 把表加進模組層級的陣列（同一個物件第二次略過），`messageTables()` 依註冊順序回；`registerPropertyPanel` 在 `id` 重複時丟 `Error`，`propertyPanels()` 依 `order`（沒給當 0）排序、同 order 照註冊順序；`registerSelection` 第二次丟 `Error`，`selectionProvider()` 回它或 `undefined`；`registerSetup` 同一個函式第二次略過，`setups()` 依註冊順序回；`resetRegistry()` 清空全部的表，包含 messages 陣列、selection provider 與 setups。新 `src/image-editor/shortcut.ts`：`parseShortcut(s: string): { key: string; mod: boolean; alt: boolean; shift: boolean }`、`matchShortcut(s: string, e: KeyboardEvent): boolean`（`Mod` 在 `navigator.platform` 含 `Mac` 時是 `metaKey`，否則 `ctrlKey`）。
   - 新 `src/image-editor/extensions.ts`：`installExtensions()`，模組層級 `let installed = false`，第一次呼叫時執行本檔列出的 register 函式（本步沒有任何一個，函式體只有旗標）。
   - 新 `src/image-editor/labels.ts`：`labelTable()` 與 `labelOf(locale, overrides, key, vars?)`，照「契約 / 擴充介面」的 labels 區塊：`labelTable()` 從 `commonMessages`（`src/i18n/messages.ts`，02）、`imageMessages`（本步的 `src/image-editor/messages.ts`）、`messageTables()`（`src/image-editor/registry.ts`）依序合併 `en` 與 `zh-TW` 兩張（已有的 key 不被後面的蓋掉），以 `messageTables().length` 為 key 快取；`labelOf` 回 `translate(labelTable(), locale, overrides, key, vars)`（`translate`、`Locale`、`Vars` 從 `src/i18n/messages.ts`）。
   - 新 `src/image-editor/ui-slot.tsx`：`createUiSlot()` 與 `UiOutlet({ slot })`，照「契約 / 擴充介面」的 ui-slot 區塊：`open` 把 `render(close)` 的結果以遞增 id 存進陣列並通知，`close` 移除它並通知（重複呼叫無作用）；`error(e, key?, vars?)` 把 `{ key: key ?? \`error.${e.code}\`, vars }` 存成目前的提示並呼叫 attach 進來的 `report(e)`，還沒 attach 時先排隊、`attach` 時依序送出；`dismiss()` 清掉提示；`t` 用 `labelOf`（`src/image-editor/labels.ts`），沒 attach 時 locale `"en"`、overrides `{}`。`UiOutlet` 用 `useSyncExternalStore(slot.subscribe, slot.dialogs)` 畫 `<div className="fv-ie-ui">{dialogs.map((d) => <Fragment key={d.id}>{d.node}</Fragment>)}</div>`，該 div 的 ref callback 用 `useCallback`（依 `useRoot()` 的 `report`、`locale`、`overrides`，`src/primitives/root-context.ts`）呼叫 `slot.attach({ report, locale, overrides })`，cleanup 時 `slot.attach(null)`。本檔不畫提示條（第 4 步的 `Notice` 讀 `slot.notice()`）。
   - 新 `src/image-editor/limits.ts`：`MAX_LAYER_SIDE = 30_000`、`IMAGE_MAX_PIXELS = 40_000_000`、`PIXEL_BUDGET_DESKTOP = 200_000_000`、`PIXEL_BUDGET_COARSE = 50_000_000`、`EXPORT_MAX_PIXELS = 100_000_000`、`PREVIEW_MAX_PIXELS = 50_000_000`、`UNDO_MAX_STEPS = 100`、`UNDO_MAX_BYTES = 256 * 1024 ** 2`、`TILE = 256`、`EXPORT_TILE = 2048`、`VIEW_MAX_PIXELS = 4_000_000`、`BUFFER_POOL_MAX = 8`、`BUFFER_MAX_BYTES = 32 * 1024 ** 2`；`pixelBudget(): number`（`matchMedia("(pointer: coarse)").matches` 時回 coarse，否則 desktop；沒有 `matchMedia` 時回 desktop）。上限 `previewBytes`、`projectBytes` 不在這裡：它們是 02 的 `Limits`，執行時從 `useRoot().limits` 拿（第 7 步）。
   - 新 `src/image-editor/worker/jobs.ts`：照「契約」的 jobs 區塊：`encodePng: (input, signal) => { signal.throwIfAborted(); return encodePng(input); }`、`decodePng: (input, signal) => { signal.throwIfAborted(); return decodePng(input.bytes, input.kind); }`（`encodePng`、`decodePng`、`PngImage` 從 `src/comp/index.ts`，09）；新 `src/image-editor/worker/worker.ts`：module worker 入口，收 `{ id, kind, input }` 與 `{ id, cancel: true }`，每個 id 一個 `AbortController`，呼叫 `jobs[kind](input, signal)`，回 `{ id, ok: true, output }`（`output` 裡的 `Uint8Array` 以 transfer 回傳）或 `{ id, ok: false, error: { name, message } }`；新 `src/image-editor/worker/run-in-worker.ts`：`createWorkerRunner(): { run<K extends JobKind>(job, transfer?, signal?): Promise<JobOutput<K>>; terminate(): void }`，用 `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })` 延遲到第一次 `run` 才建；`signal` abort 時送 cancel 並以 `DOMException("AbortError")` reject；`terminate` 後 pending 的全部 reject。
   - 本步不做：不改 `src/contract/kinds.ts`、不加任何開關旗標、不在 `src/primitives/` 加檔（00-overview §3「編輯器開關」、§9.3）。
   - 測試：`src/image-editor/registry.test.ts`（工具 id 重複丟錯；`key` 與選單快捷鍵衝突丟錯；選單 `shortcut` 重複丟錯；`registerAdjustment` lut 與 pass 同時給 / 都沒給 / 同 kind 兩次都丟錯；`menuItems("edit")` 依 `order` 排序；`registerMessages` 兩個表依序出現在 `messageTables()`、同一個表物件註冊兩次只出現一次；`registerPropertyPanel` id 重複丟錯、`propertyPanels()` 依 order 排；`registerSelection` 第二次丟錯；`registerSetup` 同一個函式兩次只出現一次；`resetRegistry` 後全空，包含 `selectionProvider()` 為 `undefined`）；`src/image-editor/labels.test.ts`（註冊一張含 `image.select.all` 的假表（假 key 以 `as MessageKey` 轉型）後 `labelOf("zh-TW", {}, "image.select.all")` 回假表的 zh-TW 字；假表也定義 `common.cancel` 時仍回 `commonMessages` 的字（先註冊的優先）；overrides 有該 key 時回 override；沒註冊的 key 照 02 `translate` 的退回規則）；`src/image-editor/ui-slot.test.tsx`（jsdom，包在 `ViewerRoot`（`src/primitives/root.tsx`）`locale="zh-TW"`、`onError` 是 spy 裡掛 `UiOutlet`：`open` 的節點出現在 `.fv-ie-ui` 裡、`close` 後消失、`close` 兩次不丟錯；mount 前呼叫的 `error(new ViewerError("too_large"))` 在 mount 後送到 `onError` 一次、`notice()` 的 key 是 `error.too_large`；`dismiss` 後 `notice()` 為 null；mount 後 `t("image.notice.unsupported")` 回 zh-TW 字）；`src/image-editor/shortcut.test.ts`（`"Mod+Shift+S"` 解析；mac 上 metaKey 符合、ctrlKey 不符；非 mac 相反；`"["` 這種符號鍵）；`src/image-editor/extensions.test.ts`（呼叫兩次只執行一次）；`src/image-editor/worker/run-in-worker.browser.test.ts`（真的 worker：4 通道的 `PngImage` 經 `encodePng` job 再以 `{ bytes, kind: "layer" }` 經 `decodePng` job 得到相同像素；1 通道的 `PngImage` 以 `kind: "mask"` 解回 `channels` 1 且值相同；abort 後 reject `AbortError`；`terminate` 後 pending reject）。
   - verify：`pnpm test src/image-editor && pnpm test:browser src/image-editor/worker && pnpm check`
   - commit：`feat(image-editor): add extension registry, worker runner and image messages`

2. **文件模型與 undo（純函式，不碰 GL）。**
   - 新 `src/image-editor/doc/tree.ts`（檔頭照 Compositor `Compositor/Document/LayerGroups.swift`）：`children(m: Manifest, parent: LayerId | null): Layer[]`、`ancestors(m, id): Layer[]`（由近到遠）、`depth(m, id): number`、`subtreeRange(m, id): [start: number, end: number]`（資料夾與子孫在陣列中的連續區間）、`isVisibleInTree(m, id): boolean`、`MAX_DEPTH = 64`。
   - 新 `src/image-editor/doc/commands/layers.ts`：`insertLayer(record: Layer, above: LayerId | null): Command`、`removeLayers(ids: readonly LayerId[]): Command`、`patchLayer(id: LayerId, patch: Partial<Layer>): Command`，行為照「契約 / 擴充介面」的 layers 區塊（這三個 11–13 直接 import）；`addLayer(opts: { id: LayerId; name: string; above?: LayerId; width: number; height: number }): Command`（= `insertLayer` 一筆 transform 蓋滿畫布、沒有 `imageFile` 的一般圖層，`above` 沒給時用 `null`）、`duplicateLayers(ids: LayerId[], newIds: Map<LayerId, LayerId>): Command`、`renameLayer(id, name): Command`、`setVisible(id, visible: boolean): Command`、`setOpacity(id, opacity: number): Command`（夾到 0–1）、`setBlendMode(id, mode: BlendMode): Command`（資料夾不允許非 Normal：回原文件）、`moveLayers(ids: LayerId[], target: { parent: LayerId | null; index: number }): Command`（目標是自己或自己的子孫時回原文件；超過 64 層時回原文件）。新 `src/image-editor/doc/commands/groups.ts`：`groupLayers(ids, folderId: LayerId, name: string): Command`（新資料夾 transform 蓋滿畫布）、`ungroup(folderId): Command`。新 `src/image-editor/doc/commands/masks.ts`：`addMask(id, fill: "white" | "black"): Command`（`maskFile` 設成 09 的命名規則 `<ID>.mask.png`，`pixels.get(id).mask = { kind: "gpu" }`）、`removeMask(id)`、`setMaskEnabled(id, enabled)`、`setMaskLinked(id, linked)`（取消連結時把目前 transform 存進 `maskPlacement`；連結時拿掉 `maskPlacement`）。新 `src/image-editor/doc/commands/clip.ts`：`clipToBelow(id): Command`（下方同層兄弟是串的底就 `maskSourceID = 底`；底不能是資料夾或調整圖層）、`releaseClip(id): Command`。新 `src/image-editor/doc/commands/geometry.ts`：`setTransform(id, t: Layer["transform"]): Command`（`maskLinked` 不是 false 而且有 `maskPlacement` 時跟著平移縮放）、`crop(rect: Rect): Command`（畫布寬高改成 rect，每層與每個 `maskPlacement` 的 origin 減 rect.x / rect.y，guides 同樣位移）、`canvasSize(w: number, h: number, anchor: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): Command`（九宮格錨點，換算成 crop 的位移）、`flipCanvas(axis: "x" | "y"): Command`、`rotateCanvas(dir: 90 | -90): Command`（畫布寬高互換，每層 transform 繞畫布中心轉、`rotation` 加減 90）。新 `src/image-editor/doc/commands/index.ts` 全部 re-export。
   - 新 `src/image-editor/doc/history.ts`（檔頭照 Compositor `Compositor/Document/DocumentHistory.swift`）：`type Step = { label: MessageKey; doc: Doc; tiles: PixelTile[]; resizes: readonly LayerResize[] }`（`LayerResize` 來自 `src/image-editor/api.ts`）；`createHistory(initial: Doc): History`，`History` 有 `record(step: Step): void`、`undo(): { doc: Doc; tiles: { tile: PixelTile; use: "before" }[]; resizes: { resize: LayerResize; use: "before" }[] } | null`、`redo(): { doc: Doc; tiles: { tile: PixelTile; use: "after" }[]; resizes: { resize: LayerResize; use: "after" }[] } | null`、`canUndo()`、`canRedo()`、`position(): number`、`bytes(): number`（只算 tiles 的 before + after 與 resizes 的 before.data + after.data）；記錄新步驟時丟掉 redo 分支；超過 `UNDO_MAX_STEPS` 或 `UNDO_MAX_BYTES`（`src/image-editor/limits.ts`）丟最舊的。
   - 新 `src/image-editor/doc/layer-matrix.ts`（純函式，`Layer`、`Mat2D`、`Point`、`Size` 從 `src/image-editor/api.ts`）：`layerMatrixOf(t: Layer["transform"], px: Size): Mat2D`：圖層矩形 = `origin` 起、`size` 大，繞矩形中心順時針轉 `rotation` 度，再依 `flipX` / `flipY` 在矩形內翻轉；回文件座標 → 圖層像素座標（像素 (0, 0) 在翻轉前的左上，x 方向每文件單位 `px.width / size[0]` 像素）。`resizedTransform(t, from: Size, to: Size, offset: Point): Layer["transform"]`：新 transform 的 `size` = `[size[0] × to.width / from.width, size[1] × to.height / from.height]`，`origin` 取得讓 `layerMatrixOf(新, to)` 把每個舊像素 p 的文件位置對到 `p + offset`，`rotation`、`flipX`、`flipY`、`sampling` 不變。
   - 新 `src/image-editor/doc/flat.ts`：`isFlat(doc: Doc): boolean`，規則照「契約 / 存檔」的「平的」。
   - 新 `src/image-editor/doc/store.ts`：`createDocStore(initial: Doc): DocStore`，`DocStore` 有 `get(): Doc`、`subscribe(fn: () => void): () => void`（給 `useSyncExternalStore`）、`dispatch(command: Command, label?: MessageKey)`（語意照「契約」的 `EditorApi.dispatch`）、`commit(label, doc, tiles, resizes = [])`（記一步，tiles 與 resizes 原樣存，after 由第 3 步的 `createEditorApi` 先填好）、`undo()` / `redo()`（回傳 `history.ts` 的結果給呼叫端寫像素）、`dirty(): boolean`（目前位置 ≠ 上次 `markSaved` 的位置）、`markSaved(at?: number)`、`position()`。
   - 測試：`src/image-editor/doc/tree.test.ts`（巢狀三層的 `subtreeRange`；子孫不連續的輸入照 `children` 順序走；`depth` 第 64 層）；`src/image-editor/doc/commands.test.ts`（群組再解散回到原陣列；拖進資料夾後資料夾仍是連續子樹；搬進自己的子孫回原文件；超過 64 層回原文件；刪掉剪裁的底，上面的 `maskSourceID` 一起拿掉；資料夾設 Multiply 被拒；`crop` 後每層 origin 位移、`pixels` 不變；`canvasSize` 九個錨點的位移；`rotateCanvas(90)` 兩次等於 `flipCanvas("x")` 再 `flipCanvas("y")` 的位置；`setMaskLinked(false)` 存下 `maskPlacement`，之後移動圖層遮色片不動；`insertLayer` 在 `above` 是資料夾時插在整個子樹之後、`parentID` 同資料夾，`above: null` 時在陣列最後，`activeLayerID` 是新層、調整圖層沒有 `pixels.image`、有 `maskFile` 時有 `pixels.mask`；`removeLayers` 刪掉 active 層時 `activeLayerID` 改成下方兄弟；`patchLayer` 給 `{ text: undefined }` 時紀錄裡沒有 `text` 這個 key）；`src/image-editor/doc/layer-matrix.test.ts`（`layerMatrixOf` 對沒轉的層是平移加縮放；旋轉 90° 時圖層像素 (0, 0) 對到文件的右上角；`flipX` 時左右對調；`resizedTransform`：對旋轉 30°、`flipX`、縮放 2 的層，`from` 100 × 50、`to` 140 × 80、`offset` (−20, −10)，舊像素四個角經新舊矩陣的反矩陣算出的文件座標差 ≤ 1e-6）；`src/image-editor/doc/history.test.ts`（undo 到底再 redo 回到同一個 `Doc` 物件；第 101 步丟最舊；tiles 總和超過 256 MB 丟最舊；resizes 的位元組算進上限；undo 回傳那一步的 resizes（`use: "before"`）、redo 回傳 `use: "after"`；記錄新步驟後不能 redo）；`src/image-editor/doc/flat.test.ts`（一層一般圖回 true；加遮色片、opacity 0.5、`rotation` 15、`flipX`、Multiply、兩層、隱藏，各回 false）；`src/image-editor/doc/store.test.ts`（無 label 的 dispatch 不增加 undo 步數，之後有 label 的 dispatch 一步 undo 回到最後一個記錄點；`dirty` 在 `markSaved` 後為 false、再 dispatch 為 true、undo 回去又是 false；`subscribe` 每次變更通知一次）。測試用的 `Manifest` 由新檔 `src/image-editor/test/make-doc.ts` 的 `makeDoc(spec: { width: number; height: number; layers: Partial<Layer>[] }): Doc` 產生：以 `fromImage({ width, height, rgba: new Uint8Array(width * height * 4) }, "Background").manifest`（`src/comp/index.ts`，09）為底拿到 09 `Manifest` 的全部必填欄位，再把 `layers` 換成 spec 的層；每層沒給的欄位補 `id`（`crypto.randomUUID().toUpperCase()`）、`name`（`"Layer <index>"`）、`isVisible: true`、`isGroup: false`、`opacity: 1`、`blendMode: "Normal"`、蓋滿畫布的 `transform`（`origin [0, 0]`、`size [width, height]`、`rotation 0`、不翻轉、`sampling "High quality"`），不給 `imageFile`；`activeLayerID` 是最後一層的 id；`pixels` 對每個非資料夾、非調整圖層設 `{ image: { kind: "gpu" } }`。11–13 的測試也用它。測試裡要 `MessageKey` 的地方用 `"image.notice.unsupported"`（第 1 步的 key）。
   - verify：`pnpm test src/image-editor/doc && pnpm check`
   - commit：`feat(image-editor): add layer document model, commands and snapshot undo`

3. **合成器、像素介面與畫布。**
   - 新 `src/image-editor/engine/gl/context.ts`：`createGl(canvas: HTMLCanvasElement): { gl: WebGL2RenderingContext; floatTargets: "rgba16f" | "rgba8"; maxTexture: number } | null`（`getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false })`；`EXT_color_buffer_float` 或 `EXT_color_buffer_half_float` 有一個就是 `"rgba16f"`）；`destroyGl(gl)`（呼叫 `WEBGL_lose_context.loseContext()`）。新 `src/image-editor/engine/gl/program.ts`：`FULLSCREEN_VS`、`compile(gl, vs, fs): WebGLProgram`（以 `WeakMap<WebGL2RenderingContext, Map<string, WebGLProgram>>` 依 `vs + "\0" + fs` 快取；失敗時丟含 info log 的 Error）、`drawFullscreen(gl)`，照「契約 / 擴充介面」的 program 區塊（11、12 直接用，不另寫）。新 `src/image-editor/engine/gl/target.ts`：`createTarget(gl, width, height, format)`，照同一個區塊；`"rgba16f"` 時先試 `EXT_color_buffer_float`、再試 `EXT_color_buffer_half_float`，都沒有退成 RGBA8。
   - 新 `src/image-editor/engine/gl/blend.glsl.ts`：匯出 GLSL 字串 `BLEND_GLSL`，一個 `vec3 blend(int mode, vec3 cb, vec3 cs)`，mode 是 `BLEND_MODES`（`src/image-editor/api.ts`）的索引；每個模式前註解公式來源（W3C Compositing and Blending Level 1 的 15 種；Soft Light 用 Photoshop 版；8 種 Photoshop 通行公式）。新 `src/image-editor/engine/blend-ref.ts`：同樣 24 個公式的 TS 版 `blendRef(mode: BlendMode, cb: [number, number, number], cs: [number, number, number]): [number, number, number]` 與 `compositeRef(backdrop: RGBA, source: RGBA, mode): RGBA`（W3C 的 source-over 加混合，0–1 直通 alpha），給測試當參考。
   - 新 `src/image-editor/engine/gl/composite.glsl.ts`：圖層合成 shader：輸入圖層 texture（RGBA8 直通 → 預乘）、遮色片 texture（R8，範圍外用 uniform 給的邊緣值）、資料夾遮色片（最多 8 個 uniform sampler，超過就先在 buffer 裡乘好）、剪裁 coverage texture、opacity、blend mode、`lut1d` / `lut3d` 查表（`AdjustmentHooks.lut` 回的 texture；在直通色上查：先除以 alpha，1D 用 `texture(lut1d, vec2((c * 255.0 + 0.5) / 256.0, 0.5))` 逐通道取 r / g / b，3D 用 `texture(lut3d, c * (32.0 / 33.0) + 0.5 / 33.0).rgb` 三線性，查完再乘回 alpha；查表 shader 只在這裡，12 不寫）、目前累積 buffer；仿射矩陣把輸出 px 對到圖層 UV。
   - 新 `src/image-editor/engine/textures.ts`：`createTextureStore(gl)`，有 `upload(id, target, source: ImageBitmap | { width; height; data: Uint8Array })`（image 是 RGBA8、mask 是 R8；`sampling` 是 `"Nearest"` 時 NEAREST，否則 LINEAR + `generateMipmap`）、`get(id, target)`、`size(id, target)`、`delete(id)`、`replace(id, target, size: { width; height }, data: Uint8Array)`（刪掉舊的、上傳新尺寸的整張；mipmap 規則同 `upload`；`version` 遞增）、`totals(): { layerPx: number; maskPx: number }`、`version(id): number`（每次寫入遞增）；上傳前檢查邊長 ≤ `min(maxTexture, MAX_LAYER_SIDE)`，否則丟 `new ViewerError("too_large")`（`src/contract/errors.ts`）。
   - 新 `src/image-editor/engine/buffers.ts`：`createBufferPool(gl, format: "rgba16f" | "rgba8")`，`borrow(w, h): { texture; framebuffer; release(): void }`（底下用 `createTarget`，`src/image-editor/engine/gl/target.ts`），最多 `BUFFER_POOL_MAX` 個、每個 ≤ `BUFFER_MAX_BYTES`（`src/image-editor/limits.ts`）。
   - 新 `src/image-editor/engine/stacks.ts`（檔頭照 Compositor `Compositor/Rendering/LiveMaskRenderer.swift`）：`clipStacks(m: Manifest): Map<LayerId, LayerId[]>`（底 → 串）與 `coverageChain(m, id): LayerId[]`（鏈 ≤ 256、有環回空陣列），純函式。
   - 新 `src/image-editor/engine/render.ts`（檔頭照 Compositor `Compositor/IO/ImageExporter.swift` 與 `LiveMaskRenderer.swift`）：`createRenderer(gl, textures, pool)`，`render(doc: Doc, session: Session, out: { framebuffer: WebGLFramebuffer | null; width: number; height: number; docRect: Rect }, opts: { background?: [number, number, number, number]; forExport: boolean }): { unsupported: boolean }`，照「契約 / 合成規則」；調整用 `adjustment(kind)`、效果用 `effects()`（`src/image-editor/registry.ts`）；`lut` 的結果以 layer id 快取 `{ settings, lut }`，`layer.adjustment` 換了物件（`!==`）或層被刪時先 `gl.deleteTexture` 舊的再呼叫 `lut(gl, s)`（texture 歸 10 刪）；呼叫 `pass` 時傳的 `PassView.forExport` = `opts.forExport`；`forExport` 為 false 時略過 `session.renderHidden` 的層；沒註冊的調整種類或有 `effects` 但沒註冊 `registerEffects` 時回報 `unsupported: true`。新 `src/image-editor/engine/tiles.ts`：`exportTiles(doc, size: number, reach: number, maxTexture: number): Rect[]`（塊加邊超過 `maxTexture` 時回一整張）、`totalReach(doc, scale): number`（所有調整 `reach` 與效果 `reach` 的最大值）。
   - 新 `src/image-editor/engine/pixels.ts`：`createPixels(gl, textures)`，實作 `EditorApi` 的 `layerTexture`、`maskTexture`、`pixelSize`（`textures.size`，沒有 texture 回 null）、`writeRegion`、`readRegion`（RGBA8 直通 alpha 讀回；mask 讀 R8）、`snapshotTiles`（以 `TILE` = 256 切塊讀 before）、`resizePixels`（語意照「契約 / 擴充介面」：沒有舊 texture 時先建 transform 大小的透明（mask 全 255）；`before` = `readRegion` 整張；新內容 = `opts.pixels`，或在 CPU 上把舊像素放到 `offset`、其餘填透明 / 遮色片邊緣多數值；邊長檢查同 `upload`；`textures.replace`；回 `{ layer, target, before }`）。新 `src/image-editor/editor-api.ts`：`createEditorApi(deps: { gl; store: DocStore; textures; renderer; pixels; worker: ReturnType<typeof createWorkerRunner>; session: { get(): Session; set(p: Partial<Session>): void }; ui: UiSlot; requestRender(): void }): EditorApi`（`UiSlot` 來自 `src/image-editor/ui-slot.tsx`）：`commit(label, doc, tiles, resizes = [])` 先對每個 tile 讀回 `after`、對每個 resize 讀回整張當 `after`，把碰到的層在 `doc.pixels` 標成 `{ kind: "gpu" }`（沒有 `png` 快取），再 `store.commit`，最後 `ui.dismiss()`；有 label 的 `dispatch` 也 `ui.dismiss()`；`setSession(patch)`：`patch.tool` 存在且不同於目前的工具時，先呼叫目前工具（`tools()` 裡 id 相同的那個）的 `onDeactivate?.(api)`，再 `session.set`；`writeRegion` 對還沒有 texture 的層先建一張 transform 大小的透明 texture；`readComposite(rect)` 借一個 buffer 以 `forExport: true` 合成後讀回並轉直通 alpha；`layerMatrix(id)` = `layerMatrixOf(transform, pixelSize(id, "image") ?? transform 的大小四捨五入)`（`src/image-editor/doc/layer-matrix.ts`）；`checkBudget` 用 `textures.totals()` 加上 `add` 比 `pixelBudget()`（`src/image-editor/limits.ts`），超過回 `ViewerError("too_large")`；`runInWorker` 轉給 `worker.run`；`selection()` = `selectionProvider()?.get(api) ?? null`（`src/image-editor/registry.ts`）；`openDialog` = `ui.open`、`showError` = `ui.error`、`t` = `ui.t`。另外匯出 `applyUndo(api, result)`：undo 時先把 tiles 的 before 用 `writeRegion` 寫回、再把 resizes 的 before 用 `textures.replace` 換回；redo 時先換成 resizes 的 after、再寫 tiles 的 after。
   - 新 `src/image-editor/canvas.tsx`：`EditorCanvas({ api, view, onViewChange })`：GL canvas 與上面一層 2D overlay canvas，大小用 ResizeObserver（ref callback 裡建立、cleanup 時 disconnect），解析度 = CSS 尺寸 × `min(devicePixelRatio, 2)`、總像素 ≤ `VIEW_MAX_PIXELS`；只合成視窗看得到的文件範圍；滾輪 / 觸控板縮放（以游標為中心）、雙指縮放、空白鍵拖曳平移；pointer 事件轉成文件座標交給目前工具（`session.tool` 對到 `tools()` 的 `ToolSpec`）；overlay 先畫 `overlays()` 再畫目前工具的 `drawOverlay`，任何 `OverlaySpec.animated` 為 true 時用 `requestAnimationFrame` 持續重畫。`view` 的型別 `export type View = { zoom: number; center: Point }` 定義在本檔，並匯出 `toViewTransform(view, size, dpr): ViewTransform`。卸載（ref callback cleanup）時 `destroyGl`。
   - 新 `src/image-editor/test/mount-canvas.tsx`：`mountCanvas(doc: Doc, colors?: Record<LayerId, [number, number, number, number]>): Promise<{ api: EditorApi; store: DocStore; canvas: HTMLCanvasElement; unmount(): void }>`，在 browser 測試裡把 `EditorCanvas` 與 `UiOutlet`（`src/image-editor/ui-slot.tsx`，同一個 `createUiSlot()` 也傳給 `createEditorApi`）掛在 `ViewerRoot`（`src/primitives/root.tsx`，`locale="en"`）裡、把每個非資料夾、非調整圖層上傳成 transform 大小的純色 texture（顏色取 `colors[id]`，沒給就用層的 index 決定的固定色）、建好 `createEditorApi`，然後對 `setups()`（`src/image-editor/registry.ts`）每個函式呼叫 `fn(api, canvas.closest(".fv-root"))`，`unmount` 時先呼叫它們回傳的 cleanup；本步的 browser 測試與 11–13 的工具測試都用它。
   - `THIRD_PARTY_NOTICES.md`：09 P01-1 在 `## Code copied into this package` 加的 Compositor 條目，路徑清單加 `Rendering/LiveMaskRenderer.swift`（本步的 `engine/stacks.ts`、`engine/render.ts` 抄它；`Document/*.swift`、`IO/ImageExporter.swift` 09 已列，不重複；已經列了就不動）。
   - 測試：`src/image-editor/engine/blend-ref.test.ts`（24 個模式各對兩組手算值；Soft Light 在 b = 0.25 與 0.75 符合 Photoshop 公式；Hue / Saturation / Color / Luminosity 的 `SetLum` 結果在 0–1 內）；`src/image-editor/engine/stacks.test.ts`（兩層剪裁在同一個底上；底是調整圖層時不成串；中間夾一個非剪裁層時串斷開；環回空陣列；257 層的鏈回空陣列）；`src/image-editor/engine/tiles.test.ts`（5000 × 3000、reach 0 時塊數與邊界；reach 加上去超過 maxTexture 時回一整張）；`src/image-editor/engine/render.browser.test.ts`（真 WebGL2，用 `src/image-editor/test/make-doc.ts` 的 `makeDoc` 加純色 texture：每個混合模式一組固定上下色，讀回值與 `compositeRef` 誤差 ≤ 1/255；資料夾 opacity 0.5 等於子層各減半；資料夾遮色片乘到每個子層；剪裁的上層只出現在底不透明處；隱藏的底照樣剪裁；停用的遮色片不影響；`maskPlacement` 範圍外取邊緣多數值；註冊假的 `lut` 調整：1D 反相（256×1 RGBA16F `TEXTURE_2D`）與 3D 反相（33³ RGBA16F `TEXTURE_3D`）各一次，讀回值與 CPU 算的 `1 - c` 誤差 ≤ 1/255，換一個新的 `adjustment` 物件後舊 texture 被 `deleteTexture`；註冊假的 `pass`（填紅）一次，結果正確；`renderHidden` 的層畫面上不見、`forExport` 照畫；分塊（`exportTiles` 用 64 px 的塊）與整張合成逐像素相同；`maxTexture` 假裝 2048 時上傳 3000 寬的層丟 `too_large`）；`src/image-editor/engine/pixels.browser.test.ts`（`writeRegion` 再 `readRegion` 相同；alpha 1–254 的像素讀回顏色不變；`snapshotTiles` 跨 256 邊界切成正確的塊；`commit` 後 undo 再 `applyUndo` 像素回到 before；`readComposite` 對兩層 Normal 的結果；`checkBudget` 超過回 `too_large`；`pixelSize` 對沒寫過的層回 null、寫過後是 transform 大小；`resizePixels` 從 100 × 50 換成 140 × 80、offset (20, 10)：舊像素出現在 (20, 10) 起、其餘透明，`commit(…, [], [resize])` 後 undo 再 `applyUndo` 回到 100 × 50 與原像素、redo 回到 140 × 80；遮色片 `resizePixels` 時新增的地方是邊緣多數值；`resizePixels` 給 `pixels` 時整張就是它；邊長 40,000 丟 `too_large`；`layerMatrix` 在 resize 前後對同一個文件點（配上 `resizedTransform` 的新 transform）指到同一個舊像素）；`src/image-editor/editor-api.browser.test.ts`（`mountCanvas`：`registerSelection` 一個假 provider 後 `api.selection()` 回它的值、`resetRegistry()` 後回 null；`setSession({ tool: "b" })` 從工具 `a` 換過去時 `a.onDeactivate` 被呼叫一次、設成同一個工具時不呼叫；`openDialog` 回的節點出現在 `.fv-ie-ui`；`showError(new ViewerError("too_large"))` 後 `ViewerRoot` 的 `onError` 收到、之後有 label 的 `dispatch` 清掉提示；`t("image.notice.unsupported")` 回英文字；`registerSetup` 的函式在 mount 時收到 `api` 與 `.fv-root`、unmount 時 cleanup 被呼叫）；`src/image-editor/canvas.browser.test.tsx`（掛載後 `gl` 存在；卸載後 `gl.isContextLost()` 為 true；滾輪縮放後游標下的文件點不變；註冊的假工具收到的文件座標正確；`animated` 的 overlay 在兩個 frame 各被呼叫）。
   - verify：`pnpm test src/image-editor/engine && pnpm test:browser src/image-editor/engine src/image-editor/canvas.browser.test.tsx src/image-editor/editor-api.browser.test.ts && pnpm check`
   - commit：`feat(image-editor): composite layers with webgl2 and expose pixel and canvas apis`

phase 結尾的 verify：`pnpm test src/image-editor && pnpm test:browser src/image-editor && pnpm check`

## Phase 02 — 編輯器外框、圖層面板、變形與畫布操作

blocker：Phase 01；model：opus。12 的 Phase 03 等第 4 步。

4. **編輯器外框與圖層面板。**
   - 新 `src/image-editor/ui/use-label.ts`：`useLabel(): (key: MessageKey, vars?: Vars) => string`：用 `useRoot()`（`src/primitives/root-context.ts`）的 `locale`、`overrides`，回 `(key, vars) => labelOf(locale, overrides, key, vars)`（`src/image-editor/labels.ts`，第 1 步）。`MessageKey` 來自 `src/image-editor/api.ts`，`Vars` 來自 `src/i18n/messages.ts`。11–13 的元件要翻別的區域的 key 時也用它。
   - 新 `src/image-editor/glyphs.tsx`：本份用到的 inline SVG 圖示元件，每個都是 `(props: { size?: IconSize; label?: string }) => JSX.Element`、外層包 02 的 `Icon`（`src/primitives/icon.tsx`）；不加圖示套件。
   - 新 `src/image-editor/ui/editor-shell.tsx`：`EditorShell(props: { api: EditorApi; store: DocStore; ui: UiSlot; name: string; view: View; onViewChange(v: View): void; saveSlot: ReactNode; onClose(): void })`（`EditorApi` 來自 `src/image-editor/api.ts`，`DocStore` 來自 `src/image-editor/doc/store.ts`，`View` 來自 `src/image-editor/canvas.tsx`，`UiSlot` 來自 `src/image-editor/ui-slot.tsx`；`ui` 必須是建 `api` 時傳給 `createEditorApi` 的那一個），版面照「形式」，最後畫 `<UiOutlet slot={ui} />`：
     - 頂列 `src/image-editor/ui/topbar.tsx`：`Topbar({ name, dirty, canUndo, canRedo, onUndo, onRedo, onClose, saveSlot })`，按鈕用 02 的 `Button`（`src/primitives/button.tsx`，只有圖示時給 `aria-label`）與 `Tooltip`（`src/primitives/tooltip.tsx`）；`dirty`、`canUndo`、`canRedo` 用 `useSyncExternalStore(store.subscribe, …)` 讀；undo / redo 呼叫 `store.undo()` / `store.redo()`，結果交給 `applyUndo(api, result)`（`src/image-editor/editor-api.ts`）。
     - 選單列：02 的 `Menubar`（`src/primitives/menubar.tsx`）。選單 `edit`、`image`、`layer`、`select` 各取 `menuItems(menu)`（`src/image-editor/registry.ts`），每個 `MenuItemSpec` 轉成 `{ id: spec.id, label: label(spec.label), onSelect: () => spec.run(api), disabled: spec.enabled ? !spec.enabled(api) : false, shortcut: 顯示用字串（macOS 把 Mod 顯示成 ⌘，其他顯示 Ctrl） }`（`label` 是 `useLabel()`）；沒有項目的選單不顯示；選單標題 `image.menu.{edit,image,layer,select}`。
     - 提示條 `src/image-editor/ui/notice.tsx`：`Notice({ messages: { key: MessageKey; vars?: Vars }[] })`，class `fv-ie-notice`，`role="status"`，用 `useLabel()` 翻譯；`render`（`src/image-editor/engine/render.ts`）回 `unsupported: true` 時顯示 `image.notice.unsupported`；`ui.notice()`（`useSyncExternalStore(ui.subscribe, ui.notice)`）不是 null 時也顯示它。
     - 左側工具列 `src/image-editor/ui/toolbar.tsx`：依 `tools()` 排，同 `slot` 的併成一格，長按 400 ms 或右鍵展開；每顆的 `aria-label` 與 `Tooltip` 是 `label(spec.label)`。
     - 中間 `EditorCanvas`（`src/image-editor/canvas.tsx`）；右上屬性欄 `src/image-editor/ui/properties.tsx`：`Properties({ api, store })`：由上往下先畫目前工具的 `panel`（有的話），再對 `session.active` 那一層（用 `useSyncExternalStore(store.subscribe, …)` 讀，undo / redo 後拿到新的紀錄）依序畫 `propertyPanels()`（`src/image-editor/registry.ts`）裡 `when(layer, api)` 為 true 的 `component`（`key` = spec.id，props `{ api, layer }`）；沒有 active 層時只畫工具的 panel；右下圖層面板。
   - 新 `src/image-editor/ui/layers/layer-list.tsx`（`LayerList({ api })`：樹狀列出，資料夾展開收合存 `session.collapsed`，鍵盤：上下鍵換列、Enter 改名、Esc 取消改名、Space 切換眼睛）、`layer-row.tsx`（眼睛、縮圖：先問 `layerDecors()` 的 `thumbnail`，都回 null 才畫預設縮圖（`readRegion` 縮成 32 px，像素改變時重畫）、名稱、`badge`、遮色片縮圖（點它 `setSession({ target: "mask" })`、點圖層縮圖切回 `"image"`）、剪裁的縮排與折角箭頭。點縮圖或遮色片縮圖時先把 `{ mod: macOS ? metaKey : ctrlKey, shift, alt }` 依序交給每個 `layerDecors()` 的 `onThumbnailClick?.(layer, "image" | "mask", mods, api)`，第一個回 true 就停、不做預設處理）、`layer-drag.ts`（pointer 拖曳排序與拖進資料夾，放開時 `moveLayers`；Alt 點兩列交界呼叫 `clipToBelow` / `releaseClip`）、`layer-menu.tsx`（02 的 `ContextMenu`，`src/primitives/context-menu.tsx`，`items: readonly MenuItem[]`、`MenuItem` 來自 `src/primitives/menu.tsx`，`label` 用 `useLabel()`；項目：複製、刪除、群組、解散群組、建立 / 解除剪裁、遮色片停用 / 刪除 / 反轉 / 連結切換，再接 `menuItems("layer-context")`）、`appearance.tsx`（混合模式用 02 的 `Select`（`src/primitives/select.tsx`），`groups` 由 `BLEND_GROUPS`（`src/image-editor/api.ts`）轉成 `{ value, label: t("image.blend.<camelCase>") }` 的陣列；不透明度用 02 的 `NumberField`（`src/primitives/number-field.tsx`），`onChange` 時 `dispatch` 不帶 label、`onCommit` 時帶 label）、`layer-actions.tsx`（新增圖層、新增資料夾、加遮色片、刪除，加上 `menuItems("layer-new")` 做成的下拉）。全部用 `src/image-editor/doc/commands/index.ts` 的命令；遮色片反轉用 `snapshotTiles` + `readRegion` / `writeRegion` + `commit`。
   - 新 `src/image-editor/core.ts`：`registerCore()`（冪等：`menuItems("edit")` 已含 `edit.undo` 時直接 return），用 `registerMenuItem` 註冊：`edit.undo`（`Mod+Z`）、`edit.redo`（`Mod+Shift+Z`）、`layer.duplicate`（`Mod+J`）、`layer.group`（`Mod+G`）、`layer.ungroup`（`Mod+Shift+G`）、`layer.new`、`layer.newFolder`、`layer.delete`（`Backspace` 與 `Delete` 都對，`menu: "hidden"` 的第二筆）。標籤：`edit.undo` / `edit.redo` 用 `image.topbar.undo` / `image.topbar.redo`，`layer.*` 用同名的 `image.layers.*`（`duplicate`、`group`、`ungroup`、`new`、`newFolder`、`delete`）。`src/image-editor/extensions.ts` 的 `installExtensions` 加一行呼叫 `registerCore()`。
   - 新 `src/image-editor/ui/shortcuts.ts`：`handleKey(e: KeyboardEvent, api): boolean`，順序照「判斷」的快捷鍵衝突：焦點在 input / textarea / contenteditable 時不處理；目前工具的 `onKeyDown` 回 true 就停；`api.selection()` 不是 null、`e.key` 是 `"Delete"` 或 `"Backspace"`、沒有 meta / ctrl / alt / shift、而且 `selectionProvider()?.clear` 存在時呼叫它並停（`selectionProvider` 來自 `src/image-editor/registry.ts`）；再比 `menuItems` 全部選單（含 `"hidden"`）的 `shortcut`（`matchShortcut`，`src/image-editor/shortcut.ts`）；最後比工具的 `key`（Shift + 同鍵在同 `slot` 內循環）。
   - 新 `src/image-editor/test/setup-gl.ts`：`setupGl(canvas: HTMLCanvasElement, doc: Doc, ui: UiSlot, colors?: Record<LayerId, [number, number, number, number]>): { api: EditorApi; store: DocStore }`：`createGl`、`createTextureStore`、`createBufferPool`、`createRenderer`、`createWorkerRunner`、`createDocStore`、`createEditorApi`（第 1–3 步的檔，`ui` 傳給 `createEditorApi`），把每個非資料夾、非調整圖層上傳成 transform 大小的純色 texture（顏色取 `colors[id]`，沒給就用層的 index 決定的固定色）。改 `src/image-editor/test/mount-canvas.tsx` 的 `mountCanvas` 改呼叫它（行為不變，仍畫 `UiOutlet`、仍呼叫 `setups()`）。新 `src/image-editor/test/mount-editor.tsx`：`mountEditor(doc: Doc, colors?: Record<LayerId, [number, number, number, number]>): Promise<{ api: EditorApi; store: DocStore; unmount(): void }>`：呼叫 `registerCore()`（`src/image-editor/core.ts`，冪等；不呼叫 `installExtensions`），在 `ViewerRoot`（`src/primitives/root.tsx`，`locale="en"`）裡掛 1280 × 800 的 `EditorShell`（`ui` = 新的 `createUiSlot()`、`saveSlot` null、`onClose` 空函式），GL 由 `setupGl` 建；掛上後對 `setups()` 每個函式呼叫 `fn(api, .fv-root 元素)`，`unmount` 時呼叫它們的 cleanup。11–13 的測試也用它。
   - i18n（`src/image-editor/messages-en.ts`、`messages-zh-tw.ts`）：`image.topbar.{close,undo,redo,unsaved}`、`image.menu.{edit,image,layer,select}`、`image.layers.{new,newFolder,addMask,delete,duplicate,group,ungroup,clip,unclip,maskDisable,maskEnable,maskDelete,maskInvert,maskLink,maskUnlink,rename,opacity,blendMode,show,hide,paintOnMask,paintOnImage,folder,background}`、`image.blend.<camelCase 的 24 個名字>`、`image.zoom`。CSS 加在 `src/styles.css`，class 前綴 `fv-ie-`。
   - 測試：`src/image-editor/ui/layers/layer-list.browser.test.tsx`（用 `mountEditor`、三層加一個資料夾：右鍵每個項目各一次、每次 undo / redo 都回到前後文件；拖曳排序與拖進資料夾後 `subtreeRange` 連續；Alt 點交界建立剪裁再解除；鍵盤 Tab 進列表、方向鍵換列、Enter 改名、Esc 取消不改；混合模式選 Multiply 後畫面讀回值改變；不透明度拖曳過程不增加 undo 步數、放開只加一步；註冊一個假的 `LayerDecor` 後縮圖與 badge 換成它的；假 `LayerDecor` 的 `onThumbnailClick` 回 true 時 ⌘ 點縮圖不切換 `session.target`、它收到 `mod: true`，回 false 時照預設處理；`registerPropertyPanel` 一個 `when: (l) => l.id === 第二層` 的假面板：選到第二層時屬性欄出現它、選第一層時消失、改第二層名稱後 undo，面板收到的 `layer.name` 跟著變）；`src/image-editor/ui/shortcuts.test.ts`（`Mod+J` 觸發 duplicate；焦點在 input 時不觸發；工具 `onKeyDown` 回 true 時選單快捷鍵不觸發；同 slot 兩個工具 Shift + 鍵循環；註冊假 `SelectionProvider`：`get` 回非 null 時 Delete 呼叫 `clear`、不刪圖層，`get` 回 null 時 Delete 刪圖層，provider 沒有 `clear` 時 Delete 刪圖層，Shift + Delete 不呼叫 `clear`；`registerCore()` 呼叫兩次不丟錯）。
   - verify：`pnpm test src/image-editor/ui && pnpm test:browser src/image-editor/ui && pnpm check`
   - commit：`feat(image-editor): add editor shell, layer panel and core shortcuts`

5. **移動 / 變形、手形、縮放工具與 overlay。**
   - 新 `src/image-editor/tools/transform-tool.ts`（檔頭照 Compositor `Compositor/Document/LayerTransform.swift`：把手位置、Shift 等比、Option 從中心、吸附距離 10）：`transformTool: ToolSpec`（`id: "move"`、`key: "V"`），拖曳框內移動、八個把手縮放、框外旋轉把手；拖曳中 `dispatch(setTransform(...))` 不帶 label，放開時帶 label `image.transform.label` 並對每個 `layerDecors()` 的 `onTransformEnd` 呼叫一次；方向鍵 1 px、Shift + 方向鍵 10 px（`onKeyDown`）；吸附到畫布與其他可見圖層的邊和中心（螢幕上 10 px 內），`drawOverlay` 畫框、把手與吸附線。`Mod+T` 用 `registerMenuItem`（`menu: "edit"`）切到這個工具。有選取時交給 11（「判斷」的快捷鍵衝突）：`onPointerDown` 時 `api.selection()` 不是 null 而且 `selectionProvider()?.move`（`src/image-editor/registry.ts`）存在 → 這次拖曳的 down / move / up 都轉給 `move.onPointerDown` / `onPointerMove` / `onPointerUp`，不變形圖層；`onKeyDown` 在有選取時先問 `move.onKeyDown`，回 true 就停；`drawOverlay` 在有選取且 `move.drawOverlay` 存在時只畫它；`onDeactivate` 呼叫 `move.onDeactivate?.(api)`。
   - 新 `src/image-editor/tools/snap.ts`：`snapOffset(box: Rect, targets: { xs: number[]; ys: number[] }, threshold: number): Point`（純函式）。
   - 新 `src/image-editor/tools/transform-panel.tsx`：`TransformPanel({ api })`：X、Y、寬、高、角度五個 `NumberField`（`src/primitives/number-field.tsx`），鎖比例的切換；「翻轉水平」「翻轉垂直」兩顆。
   - 新 `src/image-editor/tools/hand-tool.ts`（`id: "hand"`、`key: "H"`）與 `src/image-editor/tools/zoom-tool.ts`（`id: "zoom"`、`key: "Z"`，點一下放大、Alt 點縮小）；`Mod+0` 符合視窗、`Mod+1` 100%、`+` `-` 用 `registerMenuItem`（`menu: "hidden"`）。
   - 改 `src/image-editor/core.ts` 的 `registerCore()`：加 `registerTool(transformTool)`、`hand`、`zoom`，以及上面的選單項目；選單「影像」加「翻轉畫布水平」「翻轉畫布垂直」「順時針轉 90°」「逆時針轉 90°」（`flipCanvas`、`rotateCanvas`，`src/image-editor/doc/commands/geometry.ts`）。
   - i18n（`src/image-editor/messages-en.ts`、`messages-zh-tw.ts`）：`image.tools.{move,hand,zoom}`、`image.transform.{label,x,y,width,height,angle,lockRatio,flipH,flipV}`、`image.canvas.{flipCanvasH,flipCanvasV,rotateCw,rotateCcw}`、`image.view.{fit,actual}`。
   - 測試：`src/image-editor/tools/snap.test.ts`（9 px 內吸到、11 px 不吸；同時吸 x 與 y；中心對中心）；`src/image-editor/tools/transform-tool.browser.test.tsx`（用 `src/image-editor/test/mount-editor.tsx` 的 `mountEditor`：拖曳移動後只多一步 undo；Shift 拖角等比；Alt 從中心；旋轉 90° 後 `rotation` 為 90；面板輸入寬 200 後 transform 的寬是 200；方向鍵與 Shift + 方向鍵；註冊的假 `onTransformEnd` 每次放開被呼叫一次；註冊假 `SelectionProvider`（`get` 回非 null、`move` 的三個 pointer 函式是 spy）時拖曳只呼叫 spy、圖層 transform 不變，`get` 回 null 時照常移動；換到 `hand` 工具時 `move.onDeactivate` 被呼叫；`Mod+0` 後整張畫布在視窗內；畫布轉 90° 後畫布寬高互換、讀回的合成結果等於原圖轉 90°）。
   - verify：`pnpm test src/image-editor/tools && pnpm test:browser src/image-editor/tools && pnpm check`
   - commit：`feat(image-editor): add move and transform, hand and zoom tools`

6. **裁切、畫布尺寸、影像尺寸、向下合併與合併資料夾。**
   - 新 `src/image-editor/tools/crop-tool.ts`（`id: "crop"`、`key: "C"`）：拖出裁切框，比例選項 `free`、`original`、`1:1`、`4:3`、`3:2`、`16:9`、`9:16`、`3:4`（02 的 `ToggleGroup`（`src/primitives/toggle-group.tsx`） 放在 `src/image-editor/tools/crop-panel.tsx`），Alt 對稱裁，Enter 呼叫 `crop(rect)`（`src/image-editor/doc/commands/geometry.ts`）並記一步，Esc 放棄；像素不動。
   - 新 `src/image-editor/ui/canvas-size-dialog.tsx`（02 的 `Dialog`、`NumberField`、`Button`，都在 `src/primitives/`）：寬、高、九宮格錨點，確定時 `canvasSize(w, h, anchor)`。新 `src/image-editor/ui/image-size-dialog.tsx`（同樣用 02 的 `Dialog`、`NumberField`、`Button`）：寬、高、鎖比例；確定時對每層與每個遮色片用新檔 `src/image-editor/engine/resample.ts` 的 `resample(gl, src: WebGLTexture, from: { w; h }, to: { w; h }): WebGLTexture`（縮小時每次對半 LINEAR 直到 < 2 倍再 LINEAR 到目標；放大一次 LINEAR）重新取樣，transform 等比縮放，`checkBudget` 不過就不做並在對話框顯示 `image.open.budget`；整個操作 `commit` 一步（tiles 是每層整張的 before / after）。兩個對話框的入口是選單「影像」的兩個 `registerMenuItem`。
   - 新 `src/image-editor/engine/merge.ts`：`mergeDown(api, id): void`（把 id 與它下面那一層以 `render` 合成到下面那層的新像素，範圍是兩層的聯集，刪掉 id，`commit` 一步）、`mergeFolder(api, folderId): void`（資料夾內全部合成成一層取代資料夾）。新層的像素來源標成 `{ kind: "gpu" }`。`registerMenuItem`：`layer.mergeDown`（`Mod+E`，`menu: "layer"`）、`layer.mergeFolder`；`src/image-editor/ui/layers/layer-menu.tsx` 的固定項目加這兩項。這些註冊加在 `src/image-editor/core.ts` 的 `registerCore()`。
   - i18n（`src/image-editor/messages-en.ts`、`messages-zh-tw.ts`）：`image.tools.crop`、`image.crop.{free,original,confirm,cancel}`、`image.canvasSize.{title,width,height,anchor}`、`image.imageSize.{title,width,height,lockRatio}`、`image.canvas.{canvasSize,imageSize}`、`image.layers.{mergeDown,mergeFolder}`。
   - 測試：`src/image-editor/tools/crop-tool.browser.test.tsx`（`mountEditor`：每種比例拖出的框符合比例；Alt 對稱；Enter 後畫布大小與每層 origin 正確、`textures` 的像素沒變；Esc 不改文件）；`src/image-editor/engine/resample.browser.test.ts`（4000 → 1000 的棋盤格沒有摩爾紋：讀回後平均灰度與 0.5 差 ≤ 2/255；放大兩倍邊長正確）；`src/image-editor/engine/merge.browser.test.ts`（Multiply 的上層向下合併後畫面讀回值不變、圖層數少一；合併資料夾後讀回值不變；undo 回到兩層且像素相同）；`src/image-editor/ui/image-size-dialog.browser.test.tsx`（超過預算時不做並顯示訊息；等比時改寬高跟著變）。
   - verify：`pnpm test:browser src/image-editor/tools src/image-editor/engine src/image-editor/ui && pnpm check`
   - commit：`feat(image-editor): add crop, canvas size, image size and layer merges`

phase 結尾的 verify：`pnpm test src/image-editor && pnpm test:browser src/image-editor && pnpm check`

## Phase 03 — 開檔、存檔、`.comp.zip` 預覽、context 遺失

blocker：Phase 02；model：opus。

7. **開檔、`ImageEditor` 元件與 `./image-editor` subpath。**
   - 新 `src/image-editor/open/open-failure.ts`：`class OpenFailure extends Error`，建構子 `(error: ViewerError, key: MessageKey, vars?: Vars)`，欄位 `readonly error`、`readonly key`、`readonly vars`；`fromProjectError(e: ProjectError): OpenFailure`，照「契約 / 錯誤對應」：`too_large` → `new OpenFailure(new ViewerError("too_large", { cause: e }), "error.too_large")`；其餘 → `new OpenFailure(new ViewerError("decode_failed", { cause: e }), "image.open.<code 的 camelCase>")`，`invalid` 時 `vars` 是 `{ details: e.details.join("\n") }`。`ViewerError` 來自 `src/contract/errors.ts`，`ProjectError` 來自 `src/comp/index.ts`，`MessageKey` 來自 `src/image-editor/api.ts`，`Vars` 來自 `src/i18n/messages.ts`。
   - 新 `src/image-editor/open/new-manifest.ts`：`newManifest(o: { width: number; height: number; layerId: LayerId; name: string }): Manifest`：`width`、`height`、`version: 11`、`colorSpace: "sRGB"`、`resolution: 72`、`documentID` = `crypto.randomUUID().toUpperCase()`、`activeLayerID` = `layerId`、一層 `{ id: layerId, name, isVisible: true, isGroup: false, opacity: 1, blendMode: "Normal", transform: { origin: [0, 0], size: [width, height], rotation: 0, flipX: false, flipY: false, sampling: "High quality" } }`，不寫 `imageFile`（存檔時由第 8 步的 `src/image-editor/save/project-blob.ts` 補）。09 的 `Manifest` 型別若還有其他必填欄位，值照 09 `fromImage`（`src/comp/index.ts`）產生的 manifest。
   - 新 `src/image-editor/open/open-image.ts`：`openImage(file: FileRef, limits: Limits, textures: TextureStore, signal: AbortSignal): Promise<Doc>`（`TextureStore = ReturnType<typeof createTextureStore>`，`src/image-editor/engine/textures.ts`）。依序：
     1. `file.source.size > limits.previewBytes` → 丟 `new OpenFailure(new ViewerError("too_large"), "error.too_large")`，不讀檔；
     2. `readBlob(file.source, { type: mimeOf(file), signal })`（`src/contract/byte-source.ts`、`src/contract/kinds.ts`），讀錯原樣往上丟（已是 `read_failed`）；
     3. `createImageBitmap(blob, { imageOrientation: "from-image", premultiplyAlpha: "none" })`，失敗丟 `new ViewerError("decode_failed")`；
     4. 寬 × 高 > `IMAGE_MAX_PIXELS`（`src/image-editor/limits.ts`）→ `new OpenFailure(new ViewerError("too_large"), "image.open.tooManyPixels")`；
     5. 建 `OffscreenCanvas(w, h)` 拿 2D context、寫入再讀回一個像素確認，失敗也是 `image.open.tooManyPixels`；
     6. `id = crypto.randomUUID().toUpperCase()`，`textures.upload(id, "image", bitmap)` 後 `bitmap.close()`；回 `{ manifest: newManifest({ width, height, layerId: id, name: "Background" }), pixels: new Map([[id, { image: { kind: "gpu" } }]]) }`。
   - 新 `src/image-editor/open/open-project.ts`：`openProject(file: FileRef, limits: Limits, deps: { textures: TextureStore; maxTexture: number; runner: ReturnType<typeof createWorkerRunner> }, signal: AbortSignal): Promise<Doc>`（`createWorkerRunner` 來自 `src/image-editor/worker/run-in-worker.ts`）。依序：
     1. `file.source.size > limits.projectBytes` → `new OpenFailure(new ViewerError("too_large"), "error.too_large")`，不讀檔；
     2. `bytes = new Uint8Array(await (await readBlob(file.source, { type: "application/zip", signal })).arrayBuffer())`；
     3. `readProject(bytes)`（`src/comp/index.ts`）；丟 `ProjectError` 時改丟 `fromProjectError(e)`（`src/image-editor/open/open-failure.ts`）；
     4. 每層的 `imageFile` / `maskFile` 從 `project.assets.get("images/<檔名>")` 拿 bytes，先用 `pngSize`（`src/comp/index.ts`）算寬高：任一張邊長 > `min(deps.maxTexture, MAX_LAYER_SIDE)` → `new OpenFailure(new ViewerError("too_large"), "image.open.layerTooLarge", { name: 層名 })`；圖層像素加總或遮色片像素加總 > `pixelBudget()`（`src/image-editor/limits.ts`）→ `new OpenFailure(new ViewerError("too_large"), "image.open.budget")`。這兩項都在任何解碼之前；
     5. 每張 PNG 用 `deps.runner.run({ kind: "decodePng", input: { bytes, kind: "layer" } })` 解（遮色片 `kind: "mask"`），`textures.upload` 上傳；回 `{ manifest: project.manifest, pixels }`，`pixels` 每層 `{ image?: { kind: "png", bytes }, mask?: { kind: "png", bytes } }`。
   - 新 `src/image-editor/ui/status.tsx`：`EditorStatus(props: { state: "loading" } | { state: "message"; text: string; onBack(): void })`：loading 畫 02 的 `Spinner`（`src/primitives/spinner.tsx`，`label` = `image.open.loading`）；message 畫 02 的 `AlertIcon`（`src/primitives/glyphs.tsx`）、`text`、「回到預覽」`Button`（`src/primitives/button.tsx`，文字 `image.back`，按下呼叫 `onBack`）。
   - 新 `src/image-editor/image-editor.tsx`：`ImageEditor(props: ImageEditorProps)`（`ImageEditorProps` 來自本步的 `src/image-editor/index.ts`）：最外層 `ViewerRoot`（`src/primitives/root.tsx`，傳 `locale`、`messages`、`theme`、`limits`、`onError`），裡面的元件用 `useRoot()`（`src/primitives/root-context.ts`）拿 `limits`、`report`：
     - 第一次 render 呼叫 `installExtensions()`（`src/image-editor/extensions.ts`）。
     - 根 `div` 的 ref callback 掛 `ResizeObserver`（cleanup 時 disconnect）：寬 < 768 px → 只畫 `EditorStatus`（`text` = `image.narrow`，`onBack` = `props.onClose`），不建 GL、不讀檔；寬度回到 ≥ 768 px 時照常開檔。
     - 寬度夠時在 canvas 的 ref callback 裡建 GL：`createGl`（`src/image-editor/engine/gl/context.ts`，回 null → `report(new ViewerError("webgl_unavailable"))`，畫 `EditorStatus` 顯示 `error.webgl_unavailable`）、`createTextureStore`、`createBufferPool`、`createRenderer`、`createWorkerRunner`、`createDocStore`、`createEditorApi`（第 1–3 步的檔）；`extOf(props.file.name) === "comp.zip"`（`src/contract/kinds.ts`）時 `openProject`，否則 `openImage`；開檔中畫 `EditorStatus` loading。
     - 開檔錯誤：`OpenFailure` → `report(f.error)`、顯示 `label(f.key, f.vars)`（`useLabel()`，`src/image-editor/ui/use-label.ts`）；`ViewerError` → `report(e)`、顯示 `error.<e.code>`；`isAbortError(e)` → 不處理；其他 → `toViewerError(e, "decode_failed")` 後照 `ViewerError` 處理（`src/contract/errors.ts`）。
     - `ui = createUiSlot()`（`src/image-editor/ui-slot.tsx`）在建 GL 時一起建，傳給 `createEditorApi` 與 `EditorShell`；`api` 建好、開檔成功後對 `setups()`（`src/image-editor/registry.ts`）每個函式呼叫 `fn(api, 根 div 所在的 .fv-root)`，卸載時呼叫它們的 cleanup。
     - 成功後畫 `EditorShell`（`src/image-editor/ui/editor-shell.tsx`，`ui` 如上，`name` = `props.file.name`，`saveSlot` 本步傳 null）；在 `store.subscribe` 的回呼裡比對 `store.dirty()`，變了就呼叫 `props.onDirtyChange?.(dirty)`（不用 `useEffect`）。
     - 「關閉」：`store.dirty()` 為 true 時開 02 的 `DiscardDialog`（`src/primitives/dialog.tsx`），`onDiscard` 呼叫 `props.onClose()`；不 dirty 時直接 `props.onClose()`。
     - 卸載（ref callback cleanup）時 abort 讀取、`runner.terminate()`、`destroyGl`。
   - 新 `src/image-editor/index.ts`：內容照「契約 / 公開」。同一個 commit 改 `package.json` 的 `exports` 與 `tsdown.config.ts` 的 `entry`（照「契約 / 公開」的兩行）。
   - i18n（`src/image-editor/messages-en.ts`、`messages-zh-tw.ts`）：`image.open.{loading,notZip,notProject,tooNew,invalid,missingAsset,unsafeEntry,badPng,tooManyPixels,budget,layerTooLarge}`、`image.narrow`、`image.back`。
   - 測試：新 `src/image-editor/test/make-jpeg.ts`：`makeJpeg(w: number, h: number, orientation?: number): Promise<Blob>`（`OffscreenCanvas` 畫漸層後 `convertToBlob({ type: "image/jpeg" })`，有 `orientation` 時在 SOI 後插入一段只含 Orientation tag 的 APP1 Exif 區段；不放二進位 fixture）。新 `src/image-editor/open/open-project.browser.test.ts`（直接呼叫 `openProject`，`runner` 是 `{ run: vi.fn(), terminate: vi.fn() }` 的假物件包住真的 runner：宣告 1 層 40,000 寬的專案丟 `OpenFailure`、`key` 是 `image.open.layerTooLarge`、`vars.name` 是層名，`run` 沒被呼叫；圖層像素加總超過 `pixelBudget()` 丟 `image.open.budget`、`run` 沒被呼叫；`not_project`（用 `fflate` 的 `zipSync({ "a.txt": new Uint8Array(1) })` 做的 zip）丟 `OpenFailure`、`error.code` 是 `decode_failed`、`key` 是 `image.open.notProject`；`limits.projectBytes` 設 10 時丟 `error.too_large` 且 `source.read` 沒被呼叫）。新 `src/image-editor/open/open.browser.test.tsx`（掛 `ImageEditor`，容器 1280 × 800：`makeJpeg(4, 2, 6)` 用 `blobSource`（`src/contract/byte-source.ts`）打開後畫布是 2 × 4；用 `makeDoc`（`src/image-editor/test/make-doc.ts`）的三層 manifest 加 `encodePng`（`src/comp/index.ts`）的純色 PNG 組成 `Project`、`writeProject` 寫出、`bytesSource` 包起來打開，圖層數、名稱、混合模式都在、每層 `pixels` 的 `kind` 是 `"png"`；`src/comp/fixtures/ditto-project.comp.zip`（`import url from "../../comp/fixtures/ditto-project.comp.zip?url"` 再 `fetch`）打得開；壞 zip 顯示 `image.open.notZip` 的英文字串、`onError` 收到 `decode_failed`；`HTMLCanvasElement.prototype.getContext` 對 `"webgl2"` stub 成回 null 時顯示 `error.webgl_unavailable` 的字串並呼叫 `onError`；容器寬 600 px 時顯示 `image.narrow` 的字串、`getContext` 沒被呼叫、按「回到預覽」呼叫 `onClose`；dirty 後按關閉出現 `DiscardDialog`，取消不呼叫 `onClose`、放棄則呼叫；`onDirtyChange` 依序收到 true、false（undo 回去）；`registerSetup` 的假函式在開檔成功後收到 `api` 與 `.fv-root` 一次、卸載後它的 cleanup 被呼叫）。
   - verify：`pnpm test:browser src/image-editor/open && pnpm check && pnpm build && pnpm verify:pack`
   - commit：`feat(image-editor): open images and comp projects and add the image-editor subpath`

8. **存檔與匯出。**
   - 檔名：`stem`、`ext` 用 02 的 `splitName(file.name)`，`suggestedName` 用 02 的 `suggestedName(file.name, ext, mode)`（都在 `src/contract/save.ts`），本份不另寫命名函式。
   - 新 `src/image-editor/save/flatten.ts`：`renderFull(api, doc, opts: { background?: "white" }): Uint8Array`（原尺寸，用 `exportTiles` + `render(..., { forExport: true })` 一塊塊讀回拼成 RGBA8 直通 alpha；畫布 > `EXPORT_MAX_PIXELS` 丟 `ViewerError("too_large")`）、`encodeImage(rgba, w, h, type: "image/png" | "image/jpeg" | "image/webp", quality: number, worker): Promise<{ blob: Blob; type: string }>`（PNG 走 `encodePng` job；JPEG / WebP 用 `OffscreenCanvas` + `putImageData` + `convertToBlob`，先寫讀一個像素確認 canvas 可用，不行丟 `too_large`）。
   - 新 `src/image-editor/save/project-blob.ts`：`projectBlob(api, doc): Promise<Blob>`：有 texture 但沒有 `imageFile` 的層補上 `imageFile`（09 的命名規則 `<ID>.png`；沒有 texture 的空白層照 Compositor 不寫圖）；每層 `pixels` 是 `"png"` 的原樣用 bytes；是 `"gpu"` 的有 `png` 快取就用，否則 `readRegion` 整張後 `encodePng` job；預覽圖：畫布 ≤ `PREVIEW_MAX_PIXELS` 時長邊縮到 ≤ 1024（不放大）在白底合成、`convertToBlob({ type: "image/jpeg", quality: 0.8 })`，否則不寫；組成 09 的 `Project` 交給 `writeProject`（`src/comp/index.ts`）。
   - 新 `src/image-editor/save/save.ts`：`createSaver(deps: { api; store; file: FileRef; onSave: SaveHandler; maxOutputBytes?: number; report(e: ViewerError): void /* useRoot().report，src/primitives/root-context.ts */; notify(key: MessageKey): void })`，回 `{ save(): Promise<void>; saveAs(): Promise<void>; exportAs(opts: { type: "png" | "jpeg" | "webp"; quality: number }): Promise<void>; state(): { saving: boolean; savedAsProject: boolean } }`，分支照「契約 / 存檔」的表；按下時記下 `store.position()`，成功（replace / copy）後 `store.markSaved(那個位置)`；`savedAsProject` 為 true 後 save 一律 `replace` `.comp.zip`、`suggestedName` 用上次 copy 的；輸出 > `maxOutputBytes` 不呼叫 `onSave`，改 `notify("error.output_too_large")` 並 `report(new ViewerError("output_too_large"))`；`onSave` reject → `notify` 顯示 `error.message`、`report(new ViewerError("save_failed", { cause: error }))`；WebP 改成 PNG 時 `notify("image.export.fallbackPng")`。
   - 新 `src/image-editor/save/save-dialog.tsx`（`SaveChoiceDialog({ open, onProject, onFlatten, onCancel })`（02 的 `Dialog`，`src/primitives/dialog.tsx`，`footer` 放三個 `Button`：「存成圖層專案」「合併後取代原圖」、`common.cancel`），「存成圖層專案」是預設焦點，「合併後取代原圖」下面寫「檔案裡不會留下圖層」）、`src/image-editor/save/export-dialog.tsx`（`ExportDialog({ open, onExport, onCancel, canvasOk: boolean })`：02 的 `Dialog`；PNG / JPEG / WebP（02 的 `ToggleGroup`（`src/primitives/toggle-group.tsx`））、品質（`src/primitives/slider.tsx`，02）預設 0.92、說明「不含 EXIF（包含位置）」「顏色為 sRGB」；`canvasOk` 為 false 時 JPEG / WebP 停用並說明）、`src/image-editor/save/save-buttons.tsx`（`SaveButtons({ saver })`：「另存新檔」「匯出」「儲存」，存檔中「儲存」顯示 02 的 `Spinner`（`src/primitives/spinner.tsx`）），由 `src/image-editor/image-editor.tsx` 傳進 `Topbar` 的 `saveSlot`。`registerMenuItem`（`menu: "hidden"`）：`Mod+S`、`Mod+Shift+S`、`Mod+Alt+Shift+S`，加在 `src/image-editor/core.ts`，`run` 透過 `src/image-editor/save/save.ts` 匯出的 `saverOf(api)`（模組層 `WeakMap<EditorApi, Saver>`）找到 saver。
   - i18n（`src/image-editor/messages-en.ts`、`messages-zh-tw.ts`）：`image.topbar.{save,saveAs,export,saving}`、`image.save.{title,asProject,asProjectHint,flatten,flattenHint}`（取消用 `common.cancel`，超過上限用 `error.output_too_large`）、`image.export.{title,png,jpeg,webp,quality,noExif,srgb,fallbackPng,formatUnavailable,tooLarge,confirm}`。
   - 測試：`src/image-editor/save/save.browser.test.tsx`（`mountEditor` 加 `createSaver`，`onSave` 是收集 `SaveRequest` 的假函式：平的 png 文件按儲存 → 一次 `replace` `.png`；平的 avif → `replace` `.jpg` `image/jpeg`；加一層後按儲存出對話框，選專案 → `copy` `.comp.zip` `application/zip`、`suggestedName` 是 `x (edited).comp.zip`，再按儲存 → `replace` 同名；選合併 → `replace` 原格式；另存新檔在非平的文件直接 `copy` `.comp.zip`；匯出 JPEG 的 `mode` 是 `export` 且之後 `dirty` 不變；把 `OffscreenCanvas.prototype.convertToBlob` stub 成回 png → 存成 `.png` 並出現提示；`maxOutputBytes: 10` 時 `onSave` 沒被呼叫且 `report` 收到 `output_too_large`；`onSave` reject 時 dirty 仍為 true、提示條顯示錯誤訊息；存檔中繼續 dispatch，存完 dirty 仍為 true；寫出的 `.comp.zip` 用 09 `readProject` 讀回後 `validateLikeCompositor` 回空陣列、沒改過的層 PNG bytes 與原檔相同、`assets` 的第一個 entry 是 manifest；`decodePng` 解回改過那層的像素與 `readRegion` 相同；畫布 100 MP 以上時匯出回 `too_large`）。
   - verify：`pnpm test:browser src/image-editor/save && pnpm check`
   - commit：`feat(image-editor): save projects and images and export png, jpeg and webp`

9. **`.comp.zip` 預覽與 viewer 接線。**
   - 改 `src/contract/formats.ts`（02）：`ViewKind` 加 `"comp"`。改 `src/contract/kinds.ts`（02）：`formatOf` 第 1 條（檔名小寫後以 `COMP_SUFFIX` 結尾）改成回 `"comp"`；`kindOf` 對 view `"comp"` 不比大小（`tooLarge` false）；`edit` 不動。改 `src/contract/kinds.test.ts`：`a.comp.zip`、`A.COMP.ZIP` 的 `view` 是 `"comp"`；2 GiB 的 `a.comp.zip` `view` 仍是 `"comp"`、`tooLarge` false；`a.zip` 的 `view` 仍是 `null`。
   - 不改 `src/viewer/load.ts`（03）：它對 `"comp"` 已經不讀檔、直接回空的 `Loaded`，body 從 `BodyProps.file.source` 自己讀檔頭。改 `src/viewer/bodies.test.tsx`（03 第 5 步）的鍵集合案例：`Object.keys(bodies).sort()` 改成 `["audio", "comp", "excalidraw", "image", "markdown", "pdf", "text", "video"]`。
   - 新 `src/image-editor/comp-preview.tsx`：`export default function CompPreview(props: { file: FileRef; fail?: (e: ViewerError) => void })`（props 是 03 `BodyProps` 的子集，所以能直接放進 `bodies`）：外層 `div` 的 ref callback 建 `AbortController`，呼叫 `readHead((s, e) => props.file.source.read(s, e, signal))`（`src/comp/index.ts`），cleanup 時 abort 並 revoke 建過的 URL；讀取中畫 02 的 `Spinner`（`label` = `image.preview.loading`）；有 `preview` 就 `URL.createObjectURL(new Blob([preview], { type: "image/jpeg" }))` 放進 `<img alt={file.name}>`；回 null、沒有 `preview` 或丟 `ProjectError` 時畫 02 的 `FileIcon`（`src/primitives/glyphs.tsx`）與 `image.preview.none`；其他錯誤：`isAbortError(e)` 就不處理，否則 `props.fail?.(toViewerError(e, "read_failed"))`（`src/contract/errors.ts`，03 會顯示錯誤狀態）。字串用 `useT(imageMessages)`（`src/i18n/use-t.ts`、`src/image-editor/messages.ts`）。本檔 import 的允許清單是 `react`、`../comp/index`、`../contract/*`、`../i18n/*`、`../primitives/*`、`./messages`；不 import `src/image-editor/engine/`、`worker/`、`src/viewer/` 的任何檔（00-overview §4）。
   - 改 `src/viewer/bodies.tsx`（03）：`bodies` 加 `comp: lazy(() => import("../image-editor/comp-preview"))`。
   - 本步不改 `src/viewer/editors.ts`（`image` 由 v0.3 發版的 commit 登錄），不改 viewer 的「編輯」鈕。
   - i18n（`src/image-editor/messages-en.ts`、`messages-zh-tw.ts`）：`image.preview.{none,loading}`。
   - 測試：
     - `src/image-editor/comp-preview.imports.test.ts`：node 讀 `src/image-editor/comp-preview.tsx` 的原始碼，抓出所有 import 路徑，只准上面的允許清單。
     - `src/image-editor/comp-preview.test.tsx`（jsdom，包在 `ViewerRoot` 裡）：`writeProject({ ...fromImage({ width: 64, height: 64, rgba }, "a"), preview: <任意 JPEG bytes> })`（`src/comp/index.ts`）寫出、包成記錄每次 `read(start, end)` 的 `ByteSource`：顯示 `<img>`，每次讀取的 `end` 都小於檔案總長（圖層 PNG 在預覽圖之後，沒被讀到）；`src/comp/fixtures/ditto-project.comp.zip`（`node:fs` 讀進來，`bytesSource` 包）顯示 `image.preview.none` 的字串；`read` 丟 `new ViewerError("read_failed")` 時 `fail` 收到 `read_failed`；卸載後 `URL.revokeObjectURL` 被呼叫。
     - 新 `src/image-editor/comp-preview.viewer.test.tsx`（jsdom）：`FileViewer`（`src/viewer/file-viewer.tsx`）開上面那個有預覽圖的 `x.comp.zip`：出現 `<img>`，沒有任何 `read` 讀到檔尾。
   - verify：`pnpm test src/image-editor/comp-preview src/viewer/bodies.test.tsx src/contract && pnpm check`
   - commit：`feat(image-editor): preview comp projects from the zip header in the viewer`

10. **context 遺失重建、背景 PNG 快取與資源釋放。**
    - 新 `src/image-editor/engine/png-cache.ts`：`createPngCache(api, store)`：store 每次有 label 的變更後（`subscribe` 加上比對 `position()`），對 `pixels` 是 `{ kind: "gpu" }` 且沒有 `png` 的層（image 與 mask）排一個工作：`readRegion` 整張 → `runInWorker({ kind: "encodePng" })` → 以不記 undo 的 `dispatch` 把結果寫進 `pixels` 的 `png`；同一層的新改動會作廢還沒完成的舊工作（`AbortController`）。（`src/image-editor/editor-api.ts` 的 `commit` 已經在每次像素改動時把該層標成沒有 `png` 的 `"gpu"`，本步不改它。）
    - 新 `src/image-editor/engine/context-loss.ts`：`watchContextLoss(canvas, deps: { rebuild(): Promise<void>; setBlocked(b: boolean): void; notify(key: MessageKey | null): void })`：`webglcontextlost` 時 `preventDefault()`、`setBlocked(true)`、`notify("image.notice.contextLost")`；`webglcontextrestored` 時 `rebuild()`（重建 programs、buffer 池，從 `pixels` 的 `bytes` / `png` 用 `decodePng` job 重新上傳每層；沒有 png 的 `"gpu"` 層等 `png-cache` 完成；undo 的 tiles 在記憶體不受影響），完成後 `setBlocked(false)`、`notify(null)`。`src/image-editor/image-editor.tsx` 接上：blocked 時畫布不收 pointer、頂列按鈕停用。
    - 卸載清理（改 `src/image-editor/image-editor.tsx`）：abort 所有讀取與 png-cache 工作、`worker.terminate()`、`textures` 全刪、`destroyGl`、revoke 編輯器建過的所有 `blob:` URL（集中在新檔 `src/image-editor/object-urls.ts` 的 `createObjectUrls(): { create(blob: Blob): string; revokeAll(): void }`）。
    - i18n（`src/image-editor/messages-en.ts`、`messages-zh-tw.ts`）：`image.notice.contextLost`。
    - 測試：`src/image-editor/engine/context-loss.browser.test.tsx`（`mountEditor`、畫一筆讓一層變 `"gpu"`、等 png-cache 完成；`WEBGL_lose_context.loseContext()` 後提示條出現、pointer 被擋；`restoreContext()` 後 `readComposite` 與遺失前逐像素相同、提示條消失）；`src/image-editor/engine/png-cache.browser.test.ts`（`commit` 後該層 `png` 被清掉，稍後重新出現且 `decodePng` 解回與 `readRegion` 相同；連續兩次 commit 只有最後一次的結果留下）；`src/image-editor/image-editor.browser.test.tsx`（卸載後 `gl.isContextLost()` 為 true、`Worker.prototype.terminate` 被呼叫、`URL.revokeObjectURL` 次數等於 `createObjectURL` 次數）。
    - verify：`pnpm test:browser src/image-editor/engine src/image-editor/image-editor.browser.test.tsx && pnpm check`
    - commit：`feat(image-editor): rebuild after webgl context loss and cache layer pngs`

phase 結尾的 verify：`pnpm test && pnpm test:browser && pnpm check`

## Phase 04 — 整合測試與文件

blocker：Phase 03；model：sonnet。

11. **整合測試。**
    - 新 `src/image-editor/story.browser.test.tsx`：在 1280 × 800 的容器裡掛上 `ImageEditor`（`src/image-editor/index.ts`），`file` 是 `{ name: "photo.jpg", mime: "image/jpeg", source: blobSource(await makeJpeg(64, 48)) }`（`blobSource` 是 02 的，`makeJpeg` 在 `src/image-editor/test/make-jpeg.ts`）。依序：新增圖層與資料夾 → 把新圖層改 Multiply、不透明度 50 → 加遮色片並反轉 → 建立剪裁 → 用面板把圖層寬改 32 → 裁切 1:1 → 按「儲存」選「存成圖層專案」（`onSave` 收到 `copy` `.comp.zip`）→ 用收到的 Blob 以 `blobSource` 重開一個 `ImageEditor`，圖層數、混合模式、不透明度、遮色片、剪裁都在，`readComposite` 與存之前逐像素相同 → 匯出 JPEG（`onSave` 收到 `export` `.jpg`，用 `createImageBitmap` 解得開、尺寸 48 × 48）→ 整個過程沒有任何 `replace`。另一個 case：只用鍵盤：Tab 進圖層面板、方向鍵換列、Enter 改名、Esc 取消、`Mod+J` 複製、`Mod+Z` 還原。
    - 改 `src/image-editor/` 裡所有抄 Compositor 的檔（`doc/tree.ts`、`doc/history.ts`、`engine/stacks.ts`、`engine/render.ts`、`tools/transform-tool.ts`）確認檔頭與「判斷」最後一點的格式完全相同；新 `src/image-editor/headers.test.ts`（node 讀這五個檔的第一行，與格式字串比對）。
    - verify：`pnpm test && pnpm test:browser && pnpm check`
    - commit：`test(image-editor): cover the layer editor end to end`

12. **docs 站的 API 與接法。**
    - 改 05 的 API 頁（`site/` 底下列出每個 subpath 的那一頁，實作時 `grep -rln "video-editor" site/` 找到）：加 `./image-editor` 一節：`ImageEditorProps` 每個欄位一行、存檔規則表（照「契約 / 存檔」）、上限（一般影像 64 MiB / 40 MP、`.comp.zip` 1 GiB、像素預算 200 MP / 觸控裝置 50 MP、匯出 100 MP）、需要 WebGL2 與 `EXT_color_buffer_float`（沒有時退回 8-bit）。改 `docs/guides/connect.md`（05 的「接上你的 app」）：寫明 image editor 的 worker 需要宿主的 Vite `optimizeDeps.exclude: ["@anyknown/file-viewer"]`、CSP 不必加 `worker-src`（同源 module worker 退到 `script-src 'self'`）。
    - 改 `site/vite.config.ts`（05）：加 `optimizeDeps: { exclude: ["@anyknown/file-viewer"] }`（已有 `optimizeDeps` 就把這個 key 合併進去；00-overview §4、§9.8）。
    - verify：`pnpm site:build && pnpm check`
    - commit：`docs(image-editor): document the image editor api and host setup`

整份的 verify：`pnpm test && pnpm test:browser && pnpm check && pnpm verify:pack`

驗收（主 agent）：本機 `pnpm site:dev` 的 playground 打開一張 jpeg 與 09 的 Compositor fixture，亮暗兩種各看一次；有 Compositor 的 Mac（這台 macOS 26.5）上，用 Xcode 建 Compositor @11d8d7a，打開本份存出的 `.comp.zip` 解壓後的 `.comp`：圖層、資料夾、遮色片、混合模式、不透明度都在；建不起來就在回報寫一行說沒驗。入口檢查與授權檢查照常綠。

## 宿主要做（H1 storage 22 Phase 3，本份不做）

- 「編輯」入口改用 `FileViewer` 的 `onSave`；`SaveRequest` 的命名撞名（`editedName`）、上傳、replace 成功後舊檔進垃圾桶（storage 16）與 toast `trash.saved_replaced`；replace 的對象是「本 session 最後一次 replace / copy 存成的檔」（一開始是原檔），export 不改變它。
- 編輯影像時把容器放大到全螢幕（`ImageEditor` 只撐滿容器）；`.comp.zip` 上傳 mime `application/zip`。
- `ByteSource` 接 SDK `files.reader`（預覽 `.comp.zip` 只讀檔頭）；幾百 MB 的專案 Blob 上傳不整包讀；`maxOutputBytes`。
- Vite `optimizeDeps.exclude: ["@anyknown/file-viewer"]`；`public/third-party-notices.txt` 收錄本套件的 `THIRD_PARTY_NOTICES.md`（已含 Compositor）。

## 之後再做

- 選取主體、物件選取、去背（要自架瀏覽器端模型，授權另查）。
- 塗抹 / 液化、模糊工具、自由扭曲與透視（Compositor 的 `MetalWarp` 可照抄）。
- Camera Raw、暈影、Bloom、Tonal Contrast、鏡頭校正、Dither 等一次性濾鏡。
- PSD 匯入 / 匯出（ag-psd）、HEIC、RAW。
- 參考線、格線、尺規的編輯（`guides` 原樣保留、不畫）。
- 寬度 < 768 px 的編輯；多個專案分頁；Darker / Lighter Color；16-bit 色深；CMYK；箭頭標註。
- 匯出超過 100 MP 的畫布（串流 PNG 編碼）、超過 `MAX_TEXTURE_SIZE` 的圖層切成多張 texture。
- WebGPU（GLSL 轉 WGSL）；AVIF / WebP 編碼器（jSquash）讓每種瀏覽器都能匯出原格式。
- 批次處理（多張一起縮放 / 轉格式）；grid 縮圖顯示專案預覽圖（宿主）。
