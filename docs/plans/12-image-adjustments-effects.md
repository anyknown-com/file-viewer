# 12 image-adjustments-effects — 12 種調整圖層與 6 種圖層效果，全部能畫、能改、能存

狀態：planned（2026-10-08，2026-10-08 依 00-overview §9 對齊）；blocker：10 image-editor 第 1–3 步（`src/image-editor/api.ts`、`registry.ts`、`extensions.ts`、合成器與查表 shader、`test/make-doc.ts`、`test/mount-canvas.tsx`）、09 comp-format P03-1–P03-3（manifest 型別）；Phase 03 另等 10 第 4 步（屬性欄畫 `propertyPanels()`、圖層面板：`LayerDecor.badge` 的繪製點、`layer-new` 下拉、`layer-context` 右鍵、`test/mount-editor.tsx`）與 02 P04-2–P04-5（`Slider`、`Switch`、`Select`）；第 12 步另等 09 P03-4、P04-1（`validateLikeCompositor`、`readProject`、`writeProject`）；model：Phase 01、02 opus，Phase 03 sonnet；push：整份做完一次。與 11、13 平行。

來源：`storage/docs/plans/19-image-adjustments-effects.md`（設計照搬；storage 那份標成已搬走由 H1 做）。目錄：`src/image-editor/adjust/`、`src/image-editor/effects/`、`scripts/`。

## 判斷

- 範圍是 Compositor 格式裡每一種調整與效果。少一種，打開 Compositor 的檔就會走樣（storage 13 §2）。不加格式存不下的調整或效果欄位（09：存出來的檔都要是合法的 Compositor 專案）。
- 調整圖層是 manifest 裡帶 `adjustment`、沒有 `imageFile` 的圖層。它作用在下面累積結果的方式（遮色片、不透明度、混合模式、剪裁）由 10 的合成迴圈負責。
- 逐像素的 8 種烘成 LUT。**查表 shader 是 10 的**（`src/image-editor/engine/render.ts`，10 第 3 步）；12 只算 LUT 數值、上傳成 texture，經 `AdjustmentHooks.lut` 交給 10：
  - Levels、Curves、Exposure：1D LUT，256×1 RGBA16F `TEXTURE_2D`，R / G / B 三個通道各自一條（先 RGB 總表，再紅綠藍各自，烘成一條）。Levels 照 `Compositor/Document/Levels.swift`；Curves 是單調 Hermite，照 `Compositor/Document/Curves.swift`；Exposure 照 `Compositor/Document/ImageAdjustments.swift`（線性光裡算 exposure / offset / gamma，前後做 sRGB 轉換）。
  - Hue/Saturation、Gradient Map、Black & White、Color Balance、Invert：3D LUT，33³ RGBA16F `TEXTURE_3D`，LINEAR 三線性。Hue/Saturation 照 `Compositor/Document/HueSaturation.swift`（含 `hsvSettings` 各色域與 falloff 帶，09 保留的交錯陣列在這裡解讀）；其餘照 `Compositor/Rendering/AdjustPixels.c` 的 `adjust_gradient_map`、`adjust_black_white`、`adjust_color_balance` 改寫成 TS；Invert 是 1 − x。
  - LUT 在主執行緒算（3D 是 35,937 點，幾毫秒），以設定的 JSON 為 key 快取 texture。
- 跟位置有關的 4 種寫成 `AdjustmentHooks.pass`：
  - Grain、Add Noise：照 `Compositor/Rendering/GPUNoise.swift` 的 MSL `add_grain`、`add_noise` 改寫成 GLSL。seed 存在 manifest（`noiseSeed`），每次打開圖樣相同；雜訊以文件座標取樣（`PassView.docFromPx`），平移、縮放、分塊匯出時圖樣不變。
  - Gaussian Blur：可分離兩趟，σ = `blurRadius`（文件 px）× `view.scale`。
  - Motion Blur：沿 `motionAngle`、在全長 `motionDistance` × `view.scale` 的線段上等權取樣（Photoshop 語意）。Compositor 用 `CIMotionBlur`（角度取負號，因為 Core Image 的 y 朝上）；我們角度方向照它換算後的結果。
  - `reach(s, scale)`：高斯 `ceil(3 × blurRadius × scale)`、動態模糊 `ceil(motionDistance / 2 × scale)`、其他 0；10 拿去算分塊匯出的邊。
- Levels 的直方圖與「自動」：把這一層暫時隱藏後讀下面的合成結果（長邊縮到 ≤ 512 取樣）；「自動」照 `Compositor/Document/LevelsAutomatic.swift`。
- 效果六種各自可停用：筆畫（尺寸、顏色、不透明度、內 / 外）、陰影、顏色覆蓋、內陰影、外光暈、內光暈。單位是圖層像素；效果沒有混合模式（格式沒這欄）。演算法照 `Compositor/Rendering/MetalLayerEffects.swift` 的 kernel（`effects_alpha`、`effects_spread_rows`、`effects_spread_columns`、`effects_ring`、`effects_shift`、`effects_blur_rows`、`effects_blur_columns`、`effects_inside`、`effects_compose`），compute kernel 改成 WebGL2 fragment pass：
  - 筆畫：alpha 先列後欄的方形 max 濾波（內側用 min）再減原形狀，轉角是方的，沒有置中筆畫。
  - 陰影：alpha 依角度與距離位移（雙線性），σ = 模糊 / 2 的可分離高斯，填色畫在圖層後面。外光暈：σ = 尺寸 / 2 的高斯 ×（1 − alpha）。內陰影：alpha ×（1 − 位移後 alpha 的高斯）。內光暈：alpha ×（1 − alpha 的高斯）。顏色覆蓋：alpha × 顏色，蓋在圖層上。合成順序與 Normal 疊法照 `effects_compose`。
  - 10 給的 `src` 是套過自己遮色片的圖層像素，`dst` 四邊各多 `pad`；12 在 `dst` 的內框畫圖層、在 pad 裡畫外側效果。所有效果參數 × `view.scale` 換成 dst px。
  - `reach(effects, scale)` = `ceil(scale × max(外筆畫尺寸, 陰影距離 + 3 × 模糊 / 2, 3 × 外光暈尺寸 / 2))`，只算啟用的效果。
  - 預覽解析度照 `Compositor/Rendering/EffectsPreviewCache.swift`：只在畫面（`view.forExport` 為 false）而且 `view.scale < 1` 時套上限，內部長邊 = clamp(√(16,700,000 / n), 32, 1536) px，n = 效果快取裡的圖層數（快取最多 64 筆，LRU）；超過上限時在較小的暫存 target 算完再放大畫進 `dst`。`view.scale >= 1` 或 `view.forExport` 為 true 時用原尺寸。快取 key = 圖層 id + `view.version` + 效果 JSON + `view.scale` + dst 寬高，命中時只把快取 texture 畫進 `dst`；`view.forExport` 為 true 時不讀也不寫快取（匯出的分塊不擠掉畫面的快取）。
- 面板放在屬性欄（同 Photoshop 的「內容」面板）：調整面板與效果面板各用 `registerPropertyPanel`（00-overview §9.7）註冊，選到調整圖層時屬性欄畫調整面板，選到一般圖層（不是資料夾、不是調整圖層）時畫效果面板；10 每次 render 傳最新的 `layer`，undo / redo 之後面板跟著更新。圖層列的 badge 按鈕、新增調整圖層、右鍵「效果…」都只是選到那一層（右鍵「效果…」另外把焦點移到效果面板）。
- 新增調整圖層時有選取範圍（`api.selection()` 不是 null）就拿它當遮色片，同 Photoshop：新層帶 `maskFile`，遮色片像素 = `selection.read(整張畫布)`；沒有選取就不加遮色片。
- 顏色挑選用原生 `<input type="color">`（`input` 事件 = 預覽，`change` 事件 = 記一步）。
- 不做：Hue/Saturation 色域邊界的拖曳編輯（數值照讀照存照畫）、Compositor 沒有的調整或效果（見「之後再做」）。
- 抄進來的檔頭寫：`// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, <原路徑>), MIT, Copyright (c) 2026 Wonder Assembly LLC`；`THIRD_PARTY_NOTICES.md` 的 Compositor 條目由 01 / 09 建好，本份不改。Compositor 的 `AdjustmentLayerTests.swift`、`LevelsTests.swift`、`HueSaturationTests.swift`、`ImageAdjustmentTests.swift`、`InnerGlowTests.swift`、`OuterGlowTests.swift` 裡跟數值有關的案例改寫成 vitest。

## 契約

不新增任何 subpath export、錯誤碼（`webgl_unavailable` 由 10 處理）；全部在 `./image-editor` chunk 內部。不改 10 的任何檔，唯一的例外是 `src/image-editor/extensions.ts` 加一行 import 與一行呼叫（§9.7）。

**共用前提（每一步都適用）**

- Compositor 原始碼：`git clone https://github.com/robbietilton/Compositor "$SCRATCH/compositor" && git -C "$SCRATCH/compositor" checkout 11d8d7a`（`$SCRATCH` 是執行者自己的 scratchpad）。下文的 `Compositor/...` 路徑都在這個 clone 裡。
- 命令：`pnpm test <path>`（vitest，`*.test.ts(x)`，jsdom）、`pnpm test:browser <path>`（headless Chromium，真 WebGL2，`*.browser.test.ts(x)`）、`pnpm check`（型別、lint、格式）。
- 測試裡的註冊表：`beforeEach` 先呼叫 `resetRegistry()`（`src/image-editor/registry.ts`，10 第 1 步）再呼叫要測的 12 的 register 函式；不呼叫 `installExtensions()`（它有模組層級旗標）。`mountCanvas`、`mountEditor` 不呼叫 `installExtensions`。
- 檔案上限 300 行，超過就照職責拆。

**用到的外部符號（出處與簽名照 00-overview §9）**

| 符號 | 檔 | 簽名 / 說明 | 擁有 |
| --- | --- | --- | --- |
| `Manifest`、`LayerRecord`、`LayerAdjustment`、`LayerEffects` | `src/comp/index.ts` | zod 推出的型別，欄位照 Compositor v11；調整的欄位名與 12 種 `kind` 的 raw value 以 09 `src/comp/manifest-adjust.ts`、`manifest-image-adjust.ts` 為準，效果的欄位名以 `manifest-effects.ts` 為準 | 09 P03-1–P03-3 |
| `readProject`、`writeProject`、`Project` | `src/comp/index.ts` | `readProject(bytes: Uint8Array): Project`；`writeProject(p: Project): Blob`；`Project = { manifest; assets: Map<string, Uint8Array>; preview?: Uint8Array }` | 09 P04-1 |
| `validateLikeCompositor` | `src/comp/index.ts` | `(m: Manifest): string[]`，空陣列 = 合法 | 09 P03-4 |
| `encodePng`、`PngImage` | `src/comp/index.ts` | `encodePng(image: PngImage): Uint8Array`；`PngImage = { width; height; channels: 1 \| 4; data: Uint8Array }` | 09 P02-2 |
| `Layer`、`LayerId`、`Doc`、`Command`、`EditorApi`、`PassView`、`EffectTarget`、`MessageKey`、`Rect`、`Mat2D` | `src/image-editor/api.ts` | `Layer` = 09 `LayerRecord`；`Command = (doc: Doc) => Doc`；`EditorApi` 用到 `gl`、`doc()`、`session()`、`setSession(patch)`、`dispatch(command, label?)`（有 label 記一步 undo，沒有 = 即時預覽）、`readComposite(rect: Rect): Uint8Array`（文件座標、RGBA8 直通 alpha、原尺寸）、`writeRegion(id, "image", rect, pixels)`、`readRegion(id, "image", rect): Uint8Array`、`requestRender()`；`PassView = { scale; width; height; docFromPx: Mat2D; forExport: boolean }`；`api.selection(): Selection \| null`（`Selection = { version; texture; bounds: Rect; read(rect: Rect): Uint8Array }`，文件座標 R8，255 = 全選）；`api.setSession({ active })`；`api.writeRegion(id, "mask", rect, r8)`；`api.commit(label, doc, [])`；`EffectTarget = { framebuffer; width; height; pad }`；`Mat2D = [a, b, c, d, e, f]`，x' = a x + c y + e、y' = b x + d y + f | 10 第 1 步 |
| `AdjustmentSettings`、`AdjustmentKind` | `src/image-editor/api.ts` | `AdjustmentSettings = LayerAdjustment`（09）；`AdjustmentKind = AdjustmentSettings["kind"]` | 10 第 1 步 |
| `registerAdjustment`、`AdjustmentHooks` | `src/image-editor/registry.ts`、`api.ts` | `registerAdjustment(kind: AdjustmentKind, hooks: AdjustmentHooks): void`；`AdjustmentHooks = { lut?(gl, s): { dims: 1 \| 3; texture: WebGLTexture }; pass?(gl, src: WebGLTexture, dst: WebGLFramebuffer, s, view: PassView): void; reach(s, scale: number): number }`，`lut` 與 `pass` 擇一；`src` 是下面的累積結果（預乘） | 10 第 1 步；查表在 10 第 3 步 |
| `registerEffects`、`EffectsHooks` | `src/image-editor/registry.ts`、`api.ts` | `registerEffects(hooks: EffectsHooks): void`；`EffectsHooks = { pass(gl, layer: Layer, src: WebGLTexture, dst: EffectTarget, view: PassView & { version: number }): void; reach(effects: NonNullable<Layer["effects"]>, scale: number): number }` | 10 第 1 步 |
| `registerMenuItem`、`MenuItemSpec` | `src/image-editor/registry.ts`、`api.ts` | `MenuItemSpec = { id: string; menu: MenuId; label: MessageKey; order?: number; shortcut?: string; enabled?(api): boolean; run(api): void }`；`menu` 用 `"layer-new"`（圖層面板「新增」下拉）與 `"layer-context"`（圖層右鍵） | 10 第 1 步；畫出來在 10 第 4 步 |
| `registerLayerDecor`、`LayerDecor` | `src/image-editor/registry.ts`、`api.ts` | `LayerDecor = { id: string; badge?(layer: Layer, api: EditorApi): ReactNode \| null; … }`，badge 畫在圖層列名稱右邊 | 10 第 1 步；畫出來在 10 第 4 步 |
| `resetRegistry`、`registerSelection` | `src/image-editor/registry.ts` | `resetRegistry(): void`，只給測試；`registerSelection(provider: { get(api): Selection \| null })`：測試裡註冊假的選取 | 10 第 1 步 |
| `registerPropertyPanel`、`PropertyPanelSpec` | `src/image-editor/registry.ts`、`api.ts` | `registerPropertyPanel(spec: { id: string; order?: number; when(layer: Layer, api: EditorApi): boolean; component: ComponentType<{ api: EditorApi; layer: Layer }> }): void`；屬性欄先畫目前工具的 `panel`，再依 `order` 畫 `session.active` 那一層 `when` 為 true 的面板 | 10 第 1 步；畫出來在 10 第 4 步 |
| `registerMessages` | `src/image-editor/registry.ts` | `registerMessages(table: MessageTable<string>): void`；10 的外框用合併表翻 `MenuItemSpec.label` 與 undo 標籤，12 的 key 要靠它才翻得出來 | 10 第 1 步 |
| `useLabel` | `src/image-editor/ui/use-label.ts` | `useLabel(): (key: MessageKey, vars?) => string`：翻別的區域的 key（本份用不到時不 import） | 10 第 4 步 |
| `insertLayer`、`patchLayer` | `src/image-editor/doc/commands/layers.ts` | `insertLayer(record: Layer, above: LayerId \| null): Command`（插在 `above` 正上方、沿用 `parentID`；`above` 是資料夾時插在整個子樹上方；null 時放根層最上面；`activeLayerID` 設成新層；有 `maskFile` 時 `pixels.mask` 設 `{ kind: "gpu" }`）；`patchLayer(id, patch: Partial<Layer>): Command`（淺合併，值為 `undefined` 的 key 刪掉） | 10 第 2 步 |
| `compile`、`FULLSCREEN_VS`、`drawFullscreen`、`createTarget` | `src/image-editor/engine/gl/program.ts`、`target.ts` | `compile(gl, vs, fs): WebGLProgram`（依 gl 與原始碼快取，失敗丟含 info log 的 Error）；`FULLSCREEN_VS`（`#version 300 es`，蓋滿 viewport，輸出 `out vec2 v_uv`）；`drawFullscreen(gl)`；`createTarget(gl, width, height, format: "rgba16f" \| "rgba8" \| "r8"): { texture; framebuffer; width; height; dispose() }`（`"rgba16f"` 沒有擴充時退成 RGBA8） | 10 第 3 步 |
| `installExtensions` | `src/image-editor/extensions.ts` | 12 在函式體加一行 `registerAdjust();` 與檔頭一行 import | 10 第 1 步 |
| `makeDoc` | `src/image-editor/test/make-doc.ts` | `makeDoc(spec: { width: number; height: number; layers: Partial<Layer>[] }): Doc`，補上必填欄位、蓋滿畫布的 transform | 10 第 2 步 |
| `mountCanvas` | `src/image-editor/test/mount-canvas.tsx` | `mountCanvas(doc: Doc, colors?: Record<LayerId, [r, g, b, a]>): Promise<{ api: EditorApi; store; canvas; unmount(): void }>`；非資料夾、非調整圖層上傳成純色 texture | 10 第 3 步 |
| `mountEditor` | `src/image-editor/test/mount-editor.tsx` | `mountEditor(doc, colors?): Promise<{ api: EditorApi; store; unmount(): void }>`；`store` 有 `undo()`、`redo()`、`get(): Doc` | 10 第 4 步 |
| `MessageTable`、`Messages` | `src/i18n/messages.ts` | `MessageTable<K> = Record<"en" \| "zh-TW", Record<K, string>>`；`Messages = CommonMessages & …`，加區域時加 `& <Area>Messages`（import type） | 02 P03-1 |
| `useT` | `src/i18n/use-t.ts` | `useT<K extends string>(table: MessageTable<K>): (key: K, vars?) => string` | 02 P03-3 |
| `ViewerRoot` | `src/primitives/root.tsx` | `ViewerRoot(props: { locale?; theme?; …; children })`；測試裡包住元件提供 `useRoot()` | 02 P03-3 |
| `Slider` | `src/primitives/slider.tsx` | `Slider(props: { label; value; min; max; step?; disabled?; onValueChange(v: number): void; onValueCommitted?(v: number): void })` | 02 P04-2 |
| `Switch` | `src/primitives/switch.tsx` | `Switch(props: { label: string; checked: boolean; onCheckedChange(checked: boolean): void; disabled?: boolean })` | 02 P04-4 |
| `Select` | `src/primitives/select.tsx` | `Select<T extends string>(props: { label: string; value: T; groups: readonly (readonly { value: T; label: string }[])[]; onChange(v: T): void })` | 02 P04-5 |
| `Button` | `src/primitives/button.tsx` | `Button(props: ComponentProps<"button"> & { variant?; icon? })`；只有圖示時給 `aria-label` | 02 P04-1 |

**i18n**：區域 `image.adjust.*` 與 `image.effects.*`，檔 `src/image-editor/adjust/messages.ts`，形狀照 02：`const en = {…} satisfies Record<string, string>`、`export type AdjustKey = keyof typeof en`、`export type AdjustMessages = Record<AdjustKey, string>`、`export const adjustMessages: MessageTable<AdjustKey> = { en, "zh-TW": {…} }`。第 1 步建檔並在 `src/i18n/messages.ts` 的 `Messages` 加 `& AdjustMessages`；之後每步加自己的 key。超過 300 行拆成同目錄的 `messages-en.ts`、`messages-zh-tw.ts`，表名不變。不寫 `src/i18n/en.ts`、`zh-tw.ts`。

**12 的種類鍵**：`KindKey = "levels" | "curves" | "exposure" | "hueSaturation" | "gradientMap" | "blackWhite" | "colorBalance" | "invert" | "grain" | "addNoise" | "gaussianBlur" | "motionBlur"`，由 `src/image-editor/adjust/settings.ts` 的 `KIND_KEY: Record<AdjustmentKind, KindKey>` 對到 09 的 raw value。下文用英文名稱呼某種調整時，指的就是對到的那個 raw value。

**12 的註冊入口**：`src/image-editor/adjust/install.ts` 的 `registerAdjust(): void`，第一行 `registerMessages(adjustMessages)`（`src/image-editor/registry.ts`、`src/image-editor/adjust/messages.ts`），再依序呼叫 12 的各 register 函式；第 3 步建檔並接進 `installExtensions`，之後的步驟只在這個函式體加一行。

## 形式

- 圖層面板的「新增」下拉（10 的 `layer-new`）多 12 項，依 Compositor 的順序（`ADJUSTMENT_KINDS`）；新圖層放在目前圖層上方，有選取範圍時帶著用選取做的遮色片，建好後選到它，屬性欄出現它的調整面板。
- 調整圖層的列在名稱右邊有半黑半白圓的按鈕，按下選到那一層。選到調整圖層時屬性欄畫它的面板（標題是種類名稱）：
  - Levels：通道選單、直方圖、輸入黑 / 灰 / 白三個 Slider、輸出黑白兩個 Slider、「自動」。
  - Curves：通道選單、256 × 256 曲線格（SVG）、點擊加點、拖出格外刪點（2–32 點）、選到的點可輸入數值、方向鍵移動選到的點。
  - Hue/Saturation：色域選單（全部、紅、黃、綠、青、藍、洋紅）、色相 / 飽和度 / 明度 Slider、「上色」Switch。
  - 其他 9 種：依設定欄位用 Slider、色塊、Switch，標籤用 Photoshop 的叫法。
  - 底部「重設」。拖滑桿即時預覽，放開才記一步 undo。
- 效果：選到一般圖層時屬性欄有效果面板；圖層右鍵「效果…」或圖層列的 `fx` 按鈕（有任何效果時才顯示，含停用的）選到那一層並把焦點移到效果面板。六種各一列：Switch 啟用（停用的保留參數，同 Compositor 的眼睛）+ 展開參數。右鍵另有「拷貝效果」「貼上效果」「清除效果」。

## Phase 01 — 調整圖層

blocker：09 P03-1–P03-3、10 第 1–3 步；model：opus。

1. **1D LUT 數學、預設值與字串表。**
   - 新 `src/image-editor/adjust/settings.ts`：`export type KindKey`（見契約）；`export const KIND_KEY: Record<AdjustmentKind, KindKey>`；`export const ADJUSTMENT_KINDS: readonly AdjustmentKind[]`（順序照 `Compositor/Document/LayerAdjustment.swift` 的 `AdjustmentKind` case 順序）；`export function randomSeed(): number`（`crypto.getRandomValues(new Uint32Array(1))[0]`）；`export function defaultAdjustment(kind: AdjustmentKind, seed: number = randomSeed()): AdjustmentSettings`（值照 Compositor 新建該種調整圖層時給的預設；必填欄位 `hue`、`saturation`、`lightness`、`colorize`、`levels`、`curves` 一律填；Grain / Add Noise 的 `noiseSeed = seed`）。`AdjustmentSettings`、`AdjustmentKind` 從 `src/image-editor/api.ts` import。
   - 新 `src/image-editor/adjust/levels.ts`：`levelsLut(s: AdjustmentSettings): Float32Array`（長度 256 × 4，第 i 格 = 輸入 i/255 時 R、G、B 的輸出 0–1，A 填 1；先套 RGB 總設定再套各通道）；`histogram(rgba: Uint8Array): { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array }`（各 256 格，alpha 0 的像素不算，luma = 0.299R + 0.587G + 0.114B 四捨五入）；`autoLevels(h: ReturnType<typeof histogram>, current: AdjustmentSettings): AdjustmentSettings`（照 `Compositor/Document/LevelsAutomatic.swift`，只改 levels 欄位）。
   - 新 `src/image-editor/adjust/curves.ts`：`curveSample(points: readonly { x: number; y: number }[], x: number): number`（單調 Hermite，照 `Compositor/Document/Curves.swift`）；`curvesLut(s: AdjustmentSettings): Float32Array`（同 `levelsLut` 的格式）。
   - 新 `src/image-editor/adjust/exposure.ts`：`exposureLut(s: AdjustmentSettings): Float32Array`（同格式；照 `Compositor/Document/ImageAdjustments.swift` 的 Exposure：sRGB → 線性、exposure / offset / gamma、→ sRGB）。
   - 新 `scripts/gen-adjust-fixtures.sh`（`bash`，`set -euo pipefail`，參數 1 = Compositor clone 路徑）與 `scripts/adjust-fixtures/levels.c`：用本機 `cc -O2` 把 `levels.c` 與 `<clone>/Compositor/Rendering/LevelsPixels.c` 編進 `$TMPDIR`，`levels.c` 依 `LevelsPixels.c` 的函式簽名，對四組固定設定（恆等；輸入黑 20 / 白 230 / 灰 1.4；輸出 10–240；只改紅通道輸入白 200）把 0–255 每階輸入的 R、G、B 輸出印成 JSON；寫到 `src/image-editor/adjust/__fixtures__/levels.json`，格式 `{ "cases": [{ "levels": <與 AdjustmentSettings 的 levels 欄位同形>, "out": number[768] }] }`。JSON 進 repo，CI 不需要 `cc`。
   - 新 `src/image-editor/adjust/messages.ts`（形狀見契約「i18n」）：key `image.adjust.kind.<KindKey>` 12 條（en：Levels、Curves、Exposure、Hue/Saturation、Gradient Map、Black & White、Color Balance、Invert、Grain、Add Noise、Gaussian Blur、Motion Blur；zh-TW：色階、曲線、曝光度、色相/飽和度、漸層對應、黑白、色彩平衡、負片效果、顆粒、增加雜訊、高斯模糊、動態模糊）、`image.adjust.add`（New adjustment layer / 新增調整圖層）、`image.adjust.change`（Adjust / 調整）、`image.adjust.reset`（Reset / 重設）。改 `src/i18n/messages.ts`：加 `import type { AdjustMessages } from "../image-editor/adjust/messages";`，`Messages` 那一行尾端加 `& AdjustMessages`。
   - 測試：`src/image-editor/adjust/levels.test.ts`（`levels.json` 每個 case 的 768 個值與 `levelsLut` × 255 四捨五入相差 ≤ 1；改寫 `LevelsTests.swift` 的數值案例；`histogram` 對 4 個像素（含一個 alpha 0）的計數；`autoLevels` 對一張只有 50–200 灰階的直方圖得到的黑白點照 `LevelsAutomatic.swift` 的規則）；`curves.test.ts`（兩點對角線是恆等；任何點集輸入遞增時輸出不遞減；改寫 `AdjustmentLayerTests.swift` 的 Curves 數值案例）；`exposure.test.ts`（預設值是恆等，誤差 ≤ 1/255；改寫 `ImageAdjustmentTests.swift` 的 Exposure 案例）；`settings.test.ts`（`ADJUSTMENT_KINDS` 長度 12 且與 `KIND_KEY` 的 key 相同；每種 `defaultAdjustment(kind, 7)` 的 `kind` 對、Grain 與 Add Noise 的 `noiseSeed` 是 7）。
   - verify：`bash -n scripts/gen-adjust-fixtures.sh && pnpm test src/image-editor/adjust && pnpm check`
   - commit：`feat(image-adjustments-effects): add levels, curves and exposure LUT math`

2. **3D LUT 數學。**
   - 新 `src/image-editor/adjust/lut3d.ts`：`export const LUT3D_SIZE = 33`；`buildLut3d(fn: (r: number, g: number, b: number) => [number, number, number]): Float32Array`（長度 33³ × 4，索引 `((b * 33 + g) * 33 + r) * 4`，輸入 r/g/b = 索引 / 32，A 填 1）；`sampleLut3d(lut: Float32Array, r: number, g: number, b: number): [number, number, number]`（三線性，CPU 參考，給測試用）。
   - 新 `src/image-editor/adjust/hue-saturation.ts`：`hueSaturationRgb(s: AdjustmentSettings, r: number, g: number, b: number): [number, number, number]`、`hueSaturationLut(s: AdjustmentSettings): Float32Array`（`buildLut3d(hueSaturationRgb…)`），照 `Compositor/Document/HueSaturation.swift`；新 `src/image-editor/adjust/hue-saturation-bands.ts`：`readBands(s: AdjustmentSettings): Map<string, { hue: number; saturation: number; lightness: number }>` 與 falloff 帶的權重 `bandWeight(range: string, hue: number, s: AdjustmentSettings): number`（解讀 09 保留的 `adjustments` / `bands` 交錯陣列：偶數位是色域名，奇數位是物件）。
   - 新 `src/image-editor/adjust/color-lut.ts`：`gradientMapLut(s)`、`blackWhiteLut(s)`、`colorBalanceLut(s)`、`invertLut(s)`，都是 `(s: AdjustmentSettings) => Float32Array`，前三種的逐點函式（`gradientMapRgb`、`blackWhiteRgb`、`colorBalanceRgb`，簽名同 `hueSaturationRgb`）一併匯出，照 `Compositor/Rendering/AdjustPixels.c` 的 `adjust_gradient_map`、`adjust_black_white`、`adjust_color_balance`。
   - 改 `scripts/gen-adjust-fixtures.sh`：再編 `scripts/adjust-fixtures/color.c` 與 `<clone>/Compositor/Rendering/AdjustPixels.c`，對 gradient map、black & white、color balance 各兩組固定設定、一組固定的 512 個 RGB8 輸入（R、G、B 由 `i * 37 % 256`、`i * 91 % 256`、`i * 173 % 256` 產生）印出輸出，寫 `src/image-editor/adjust/__fixtures__/color.json`，格式 `{ "cases": [{ "kind": "gradientMap" | "blackWhite" | "colorBalance", "settings": <該種在 AdjustmentSettings 裡的欄位>, "out": number[1536] }] }`。
   - 測試：`src/image-editor/adjust/color-lut.test.ts`（`color.json` 每個 case 用逐點函式算，與 C 輸出逐值相差 ≤ 1；`invertLut` 在 8 個角點是 1 − x）；`src/image-editor/adjust/hue-saturation.test.ts`（改寫 `HueSaturationTests.swift` 的數值案例；`adjustments` 交錯陣列的色域順序打亂後 `hueSaturationLut` 結果相同；預設值是恆等；`sampleLut3d(hueSaturationLut(s), …)` 對 100 個固定顏色與 `hueSaturationRgb` 相差 ≤ 2/255）。
   - verify：`bash -n scripts/gen-adjust-fixtures.sh && pnpm test src/image-editor/adjust && pnpm check`
   - commit：`feat(image-adjustments-effects): add 3D LUT math for color adjustments`

3. **8 種逐像素調整接上 10（只建 LUT texture，不寫查表 shader）。**
   - 新 `src/image-editor/adjust/lut-texture.ts`：`uploadLut1d(gl: WebGL2RenderingContext, data: Float32Array): WebGLTexture`（256×1，`TEXTURE_2D`，internal `RGBA16F`、format `RGBA`、type `FLOAT`，`LINEAR`、`CLAMP_TO_EDGE`）；`uploadLut3d(gl, data): WebGLTexture`（33³，`TEXTURE_3D`，internal `RGBA16F`、format `RGBA`、type `FLOAT`，`LINEAR`、`CLAMP_TO_EDGE`）；`cachedLut(gl, key: string, dims: 1 | 3, build: () => Float32Array): { dims: 1 | 3; texture: WebGLTexture }`：每個 `gl` 一個 `Map`（存在 `WeakMap<WebGL2RenderingContext, …>`），最多 32 筆 LRU，淘汰時 `gl.deleteTexture`；第一次見到某個 `gl` 時對 `gl.canvas` 加 `webglcontextlost` 監聽，觸發時清空該 `Map`（不 delete，texture 已失效）。上傳前後把 `TEXTURE_2D` / `TEXTURE_3D` 的綁定還原成呼叫前的值。
   - 新 `src/image-editor/adjust/register-lut.ts`：`registerLutAdjustments(): void`，對 Levels、Curves、Exposure 呼叫 `registerAdjustment(kind, { lut: (gl, s) => cachedLut(gl, JSON.stringify(s), 1, () => levelsLut(s) …), reach: () => 0 })`，Hue/Saturation、Gradient Map、Black & White、Color Balance、Invert 同樣用 dims 3（函式出處：`src/image-editor/adjust/levels.ts`、`curves.ts`、`exposure.ts`、`hue-saturation.ts`、`color-lut.ts`；`registerAdjustment` 在 `src/image-editor/registry.ts`）。kind 由 `KIND_KEY`（`src/image-editor/adjust/settings.ts`）反查。
   - 新 `src/image-editor/adjust/install.ts`：`export function registerAdjust(): void { registerMessages(adjustMessages); registerLutAdjustments(); }`（`registerMessages` 來自 `src/image-editor/registry.ts`，`adjustMessages` 來自 `src/image-editor/adjust/messages.ts`）。
   - 改 `src/image-editor/extensions.ts`（10 第 1 步）：加 `import { registerAdjust } from "./adjust/install";`，`installExtensions` 的函式體加一行 `registerAdjust();`，其他行不動。
   - 測試：`src/image-editor/adjust/lut.browser.test.ts`：`beforeEach` 照契約重設註冊表並呼叫 `registerLutAdjustments()`；用 `makeDoc`（`src/image-editor/test/make-doc.ts`）建 256 × 1 畫布、底層一般圖層加上面一層調整圖層（`adjustment` = 該種的非預設設定），`mountCanvas`（`src/image-editor/test/mount-canvas.tsx`）後用 `api.writeRegion(底層 id, "image", { x: 0, y: 0, width: 256, height: 1 }, 灰階漸層 RGBA8)` 寫入 0–255 漸層（3D 種類另用 33 × 33 畫布寫入 1089 個固定顏色），`api.requestRender()` 後 `api.readComposite(整張)`，與 CPU 參考（1D：LUT 直接查；3D：逐點函式）相差：1D ≤ 1/255、3D ≤ 2/255（33³ 三線性內插的誤差）。8 種各一個 case。另測 `cachedLut`：同一個 key 第二次不呼叫 `build`；第 33 個 key 淘汰最舊的。
   - verify：`pnpm test:browser src/image-editor/adjust/lut.browser.test.ts && pnpm check`
   - commit：`feat(image-adjustments-effects): register per-pixel adjustment layers as LUT textures`

4. **Grain 與 Add Noise。**
   - GL helper 一律用 10 的（不另寫）：`compile(gl, vs, fs)`、`FULLSCREEN_VS`、`drawFullscreen(gl)` 從 `src/image-editor/engine/gl/program.ts`，`createTarget(gl, width, height, "rgba16f")` 從 `src/image-editor/engine/gl/target.ts`。fragment shader 用 `in vec2 v_uv;` 接 `FULLSCREEN_VS` 的輸出。
   - 新 `src/image-editor/adjust/noise.glsl.ts`（`ADD_NOISE_FS`，`add_noise`）、`src/image-editor/adjust/grain.glsl.ts`（`GRAIN_FS`，`add_grain`）：照 `Compositor/Rendering/GPUNoise.swift` 的 MSL（它們移植自 `NoisePixels.c` 與 `AdjustPixels.c` 的 `adjust_grain`）改成 GLSL ES 3.00；uniform：`u_src`（預乘）、`u_docFromPx`（`mat3`，由 `view.docFromPx` 組）、`u_seed`（`uint`，`noiseSeed`）、各自的設定；雜訊值以 `floor(文件座標)` 與 seed 雜湊產生。
   - 新 `src/image-editor/adjust/register-noise.ts`：`registerNoiseAdjustments(): void`，Grain 與 Add Noise 各 `registerAdjustment(kind, { pass(gl, src, dst, s, view) { … }, reach: () => 0 })`；`pass` 用 `compile(gl, FULLSCREEN_VS, GRAIN_FS / ADD_NOISE_FS)`、`useProgram`、綁 `dst`、`viewport(0, 0, view.width, view.height)`、`drawFullscreen(gl)` 畫一次，不還原其他 GL 狀態（10 每次畫之前自己設）。
   - 改 `src/image-editor/adjust/install.ts`：`registerAdjust` 加一行 `registerNoiseAdjustments();`。
   - 測試：`src/image-editor/adjust/noise.browser.test.ts`（`makeDoc` 64 × 64、底層 50% 灰、上面一層 Add Noise，`mountCanvas` 後 `readComposite`）：同 `noiseSeed` 兩次 mount 讀回逐位元相同；換 seed 不同；`readComposite({ x: 16, y: 16, width: 32, height: 32 })` 與整張讀回的同區域逐位元相同（文件座標取樣）；直接呼叫註冊的 `pass` 兩次，`docFromPx` 分別是恆等與平移 (8, 8)，輸出錯開 8 px 後重疊區相同；Grain 也跑這三個 case（同 seed 相同、換 seed 不同、子區域與整張相同）。
   - verify：`pnpm test:browser src/image-editor/adjust/noise.browser.test.ts && pnpm check`
   - commit：`feat(image-adjustments-effects): add grain and noise adjustments`

5. **Gaussian Blur 與 Motion Blur；12 種的整體檢查。**
   - 新 `src/image-editor/adjust/blur.glsl.ts`：`GAUSS_FS`（一維高斯，uniform `u_dir`、`u_sigma`，半徑 `ceil(3σ)`）、`MOTION_FS`（沿 `u_dir` 在全長 `u_length` 上等權取樣，樣本數 = `max(1, ceil(u_length))`）。
   - 新 `src/image-editor/adjust/reach.ts`：`blurReach(s: AdjustmentSettings, scale: number): number`（Gaussian Blur：`ceil(3 × blurRadius × scale)`；Motion Blur：`ceil(motionDistance / 2 × scale)`；其他 0）。
   - 新 `src/image-editor/adjust/register-blur.ts`：`registerBlurAdjustments(): void`：Gaussian Blur 的 `pass` 用 `createTarget(gl, w, h, "rgba16f")`（`src/image-editor/engine/gl/target.ts`，10 第 3 步）建一張 `view.width × view.height` 暫存，程式用 `compile(gl, FULLSCREEN_VS, GAUSS_FS / MOTION_FS)` 與 `drawFullscreen`（`src/image-editor/engine/gl/program.ts`），水平一趟到暫存、垂直一趟到 `dst`，σ = `blurRadius × view.scale`，σ < 0.01 時直接複製；Motion Blur 一趟，方向向量照 `CIMotionBlur` 換算（`motionAngle` 取負號後的方向，以文件座標 y 朝下表示），長度 `motionDistance × view.scale`；`reach` 都是 `blurReach`。暫存 target 每個 `gl` 留一張、尺寸不夠時重建。
   - 改 `src/image-editor/adjust/install.ts`：`registerAdjust` 加一行 `registerBlurAdjustments();`。
   - 測試：`src/image-editor/adjust/blur.browser.test.ts`（`mountCanvas`）：64 × 64 黑底中央一個白點，Gaussian σ = 3 的輸出與 CPU 高斯相差 ≤ 2/255；Motion Blur 角度 0 時白點只在水平方向擴散（上下一列全黑）；256 × 256 隨機色底、Gaussian σ = 8：用 `blurReach` 算邊、分四塊 `readComposite`（每塊各加邊再裁掉）拼起來與整張 `readComposite` 逐像素相同；`blurReach` 對 scale 0.5 減半。`src/image-editor/adjust/adjustments.browser.test.ts`：呼叫 `registerAdjust()`，128 × 128 彩色漸層底層，12 種調整各一層、各用一組非預設設定，逐一只顯示一層調整時讀回結果都與「全部調整隱藏」不同、渲染不丟錯。`src/image-editor/__fixtures__/adjustments.comp.zip`（Compositor 存、含 12 種調整圖層）**存在時**另跑一組：`readProject`（`src/comp/index.ts`）讀進來、`mountCanvas` 渲染不丟錯，渲染圖存到 `$TMPDIR` 供與 `QuickLook/Preview.jpg` 目視比對；不存在時那組 `describe.skip`。本步不產生這個檔，回報寫一行「fixture 未驗」。
   - verify：`pnpm test:browser src/image-editor/adjust && pnpm check`
   - commit：`feat(image-adjustments-effects): add gaussian and motion blur adjustments`

phase 結尾 verify：`pnpm test src/image-editor/adjust && pnpm test:browser src/image-editor/adjust && pnpm check`

## Phase 02 — 圖層效果

blocker：09 P03-2（`LayerEffects`）、10 第 1–3 步；model：opus。

6. **效果的預設值與 pass。**
   - 新 `src/image-editor/effects/defaults.ts`：`export const EFFECT_NAMES = ["stroke", "shadow", "colorOverlay", "innerShadow", "outerGlow", "innerGlow"] as const`、`export type EffectName = (typeof EFFECT_NAMES)[number]`（字串以 09 `LayerEffects` 的欄位名為準，與這六個不同時改成 09 的名字）；`defaultEffect(name: EffectName): NonNullable<LayerEffects[EffectName]>`（值照 `Compositor/Document/LayerEffects.swift`，`enabled: true`）；`EFFECT_RANGES`（每個數值欄位的 min / max，照該檔各 `isValid`）。`LayerEffects` 從 `src/comp/index.ts` import。
   - 新 `src/image-editor/effects/passes.glsl.ts`（`ALPHA_FS`、`SPREAD_FS`（列或欄，max 或 min）、`RING_FS`、`SHIFT_FS`）與 `src/image-editor/effects/passes-blur.glsl.ts`（`BLUR_FS`（列或欄）、`INSIDE_FS`、`COMPOSE_FS`），對應 `Compositor/Rendering/MetalLayerEffects.swift` 的同名 kernel。
   - 新 `src/image-editor/effects/passes.ts`：`runEffectPasses(gl, src: WebGLTexture, srcSize: { width: number; height: number }, out: { framebuffer: WebGLFramebuffer; width: number; height: number; pad: number }, effects: LayerEffects, k: number): void`：k = 圖層 px → 輸出 px 的倍率；照判斷裡的公式依序跑 pass（只跑 `enabled !== false` 的效果），暫存用 `createTarget(gl, w, h, "rgba16f")`（`src/image-editor/engine/gl/target.ts`），程式用 `compile(gl, FULLSCREEN_VS, <各 FS>)` 與 `drawFullscreen`（`src/image-editor/engine/gl/program.ts`），最後 `COMPOSE_FS` 寫進 `out`。
   - 測試：`src/image-editor/effects/passes.browser.test.ts`（自己建 `canvas.getContext("webgl2")`，上傳 100 × 100 不透明方塊、`out` 240 × 240、pad 70、k = 1，`readPixels` 讀回）：外筆畫 10 px 後 alpha 覆蓋 120 × 120 且四個角像素不透明（方角）；內筆畫不超出 100 × 100；陰影角度 90 距離 10 時陰影往下（Compositor 角度從右邊逆時針、90° 往下）、角度 0 往右；外光暈在形狀內部的貢獻為 0；內光暈與內陰影在形狀外 alpha 為 0；顏色覆蓋讓內部全變成指定顏色；改寫 `InnerGlowTests.swift`、`OuterGlowTests.swift` 的數值案例；`enabled: false` 的效果不影響輸出。
   - verify：`pnpm test:browser src/image-editor/effects/passes.browser.test.ts && pnpm check`
   - commit：`feat(image-adjustments-effects): port layer effect passes to WebGL2`

7. **效果接上 10：reach、預覽上限、快取、註冊。**
   - 新 `src/image-editor/effects/reach.ts`：`effectsReach(effects: LayerEffects, scale: number): number`（公式見判斷）。
   - 新 `src/image-editor/effects/render.ts`：`previewLongSide(n: number): number`（`clamp(Math.sqrt(16_700_000 / max(n, 1)), 32, 1536)` 取整）；`renderEffects(gl, layer: Layer, src: WebGLTexture, dst: EffectTarget, view: PassView & { version: number }): void`：內框尺寸 = `dst.width − 2·dst.pad` × `dst.height − 2·dst.pad`，k = `view.scale`；`view.forExport` 為 false、`view.scale < 1` 且內框長邊 > `previewLongSide(快取筆數)` 時在縮小的 target 算完再放大畫進 `dst`；快取（最多 64 筆 LRU，key 見判斷；`view.forExport` 為 true 時不讀不寫）命中時只畫快取 texture；呼叫 `runEffectPasses`（`src/image-editor/effects/passes.ts`）。`layer.effects` 為空或全部停用時只把 `src` 畫進內框。
   - 新 `src/image-editor/effects/register.ts`：`registerLayerEffects(): void { registerEffects({ pass: renderEffects, reach: effectsReach }); }`（`registerEffects` 在 `src/image-editor/registry.ts`）。
   - 改 `src/image-editor/adjust/install.ts`：`registerAdjust` 加一行 `registerLayerEffects();`（import `../effects/register`）。
   - 測試：`src/image-editor/effects/render.browser.test.ts`（`registerLayerEffects()` 後 `makeDoc` + `mountCanvas`，200 × 200 畫布、中央 100 × 100 圖層帶效果）：停用的效果不影響畫面且 `api.doc()` 裡參數仍在；外光暈 20 的圖層分四塊 `readComposite`（每塊加 `effectsReach` 的邊）與整張逐像素相同；`view.version` 與設定都沒變時第二次呼叫 `renderEffects` 不跑 pass（spy `runEffectPasses`）；同樣的參數但 `forExport: true` 時每次都跑 pass、快取筆數不變，`scale` 0.25 的大圖層在 `forExport: true` 時用原尺寸算（spy 收到的 k 是 0.25、target 是內框大小）；`previewLongSide(1) === 1536`、`previewLongSide(100_000) === 32`；`effectsReach` 對陰影距離 10 模糊 4、scale 1 回 16。`src/image-editor/effects/effects.browser.test.ts`：`src/image-editor/__fixtures__/effects.comp.zip`（Compositor 存，含六種效果）存在時用 `readProject` 讀、渲染不丟錯並存渲染圖到 `$TMPDIR`；不存在時 `describe.skip`，回報寫「fixture 未驗」。
   - verify：`pnpm test:browser src/image-editor/effects && pnpm check`
   - commit：`feat(image-adjustments-effects): render layer effects with preview cache`

phase 結尾 verify：`pnpm test:browser src/image-editor/adjust src/image-editor/effects && pnpm check`

## Phase 03 — 面板

blocker：10 第 4 步（屬性欄、圖層面板與 `mountEditor`）、02 P04-2–P04-5、Phase 01、Phase 02；model：sonnet。面板元件的 jsdom 測試用第 8 步的 `fakeApi`，包在 `ViewerRoot`（`src/primitives/root.tsx`，`locale="en"`）裡渲染，props 直接給 `{ api, layer }`。

8. **調整圖層的命令、新增入口、屬性欄面板與通用面板。**
   - 新 `src/image-editor/adjust/commands.ts`：`adjustmentRecord(opts: { id: LayerId; kind: AdjustmentKind; name: string; width: number; height: number; settings: AdjustmentSettings; withMask: boolean }): Layer`：`{ id, name, isVisible: true, transform: 蓋滿畫布（origin [0, 0]、size [width, height]、rotation 0、flipX / flipY false、sampling "Smooth"）, adjustment: settings }`，沒有 `imageFile`；`withMask` 時加 `maskFile: "<id>.mask.png"`。`addAdjustmentLayer(opts: 同上加 active: LayerId | null): Command` = `insertLayer(adjustmentRecord(opts), opts.active)`；`setAdjustment(id: LayerId, settings: AdjustmentSettings): Command` = `patchLayer(id, { adjustment: settings })`（`insertLayer`、`patchLayer` 從 `src/image-editor/doc/commands/layers.ts`，10 第 2 步；放置規則、`parentID`、`activeLayerID`、`pixels.mask` 都由 `insertLayer` 處理）。`Command`、`Layer`、`LayerId` 從 `src/image-editor/api.ts`。
   - 新 `src/image-editor/adjust/panels/adjust-panel.tsx`：`AdjustPanel({ api, layer }: { api: EditorApi; layer: Layer })`（`PropertyPanelSpec.component` 的形狀）：`<section className="fv-ie-adj-panel" aria-label={t("image.adjust.open")}>`，標題 `<h3>` = `t("image.adjust.kind.<KindKey>")`（`useT(adjustMessages)`，`src/i18n/use-t.ts`）；內容依 kind 選面板：本步只有 `GenericPanel`，Levels、Curves、Hue/Saturation 暫時也用它（第 9、10 步換掉）；最下面一個 `Button`（`src/primitives/button.tsx`）「重設」→ `api.dispatch(setAdjustment(id, defaultAdjustment(kind, 目前的 noiseSeed ?? randomSeed())), "image.adjust.reset")`。
   - 新 `src/image-editor/adjust/panels/fields.ts`：`FieldSpec = { path: string; label: AdjustKey; type: "slider"; min: number; max: number; step: number } | { path: string; label: AdjustKey; type: "switch" } | { path: string; label: AdjustKey; type: "color" }`（`path` 是 `AdjustmentSettings` 裡的點號路徑，顏色欄位指向有 `red` / `green` / `blue` 0–1 的物件）；`FIELDS: Record<KindKey, readonly FieldSpec[]>`，9 種非專屬面板的欄位、範圍照 `Compositor/Document/ImageAdjustments.swift` 與 `LayerAdjustment.swift`；Gradient Map 每個色標一個 color 欄位（不加減色標）；Grain、Add Noise 不列 `noiseSeed`。`getPath(obj, path)`、`setPath(obj, path, value)`（回新物件，不改原物件）。
   - 新 `src/image-editor/adjust/panels/color.ts`：`toHex(c: { red: number; green: number; blue: number }): string`、`fromHex(hex: string): { red: number; green: number; blue: number }`。
   - 新 `src/image-editor/adjust/panels/generic-panel.tsx`：`GenericPanel({ layer, api })`：依 `FIELDS[KIND_KEY[kind]]` 畫 `Slider`（`onValueChange` → `api.dispatch(setAdjustment(…))` 不帶 label；`onValueCommitted` → 同一個命令帶 `"image.adjust.change"`）、`Switch`（直接帶 label）、`<input type="color">`（`input` 不帶、`change` 帶 label）。
   - 新 `src/image-editor/adjust/badge.tsx`：`LayerBadge({ layer, api })`：`layer.adjustment` 存在時畫一個只有圖示的 `Button`（`aria-label` = 種類名稱，圖示是半黑半白圓的 inline SVG）→ `api.setSession({ active: layer.id })`（屬性欄就會畫它的調整面板）；其他層回 null。`export const adjustDecor: LayerDecor = { id: "image.adjust", badge: (layer, api) => <LayerBadge layer={layer} api={api} /> }`。
   - 新 `src/image-editor/adjust/menu.ts`：`registerAdjustUi(): void`：`registerLayerDecor(adjustDecor)`；`registerPropertyPanel({ id: "image.adjust", order: 100, when: (layer) => layer.adjustment !== undefined, component: AdjustPanel })`（`src/image-editor/registry.ts`）；對 `ADJUSTMENT_KINDS` 每一種 `registerMenuItem({ id: "image.adjust.add.<KindKey>", menu: "layer-new", label: "image.adjust.kind.<KindKey>", order: 100 + index, run(api) { … } })`：`id = crypto.randomUUID().toUpperCase()`、`{ width, height } = api.doc().manifest`、`sel = api.selection()`；`name` = `api.t("image.adjust.kind.<KindKey>")`；沒有選取：`api.dispatch(addAdjustmentLayer({ id, kind, name, width, height, active: api.session().active, settings: defaultAdjustment(kind), withMask: false }), "image.adjust.add")`；有選取：同一個命令 `withMask: true`、不帶 label 地 `dispatch`，再 `api.writeRegion(id, "mask", { x: 0, y: 0, width, height }, sel.read({ x: 0, y: 0, width, height }))`、`api.commit("image.adjust.add", api.doc(), [])`（新層沒有 before，同 10 新層的寫法）；最後 `api.setSession({ active: id })`。
   - 改 `src/image-editor/adjust/install.ts`：`registerAdjust` 加一行 `registerAdjustUi();`。
   - 樣式加在 `src/styles.css` 檔尾一段 `/* image-adjust */`，class 前綴 `fv-ie-adj-`，顏色只用 `--ak-*`。
   - i18n（`src/image-editor/adjust/messages.ts`）：`FIELDS` 用到的每個 label key（`image.adjust.<KindKey>.<欄位>`）、`image.adjust.open`（Adjustment settings / 調整設定）。
   - 新 `src/image-editor/adjust/test/fake-api.ts`：`fakeApi(doc: Doc): { api: EditorApi; labels: (MessageKey | undefined)[] }`：`doc()` 回目前文件，`dispatch(cmd, label)` 套命令並把 label 推進 `labels`，`session()` 回 `{ active: null, target: "image", tool: "move", collapsed: new Set(), renderHidden: new Set() }`、`setSession` 合併，`readComposite(rect)` 回 `rect.width × rect.height × 4` 個 128，`selection()` 回 null，`t(key)` 回 key，其他方法丟 `Error("fakeApi")`。
   - 測試：`src/image-editor/adjust/commands.test.ts`（`makeDoc` 三層：active 是中間層時新層在它之後、`parentID` 相同；active 是資料夾時在最後一個子孫之後；active null 時在最後；新層沒有 `imageFile`；`withMask: true` 時有 `maskFile` 與 `pixels.mask`）；`src/image-editor/adjust/panels/generic-panel.test.tsx`（直接 render `<AdjustPanel api layer />`；9 種各改一個欄位：拖曳中 `labels` 只多 `undefined`、放開多一個 `"image.adjust.change"`；「重設」後 `adjustment` 等於 `defaultAdjustment` 且 `noiseSeed` 不變；色塊 `change` 記一步）；`src/image-editor/adjust/menu.browser.test.tsx`（`resetRegistry()`、`registerAdjust()` 後 `mountEditor`（`src/image-editor/test/mount-editor.tsx`）：從「新增」下拉選 Exposure，文件多一層、`session().active` 是它、屬性欄出現標題為 Exposure 的面板；選回底層後面板消失，按 badge 按鈕後又選到它、面板出現；`store.undo()` 後那一層消失；另一個 case 在 mount 前 `registerSelection({ get: () => 左半全選的假 Selection })`：新增的調整圖層有 `maskFile`、`readRegion(id, "mask", 整張)` 左半 255 右半 0、只多一步 undo、undo 後那一層消失）。
   - verify：`pnpm test src/image-editor/adjust && pnpm test:browser src/image-editor/adjust/menu.browser.test.tsx && pnpm check`
   - commit：`feat(image-adjustments-effects): add adjustment layer menu, property panel and generic panel`

9. **Levels 與 Curves 面板。**
   - 新 `src/image-editor/adjust/panels/below.ts`：`readBelow(api: EditorApi, id: LayerId): Uint8Array`：記下 `before = api.doc()`，`api.dispatch((d) => 把 id 那層 isVisible 設 false 的新文件)`（不帶 label），以 256 列一條 `api.readComposite({ x: 0, y, width: 畫布寬, height })` 讀，每 `step = ceil(長邊 / 512)` 取一個像素，最後 `api.dispatch(() => before)`（不帶 label）；回取樣後的 RGBA8。
   - 新 `src/image-editor/adjust/panels/levels-panel.tsx`：`LevelsPanel({ layer, api })`：`Select`（`src/primitives/select.tsx`）通道 RGB / 紅 / 綠 / 藍；直方圖 SVG（`histogram(readBelow(api, layer.id))`，`src/image-editor/adjust/levels.ts`；面板打開時算一次）；輸入黑 / 灰 / 白、輸出黑 / 白五個 `Slider`；「自動」`Button` → `api.dispatch(setAdjustment(id, autoLevels(h, s)), "image.adjust.change")`。
   - 新 `src/image-editor/adjust/panels/curves-panel.tsx`：`CurvesPanel({ layer, api })`：通道 `Select`；256 × 256 SVG 曲線格，曲線用 `curveSample`（`src/image-editor/adjust/curves.ts`）畫；點擊空白處加點（點數 < 32）、拖點即時預覽、放開記一步、拖出格外放開刪點（點數 > 2）；每個點是可 focus 的元素（`tabIndex=0`、`role="slider"`、`aria-valuetext="x, y"`），方向鍵移 1、Shift + 方向鍵移 10（每次記一步）；選到的點下面兩個 `<input type="number">`（輸入 / 輸出 0–255，`change` 記一步）。
   - 改 `src/image-editor/adjust/panels/adjust-panel.tsx`：Levels → `LevelsPanel`、Curves → `CurvesPanel`。
   - i18n：`image.adjust.channel`、`image.adjust.channel.{rgb,red,green,blue}`、`image.adjust.levels.{inputBlack,inputGamma,inputWhite,outputBlack,outputWhite,auto,histogram}`、`image.adjust.curves.{grid,point,input,output}`。
   - 測試：`src/image-editor/adjust/panels/levels-curves.test.tsx`（`fakeApi`）：Levels 改輸入白 → 一次 `"image.adjust.change"`；「自動」對 `fakeApi` 的全 128 灰改出非預設的黑白點；只用鍵盤：Tab 到輸入黑 Slider、右鍵 5 次後值 +5；Curves：點擊格內加一點、拖出格外刪點、選點後輸入 128/200、方向鍵上移 1，每個動作各一步 `"image.adjust.change"`；點數 2 時拖出格外不刪。`readBelow` 在 `fakeApi` 上前後兩次 dispatch 都不帶 label、結束後 `api.doc()` 是原物件。
   - verify：`pnpm test src/image-editor/adjust/panels && pnpm check`
   - commit：`feat(image-adjustments-effects): add levels and curves panels`

10. **Hue/Saturation 面板。**
    - 新 `src/image-editor/adjust/panels/hue-saturation-panel.tsx`：`HueSaturationPanel({ layer, api })`：色域 `Select`（全部、紅、黃、綠、青、藍、洋紅；值是 `src/image-editor/adjust/hue-saturation-bands.ts` 用的色域名）；色相 −180–180、飽和度 −100–100、明度 −100–100 三個 `Slider`，改的是選到的色域在交錯陣列裡的物件（全部 = 頂層的 `hue` / `saturation` / `lightness`，範圍與單位照 `Compositor/Document/HueSaturation.swift`）；「上色」`Switch`（`src/primitives/switch.tsx`）→ `colorize`；寫回時保留交錯陣列原本的順序與未知欄位。
    - 改 `src/image-editor/adjust/panels/adjust-panel.tsx`：Hue/Saturation → `HueSaturationPanel`。
    - i18n：`image.adjust.hueSaturation.{range,master,reds,yellows,greens,cyans,blues,magentas,hue,saturation,lightness,colorize}`。
    - 測試：`src/image-editor/adjust/panels/hue-saturation-panel.test.tsx`（`fakeApi`）：選「紅」改色相 30 → 交錯陣列裡紅的物件 `hue` 變了、其他色域不變、陣列順序不變；「全部」改的是頂層欄位；「上色」切換記一步；拖曳中不記、放開記一步。
    - verify：`pnpm test src/image-editor/adjust/panels && pnpm check`
    - commit：`feat(image-adjustments-effects): add hue/saturation panel`

11. **效果面板、`fx` 標記與右鍵項目。**
    - 新 `src/image-editor/effects/commands.ts`：`setEffects(id: LayerId, effects: LayerEffects | undefined): Command`（`undefined` 時刪掉 `effects` 欄位）。
    - 新 `src/image-editor/effects/clipboard.ts`：`copyEffects(e: LayerEffects): void`、`copiedEffects(): LayerEffects | null`（模組層級，存 `structuredClone`）。
    - 新 `src/image-editor/effects/focus.ts`：`focusEffects(id: LayerId | null): void`、`useEffectsFocus(): LayerId | null`（模組層級變數 + `useSyncExternalStore`）。
    - 新 `src/image-editor/effects/panel.tsx`：`EffectsPanel({ api, layer }: { api: EditorApi; layer: Layer })`（`PropertyPanelSpec.component` 的形狀）：`<section className="fv-ie-adj-effects" aria-label={t("image.effects.open")}>`；`useEffectsFocus()` 等於 `layer.id` 時，section 的 ref callback 把它 `scrollIntoView({ block: "nearest" })`、焦點移到第一個 `Switch`，再 `focusEffects(null)`；六列（`EFFECT_NAMES`，`src/image-editor/effects/defaults.ts`），每列一個 `Switch`（開 = 該效果存在且 `enabled !== false`；第一次開時用 `defaultEffect(name)` 補上；關 = `enabled: false`，參數保留）與展開按鈕；展開後依欄位畫 `Slider`（範圍 `EFFECT_RANGES`）、`<input type="color">`、筆畫位置用 `Select`（內 / 外）。Slider 的 `onValueChange` → `api.dispatch(setEffects(id, 新效果))` 不帶 label、`onValueCommitted` → 同一個命令帶 `"image.effects.change"`；Switch、Select 與色塊的 `change` 直接帶 label，色塊的 `input` 不帶。
    - 改 `src/image-editor/adjust/badge.tsx`：`LayerBadge` 對每一層：`layer.effects` 有任何效果時多畫一個文字 `fx` 的 `Button`（`aria-label` = `image.effects.open`）→ `api.setSession({ active: layer.id })` 再 `focusEffects(layer.id)`（`src/image-editor/effects/focus.ts`）；調整圖層的部分不變。
    - 新 `src/image-editor/effects/menu.ts`：`registerEffectsUi(): void`：`registerPropertyPanel({ id: "image.effects", order: 200, when: (layer) => !layer.isGroup && layer.adjustment === undefined, component: EffectsPanel })`（`src/image-editor/registry.ts`）；`registerMenuItem` 四項，`menu: "layer-context"`、`order` 200–203：`image.effects.open`（run：`focusEffects(active)`；若 active 的祖先資料夾在 `session().collapsed` 裡，先 `setSession` 把它們移出）、`image.effects.copy`（`copyEffects`）、`image.effects.paste`（`api.dispatch(setEffects(active, copiedEffects()), "image.effects.paste")`）、`image.effects.clear`（`setEffects(active, undefined)`，label `"image.effects.clear"`）；`enabled`：active 存在、不是資料夾、不是調整圖層；copy / clear 另要有 `effects`；paste 另要 `copiedEffects()` 非 null。
    - 改 `src/image-editor/adjust/install.ts`：`registerAdjust` 加一行 `registerEffectsUi();`（import `../effects/menu`）。
    - i18n：`image.effects.{open,copy,paste,clear,change,enabled,expand}`、`image.effects.<EffectName>`（en：Stroke、Drop Shadow、Color Overlay、Inner Shadow、Outer Glow、Inner Glow；zh-TW：筆畫、陰影、顏色覆蓋、內陰影、外光暈、內光暈）、各效果欄位 `image.effects.<EffectName>.<欄位>`、`image.effects.stroke.{inside,outside}`。
    - 測試：`src/image-editor/effects/panel.test.tsx`（`fakeApi`，`src/image-editor/adjust/test/fake-api.ts`）：打開外光暈 Switch 補上預設值並記一步；拖尺寸 Slider 中不記、放開記一步 `"image.effects.change"`；關掉陰影後 `enabled === false` 且其他參數還在；`src/image-editor/effects/menu.browser.test.tsx`（`resetRegistry()`、`registerAdjust()`、`mountEditor`）：選到 A 層時屬性欄有效果面板、選到調整圖層與資料夾時沒有；右鍵「效果…」後焦點在效果面板的第一個 Switch；在 A 層的效果面板設筆畫、右鍵拷貝、選 B 層貼上後兩層 `effects` 深度相同；清除後 B 沒有 `effects` 欄位；圖層列出現 `fx`，停用全部效果後 `fx` 仍在；調整圖層上四項都 disabled。
    - verify：`pnpm test src/image-editor/effects && pnpm test:browser src/image-editor/effects/menu.browser.test.tsx && pnpm check`
    - commit：`feat(image-adjustments-effects): add layer effects panel, fx badge and context menu`

12. **存檔往返與整體驗收。**
    - 新 `src/image-editor/adjust/roundtrip.browser.test.ts`：`resetRegistry()`、`registerAdjust()`（`src/image-editor/adjust/install.ts`）；`makeDoc` 一張 64 × 64、一層一般圖層，`mountEditor`；用 `addAdjustmentLayer` 與 `setAdjustment`（`src/image-editor/adjust/commands.ts`）經 `api.dispatch(…, "image.adjust.change")` 加 12 種調整、各一組非預設值；一般圖層用 `setEffects`（`src/image-editor/effects/commands.ts`）設六種效果、各一組非預設值；`validateLikeCompositor(api.doc().manifest)`（`src/comp/index.ts`）回 `[]`；`writeProject({ manifest, assets })`（assets 放一般圖層的 PNG：`api.readRegion` 讀回後用 `src/comp/index.ts` 的 `encodePng` 編）→ `readProject(new Uint8Array(await blob.arrayBuffer()))` 讀回，每層的 `adjustment` 與 `effects` 深度相同；`store.undo()` 走到底再 `store.redo()` 走回來，`store.get().manifest` 與 undo 前深度相同。
    - verify：`pnpm test src/image-editor && pnpm test:browser src/image-editor && pnpm check`
    - commit：`test(image-adjustments-effects): add save and reload roundtrip for all adjustments and effects`

phase 結尾 verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check && pnpm build`（`pnpm build` 跑 `scripts/check-entry-deps.mjs`，確認 `dist/index.js` 的入口檢查仍過）。之後本機 `pnpm site:dev` 啟動讓 CEO 自己開 playground 試（亮暗兩種），不做截圖迴圈。

## 之後再做

- Hue/Saturation 色域邊界（falloff 帶）的拖曳編輯
- Camera Raw 濾鏡（`AdjustPixels.c` 的 `adjust_camera_raw*`，可照抄）
- Compositor 沒有、Photoshop 有的調整（亮度 / 對比、自然飽和度、選取顏色、相片濾鏡）與效果（斜角浮雕、漸層覆蓋、置中筆畫）：等 Compositor 格式有對應欄位，或另寫一份私有擴充的格式決策
- 調整與效果的 WebGPU 版本（跟 10 的 GL 層一起換）
