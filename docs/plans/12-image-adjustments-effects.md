# 12 image-adjustments-effects — 12 種調整圖層與 6 種圖層效果，全部能畫、能改、能存

狀態：planned（2026-10-08）；blocker：10 image-editor 的第 1–3 步（合成器與 `registerAdjustment` / `registerEffects`；Phase 03 另要 10 的圖層面板那一步）、09 comp-format 的 manifest 型別；model：Phase 01、02 opus，Phase 03 sonnet；push：整份做完一次。與 11、13 平行。

來源：`storage/docs/plans/19-image-adjustments-effects.md`（設計照搬；storage 那份標成已搬走由 H1 做）。目錄：`src/image-editor/adjust/`、`src/image-editor/effects/`、`src/image-editor/ui/`、`src/i18n/`。

## 判斷

- 範圍是 Compositor 格式裡每一種調整與效果。少一種，打開 Compositor 的檔就會走樣（storage 13 §2）。不加格式存不下的調整或效果欄位（09：存出來的檔都要是合法的 Compositor 專案）。
- 調整圖層是 manifest 裡帶 `adjustment`、沒有 `imageFile` 的圖層。它作用在下面累積結果的方式（遮色片、不透明度、混合模式、剪裁）由 10 的合成迴圈負責；本份只提供 `apply(adjustment, 下面的結果)`。
- 逐像素的種類一律烘成 LUT，shader 只查一次表（Compositor 的 GPU 畫面也這樣做）：
  - Levels、Curves、Exposure：每通道 256 格 1D LUT（先 RGB 總表，再紅綠藍各自）。Levels 照 `Document/Levels.swift`；Curves 是單調 Hermite，照 `Document/Curves.swift`；Exposure 照 `Document/ImageAdjustments.swift`（線性光裡算 exposure / offset / gamma，前後做 sRGB 轉換）。
  - Hue/Saturation、Gradient Map、Black & White、Color Balance、Invert：33 × 33 × 33 的 3D LUT（WebGL2 3D texture，RGBA16F，LINEAR 三線性取樣）。Hue/Saturation 的 HSL 數學照 `Document/HueSaturation.swift`（含 `hsvSettings` 各色域與 falloff 帶，09 保留的交錯陣列在這裡解讀）；其餘三種照 `Rendering/AdjustPixels.c` 的 `adjust_gradient_map`、`adjust_black_white`、`adjust_color_balance` 改寫成 TS。
  - 設定改變時在主執行緒重算 LUT（3D 是 35,937 點，幾毫秒），存在該圖層的快取。
- 跟位置有關、不能查表的寫成 shader：
  - Grain、Add Noise：照 `Rendering/GPUNoise.swift` 的 MSL `add_grain`、`add_noise`（移植自 `NoisePixels.c` 與 `AdjustPixels.c` 的 `adjust_grain`）改寫成 GLSL。`seed` 存在 manifest，每次打開圖樣相同；雜訊以文件座標取樣，縮放畫面時圖樣不變。
  - Gaussian Blur：可分離兩趟，σ 就是 `blurRadius`（文件 px，Compositor 的 GPU 畫面也沒另外換算）；模糊會擴散到圖層邊緣外。
  - Motion Blur：沿 `motionAngle`、在全長 `motionDistance` 的線段上等權取樣（Photoshop 語意：均勻拖影）。Compositor 用 `CIMotionBlur` 近似（半徑 distance / √12，角度取負號，因為 Core Image 的 y 朝上）；我們直接做均勻取樣，角度方向照它換算後的結果，用 fixture 對照。
  - 模糊在畫面上依縮放縮小 σ 與距離，匯出用原尺寸；各自回報 `reach`（高斯 3σ、動態模糊半個距離）給 10 的分塊匯出。
- Levels 的直方圖與「自動」：從下面合成好的結果讀回長邊 512 的縮小版算直方圖；「自動」照 `Document/LevelsAutomatic.swift`。
- 效果六種各自可停用：筆畫（尺寸、顏色、不透明度、內 / 外）、陰影、顏色覆蓋、內陰影、外光暈、內光暈。單位是圖層像素；效果沒有混合模式（格式沒這欄）。演算法照抄 `Rendering/MetalLayerEffects.swift` 的 kernel（`effects_alpha`、`effects_spread_rows`、`effects_spread_columns`、`effects_ring`、`effects_shift`、`effects_blur_rows`、`effects_blur_columns`、`effects_inside`、`effects_compose`），compute kernel 改成 WebGL2 fragment pass：
  - 筆畫：alpha 先列後欄的方形 max 濾波（內側用 min）再減原形狀，轉角是方的，沒有置中筆畫。
  - 陰影：alpha 依角度與距離位移（雙線性），σ = 模糊 / 2 的可分離高斯，填色畫在圖層後面。外光暈：σ = 尺寸 / 2 的高斯 ×（1 − alpha）。內陰影：alpha ×（1 − 位移後 alpha 的高斯）。內光暈：alpha ×（1 − alpha 的高斯）。顏色覆蓋：alpha × 顏色，蓋在圖層上。合成順序與 Normal 疊法照 `effects_compose`。
  - 在圖層自己的像素空間算，輸出是「圖層尺寸 + 兩倍 reach」的 texture，再經圖層 transform 合進去；reach = 陰影距離 + 3σ、光暈 3σ、筆畫尺寸。畫面上照 `EffectsPreviewCache.swift` 限制預覽解析度：長邊 = clamp(√(16.7M / 有效果的圖層數), 32, 1536) px，參數同比例縮放，圖層像素與設定沒變就重用快取；匯出走原尺寸。
- 顏色挑選用原生 `<input type="color">`（不另做挑選器；11 若做了，那是 11 的事，不回頭換）。
- 不做：Hue/Saturation 色域邊界的拖曳編輯（數值照讀照存照畫）、Compositor 沒有的調整或效果（見「之後再做」）。
- 抄進來的檔頭寫：`Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, <原路徑>), MIT, Copyright (c) 2026 Wonder Assembly LLC`；`THIRD_PARTY_NOTICES.md` 的 Compositor 條目由 01 / 09 建好，本份不改。Compositor 的 `AdjustmentLayerTests.swift`、`LevelsTests.swift`、`HueSaturationTests.swift`、`ImageAdjustmentTests.swift`、`InnerGlowTests.swift`、`OuterGlowTests.swift` 裡跟數值有關的案例改寫成 vitest。

## 契約

不新增任何 subpath export；全部在 `./image-editor` 內部。

- 型別：調整與效果的欄位、範圍、預設值一律用 09 `./comp` 的 manifest 型別，本份只在 `adjust/settings.ts`、`effects/defaults.ts` 放預設值，不另定型別。
- 對 10 的掛勾（storage 13 §5，10 第 1–3 步定下，只加不改）：
  - `registerAdjustment(kind, { lut?(settings), pass?(gl, src, dst, settings), reach(settings) })`：12 種都註冊（8 種給 `lut`、4 種給 `pass`）。
  - `registerEffects({ pass(gl, layer, src, dst), reach(effects) })`。
  - 用到的像素介面：`layerTexture(id)`、`maskTexture(id)`；命令介面：`dispatch(command)`、`commit(label, doc, rasterTiles)`。
- i18n key（加進 `src/i18n/en.ts`、`zh-TW.ts`，形狀由 02 定）：`imageEditor.adjust.<kind>.*`（`<kind>` 為 12 種的 manifest 名）、`imageEditor.adjust.add`、`imageEditor.adjust.reset`、`imageEditor.effects.<effect>.*`（6 種）、`imageEditor.effects.{open,copy,paste,clear}`。
- 錯誤碼：不加。`webgl_unavailable` 由 10 處理。

## 形式

- 圖層面板下方多一顆「新增調整圖層」（半黑半白圓的圖示），選單依 Compositor 的順序列 12 種；新圖層放在目前圖層上方，有選取範圍就用它當遮色片。
- 選到調整圖層時，屬性欄是它的面板：
  - Levels：通道選單、直方圖、輸入黑 / 灰 / 白三個把手與數字、輸出黑白兩個把手、「自動」。
  - Curves：通道選單、256 × 256 曲線格、點擊加點、拖出格外刪點（2–32 點）、選到的點可輸入數值。
  - Hue/Saturation：色域選單（全部、紅、黃、綠、青、藍、洋紅）、色相 / 飽和度 / 明度滑桿、「上色」。
  - 其他種類：依各自設定欄位用 Slider、色塊、Switch，標籤用 Photoshop 的叫法。
  - 每個面板底部「重設」。拖滑桿即時預覽，放開才記一步 undo。
- 效果：圖層右鍵「效果…」或屬性欄的「fx」按鈕開效果面板，六種各一列（勾選啟用 + 展開參數）。圖層列顯示 `fx`，展開後列出每個效果並各有眼睛（隱藏的效果保留參數、仍列在圖層下面，同 Compositor）。右鍵「拷貝效果」「貼上效果」「清除效果」。

## Phase 01 — 調整圖層

blocker：09（manifest 型別）、10 第 1–3 步；model：opus。本 phase 的 GL 測試用 `pnpm test:browser`（Chromium 的真 WebGL2），取代 storage 的 dev-only 自我測試頁。

1. 1D LUT 的數學：`src/image-editor/adjust/levels.ts`（含 `LevelsAutomatic` 與由像素算直方圖的純函式）、`curves.ts`、`exposure.ts`、`settings.ts`（12 種預設值）。對照 fixture 由 `scripts/gen-adjust-fixtures.sh <Compositor 路徑>` 產生：本機 `cc` 編 `Rendering/LevelsPixels.c`，對一組固定設定與 256 階輸入輸出 JSON 到 `src/image-editor/adjust/__fixtures__/`；JSON 進 repo，CI 不需要 `cc`。測試：`adjust/levels.test.ts`、`curves.test.ts`、`exposure.test.ts`（改寫自 Compositor 測試的數值案例；與 C fixture 逐值相差 ≤ 1；Curves 輸入遞增輸出不遞減）。verify：`pnpm test src/image-editor/adjust`。commit：`feat(image-adjustments-effects): add levels, curves and exposure LUT math`
2. 3D LUT 的數學：`adjust/hue-saturation.ts`、`hue-saturation-bands.ts`（色域與 falloff 帶，拆兩檔守 300 行）、`color-lut.ts`（gradient map、black & white、color balance、invert，輸出 33³ 格點）；擴充 `scripts/gen-adjust-fixtures.sh` 編 `AdjustPixels.c` 產生對照。測試：`adjust/hue-saturation.test.ts`、`color-lut.test.ts`（TS 與 C fixture 逐像素相差 ≤ 1；`hsvSettings` 交錯陣列順序打亂後解讀結果相同）。verify：`pnpm test src/image-editor/adjust`。commit：`feat(image-adjustments-effects): add 3D LUT math for color adjustments`
3. 把 8 種逐像素調整接上 GL：`adjust/lut.glsl.ts`（1D 與 3D 查表 shader、RGBA16F 3D texture 上傳）、`adjust/register.ts`（`registerAdjustment` 8 種，LUT 快取在圖層上，設定變了才重算）。測試：`adjust/lut.browser.test.ts`（LUT 查表 vs CPU 直接算，誤差 ≤ 2/255，這是 33³ 三線性內插的誤差）。verify：`pnpm test:browser src/image-editor/adjust/lut.browser.test.ts`。commit：`feat(image-adjustments-effects): register per-pixel adjustment layers`
4. 雜訊類：`adjust/noise.glsl.ts`（`add_noise`）、`grain.glsl.ts`（`add_grain`），在 `register.ts` 註冊 Grain 與 Add Noise。測試：`adjust/noise.browser.test.ts`（同 `seed` 兩次渲染逐位元相同、換 seed 不同；平移或縮放畫面時以文件座標取樣的圖樣不變）。verify：`pnpm test:browser src/image-editor/adjust/noise.browser.test.ts`。commit：`feat(image-adjustments-effects): add grain and noise adjustments`
5. 模糊類：`adjust/blur.glsl.ts`（高斯兩趟、動態模糊均勻取樣）、`adjust/reach.ts`，註冊最後 2 種。測試：`adjust/blur.browser.test.ts`（分塊匯出與整張匯出逐像素相同，證明 reach 足夠；動態模糊 0° 時垂直方向沒有擴散；高斯 σ 對一個單像素點的輸出對照 CPU 高斯，誤差 ≤ 2/255）。本步另放 `src/image-editor/__fixtures__/adjustments.comp.zip`（Compositor 存、Finder 壓縮，含 12 種調整圖層）與一個 `adjustments.browser.test.ts`：用 09 的讀取器打開並渲染，12 種都有輸出且不報錯，渲染圖寫到 scratchpad 供與 `QuickLook/Preview.jpg` 目視比對；沒有 Compositor 的環境就在回報寫一行「fixture 未驗」。verify：`pnpm test:browser src/image-editor/adjust`。commit：`feat(image-adjustments-effects): add gaussian and motion blur adjustments`

phase 結尾 verify：`pnpm test src/image-editor && pnpm test:browser src/image-editor/adjust && pnpm check`

## Phase 02 — 圖層效果

blocker：Phase 01 不必先完成，但同樣要 10 第 1–3 步；model：opus。

6. effects 的 pass 與預設值：`effects/defaults.ts`（預設值與範圍，照 `Document/LayerEffects.swift`）、`effects/passes.glsl.ts` 與 `effects/passes-blur.glsl.ts`（`effects_alpha`、`spread_rows/columns`、`ring`、`shift`、`blur_rows/columns`、`inside`、`compose` 的 GLSL，依 300 行上限拆檔）。測試：`effects/passes.browser.test.ts`：100 × 100 不透明方塊，筆畫外 10 px 後 alpha 覆蓋 120 × 120 且轉角是方的、內筆畫不超出原範圍；陰影位移方向與角度一致（Compositor 角度從右邊逆時針、預設 90，90° 往下）；外光暈在形狀內部為 0；內光暈與內陰影只出現在形狀內。verify：`pnpm test:browser src/image-editor/effects/passes.browser.test.ts`。commit：`feat(image-adjustments-effects): port layer effect passes to WebGL2`
7. pass 串接與註冊：`effects/render.ts`（pass 順序、padding = 兩倍 reach、預覽解析度與快取）、`effects/reach.ts`、`registerEffects`。測試：`effects/render.browser.test.ts`（停用的效果不影響畫面但參數仍在文件裡；含效果的圖層分塊匯出與整張匯出逐像素相同；圖層像素與設定都沒變時第二次渲染不重跑 pass；預覽解析度公式的邊界值 32 與 1536）；fixture `src/image-editor/__fixtures__/effects.comp.zip` 與 `effects.browser.test.ts`（同第 5 步的做法）。verify：`pnpm test:browser src/image-editor/effects`。commit：`feat(image-adjustments-effects): render layer effects with preview cache`

phase 結尾 verify：`pnpm test src/image-editor && pnpm test:browser src/image-editor/effects && pnpm check`

## Phase 03 — 面板

blocker：10 的圖層面板那一步（storage 13 第 4 步對應的 `ui/layers/`）、Phase 01、Phase 02；model：sonnet。

8. 調整面板與入口：`src/image-editor/adjust/panels/levels-panel.tsx`、`curves-panel.tsx`、`hue-saturation-panel.tsx`、`generic-panel.tsx`（其餘 9 種共用，依設定欄位產生）、圖層面板的「新增調整圖層」選單；元件用 `@base-ui/react`（Slider、Select、Switch、Menu），樣式加進 `styles.css`；i18n `imageEditor.adjust.*` 同時加 `en.ts` 與 `zh-TW.ts`。拖曳時即時預覽、放開才 `commit`。測試：`adjust/panels/panels.test.tsx`（jsdom：每種面板改一個值觸發一次 `commit`、「重設」回預設、Levels 與 Curves 只用鍵盤操作：Tab 到把手、方向鍵微調、Curves 選點後輸入數值）；02 的 en / zh-TW key 對齊測試要綠。verify：`pnpm test src/image-editor/adjust/panels src/i18n`。commit：`feat(image-adjustments-effects): add adjustment layer panels`
9. 效果面板與圖層列：`effects/panel.tsx`（六列、勾選、展開、原生色塊）、圖層列的 `fx` 與每個效果的眼睛、右鍵「效果…」「拷貝效果」「貼上效果」「清除效果」（`ui/layers/` 的 menu 加四項，不改其他項）；i18n `imageEditor.effects.*`。測試：`effects/panel.test.tsx`（改一個參數 `commit` 一次；拷貝貼上到另一層後兩層設定相同；清除後 `effects` 為空；隱藏效果後參數仍在）。verify：`pnpm test src/image-editor/effects src/i18n`。commit：`feat(image-adjustments-effects): add layer effects panel and fx row`
10. 存檔往返與整體驗收：`src/image-editor/adjust/roundtrip.browser.test.ts`：12 種調整各設一組非預設值、6 種效果各設一組、經 10 的存檔寫成 `.comp.zip`、再用 09 讀回，所有數值相同，且 09 的 `validateLikeCompositor` 通過；undo / redo 各走一輪回到同一份文件。verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check`。commit：`test(image-adjustments-effects): add save and reload roundtrip for all adjustments and effects`

phase 結尾 verify：全模組測試 + `pnpm check`。接著 `pnpm build` 確認 `dist/index.js` 的入口檢查（`scripts/check-entry-deps.mjs`）仍過，本機 `pnpm site:dev` 啟動讓 CEO 自己開 playground 試（亮暗兩種），不做截圖迴圈。

## 之後再做

- Hue/Saturation 色域邊界（falloff 帶）的拖曳編輯
- Camera Raw 濾鏡（`AdjustPixels.c` 的 `adjust_camera_raw*`，可照抄）
- Compositor 沒有、Photoshop 有的調整（亮度 / 對比、自然飽和度、選取顏色、相片濾鏡）與效果（斜角浮雕、漸層覆蓋、置中筆畫）：等 Compositor 格式有對應欄位，或另寫一份私有擴充的格式決策
- 調整與效果的 WebGPU 版本（跟 10 的 GL 層一起換）
