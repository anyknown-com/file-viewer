# 10 image-editor — 圖層式影像編輯器的核心：文件、WebGL2 合成、24 種混合模式、遮色片、變形、undo、存檔匯出、`.comp.zip` 預覽

狀態：planned（2026-10-08）；blocker：03 viewer-core（編輯切換點與 body 分派）、09 comp-format（`src/comp/index.ts` 的讀寫、PNG 編解碼、manifest 型別）；model：Phase 01–03 opus，Phase 04 sonnet；push：整份做完一次。11、12、13 的 blocker 是本份 Phase 01（第 1 到 3 步），那三步定下的介面寫在「契約」，之後只加不改。
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

- 輸入是 `FileRef`（`ByteSource`），不是 Blob；字串走 02 的 i18n（`src/i18n/`），不收 `t`；互動元件用 `@base-ui/react` 加 `--ak-*` plain CSS，不用 shadcn。
- 不開全螢幕 Dialog：`ImageEditor` 撐滿宿主給的容器（00-overview §3「版面」）。容器寬 < 768 px 時 viewer 的「編輯」鈕停用並顯示說明 tooltip（storage 是看視窗寬）。
- toast 歸宿主，所以編輯器自己的提示（WebP 改存 PNG、顯示卡重置、尚未支援的調整）顯示在編輯器頂列下方的提示條 `fv-ie-notice`。
- GL 測試用 `pnpm test:browser`（headless Chromium 的真 WebGL2），取代 storage 的 dev-only 自我測試頁與 agent-browser 走查；storage 第 6 步的 e2e Story 改成 `story.browser.test.tsx`。
- `.comp.zip` 的預覽元件在本套件（`src/image-editor/comp-preview.tsx`，用 09 的 `readHead` 經 `ByteSource.read` 只讀檔頭），storage 的 `project-preview.tsx` 不做。ViewKind 加 `"comp"`（00-overview §3 只加）。
- 文件 store 用 `useSyncExternalStore` 的外部 store（工具與 worker 回呼要在 React 外讀寫文件），不用 `useReducer`。
- 擴充點用明確的 `installExtensions()` 呼叫各份的 `register*()`，不靠 side-effect import：01 的 `package.json` 是 `"sideEffects": ["**/*.css"]`，bundler 會把只為了註冊而 import 的模組刪掉。
- 為了 11–13，storage 13 §5 之外再加：`registerMenuItem`（選單與快捷鍵）、`registerLayerDecor`（圖層列縮圖、`fx` 標記、變形後重畫）、`registerOverlay`（常駐的 overlay，選取虛線）、`readComposite`、`layerMatrix`、`snapshotTiles`、`checkBudget`、`setSession`（`renderHidden`）、`requestRender`。全部在第 1 到 3 步做好。
- LUT 類調整（8 種）由 10 的合成 shader 查表：12 的 `lut` 回已上傳的 texture，10 負責取樣；`pass` 類（4 種）由 12 自己畫。
- PNG 編碼一律走 worker 的 `encodePng` job（第 1 步）：存檔流程（第 8 步）把每個像素來源是 `"gpu"` 的層讀回、經這個 job 編成 PNG；背景快取（第 10 步）同一個 job；11 的剪貼簿直接呼叫它。13 只用 `writeRegion` 寫像素，不自己編 PNG。
- storage 的「一列一列編 PNG」不做：匯出與預覽圖的畫布上限 100 MP（Compositor 的來源像素總上限），整張讀回後交給 `encodePng`；超過就不給匯出並說明。串流編碼放「之後再做」。
- 釋出閘門：`src/contract/image-edit.ts` 的 `IMAGE_EDITOR_ENABLED = false`，`kindOf` 在 false 時對一般影像與 `.comp.zip` 都回 `edit: null`（同 storage 13 狀態行：五份一起驗收才開入口）。改成 `true` 是 v0.3 發版那個 commit 的事（主 agent，在 11、12、13 都驗收後），不在本份的步驟裡。`./image-editor` subpath 照常可以直接用。

## 契約

只加不改 00-overview §3。新 export 只有 `./image-editor` 的 `ImageEditor` 與 `ImageEditorProps`；沒有新錯誤碼。下面的「擴充介面」是 repo 內部給 11–13 用的，不從任何 subpath 匯出。

### 公開（`src/image-editor/index.ts`）

```ts
import type { FileViewerProps, SaveHandler } from "../contract"; // 02 定的 §3 型別
export type ImageEditorProps =
  Pick<FileViewerProps, "file" | "locale" | "messages" | "theme" | "limits" | "onError" | "onDirtyChange"> & {
    onSave: SaveHandler;
    onClose: () => void;      // 沒有未存的修改，或使用者已在「放棄修改？」按確定
    maxOutputBytes?: number;  // 輸出 Blob 超過就不呼叫 onSave，回 output_too_large
  };
export function ImageEditor(props: ImageEditorProps): JSX.Element;
```

### §3 的增補（`src/contract/`）

- `ViewKind` 加 `"comp"`：檔名以 `.comp.zip` 結尾（不分大小寫）時 `kindOf` 回 `view: "comp"`（不受閘門影響，第 9 步加）。
- `EditKind` 的 `"image"`（第 1 步）：`IMAGE_EDITOR_ENABLED` 為 true 時，(a) 副檔名 `.jpg .jpeg .png .webp .avif .bmp`（不分大小寫），或 mime 是 `image/jpeg`、`image/png`、`image/webp`、`image/avif`、`image/bmp`（mime 空的或 `application/octet-stream` 時只看副檔名），而且 `size ≤ limits.previewBytes`；(b) `.comp.zip` 而且 `size ≤ COMP_MAX_BYTES`（1 GiB）。其餘（gif、svg、heic、`.zip`、超過上限）回 null。
- 新檔 `src/contract/image-edit.ts`：`export const IMAGE_EDITOR_ENABLED = false;`、`export const COMP_MAX_BYTES = 1024 ** 3;`、`export function isCompName(name: string): boolean`、`export function imageEditKind(file: { name: string; mime?: string; size: number }, limits: Limits): "image" | null`（不看閘門的純判斷；`kindOf` 呼叫它再套閘門）。

### 存檔（`SaveRequest` 的填法）

`stem` = 檔名去掉副檔名，`.comp.zip` 整個當一個副檔名（`a.comp.zip` → `a`）。`suggestedName`：replace = `stem + ext`；copy / export = `` `${stem} (edited)${ext}` ``。撞名由宿主處理。

| 情況 | 「儲存」 | 「另存新檔」 |
| --- | --- | --- |
| 來源是 `.comp.zip`，或本次 session 已存成專案 | `replace`，`ext ".comp.zip"`、`mime "application/zip"`、09 `writeProject` | `copy`，ext 與 mime 照左欄 |
| 來源是一般影像、文件是「平的」 | `replace`，同格式（png→`.png`；jpeg 保留原本的 `.jpg` / `.jpeg`；webp→`.webp`；avif、bmp→`.jpg` `image/jpeg`） | `copy`，ext 與 mime 照左欄 |
| 來源是一般影像、文件不是平的 | 對話框：「存成圖層專案」（預設，`copy` `.comp.zip`，成功後本 session 變成「已存成專案」）或「合併後取代原圖」（`replace`，格式規則照「平的」那一列的「儲存」） | `copy` `.comp.zip`，成功後同樣變成「已存成專案」 |

- 「平的」：只有一層、不是資料夾、沒有 `adjustment` / `maskFile` / `maskSourceID` / `effects` / `text` / `shape`、`opacity` 是 1 或沒寫、`blendMode` 是 `"Normal"` 或沒寫、`isVisible` 為 true、transform 蓋滿畫布（origin 0,0、size = 畫布、`rotation` 0、沒翻轉）。
- 「匯出」：對話框選 PNG / JPEG / WebP（JPEG、WebP 品質滑桿預設 0.92），`mode: "export"`、`` `${stem} (edited).png|.jpg|.webp` ``，不改變「目前的檔」。JPEG 鋪白底（同預覽圖）。`OffscreenCanvas.convertToBlob` 回來的 `type` 跟要的不同（Safari 的 WebP）時改存 PNG、副檔名改 `.png`，提示條說明。畫布 > 100 MP 時不給匯出；JPEG / WebP 在瀏覽器 canvas 建不出來（建 `OffscreenCanvas` 拿到 context、寫入再讀回一個像素確認）時只給 PNG 並說明。
- 「已存成專案」之後的 replace，`suggestedName` 是那次 copy 的 `suggestedName`。宿主規則（H1）：replace 永遠指本 session 最後一次 replace / copy 存成的那個檔，一開始是原檔；export 不改變它。
- 呼叫 `onSave` 前若 `blob.size > maxOutputBytes`：不呼叫，顯示並 `onError` `ViewerError("output_too_large")`。`onSave` reject：編輯器留在原地、保持未存，提示條顯示 `error.message`，`onError` `save_failed`。replace / copy 成功後標成已存（`onDirtyChange(false)`）；export 不影響。
- 存檔中「儲存」轉 spinner，其他輸入照常；存的是按下當時的文件。

### 錯誤對應（全部用 §3 既有的碼）

| 情況 | 碼 | 訊息 key |
| --- | --- | --- |
| 拿不到 WebGL2 context | `webgl_unavailable` | `imageEditor.open.webgl` |
| `source.read` / `blob` 失敗 | `read_failed` | `imageEditor.open.read` |
| `createImageBitmap` 失敗、PNG 解不開 | `decode_failed` | `imageEditor.open.decode` |
| 09 `ProjectError` 的 `not_zip` / `not_project` / `too_new` / `invalid` / `missing_asset` / `unsafe_entry` | `decode_failed` | `imageEditor.open.<code 的 camelCase>`（`invalid` 另列 `details`） |
| 09 `ProjectError` 的 `too_large`、一般影像 > 40 MP、像素預算超過、某層超過 `MAX_TEXTURE_SIZE` 或 30,000 | `too_large` | `imageEditor.open.tooLarge` / `tooManyPixels` / `budget` / `layerTooLarge`（帶層名） |
| 輸出超過 `maxOutputBytes` | `output_too_large` | `imageEditor.save.tooLarge` |
| `onSave` reject | `save_failed` | 顯示 `error.message` |

### 擴充介面（第 1 到 3 步定下，之後只加不改）

型別在 `src/image-editor/api.ts`，註冊函式在 `src/image-editor/registry.ts`，執行時的介面由 `src/image-editor/editor-api.ts` 的 `createEditorApi` 建立。09 的型別從 `src/comp/index.ts` 匯入（storage 17 §4 的名字：`Manifest`、`Project`、`readProject`、`writeProject`、`readHead`、`validateLikeCompositor`、`decodePng`、`encodePng`、`pngSize`、`ProjectError`）。

```ts
// src/image-editor/api.ts
import type { Manifest } from "../comp";
import type { ComponentType, ReactNode } from "react";
export type Layer = Manifest["layers"][number];             // Compositor ProjectLayerRecord：id、name、isVisible、transform、imageFile?、parentID?、isGroup?、opacity?、blendMode?、maskFile?、maskEnabled?、maskSourceID?、maskPlacement?、maskLinked?、adjustment?、effects?、text?、shape?（以及 09 保留的 extra）
export type LayerId = string;                               // 大寫 UUID
export type BlendMode = NonNullable<Layer["blendMode"]>;     // 24 個字串，順序見 BLEND_MODES
export type AdjustmentSettings = NonNullable<Layer["adjustment"]>;
export type AdjustmentKind = AdjustmentSettings["kind"];
export type MessageKey = /* 02 的 Messages key 型別（src/i18n/messages.ts） */;
export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };
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

export type Session = {
  active: LayerId | null;
  target: PixelTarget;                          // 「畫在遮色片上」
  tool: string;                                 // ToolSpec.id
  collapsed: ReadonlySet<LayerId>;
  renderHidden: ReadonlySet<LayerId>;           // 只影響畫面（13 編輯文字時藏那一層），不進文件、匯出照畫
};
export type ViewTransform = { zoom: number; dpr: number; docToScreen: Mat2D; screenToDoc: Mat2D }; // screen = canvas 元素的 CSS px
export type PassView = { scale: number; width: number; height: number; docFromPx: Mat2D };          // 輸出 px → 文件座標
export type EffectTarget = { framebuffer: WebGLFramebuffer; width: number; height: number; pad: number };

export interface EditorApi {
  readonly gl: WebGL2RenderingContext;
  doc(): Doc;
  session(): Session;
  setSession(patch: Partial<Session>): void;
  dispatch(command: Command, label?: MessageKey): void;   // 有 label = 記一步 undo；沒有 = 即時預覽，不記，下一次有 label 的 dispatch / commit 從上一個記錄點算
  commit(label: MessageKey, doc: Doc, tiles: PixelTile[]): void; // 像素已寫進 GPU；tiles 來自 snapshotTiles，commit 讀回 after
  snapshotTiles(id: LayerId, target: PixelTarget, rect: Rect): PixelTile[]; // 改像素之前呼叫，讀回 before
  layerTexture(id: LayerId): WebGLTexture;
  maskTexture(id: LayerId): WebGLTexture | null;
  writeRegion(id: LayerId, target: PixelTarget, rect: Rect, pixels: Uint8Array): void; // 圖層像素座標；image = RGBA8 直通 alpha，mask = R8
  readRegion(id: LayerId, target: PixelTarget, rect: Rect): Uint8Array;
  readComposite(rect: Rect): Uint8Array;                  // 文件座標，合併結果 RGBA8 直通 alpha（原尺寸，不受畫面縮放影響）
  layerMatrix(id: LayerId): Mat2D;                        // 文件座標 → 圖層像素座標
  checkBudget(add: { layerPx?: number; maskPx?: number }): ViewerError | null; // 超過回 too_large
  runInWorker<K extends JobKind>(job: { kind: K; input: JobInput<K> }, transfer?: Transferable[], signal?: AbortSignal): Promise<JobOutput<K>>;
  requestRender(): void;
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
  panel?: ComponentType<{ api: EditorApi }>;                        // 右上屬性欄
};
export type AdjustmentHooks = {                  // lut 與 pass 擇一
  lut?(gl: WebGL2RenderingContext, s: AdjustmentSettings): { dims: 1 | 3; texture: WebGLTexture }; // 1：256×1 RGBA16F TEXTURE_2D，逐通道查；3：33³ RGBA16F TEXTURE_3D，三線性。10 的合成 shader 取樣
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
export function tools(): readonly ToolSpec[]; export function adjustment(kind: AdjustmentKind): AdjustmentHooks | undefined;
export function effects(): EffectsHooks | undefined; export function menuItems(menu: MenuId): readonly MenuItemSpec[];
export function layerDecors(): readonly LayerDecor[]; export function overlays(): readonly OverlaySpec[];
export function resetRegistry(): void; // 只給測試

// src/image-editor/extensions.ts
export function installExtensions(): void; // 冪等；ImageEditor 掛載時呼叫。10 自己的工具與選單由 registerCore() 註冊；11、12、13 各加一行 import 與一行呼叫（各自的 register 函式），不改其他行

// src/image-editor/worker/jobs.ts
export const jobs = {
  encodePng: (input: { width: number; height: number; channels: 1 | 4; data: Uint8Array }, signal: AbortSignal) => Uint8Array, // 09 encodePng
  decodePng: (input: Uint8Array, signal: AbortSignal) => { width: number; height: number; channels: 1 | 4; data: Uint8Array }, // 09 decodePng
  /* 11 加 wand、heal、contentFill；其他份照樣加一個 key */
};
export type JobKind = keyof typeof jobs; export type JobInput<K> = Parameters<(typeof jobs)[K]>[0]; export type JobOutput<K> = Awaited<ReturnType<(typeof jobs)[K]>>;
```

合成規則（`src/image-editor/engine/render.ts`，照 Compositor）：

```
acc = 透明
for L in 可見的非資料夾圖層（祖先資料夾也都可見），樹的順序由下往上：
  if L 在某個剪裁串裡（不是底）: continue
  op = L.opacity × 所有祖先資料夾的 opacity；folders = 所有祖先資料夾啟用中的遮色片相乘
  if L 是調整圖層:
    if L.maskSourceID: continue
    adj = hooks.lut ? 查表(acc) : hooks.pass(acc)；沒註冊的種類略過並在提示條顯示 imageEditor.notice.unsupported
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

測試輔助（11–13 的測試也用）：`src/image-editor/test/make-doc.ts` 的 `makeDoc`（第 2 步）、`src/image-editor/test/mount-canvas.tsx` 的 `mountCanvas`（第 3 步）、`src/image-editor/test/mount-editor.tsx` 的 `mountEditor`（第 4 步）。

i18n：本份加的 key 都在 `imageEditor.*` 底下，`src/i18n/en.ts` 與 `src/i18n/zh-TW.ts` 同一個 commit 加；每一步列出自己加的 key。

## 形式

- `ImageEditor` 撐滿容器。頂列：「關閉」、檔名（未存加 `•`）、undo / redo、「另存新檔」「匯出」「儲存」；頂列下方是選單列（編輯、影像、圖層，11 加選取）與提示條。左側直排工具列（本份放移動 / 變形 `V`、裁切 `C`、手形 `H`、縮放 `Z`；11、13 往裡加）。中間畫布：棋盤格底、滾輪 / 雙指 / `+` `-` `0` / 空白鍵拖曳縮放平移，左下顯示縮放比例；畫布外的底色在亮暗兩種主題都和棋盤格分得開。右側兩欄：上面是目前工具或選到圖層的屬性，下面是圖層面板。
- 圖層面板：每列眼睛、縮圖、名稱（雙擊改名）、遮色片縮圖（點它切換畫在遮色片上）；剪裁的列縮排加折角箭頭；資料夾可展開收合。上方混合模式下拉（照 Compositor 的六組分隔）與不透明度（可拖曳數字）。下方：新增圖層、新增資料夾、加遮色片、刪除。右鍵選單：複製、刪除、群組、解散群組、向下合併、合併資料夾、建立 / 解除剪裁、遮色片停用 / 刪除 / 反轉 / 連結切換。拖曳排序與拖進資料夾；Alt 點兩層交界建立剪裁。
- 變形：框、八個控制點、旋轉把手；Shift 等比、Alt 從中心；屬性欄輸入位置、尺寸、角度；方向鍵 1 px、Shift + 方向鍵 10 px；吸附畫布與其他圖層的邊與中心（螢幕上 10 px 內）。控制點畫在 GL canvas 上面的 2D overlay canvas。
- 裁切：自由、原圖、1:1、4:3、3:2、16:9、9:16、3:4；Alt 對稱；Enter 確認。畫布尺寸（錨點九宮格）、影像尺寸（等比、重新取樣）、翻轉畫布、轉 90° 在選單「影像」。
- 快捷鍵照 Photoshop：`V` `C` `H` `Z`、`Mod+Z` / `Mod+Shift+Z`、`Mod+J` 複製圖層、`Mod+G` 群組、`Mod+Shift+G` 解散、`Mod+E` 向下合併、`Mod+T` 變形、`Mod+S` 儲存、`Mod+Shift+S` 另存、`Mod+Alt+Shift+S` 匯出、`Mod+0` 符合視窗、`Mod+1` 100%。
- 改過沒存就關：AlertDialog「放棄這次的修改？」。
- `.comp.zip` 在 viewer：顯示 `QuickLook/Preview.jpg`（`<img>`）；沒有預覽圖（畫布 > 50 MP 或 Finder 壓的檔）時顯示圖示與「這個專案沒有預覽圖」。

## Phase 01 — 介面、文件模型、合成器

blocker：03、09；model：opus。這三步定下「契約 / 擴充介面」，11、12、13 從這裡開工。

1. **介面、註冊表、worker、閘門與基本元件。**
   - 新 `src/image-editor/api.ts`：照「契約 / 擴充介面」的 api.ts 區塊逐字定義所有型別；另外匯出 `export const BLEND_MODES: readonly BlendMode[]`，24 個字串依序為 `"Normal"`、`"Darken"`、`"Multiply"`、`"Color Burn"`、`"Linear Burn"`、`"Lighten"`、`"Screen"`、`"Color Dodge"`、`"Linear Dodge (Add)"`、`"Overlay"`、`"Soft Light"`、`"Hard Light"`、`"Vivid Light"`、`"Linear Light"`、`"Pin Light"`、`"Hard Mix"`、`"Difference"`、`"Exclusion"`、`"Subtract"`、`"Divide"`、`"Hue"`、`"Saturation"`、`"Color"`、`"Luminosity"`；`export const BLEND_GROUPS: readonly (readonly BlendMode[])[]`：`[Normal]`、`[Darken…Linear Burn]`、`[Lighten…Linear Dodge (Add)]`、`[Overlay…Hard Mix]`、`[Difference…Divide]`、`[Hue…Luminosity]`（Compositor `Document/LayerAppearance.swift` 的 `groups`）。`MessageKey` 用 02 `src/i18n/messages.ts` 匯出的 key 型別（`keyof Messages`；02 若是巢狀物件就用 02 匯出的點號路徑型別）。`ViewerError` 從 `src/contract/` 匯入（02）。
   - 新 `src/image-editor/registry.ts`：照「契約」的 registry 區塊；每個表是模組層級的 `Map`。`registerTool` 在 `id` 重複或 `key` 與已註冊的 `MenuItemSpec.shortcut` 衝突時丟 `Error`；`registerMenuItem` 在 `id` 重複或 `shortcut` 重複時丟 `Error`；`registerAdjustment` 同一個 kind 第二次丟 `Error`，`lut` 與 `pass` 同時給或都沒給也丟；`registerEffects` 第二次丟。新 `src/image-editor/shortcut.ts`：`parseShortcut(s: string): { key: string; mod: boolean; alt: boolean; shift: boolean }`、`matchShortcut(s: string, e: KeyboardEvent): boolean`（`Mod` 在 `navigator.platform` 含 `Mac` 時是 `metaKey`，否則 `ctrlKey`）。
   - 新 `src/image-editor/extensions.ts`：`installExtensions()`，模組層級 `let installed = false`，第一次呼叫時執行本檔列出的 register 函式（本步沒有任何一個，函式體只有旗標）。
   - 新 `src/image-editor/limits.ts`：`MAX_LAYER_SIDE = 30_000`、`IMAGE_MAX_PIXELS = 40_000_000`、`PIXEL_BUDGET_DESKTOP = 200_000_000`、`PIXEL_BUDGET_COARSE = 50_000_000`、`EXPORT_MAX_PIXELS = 100_000_000`、`PREVIEW_MAX_PIXELS = 50_000_000`、`UNDO_MAX_STEPS = 100`、`UNDO_MAX_BYTES = 256 * 1024 ** 2`、`TILE = 256`、`EXPORT_TILE = 2048`、`VIEW_MAX_PIXELS = 4_000_000`、`BUFFER_POOL_MAX = 8`、`BUFFER_MAX_BYTES = 32 * 1024 ** 2`；`pixelBudget(): number`（`matchMedia("(pointer: coarse)").matches` 時回 coarse，否則 desktop；沒有 `matchMedia` 時回 desktop）。
   - 新 `src/image-editor/worker/jobs.ts`：照「契約」的 jobs 區塊，`encodePng` 呼叫 `src/comp/index.ts` 的 `encodePng`、`decodePng` 呼叫 `decodePng`（09）；新 `src/image-editor/worker/worker.ts`：module worker 入口，收 `{ id, kind, input }` 與 `{ id, cancel: true }`，每個 id 一個 `AbortController`，呼叫 `jobs[kind](input, signal)`，回 `{ id, ok: true, output }`（`output` 裡的 `Uint8Array` 以 transfer 回傳）或 `{ id, ok: false, error: { name, message } }`；新 `src/image-editor/worker/run-in-worker.ts`：`createWorkerRunner(): { run<K extends JobKind>(job, transfer?, signal?): Promise<JobOutput<K>>; terminate(): void }`，用 `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })` 延遲到第一次 `run` 才建；`signal` abort 時送 cancel 並以 `DOMException("AbortError")` reject；`terminate` 後 pending 的全部 reject。
   - 新 `src/contract/image-edit.ts`：照「契約 / §3 的增補」；改 `src/contract/kinds.ts` 的 `kindOf`：`edit` 先照 02 現有規則算，image 類一律改成 `IMAGE_EDITOR_ENABLED ? imageEditKind(file, limits) : null`。`src/index.ts` 不匯出 `image-edit.ts` 的任何東西。
   - 新 primitives（Base UI 1.x 的 `@base-ui/react/<name>` 加 plain CSS，樣式只用 `--ak-*`，class 前綴 `fv-`，CSS 加在 `src/styles.css` 尾端）：`src/primitives/alert-dialog.tsx`（`AlertDialog({ open, title, body, confirmLabel, cancelLabel, onConfirm, onCancel })`）、`src/primitives/context-menu.tsx`（`ContextMenu({ items: { id, label, disabled?, onSelect }[], children })`）、`src/primitives/toggle-group.tsx`（`ToggleGroup<T extends string>({ value, options: { value: T; label: string }[], onChange })`）、`src/primitives/select.tsx`（`Select<T extends string>({ value, groups: { value: T; label: string }[][], onChange, label })`，組間畫分隔線）、`src/primitives/number-field.tsx`（`NumberField({ value, min, max, step, onChange, onCommit, label })`，用 Base UI NumberField 的 `ScrubArea` 讓標籤可拖曳）、`src/primitives/menubar.tsx`（`Menubar({ menus: { id, label, items: { id, label, shortcut?, disabled?, onSelect }[] }[] })`）。
   - 測試：`src/image-editor/registry.test.ts`（工具 id 重複丟錯；`key` 與選單快捷鍵衝突丟錯；選單 `shortcut` 重複丟錯；`registerAdjustment` lut 與 pass 同時給 / 都沒給 / 同 kind 兩次都丟錯；`menuItems("edit")` 依 `order` 排序；`resetRegistry` 後全空）；`src/image-editor/shortcut.test.ts`（`"Mod+Shift+S"` 解析；mac 上 metaKey 符合、ctrlKey 不符；非 mac 相反；`"["` 這種符號鍵）；`src/image-editor/extensions.test.ts`（呼叫兩次只執行一次）；`src/image-editor/worker/run-in-worker.browser.test.ts`（真的 worker：`encodePng` 再 `decodePng` 得到相同像素；abort 後 reject `AbortError`；`terminate` 後 pending reject）；`src/contract/image-edit.test.ts`（`.JPG`、空 mime 的 `.png`、`application/octet-stream` 的 `.webp` 回 `"image"`；`a.comp.zip` 與 `A.COMP.ZIP` 回 `"image"`；`.zip`、`.gif`、`.svg`、`.heic` 回 null；超過 `previewBytes` 的 jpeg 與超過 1 GiB 的 `.comp.zip` 回 null；`kindOf` 在閘門 false 時 jpeg 的 `edit` 是 null）；`src/primitives/image-editor-primitives.test.tsx`（AlertDialog 的確定 / 取消 / Esc 各觸發對的回呼；ContextMenu 右鍵開啟、方向鍵移動、Enter 觸發；ToggleGroup 方向鍵換選項；Select 以鍵盤選到第三組的項目；NumberField 輸入 150 時夾到 max 並觸發 `onCommit`）。
   - verify：`pnpm test src/image-editor src/contract src/primitives && pnpm test:browser src/image-editor/worker && pnpm check`
   - commit：`feat(image-editor): add extension registry, worker runner, edit gate and primitives`

2. **文件模型與 undo（純函式，不碰 GL）。**
   - 新 `src/image-editor/doc/tree.ts`（檔頭照 Compositor `Compositor/Document/LayerGroups.swift`）：`children(m: Manifest, parent: LayerId | null): Layer[]`、`ancestors(m, id): Layer[]`（由近到遠）、`depth(m, id): number`、`subtreeRange(m, id): [start: number, end: number]`（資料夾與子孫在陣列中的連續區間）、`isVisibleInTree(m, id): boolean`、`MAX_DEPTH = 64`。
   - 新 `src/image-editor/doc/commands/layers.ts`：`addLayer(opts: { id: LayerId; name: string; above?: LayerId; width: number; height: number }): Command`（新層的 `transform` 蓋滿畫布、沒有 `imageFile`）、`removeLayers(ids: LayerId[]): Command`（資料夾連子孫一起刪；被刪的層若是某些層的 `maskSourceID`，那些層的 `maskSourceID` 拿掉）、`duplicateLayers(ids: LayerId[], newIds: Map<LayerId, LayerId>): Command`、`renameLayer(id, name): Command`、`setVisible(id, visible: boolean): Command`、`setOpacity(id, opacity: number): Command`（夾到 0–1）、`setBlendMode(id, mode: BlendMode): Command`（資料夾不允許非 Normal：回原文件）、`moveLayers(ids: LayerId[], target: { parent: LayerId | null; index: number }): Command`（目標是自己或自己的子孫時回原文件；超過 64 層時回原文件）。新 `src/image-editor/doc/commands/groups.ts`：`groupLayers(ids, folderId: LayerId, name: string): Command`（新資料夾 transform 蓋滿畫布）、`ungroup(folderId): Command`。新 `src/image-editor/doc/commands/masks.ts`：`addMask(id, fill: "white" | "black"): Command`（`maskFile` 設成 09 的命名規則 `<ID>.mask.png`，`pixels.get(id).mask = { kind: "gpu" }`）、`removeMask(id)`、`setMaskEnabled(id, enabled)`、`setMaskLinked(id, linked)`（取消連結時把目前 transform 存進 `maskPlacement`；連結時拿掉 `maskPlacement`）。新 `src/image-editor/doc/commands/clip.ts`：`clipToBelow(id): Command`（下方同層兄弟是串的底就 `maskSourceID = 底`；底不能是資料夾或調整圖層）、`releaseClip(id): Command`。新 `src/image-editor/doc/commands/geometry.ts`：`setTransform(id, t: Layer["transform"]): Command`（`maskLinked` 不是 false 而且有 `maskPlacement` 時跟著平移縮放）、`crop(rect: Rect): Command`（畫布寬高改成 rect，每層與每個 `maskPlacement` 的 origin 減 rect.x / rect.y，guides 同樣位移）、`canvasSize(w: number, h: number, anchor: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): Command`（九宮格錨點，換算成 crop 的位移）、`flipCanvas(axis: "x" | "y"): Command`、`rotateCanvas(dir: 90 | -90): Command`（畫布寬高互換，每層 transform 繞畫布中心轉、`rotation` 加減 90）。新 `src/image-editor/doc/commands/index.ts` 全部 re-export。
   - 新 `src/image-editor/doc/history.ts`（檔頭照 Compositor `Compositor/Document/DocumentHistory.swift`）：`type Step = { label: MessageKey; doc: Doc; tiles: PixelTile[] }`；`createHistory(initial: Doc): History`，`History` 有 `record(step: Step): void`、`undo(): { doc: Doc; tiles: { tile: PixelTile; use: "before" } [] } | null`、`redo(): { doc: Doc; tiles: { tile: PixelTile; use: "after" }[] } | null`、`canUndo()`、`canRedo()`、`position(): number`、`bytes(): number`（只算 tiles 的 before + after）；記錄新步驟時丟掉 redo 分支；超過 `UNDO_MAX_STEPS` 或 `UNDO_MAX_BYTES`（`src/image-editor/limits.ts`）丟最舊的。
   - 新 `src/image-editor/doc/flat.ts`：`isFlat(doc: Doc): boolean`，規則照「契約 / 存檔」的「平的」。
   - 新 `src/image-editor/doc/store.ts`：`createDocStore(initial: Doc): DocStore`，`DocStore` 有 `get(): Doc`、`subscribe(fn: () => void): () => void`（給 `useSyncExternalStore`）、`dispatch(command: Command, label?: MessageKey)`（語意照「契約」的 `EditorApi.dispatch`）、`commit(label, doc, tiles)`（記一步，tiles 原樣存，after 由第 3 步的 `createEditorApi` 先填好）、`undo()` / `redo()`（回傳 `history.ts` 的結果給呼叫端寫像素）、`dirty(): boolean`（目前位置 ≠ 上次 `markSaved` 的位置）、`markSaved(at?: number)`、`position()`。
   - 測試：`src/image-editor/doc/tree.test.ts`（巢狀三層的 `subtreeRange`；子孫不連續的輸入照 `children` 順序走；`depth` 第 64 層）；`src/image-editor/doc/commands.test.ts`（群組再解散回到原陣列；拖進資料夾後資料夾仍是連續子樹；搬進自己的子孫回原文件；超過 64 層回原文件；刪掉剪裁的底，上面的 `maskSourceID` 一起拿掉；資料夾設 Multiply 被拒；`crop` 後每層 origin 位移、`pixels` 不變；`canvasSize` 九個錨點的位移；`rotateCanvas(90)` 兩次等於 `flipCanvas("x")` 再 `flipCanvas("y")` 的位置；`setMaskLinked(false)` 存下 `maskPlacement`，之後移動圖層遮色片不動）；`src/image-editor/doc/history.test.ts`（undo 到底再 redo 回到同一個 `Doc` 物件；第 101 步丟最舊；tiles 總和超過 256 MB 丟最舊；記錄新步驟後不能 redo）；`src/image-editor/doc/flat.test.ts`（一層一般圖回 true；加遮色片、opacity 0.5、`rotation` 15、`flipX`、Multiply、兩層、隱藏，各回 false）；`src/image-editor/doc/store.test.ts`（無 label 的 dispatch 不增加 undo 步數，之後有 label 的 dispatch 一步 undo 回到最後一個記錄點；`dirty` 在 `markSaved` 後為 false、再 dispatch 為 true、undo 回去又是 false；`subscribe` 每次變更通知一次）。測試用的 `Manifest` 由新檔 `src/image-editor/test/make-doc.ts` 的 `makeDoc(spec: { width: number; height: number; layers: Partial<Layer>[] }): Doc` 產生（補上 09 `Manifest` 的必填欄位：`format: "com.compositor.project"`、`version: 11`、`colorSpace: "sRGB"`、`documentID`、`activeLayerID`；每層補 `id`、`name`、`isVisible: true`、蓋滿畫布的 transform），之後的步驟共用它。
   - verify：`pnpm test src/image-editor/doc && pnpm check`
   - commit：`feat(image-editor): add layer document model, commands and snapshot undo`

3. **合成器、像素介面與畫布。**
   - 新 `src/image-editor/engine/gl/context.ts`：`createGl(canvas: HTMLCanvasElement): { gl: WebGL2RenderingContext; floatTargets: "rgba16f" | "rgba8"; maxTexture: number } | null`（`getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false })`；`EXT_color_buffer_float` 或 `EXT_color_buffer_half_float` 有一個就是 `"rgba16f"`）；`destroyGl(gl)`（呼叫 `WEBGL_lose_context.loseContext()`）。新 `src/image-editor/engine/gl/program.ts`：`compile(gl, vs: string, fs: string): WebGLProgram`（失敗時丟含 info log 的 Error）、`fullscreenQuad(gl)`。
   - 新 `src/image-editor/engine/gl/blend.glsl.ts`：匯出 GLSL 字串 `BLEND_GLSL`，一個 `vec3 blend(int mode, vec3 cb, vec3 cs)`，mode 是 `BLEND_MODES`（`src/image-editor/api.ts`）的索引；每個模式前註解公式來源（W3C Compositing and Blending Level 1 的 15 種；Soft Light 用 Photoshop 版；8 種 Photoshop 通行公式）。新 `src/image-editor/engine/blend-ref.ts`：同樣 24 個公式的 TS 版 `blendRef(mode: BlendMode, cb: [number, number, number], cs: [number, number, number]): [number, number, number]` 與 `compositeRef(backdrop: RGBA, source: RGBA, mode): RGBA`（W3C 的 source-over 加混合，0–1 直通 alpha），給測試當參考。
   - 新 `src/image-editor/engine/gl/composite.glsl.ts`：圖層合成 shader：輸入圖層 texture（RGBA8 直通 → 預乘）、遮色片 texture（R8，範圍外用 uniform 給的邊緣值）、資料夾遮色片（最多 8 個 uniform sampler，超過就先在 buffer 裡乘好）、剪裁 coverage texture、opacity、blend mode、`lut1d` / `lut3d` 取樣（`AdjustmentHooks.lut`）、目前累積 buffer；仿射矩陣把輸出 px 對到圖層 UV。
   - 新 `src/image-editor/engine/textures.ts`：`createTextureStore(gl)`，有 `upload(id, target, source: ImageBitmap | { width; height; data: Uint8Array })`（image 是 RGBA8、mask 是 R8；`sampling` 是 `"Nearest"` 時 NEAREST，否則 LINEAR + `generateMipmap`）、`get(id, target)`、`size(id, target)`、`delete(id)`、`totals(): { layerPx: number; maskPx: number }`、`version(id): number`（每次寫入遞增）；上傳前檢查邊長 ≤ `min(maxTexture, MAX_LAYER_SIDE)`，否則丟 `ViewerError("too_large")`。
   - 新 `src/image-editor/engine/buffers.ts`：`createBufferPool(gl, format: "rgba16f" | "rgba8")`，`borrow(w, h): { texture; framebuffer; release(): void }`，最多 `BUFFER_POOL_MAX` 個、每個 ≤ `BUFFER_MAX_BYTES`（`src/image-editor/limits.ts`）。
   - 新 `src/image-editor/engine/stacks.ts`（檔頭照 Compositor `Compositor/Rendering/LiveMaskRenderer.swift`）：`clipStacks(m: Manifest): Map<LayerId, LayerId[]>`（底 → 串）與 `coverageChain(m, id): LayerId[]`（鏈 ≤ 256、有環回空陣列），純函式。
   - 新 `src/image-editor/engine/render.ts`（檔頭照 Compositor `Compositor/IO/ImageExporter.swift` 與 `LiveMaskRenderer.swift`）：`createRenderer(gl, textures, pool)`，`render(doc: Doc, session: Session, out: { framebuffer: WebGLFramebuffer | null; width: number; height: number; docRect: Rect }, opts: { background?: [number, number, number, number]; forExport: boolean }): void`，照「契約 / 合成規則」；調整用 `adjustment(kind)`、效果用 `effects()`（`src/image-editor/registry.ts`）；`forExport` 為 false 時略過 `session.renderHidden` 的層；沒註冊的調整種類或有 `effects` 但沒註冊 `registerEffects` 時回報 `unsupported: true`。新 `src/image-editor/engine/tiles.ts`：`exportTiles(doc, size: number, reach: number, maxTexture: number): Rect[]`（塊加邊超過 `maxTexture` 時回一整張）、`totalReach(doc, scale): number`（所有調整 `reach` 與效果 `reach` 的最大值）。
   - 新 `src/image-editor/engine/pixels.ts`：`createPixels(gl, textures)`，實作 `EditorApi` 的 `layerTexture`、`maskTexture`、`writeRegion`、`readRegion`（RGBA8 直通 alpha 讀回；mask 讀 R8）、`snapshotTiles`（以 `TILE` = 256 切塊讀 before）。新 `src/image-editor/editor-api.ts`：`createEditorApi(deps: { gl; store: DocStore; textures; renderer; pixels; worker: ReturnType<typeof createWorkerRunner>; session: { get(): Session; set(p: Partial<Session>): void }; requestRender(): void }): EditorApi`：`commit` 先對每個 tile 讀回 `after`，把 tiles 碰到的層在 `doc.pixels` 標成 `{ kind: "gpu" }`（沒有 `png` 快取），再 `store.commit`；`writeRegion` 對還沒有 texture 的層先建一張 transform 大小的透明 texture；`readComposite(rect)` 借一個 buffer 以 `forExport: true` 合成後讀回並轉直通 alpha；`layerMatrix(id)` 由 transform 算；`checkBudget` 用 `textures.totals()` 加上 `add` 比 `pixelBudget()`（`src/image-editor/limits.ts`），超過回 `ViewerError("too_large")`；`runInWorker` 轉給 `worker.run`。另外匯出 `applyUndo(api, result)`：把 `store.undo()` / `redo()` 回傳的 tiles 用 `writeRegion` 寫回。
   - 新 `src/image-editor/canvas.tsx`：`EditorCanvas({ api, view, onViewChange })`：GL canvas 與上面一層 2D overlay canvas，大小用 ResizeObserver（ref callback 裡建立、cleanup 時 disconnect），解析度 = CSS 尺寸 × `min(devicePixelRatio, 2)`、總像素 ≤ `VIEW_MAX_PIXELS`；只合成視窗看得到的文件範圍；滾輪 / 觸控板縮放（以游標為中心）、雙指縮放、空白鍵拖曳平移；pointer 事件轉成文件座標交給目前工具（`session.tool` 對到 `tools()` 的 `ToolSpec`）；overlay 先畫 `overlays()` 再畫目前工具的 `drawOverlay`，任何 `OverlaySpec.animated` 為 true 時用 `requestAnimationFrame` 持續重畫。`view` 型別 `{ zoom: number; center: Point }` 定義在本檔並匯出 `toViewTransform(view, size, dpr): ViewTransform`。卸載（ref callback cleanup）時 `destroyGl`。
   - 新 `src/image-editor/test/mount-canvas.tsx`：`mountCanvas(doc: Doc, colors?: Record<LayerId, [number, number, number, number]>): Promise<{ api: EditorApi; store: DocStore; canvas: HTMLCanvasElement; unmount(): void }>`，在 browser 測試裡掛 `EditorCanvas`、把每個非資料夾、非調整圖層上傳成 transform 大小的純色 texture（顏色取 `colors[id]`，沒給就用層的 index 決定的固定色）、建好 `createEditorApi`；本步的 browser 測試與 11–13 的工具測試都用它。
   - 測試：`src/image-editor/engine/blend-ref.test.ts`（24 個模式各對兩組手算值；Soft Light 在 b = 0.25 與 0.75 符合 Photoshop 公式；Hue / Saturation / Color / Luminosity 的 `SetLum` 結果在 0–1 內）；`src/image-editor/engine/stacks.test.ts`（兩層剪裁在同一個底上；底是調整圖層時不成串；中間夾一個非剪裁層時串斷開；環回空陣列；257 層的鏈回空陣列）；`src/image-editor/engine/tiles.test.ts`（5000 × 3000、reach 0 時塊數與邊界；reach 加上去超過 maxTexture 時回一整張）；`src/image-editor/engine/render.browser.test.ts`（真 WebGL2，用 `src/image-editor/test/make-doc.ts` 的 `makeDoc` 加純色 texture：每個混合模式一組固定上下色，讀回值與 `compositeRef` 誤差 ≤ 1/255；資料夾 opacity 0.5 等於子層各減半；資料夾遮色片乘到每個子層；剪裁的上層只出現在底不透明處；隱藏的底照樣剪裁；停用的遮色片不影響；`maskPlacement` 範圍外取邊緣多數值；註冊一個假的 `lut`（3D 反相）與假的 `pass`（填紅）調整各一次，結果正確；`renderHidden` 的層畫面上不見、`forExport` 照畫；分塊（`exportTiles` 用 64 px 的塊）與整張合成逐像素相同；`maxTexture` 假裝 2048 時上傳 3000 寬的層丟 `too_large`）；`src/image-editor/engine/pixels.browser.test.ts`（`writeRegion` 再 `readRegion` 相同；alpha 1–254 的像素讀回顏色不變；`snapshotTiles` 跨 256 邊界切成正確的塊；`commit` 後 undo 再 `applyUndo` 像素回到 before；`readComposite` 對兩層 Normal 的結果；`checkBudget` 超過回 `too_large`）；`src/image-editor/canvas.browser.test.tsx`（掛載後 `gl` 存在；卸載後 `gl.isContextLost()` 為 true；滾輪縮放後游標下的文件點不變；註冊的假工具收到的文件座標正確；`animated` 的 overlay 在兩個 frame 各被呼叫）。
   - verify：`pnpm test src/image-editor/engine && pnpm test:browser src/image-editor/engine src/image-editor/canvas.browser.test.tsx && pnpm check`
   - commit：`feat(image-editor): composite layers with webgl2 and expose pixel and canvas apis`

phase 結尾的 verify：`pnpm test src/image-editor src/contract src/primitives && pnpm test:browser src/image-editor && pnpm check`

## Phase 02 — 編輯器外框、圖層面板、變形與畫布操作

blocker：Phase 01；model：opus。12 的 Phase 03 等第 4 步。

4. **編輯器外框與圖層面板。**
   - 新 `src/image-editor/ui/editor-shell.tsx`：`EditorShell({ api, store, name, view, onViewChange, actions })`，版面照「形式」：頂列（`ui/topbar.tsx`：`Topbar({ name, dirty, canUndo, canRedo, onUndo, onRedo, onClose, saveSlot })`，`saveSlot` 是 ReactNode，本步傳 null）、選單列（`src/primitives/menubar.tsx` 的 `Menubar`，選單「編輯」「影像」「圖層」「選取」各自取 `menuItems(menu)`（`src/image-editor/registry.ts`），沒有項目的選單不顯示）、提示條（`ui/notice.tsx`：`Notice({ messages: MessageKey[] })`，class `fv-ie-notice`）、左側工具列（`ui/toolbar.tsx`：依 `tools()` 排，同 `slot` 的併成一格，長按 400 ms 或右鍵展開）、中間 `EditorCanvas`（`src/image-editor/canvas.tsx`）、右上屬性欄（`ui/properties.tsx`：目前工具的 `panel`）、右下圖層面板。`ui/icons.tsx`：本份用到的 inline SVG 圖示元件（不加圖示套件）。
   - 新 `src/image-editor/ui/layers/layer-list.tsx`（`LayerList({ api })`：樹狀列出，資料夾展開收合存 `session.collapsed`，鍵盤：上下鍵換列、Enter 改名、Esc 取消改名、Space 切換眼睛）、`layer-row.tsx`（眼睛、縮圖：先問 `layerDecors()` 的 `thumbnail`，都回 null 才畫預設縮圖（`readRegion` 縮成 32 px，像素改變時重畫）、名稱、`badge`、遮色片縮圖（點它 `setSession({ target: "mask" })`、點圖層縮圖切回 `"image"`）、剪裁的縮排與折角箭頭）、`layer-drag.ts`（pointer 拖曳排序與拖進資料夾，放開時 `moveLayers`；Alt 點兩列交界呼叫 `clipToBelow` / `releaseClip`）、`layer-menu.tsx`（`src/primitives/context-menu.tsx`；項目：複製、刪除、群組、解散群組、建立 / 解除剪裁、遮色片停用 / 刪除 / 反轉 / 連結切換，再接 `menuItems("layer-context")`）、`appearance.tsx`（混合模式 `src/primitives/select.tsx` 以 `BLEND_GROUPS` 分組；不透明度 `src/primitives/number-field.tsx`，拖曳時 `dispatch` 不帶 label、`onCommit` 時帶 label）、`layer-actions.tsx`（新增圖層、新增資料夾、加遮色片、刪除，加上 `menuItems("layer-new")` 做成的下拉）。全部用 `src/image-editor/doc/commands/index.ts` 的命令；遮色片反轉用 `snapshotTiles` + `readRegion` / `writeRegion` + `commit`。
   - 新 `src/image-editor/core.ts`：`registerCore()`，用 `registerMenuItem` 註冊：`edit.undo`（`Mod+Z`）、`edit.redo`（`Mod+Shift+Z`）、`layer.duplicate`（`Mod+J`）、`layer.group`（`Mod+G`）、`layer.ungroup`（`Mod+Shift+G`）、`layer.new`、`layer.newFolder`、`layer.delete`（`Backspace` 與 `Delete` 都對，`menu: "hidden"` 的第二筆）。`src/image-editor/extensions.ts` 的 `installExtensions` 加一行呼叫 `registerCore()`。
   - 新 `src/image-editor/ui/shortcuts.ts`：`handleKey(e: KeyboardEvent, api): boolean`：先問目前工具的 `onKeyDown`，再比 `menuItems` 全部選單（含 `"hidden"`）的 `shortcut`（`matchShortcut`，`src/image-editor/shortcut.ts`），再比工具的 `key`（Shift + 同鍵在同 `slot` 內循環）；焦點在 input / textarea / contenteditable 時不處理。
   - 新 `src/image-editor/test/mount-editor.tsx`：`mountEditor(doc: Doc, colors?: Record<LayerId, [number, number, number, number]>): Promise<{ api: EditorApi; store: DocStore; unmount(): void }>`，同 `src/image-editor/test/mount-canvas.tsx` 的 `mountCanvas` 的建法，但掛的是整個 `EditorShell`；之後的步驟共用。
   - i18n（`src/i18n/en.ts`、`src/i18n/zh-TW.ts`）：`imageEditor.topbar.{close,undo,redo,unsaved}`、`imageEditor.menu.{edit,image,layer,select}`、`imageEditor.layers.{new,newFolder,addMask,delete,duplicate,group,ungroup,clip,unclip,maskDisable,maskEnable,maskDelete,maskInvert,maskLink,maskUnlink,rename,opacity,blendMode,show,hide,paintOnMask,paintOnImage,folder,background}`、`imageEditor.blend.<camelCase 的 24 個名字>`、`imageEditor.notice.unsupported`、`imageEditor.zoom`。CSS 加在 `src/styles.css`，class 前綴 `fv-ie-`。
   - 測試：`src/image-editor/ui/layers/layer-list.browser.test.tsx`（用 `mountEditor`、三層加一個資料夾：右鍵每個項目各一次、每次 undo / redo 都回到前後文件；拖曳排序與拖進資料夾後 `subtreeRange` 連續；Alt 點交界建立剪裁再解除；鍵盤 Tab 進列表、方向鍵換列、Enter 改名、Esc 取消不改；混合模式選 Multiply 後畫面讀回值改變；不透明度拖曳過程不增加 undo 步數、放開只加一步；註冊一個假的 `LayerDecor` 後縮圖與 badge 換成它的）；`src/image-editor/ui/shortcuts.test.ts`（`Mod+J` 觸發 duplicate；焦點在 input 時不觸發；工具 `onKeyDown` 回 true 時選單快捷鍵不觸發；同 slot 兩個工具 Shift + 鍵循環）。
   - verify：`pnpm test src/image-editor/ui && pnpm test:browser src/image-editor/ui && pnpm check`
   - commit：`feat(image-editor): add editor shell, layer panel and core shortcuts`

5. **移動 / 變形、手形、縮放工具與 overlay。**
   - 新 `src/image-editor/tools/transform-tool.ts`（檔頭照 Compositor `Compositor/Document/LayerTransform.swift`：把手位置、Shift 等比、Option 從中心、吸附距離 10）：`transformTool: ToolSpec`（`id: "move"`、`key: "V"`），拖曳框內移動、八個把手縮放、框外旋轉把手；拖曳中 `dispatch(setTransform(...))` 不帶 label，放開時帶 label `imageEditor.transform.label` 並對每個 `layerDecors()` 的 `onTransformEnd` 呼叫一次；方向鍵 1 px、Shift + 方向鍵 10 px（`onKeyDown`）；吸附到畫布與其他可見圖層的邊和中心（螢幕上 10 px 內），`drawOverlay` 畫框、把手與吸附線。`Mod+T` 用 `registerMenuItem`（`menu: "edit"`）切到這個工具。
   - 新 `src/image-editor/tools/snap.ts`：`snapOffset(box: Rect, targets: { xs: number[]; ys: number[] }, threshold: number): Point`（純函式）。
   - 新 `src/image-editor/tools/transform-panel.tsx`：`TransformPanel({ api })`：X、Y、寬、高、角度五個 `NumberField`（`src/primitives/number-field.tsx`），鎖比例的切換；「翻轉水平」「翻轉垂直」兩顆。
   - 新 `src/image-editor/tools/hand-tool.ts`（`id: "hand"`、`key: "H"`）與 `src/image-editor/tools/zoom-tool.ts`（`id: "zoom"`、`key: "Z"`，點一下放大、Alt 點縮小）；`Mod+0` 符合視窗、`Mod+1` 100%、`+` `-` 用 `registerMenuItem`（`menu: "hidden"`）。
   - 改 `src/image-editor/core.ts` 的 `registerCore()`：加 `registerTool(transformTool)`、`hand`、`zoom`，以及上面的選單項目；選單「影像」加「翻轉畫布水平」「翻轉畫布垂直」「順時針轉 90°」「逆時針轉 90°」（`flipCanvas`、`rotateCanvas`，`src/image-editor/doc/commands/geometry.ts`）。
   - i18n：`imageEditor.tools.{move,hand,zoom}`、`imageEditor.transform.{label,x,y,width,height,angle,lockRatio,flipH,flipV}`、`imageEditor.image.{flipCanvasH,flipCanvasV,rotateCw,rotateCcw}`、`imageEditor.view.{fit,actual}`。
   - 測試：`src/image-editor/tools/snap.test.ts`（9 px 內吸到、11 px 不吸；同時吸 x 與 y；中心對中心）；`src/image-editor/tools/transform-tool.browser.test.tsx`（用 `src/image-editor/test/mount-editor.tsx` 的 `mountEditor`：拖曳移動後只多一步 undo；Shift 拖角等比；Alt 從中心；旋轉 90° 後 `rotation` 為 90；面板輸入寬 200 後 transform 的寬是 200；方向鍵與 Shift + 方向鍵；註冊的假 `onTransformEnd` 每次放開被呼叫一次；`Mod+0` 後整張畫布在視窗內；畫布轉 90° 後畫布寬高互換、讀回的合成結果等於原圖轉 90°）。
   - verify：`pnpm test src/image-editor/tools && pnpm test:browser src/image-editor/tools && pnpm check`
   - commit：`feat(image-editor): add move and transform, hand and zoom tools`

6. **裁切、畫布尺寸、影像尺寸、向下合併與合併資料夾。**
   - 新 `src/image-editor/tools/crop-tool.ts`（`id: "crop"`、`key: "C"`）：拖出裁切框，比例選項 `free`、`original`、`1:1`、`4:3`、`3:2`、`16:9`、`9:16`、`3:4`（`src/primitives/toggle-group.tsx` 放在 `src/image-editor/tools/crop-panel.tsx`），Alt 對稱裁，Enter 呼叫 `crop(rect)`（`src/image-editor/doc/commands/geometry.ts`）並記一步，Esc 放棄；像素不動。
   - 新 `src/image-editor/ui/canvas-size-dialog.tsx`：寬、高、九宮格錨點，確定時 `canvasSize(w, h, anchor)`。新 `src/image-editor/ui/image-size-dialog.tsx`：寬、高、鎖比例；確定時對每層與每個遮色片用新檔 `src/image-editor/engine/resample.ts` 的 `resample(gl, src: WebGLTexture, from: { w; h }, to: { w; h }): WebGLTexture`（縮小時每次對半 LINEAR 直到 < 2 倍再 LINEAR 到目標；放大一次 LINEAR）重新取樣，transform 等比縮放，`checkBudget` 不過就不做並在對話框顯示 `imageEditor.open.budget`；整個操作 `commit` 一步（tiles 是每層整張的 before / after）。兩個對話框的入口是選單「影像」的兩個 `registerMenuItem`。
   - 新 `src/image-editor/engine/merge.ts`：`mergeDown(api, id): void`（把 id 與它下面那一層以 `render` 合成到下面那層的新像素，範圍是兩層的聯集，刪掉 id，`commit` 一步）、`mergeFolder(api, folderId): void`（資料夾內全部合成成一層取代資料夾）。新層的像素來源標成 `{ kind: "gpu" }`。`registerMenuItem`：`layer.mergeDown`（`Mod+E`，`menu: "layer"`）、`layer.mergeFolder`；`src/image-editor/ui/layers/layer-menu.tsx` 的固定項目加這兩項。這些註冊加在 `src/image-editor/core.ts` 的 `registerCore()`。
   - i18n：`imageEditor.tools.crop`、`imageEditor.crop.{free,original,confirm,cancel}`、`imageEditor.canvasSize.{title,width,height,anchor}`、`imageEditor.imageSize.{title,width,height,lockRatio}`、`imageEditor.image.{canvasSize,imageSize}`、`imageEditor.layers.{mergeDown,mergeFolder}`。
   - 測試：`src/image-editor/tools/crop-tool.browser.test.tsx`（`mountEditor`：每種比例拖出的框符合比例；Alt 對稱；Enter 後畫布大小與每層 origin 正確、`textures` 的像素沒變；Esc 不改文件）；`src/image-editor/engine/resample.browser.test.ts`（4000 → 1000 的棋盤格沒有摩爾紋：讀回後平均灰度與 0.5 差 ≤ 2/255；放大兩倍邊長正確）；`src/image-editor/engine/merge.browser.test.ts`（Multiply 的上層向下合併後畫面讀回值不變、圖層數少一；合併資料夾後讀回值不變；undo 回到兩層且像素相同）；`src/image-editor/ui/image-size-dialog.browser.test.tsx`（超過預算時不做並顯示訊息；等比時改寬高跟著變）。
   - verify：`pnpm test:browser src/image-editor/tools src/image-editor/engine src/image-editor/ui && pnpm check`
   - commit：`feat(image-editor): add crop, canvas size, image size and layer merges`

phase 結尾的 verify：`pnpm test src/image-editor && pnpm test:browser src/image-editor && pnpm check`

## Phase 03 — 開檔、存檔、`.comp.zip` 預覽、context 遺失

blocker：Phase 02；model：opus。

7. **開檔與 `ImageEditor` 元件。**
   - 新 `src/image-editor/open/read-all.ts`：`readAll(source: ByteSource, signal: AbortSignal): Promise<Blob>`（有 `source.blob` 就用，否則每次 4 MiB 循序 `read`，片段組成 `Blob`）與 `readAllBytes(source, signal): Promise<Uint8Array>`（`readAll` 後 `arrayBuffer()`；`.comp.zip` 給 09 的 `readProject` 用）。若 03 已在 `src/viewer/` 匯出同樣行為的整檔讀取函式（實作時 `grep -rn "4 \* 1024 \* 1024\|4 MiB" src/viewer`），改用它、不新增 `readAll`。
   - 新 `src/image-editor/open/open-image.ts`：`openImage(file: FileRef, gl, textures, signal): Promise<Doc>`：`readAll` → `createImageBitmap(blob, { imageOrientation: "from-image", premultiplyAlpha: "none" })`（失敗 → `ViewerError("decode_failed")`）→ 寬 × 高 > `IMAGE_MAX_PIXELS` → `too_large`；建一個 `OffscreenCanvas(w, h)` 拿 2D context、寫入讀回一個像素確認（失敗 → `too_large`）→ `textures.upload(id, "image", bitmap)` 後 `bitmap.close()`；文件由新檔 `src/image-editor/open/new-manifest.ts` 的 `newManifest({ width, height, layerId, name: "Background" }): Manifest` 建（`format: "com.compositor.project"`、`version: 11`、`colorSpace: "sRGB"`、`resolution: 72`、新的大寫 UUID `documentID`、一層蓋滿畫布、`sampling: "High quality"`），`pixels` 該層 `{ image: { kind: "gpu" } }`。
   - 新 `src/image-editor/open/open-project.ts`：`openProject(file, gl, textures, worker, signal): Promise<Doc>`：`readAllBytes` → `readProject(bytes)`（`src/comp/index.ts`，09；`ProjectError` 照「契約 / 錯誤對應」轉 `ViewerError`，`invalid` 的 `details` 放進錯誤的 `cause`）→ 對每個 `assets` 先用 09 的 `pngSize` 算寬高：任一層邊長 > `min(maxTexture, MAX_LAYER_SIDE)` → `too_large`（訊息帶層名）；圖層像素加總或遮色片像素加總 > `pixelBudget()` → `too_large`，這兩項都在任何解碼之前 → 每張 PNG 用 `worker.run({ kind: "decodePng", input })` 解、上傳 texture → `pixels` 每層 `{ kind: "png", bytes }`。
   - 新 `src/image-editor/image-editor.tsx`：`ImageEditor(props: ImageEditorProps)`：呼叫 `installExtensions()`（`src/image-editor/extensions.ts`）；在 ref callback 裡建 GL（`createGl`，null → `webgl_unavailable` 狀態）、texture store、renderer、worker runner、`createDocStore`、`createEditorApi`；依 `isCompName(file.name)`（`src/contract/image-edit.ts`）走 `openProject` 或 `openImage`；載入中、錯誤狀態用 02 的根元素（`class="fv-root"`、`data-theme`）與錯誤訊息元件（grep `src/viewer` 的錯誤狀態元件沿用）；錯誤時 `props.onError`；成功後掛 `EditorShell`（`src/image-editor/ui/editor-shell.tsx`）；`store.dirty()` 變化時呼叫 `props.onDirtyChange`；「關閉」在 dirty 時開 `src/primitives/alert-dialog.tsx`，確定或不 dirty 時 `props.onClose()`；卸載時 abort 讀取、`worker.terminate()`、`destroyGl`。`src/image-editor/index.ts` 改成 `export { ImageEditor } from "./image-editor"; export type { ImageEditorProps } from "./api";`（`ImageEditorProps` 照「契約 / 公開」加進 `src/image-editor/api.ts`）。
   - i18n：`imageEditor.open.{loading,read,decode,webgl,notZip,notProject,tooNew,invalid,missingAsset,unsafeEntry,tooLarge,tooManyPixels,budget,layerTooLarge}`、`imageEditor.discard.{title,body,confirm,cancel}`。
   - 測試：新 `src/image-editor/test/make-jpeg.ts`：`makeJpeg(w: number, h: number, orientation?: number): Promise<Blob>`（`OffscreenCanvas` 畫漸層後 `convertToBlob({ type: "image/jpeg" })`，有 `orientation` 時在 SOI 後插入一段只含 Orientation tag 的 APP1 Exif 區段；不放二進位 fixture）。`src/image-editor/open/open.browser.test.tsx`（`makeJpeg(4, 2, 6)` 打開後畫布是 2 × 4；`bytesSource`（02）包一個 09 `writeProject` 寫出的三層專案，打開後圖層數、名稱、混合模式都在、每層 `pixels.kind` 是 `"png"`；`ls src/comp/__fixtures__/*.comp.zip` 的每個 09 fixture 都打得開（Compositor 存、Finder 壓的那個也是）；宣告 1 層 40,000 寬的專案回 `too_large` 而且 `decodePng` job 沒被呼叫（spy `worker.run`）；圖層像素加總超過預算回 `too_large` 且沒解碼；`not_project` 的 zip 顯示 `imageEditor.open.notProject`；`getContext("webgl2")` 被 stub 成 null 時顯示 `webgl_unavailable` 並呼叫 `onError`；dirty 後按關閉出現對話框，取消不呼叫 `onClose`、確定呼叫；`onDirtyChange` 依序收到 true、false（undo 回去））。
   - verify：`pnpm test:browser src/image-editor/open && pnpm check`
   - commit：`feat(image-editor): open images and comp projects into the editor`

8. **存檔與匯出。**
   - 新 `src/image-editor/save/names.ts`：`stemOf(name: string): string`（`.comp.zip` 整個當副檔名，沒有副檔名回原名）、`extOf(name): string`、`suggestedNameFor(name: string, ext: string, mode: SaveRequest["mode"]): string`（照「契約 / 存檔」）。若 02 的 `src/contract/save.ts` 已匯出同規則的函式（grep `edited`），改用它。
   - 新 `src/image-editor/save/flatten.ts`：`renderFull(api, doc, opts: { background?: "white" }): Uint8Array`（原尺寸，用 `exportTiles` + `render(..., { forExport: true })` 一塊塊讀回拼成 RGBA8 直通 alpha；畫布 > `EXPORT_MAX_PIXELS` 丟 `ViewerError("too_large")`）、`encodeImage(rgba, w, h, type: "image/png" | "image/jpeg" | "image/webp", quality: number, worker): Promise<{ blob: Blob; type: string }>`（PNG 走 `encodePng` job；JPEG / WebP 用 `OffscreenCanvas` + `putImageData` + `convertToBlob`，先寫讀一個像素確認 canvas 可用，不行丟 `too_large`）。
   - 新 `src/image-editor/save/project-blob.ts`：`projectBlob(api, doc): Promise<Blob>`：有 texture 但沒有 `imageFile` 的層補上 `imageFile`（09 的命名規則 `<ID>.png`；沒有 texture 的空白層照 Compositor 不寫圖）；每層 `pixels` 是 `"png"` 的原樣用 bytes；是 `"gpu"` 的有 `png` 快取就用，否則 `readRegion` 整張後 `encodePng` job；預覽圖：畫布 ≤ `PREVIEW_MAX_PIXELS` 時長邊縮到 ≤ 1024（不放大）在白底合成、`convertToBlob({ type: "image/jpeg", quality: 0.8 })`，否則不寫；組成 09 的 `Project` 交給 `writeProject`（`src/comp/index.ts`）。
   - 新 `src/image-editor/save/save.ts`：`createSaver(deps: { api; store; file: FileRef; onSave: SaveHandler; maxOutputBytes?: number; onError?: (e: ViewerError) => void; notify(key: MessageKey): void })`，回 `{ save(): Promise<void>; saveAs(): Promise<void>; exportAs(opts: { type: "png" | "jpeg" | "webp"; quality: number }): Promise<void>; state(): { saving: boolean; savedAsProject: boolean } }`，分支照「契約 / 存檔」的表；按下時記下 `store.position()`，成功（replace / copy）後 `store.markSaved(那個位置)`；`savedAsProject` 為 true 後 save 一律 `replace` `.comp.zip`、`suggestedName` 用上次 copy 的；輸出 > `maxOutputBytes` 不呼叫 `onSave`；`onSave` reject → `notify` 顯示 `error.message`、`onError(new ViewerError("save_failed"))`；WebP 改成 PNG 時 `notify("imageEditor.export.fallbackPng")`。
   - 新 `src/image-editor/save/save-dialog.tsx`（`SaveChoiceDialog({ open, onProject, onFlatten, onCancel })`，「存成圖層專案」是預設焦點，「合併後取代原圖」下面寫「檔案裡不會留下圖層」）、`src/image-editor/save/export-dialog.tsx`（`ExportDialog({ open, onExport, onCancel, canvasOk: boolean })`：PNG / JPEG / WebP（`src/primitives/toggle-group.tsx`）、品質（`src/primitives/slider.tsx`，02）預設 0.92、說明「不含 EXIF（包含位置）」「顏色為 sRGB」；`canvasOk` 為 false 時 JPEG / WebP 停用並說明）、`src/image-editor/save/save-buttons.tsx`（`SaveButtons({ saver })`：「另存新檔」「匯出」「儲存」，存檔中「儲存」顯示 spinner），由 `src/image-editor/image-editor.tsx` 傳進 `Topbar` 的 `saveSlot`。`registerMenuItem`（`menu: "hidden"`）：`Mod+S`、`Mod+Shift+S`、`Mod+Alt+Shift+S`，加在 `src/image-editor/core.ts`，`run` 透過 `src/image-editor/save/save.ts` 匯出的 `saverOf(api)`（模組層 `WeakMap<EditorApi, Saver>`）找到 saver。
   - i18n：`imageEditor.topbar.{save,saveAs,export,saving}`、`imageEditor.save.{title,asProject,asProjectHint,flatten,flattenHint,cancel,tooLarge}`、`imageEditor.export.{title,png,jpeg,webp,quality,noExif,srgb,fallbackPng,formatUnavailable,tooLarge,confirm,cancel}`。
   - 測試：`src/image-editor/save/names.test.ts`（`a.comp.zip` 的 stem 是 `a`；`photo.JPG` replace 成 `.jpg` 時是 `photo.jpg`；copy 是 `photo (edited).comp.zip`；沒有副檔名的 `README`）；`src/image-editor/save/save.browser.test.tsx`（`mountEditor` 加 `createSaver`，`onSave` 是收集 `SaveRequest` 的假函式：平的 png 文件按儲存 → 一次 `replace` `.png`；平的 avif → `replace` `.jpg` `image/jpeg`；加一層後按儲存出對話框，選專案 → `copy` `.comp.zip` `application/zip`、`suggestedName` 是 `x (edited).comp.zip`，再按儲存 → `replace` 同名；選合併 → `replace` 原格式；另存新檔在非平的文件直接 `copy` `.comp.zip`；匯出 JPEG 的 `mode` 是 `export` 且之後 `dirty` 不變；把 `OffscreenCanvas.prototype.convertToBlob` stub 成回 png → 存成 `.png` 並出現提示；`maxOutputBytes: 10` 時 `onSave` 沒被呼叫且 `onError` 收到 `output_too_large`；`onSave` reject 時 dirty 仍為 true、提示條顯示錯誤訊息；存檔中繼續 dispatch，存完 dirty 仍為 true；寫出的 `.comp.zip` 用 09 `readProject` 讀回後 `validateLikeCompositor` 回空陣列、沒改過的層 PNG bytes 與原檔相同、`assets` 的第一個 entry 是 manifest；`decodePng` 解回改過那層的像素與 `readRegion` 相同；畫布 100 MP 以上時匯出回 `too_large`）。
   - verify：`pnpm test src/image-editor/save && pnpm test:browser src/image-editor/save && pnpm check`
   - commit：`feat(image-editor): save projects and images and export png, jpeg and webp`

9. **`.comp.zip` 預覽與 viewer 接線。**
   - 改 `src/contract/kinds.ts`（02）：`ViewKind` 加 `"comp"`；`kindOf` 對 `isCompName(name)`（`src/contract/image-edit.ts`）回 `view: "comp"`（不受 `IMAGE_EDITOR_ENABLED` 影響）。改 `src/contract/kinds.test.ts` 加這兩案（`a.comp.zip`、`A.COMP.ZIP`）。
   - 新 `src/image-editor/comp-preview.tsx`：`CompPreview({ file }: { file: FileRef })`：`readHead((s, e) => file.source.read(s, e, signal))`（`src/comp/index.ts`，09）；有 `preview` 就 `URL.createObjectURL(new Blob([preview], { type: "image/jpeg" }))` 放進 `<img>`（卸載時 revoke）；回 null 或沒有 preview 時顯示圖示與 `imageEditor.preview.none`；讀取失敗走 03 的 `read_failed` 狀態。本檔只 import `src/comp/index.ts` 與 React，不 import `src/image-editor/engine/` 或 `worker/` 的任何檔。
   - 改 03 的 body 分派（`src/viewer/` 裡依 `ViewKind` 選元件的那個檔，實作時 `grep -rn '"pdf"' src/viewer` 找到）：`"comp"` → `lazy(() => import("../image-editor/comp-preview"))`。改 03 的編輯切換點（依 `EditKind` 選 editor 的那個對照，`grep -rn '"markdown"\|EditKind' src/viewer` 找到）：`"image"` → `lazy(() => import("../image-editor/image-editor"))`，傳 `file`、`onSave`、`onClose`（回到 viewer）、`onDirtyChange`、`maxOutputBytes`（`FileViewerProps.editor?.maxOutputBytes`）、`locale`、`messages`、`theme`、`limits`、`onError`。「編輯」鈕在 `edit === "image"` 而且 viewer 容器寬 < 768 px（ref callback 裡的 ResizeObserver）時停用並用 02 的 tooltip（`src/primitives/tooltip.tsx`）顯示 `imageEditor.narrow`。
   - i18n：`imageEditor.preview.{none,loading}`、`imageEditor.narrow`。
   - 測試：`src/image-editor/comp-preview.imports.test.ts`（node 讀 `src/image-editor/comp-preview.tsx` 的原始碼，抓出所有 import 路徑，只准 `react`、`../comp`、`../contract/*`、`../i18n/*`、`../primitives/*`、`../viewer/*`）；`src/image-editor/comp-preview.test.tsx`（jsdom：用 09 `writeProject` 寫一個有預覽圖的專案、包成記錄每次 `read(start, end)` 的 `ByteSource`：顯示 `<img>`，所有讀取的 `end` ≤ 預覽 entry 的結尾；09 的 Finder 壓縮 fixture（`src/comp/__fixtures__/` 裡 `readHead` 回 null 的那個）顯示 `imageEditor.preview.none`；卸載後 `URL.revokeObjectURL` 被呼叫）；`src/viewer/` 的分派測試加：`x.comp.zip` 顯示 `CompPreview`；`IMAGE_EDITOR_ENABLED` 用 `vi.mock("../contract/image-edit", ...)` 改成 true 時 jpeg 有「編輯」鈕、容器寬 500 px 時鈕停用；有 `onSave` 時按「編輯」載入 `ImageEditor`。
   - verify：`pnpm test src/image-editor/comp-preview src/viewer src/contract && pnpm check`
   - commit：`feat(image-editor): preview comp projects from the header and open the editor from the viewer`

10. **context 遺失重建、背景 PNG 快取與資源釋放。**
    - 新 `src/image-editor/engine/png-cache.ts`：`createPngCache(api, store)`：store 每次有 label 的變更後（`subscribe` 加上比對 `position()`），對 `pixels` 是 `{ kind: "gpu" }` 且沒有 `png` 的層（image 與 mask）排一個工作：`readRegion` 整張 → `runInWorker({ kind: "encodePng" })` → 以不記 undo 的 `dispatch` 把結果寫進 `pixels` 的 `png`；同一層的新改動會作廢還沒完成的舊工作（`AbortController`）。（`src/image-editor/editor-api.ts` 的 `commit` 已經在每次像素改動時把該層標成沒有 `png` 的 `"gpu"`，本步不改它。）
    - 新 `src/image-editor/engine/context-loss.ts`：`watchContextLoss(canvas, deps: { rebuild(): Promise<void>; setBlocked(b: boolean): void; notify(key: MessageKey | null): void })`：`webglcontextlost` 時 `preventDefault()`、`setBlocked(true)`、`notify("imageEditor.notice.contextLost")`；`webglcontextrestored` 時 `rebuild()`（重建 programs、buffer 池，從 `pixels` 的 `bytes` / `png` 用 `decodePng` job 重新上傳每層；沒有 png 的 `"gpu"` 層等 `png-cache` 完成；undo 的 tiles 在記憶體不受影響），完成後 `setBlocked(false)`、`notify(null)`。`src/image-editor/image-editor.tsx` 接上：blocked 時畫布不收 pointer、頂列按鈕停用。
    - 卸載清理（改 `src/image-editor/image-editor.tsx`）：abort 所有讀取與 png-cache 工作、`worker.terminate()`、`textures` 全刪、`destroyGl`、revoke 編輯器建過的所有 `blob:` URL（集中在新檔 `src/image-editor/object-urls.ts` 的 `createObjectUrls(): { create(blob: Blob): string; revokeAll(): void }`）。
    - i18n：`imageEditor.notice.contextLost`。
    - 測試：`src/image-editor/engine/context-loss.browser.test.tsx`（`mountEditor`、畫一筆讓一層變 `"gpu"`、等 png-cache 完成；`WEBGL_lose_context.loseContext()` 後提示條出現、pointer 被擋；`restoreContext()` 後 `readComposite` 與遺失前逐像素相同、提示條消失）；`src/image-editor/engine/png-cache.browser.test.ts`（`commit` 後該層 `png` 被清掉，稍後重新出現且 `decodePng` 解回與 `readRegion` 相同；連續兩次 commit 只有最後一次的結果留下）；`src/image-editor/image-editor.browser.test.tsx`（卸載後 `gl.isContextLost()` 為 true、`Worker.prototype.terminate` 被呼叫、`URL.revokeObjectURL` 次數等於 `createObjectURL` 次數）。
    - verify：`pnpm test:browser src/image-editor/engine src/image-editor/image-editor.browser.test.tsx && pnpm check`
    - commit：`feat(image-editor): rebuild after webgl context loss and cache layer pngs`

phase 結尾的 verify：`pnpm test && pnpm test:browser && pnpm check`

## Phase 04 — 整合測試與文件

blocker：Phase 03；model：sonnet。

11. **整合測試。**
    - 新 `src/image-editor/story.browser.test.tsx`：掛上 `ImageEditor`（`src/image-editor/image-editor.tsx`），`file` 是 `{ name: "photo.jpg", mime: "image/jpeg", source: blobSource(await makeJpeg(64, 48)) }`（`blobSource` 是 02 的，`makeJpeg` 在 `src/image-editor/test/make-jpeg.ts`）。依序：新增圖層與資料夾 → 把新圖層改 Multiply、不透明度 50 → 加遮色片並反轉 → 建立剪裁 → 用面板把圖層寬改 32 → 裁切 1:1 → 按「儲存」選「存成圖層專案」（`onSave` 收到 `copy` `.comp.zip`）→ 用收到的 Blob 以 `blobSource` 重開一個 `ImageEditor`，圖層數、混合模式、不透明度、遮色片、剪裁都在，`readComposite` 與存之前逐像素相同 → 匯出 JPEG（`onSave` 收到 `export` `.jpg`，用 `createImageBitmap` 解得開、尺寸 48 × 48）→ 整個過程沒有任何 `replace`。另一個 case：只用鍵盤：Tab 進圖層面板、方向鍵換列、Enter 改名、Esc 取消、`Mod+J` 複製、`Mod+Z` 還原。
    - 改 `src/image-editor/` 裡所有抄 Compositor 的檔（`doc/tree.ts`、`doc/history.ts`、`engine/stacks.ts`、`engine/render.ts`、`tools/transform-tool.ts`）確認檔頭與「判斷」最後一點的格式完全相同；新 `src/image-editor/headers.test.ts`（node 讀這五個檔的第一行，與格式字串比對）。
    - verify：`pnpm test && pnpm test:browser && pnpm check`
    - commit：`test(image-editor): cover the layer editor end to end`

12. **docs 站的 API 與接法。**
    - 改 05 的 API 頁（`site/` 底下列出每個 subpath 的那一頁，實作時 `grep -rln "video-editor" site/` 找到）：加 `./image-editor` 一節：`ImageEditorProps` 每個欄位一行、存檔規則表（照「契約 / 存檔」）、上限（一般影像 64 MiB / 40 MP、`.comp.zip` 1 GiB、像素預算 200 MP / 觸控裝置 50 MP、匯出 100 MP）、需要 WebGL2 與 `EXT_color_buffer_float`（沒有時退回 8-bit）。改 05 的「接上你的 app」頁：寫明 image editor 的 worker 需要宿主的 Vite `optimizeDeps.exclude: ["@anyknown/file-viewer"]`、CSP 不必加 `worker-src`（同源 module worker 退到 `script-src 'self'`）。
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
