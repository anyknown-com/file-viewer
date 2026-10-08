# 11 image-select-paint — 影像編輯器的選取、繪圖、修補與遮蔽

狀態：planned（2026-10-08 依 00-overview §9 / §10 對齊並改成逐步自足；選型沿用 storage 18，2026-10-05 CTO 定）；blocker：10 image-editor 第 1–3 步（`api.ts`、`registry.ts`、`extensions.ts`、`worker/jobs.ts`、像素介面、`makeDoc`、`mountCanvas`）；P01-3 起的選單測試另等 10 第 4 步（`mountEditor`）；P04-2 另等 10 第 7 步（`ImageEditor`）與 10 的存檔步驟；與 12、13 平行；model：見各 Phase。

這份從 storage `docs/plans/18-image-select-paint.md` 搬來，設計不重開。與 storage 18 不同的地方：路徑改成本 repo 的 `src/image-editor/`；互動元件全部用 02 的 primitives（00-overview §9.3）；接 10 只經過 00-overview §9.7 的擴充介面，不改 10 的其他檔；遮蔽對話框裡「舊版在垃圾桶保留 N 天」那一句拿掉，那是宿主的事（H1，storage 22）。

## 執行方式

每一步交給一個獨立的 agent。那個 agent 只讀本檔的頭部（狀態行、執行方式、判斷、契約、形式）和自己那一步，做完 commit 就停，不讀也不做下一步。步驟之間只有「前一步的檔已存在」這種順序依賴。Compositor 原始碼的位置：

```sh
git clone https://github.com/robbietilton/Compositor "$SCRATCH/compositor" && git -C "$SCRATCH/compositor" checkout 11d8d7a
```

`$SCRATCH` 是執行者自己的 scratchpad 目錄；下文的 `Compositor/...` 都在這個 clone 裡。Compositor 的測試檔用 `grep -rl "<名稱>" "$SCRATCH/compositor"` 找。

## 判斷

- 範圍是 storage 13 §2 表裡標 18 的那一列：選取（矩形、橢圓、套索、多邊形套索、魔術棒）、選取範圍的運算、移動與複製像素、剪下拷貝貼上、筆刷與橡皮擦（圖層或遮色片）、仿製印章、污點修復、內容感知填色、漸層、滴管、遮蔽。選取主體 / 物件選取、塗抹液化、模糊工具、顏色範圍留到之後。
- 選取範圍是一張畫布大小的 R8 texture（255 = 全選），不是 Compositor `Selection.swift` 的向量路徑：魔術棒、羽化、擴張收縮、從圖層 alpha 載入本來就是像素運算，向量路徑要多一個多邊形布林函式庫和像素到路徑的描邊。選取範圍是 session 狀態，不進文件、不進 `.comp.zip`、不進 undo（同 Compositor）。
- 演算法照 Compositor（@11d8d7a）抄，C 與 Metal 改寫成 TS 與 GLSL。C 檔不編 WASM：repo 沒有 C 工具鏈，三個 C 檔加起來約 560 行，都是單純的迴圈，TS 在 worker 裡跑夠快；量測下來太慢再編 WASM（宿主 CSP 已有 `wasm-unsafe-eval`，00-overview §3）。
- 內容感知填色是簡化版（沒有迭代、金字塔與投票，大洞效果普通）：v1 照抄，洞超過 4 MP 不給做，可取消。
- 遮蔽作用在選取範圍碰到的每一個像素圖層，包含隱藏的層，文字與形狀圖層一併點陣化，不碰遮色片與調整圖層的設定。理由：圖層檔裡任何一層留著原始像素，遮蔽就沒有意義。
- 不做：系統剪貼簿只在使用者自己按拷貝 / 剪下時寫（`navigator.clipboard.write`，不支援時略過），不主動讀，只收使用者自己的 `paste` 事件。檔案下載、解密、上傳、垃圾桶、toast 都歸宿主（H1）。
- 因為只能經過 §9.7 的介面，下面幾件事在本份就決定好：
  - **沒有獨立的「移動」工具。** 10 的變形工具已經是 `id: "move"`、`key: "V"`。移動像素改成 Photoshop 的另一個手勢：選取工具作用中，`Mod` + 在選取範圍內拖曳 = 剪出浮動像素並移動，`Mod` + `Alt` + 拖曳 = 複製一份移動。
  - **Delete / Backspace 不註冊成選單快捷鍵**（10 的 `layer.delete` 已經用了，`registerMenuItem` 會丟錯）。本份每個工具的 `onKeyDown` 第一行呼叫 `src/image-editor/tools/keys.ts` 的 `commonKeyDown`；有選取範圍時 Delete / Backspace 由它清除像素並回 true（10 的 `handleKey` 先問工具），沒有選取範圍時回 false，照常刪圖層。選單「編輯 › 清除」照樣註冊，不帶快捷鍵。
  - **`Mod+V` 不註冊。** 讓瀏覽器照常發 `paste` 事件，本份在 `.fv-root` 上收（見 P01-6）。選單「編輯 › 貼上」註冊，不帶快捷鍵，貼的是編輯器內的剪貼簿。
  - **對話框與錯誤訊息自己掛。** §9.7 沒有給擴充用的 React 掛載點（`MenuItemSpec.run(api)` 不能回 React 節點）。本份用 `src/image-editor/tools/host.tsx` 的 `openHost`：在編輯器的 `.fv-root` 底下另建一個 React root，外面包 02 的 `ViewerRoot`（locale 取 `.fv-root` 的 `lang`、theme 取 `data-theme`；宿主的 `messages` 覆寫在這個 root 裡不生效）。§9.7 之後若加了掛載點，只改 `host.tsx`。
  - **進度條在屬性欄或對話框裡，是不定進度。** worker 協定（10 的 `worker.ts`）只回最終結果，所以用 `Progress({ value: null })` 加一顆「停止」，停止 = abort `runInWorker` 的 signal。魔術棒與污點修復放在工具的 `panel`；內容感知填色放在填色對話框。
  - **畫到圖層範圍外不擴大圖層**，只畫在圖層矩形內（遮色片同樣）。§9.7 沒有改圖層 texture 尺寸的介面；擴大圖層移到「之後再做」。
  - **「`⌘` 點圖層縮圖載入選取」改成選單「選取 › 載入圖層透明度」**（目前圖層，`session.target` 是 `"mask"` 時載入遮色片），按住 Shift / Alt 點選單項目時照運算模式加減。圖層列的點擊不在 §9.7 內。
  - **圖層的像素尺寸**由 `src/image-editor/tools/geom.ts` 的 `layerPixelSize` 從 `api.layerMatrix(id)` 與 `transform.size` 算（`width = round(size.width × hypot(a, c))`、`height = round(size.height × hypot(b, d))`），因為 `EditorApi` 沒有直接給。
  - **像素寫入一律經 `api.writeRegion`**（它處理 mipmap 與版本），GPU 只用來算覆蓋率與選取；不直接對 `api.layerTexture(id)` 做 `copyTexSubImage2D`。每次用 GL 之後把 framebuffer 綁回 `null`、`useProgram(null)`，再呼叫 `api.requestRender()`。
  - **改像素的流程**：改之前用 `src/image-editor/tools/tiles.ts` 的 `createTileTracker` 對碰到的每個 256 × 256 格呼叫一次 `api.snapshotTiles`（格子對齊圖層像素座標 0, 256, 512…），寫像素，最後 `api.commit(label, doc, tracker.tiles())` 一步 undo。

## 契約

只加不改 00-overview §3；沒有新的 subpath、export、錯誤碼。`ImageEditor` 的 props 不變。本份所有東西都在 `./image-editor` chunk 內，由 `installExtensions` 註冊。

### 用到的外部符號（每一步都可以直接 import，不再另外說明）

| 符號 | 從哪個檔 import | 簽名（只列本份用到的） |
| --- | --- | --- |
| `EditorApi`、`Doc`、`Layer`、`LayerId`、`Command`、`PixelTile`、`PixelTarget`、`Rect`、`Point`、`Mat2D`、`ToolSpec`、`MenuItemSpec`、`OverlaySpec`、`ViewTransform`、`MessageKey` | `src/image-editor/api.ts`（10 第 1 步） | `api.doc(): Doc`；`api.session(): Session`（`active: LayerId \| null`、`target: PixelTarget`、`tool: string`）；`api.setSession(patch)`；`api.dispatch(command, label?)`（無 label = 預覽不記）；`api.commit(label, doc, tiles)`；`api.snapshotTiles(id, target, rect): PixelTile[]`；`api.writeRegion(id, target, rect, pixels)`（image = RGBA8 直通 alpha、mask = R8，圖層像素座標）；`api.readRegion(id, target, rect): Uint8Array`；`api.readComposite(rect): Uint8Array`（文件座標，RGBA8 直通）；`api.layerMatrix(id): Mat2D`（文件 → 圖層像素，`x' = a x + c y + e`、`y' = b x + d y + f`）；`api.checkBudget({ layerPx?, maskPx? }): ViewerError \| null`；`api.runInWorker({ kind, input }, transfer?, signal?)`；`api.requestRender()`；`api.gl: WebGL2RenderingContext`。`Doc = { manifest: Manifest; pixels: ReadonlyMap<LayerId, { image?: LayerPixels; mask?: LayerPixels }> }`；`LayerPixels = { kind: "png"; bytes } \| { kind: "gpu"; png? }`。`ToolSpec = { id; label: MessageKey; icon: ComponentType; cursor: string \| ((api) => string); key: string; slot?: string; onPointerDown?(p, e, api); onPointerMove?(p, e, api); onPointerUp?(p, e, api); onKeyDown?(e, api): boolean; drawOverlay?(ctx, view, api); panel?: ComponentType<{ api: EditorApi }> }`，`p` 是文件座標。`MenuItemSpec = { id; menu: MenuId; label: MessageKey; order?; shortcut?: string; enabled?(api): boolean; run(api): void }`，`MenuId = "edit" \| "image" \| "layer" \| "select" \| "layer-context" \| "layer-new" \| "hidden"`，`shortcut` 寫成 `"Mod+Shift+D"`（按鍵用 `KeyboardEvent.key` 的大寫）。`OverlaySpec = { id; draw(ctx, view, api, time): void; animated?(api): boolean }`。`ViewTransform = { zoom; dpr; docToScreen: Mat2D; screenToDoc: Mat2D }` |
| `registerTool`、`registerMenuItem`、`registerOverlay`、`tools`、`menuItems`、`overlays`、`resetRegistry` | `src/image-editor/registry.ts`（10 第 1 步） | `registerTool(spec: ToolSpec): void`、`registerMenuItem(spec: MenuItemSpec): void`、`registerOverlay(spec: OverlaySpec): void`：id 重複、快捷鍵重複、工具鍵與選單快捷鍵衝突時丟 Error；`resetRegistry()` 只給測試 |
| `installExtensions` | `src/image-editor/extensions.ts`（10 第 1 步） | `installExtensions(): void`，冪等；本份只在函式體加一行 `registerSelectPaint()` 與檔頭一行 import |
| `jobs`、`JobKind`、`JobInput`、`JobOutput` | `src/image-editor/worker/jobs.ts`（10 第 1 步） | `jobs` 是物件，每個 key 是 `(input, signal: AbortSignal) => output`；`encodePng: (input: PngImage, signal) => Uint8Array`。本份加 `wand`、`heal`、`contentFill` 三個 key |
| `makeDoc` | `src/image-editor/test/make-doc.ts`（10 第 2 步） | `makeDoc(spec: { width: number; height: number; layers: Partial<Layer>[] }): Doc` |
| `mountCanvas` | `src/image-editor/test/mount-canvas.tsx`（10 第 3 步） | `mountCanvas(doc: Doc, colors?: Record<LayerId, [number, number, number, number]>): Promise<{ api: EditorApi; store: DocStore; canvas: HTMLCanvasElement; unmount(): void }>`，每層上傳成 transform 大小的純色 texture |
| `mountEditor` | `src/image-editor/test/mount-editor.tsx`（10 第 4 步） | `mountEditor(doc: Doc, colors?): Promise<{ api: EditorApi; store: DocStore; unmount(): void }>`，掛整個編輯器外框（含 `installExtensions`、選單、快捷鍵） |
| `ImageEditor` | `src/image-editor/index.ts`（10 第 7 步） | `ImageEditor(props: EditorProps)` |
| `Manifest`、`PngImage`、`readProject`、`writeProject`、`fromImage`、`decodePng`、`pngSize` | `src/comp/index.ts`（09） | `Manifest` 有 `width`、`height`、`layers`；每層 `transform = { origin: { x; y }; size: { width; height }; rotation; flipX; flipY; sampling }`，選填 `imageFile`、`isGroup`、`maskFile`、`adjustment`、`text`、`shape`；`PngImage = { width; height; channels: 1 \| 4; data: Uint8Array }`；`readProject(bytes: Uint8Array): Project`；`writeProject(p: Project): Blob`；`fromImage(image: { width; height; rgba }, layerName: string): Project`；`Project = { manifest; assets: Map<string, Uint8Array> }`，asset key 是 `"images/<ID>.png"` / `"images/<ID>.mask.png"`；`decodePng(bytes, kind: "layer" \| "mask"): PngImage` |
| `EditorProps`、`SaveRequest`、`blobSource`、`ViewerError`、`Theme` | `src/contract/editor.ts`、`src/contract/save.ts`、`src/contract/byte-source.ts`、`src/contract/errors.ts`、`src/contract/props.ts` | `SaveRequest = { blob; mime; ext; mode; suggestedName }`；`blobSource(blob: Blob): ByteSource`；`Theme = "light" \| "dark"` |
| `MessageTable`、`Messages`、`Locale`、`commonMessages` | `src/i18n/messages.ts`（02） | `MessageTable<K> = Record<Locale, Record<K, string>>`；`Messages = CommonMessages & …`；`commonMessages` 有 `common.cancel`、`common.close`、`error.too_large` |
| `useT` | `src/i18n/use-t.ts`（02） | `useT<K extends string>(table: MessageTable<K>): (key: K, vars?) => string` |
| `ViewerRoot` | `src/primitives/root.tsx`（02） | `ViewerRoot(props: Omit<CommonProps, "file"> & { className?: string; children: ReactNode })` |
| `Icon`、`Button`、`Dialog`、`ConfirmDialog`、`Popover`、`ToggleGroup`、`NumberField`、`Slider`、`Switch`、`Progress` | `src/primitives/icon.tsx`、`button.tsx`、`dialog.tsx`、`popover.tsx`、`toggle-group.tsx`、`number-field.tsx`、`slider.tsx`、`switch.tsx`、`progress.tsx`（02） | `Icon({ size?, label?, children })`；`Button(ComponentProps<"button"> & { variant?: "primary" \| "secondary" \| "ghost" \| "danger"; icon? })`；`Dialog({ open; onOpenChange(open); title; description?; children?; footer? })`；`ConfirmDialog({ open; onOpenChange; title; description; confirmLabel; cancelLabel; danger?; onConfirm() })`；`Popover({ trigger: ReactElement; label: string; children })`；`ToggleGroup<T>({ label; value: T; options: readonly { value: T; label; icon? }[]; onChange(v) })`；`NumberField({ label; value; min?; max?; step?; onChange(v); onCommit?(v) })`；`Slider({ label; value; min; max; step?; disabled?; onValueChange(v); onValueCommitted?(v) })`；`Switch({ label; checked; onCheckedChange(c); disabled? })`；`Progress({ label; value: number \| null })` |

### 本份的檔（各步建立；後面的步驟 import 時以這張表為準）

| 檔 | 匯出 | 哪一步建立 |
| --- | --- | --- |
| `src/image-editor/tools/messages.ts` | `SelectPaintKey`、`SelectPaintMessages`、`selectPaintMessages` | P01-1 |
| `src/image-editor/tools/register.ts` | `registerSelectPaint(): void` | P01-1；之後每步在函式體加一行 |
| `src/image-editor/tools/state.ts` | `ToolState`、`RGBA`、`toolState(api)`、`setToolState(api, patch)`、`useToolState(api)`、`runJob(api, label, fn)` | P01-1 |
| `src/image-editor/tools/host.tsx` | `openHost(api, render)` | P01-1 |
| `src/image-editor/tools/keys.ts` | `commonKeyDown(e, api)`、`addKeyHandler(fn)` | P01-1 |
| `src/image-editor/tools/tiles.ts` | `createTileTracker(api, id, target)`、`TileTracker` | P01-1 |
| `src/image-editor/tools/geom.ts` | `apply`、`invert`、`multiply`、`layerPixelSize`、`docRectToLayer` | P01-1 |
| `src/image-editor/tools/commands.ts` | `newLayerId`、`addPixelLayer`、`rasterizeLayer`、`isPixelLayer`、`needsRasterize` | P01-1 |
| `src/image-editor/tools/gl.ts` | `fullscreenProgram`、`drawQuad`、`createR8`、`createRgba`、`readRgba`、`withFramebuffer` | P01-1 |
| `src/image-editor/tools/glyphs.tsx` | 11 個工具圖示 | P01-1 |
| `src/image-editor/tools/select/mask.ts` | `MaskOp`、`combineRef`、`invertRef`、`selectionOf`、`hasSelection`、`readSelection`、`writeSelection`、`selectAll`、`deselect`、`reselect`、`invertSelection`、`selectionBounds`、`selectionInLayer`、`opFromEvent` | P01-2 |
| `src/image-editor/tools/select/morph.ts` | `morphRef`、`featherSigma`、`gaussianKernel`、`expandSelection`、`contractSelection`、`featherSelection` | P01-2 |
| `src/image-editor/tools/select/ants.ts` | `antsSegments`、`drawAnts` | P01-2 |
| `src/image-editor/tools/select/load.ts` | `loadLayerAlpha` | P01-2 |
| `src/image-editor/tools/paint/composite.ts` | `paintOver`、`eraseOver`、`paintMask` | P02-2 |
| `src/image-editor/tools/paint/stroke-buffer.ts` | `createStrokeBuffer` | P02-2 |

### i18n key（`src/image-editor/tools/messages.ts`，P01-1 一次建好全部；後面的步驟只用不加）

形狀照 02：`export type SelectPaintKey = …`（下面全部 key 的字串聯集）、`export type SelectPaintMessages = Record<SelectPaintKey, string>`、`export const selectPaintMessages: MessageTable<SelectPaintKey> = { en: {…}, "zh-TW": {…} }`。zh-TW 照 en 的意思寫，用語照 Photoshop 繁中版（選取畫面、羽化、魔術棒、仿製印章工具、污點修復筆刷、內容感知）。檔超過 300 行時把兩種語言拆成同目錄的 `messages-en.ts`、`messages-zh-tw.ts`，表名不變。按鈕的「取消」用 `commonMessages` 的 `common.cancel`；預算不足的訊息用 `error.too_large`。

| key | en |
| --- | --- |
| `image.select.rect` / `.ellipse` / `.lasso` / `.polygon` / `.wand` | Rectangular Marquee / Elliptical Marquee / Lasso / Polygonal Lasso / Magic Wand |
| `image.select.mode` / `.modeNew` / `.modeAdd` / `.modeSubtract` / `.modeIntersect` | Selection mode / New / Add / Subtract / Intersect |
| `image.select.feather` / `.featherMenu` / `.expand` / `.contract` / `.amount` / `.apply` | Feather / Feather… / Expand… / Contract… / Amount (px) / OK |
| `image.select.all` / `.deselect` / `.reselect` / `.inverse` / `.loadAlpha` | All / Deselect / Reselect / Inverse / Load Layer Transparency |
| `image.select.tolerance` / `.sample` / `.samplePoint` / `.sample3` / `.sample5` / `.contiguous` / `.sampleAll` / `.working` | Tolerance / Sample size / Point / 3 × 3 average / 5 × 5 average / Contiguous / Sample all layers / Selecting… |
| `image.select.cut` / `.copy` / `.copyMerged` / `.paste` / `.clear` / `.fill` / `.move` / `.pastedLayer` / `.scale` / `.angle` | Cut / Copy / Copy Merged / Paste / Clear / Fill… / Move Pixels / Pasted Layer / Scale (%) / Angle |
| `image.paint.fillTitle` / `.fillContents` / `.fillForeground` / `.fillBackground` / `.fillContentAware` / `.fillTooLarge` / `.opacity` | Fill / Contents / Foreground Color / Background Color / Content-Aware / Content-Aware Fill works on areas up to 4 megapixels. / Opacity |
| `image.paint.brush` / `.eraser` / `.size` / `.hardness` / `.smoothing` | Brush / Eraser / Size / Hardness / Smoothing |
| `image.paint.rasterizeTitle` / `.rasterizeBody` / `.rasterize` | Rasterize this layer? / The text or shape becomes pixels and can no longer be edited as text or shape. / Rasterize |
| `image.paint.gradient` / `.gradientType` / `.gradientLinear` / `.gradientRadial` / `.gradientStops` / `.stopsFgBg` / `.stopsFgClear` | Gradient / Type / Linear / Radial / Colors / Foreground to Background / Foreground to Transparent |
| `image.paint.eyedropper` / `.source` / `.sourceLayer` / `.sourceAll` | Eyedropper / Sample / Current Layer / All Layers |
| `image.paint.foreground` / `.background` / `.swap` / `.defaultColors` / `.hex` / `.hue` / `.saturation` / `.value` | Foreground color / Background color / Swap Colors / Default Colors / Hex / Hue / Saturation / Brightness |
| `image.paint.clone` / `.cloneAligned` / `.cloneNoSource` | Clone Stamp / Aligned / Alt-click to set a source. |
| `image.paint.heal` / `.healMode` / `.healContentAware` / `.healTexture` | Spot Healing / Type / Content-Aware / Create Texture |
| `image.paint.working` / `.stop` | Working… / Stop |
| `image.paint.redact` / `.redactTitle` / `.redactBody` / `.redactStyle` / `.redactMosaic` / `.redactBlack` / `.redactCell` / `.redactConfirm` | Redact Selection… / Redact selection / Redaction replaces the pixels inside the selection on every pixel layer, including hidden layers. Text and shape layers it touches become pixels. After you save, the new file has none of the original pixels in this area. This is not blur: blur can sometimes be undone. / Style / Mosaic / Solid Black / Cell size / Redact |

### 快捷鍵與註冊 id

- 工具（`registerTool`）：`select.rect`、`select.ellipse`（`key: "M"`、`slot: "marquee"`）；`select.lasso`、`select.polygon`（`key: "L"`、`slot: "lasso"`）；`select.wand`（`"W"`）；`paint.brush`（`"B"`）；`paint.eraser`（`"E"`）；`paint.clone`（`"S"`）；`paint.heal`（`"J"`）；`paint.gradient`（`"G"`）；`paint.eyedropper`（`"I"`）。
- 選單（`registerMenuItem`）：`select.all`（`Mod+A`）、`select.deselect`（`Mod+D`）、`select.reselect`（`Mod+Shift+D`）、`select.inverse`（`Mod+Shift+I`）、`select.expand`、`select.contract`、`select.feather`、`select.loadAlpha`（`menu: "select"`）；`edit.cut`（`Mod+X`）、`edit.copy`（`Mod+C`）、`edit.copyMerged`（`Mod+Shift+C`）、`edit.paste`、`edit.fill`（`Shift+F5`）、`edit.clear`（`menu: "edit"`）；`paint.swapColors`（`X`）、`paint.defaultColors`（`D`）（`menu: "hidden"`）；`image.redact`（`menu: "image"`）。
- 工具自己處理的鍵（`onKeyDown`，用 `e.code`，因為 Shift 會改變 `e.key`）：`BracketLeft` / `BracketRight` 筆刷大小 ×0.9 / ×1.1（至少差 1 px），加 Shift 時硬度 −0.25 / +0.25；`Digit1`–`Digit0` 不透明度 10%–100%；Delete / Backspace 經 `commonKeyDown`。
- 選單項目、工具與 commit 的 `label` 都用上面 i18n 表的 key（型別 `MessageKey`，P01-1 把 `SelectPaintMessages` 交集進 `Messages` 之後才合法）。

### 抄來的檔

檔頭：`// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, <原路徑>), MIT, Copyright (c) 2026 Wonder Assembly LLC`。`THIRD_PARTY_NOTICES.md` 的 Compositor 條目由 10 建，本份不改。

## 形式

- 工具列（10 的左側）加：選取（矩形 / 橢圓同一格）、套索（自由 / 多邊形同一格）、魔術棒、筆刷、橡皮擦、仿製印章、污點修復、漸層、滴管。同一格多個工具時長按或右鍵展開（10 處理）。
- 前景 / 背景兩個色塊放在筆刷、橡皮擦、漸層、仿製的屬性欄最左（10 的工具列沒有給擴充的位置）；點色塊開顏色挑選器（HSV 方塊 + 色相 `Slider` + hex 輸入，在 02 的 `Popover` 裡）。
- 屬性欄（10 的右上，`ToolSpec.panel`）依工具顯示：選取的運算模式（新、加 Shift、減 Alt、交集 Shift + Alt，`ToggleGroup`）與羽化（`NumberField`）；魔術棒的容許值（0–255，預設 32）、取樣大小（1、3×3、5×5，`ToggleGroup`）、連續（`Switch`，預設開）、取樣全部圖層（`Switch`，預設關）；筆刷的大小（1–2100 px，預設 30）、硬度（0–100%，預設 100%）、不透明度（1–100%，預設 100%）、平滑（0–100%，預設 0）；仿製的對齊（`Switch`，預設開）與取樣來源（`ToggleGroup`）；修補的模式（`ToggleGroup`）；漸層的種類與色標（`ToggleGroup`）。
- 筆刷游標是一個圈，大小跟著縮放；硬度 < 100% 時畫兩圈（內圈是硬的部分）。仿製時另外顯示來源的十字。選取虛線是常駐 overlay，黑白相間、隨時間移動。
- 選單「選取」：全選、取消、重新選取、反轉、擴張…、收縮…、羽化…、載入圖層透明度。選單「編輯」：剪下、拷貝、拷貝合併、貼上、填色…、清除。選單「影像」加「遮蔽選取範圍…」。
- 長時間的 worker 工作（魔術棒、污點修復）在屬性欄出 `Progress`（不定進度）與「停止」；內容感知填色在填色對話框裡出。停止後畫面與文件沒有改變。
- 遮蔽對話框說明：遮蔽會改掉每一層的像素；存檔後新檔裡沒有原始像素；這不是模糊。用「儲存」取代原檔時舊版的去留由宿主決定（H1），對話框不承諾。

## Phase 01 — 基礎、選取範圍、移動與剪貼

blocker：10 第 1–3 步（第 3、4、6 步的選單測試另等 10 第 4 步）；model：sonnet。

1. **字串表、擴充入口與共用工具。**
   - 新 `src/image-editor/tools/messages.ts`：照「契約 / i18n key」的表與形狀，en 與 zh-TW 兩份 key 集合相同。
   - 改 `src/i18n/messages.ts`：加 `import type { SelectPaintMessages } from "../image-editor/tools/messages";`，`Messages` 那一行加 `& SelectPaintMessages`。
   - 新 `src/image-editor/tools/register.ts`：`export function registerSelectPaint(): void {}`（本步函式體是空的；之後每一步加一行呼叫自己的 register 函式）。
   - 改 `src/image-editor/extensions.ts`：檔頭加 `import { registerSelectPaint } from "./tools/register";`，`installExtensions` 的函式體加一行 `registerSelectPaint();`，不改其他行。
   - 新 `src/image-editor/tools/state.ts`：`export type RGBA = [number, number, number, number]`（0–255）；`export type ToolState = { fg: RGBA; bg: RGBA; brush: { size: number; hardness: number; opacity: number; smoothing: number }; job: { label: SelectPaintKey; abort(): void } | null; rasterizeAsk: { layer: LayerId; resolve(ok: boolean): void } | null }`，預設 `fg [0,0,0,255]`、`bg [255,255,255,255]`、`brush { size: 30, hardness: 1, opacity: 1, smoothing: 0 }`；`toolState(api: EditorApi): ToolState`（模組層級 `WeakMap<EditorApi, …>`，第一次取時建預設值）；`setToolState(api, patch: Partial<ToolState>): void`（換新物件並通知訂閱者）；`useToolState(api): ToolState`（`useSyncExternalStore`）；`runJob<T>(api, label: SelectPaintKey, fn: (signal: AbortSignal) => Promise<T>): Promise<T | null>`：建 `AbortController`，設 `job`，`finally` 清掉；abort 造成的 `AbortError` 回 `null`，其他錯誤往外丟。
   - 新 `src/image-editor/tools/host.tsx`：`openHost(api: EditorApi, render: (close: () => void) => ReactNode): () => void`。找 `(api.gl.canvas as HTMLCanvasElement).closest(".fv-root")`（找不到用 `document.body`），在它底下 append 一個 `div`，`createRoot(div).render(<ViewerRoot locale={lang === "zh-TW" ? "zh-TW" : "en"} theme={dataTheme}>{render(close)}</ViewerRoot>)`，`lang` 取該元素的 `lang` 屬性、`dataTheme` 取 `data-theme`（不是 `"light"` / `"dark"` 時 `undefined`）；`close` 會 `unmount` 並移除 div；回傳的函式就是 `close`。另匯出 `showError(api, e: ViewerError): void`：用 `openHost` 渲染本檔的小元件 `ErrorDialog({ code, onClose })`，它用 `useT(commonMessages)` 取 `error.<code>` 當 02 `Dialog` 的標題，footer 一顆 `common.close`。
   - 新 `src/image-editor/tools/keys.ts`：`type KeyHandler = (e: KeyboardEvent, api: EditorApi) => boolean`；`addKeyHandler(fn: KeyHandler): void`（模組層級陣列，同一個函式加兩次只留一個）；`commonKeyDown(e, api): boolean`：依序呼叫，任何一個回 true 就回 true。
   - 新 `src/image-editor/tools/tiles.ts`：`export type TileTracker = { touch(rect: Rect): void; tiles(): PixelTile[]; has(): boolean }`；`createTileTracker(api, id: LayerId, target: PixelTarget): TileTracker`：`touch` 把 rect 夾到圖層像素範圍（`layerPixelSize`），對每個還沒記過的 256 格（`x`、`y` 是 256 的倍數，右、下邊緣較小）呼叫一次 `api.snapshotTiles(id, target, cell)` 並收下回傳的 tile；`tiles()` 回全部。
   - 新 `src/image-editor/tools/geom.ts`：`apply(m: Mat2D, p: Point): Point`、`invert(m: Mat2D): Mat2D`、`multiply(m: Mat2D, n: Mat2D): Mat2D`（先 n 再 m）、`layerPixelSize(api, id): { width: number; height: number }`（公式見「判斷」）、`docRectToLayer(api, id, r: Rect): Rect`（四個角經 `layerMatrix` 後取外框，往外取整）。
   - 新 `src/image-editor/tools/commands.ts`：`newLayerId(): LayerId`（`crypto.randomUUID().toUpperCase()`）；`addPixelLayer(opts: { id: LayerId; name: string; above: LayerId | null; transform: Layer["transform"] }): Command`（新層插在 `above` 正上方、同一個 `parentID`；`above` 為 null 時放最上面；`isVisible: true`、`opacity: 1`、`blendMode: "Normal"`、沒有 `imageFile`；`pixels` 加 `{ image: { kind: "gpu" } }`；`manifest.activeLayerID` 設成新 id）；`rasterizeLayer(id): Command`（拿掉 `text` 與 `shape` 兩個欄位，其他不動）；`isPixelLayer(l: Layer): boolean`（不是資料夾、沒有 `adjustment`）；`needsRasterize(l: Layer): boolean`（有 `text` 或 `shape`）。
   - 新 `src/image-editor/tools/gl.ts`：`fullscreenProgram(gl, fragment: string): WebGLProgram`（固定的全畫面 vertex shader，`#version 300 es`，輸出 `v_uv`；編譯失敗丟含 info log 的 Error；同一個 fragment 字串快取）；`drawQuad(gl): void`；`createR8(gl, w, h, data?: Uint8Array): WebGLTexture`；`createRgba(gl, w, h, data?: Uint8Array): WebGLTexture`（都是 NEAREST、CLAMP_TO_EDGE）；`withFramebuffer(gl, texture, w, h, draw: () => void): void`（建暫時的 framebuffer、設 viewport、執行、刪 framebuffer、綁回 null、`useProgram(null)`）；`readRgba(gl, texture, rect: Rect): Uint8Array`（`readPixels` RGBA / UNSIGNED_BYTE）。
   - 新 `src/image-editor/tools/glyphs.tsx`：`RectMarqueeGlyph`、`EllipseMarqueeGlyph`、`LassoGlyph`、`PolygonLassoGlyph`、`WandGlyph`、`BrushGlyph`、`EraserGlyph`、`CloneGlyph`、`HealGlyph`、`GradientGlyph`、`EyedropperGlyph`，簽名 `(props: { size?: IconSize; label?: string }) => JSX.Element`，用 `src/primitives/icon.tsx` 的 `Icon` 包 24 單位 viewBox、stroke 2 的 inline SVG。
   - 測試：`src/image-editor/tools/messages.test.ts`（en 與 zh-TW 的 key 集合相同；每個 key 以 `image.select.` 或 `image.paint.` 開頭；沒有空字串）；`src/image-editor/tools/commands.test.ts`（用 `makeDoc` 兩層：`addPixelLayer` 插在指定層上方且 `parentID` 相同、`activeLayerID` 是新 id、`pixels` 有 gpu 項目；`above: null` 放最上面；`rasterizeLayer` 拿掉 `text` 與 `shape`、其他欄位深度相同；`newLayerId` 是大寫 UUID）；`src/image-editor/tools/geom.test.ts`（`invert` 後相乘是單位矩陣；`layerPixelSize` 對 scale 2 的矩陣回一半；`docRectToLayer` 對平移矩陣只位移）；`src/image-editor/tools/state.test.ts`（兩個不同的假 api 各有自己的狀態；`setToolState` 通知訂閱者一次；`runJob` abort 後回 null 且 `job` 清成 null）；`src/image-editor/tools/keys.test.ts`（兩個 handler，第一個回 false、第二個回 true → `commonKeyDown` 回 true；同一個函式加兩次只執行一次）；`src/image-editor/tools/host.browser.test.tsx`（用 `mountCanvas` 一層的文件，把 `canvas.parentElement` 加上 class `fv-root` 與 `lang="zh-TW"`：`openHost` 開出的內容在該元素底下、`useT(selectPaintMessages)("image.select.all")` 顯示 zh-TW 文字；呼叫 close 後 div 被移除）；`src/image-editor/tools/tiles.browser.test.ts`（用 `mountCanvas` 一層 600 × 300：`touch({ x: 250, y: 10, width: 20, height: 10 })` 得到兩個 tile（x 0 與 256）；再 touch 同一區不增加；touch 超出圖層的區域被夾掉）。
   - verify：`pnpm test src/image-editor/tools && pnpm test:browser src/image-editor/tools && pnpm check`
   - commit：`feat(image-select-paint): add message table, extension entry and shared tool helpers`

2. **選取範圍的資料、GPU 運算、虛線與載入透明度。**
   - 新 `src/image-editor/tools/select/mask.ts`：
     - `export type MaskOp = "replace" | "add" | "subtract" | "intersect"`；純 TS 參考：`combineRef(a: Uint8Array, b: Uint8Array, op: MaskOp): Uint8Array`（replace → b；add → max；subtract → `round(a × (255 − b) / 255)`；intersect → min）、`invertRef(a): Uint8Array`。
     - `opFromEvent(e: { shiftKey: boolean; altKey: boolean }, fallback: MaskOp): MaskOp`：Shift + Alt → intersect、Shift → add、Alt → subtract、都沒有 → fallback。
     - 每個 `EditorApi` 一份選取狀態（模組層級 `WeakMap`）：canvas 大小（`api.doc().manifest.width` × `height`）的 R8 texture（`createR8`，`src/image-editor/tools/gl.ts`）、`empty: boolean`、`previous: Uint8Array | null`、`version: number`。畫布大小改變（裁切、改尺寸）時下次取用重建成空的。
     - `selectionOf(api): { texture: WebGLTexture; width: number; height: number; version: number }`；`hasSelection(api): boolean`；`readSelection(api): Uint8Array`（R8，從 `readRgba` 取 R 通道）；`writeSelection(api, bytes: Uint8Array, rect: Rect, op: MaskOp): void`（`bytes` 是 `rect` 大小的 R8，文件座標；上傳成暫時 texture，用 fragment shader 以 op 合到選取 texture；rect 外：replace 時清成 0，其他照 op 對 0 計算）；`selectAll`、`deselect`（先把目前內容存進 `previous`）、`reselect`（`previous` 為 null 時不做）、`invertSelection`；`selectionBounds(api): Rect | null`（非零像素的外框，依 `version` 快取）；`selectionInLayer(api, id: LayerId, rect: Rect): Uint8Array`（把選取範圍取樣到圖層像素座標的 `rect`，用 `invert(api.layerMatrix(id))` 當 uniform，雙線性；沒有選取時回全 255）。每次改動 `version + 1` 並 `api.requestRender()`。
   - 新 `src/image-editor/tools/select/morph.ts`（檔頭照 Compositor `Compositor/Document/Selection.swift`）：純 TS 參考 `morphRef(mask, w, h, px: number, kind: "expand" | "contract"): Uint8Array`（十字與方形 3×3 交替，px 上限 500）、`featherSigma(radius) = radius / 2`、`gaussianKernel(sigma): Float32Array`（半徑 `ceil(3σ)`、總和 1）；GPU：`expandSelection(api, px)`、`contractSelection(api, px)`、`featherSelection(api, radius)`（可分離高斯，radius 上限 250），fragment shader 字串寫在同一個檔。
   - 新 `src/image-editor/tools/select/ants.ts`：`antsSegments(mask: Uint8Array, w: number, h: number): Float32Array`（以 128 為門檻的 marching squares，每四個數是一段 `x0, y0, x1, y1`，文件座標）；`drawAnts(ctx, segments, view: ViewTransform, time: number): void`（每段經 `view.docToScreen` 換算；先畫白實線，再畫黑色 `setLineDash([4, 4])`、`lineDashOffset = -(time / 60) % 8`，線寬 1 CSS px × `view.dpr`）。
   - 新 `src/image-editor/tools/select/load.ts`：`loadLayerAlpha(api, id: LayerId, target: PixelTarget, op: MaskOp): void`：`readRegion` 整層（`layerPixelSize`），image 取 alpha、mask 直接用；以 `invert(api.layerMatrix(id))` 畫到文件座標的選取 texture（GPU，雙線性，圖層外是 0），照 op 合入。
   - 改 `src/image-editor/tools/register.ts`：本步沒有註冊（overlay 與選單在第 3 步）。
   - 測試：`src/image-editor/tools/select/mask.test.ts`（`combineRef` 四種 op 對 0、128、255 的真值表；`invertRef` 兩次回原值；`opFromEvent` 四種組合）；`src/image-editor/tools/select/morph.test.ts`（擴張 10 再收縮 10 回到原來的正方形；圓形擴張後與真圓的差在八角近似誤差內（邊界 ≤ 1 px）；`featherSigma(10) = 5`；`gaussianKernel` 總和 1）；`src/image-editor/tools/select/ants.test.ts`（10 × 10 中間 4 × 4 的方塊產生的線段總長 16；全 0 沒有線段）；`src/image-editor/tools/select/selection-gl.browser.test.ts`（`mountCanvas` 64 × 64：`writeSelection` 四種 op 讀回與 `combineRef` 相同；`featherSelection(4)` 讀回與 CPU 可分離高斯的結果每個值誤差 ≤ 1；`deselect` 後 `reselect` 回到原內容；`invertSelection` 兩次回原值；`selectionInLayer` 對 origin (16, 16) 的層位移 16；`loadLayerAlpha` 對半透明層得到它的 alpha）。
   - verify：`pnpm test src/image-editor/tools/select && pnpm test:browser src/image-editor/tools/select && pnpm check`
   - commit：`feat(image-select-paint): add selection mask with gpu set operations, morphology and feather`

3. **矩形、橢圓、套索工具、「選取」選單與選取虛線。**
   - 新 `src/image-editor/tools/select/marquee.ts`：純函式 `marqueeRect(start: Point, end: Point, mods: { shift: boolean; alt: boolean }): Rect`（Shift 鎖正方、Alt 以 start 為中心）、`ellipseMask(rect: Rect): Uint8Array`（rect 大小的 R8，邊緣 1 px 反鋸齒）；`rectMarqueeTool: ToolSpec`（`id: "select.rect"`、`label: "image.select.rect"`、`icon: RectMarqueeGlyph`、`key: "M"`、`slot: "marquee"`、`cursor: "crosshair"`）與 `ellipseMarqueeTool`（`select.ellipse`、`EllipseMarqueeGlyph`，其餘同）。拖曳時 `drawOverlay` 畫虛線框；放開時 `writeSelection(api, mask, rect, opFromEvent(e, panelMode))`（`src/image-editor/tools/select/mask.ts`），再依屬性欄的羽化值呼叫 `featherSelection`（`src/image-editor/tools/select/morph.ts`）。在選取範圍內（`readSelection` 該點 ≥ 128）拖曳且沒有按 `Mod`：只搬移選取框（讀出整張選取、位移後以 replace 寫回）。按著 `Mod`（macOS `metaKey`，其他 `ctrlKey`）在選取範圍內拖曳：本步不處理（第 5 步接上）。點一下沒拖曳 = `deselect`。
   - 新 `src/image-editor/tools/select/lasso.ts`：純函式 `polygonMask(points: Point[], rect: Rect): Uint8Array`（even-odd 掃描線填進 rect 大小的 R8，每像素 4×4 超取樣反鋸齒）、`polygonEdit` 狀態機 `createPolygonEdit(): { add(p): void; undo(): void; close(): Point[] | null; cancel(): void; points(): Point[] }`；`lassoTool`（`select.lasso`、`LassoGlyph`、`key: "L"`、`slot: "lasso"`：拖曳收點、放開封口）與 `polygonLassoTool`（`select.polygon`、`PolygonLassoGlyph`、`key: "L"`、`slot: "lasso"`：點擊加點、雙擊或 Enter 封口、Backspace 刪最後一點、Esc 放棄；這三個鍵在 `onKeyDown` 吃掉）。封口時 `writeSelection(api, polygonMask(points, bbox), bbox, op)` 再依羽化值羽化。
   - 新 `src/image-editor/tools/select/select-panel.tsx`：`SelectPanel({ api })`：`ToggleGroup`（`label: t("image.select.mode")`，四個選項 `replace` / `add` / `subtract` / `intersect` 對到 `image.select.modeNew` / `modeAdd` / `modeSubtract` / `modeIntersect`）、`NumberField`（`image.select.feather`，0–250）。模式與羽化值存在 `src/image-editor/tools/select/mask.ts` 新增匯出的 `selectOptions(api): { mode: MaskOp; feather: number }` / `setSelectOptions(api, patch)`（同一個 WeakMap 的狀態）。字串用 `useT(selectPaintMessages)`（`src/i18n/use-t.ts`、`src/image-editor/tools/messages.ts`）。四個選取工具的 `panel` 都是它；魔術棒之後也用。
   - 新 `src/image-editor/tools/select/menu.tsx`：`registerSelectMenu(): void`，用 `registerMenuItem` 註冊 `select.all`（`Mod+A`）、`select.deselect`（`Mod+D`，`enabled: hasSelection`）、`select.reselect`（`Mod+Shift+D`）、`select.inverse`（`Mod+Shift+I`）、`select.expand`、`select.contract`、`select.feather`（三者 `enabled: hasSelection`，`run` 用 `openHost`（`src/image-editor/tools/host.tsx`）開 02 的 `Dialog`，內有一個 `NumberField`（`image.select.amount`，擴張 / 收縮 1–500、羽化 0.5–250），footer 是 `image.select.apply` 與 `common.cancel` 兩顆 `Button`，確定時呼叫 `expandSelection` / `contractSelection` / `featherSelection`）、`select.loadAlpha`（`run` 呼叫 `loadLayerAlpha(api, session.active, session.target, "replace")`（`src/image-editor/tools/select/load.ts`），沒有 active 層時 `enabled` 為 false），全部 `menu: "select"`，label 用同名的 `image.select.*` key（`select.all` → `image.select.all` 等，`select.feather` → `image.select.featherMenu`）。同一檔用 `registerOverlay({ id: "select.ants", draw, animated: hasSelection })`：`draw` 以 `selectionOf(api).version` 快取 `antsSegments(readSelection(api), w, h)`，再 `drawAnts`。
   - 改 `src/image-editor/tools/register.ts`：函式體加 `registerSelectTools();`（新函式寫在 `src/image-editor/tools/select/register-select.ts`：`registerTool` 四個工具、呼叫 `registerSelectMenu()`）。每個工具的 `onKeyDown` 第一行是 `if (commonKeyDown(e, api)) return true;`（`src/image-editor/tools/keys.ts`）。
   - 測試：`src/image-editor/tools/select/marquee.test.ts`（Shift 鎖正方取兩邊較大者；Alt 時 rect 中心是 start；Shift + Alt 同時）；`src/image-editor/tools/select/lasso.test.ts`（凹多邊形與自交的「8 字」用 even-odd 判斷內外；`createPolygonEdit` 加三點、undo 後兩點、少於三點 `close` 回 null、`cancel` 後空）；`src/image-editor/tools/select/select-tools.browser.test.tsx`（`mountEditor` 一層 200 × 200：`api.setSession({ tool: "select.rect" })`，在 canvas 上派 `PointerEvent` 拖出矩形 → `readSelection` 在矩形內 255、外 0；再按 Shift 拖第二個 → 聯集；Alt → 差集；Shift + Alt → 交集；多邊形套索三次點擊加 Enter → 三角形；Esc 放棄後選取不變；`Mod+A` 全 255、`Mod+D` 全 0、`Mod+Shift+D` 回來、`Mod+Shift+I` 反轉；選取變化不改變 `store.position()`）；`src/image-editor/tools/register.test.ts`（`resetRegistry()` 後呼叫 `registerSelectPaint()`：`tools()` 含四個 select 工具、`menuItems("select")` 有八項、`overlays()` 有 `select.ants`；再呼叫一次丟 Error）。
   - verify：`pnpm test src/image-editor/tools && pnpm test:browser src/image-editor/tools/select && pnpm check`
   - commit：`feat(image-select-paint): add marquee and lasso tools, select menu and marching ants`

4. **魔術棒（worker）。**
   - 新 `src/image-editor/tools/select/wand.ts`（檔頭照 Compositor `Compositor/Rendering/WandPixels.c`）：`wandMask(input: { width: number; height: number; data: Uint8Array; x: number; y: number; tolerance: number; sample: 1 | 3 | 5; contiguous: boolean }, signal?: AbortSignal): Uint8Array`，照抄 `wand_mask`：參考色是點擊處 sample × sample 方塊（夾到圖內）的平均；每個通道含 alpha 都在容許值內才算符合；`contiguous` 用 4 連通 flood fill（明確的堆疊，不遞迴）；最後一次 1 px 羽化反鋸齒；每處理 65536 像素檢查一次 `signal.aborted`，是就丟 `DOMException("AbortError")`。
   - 改 `src/image-editor/worker/jobs.ts`：`jobs` 物件加一個 key `wand: (input: Parameters<typeof wandMask>[0], signal: AbortSignal) => wandMask(input, signal)`，`import { wandMask } from "../tools/select/wand"`，不改其他行。
   - 新 `src/image-editor/tools/select/wand-tool.tsx`：`wandTool: ToolSpec`（`id: "select.wand"`、`label: "image.select.wand"`、`icon: WandGlyph`、`key: "W"`、`cursor: "crosshair"`）。`onPointerDown`：取樣全部圖層時 `data = api.readComposite({ x: 0, y: 0, width, height })`、點 = 文件座標；否則 `data = api.readRegion(active, "image", 整層)`、點 = `apply(api.layerMatrix(active), p)`（`src/image-editor/tools/geom.ts`）。用 `runJob(api, "image.select.working", (signal) => api.runInWorker({ kind: "wand", input }, [input.data.buffer], signal))`（`src/image-editor/tools/state.ts`）；結果 null（取消）時不改選取；否則文件座標的結果用 `writeSelection`，圖層座標的結果用 `src/image-editor/tools/select/load.ts` 新增匯出的 `writeLayerSpaceMask(api, id, bytes, width, height, op)`（`loadLayerAlpha` 改成呼叫它），op 取 `opFromEvent(e, selectOptions(api).mode)`。`onKeyDown` 第一行 `commonKeyDown`。`panel` 是 `WandPanel({ api })`：`SelectPanel` 的內容（`src/image-editor/tools/select/select-panel.tsx`）加 `NumberField`（`image.select.tolerance`，0–255，預設 32）、`ToggleGroup`（`image.select.sample`：1 / 3 / 5 對到 `samplePoint` / `sample3` / `sample5`）、兩個 `Switch`（`image.select.contiguous` 預設開、`image.select.sampleAll` 預設關）；`toolState(api).job` 不為 null 時顯示 `Progress({ label: t("image.select.working"), value: null })` 與「停止」`Button`（`image.paint.stop`，呼叫 `job.abort()`）。魔術棒參數存在本檔的 WeakMap（`wandOptions(api)` / `setWandOptions`）。
   - 改 `src/image-editor/tools/select/register-select.ts`：加 `registerTool(wandTool)`。
   - 測試：`src/image-editor/tools/select/wand.test.ts`（改寫自 Compositor 的 `MagicWandTests.swift` 的每個案例；另外：容許值剛好等於差值時算符合、差 1 不算；`contiguous: false` 選到被隔開的同色區；只有 alpha 不同的像素不符合；`sample: 3` 取平均；`signal` 已 abort 時丟 `AbortError`）；`src/image-editor/tools/select/wand-tool.browser.test.tsx`（`mountCanvas` 兩層不同純色、上層只蓋左半：取樣全部圖層點左半 → 選取左半；取樣目前圖層（下層）點左邊 → 整張；在 `runInWorker` 回傳前 abort → 選取不變）；`src/image-editor/tools/register.test.ts` 加斷言 `tools()` 含 `select.wand`。
   - verify：`pnpm test src/image-editor/tools/select/wand.test.ts src/image-editor/tools/register.test.ts && pnpm test:browser src/image-editor/tools/select/wand-tool.browser.test.tsx && pnpm check`
   - commit：`feat(image-select-paint): add magic wand selection in worker`

5. **浮動選取（`Mod` + 拖曳移動像素）。**
   - 新 `src/image-editor/tools/select/floating.ts`（檔頭照 Compositor `Compositor/Document/FloatingSelection.swift`）：
     - 純函式 `resampleRef(src: { width; height; data: Uint8Array }, m: Mat2D, dst: Rect): Uint8Array`：對 `dst` 的每個像素中心，以 `invert(m)` 回推來源座標雙線性取樣（直通 alpha 先預乘再取樣再還原），來源外透明。
     - 每個 api 一份浮動狀態（WeakMap）：`{ layer: LayerId; srcRect: Rect; original: Uint8Array; pixels: Uint8Array; width; height; transform: Mat2D; duplicate: boolean }`（座標都是圖層像素）。
     - `beginFloat(api, opts: { duplicate: boolean }): boolean`：`session.target` 是 `"mask"`、沒有 active 層、沒有選取時回 false。`srcRect = docRectToLayer(api, active, selectionBounds(api))`（`src/image-editor/tools/geom.ts`、`select/mask.ts`）；`original = readRegion(active, "image", srcRect)`；`sel = selectionInLayer(api, active, srcRect)`；`pixels` = original 的 alpha 乘 `sel / 255`；不是 duplicate 時把 `original` 的 alpha 乘 `(255 − sel) / 255` 用 `writeRegion` 寫回（預覽，不 commit）。
     - `moveFloat(api, dx, dy)`（圖層像素）、`setFloatScale(api, s)`、`setFloatAngle(api, deg)`（以浮動像素中心為基準），只改 `transform` 並 `requestRender()`。
     - `commitFloat(api): void`：先把 `original` 寫回 `srcRect`（回到開始前）；`dstRect` = 變形後的外框（夾到圖層）；用 `createTileTracker(api, layer, "image")`（`src/image-editor/tools/tiles.ts`）`touch(srcRect)`、`touch(dstRect)`；再寫挖洞後的 srcRect（duplicate 時不挖）與 `resampleRef` 結果以 source-over 合到 `dstRect`；`api.commit("image.select.move", api.doc(), tracker.tiles())`；選取範圍跟著位移；清狀態。
     - `cancelFloat(api)`：把 `original` 寫回、清狀態。
     - `floatOverlay(ctx, view, api)`：把 `pixels` 放進 `OffscreenCanvas`（`ImageData`），以 `view.docToScreen × invert(layerMatrix) × transform` 畫在 overlay 上，加虛線外框。
   - 改 `src/image-editor/tools/select/marquee.ts` 與 `src/image-editor/tools/select/lasso.ts`：四個選取工具的 `onPointerDown` 在選取範圍內且按著 `Mod` 時呼叫 `beginFloat(api, { duplicate: e.altKey })`，之後的 move 呼叫 `moveFloat`（文件位移經 `layerMatrix` 換成圖層位移），`drawOverlay` 先畫 `floatOverlay`；Enter 在 `onKeyDown` 呼叫 `commitFloat`、Esc 呼叫 `cancelFloat`。
   - 改 `src/image-editor/tools/select/register-select.ts`：`registerOverlay({ id: "select.floatingCommit", draw: (ctx, view, api) => { if (floating(api) && !api.session().tool.startsWith("select.")) commitFloat(api); } })`（換到其他工具時合併；`floating(api)` 是 `floating.ts` 匯出的查詢函式）。`SelectPanel` 在 `floating(api)` 不為 null 時多顯示 `NumberField`（`image.select.scale`，1–1000，預設 100）與 `NumberField`（`image.select.angle`，−180–180）。
   - 測試：`src/image-editor/tools/select/floating.test.ts`（`resampleRef`：平移 (3, 0) 後像素在對的位置；旋轉 90° 後 2 × 1 變 1 × 2；半透明像素取樣後不變暗）；`src/image-editor/tools/select/floating.browser.test.tsx`（`mountEditor` 一層 64 × 64 白底、中間 8 × 8 紅色並選取它：`beginFloat` 後原位置透明、`moveFloat(10, 0)`、`commitFloat` → `readRegion` 紅色在新位置、舊位置透明、`store.position()` +1、按 `Mod+Z` 後回到原圖；`duplicate: true` 時原位置仍是紅色；`cancelFloat` 後與開始前逐像素相同）。
   - verify：`pnpm test src/image-editor/tools/select/floating.test.ts && pnpm test:browser src/image-editor/tools/select/floating.browser.test.tsx && pnpm check`
   - commit：`feat(image-select-paint): add floating selection with mod-drag move`

6. **剪下、拷貝、貼上、清除與填色。**
   - 新 `src/image-editor/tools/select/clipboard.ts`：
     - 編輯器內剪貼簿（WeakMap per api）：`{ width; height; data: Uint8Array; origin: Point }`（`origin` 是文件座標）。
     - `copy(api, merged: boolean): boolean`：沒有選取時：merged 拷貝整張合成、否則拷貝整層。有選取時：merged → `rect = selectionBounds`，`data = readComposite(rect)` 的 alpha 乘選取；否則 `rect = docRectToLayer(api, active, bounds)`，`data = readRegion(active, "image", rect)` 的 alpha 乘 `selectionInLayer(api, active, rect)`，`origin = apply(invert(layerMatrix(active)), { x: rect.x, y: rect.y })`（`src/image-editor/tools/geom.ts`）。同時在同一個呼叫裡同步 `new ClipboardItem({ "image/png": pngPromise })` 交給 `navigator.clipboard.write`（`navigator.clipboard?.write` 或 `ClipboardItem` 不存在時略過；`write` 的 rejection 吃掉），`pngPromise = api.runInWorker({ kind: "encodePng", input: { width, height, channels: 4, data: data.slice() } }).then((b) => new Blob([b], { type: "image/png" }))`。
     - `cut(api)`：`copy(api, false)` 後 `clearSelection(api)`。
     - `clearSelection(api): boolean`：沒有選取或沒有 active 層回 false；目標是 image 時 alpha 乘 `(255 − sel) / 255`；目標是 mask 時遮色片值乘 `(255 − sel) / 255`（塗黑）；經 `createTileTracker`（`src/image-editor/tools/tiles.ts`）與 `api.commit("image.select.clear", …)`。文字 / 形狀層先經第 1 步的 `rasterizeLayer`（`src/image-editor/tools/commands.ts`）並用 `openHost` 的 `ConfirmDialog` 問（`image.paint.rasterizeTitle` / `rasterizeBody` / `rasterize`，`common.cancel`）。
     - `pasteImage(api, img: { width; height; data: Uint8Array }, origin: Point | null): void`：`api.checkBudget({ layerPx: width × height })` 有錯就 `showError(api, err)`（`src/image-editor/tools/host.tsx`）並結束；`origin` 為 null 時置中在畫布；`addPixelLayer({ id: newLayerId(), name, above: active, transform: { origin, size: { width, height }, rotation: 0, flipX: false, flipY: false, sampling: "Smooth" } })` 以 `api.dispatch(cmd)`（無 label）建層，`writeRegion(id, "image", 整層, data)`，`api.commit("image.select.paste", api.doc(), [])`（新層沒有 before）；`name = translate(selectPaintMessages, locale, {}, "image.select.pastedLayer")`（`translate` 從 `src/i18n/messages.ts`，locale 取 `.fv-root` 的 `lang`，不是 `"zh-TW"` 就用 `"en"`）。
     - `pasteInternal(api)`：剪貼簿有內容時 `pasteImage(api, clip, clip.origin)`。
     - `attachPaste(api)`：對 `.fv-root`（找法同 `openHost`）加一次 `paste` 監聽（WeakSet 防重複）：`clipboardData` 有 `image/*` 檔時，`createImageBitmap(file)` → `OffscreenCanvas` `getImageData` 得到 RGBA；若編輯器內剪貼簿存在而且寬高相同，貼編輯器內的（保留位置），否則置中貼上；`preventDefault()`。沒有圖檔但編輯器內有內容時 `pasteInternal`。
   - 新 `src/image-editor/tools/select/fill-dialog.tsx`：`openFillDialog(api)`：`openHost` 開 02 的 `Dialog`（`image.paint.fillTitle`）：`ToggleGroup`（`image.paint.fillContents`：`foreground` / `background` / `contentAware`，本步只列 `foreground` / `background` 兩個選項，`contentAware` 由 P03-3 加）、`NumberField`（`image.paint.opacity`，1–100，預設 100），footer `image.select.apply` / `common.cancel`。確定時對選取範圍（沒有選取 = 整層）以前景或背景色 source-over、乘不透明度與選取值，填進目前圖層（mask 目標時用顏色的亮度 `round(0.299 r + 0.587 g + 0.114 b)`），一步 `commit("image.select.fill", …)`。前景 / 背景取 `toolState(api).fg` / `.bg`（`src/image-editor/tools/state.ts`）。匯出 `fillOptions` 型別 `{ contents: "foreground" | "background" | "contentAware"; opacity: number }`。
   - 新 `src/image-editor/tools/select/edit-menu.ts`：`registerEditMenu(): void`：`registerMenuItem` `edit.cut`（`Mod+X`）、`edit.copy`（`Mod+C`）、`edit.copyMerged`（`Mod+Shift+C`）、`edit.paste`（無快捷鍵，`enabled` = 編輯器內剪貼簿有內容）、`edit.fill`（`Shift+F5`，`run: openFillDialog`）、`edit.clear`（無快捷鍵，`enabled: hasSelection`），`menu: "edit"`，label 用 `image.select.cut` / `copy` / `copyMerged` / `paste` / `fill` / `clear`；`addKeyHandler`（`src/image-editor/tools/keys.ts`）加一個：`e.key` 是 `"Delete"` 或 `"Backspace"` 而且 `hasSelection(api)` → `clearSelection(api)` 回 true；另外 `registerOverlay({ id: "select.paste", draw: (_c, _v, api) => attachPaste(api) })`（overlay 每次重畫都會呼叫，`attachPaste` 冪等；這是 §9.7 唯一一定會拿到 api 的時機）。
   - 改 `src/image-editor/tools/select/register-select.ts`：加 `registerEditMenu()`。
   - 測試：`src/image-editor/tools/select/clipboard.browser.test.tsx`（`mountCanvas` 一層 64 × 64，選中間 8 × 8：`copy` 後剪貼簿 8 × 8、`origin` 是選取左上；`pasteInternal` 後多一層、位置對、`store.position()` +1；沒有選取時 `copy` 拷貝整層；`clearSelection` 在 image 目標時那塊透明、mask 目標時遮色片那塊 0、選取外不變；`cut` = 拷貝 + 清除；`navigator.clipboard.write` 用 spy：在 `copy` 同步呼叫期間被呼叫一次、參數是 `ClipboardItem`；`checkBudget` 用 spy 回 `ViewerError("too_large")` 時不建層；派一個帶 PNG 的 `ClipboardEvent("paste")` 給 `.fv-root` 後多一層）；`src/image-editor/tools/select/fill-dialog.browser.test.tsx`（填前景紅、不透明度 50% → 選取內像素是白與紅的一半、選取外不變、undo 一步）；`src/image-editor/tools/register.test.ts` 加斷言 `menuItems("edit")` 含六項。
   - verify：`pnpm test src/image-editor/tools/register.test.ts && pnpm test:browser src/image-editor/tools/select/clipboard.browser.test.tsx src/image-editor/tools/select/fill-dialog.browser.test.tsx && pnpm check`
   - commit：`feat(image-select-paint): add copy, cut, paste, clear and fill`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check`

## Phase 02 — 筆刷、橡皮擦、漸層、滴管

blocker：Phase 01；model：opus（Metal kernel 改寫成 GLSL 要判斷）。

1. **筆畫路徑（純函式）。**
   - 新 `src/image-editor/tools/paint/stroke-path.ts`（檔頭照 Compositor `Compositor/Document/BrushStroke.swift` 與 `Compositor/Document/EditorSession+Brush.swift`）：`catmullRom(points: Point[], tolerance = 0.2, maxDepth = 10): Point[]`（centripetal Catmull–Rom，適應性細分到弦離曲線 ≤ tolerance，遞迴深度上限 maxDepth）；`createLazyRope(length: number): { push(p: Point): Point | null; reset(p: Point): void }`（平滑 0–100% 對到繩長 0–100 px；游標在繩長內不動回 null，超過時拉著走回新點）；`straightLine(a: Point, b: Point): Point[]`（Shift 點兩點畫直線，回 `[a, b]`）；`spacing(size: number): number`（`max(1, size × 0.1)`，沿路徑每隔這個距離取一點）。
   - 測試：`src/image-editor/tools/paint/stroke-path.test.ts`（細分後每段弦離真曲線最遠 ≤ 0.2 px；深度上限 10 時點數有上限；兩點只回直線端點；懶繩在繩長內回 null、超過時新點與游標距離等於繩長；`spacing(1) = 1`、`spacing(100) = 10`）。
   - verify：`pnpm test src/image-editor/tools/paint/stroke-path.test.ts && pnpm check`
   - commit：`feat(image-select-paint): add brush stroke path with catmull-rom and lazy rope`

2. **筆刷覆蓋率 shader、筆畫 buffer 與 CPU 合成。**
   - 新 `src/image-editor/tools/paint/brush.glsl.ts`（檔頭照 Compositor `Compositor/Rendering/MetalBrushCoverage.swift`）：匯出 `BRUSH_FS`（`#version 300 es` fragment shader 字串）：把 `continuousBrush` 改寫成「一段線段」的覆蓋率：軟筆刷（hardness < 1）沿線段把光學密度做 8 點 Gauss–Legendre 積分、覆蓋率 = 1 − e^−密度；硬筆刷取到線段距離決定的覆蓋率；再乘選取（uniform `u_selection` 是 `selectionOf(api).texture`（`src/image-editor/tools/select/mask.ts`）、`u_docFromLayer` 是 `invert(api.layerMatrix(id))`（`src/image-editor/tools/geom.ts`）、沒有選取時乘 1）。同檔匯出 TS 參考 `coverageRef(px: Point, a: Point, b: Point, size: number, hardness: number): number`（同一個公式）。
   - 新 `src/image-editor/tools/paint/stroke-buffer.ts`：`createStrokeBuffer(api, id: LayerId, target: PixelTarget): { segment(a: Point, b: Point, size: number, hardness: number): Rect; read(rect: Rect): Uint8Array; dispose(): void }`：圖層像素大小（`layerPixelSize`）的 R8 texture（`createR8`，`src/image-editor/tools/gl.ts`），每段只畫線段外框（加半徑）的 quad，`gl.blendEquation(gl.MAX)` 讓同一筆重疊不累加；`segment` 回這段碰到的圖層像素 rect；`read` 回 rect 內的覆蓋率（0–255）；用完 GL 綁回 null。
   - 新 `src/image-editor/tools/paint/composite.ts`（純函式，CPU）：`paintOver(base: Uint8Array, cov: Uint8Array, color: RGBA, opacity: number): Uint8Array`（RGBA 直通 alpha，source-over，係數 `cov / 255 × opacity`）；`eraseOver(base, cov, opacity)`（alpha 乘 `1 − cov / 255 × opacity`）；`paintMask(base: Uint8Array, cov, value: number, opacity)`（R8，`base + (value − base) × cov / 255 × opacity`，四捨五入）。`RGBA` 從 `src/image-editor/tools/state.ts`。
   - 測試：`src/image-editor/tools/paint/composite.test.ts`（cov 0 時不變；cov 255、opacity 1 時 `paintOver` 等於顏色；半透明底上的 alpha 照 source-over；`eraseOver` 全擦 alpha 0；`paintMask` 四捨五入）；`src/image-editor/tools/paint/brush-gl.browser.test.ts`（`mountCanvas` 一層 128 × 128：軟筆刷一段的 `read` 與 `coverageRef` 逐像素誤差 ≤ 1；同一段畫兩次覆蓋率不變（MAX）；選左半後畫過中線，右半覆蓋率 0；`layerMatrix` 有平移時選取對到正確位置）。
   - verify：`pnpm test src/image-editor/tools/paint/composite.test.ts && pnpm test:browser src/image-editor/tools/paint/brush-gl.browser.test.ts && pnpm check`
   - commit：`feat(image-select-paint): add gpu brush coverage and stroke buffer`

3. **筆刷與橡皮擦工具、點陣化確認、色塊。**
   - 新 `src/image-editor/tools/paint/ensure-target.ts`：`ensurePaintable(api): Promise<{ id: LayerId; target: PixelTarget } | null>`：沒有 active 層或 active 是資料夾 → null；調整圖層只能畫遮色片：沒有遮色片時先 `api.dispatch` 一個命令把 `maskFile` 設成 `<ID>.mask.png`、`pixels` 的 mask 設 `{ kind: "gpu" }`，再 `writeRegion` 全 255（同一筆的 commit 一起記）並把 `session.target` 設 `"mask"`；`needsRasterize(layer)`（`src/image-editor/tools/commands.ts`）而且目標是 image 時 `setToolState(api, { rasterizeAsk: { layer, resolve } })`（`src/image-editor/tools/state.ts`）等使用者回答，否 → null，是 → `api.dispatch(rasterizeLayer(id))`（不帶 label，跟這一筆的 commit 一起成一步）。
   - 新 `src/image-editor/tools/paint/brush-tool.ts`：`createPaintTool(kind: "brush" | "eraser"): ToolSpec`；`brushTool = createPaintTool("brush")`（`id: "paint.brush"`、`label: "image.paint.brush"`、`icon: BrushGlyph`、`key: "B"`）、`eraserTool`（`paint.eraser`、`image.paint.eraser`、`EraserGlyph`、`key: "E"`）。`cursor: "none"`。流程：`onPointerDown` → `ensurePaintable` → `createStrokeBuffer`（`src/image-editor/tools/paint/stroke-buffer.ts`）、`createTileTracker`（`src/image-editor/tools/tiles.ts`）、`createLazyRope`（`src/image-editor/tools/paint/stroke-path.ts`，繩長 = smoothing × 100）；每個 move：點轉圖層像素座標（`apply(api.layerMatrix(id), p)`），`catmullRom` 細分、照 `spacing` 取點，對每一段 `rect = segment(...)` → `tracker.touch(rect)` → 從 tracker 的 before 拼出 rect 的底圖（筆畫開始前的像素）→ `paintOver` / `eraseOver` / `paintMask`（`src/image-editor/tools/paint/composite.ts`；遮色片時筆刷值是前景色亮度、橡皮擦值是 0）→ `api.writeRegion(id, target, rect, out)`；`onPointerUp`：`api.commit(kind === "brush" ? "image.paint.brush" : "image.paint.eraser", api.doc(), tracker.tiles())`、`dispose`。Shift + 點：與上一筆終點連直線（`straightLine`）。Alt + 點（只有 brush）：暫時當滴管，取 `api.readComposite({ x, y, width: 1, height: 1 })` 設成前景色。`onKeyDown`：第一行 `commonKeyDown`；`BracketLeft` / `BracketRight`（Shift 時改硬度）、`Digit1`–`Digit0` 不透明度，照「契約 / 快捷鍵」。`drawOverlay`：游標處畫半徑 = size / 2 × `view.zoom` 的圈，hardness < 1 時再畫半徑 × hardness 的內圈。
   - 新 `src/image-editor/tools/paint/color-swatches.tsx`：`ColorSwatches({ api })`：前景、背景兩個色塊（`Button` variant `ghost`，`aria-label` 是 `image.paint.foreground` / `background`），本步點了不開挑選器（第 4 步接上）；一顆交換（`image.paint.swap`）、一顆預設（`image.paint.defaultColors`）。
   - 新 `src/image-editor/tools/paint/paint-panel.tsx`：`PaintPanel({ api })`：`ColorSwatches`、`NumberField` 大小（1–2100）、硬度（0–100）、不透明度（1–100）、平滑（0–100），值寫進 `toolState(api).brush`；`rasterizeAsk` 不為 null 時畫 02 的 `ConfirmDialog`（`title: "image.paint.rasterizeTitle"`、`description: "image.paint.rasterizeBody"`、`confirmLabel: "image.paint.rasterize"`、`cancelLabel: "common.cancel"`，確定 / 取消呼叫 `resolve(true / false)` 並清掉 `rasterizeAsk`）。兩個工具的 `panel` 都是它。
   - 新 `src/image-editor/tools/paint/register-paint.ts`：`registerPaintTools(): void`：`registerTool(brushTool)`、`registerTool(eraserTool)`；`registerMenuItem` `paint.swapColors`（`shortcut: "X"`、`menu: "hidden"`、`label: "image.paint.swap"`）與 `paint.defaultColors`（`"D"`、`image.paint.defaultColors`）。
   - 改 `src/image-editor/tools/register.ts`：函式體加 `registerPaintTools();`。
   - 測試：`src/image-editor/tools/paint/brush-tool.browser.test.tsx`（`mountEditor` 一層 256 × 256 白：`setSession({ tool: "paint.brush" })`，派 pointer 拖一筆 → 路徑上是前景色、`store.position()` +1、按 `Mod+Z` 後回白；`session.target = "mask"` 加遮色片時畫在遮色片、圖層像素不變；文字層（`makeDoc` 的層帶 `text: {…}`）畫下去出 ConfirmDialog，按確定後該層沒有 `text` 且像素有改、按取消後什麼都沒變；選取左半時右半沒變；畫出圖層範圍外不丟錯、圖層尺寸不變；`]` 後 size 變大、Shift + `]` 後硬度變大；`X` 交換前景背景；5000 × 5000 圖層連續畫 2 秒，`console.info` 印出每幀時間，不當閘門）；`src/image-editor/tools/register.test.ts` 加斷言 `tools()` 含 `paint.brush`、`paint.eraser`，`menuItems("hidden")` 含兩項。
   - verify：`pnpm test src/image-editor/tools/register.test.ts && pnpm test:browser src/image-editor/tools/paint && pnpm check`
   - commit：`feat(image-select-paint): add brush and eraser tools`

4. **漸層、滴管與顏色挑選器。**
   - 新 `src/image-editor/tools/paint/gradient.ts`：純函式 `gradientAt(kind: "linear" | "radial", a: Point, b: Point, p: Point): number`（0–1，線性是投影比例、放射是距離 / |ab|，夾到 0–1）、`lerpStop(t, from: RGBA, to: RGBA): RGBA`、`lock45(a: Point, b: Point): Point`；`gradientTool: ToolSpec`（`id: "paint.gradient"`、`label: "image.paint.gradient"`、`icon: GradientGlyph`、`key: "G"`、`cursor: "crosshair"`）：拖曳時 `drawOverlay` 畫一條線，Shift 時 `lock45`；放開時對目前圖層整層（`layerPixelSize`）算每個像素（圖層像素中心換回文件座標再算 t），色標是前景 → 背景或前景 → 前景 alpha 0，以 `paintOver` 合上（係數 = 選取值，`selectionInLayer`），`createTileTracker` touch 整層後 `writeRegion`、`commit("image.paint.gradient", …)`；`ensurePaintable`（`src/image-editor/tools/paint/ensure-target.ts`）先跑。`panel`：`GradientPanel({ api })`：`ColorSwatches`、`ToggleGroup`（`image.paint.gradientType`：`gradientLinear` / `gradientRadial`）、`ToggleGroup`（`image.paint.gradientStops`：`stopsFgBg` / `stopsFgClear`）。
   - 新 `src/image-editor/tools/paint/eyedropper.ts`：純函式 `averageAt(data: Uint8Array, w: number, h: number, x: number, y: number, size: 1 | 3 | 5): RGBA`；`eyedropperTool: ToolSpec`（`id: "paint.eyedropper"`、`label: "image.paint.eyedropper"`、`icon: EyedropperGlyph`、`key: "I"`、`cursor: "crosshair"`）：點擊時取目前圖層（`readRegion` 點附近 5 × 5）或合併結果（`readComposite`），設前景色（Alt 時設背景色）。`panel`：`ToggleGroup`（`image.paint.source`：`sourceLayer` / `sourceAll`）與取樣大小 `ToggleGroup`（`image.select.sample`）。
   - 新 `src/image-editor/tools/paint/color-picker.tsx`：純函式 `hexToRgb(hex: string): [number, number, number] | null`（接受 `#rgb`、`#rrggbb`、不分大小寫，其他回 null）、`rgbToHex`、`rgbToHsv`、`hsvToRgb`；元件 `ColorPicker({ value: RGBA; onChange(v: RGBA): void })`：HSV 方塊（canvas，pointer 拖曳）、色相 `Slider`（`image.paint.hue`，0–360）、hex 輸入（`image.paint.hex`，非法時不更新）。改 `src/image-editor/tools/paint/color-swatches.tsx`：兩個色塊各包在 02 的 `Popover`（`trigger` = 色塊、`label` = `image.paint.foreground` / `background`）裡放 `ColorPicker`。
   - 改 `src/image-editor/tools/paint/register-paint.ts`：加 `registerTool(gradientTool)`、`registerTool(eyedropperTool)`。
   - 測試：`src/image-editor/tools/paint/gradient.test.ts`（線性在 a 是 0、b 是 1、超出夾住；放射在 a 是 0；`lock45` 對 (10, 3) 回 (10, 0)、(10, 9) 回 (10, 10)；`lerpStop(0.5)` 中間色）；`src/image-editor/tools/paint/eyedropper.test.ts`（3 × 3 平均；邊角只平均圖內的像素）；`src/image-editor/tools/paint/color-picker.test.tsx`（`#F00` 與 `#ff0000` 都是 [255, 0, 0]；`#12` 回 null；HSV ↔ RGB 往返誤差 ≤ 1；輸入非法 hex 後 `onChange` 沒被呼叫）；`src/image-editor/tools/paint/gradient-tool.browser.test.tsx`（`mountEditor` 一層：從左拖到右，左邊是前景、右邊是背景、undo 一步）。
   - verify：`pnpm test src/image-editor/tools/paint && pnpm test:browser src/image-editor/tools/paint/gradient-tool.browser.test.tsx && pnpm check`
   - commit：`feat(image-select-paint): add gradient, eyedropper and color picker`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check`

## Phase 03 — 仿製、污點修復、內容感知填色

blocker：Phase 02；model：opus。

1. **仿製印章。**
   - 新 `src/image-editor/tools/paint/clone.ts`（檔頭照 Compositor `Compositor/Document/CloneStamp.swift`）：純函式 `cloneOffset(state: { source: Point; firstDest: Point | null; aligned: boolean }, strokeStart: Point): Point`（對齊時第一筆定下 `dest − source` 之後固定；不對齊時每一筆都從 source 重新開始）；`cloneTool: ToolSpec`（`id: "paint.clone"`、`label: "image.paint.clone"`、`icon: CloneGlyph`、`key: "S"`、`cursor: "none"`）：Alt + 點設來源（文件座標）；沒有來源時點擊不畫、屬性欄顯示 `image.paint.cloneNoSource`；一筆開始時讀取樣來源：目前圖層 = `readRegion(id, "image", 整層)`、全部圖層 = `readComposite(整張)` 再以 `layerMatrix` 對到圖層像素；筆畫流程與 `src/image-editor/tools/paint/brush-tool.ts` 相同（`createStrokeBuffer`、`createTileTracker`、`ensurePaintable`），只是每個像素的顏色取自來源位移後的像素（`paintOver` 換成本檔的 `cloneOver(base, cov, src, opacity)`）；`commit("image.paint.clone", …)`。`drawOverlay`：筆刷圈加來源十字（`source + 目前位移`）。`onKeyDown` 同 brush（`commonKeyDown`、`[` `]`、數字鍵）。`panel`：`PaintPanel` 的大小 / 硬度 / 不透明度加 `Switch`（`image.paint.cloneAligned`，預設開）與 `ToggleGroup`（`image.paint.source`：`sourceLayer` / `sourceAll`）。
   - 改 `src/image-editor/tools/paint/register-paint.ts`：加 `registerTool(cloneTool)`。
   - 測試：`src/image-editor/tools/paint/clone.test.ts`（改寫自 Compositor 的 `CloneStampTests.swift` 每個案例；對齊時第二筆沿用第一筆的位移；不對齊時第二筆從來源重新開始；`cloneOver` cov 255 時等於來源像素）；`src/image-editor/tools/paint/clone-tool.browser.test.tsx`（`mountEditor` 一層左紅右藍：Alt 點左邊、在右邊畫一筆 → 右邊出現紅色、undo 一步；取樣全部圖層時來源包含上層）。
   - verify：`pnpm test src/image-editor/tools/paint/clone.test.ts && pnpm test:browser src/image-editor/tools/paint/clone-tool.browser.test.tsx && pnpm check`
   - commit：`feat(image-select-paint): add clone stamp`

2. **污點修復（worker）。**
   - 新 `src/image-editor/tools/heal/spot-heal.ts`（檔頭照 Compositor `Compositor/Rendering/HealPixels.c`）：`spotHeal(input: { width: number; height: number; data: Uint8Array; mask: Uint8Array; mode: "contentAware" | "texture" }, signal?: AbortSignal): Uint8Array`，照抄 `spot_heal` 與 `heal_solve`：「內容感知」在 24 個角度 × 5 個距離找邊環最像的一塊、再 ±3 px 微調，邊緣差用多重網格解 Laplace 方程攤進去；「產生紋理」是平滑填補加上照周圍細節配的顆粒；隨機部分照抄 C 的 `heal_hash`；回傳 RGBA；每一個外層迴圈檢查一次 `signal.aborted` 丟 `AbortError`。
   - 改 `src/image-editor/worker/jobs.ts`：加 key `heal: (input: Parameters<typeof spotHeal>[0], signal: AbortSignal) => spotHeal(input, signal)`，`import { spotHeal } from "../tools/heal/spot-heal"`，不改其他行。
   - 新 `src/image-editor/tools/heal/heal-tool.tsx`：`healTool: ToolSpec`（`id: "paint.heal"`、`label: "image.paint.heal"`、`icon: HealGlyph`、`key: "J"`、`cursor: "none"`）：筆畫用 `createStrokeBuffer`（`src/image-editor/tools/paint/stroke-buffer.ts`）畫出要修的區域（overlay 以半透明紅色顯示），放開時 `rect` = 覆蓋外框加 `max(16, size)` px 的邊（夾到圖層）；`data = readRegion(id, "image", rect)`、`mask = read(rect)`；`runJob(api, "image.paint.working", (signal) => api.runInWorker({ kind: "heal", input }, [data.buffer, mask.buffer], signal))`（`src/image-editor/tools/state.ts`）；結果 null（取消）時什麼都不寫；否則 `createTileTracker` touch rect → `writeRegion` → `commit("image.paint.heal", …)`。`ensurePaintable` 先跑；遮色片目標時不動作。`panel`：大小、硬度、`ToggleGroup`（`image.paint.healMode`：`healContentAware` / `healTexture`），`job` 不為 null 時 `Progress({ value: null })` 與「停止」。
   - 新 `scripts/gen-heal-fixtures.mjs`：只在更新 fixture 時手動跑，不進 CI。用固定的 LCG（seed 1）產生 64 × 64 RGBA 輸入（水平漸層加雜訊）與 mask（中心 (32, 32)、半徑 10 的圓 = 255），寫 `src/image-editor/tools/heal/__fixtures__/heal-input.rgba`、`heal-mask.r8`；寫一個 C harness 呼叫 `$SCRATCH/compositor/Compositor/Rendering/HealPixels.c` 的 `spot_heal`（兩種模式，參數照 C 的函式簽名；C 簽名需要的其他值用 C 檔裡的預設值），用 `cc -O2` 編譯執行，輸出 `spot-heal-content-aware.rgba`、`spot-heal-texture.rgba`。腳本檔頭註解寫用法：`COMPOSITOR=$SCRATCH/compositor node scripts/gen-heal-fixtures.mjs`。
   - 改 `src/image-editor/tools/paint/register-paint.ts`：加 `registerTool(healTool)`。
   - 測試：`src/image-editor/tools/heal/spot-heal.test.ts`（改寫自 Compositor 的 `SpotHealingTests.swift` 每個案例；兩種模式與 fixture 逐像素相差 ≤ 1（差異只來自 C 的 float 與 JS 的 double）；mask 外的像素 byte 相同；已 abort 的 signal 丟 `AbortError`）；`src/image-editor/tools/heal/heal-tool.browser.test.tsx`（`mountEditor`：畫一個點放開，job 完成後 `store.position()` +1；在 job 回來前按「停止」，`readRegion` 與開始前相同、`store.position()` 不變）。
   - verify：`pnpm test src/image-editor/tools/heal/spot-heal.test.ts && pnpm test:browser src/image-editor/tools/heal && pnpm check`
   - commit：`feat(image-select-paint): add spot healing in worker`

3. **內容感知填色（worker）。**
   - 新 `src/image-editor/tools/heal/content-fill.ts`（檔頭照 Compositor `Compositor/Rendering/ContentFill.c`）：`export const CONTENT_FILL_MAX_PIXELS = 4_000_000`；`contentFill(input: { width: number; height: number; data: Uint8Array; hole: Uint8Array }, signal?: AbortSignal): Uint8Array`，照抄 `content_fill`：從邊界往內一圈圈填，每個像素比 4 個鄰居傳來的候選加 24 個隨機候選、5×5 SSD，再做半徑從 64 減半的隨機搜尋；隨機照抄 C 的 `next_random`；洞（hole ≥ 128 的像素數）超過 `CONTENT_FILL_MAX_PIXELS` 丟 `RangeError`；每填完一圈檢查 `signal.aborted`。
   - 改 `src/image-editor/worker/jobs.ts`：加 key `contentFill: (input: Parameters<typeof contentFill>[0], signal: AbortSignal) => contentFill(input, signal)`，`import { contentFill } from "../tools/heal/content-fill"`，不改其他行。
   - 改 `src/image-editor/tools/select/fill-dialog.tsx`（`openFillDialog`）：`ToggleGroup` 加第三個選項 `contentAware`（`image.paint.fillContentAware`）；選取範圍的像素數（`selectionBounds` 內 ≥ 128 的數量）超過 `CONTENT_FILL_MAX_PIXELS`、或沒有選取、或目標是遮色片時，選了 `contentAware` 確定鈕 disabled 並在對話框裡顯示 `image.paint.fillTooLarge`（沒有選取時也顯示這句）。確定時：`rect = docRectToLayer(選取外框)` 外加 32 px（夾到圖層），`data = readRegion`、`hole = selectionInLayer(api, id, rect)`（`src/image-editor/tools/select/mask.ts`），`runJob(api, "image.paint.working", (signal) => api.runInWorker({ kind: "contentFill", input }, [data.buffer, hole.buffer], signal))`，執行中對話框顯示 `Progress({ value: null })` 與「停止」並停用確定鈕；結果 null 時關對話框、什麼都不寫；否則 `createTileTracker` touch rect → `writeRegion` → `commit("image.select.fill", …)`。
   - 改 `scripts/gen-heal-fixtures.mjs`：加一支：同一份 64 × 64 輸入、hole 用 `heal-mask.r8`，呼叫 `$SCRATCH/compositor/Compositor/Rendering/ContentFill.c` 的 `content_fill`，輸出 `src/image-editor/tools/heal/__fixtures__/content-fill.rgba`。
   - 測試：`src/image-editor/tools/heal/content-fill.test.ts`（與 fixture 逐像素相差 ≤ 1；hole 外的像素 byte 相同；2001 × 2000 全洞丟 `RangeError`；已 abort 丟 `AbortError`）；`src/image-editor/tools/select/fill-dialog.browser.test.tsx` 加案例（選中間一塊、內容感知、確定 → 那塊像素改變、選取外不變、undo 一步；按「停止」後不變）。
   - verify：`pnpm test src/image-editor/tools/heal/content-fill.test.ts && pnpm test:browser src/image-editor/tools/select/fill-dialog.browser.test.tsx && pnpm check`
   - commit：`feat(image-select-paint): add content-aware fill in worker`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check`

## Phase 04 — 遮蔽與走查

blocker：Phase 03；第 2 步另等 10 第 7 步（`ImageEditor`）與 10 的存檔步驟；model：sonnet。

1. **遮蔽選取範圍。**
   - 新 `src/image-editor/tools/redact.ts`：純函式 `mosaicRef(data: Uint8Array, w: number, h: number, cell: number, sel: Uint8Array): Uint8Array`（每格取格內平均色，只替換 sel ≥ 1 的像素，部分選取的像素以 sel / 255 混合後再把 alpha 設成格平均的 alpha；`cell` 至少 2）、`blackRef(data, sel)`（sel ≥ 1 的像素混向不透明黑，sel = 255 時完全黑）；`redactSelection(api, opts: { style: "mosaic" | "black"; cell: number }): void`：對 `api.doc().manifest.layers` 中每個 `isPixelLayer`（`src/image-editor/tools/commands.ts`）的層（含 `isVisible: false`，資料夾與調整圖層略過）：`rect = docRectToLayer(api, id, selectionBounds(api))` 夾到圖層，空的略過；`needsRasterize` 的層用 `rasterizeLayer` 合進同一個 doc；`sel = selectionInLayer(api, id, rect)`；每層各自 `createTileTracker(api, id, "image")` touch rect → `readRegion` → `mosaicRef` / `blackRef` → `writeRegion`；最後一次 `api.commit("image.paint.redactConfirm", doc, 全部層的 tiles 串接)`。遮色片不動。
   - 新 `src/image-editor/tools/redact-dialog.tsx`：`openRedactDialog(api)`：`openHost`（`src/image-editor/tools/host.tsx`）開 02 的 `Dialog`（`title: "image.paint.redactTitle"`、`description: "image.paint.redactBody"`），內有 `ToggleGroup`（`image.paint.redactStyle`：`redactMosaic` / `redactBlack`，預設 mosaic）、`NumberField`（`image.paint.redactCell`，2–200，預設 16，style 是 black 時不顯示），footer 是 `Button variant="danger"`（`image.paint.redactConfirm`）與 `common.cancel`；確定呼叫 `redactSelection` 後關閉。
   - 新 `src/image-editor/tools/register-redact.ts`：`registerRedact(): void`：`registerMenuItem({ id: "image.redact", menu: "image", label: "image.paint.redact", enabled: hasSelection, run: openRedactDialog })`。
   - 改 `src/image-editor/tools/register.ts`：函式體加 `registerRedact();`。
   - 測試：`src/image-editor/tools/redact.test.ts`（`mosaicRef` 每格同色、選取外 byte 相同；`blackRef` sel 255 時是 [0, 0, 0, 255]；cell 1 時當成 2）；`src/image-editor/tools/redact.browser.test.tsx`（`mountEditor` 三層：一層一般、一層 `isVisible: false`、一層帶 `text: {…}`，再加一個有遮色片的層與一個調整圖層；選中間一塊 → `redactSelection({ style: "mosaic", cell: 8 })`：三個像素層選取內都是馬賽克、選取外 `readRegion` byte 相同、文字層沒有 `text`、遮色片 `readRegion(id, "mask", …)` 不變、調整圖層的 `adjustment` 深度相同、`store.position()` +1、按一次 `Mod+Z` 全部還原；`black` 時選取內全黑）；`src/image-editor/tools/register.test.ts` 加斷言 `menuItems("image")` 含 `image.redact`。
   - verify：`pnpm test src/image-editor/tools/redact.test.ts src/image-editor/tools/register.test.ts && pnpm test:browser src/image-editor/tools/redact.browser.test.tsx && pnpm check`
   - commit：`feat(image-select-paint): add redact selection across all pixel layers`

2. **整合走查。**
   - 新 `src/image-editor/tools/walkthrough.browser.test.tsx`：
     - 準備：`project = fromImage({ width: 256, height: 256, rgba: 底圖 }, "Base")`（`src/comp/index.ts`；底圖是固定的水平漸層）；再往 `project.manifest.layers` 推兩層（`id` 用 `crypto.randomUUID().toUpperCase()`、`name`、`isVisible`（第一層 false、第二層 true）、`transform` 蓋滿畫布 `{ origin: { x: 0, y: 0 }, size: { width: 256, height: 256 }, rotation: 0, flipX: false, flipY: false, sampling: "Smooth" }`、`imageFile: "<ID>.png"`），並 `project.assets.set("images/<ID>.png", encodePng({ width: 256, height: 256, channels: 4, data }))`（`encodePng` 從 `src/comp/index.ts`；隱藏的那層用 4 px 黑白棋盤格，另一層用純色）；`blob = writeProject(project)`，`file = { name: "walk.comp.zip", source: blobSource(blob) }`（`src/contract/byte-source.ts`）；掛 `<ImageEditor file={file} onSave={collect} onClose={() => {}} />`（`src/image-editor/index.ts`），`collect` 把 `SaveRequest` 收進陣列並 resolve。`menuItems(...)` 的 `run(api)` 需要的 `api`：掛載前先註冊一個只在本測試用的 `registerOverlay({ id: "test.capture", draw: (_c, _v, a) => { api = a; } })` 取得（不呼叫 `resetRegistry`）。
     - 走一遍（Pointer 與鍵盤事件派到編輯器的 canvas 與 `document`）：按 `W` 切魔術棒、點一塊 → 呼叫 `menuItems("select")` 裡 `select.feather` 的 `run(api)`，在對話框輸入 2 按確定→ `Mod+C` → `edit.paste` 的 `run(api)` → 圖層數 +1 → 在新層加遮色片（`api.dispatch` 一個設 `maskFile` 的命令）、`session.target = "mask"`、按 `B` 用筆刷畫一筆 → 按 `J` 修一個點、等 job 結束 → 按 `S`、Alt 點、畫一筆 → 按 `M` 拖一塊蓋過隱藏層所在位置 → `image.redact` 的 `run(api)`、對話框選 mosaic、cell 16 按確定 → `Mod+S`。
     - 斷言：`collect` 收到一個 `ext: ".comp.zip"` 的請求；`readProject(new Uint8Array(await req.blob.arrayBuffer()))`（`src/comp/index.ts`）後，隱藏層的 `project.assets.get("images/<ID>.png")` 經 `decodePng(bytes, "layer")` 解出來，遮蔽範圍內的像素等於 `mosaicRef`（`src/image-editor/tools/redact.ts`）對原圖的結果（不是原像素）；每個會改像素的動作後 `api` 所在 store 的 undo 可用（頂列的復原鈕不是 disabled）。
     - 鍵盤：依序按 `M` `L` `W` `B` `E` `S` `J` `G` `I`，每次 `api.session().tool` 是對應的工具 id（契約的「快捷鍵與註冊 id」）；`]` 後筆刷變大。
     - 衝突：`menuItems` 全部選單的 `shortcut` 沒有重複、`tools()` 的 key 不等於任何選單 `shortcut`（10 的 `registry.ts` 註冊時已會丟錯；這裡再斷言一次整體結果）。
     - i18n：`selectPaintMessages.en` 與 `["zh-TW"]` 的 key 集合相同；`tools()` 與 `menuItems(...)` 裡本份註冊的每個 `label` 都是 `selectPaintMessages.en` 的 key。
   - verify：`pnpm test:browser src/image-editor/tools/walkthrough.browser.test.tsx && pnpm check`
   - commit：`test(image-select-paint): add select, paint and redact walkthrough`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check`

驗收（主 agent，不是 step）：桌面 Chrome、Safari、Firefox 與 iPad 尺寸的 Safari 用觸控畫一筆；5000 × 5000 圖層連續畫 10 秒每幀 < 16 ms（DevTools Performance）；site playground 亮暗兩種給 CEO 看過。宿主要做的事：遮蔽後 replace 存檔的舊版保留與提示歸 H1（storage 22 Phase 3）。

## 之後再做

- 畫到圖層範圍外時擴大圖層（等 §9.7 有改圖層 texture 尺寸的介面）。
- `⌘` 點圖層縮圖載入選取（等 §9.7 有圖層列的點擊掛勾）。
- 選取主體、物件選取、去背（自架瀏覽器端分割模型，授權另查）。
- 顏色範圍（`WandPixels.c` 的 `color_range_mask` 可以照抄）。
- 真正的 PatchMatch 內容感知填色（多尺度、迭代、投票），以及填色延伸到畫布外。
- 塗抹 / 液化（`MetalWarp.swift`）、模糊工具。
- 筆刷壓力（Pointer Events 的 `pressure`）、自訂筆尖。
