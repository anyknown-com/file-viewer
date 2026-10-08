# 13 image-text-shapes — 影像編輯器的文字圖層與形狀圖層

狀態：planned（2026-10-08）；blocker：10 image-editor Phase 01 第 1 到 3 步（文件模型、合成器與 storage 13 §5 的介面）、09 comp-format（manifest 型別的 `text` / `shape` 欄位、`validateLikeCompositor`）；model：opus（Phase 01）、sonnet（Phase 02、03）；與 11、12 平行；push：做完一次。來源：storage `docs/plans/20-image-text-shapes.md`（設計照搬，宿主與 e2e 走查段落拿掉）。

## 判斷

- 文字工具（`T`）與形狀工具（`U`）做出來的是「像素圖層 + 可再編輯的資料」，跟 Compositor 一樣：PNG 是顯示與匯出用的成品，`text` / `shape` 讓它之後還能改字、改色、改大小而不糊。10 不需要本份就畫得出這種圖層（它就是一張 PNG）；本份負責產生與重畫那張 PNG，以及編輯介面。
- 欄位以 09 的 manifest 型別為準（照 Compositor `Document/TypeTool.swift`、`Document/ShapeTool.swift`）。
- 文字：`content`（≤ 100,000 個 UTF-16 單位）、`fontName`（PostScript 名稱）、`fontSize`（1–2000 px）、`red` / `green` / `blue`（0–1）、`alignment`（Left / Center / Right）、`tracking`（−100–1000 px，每個字後面加這麼多，同 Compositor 當 `.kern` 用）、`leading`（0–5000 px，0 = 自動 = 字級的 120%）、選填 `boxSize`（段落框，每邊 16–30,000）、`colorRuns`、`fontRuns`。run 的 `location` / `length` 是 UTF-16 單位，JS 字串本來就是，不用轉。
- 字型 v1 只有 Geist（`@fontsource-variable/geist`，同源自架，CSP 不用改；加進本套件 dependencies，00-overview §4 的清單沒列，見回報）。編輯器自己 import 它的 CSS，字型隨 `./image-editor` 的 chunk 走。字重用 PostScript 名稱寫進檔：`Geist-Thin`、`Geist-ExtraLight`、`Geist-Light`、`Geist-Regular`、`Geist-Medium`、`Geist-SemiBold`、`Geist-Bold`、`Geist-ExtraBold`、`Geist-Black`，對到可變字型 wght 100–900。裝了 Geist 的 Mac 上 Compositor 用同一名稱找得到字型。
- 打開的文字圖層用我們沒有的字型（例如 Compositor 存的 `Helvetica-Bold`）：照常顯示它的 PNG；開始編輯時先出 Base UI AlertDialog「這裡沒有「Helvetica-Bold」，編輯後會換成 Geist」，確定才換。
- 排版是純函式，量字寬的函式由外面傳入，測試用假的：
  - 留白照 Compositor（`TypeTool.swift` 的 `padding` = 12）：字畫在 (12, 12)，段落框斷行寬度 = 框寬 − 24；點文字的 PNG 大小 = 量到的寬 + 24 + 0.1 × `fontSize`、量到的高（至少一行高）+ 24，兩邊至少 16 px。
  - 先依 `\n` 分段；有 `boxSize` 時在框寬 − 24 內斷行（`Intl.Segmenter` 的 word 斷點，CJK 逐字可斷，單字比框寬長時逐字斷）；沒有 `boxSize` 就是點文字，只在 `\n` 換行。
  - 字距用 `ctx.letterSpacing = "<tracking>px"`，量寬與畫字都整段字串一起做，不逐字放（逐字 `fillText` 會打斷阿拉伯文、印度文的連字）。沒有 `ctx.letterSpacing` 的舊瀏覽器 tracking 當 0，屬性欄說明。
  - 行高 = `leading`，0 時 1.2 × `fontSize`；對齊在框寬（點文字則最寬那行）內左 / 中 / 右；一行裡有不同字型的 run 時分段量、分段畫。
- 畫成 PNG：`OffscreenCanvas` 2D，畫布大小依上面的留白規則，每個 run 用自己的字型與顏色 `fillText`；圖層的 `transform.size` 設成這個大小；使用者之後縮放圖層，PNG 跟著拉伸（同 Compositor），改字時才在新的框裡重畫。PNG 編碼不在本份：圖層像素經 10 的 `writeRegion` 進圖層，存檔時 10 的存檔流程用 09 的 PNG 編碼器編成 `imageFile`。
- 編輯介面：畫布上方疊 `contenteditable` 的 `div`，CSS transform 對齊圖層的位置、角度、縮放，字型、大小、行高、字距、對齊跟圖層一樣；編輯中隱藏該圖層的 GL 畫面。選取部分文字後在屬性欄改顏色或字重，產生 / 合併 `colorRuns` / `fontRuns`。Esc 或點畫布外結束編輯，這時排版、畫 PNG、`commit` 一步 undo。只允許純文字與我們自己的 `span`，貼上只取 `text/plain`，不用 `dangerouslySetInnerHTML`。
- 文字工具：點一下建點文字，拖曳建段落框；點到既有文字圖層進入編輯。段落框的八個把手改框大小（重排、不縮放字）；一般變形（10 的 `⌘T`）才是縮放。文字可當剪裁的底，也能加 12 的效果。
- 形狀：`kind`（Rectangle / Ellipse / Line）、`red` / `green` / `blue`、`cornerRadius`（文件 px，矩形用，> 0 即圓角矩形）、選填 `lineWidth` 與 `start` / `end`（線的兩端，以圖層外框的比例表示）。拖曳畫外框，Shift 鎖正方形 / 正圓 / 45° 線，Alt 從中心拉。要外框線就加 12 的「筆畫」效果（Compositor 的形狀也沒有自己的外框）。被 10 的變形縮放後以新大小乾淨重畫；旋轉與翻轉由 transform 負責、不重畫。
- 不做：更多字型、直排、路徑文字、箭頭與其他形狀（見「之後再做」）。

## 契約

只加不改 00-overview §3。

- 沒有新的公開 export 或型別（全部在 `./image-editor` 內部）。`Messages` 加 key：`imageEditor.text.*`（工具名、字重九個名稱、大小、顏色、對齊三個、字距、行距、行距「自動」、缺字型對話框標題與內文、「舊瀏覽器不支援字距」）、`imageEditor.shape.*`（種類三個、顏色、圓角、線寬）；`en` 與 `zh-TW` 同時加。
- 對 10 註冊：`registerTool({ id: "text", key: "T", … })`、`registerTool({ id: "shape", key: "U", … })`。
- 假設 09 提供（從 `../comp` 匯入）：`TextSpec`、`ShapeSpec`（zod schema 與型別，欄位如上）、`validateLikeCompositor`。
- 假設 10 提供（storage 13 §5）：`dispatch`、`commit(label, doc, rasterTiles)`、`writeRegion`、`registerTool`，工具的 `panel` 與 `drawOverlay`，圖層縮圖的繪製點，以及 `primitives/` 的 AlertDialog。
- 假設 11 在像素工具改到有 `shape` 的圖層前會先問、確定後丟掉 `shape`；本份不處理。

## 形式

- 工具列加文字（`T`）與形狀（`U`）。
- 文字屬性欄：字重選單（九個名稱）、大小、顏色、對齊三顆、字距、行距（「自動」或數值）；編輯中選了部分文字時，顏色與字重只套在選取那段。
- 形狀屬性欄：種類三顆、顏色、圓角（矩形）、線寬（線）。
- 圖層面板：文字圖層的縮圖換成「T」圖示加內容前幾個字，形狀圖層換成形狀圖示（同 Compositor）。

## Phase 01 — 文字圖層

blocker：10 Phase 01 第 1 到 3 步、09；model：opus。

1. 排版與 run。新 `src/image-editor/text/layout.ts`、`text/runs.ts`（run 的切割、合併、插入刪除字時的位移；規則照 Compositor：排序、不重疊、長度 > 0、不超出內容）。測試：`src/image-editor/text/layout.test.ts`、`runs.test.ts`（node，假的等寬量字函式）：框內斷行、單字比框寬時逐字斷、CJK 逐字斷、`\n` 換行、點文字不斷行；量字函式照 `letterSpacing` 語意每字多算 tracking，斷行時算進去；leading 0 = 1.2 倍；三種對齊；在 run 前、中、後插入與刪除字時位移正確、刪光的 run 消失；含 emoji（surrogate pair）時 UTF-16 位置正確。verify：`pnpm test src/image-editor/text`。commit：`feat(image-text-shapes): lay out text and track style runs`
2. 字型與畫成像素。`pnpm add @fontsource-variable/geist`；新 `text/fonts.ts`（PostScript 名稱與 wght 對照、缺字型判斷、import Geist 的 CSS）、`text/render.ts`（`OffscreenCanvas` 2D，輸出 `ImageData` 與 `transform.size`）。測試：`text/fonts.test.ts`（對照表、`Helvetica-Bold` 判為缺）；`text/render.test.ts`（browser 模式）：點文字大小符合留白公式、段落框畫布 = 框、紅色 run 的像素確實是紅、一段阿拉伯文在 tracking 0 時，整段單次 `fillText` 的墨跡寬度等於 `measureText` 的寬度（證明沒有逐字放）。verify：`pnpm test:browser src/image-editor/text/render.test.ts && pnpm check`。commit：`feat(image-text-shapes): render text layers to pixels with Geist`
3. 文字圖層的資料與 undo。新 `text/layer.ts`：由 `TextSpec` 建圖層命令、改字 / 改屬性時重排重畫、寫回像素、`commit` 一步。測試：`text/layer.test.ts`：建出的 `text` 欄位通過 `TextSpec` schema，整份文件過 `validateLikeCompositor`；改框寬後 `transform.size` 更新；undo / redo 回到同一份文件；開一個 `Helvetica-Bold` 的文字圖層，在未確認換字型前不重畫、像素不變。verify：`pnpm test src/image-editor/text/layer.test.ts`。commit：`feat(image-text-shapes): create and re-render text layers`
4. 文字工具與編輯介面。新 `text/type-tool.ts`（`registerTool`、點 / 拖曳建立、八個把手的 `drawOverlay`）、`text/editor.tsx`（`contenteditable` 疊層，ref callback 掛載，不用 `useEffect`）、`text/panel.tsx`（屬性欄）、缺字型 AlertDialog；`en.ts` / `zh-TW.ts` 加 `imageEditor.text.*`。測試：`text/editor.test.tsx`（jsdom）：貼上帶格式的 HTML 只留下純文字；選取一段改色產生 `colorRuns`、改 Bold 產生 `fontRuns`；Esc 結束編輯並只記一步 undo；缺字型時先出對話框、取消則不換。verify：`pnpm test src/image-editor/text && pnpm check`。commit：`feat(image-text-shapes): add the text tool and editing overlay`

phase 結尾的 verify：`pnpm test src/image-editor && pnpm test:browser src/image-editor/text && pnpm check`。

## Phase 02 — 形狀圖層

blocker：Phase 01 第 3 步（`layer.ts` 的命令寫法）；model：sonnet。

5. 形狀畫成像素。新 `src/image-editor/shapes/render.ts`（Canvas 2D 依 `transform.size` 畫矩形、圓角矩形、橢圓、線；純函式部分：外框計算、Shift / Alt 約束、線的 `start` / `end` 比例）、`shapes/layer.ts`（建圖層命令、縮放後重畫、`commit`）。測試：`shapes/render.test.ts`（node）：外框、Shift 正方形 / 正圓 / 45°、Alt 從中心、`start` / `end` 比例；`shapes/layer.test.ts`：`shape` 欄位通過 `ShapeSpec`、整份文件過 `validateLikeCompositor`、縮放後以新大小重畫、旋轉不重畫；`shapes/render.browser.test.ts`（browser 模式）：放大兩倍重畫後的邊緣像素是清晰的（邊緣只有一個像素寬的半透明過渡，不是拉伸的 PNG）。verify：`pnpm test src/image-editor/shapes && pnpm test:browser src/image-editor/shapes`。commit：`feat(image-text-shapes): render shape layers`
6. 形狀工具與屬性欄。新 `shapes/shape-tool.ts`（`registerTool`、拖曳畫外框、`drawOverlay`）、`shapes/panel.tsx`（種類三顆、顏色、圓角、線寬）；`en.ts` / `zh-TW.ts` 加 `imageEditor.shape.*`。測試：`shapes/shape-tool.test.ts`（jsdom）：拖曳建立三種形狀；選到形狀圖層改種類、顏色、圓角、線寬後 `shape` 欄位與像素都更新、各記一步 undo。verify：`pnpm test src/image-editor/shapes && pnpm check`。commit：`feat(image-text-shapes): add the shape tool and panel`

phase 結尾的 verify：`pnpm test src/image-editor && pnpm check`。

## Phase 03 — 圖層縮圖與整合

blocker：Phase 01、Phase 02；model：sonnet。

7. 圖層縮圖。新 `src/image-editor/ui/layers/text-thumb.tsx`、`shape-thumb.tsx`，掛到 10 的圖層列縮圖點：文字圖層顯示「T」圖示加內容前幾個字，形狀圖層顯示對應種類的圖示。測試：`ui/layers/thumbs.test.tsx`（jsdom）：文字圖層縮圖含內容前幾個字（含 CJK 與 emoji 不截斷在 surrogate 中間）、三種形狀各顯示自己的圖示、無 `text` / `shape` 的圖層仍用原縮圖。verify：`pnpm test src/image-editor/ui/layers`。commit：`feat(image-text-shapes): show text and shape thumbnails in the layer list`
8. 整合測試。新 `src/image-editor/text/story.browser.test.ts`（browser 模式，GL 實測）：建兩層（背景圖、一個段落框的中英混合兩行字）→ 一個詞改色、一個詞改 Bold → 改框寬看到重排 → 加圓角矩形放在字後面、字設成剪裁在矩形上 → 用 09 的寫入器存成 `.comp.zip`、讀回，文字與 run 都在、`validateLikeCompositor` 通過、可再編輯字 → 用 10 的合成器匯出，字只出現在矩形不透明處。verify：`pnpm test:browser src/image-editor/text/story.browser.test.ts && pnpm test && pnpm check`。commit：`test(image-text-shapes): cover text and shape layers end to end`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check && pnpm build`。

## 之後再做

- 更多字型（自架的開源字型，含一套 CJK 字型；中文字型檔很大，要做子集或按需載入）。
- 直排文字、路徑文字、文字外框以外的樣式。
- 箭頭與其他形狀（Compositor 格式存不下，要做就是普通像素圖層）。
- 讀使用者的本機字型（Local Font Access）與任何外站字型：不做，字型只用同源自架的。
- 宿主的存檔、撞名與入口：H1 Phase 3。
