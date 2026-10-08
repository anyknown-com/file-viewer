# 13 image-text-shapes — 影像編輯器的文字圖層與形狀圖層

狀態：planned（2026-10-08）；blocker：10 image-editor 第 1–3 步（`src/image-editor/api.ts`、`registry.ts`、`extensions.ts`、`worker/jobs.ts`、合成器與 `test/make-doc.ts`、`test/mount-canvas.tsx`）、09 comp-format P02-1、P02-2、P03-1–P03-4、P04-1（`src/comp/index.ts` 的 `LayerTextStyle`、`LayerShapeStyle`、`validateLikeCompositor`、`readProject`、`writeProject`）；Phase 03 另等 10 第 4 步（圖層面板與 `test/mount-editor.tsx`）；model：opus（Phase 01）、sonnet（Phase 02、03）；與 11、12 平行；push：整份做完一次。來源：storage `docs/plans/20-image-text-shapes.md`（設計照搬，宿主與 e2e 走查段落拿掉）。目錄：`src/image-editor/text/`、`src/image-editor/shapes/`。

## 判斷

- 文字工具（`T`）與形狀工具（`U`）做出來的是「像素圖層 + 可再編輯的資料」，跟 Compositor 一樣：PNG 是顯示與匯出用的成品，`text` / `shape` 欄位讓它之後還能改字、改色、改大小而不糊。10 不需要本份就畫得出這種圖層（它就是一張圖）；本份負責產生與重畫那張圖，以及編輯介面。
- 欄位以 09 的 `LayerTextStyle` / `LayerShapeStyle`（`src/comp/index.ts` 匯出，定義在 `src/comp/manifest-text-shape.ts`，照 Compositor `Document/TypeTool.swift`、`Document/ShapeTool.swift`）為準。`CGSize` / `CGPoint` 在 JSON 裡是兩個 number 的陣列；圖層的 `transform.origin` / `transform.size` 也是 `[x, y]` / `[w, h]`。
- 文字：`content`（≤ 100,000 個 UTF-16 單位）、`fontName`（PostScript 名稱）、`fontSize`（1–2000 px）、`red` / `green` / `blue`（0–1）、`alignment`（`Left` / `Center` / `Right`）、`tracking`（−100–1000 px，每個字後面加這麼多，同 Compositor 當 `.kern` 用）、`leading`（0–5000 px，0 = 自動 = 字級的 120%）、選填 `boxSize`（`[w, h]`，每邊 16–30,000）、`colorRuns`（`{ location, length, red, green, blue }`）、`fontRuns`（`{ location, length, fontName }`）。run 的 `location` / `length` 是 UTF-16 單位，JS 字串本來就是，不用轉。run 的型別在本份寫成 `NonNullable<LayerTextStyle["colorRuns"]>[number]`、`NonNullable<LayerTextStyle["fontRuns"]>[number]`，不另外 import。
- 字型 v1 只有 Geist（`@fontsource-variable/geist@5.3.0`，用 `pnpm add --save-exact` 釘死版本，07 第 8 步也加同一版本；同源自架，CSP 不用改）。`src/image-editor/text/fonts.ts` 檔頭 `import "@fontsource-variable/geist";`（同 07 的 `render-frame.ts`），CSS family 是 `"Geist Variable"`。字重用 PostScript 名稱寫進檔：`Geist-Thin`、`Geist-ExtraLight`、`Geist-Light`、`Geist-Regular`、`Geist-Medium`、`Geist-SemiBold`、`Geist-Bold`、`Geist-ExtraBold`、`Geist-Black`，對到可變字型 wght 100–900。裝了 Geist 的 Mac 上 Compositor 用同一名稱找得到字型。
- 打開的文字圖層用我們沒有的字型（例如 Compositor 存的 `Helvetica-Bold`）：照常顯示它的像素；開始編輯時先出 `ConfirmDialog`（`src/primitives/dialog.tsx`）「這裡沒有「Helvetica-Bold」，編輯後會換成 Geist」，確定才換（缺的名稱一律換成 `Geist-Regular`），取消就不進編輯。
- 排版是純函式，量字寬的函式由外面傳入，測試用假的：
  - 留白照 Compositor（`TypeTool.swift` 的 `padding` = 12）：字從 (12, 12) 開始；段落框的畫布 = `boxSize`，斷行寬度 = 框寬 − 24；點文字的畫布寬 = 最寬那行 + 24 + 0.1 × `fontSize`、高 = 行數（至少 1）× 行高 + 24，兩邊都無條件進位且至少 16 px。
  - 先依 `\n` 分段；有 `boxSize` 時在框寬 − 24 內斷行（`Intl.Segmenter` 的 word 斷點；含漢字、平假名、片假名、韓文的 segment 再拆成 grapheme，逐字可斷；單一 segment 比斷行寬度長時逐 grapheme 斷；行尾的空白不算寬度）；沒有 `boxSize` 就是點文字，只在 `\n` 換行。
  - 字距用 `ctx.letterSpacing = "<tracking>px"`，量寬與畫字都整段字串一起做，不逐字放（逐字 `fillText` 會打斷阿拉伯文、印度文的連字）。沒有 `letterSpacing` 的舊瀏覽器 tracking 當 0，屬性欄顯示說明。
  - 行高 = `leading`，0 時 1.2 × `fontSize`；每行的字畫在 `textBaseline = "top"`、y = 行頂 + (行高 − `fontSize`) / 2。對齊：可用寬 = 段落框寬 − 24（點文字是最寬那行），Left x = 12、Center x = 12 + (可用寬 − 行寬) / 2、Right x = 12 + 可用寬 − 行寬。一行裡依 color run 與 font run 的邊界切成小段，每段用自己的字型量、自己的顏色畫。
- 畫成像素：`OffscreenCanvas` 2D 畫出 RGBA8 直通 alpha（`getImageData`）。本份不編 PNG：像素經 10 的 `EditorApi.writeRegion`（尺寸不變）或 `resizePixels`（尺寸改變）進圖層，存檔時 10 的存檔流程用 worker 的 `encodePng` job 編成 `<ID>.png`。本份只有整合測試（第 9 步）為了不依賴 10 的存檔模組，自己呼叫 `api.runInWorker({ kind: "encodePng", … })`。
- 寫像素的規則（`src/image-editor/text/raster.ts`，文字與形狀共用），圖層 id 永遠不變：
  - 目前像素尺寸 = `api.pixelSize(id, "image")`（00-overview §9.7）；回 null（還沒有 texture）時當作 `transform.size` 四捨五入。
  - 新畫出來的像素尺寸等於目前尺寸 → 就地寫：`snapshotTiles` → `writeRegion` → `commit(label, doc, tiles)`。
  - 尺寸不同 → `resize = api.resizePixels(id, "image", 新尺寸, { pixels })` 整張換掉，`commit(label, doc, [], [resize])`；undo 換回舊尺寸與舊像素。
  - 圖層有 `maskFile` 而沒有 `maskPlacement` 時，遮色片原本蓋住 transform 矩形；改 `transform.size` 會把遮色片拉伸，所以同一個 patch 把 `maskPlacement` 設成改之前的 `transform`，遮色片留在原位（`maskLinked` 不變，之後移動圖層照常帶著它走）。
- 編輯介面：畫布上方疊 `contenteditable` 的 `div`，portal 到 `api.gl.canvas` 的父元素，用 CSS `transform: matrix(...)` 對齊圖層的位置、角度、縮放（`ViewTransform.docToScreen` 乘上 `api.layerMatrix(id)` 的反矩陣），字型、大小、行高、字距、對齊跟圖層一樣；編輯中用 `api.setSession({ renderHidden })` 藏該圖層的 GL 畫面。選取部分文字後在屬性欄改顏色或字重，產生 / 合併 `colorRuns` / `fontRuns`。Esc、切換工具（`ToolSpec.onDeactivate`）或點畫布上別處結束編輯，這時排版、畫像素、`commit` 一步 undo。DOM 內只有文字節點與本份自己建的 `span`；貼上只取 `text/plain`；Enter 自己插 `\n`；`beforeinput` 的 `format*` 與 `insertFromDrop` 一律擋掉；不用 `innerHTML` / `dangerouslySetInnerHTML`。
- 使用者縮放過文字圖層（`transform.size` ≠ 目前像素尺寸）之後再改字：段落框的 `boxSize` 改成目前 `transform.size` 四捨五入，點文字照排版重算大小；`transform.origin` 與 `rotation` 不變。
- 文字工具：點一下建點文字，拖曳超過 4 文件 px 建段落框；點到既有文字圖層（最上面一個可見、帶 `text` 的層，用 `api.layerMatrix` 換到圖層像素座標判斷在不在像素範圍內）進入編輯。段落框的八個把手改框大小（重排、不縮放字）；一般變形（10 的 `⌘T`）才是縮放。文字可當剪裁的底，也能加 12 的效果。
- 形狀：`kind`（`Rectangle` / `Ellipse` / `Line`）、`red` / `green` / `blue`、`cornerRadius`（文件 px，矩形用，> 0 即圓角矩形）、選填 `lineWidth`（沒給當 4）與 `start` / `end`（線的兩端，圖層外框的比例 `[x, y]`）。拖曳畫外框，Shift 鎖正方形 / 正圓 / 45° 線，Alt 從中心拉。線的外框四邊各多 `lineWidth / 2`（水平線的外框也有高度）。要外框線就加 12 的「筆畫」效果（Compositor 的形狀也沒有自己的外框）。被 10 的變形縮放後，經 `LayerDecor.onTransformEnd` 以新大小乾淨重畫（另記一步 undo「重畫形狀」）；只旋轉、翻轉時大小沒變，不重畫。
- 新圖層、刪圖層、改圖層紀錄用 10 開放的命令（00-overview §9.7）：`insertLayer`、`removeLayers`、`patchLayer`（`src/image-editor/doc/commands/layers.ts`），本份不另寫。新層的 `id` 用 `crypto.randomUUID().toUpperCase()`，`insertLayer(record, api.session().active)`（放在 active 那層上面，沒有就放最上面），名稱：文字取 `content` 前 30 個 grapheme（空白換成單一空格），形狀取 `api.t("image.shape.rectangle")` 等（目前語系、宿主覆寫都生效）。
- 預設樣式：文字 `Geist-Regular`、48 px、黑（0, 0, 0）、`Left`、tracking 0、leading 0；形狀黑、`cornerRadius` 0、線寬 4。
- 不做：更多字型、直排、路徑文字、箭頭與其他形狀（見「之後再做」）。

## 契約

只加不改 00-overview §3。沒有新的公開 export 或型別（全部在 `./image-editor` 內部）。

- i18n（§9.2）：區域 `image.text.*`、`image.shape.*`，檔 `src/image-editor/text/messages.ts`，表名 `textShapeMessages`、型別 `TextShapeKey`、`TextShapeMessages`；同一個 commit 在 `src/i18n/messages.ts` 的 `Messages` 加 `& TextShapeMessages`。key 全部在第 1 步一次加（表見第 1 步）。
- 對 10 註冊（全部在 `src/image-editor/text/register.ts` 的 `registerTextShapes(): void`，第一行 `registerMessages(textShapeMessages)`；`src/image-editor/extensions.ts` 只加一行 import 與一行呼叫）：
  - `registerTool(textTool)`（`id: "text"`、`key: "T"`）、`registerTool(shapeTool)`（`id: "shape"`、`key: "U"`）；
  - `registerLayerDecor({ id: "shape-resize", onTransformEnd })`、`registerLayerDecor({ id: "text-shape-thumb", thumbnail })`。
- 用到的外部符號（出處以 00-overview §9 為準）：
  - `src/comp/index.ts`（09）：`type LayerTextStyle`、`type LayerShapeStyle`、`type Manifest`、`type Project`、`type PngImage`、`validateLikeCompositor(m: Manifest): string[]`、`readProject(bytes: Uint8Array): Project`、`writeProject(p: Project): Blob`。
  - `src/image-editor/api.ts`（10 第 1 步）：`EditorApi`、`Layer`、`LayerId`、`Doc`、`Command`、`PixelTile`、`Session`、`Rect`、`Point`、`Mat2D`、`ViewTransform`、`MessageKey`、`ToolSpec`、`LayerDecor`。`EditorApi` 用到 `doc()`、`session()`、`setSession(patch)`、`dispatch(command, label?)`（沒 label = 預覽不記）、`commit(label, doc, tiles, resizes?)`、`snapshotTiles(id, target, rect)`、`writeRegion(id, target, rect, pixels)`（圖層像素座標，image = RGBA8 直通 alpha）、`readRegion(id, target, rect)`、`readComposite(rect)`、`layerMatrix(id)`（文件 → 圖層像素）、`pixelSize(id, target): { width; height } | null`（texture 尺寸，沒有 texture 回 null）、`resizePixels(id, target, size, { pixels }): LayerResize`（整張換成新尺寸，不改文件、不記 undo，回傳值交給 `commit` 的第 4 個參數）、`t(key, vars?)`（翻任何區域的 key）、`runInWorker(job)`、`requestRender()`、`gl`。`ToolSpec.onDeactivate?(api)`：換到別的工具之前呼叫一次。
  - `src/image-editor/registry.ts`（10 第 1 步）：`registerTool(spec: ToolSpec): void`、`registerLayerDecor(decor: LayerDecor): void`、`registerMessages(table: MessageTable<string>): void`（10 的外框用合併表翻 `ToolSpec.label` 與 undo 標籤）、`resetRegistry(): void`（只給測試）。
  - `src/image-editor/doc/commands/layers.ts`（10 第 2 步）：`insertLayer(record: Layer, above: LayerId | null): Command`（插在 `above` 正上方、沿用它的 `parentID`；null 或找不到時放根層最上面；`activeLayerID` 設成新層；`pixels.image` 設 `{ kind: "gpu" }`）、`removeLayers(ids: readonly LayerId[]): Command`（連 `pixels` 與別層指向它的 `maskSourceID` 一起拿掉）、`patchLayer(id: LayerId, patch: Partial<Layer>): Command`（淺合併，值為 `undefined` 的 key 刪掉）。
  - `src/image-editor/extensions.ts`（10 第 1 步）：`installExtensions(): void`。
  - `src/image-editor/worker/jobs.ts`（10 第 1 步）：`encodePng` job，`input: PngImage`，回 `Uint8Array`（只在第 9 步的測試用）。
  - 測試輔助：`src/image-editor/test/make-doc.ts` 的 `makeDoc(spec: { width: number; height: number; layers: Partial<Layer>[] }): Doc`（10 第 2 步）；`src/image-editor/test/mount-canvas.tsx` 的 `mountCanvas(doc: Doc, colors?: Record<LayerId, [number, number, number, number]>): Promise<{ api: EditorApi; store; canvas: HTMLCanvasElement; unmount(): void }>`（10 第 3 步）；`src/image-editor/test/mount-editor.tsx` 的 `mountEditor(doc, colors?): Promise<{ api; store; unmount(): void }>`（10 第 4 步）。測試在 `beforeEach` 先 `resetRegistry()` 再 `registerTextShapes()`，然後才 mount（兩個 mount 都不呼叫 `installExtensions`）。
  - 基本元件（02，`src/primitives/`）：`Icon`、`IconSize`（`icon.tsx`）、`Button`（`button.tsx`）、`Select`（`select.tsx`）、`NumberField`（`number-field.tsx`）、`ToggleGroup`（`toggle-group.tsx`）、`Switch`（`switch.tsx`）、`ConfirmDialog`（`dialog.tsx`）、`ViewerRoot`（`root.tsx`）；`useT`（`src/i18n/use-t.ts`）；`useRoot`（`src/primitives/root-context.ts`）。
- 假設 11 在像素工具改到有 `shape` 的圖層前會先問、確定後丟掉 `shape`；本份不處理。

## 形式

- 工具列加文字（`T`）與形狀（`U`）。
- 文字屬性欄：字重選單（九個名稱）、大小、顏色、對齊三顆、字距、行距（「自動」開關或數值）；編輯中選了部分文字時，顏色與字重只套在選取那段；舊瀏覽器顯示「不支援字距」。
- 形狀屬性欄：種類三顆、顏色、圓角（矩形）、線寬（線）。
- 圖層面板：文字圖層的縮圖換成「T」圖示加內容前幾個字，形狀圖層換成形狀圖示（同 Compositor）。

## Phase 01 — 文字圖層

blocker：10 第 1–3 步、09 P03-1–P03-4；model：opus。

1. **字串表、排版與 run（純函式）。**
   - 新 `src/image-editor/text/messages.ts`：照 02 的區域表寫法（`const en = {…} satisfies Record<string, string>`；`export type TextShapeKey = keyof typeof en`；`export type TextShapeMessages = Record<TextShapeKey, string>`；`export const textShapeMessages: MessageTable<TextShapeKey> = { en, "zh-TW": {…} }`，`MessageTable` 來自 `src/i18n/messages.ts`）。key（en / zh-TW）：
     - `image.text.tool` Text / 文字；`image.text.weight` Weight / 字重；`image.text.weight.thin` Thin / 極細；`.extraLight` Extra Light / 特細；`.light` Light / 細；`.regular` Regular / 標準；`.medium` Medium / 中等；`.semiBold` Semibold / 半粗；`.bold` Bold / 粗；`.extraBold` Extra Bold / 特粗；`.black` Black / 極粗；
     - `image.text.size` Size / 大小；`image.text.color` Color / 顏色；`image.text.align` Alignment / 對齊；`image.text.alignLeft` Left / 靠左；`image.text.alignCenter` Center / 置中；`image.text.alignRight` Right / 靠右；`image.text.tracking` Tracking / 字距；`image.text.leading` Leading / 行距；`image.text.leadingAuto` Auto / 自動；`image.text.noTracking` This browser can't apply tracking. / 這個瀏覽器不支援字距。；
     - `image.text.missingFont.title` Font not available / 沒有這個字型；`image.text.missingFont.body` "{font}" isn't available here. Editing will switch it to Geist. / 這裡沒有「{font}」，編輯後會換成 Geist。；`image.text.missingFont.confirm` Switch to Geist / 換成 Geist；`image.text.missingFont.cancel` Cancel / 取消；
     - undo 標籤：`image.text.create` Add text / 新增文字；`image.text.edit` Edit text / 編輯文字；`image.text.resizeBox` Resize text box / 調整文字框；
     - `image.shape.tool` Shape / 形狀；`image.shape.kind` Shape type / 形狀種類；`image.shape.rectangle` Rectangle / 矩形；`image.shape.ellipse` Ellipse / 橢圓；`image.shape.line` Line / 線；`image.shape.color` Color / 顏色；`image.shape.cornerRadius` Corner radius / 圓角；`image.shape.lineWidth` Line width / 線寬；`image.shape.create` Add shape / 新增形狀；`image.shape.change` Change shape / 修改形狀；`image.shape.resize` Redraw shape / 重畫形狀。
   - 改 `src/i18n/messages.ts`：`import type { TextShapeMessages } from "../image-editor/text/messages";`，`Messages` 那一行加 `& TextShapeMessages`。
   - 新 `src/image-editor/text/style.ts`：`export type ColorRun = NonNullable<LayerTextStyle["colorRuns"]>[number]`；`export type FontRun = NonNullable<LayerTextStyle["fontRuns"]>[number]`；`export const TEXT_PADDING = 12`、`MIN_TEXT_SIDE = 16`、`MAX_CONTENT = 100_000`、`MIN_BOX = 16`、`MAX_BOX = 30_000`；`export function defaultTextStyle(content = ""): LayerTextStyle`（`Geist-Regular`、48、黑、`Left`、tracking 0、leading 0，沒有 `boxSize` 與 run）；`export function lineHeight(s: LayerTextStyle): number`（`leading || 1.2 * fontSize`）。`LayerTextStyle` 從 `src/comp/index.ts` import type。
   - 新 `src/image-editor/text/layout.ts`：
     - `export type Measure = (text: string, fontName: string, fontSize: number, tracking: number) => number`（語意同 canvas 設了 `letterSpacing` 的 `measureText(text).width`：每個字後面多 tracking，含最後一個字）。
     - `export type Piece = { start: number; end: number; x: number; width: number; fontName: string; rgb: [number, number, number] }`；`export type Line = { start: number; end: number; top: number; x: number; width: number; pieces: Piece[] }`（`start` / `end` 是 `content` 的 UTF-16 位置，不含換行字元與行尾空白）。
     - `export function layoutText(s: LayerTextStyle, measure: Measure): { width: number; height: number; lines: Line[] }`，規則照「判斷」的排版段：分段、斷行、行高、對齊、留白、畫布大小（段落框 = `boxSize`；點文字照公式、無條件進位、至少 16）。
   - 新 `src/image-editor/text/runs.ts`（規則照 Compositor `TypeTool.swift`：排序、不重疊、長度 > 0、不超出內容；相鄰且值相同的合併）：
     - `export function normalizeRuns<R extends { location: number; length: number }>(runs: readonly R[], contentLength: number, same: (a: R, b: R) => boolean): R[]`；
     - `export function applyColor(s: LayerTextStyle, start: number, end: number, rgb: [number, number, number]): LayerTextStyle`；`export function applyFont(s: LayerTextStyle, start: number, end: number, fontName: string): LayerTextStyle`（覆蓋範圍內舊的 run，切開跨邊界的 run；`start === end` 時改整段的 `red`/`green`/`blue` 或 `fontName` 並清掉該種 run）；
     - `export function editContent(s: LayerTextStyle, start: number, end: number, insert: string): LayerTextStyle`（把 `[start, end)` 換成 `insert`：之後的 run 位移、跨刪除範圍的 run 縮短、長度變 0 的 run 拿掉；插入的字併入「`location < start ≤ location + length`」的那個 run；結果截到 `MAX_CONTENT`）；
     - `export function styleAt(s: LayerTextStyle, index: number): { fontName: string; rgb: [number, number, number] }`。
   - 測試 `src/image-editor/text/layout.test.ts`（jsdom，假的量字函式：每個 UTF-16 單位寬 `fontSize × 0.5`，再加 tracking）：段落框寬 200 時一句英文在詞界斷行；單字比斷行寬度長時逐字斷；中文逐字斷；`\n` 換行；點文字遇到很長的一行不斷；tracking 10 時量寬每字多 10、斷行點跟著提前；leading 0 時行高 = 1.2 × fontSize、leading 30 時 = 30；三種對齊的 x；點文字畫布寬 = 最寬行 + 24 + 0.1 × fontSize、空字串時高 = 1 行 + 24、極短的字兩邊至少 16；一行內有 font run 時切成兩個 piece、各自的 x 相接；行尾空白不算進行寬。
   - 測試 `src/image-editor/text/runs.test.ts`（jsdom）：`normalizeRuns` 排序、去掉長度 0、截掉超出內容、合併相鄰同色；在 run 前、中、後插入字的位移；刪除跨兩個 run 的範圍；刪光的 run 消失；`applyColor` 切開跨邊界的舊 run；`applyFont` 在 `start === end` 時改整段；內容含 emoji（surrogate pair）時位置以 UTF-16 計且不切在 pair 中間（`editContent` 的 `insert` 原樣放入）；`textShapeMessages` 的 en 與 zh-TW key 集合相同。
   - verify：`pnpm test src/image-editor/text && pnpm check`
   - commit：`feat(image-text-shapes): lay out text, track style runs and add strings`

2. **Geist 字型與文字畫成像素。**
   - `package.json` 的 `dependencies` 沒有 `@fontsource-variable/geist` 時執行 `pnpm add --save-exact @fontsource-variable/geist@5.3.0`（07 第 8 步已加就不動）；`THIRD_PARTY_NOTICES.md` 的 runtime 依賴沒有 Geist 時加一條「@fontsource-variable/geist — OFL-1.1 — github.com/vercel/geist-font」。授權檢查 script 不改（01 P02-3 已允許 `@fontsource-variable/*` 的 OFL-1.1）。
   - 新 `src/image-editor/text/fonts.ts`：檔頭 `import "@fontsource-variable/geist";`；`export const GEIST_FAMILY = '"Geist Variable"'`；`export const GEIST_WEIGHTS: readonly { name: string; weight: number; key: TextShapeKey }[]`（九個 PostScript 名稱對 100–900，`key` 是第 1 步 `src/image-editor/text/messages.ts` 的 `image.text.weight.*`）；`export function weightOf(fontName: string): number | null`；`export function missingFonts(s: LayerTextStyle): string[]`（`fontName` 與每個 `fontRuns[].fontName` 中不在 `GEIST_WEIGHTS` 的，去重、保持出現順序）；`export function replaceMissingFonts(s: LayerTextStyle): LayerTextStyle`（缺的名稱換成 `Geist-Regular`，再用 `src/image-editor/text/runs.ts` 的 `normalizeRuns` 合併）；`export function cssFont(fontName: string, fontSize: number): string`（`` `${weightOf(fontName) ?? 400} ${fontSize}px ${GEIST_FAMILY}` ``）；`export function supportsTracking(): boolean`（`"letterSpacing" in OffscreenCanvasRenderingContext2D.prototype`）；`export function ensureGeist(): Promise<void>`（`document.fonts.load` 400 與 700 各一次）；`export function canvasMeasure(ctx: OffscreenCanvasRenderingContext2D): Measure`（`Measure` 來自 `src/image-editor/text/layout.ts`；設 `ctx.font = cssFont(...)`、支援時設 `ctx.letterSpacing = \`${tracking}px\``，回 `measureText(text).width`）。
   - 新 `src/image-editor/text/render.ts`：`export function renderText(s: LayerTextStyle): { width: number; height: number; data: Uint8Array }`：建 1×1 `OffscreenCanvas` 量字 → `layoutText(s, canvasMeasure(ctx))`（`src/image-editor/text/layout.ts`）→ 依 `width` / `height` 建畫布 → 每個 `Piece` 設 `ctx.font`、`letterSpacing`、`fillStyle = rgb(...)`、`textBaseline = "top"`，`fillText(content.slice(start, end), x, y)`（y = 行頂 + (行高 − fontSize) / 2）→ `getImageData` 的 `data` 轉 `Uint8Array`（直通 alpha）。呼叫前要先 `await ensureGeist()`，這由呼叫端（第 3 步）負責。
   - 測試 `src/image-editor/text/fonts.test.ts`（jsdom）：九個名稱的 weight；`Helvetica-Bold` 在 `missingFonts` 裡、`Geist-Bold` 不在；fontRuns 裡的缺字型也被列出且不重複；`replaceMissingFonts` 後 `missingFonts` 為空；`cssFont("Geist-Bold", 24)` 是 `700 24px "Geist Variable"`。
   - 測試 `src/image-editor/text/render.browser.test.ts`（browser）：`await ensureGeist()` 後 `document.fonts.check('400 32px "Geist Variable"')` 為 true；點文字 "Hello" 的畫布大小符合留白公式（用同一個 `canvasMeasure` 算期望值）；`boxSize: [300, 120]` 時畫布正好 300 × 120；整段黑字中 `colorRuns` 把第 2–3 字設紅，該段範圍內有 r > 200、g < 50 的像素、其他範圍沒有；一段阿拉伯文在 tracking 0 時，墨跡左右邊界的寬度與 `measureText` 寬度差 ≤ 2 px（證明整段一次 `fillText`）；字以外的像素 alpha 為 0。
   - verify：`pnpm test src/image-editor/text/fonts.test.ts && pnpm test:browser src/image-editor/text/render.browser.test.ts && pnpm check`
   - commit：`feat(image-text-shapes): render text layers to pixels with Geist`

3. **寫圖層像素與文字圖層的建立、重畫、undo。**
   - 新 `src/image-editor/text/raster.ts`（型別從 `src/image-editor/api.ts` import；`insertLayer`、`patchLayer` 從 `src/image-editor/doc/commands/layers.ts`，10 第 2 步）：
     - `export type Raster = { width: number; height: number; data: Uint8Array }`（RGBA8 直通 alpha）。
     - `export function rasterSize(api: EditorApi, id: LayerId): { width: number; height: number }`：`api.pixelSize(id, "image")`，null 時用該層 `transform.size` 四捨五入（至少 1）。
     - `export function writeLayerRaster(api: EditorApi, opts: { id: LayerId; next: Layer; raster: Raster; label: MessageKey }): void`：`next` 是更新後的圖層紀錄（`transform.size` 已是新大小、`id` 與原層相同）。`patch = next`，原層有 `maskFile` 沒有 `maskPlacement` 而且 `next.transform.size` 與原本不同時 `patch = { ...next, maskPlacement: 原層的 transform }`。目前尺寸 = `rasterSize(api, id)`；與 raster 相同 → `tiles = api.snapshotTiles(id, "image", { x: 0, y: 0, ...size })`、`api.writeRegion(id, "image", 同 rect, raster.data)`、`api.commit(label, patchLayer(id, patch)(api.doc()), tiles)`；不同 → `resize = api.resizePixels(id, "image", { width: raster.width, height: raster.height }, { pixels: raster.data })`、`api.commit(label, patchLayer(id, patch)(api.doc()), [], [resize])`。
     - `export function addRasterLayer(api: EditorApi, opts: { record: Layer; raster: Raster; label: MessageKey }): LayerId`：`api.dispatch(insertLayer(record, api.session().active))`（不帶 label）→ `api.writeRegion(record.id, "image", { x: 0, y: 0, width, height }, raster.data)` → `api.commit(label, api.doc(), [])` → `api.setSession({ active: record.id })`，回 `record.id`。
   - 新 `src/image-editor/text/layer.ts`：
     - `export async function createTextLayer(api: EditorApi, opts: { style: LayerTextStyle; origin: [number, number] }): Promise<LayerId>`：`await ensureGeist()`（`src/image-editor/text/fonts.ts`）→ `renderText(style)`（`src/image-editor/text/render.ts`）→ 紀錄 `{ id: 新 UUID, name: 前 30 個 grapheme, isVisible: true, transform: { origin, size: [w, h], rotation: 0, flipX: false, flipY: false, sampling: "Smooth" }, text: style }` → `addRasterLayer(..., label: "image.text.create")`。
     - `export async function updateTextLayer(api: EditorApi, id: LayerId, style: LayerTextStyle, label: MessageKey): Promise<void>`：`missingFonts(style)` 非空時丟 `Error("missing fonts")`（呼叫端先確認並 `replaceMissingFonts`）；使用者縮放過時依「判斷」改 `boxSize`；`renderText` → `next = { ...layer, text: style, name: 新名稱, transform: { ...layer.transform, size: [w, h] } }` → `writeLayerRaster`（`src/image-editor/text/raster.ts`）。「使用者縮放過」= `layer.transform.size` 與 `rasterSize(api, id)` 任一邊差 ≥ 0.5。
     - `export async function resizeTextBox(api: EditorApi, id: LayerId, box: [number, number], origin: [number, number]): Promise<void>`：`box` 每邊夾到 16–30,000，`style = { ...layer.text, boxSize: box }`，`transform.origin = origin`，label `image.text.resizeBox`。
     - `export function deleteTextLayer(api: EditorApi, id: LayerId): void`：`api.dispatch(removeLayers([id]), "image.text.edit")`（`removeLayers` 來自 `src/image-editor/doc/commands/layers.ts`，10 第 2 步）。
   - 測試 `src/image-editor/text/layer.browser.test.ts`（browser，用 `src/image-editor/test/mount-canvas.tsx` 的 `mountCanvas`，背景一層 400 × 300）：`createTextLayer` 後新層的 `text` 與輸入相同，整份 manifest 的 `validateLikeCompositor`（`src/comp/index.ts`）回空陣列；`readRegion` 讀回與 `renderText` 相同；一步 undo 後圖層消失、redo 回來；`rasterSize` 在沒有 texture 時回 `transform.size` 四捨五入；改字讓寬度變大 → id 不變、`api.pixelSize(id, "image")` 與 `transform.size` 都是新大小、`readRegion` 與 `renderText` 相同、一步 undo 後尺寸與像素回到改之前、redo 再回來；改顏色不改大小 → 走就地寫（`resizePixels` 的 spy 沒被呼叫）；有遮色片（沒有 `maskPlacement`）的文字層改大 → id 不變、`maskPlacement` 等於改之前的 transform、`readRegion(id, "mask", …)` 不變；`resizeTextBox` 改框寬 → 行數改變、字級不變；文字層當另一層的 `maskSourceID` 時改大後那一層的 `maskSourceID` 不變、剪裁照常（`readComposite` 在文字範圍外沒有上層顏色）；`fontName: "Helvetica-Bold"` 的層呼叫 `updateTextLayer` 丟錯、文件與像素不變。
   - verify：`pnpm test:browser src/image-editor/text/layer.browser.test.ts && pnpm check`
   - commit：`feat(image-text-shapes): create and re-render text layers with undo`

4. **文字工具、編輯疊層、缺字型確認、註冊。**
   - 新 `src/image-editor/text/glyphs.tsx`：`TextIcon`、`ShapeIcon`、`RectangleIcon`、`EllipseIcon`、`LineIcon`，每個是 `(props: { size?: IconSize; label?: string }) => JSX.Element`，用 `src/primitives/icon.tsx` 的 `Icon` 包一個 24 × 24 的 SVG。
   - 新 `src/image-editor/text/edit-state.ts`：模組層級的 store `textEditing`，有 `get(): TextEditing | null`、`set(next: TextEditing | null): void`、`subscribe(fn: () => void): () => void`；`export type TextEditing = { layerId: LayerId | null; style: LayerTextStyle; origin: [number, number]; selection: [number, number]; view: ViewTransform | null; missing: string[] | null }`（`layerId` 為 null = 新文字還沒建層；`missing` 非 null = 正在問缺字型）。
   - 新 `src/image-editor/text/type-tool.ts`：`export const textTool: ToolSpec = { id: "text", key: "T", label: "image.text.tool", icon: TextIcon, cursor: "text", onPointerDown, onPointerMove, onPointerUp, onKeyDown, drawOverlay, onDeactivate: endEdit, panel: TextPanel }`：
     - pointer down：編輯中且點在段落框把手 6 螢幕 px 內 → 開始拖把手；編輯中點在框外 → `endEdit(api)`；沒在編輯時點到既有文字層 → `beginEdit(api, id)`；否則記下起點。
     - pointer up：拖把手 → `resizeTextBox`（第 3 步 `src/image-editor/text/layer.ts`）；從起點拖超過 4 文件 px → `textEditing.set({ layerId: null, style: { ...defaultTextStyle(), boxSize: 拖出的框 }, origin: 框左上, selection: [0, 0], view: 目前的 view, missing: null })`（`defaultTextStyle` 來自 `src/image-editor/text/style.ts`）；沒拖 → `textEditing.set({ layerId: null, style: defaultTextStyle(), origin: [點.x − 12, 點.y − 12], selection: [0, 0], view: 目前的 view, missing: null })`。
     - `onKeyDown`：編輯中 Esc → `endEdit(api)` 並回 true；其他鍵回 false。
     - `drawOverlay(ctx, view, api)`：把 `view` 存進 `textEditing`（只在變了時 `set`）；編輯中畫圖層外框，段落框再畫八個把手。
     - `export function beginEdit(api, id)`：`missingFonts(layer.text)` 非空 → `textEditing.set({ …, missing })`，不藏層；否則 `api.setSession({ renderHidden: new Set([...舊的, id]) })` 並開始編輯。
     - `export async function endEdit(api)`：內容是空字串：新文字 → 什麼都不做，既有層 → `deleteTextLayer`；有改動：新文字 → `createTextLayer`、既有層 → `updateTextLayer(..., "image.text.edit")`；沒改動 → 不 commit。最後從 `renderHidden` 拿掉這層、`textEditing.set(null)`。
     - 切換到別的工具時結束編輯：10 在 `setSession` 換掉 `tool` 之前呼叫 `textTool.onDeactivate`（= `endEdit`）。沒在編輯時 `endEdit` 什麼都不做。
   - 新 `src/image-editor/text/dom-text.ts`：`readEditable(el: HTMLElement): { text: string; selection: [number, number] }`（走訪文字節點，`<br>` 當 `\n`，selection 換成 UTF-16 位置）；`writeEditable(el: HTMLElement, style: LayerTextStyle, selection: [number, number]): void`（清空子節點，依 color / font run 用 `document.createElement("span")` + `textContent` 建 span，設好 selection）。
   - 新 `src/image-editor/text/editor.tsx`：`TextEditOverlay({ api }: { api: EditorApi })`：讀 `textEditing`（`useSyncExternalStore`），`createPortal` 到 `api.gl.canvas` 的 `parentElement`（不是 `HTMLCanvasElement` 時不畫）；`div.fv-text-edit` `contentEditable`，`left` / `top` = canvas 的 `offsetLeft` / `offsetTop`，`transform: matrix(...)` = `view.docToScreen` × 圖層到文件（既有層用 `api.layerMatrix(id)` 的反矩陣，新文字用平移 `origin`）；`font`、`letterSpacing`、`lineHeight`、`textAlign`、`padding: 12px`、段落框時 `width` = 框寬；ref callback 掛載時 `writeEditable` 並 focus（不用 `useEffect`）。事件：`onBeforeInput` 擋 `format*` 與 `insertFromDrop`；`onKeyDown` Enter → `editContent(..., "\n")`（`src/image-editor/text/runs.ts`）並 `preventDefault`；`onPaste` → `preventDefault`，插入 `clipboardData.getData("text/plain")`；`onInput` → `readEditable` 與舊內容比對共同前後綴算出改動範圍，`editContent` 更新 `textEditing.style`；`selectionchange` 更新 `textEditing.selection`。不用 `innerHTML` / `dangerouslySetInnerHTML`。
   - 新 `src/image-editor/text/panel.tsx`：`export function TextPanel({ api }: { api: EditorApi })`：本步只畫 `TextEditOverlay` 與缺字型 `ConfirmDialog`（`src/primitives/dialog.tsx`；`open = textEditing.get()?.missing != null`；`title` = `image.text.missingFont.title`；`description` = `image.text.missingFont.body`，`{font}` = 缺的名稱以 `", "` 連接；`confirmLabel` = `image.text.missingFont.confirm`；`cancelLabel` = `image.text.missingFont.cancel`；確定 → `style = replaceMissingFonts(style)`、`missing = null`、藏層開始編輯；取消 → `textEditing.set(null)`）。字串用 `useT(textShapeMessages)`（`src/i18n/use-t.ts`、`src/image-editor/text/messages.ts`）。屬性控制項在第 5 步加。
   - 新 `src/image-editor/text/register.ts`：`export function registerTextShapes(): void { registerMessages(textShapeMessages); registerTool(textTool); }`（`registerMessages` 也來自 `src/image-editor/registry.ts`，`textShapeMessages` 來自 `src/image-editor/text/messages.ts`；`registerTool` 來自 `src/image-editor/registry.ts`）。
   - 改 `src/image-editor/extensions.ts`：加 `import { registerTextShapes } from "./text/register";` 與在 `installExtensions` 內加一行 `registerTextShapes();`，其他行不動。
   - 改 `src/styles.css`：檔尾加 `/* image-text-shapes */` 段：`.fv-text-edit { position: absolute; transform-origin: 0 0; white-space: pre-wrap; outline: none; caret-color: currentColor; }`。
   - 測試 `src/image-editor/text/type-tool.browser.test.tsx`（browser；每個測試前 `resetRegistry()` 再 `registerTextShapes()`；用 `mountCanvas` 掛一層 400 × 300 背景，另外在 `ViewerRoot`（`src/primitives/root.tsx`，`locale: "en"`）裡 render `<TextPanel api={api} />`）：直接呼叫 `textTool.onPointerDown/Up` 點一下 → 出現 `.fv-text-edit`；輸入 "Hi" 後 `textTool.onKeyDown(Esc)` → 多一個帶 `text.content === "Hi"` 的圖層、undo 一步就消失；拖曳 120 × 60 → 新層 `text.boxSize` 為 `[120, 60]`；在 `.fv-text-edit` 觸發帶 `text/html`（`<b>x</b>`）與 `text/plain`（`x`）的 paste → 內容只多 `x`、DOM 裡沒有 `b` 元素；點到既有文字層進入編輯時 `api.session().renderHidden` 含該層、結束後不含；編輯中沒改字就 Esc → undo 步數不變；`fontName: "Helvetica-Bold"` 的層點下去先出現對話框、按取消後沒進入編輯且文件不變、按確定後進入編輯，結束時 `fontName` 是 `Geist-Regular`；把字全刪後 Esc → 圖層被刪、undo 回來；編輯中輸入 "Yo" 後 `api.setSession({ tool: "move" })` → `onDeactivate` 結束編輯、多一個 `text.content === "Yo"` 的圖層、`.fv-text-edit` 消失。
   - verify：`pnpm test:browser src/image-editor/text/type-tool.browser.test.tsx && pnpm test src/image-editor/text && pnpm check`
   - commit：`feat(image-text-shapes): add the text tool and editing overlay`

5. **文字屬性欄。**
   - 改 `src/image-editor/text/panel.tsx` 的 `TextPanel({ api })`：在第 4 步的 `TextEditOverlay` 與 `ConfirmDialog` 之外加控制項（全部用 `useT(textShapeMessages)`）：
     - 目標樣式：編輯中 → `textEditing.get().style`（`src/image-editor/text/edit-state.ts`）；沒在編輯而 `api.session().active` 是帶 `text` 的層 → 該層的 `text`；兩者都不是 → 模組層級的 `nextTextStyle`（新文字的預設，`defaultTextStyle()` 起始，本檔匯出 `getNextTextStyle(): LayerTextStyle`，第 4 步的 `type-tool.ts` 建新文字時改用它 —— 這一步順便把 `src/image-editor/text/type-tool.ts` 兩處 `defaultTextStyle()` 改成 `getNextTextStyle()`）。
     - 字重：`Select`（`src/primitives/select.tsx`），一組，九個 `GEIST_WEIGHTS`（`src/image-editor/text/fonts.ts`）；大小：`NumberField`（`src/primitives/number-field.tsx`，1–2000）；顏色：`<input type="color" aria-label={t("image.text.color")}>`；對齊：`ToggleGroup`（`src/primitives/toggle-group.tsx`，`Left` / `Center` / `Right`）；字距：`NumberField`（−100–1000），`supportsTracking()` 為 false 時下面顯示 `image.text.noTracking`；行距：`Switch`（`src/primitives/switch.tsx`，標籤 `image.text.leadingAuto`，開 = `leading: 0`、關 = `round(1.2 × fontSize)`）加上關閉時才出現的 `NumberField`（0–5000）。
     - 套用：編輯中且選取非空 → 顏色用 `applyColor`、字重用 `applyFont`（`src/image-editor/text/runs.ts`）只套選取範圍；編輯中選取為空 → 用同兩個函式 `start === end` 改整段；其他欄位改整份樣式。編輯中只改 `textEditing`，結束編輯時一起 commit；沒在編輯而選中文字層 → `NumberField` 的 `onCommit`、`Select` / `ToggleGroup` / `Switch` 的 `onChange`、顏色的 `change` 事件時呼叫 `updateTextLayer(api, id, style, "image.text.edit")`（`src/image-editor/text/layer.ts`），拖曳 `NumberField` 的過程不重畫；該層有缺字型時不重畫，改呼叫 `beginEdit(api, id)`（`src/image-editor/text/type-tool.ts`）讓缺字型的 `ConfirmDialog` 出現。
   - 測試 `src/image-editor/text/panel.browser.test.tsx`（browser；每個測試前 `resetRegistry()`（`src/image-editor/registry.ts`）再 `registerTextShapes()`（`src/image-editor/text/register.ts`）；`mountCanvas` 掛一層 400 × 300 背景，在 `ViewerRoot`（`src/primitives/root.tsx`，`locale: "en"`）裡 render `<TextPanel api={api} />`）：編輯 "Hello world" 時選取 "world" 改紅 → 結束後 `colorRuns` 只有 `{ location: 6, length: 5 }` 且是紅；選取 "Hello" 改 Bold → `fontRuns` 是 `Geist-Bold` 的 `{ location: 0, length: 5 }`；沒選取時改字重 → `fontName` 改、`fontRuns` 清掉；沒在編輯時選中文字層把大小改 96 → 只多一步 undo 且 `transform.size` 變大；行距開關關掉後 `leading` 是 `round(1.2 × fontSize)`；`supportsTracking` stub 成 false 時顯示 noTracking 字串；沒有選中文字層時改顏色，下一個新文字用該顏色。
   - verify：`pnpm test:browser src/image-editor/text/panel.browser.test.tsx src/image-editor/text/type-tool.browser.test.tsx && pnpm check`
   - commit：`feat(image-text-shapes): add the text properties panel`

Phase 01 結尾的 verify：`pnpm test src/image-editor && pnpm test:browser src/image-editor/text && pnpm check`

## Phase 02 — 形狀圖層

blocker：本份第 3 步（`src/image-editor/text/raster.ts`）、第 4 步（`src/image-editor/text/glyphs.tsx`、`src/image-editor/text/register.ts`）；model：sonnet。

6. **形狀的幾何與像素、建立與重畫。**
   - 新 `src/image-editor/shapes/geometry.ts`（純函式，`Point` 來自 `src/image-editor/api.ts`，`LayerShapeStyle` 來自 `src/comp/index.ts`）：`export function dragFrame(kind: LayerShapeStyle["kind"], a: Point, b: Point, mods: { shift: boolean; alt: boolean }, lineWidth: number): { origin: [number, number]; size: [number, number]; start?: [number, number]; end?: [number, number] }`：矩形 / 橢圓 = a、b 的外框，Shift 取兩邊較大者成正方形，Alt 以 a 為中心（邊長加倍）；線 = a 到 b（Shift 把角度吸到 45° 的倍數，Alt 以 a 為中點），外框四邊各多 `lineWidth / 2`，`start` / `end` 是兩端在外框裡的比例；每邊至少 1。
   - 新 `src/image-editor/shapes/render.ts`：`export function renderShape(s: LayerShapeStyle, width: number, height: number): Raster`（`Raster` 來自 `src/image-editor/text/raster.ts`）：`OffscreenCanvas(width, height)` 2D；`Rectangle`：`cornerRadius > 0` 時 `roundRect`（半徑夾到 `min(r, w/2, h/2)`），否則 `fillRect`；`Ellipse`：`ellipse` 填滿；`Line`：`lineWidth ?? 4`、`lineCap = "butt"`，從 `start × [w, h]` 畫到 `end × [w, h]`（沒有時從左上到右下）；`fillStyle` / `strokeStyle` 由 `red` / `green` / `blue`；回 `getImageData` 的直通 alpha 資料。`export function defaultShapeStyle(kind): LayerShapeStyle`（黑、`cornerRadius` 0、線寬 4）。
   - 新 `src/image-editor/shapes/layer.ts`：`export function createShapeLayer(api: EditorApi, opts: { style: LayerShapeStyle; origin: [number, number]; size: [number, number] }): LayerId`（大小四捨五入、至少 1；紀錄 `{ id: 新 UUID, name: 種類字串, isVisible: true, transform: { origin, size, rotation: 0, flipX: false, flipY: false, sampling: "Smooth" }, shape: style }`；`addRasterLayer(..., label: "image.shape.create")`，來自 `src/image-editor/text/raster.ts`）；`export function updateShapeLayer(api, id, style, label: MessageKey): void`（以目前 `transform.size` 四捨五入重畫，`writeLayerRaster`）；`export function redrawAfterTransform(id: LayerId, before: Layer["transform"], api: EditorApi): void`（層沒有 `shape` 或 `transform.size` 與 `before.size` 兩邊差都 < 0.5 → 不做；否則 `updateShapeLayer(api, id, layer.shape, "image.shape.resize")`）。圖層名稱由呼叫端算好傳入：`createShapeLayer` 的 `opts` 另有 `name: string`（第 7 步的工具傳種類字串的翻譯；本步測試直接給字串）。
   - 測試 `src/image-editor/shapes/geometry.test.ts`（jsdom）：矩形外框；Shift 正方形；Alt 從中心；橢圓同矩形規則；線的外框含 `lineWidth / 2`、水平線外框高 = lineWidth；Shift 時 30° 的線吸到 45°；`start` / `end` 比例在 0–1 之內。
   - 測試 `src/image-editor/shapes/render.browser.test.ts`（browser）：200 × 100 矩形整張不透明；`cornerRadius` 20 的角落 (1, 1) 透明；橢圓中心不透明、角落透明；線寬 10 的對角線中點不透明；放大兩倍重畫的矩形邊緣只有 ≤ 1 px 的半透明過渡。
   - 測試 `src/image-editor/shapes/layer.browser.test.ts`（browser，`mountCanvas` 掛 400 × 300 背景）：三種形狀各建一次，`shape` 欄位與輸入相同、整份 manifest 的 `validateLikeCompositor` 回空陣列、各一步 undo；改顏色 → 同一個 id、像素變色；`patchLayer` 把 `transform.size` 放大兩倍後 `redrawAfterTransform` → id 不變、`api.pixelSize(id, "image")` 是新大小、`readRegion` 讀回邊緣清晰、一步 undo 回到舊大小與舊像素；只改 `rotation` 後 `redrawAfterTransform` → undo 步數不變。
   - verify：`pnpm test src/image-editor/shapes && pnpm test:browser src/image-editor/shapes && pnpm check`
   - commit：`feat(image-text-shapes): render, create and redraw shape layers`

7. **形狀工具、屬性欄、註冊。**
   - 新 `src/image-editor/shapes/tool-state.ts`：模組層級 store `shapeToolState`（`get(): LayerShapeStyle`、`set(next)`、`subscribe(fn)`），起始 `defaultShapeStyle("Rectangle")`（`src/image-editor/shapes/render.ts`）。
   - 新 `src/image-editor/shapes/shape-tool.ts`：`export const shapeTool: ToolSpec = { id: "shape", key: "U", label: "image.shape.tool", icon: ShapeIcon, cursor: "crosshair", onPointerDown, onPointerMove, onPointerUp, drawOverlay, panel: ShapePanel }`（`ShapeIcon` 來自 `src/image-editor/text/glyphs.tsx`）：down 記起點；move 記目前點與 Shift / Alt，`api.requestRender()`；up 時 `dragFrame`（`src/image-editor/shapes/geometry.ts`）兩邊都 ≥ 2 文件 px 才 `createShapeLayer`（`src/image-editor/shapes/layer.ts`，樣式 = `shapeToolState.get()` 加上 `start` / `end`；`name` = `api.t(SHAPE_LABEL[kind])`，`SHAPE_LABEL` 是本檔的 `{ Rectangle: "image.shape.rectangle", Ellipse: "image.shape.ellipse", Line: "image.shape.line" }`）；`drawOverlay` 拖曳中用 `view.docToScreen` 畫預覽外框（矩形 / 橢圓 / 線）。
   - 新 `src/image-editor/shapes/panel.tsx`：`export function ShapePanel({ api })`（`useT(textShapeMessages)`）：種類 `ToggleGroup`（三個，`icon` 用 `RectangleIcon` / `EllipseIcon` / `LineIcon`）；顏色 `<input type="color" aria-label={t("image.shape.color")}>`；`Rectangle` 時 `NumberField` 圓角（0–10,000）；`Line` 時 `NumberField` 線寬（1–1000）。目標：`api.session().active` 是帶 `shape` 的層 → 改那層（`updateShapeLayer(api, id, style, "image.shape.change")`，`NumberField` 只在 `onCommit` 呼叫），同時更新 `shapeToolState`；否則只改 `shapeToolState`。
   - 改 `src/image-editor/text/register.ts` 的 `registerTextShapes`：加 `registerTool(shapeTool);` 與 `registerLayerDecor({ id: "shape-resize", onTransformEnd: redrawAfterTransform });`（`registerLayerDecor` 來自 `src/image-editor/registry.ts`，`redrawAfterTransform` 來自 `src/image-editor/shapes/layer.ts`）。
   - 測試 `src/image-editor/shapes/shape-tool.browser.test.tsx`（browser；`resetRegistry()` 後 `registerTextShapes()`；`mountCanvas` 加上 `ViewerRoot` 裡的 `<ShapePanel api={api} />`）：直接呼叫 `shapeTool.onPointerDown/Move/Up` 拖出矩形、橢圓、線各一個，`shape.kind` 正確；Shift 拖出的矩形寬高相等；拖不到 2 px 不建層；選中形狀層後在屬性欄改種類、顏色、圓角、線寬 → `shape` 欄位與像素都更新、各多一步 undo；`layerDecors()` 有 `shape-resize`，呼叫它的 `onTransformEnd` 在大小改變後重畫；`tools()` 同時有 `text` 與 `shape`。
   - verify：`pnpm test:browser src/image-editor/shapes && pnpm test src/image-editor/shapes && pnpm check`
   - commit：`feat(image-text-shapes): add the shape tool and panel`

Phase 02 結尾的 verify：`pnpm test src/image-editor && pnpm test:browser src/image-editor/text src/image-editor/shapes && pnpm check`

## Phase 03 — 圖層縮圖與整合

blocker：Phase 01、Phase 02、10 第 4 步（圖層面板 `src/image-editor/ui/layers/layer-row.tsx` 讀 `layerDecors()` 的 `thumbnail`；`src/image-editor/test/mount-editor.tsx`）；model：sonnet。

8. **圖層縮圖。**
   - 新 `src/image-editor/text/thumbs.tsx`：`export function textShapeThumbnail(layer: Layer, api: EditorApi): ReactNode | null`：有 `text` → `<span className="fv-text-thumb"><TextIcon size="sm" /><span>{前 8 個 grapheme}</span></span>`（`Intl.Segmenter` 的 grapheme，不切在 surrogate pair 或組合字中間）；有 `shape` → 對應的 `RectangleIcon` / `EllipseIcon` / `LineIcon`（`src/image-editor/text/glyphs.tsx`，`size="md"`）；都沒有 → `null`。
   - 改 `src/image-editor/text/register.ts` 的 `registerTextShapes`：加 `registerLayerDecor({ id: "text-shape-thumb", thumbnail: textShapeThumbnail });`。
   - 改 `src/styles.css` 的 `/* image-text-shapes */` 段：加 `.fv-text-thumb { display: inline-flex; align-items: center; gap: 2px; max-width: 32px; overflow: hidden; font-size: 10px; }`。
   - 測試 `src/image-editor/text/thumbs.test.tsx`（jsdom，用 `makeDoc` 建層、`api` 傳 `{} as EditorApi`）：文字層縮圖含內容前 8 個 grapheme；內容是「👨‍👩‍👧家族照片」時第一個 grapheme 是整個家庭 emoji；三種形狀各回自己的圖示；無 `text` / `shape` 的層回 null。
   - 測試 `src/image-editor/text/thumbs.browser.test.tsx`（browser；`resetRegistry()` 後 `registerTextShapes()`；`mountEditor` 掛背景、一個文字層、一個矩形層）：圖層列裡文字層那一列有 `.fv-text-thumb` 且含內容開頭；矩形層那一列有矩形圖示；背景層仍是預設縮圖。
   - verify：`pnpm test src/image-editor/text/thumbs.test.tsx && pnpm test:browser src/image-editor/text/thumbs.browser.test.tsx && pnpm check`
   - commit：`feat(image-text-shapes): show text and shape thumbnails in the layer list`

9. **整合測試。**
   - 新 `src/image-editor/text/story.browser.test.ts`（browser，GL 實測；`resetRegistry()` 後 `registerTextShapes()`；`mountEditor` 掛一層 600 × 400 背景，顏色給白）：
     1. `createShapeLayer`（`src/image-editor/shapes/layer.ts`）建一個圓角矩形在 (100, 100)、300 × 150，紅色；
     2. `createTextLayer`（`src/image-editor/text/layer.ts`）在矩形上面建段落框 `[280, 140]`、內容「Hello 世界\nsecond line」；`applyColor` 把 "Hello" 改藍、`applyFont` 把 "second" 改 `Geist-Bold`（`src/image-editor/text/runs.ts`），`updateTextLayer` 寫回；
     3. `resizeTextBox` 把框寬改成 120，`layoutText` 的行數變多；
     4. 用 `patchLayer`（`src/image-editor/doc/commands/layers.ts`，10 第 2 步）把文字層的 `maskSourceID` 設成矩形層（剪裁在矩形上），`api.dispatch(…, "image.text.edit")`；
     5. `api.readComposite({ x: 0, y: 0, width: 600, height: 400 })`：矩形外（例如 (50, 50)）是白、文字範圍內矩形外的像素沒有藍色、矩形內有藍色像素；
     6. 存檔：每個非背景層用 `api.readRegion(id, "image", { x: 0, y: 0, ...rasterSize(api, id) })` 讀回，經 `api.runInWorker({ kind: "encodePng", input: { width, height, channels: 4, data } })`（10 的 `src/image-editor/worker/jobs.ts`）編成 PNG；背景層也一樣；manifest 每層補 `imageFile: "<ID>.png"`；`writeProject({ manifest, assets })`（`src/comp/index.ts`）→ `Blob` → `readProject(new Uint8Array(await blob.arrayBuffer()))`；
     7. 讀回的 manifest：`validateLikeCompositor` 回空陣列；文字層的 `text.content`、`colorRuns`、`fontRuns`、`boxSize` 與存前相同；矩形層的 `shape` 相同；
     8. 用讀回的 manifest 再 `makeDoc` / `mountEditor` 開一次，對文字層 `updateTextLayer` 改內容成功、`missingFonts` 為空。
   - verify：`pnpm test:browser src/image-editor/text/story.browser.test.ts && pnpm test && pnpm check`
   - commit：`test(image-text-shapes): cover text and shape layers end to end`

Phase 03 結尾的 verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check && pnpm build`

## 之後再做

- 更多字型（自架的開源字型，含一套 CJK 字型；中文字型檔很大，要做子集或按需載入）。
- 直排文字、路徑文字、文字外框以外的樣式。
- 箭頭與其他形狀（Compositor 格式存不下，要做就是普通像素圖層）。
- 讀使用者的本機字型（Local Font Access）與任何外站字型：不做，字型只用同源自架的。
- 宿主的存檔、撞名與入口：H1 Phase 3。
