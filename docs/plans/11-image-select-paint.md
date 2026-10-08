# 11 image-select-paint — 影像編輯器的選取、繪圖、修補與遮蔽

狀態：planned（2026-10-08；選型沿用 storage 18，2026-10-05 CTO 定）；blocker：10 image-editor Phase 01 的前三步（文件模型與 undo、合成器、`registry.ts` 的工具 / 像素 / worker 介面，形狀照 storage 13 §5）；與 12、13 平行；model：見各 Phase。

這份從 storage `docs/plans/18-image-select-paint.md` 搬來，設計不重開。與 storage 18 不同的只有三點：路徑改成本 repo 的 `src/image-editor/`；互動元件由 shadcn 改成 `@base-ui/react`（Popover、ToggleGroup、AlertDialog）加 `--ak-*` plain CSS；遮蔽對話框裡「舊版在垃圾桶保留 N 天」那一句拿掉，那是宿主的事，寫給 H1（storage 22）。

接 10 的介面（假設 10 前三步已提供，符號名照 storage 13 §5）：

- `commit(label, doc, rasterTiles)` 記一步 undo；`dispatch(command)`。
- `layerTexture(id)`、`maskTexture(id)`、`writeRegion(id, target: "image" | "mask", rect, pixels)`、`readRegion(...)`，座標是圖層自己的像素座標。
- `registerTool({ id, key, icon, cursor, onPointerDown / Move / Up(docPoint, event), drawOverlay(ctx), panel? })`。
- `runInWorker(job, transfer)`，job 種類加進 `src/image-editor/worker/jobs.ts`。
- 選單項目與快捷鍵：加進 10 的 `ui/shortcuts.ts` 和選單定義（10 沒有註冊函式的話，10 第 1–3 步的收尾要補一個，見回報）。

## 判斷

- 範圍是 storage 13 §2 表裡標 18 的那一列：選取（矩形、橢圓、套索、多邊形套索、魔術棒）、選取範圍的運算、移動與複製像素、剪下拷貝貼上、筆刷與橡皮擦（圖層或遮色片）、仿製印章、污點修復、內容感知填色、漸層、滴管、遮蔽。選取主體 / 物件選取、塗抹液化、模糊工具、顏色範圍留到之後。
- 選取範圍是一張畫布大小的 R8 texture（255 = 全選），不是 Compositor `Selection.swift` 的向量路徑：魔術棒、羽化、擴張收縮、從圖層 alpha 載入本來就是像素運算，向量路徑要多一個多邊形布林函式庫和像素到路徑的描邊，兩邊來回轉。它算進 10 的遮色片像素預算。選取範圍是 session 狀態，不進文件、不進 `.comp.zip`（同 Compositor）。
- 演算法照 Compositor（@11d8d7a）抄，C 與 Metal 改寫成 TS 與 GLSL。C 檔不編 WASM：repo 沒有 C 工具鏈，三個 C 檔加起來約 560 行，都是單純的迴圈，TS 在 worker 裡跑夠快；量測下來太慢再編 WASM（宿主 CSP 已有 `wasm-unsafe-eval`，00-overview §3）。
- 內容感知填色是簡化版（沒有迭代、金字塔與投票，大洞效果普通）：v1 照抄，洞超過 4 MP 不給做，進度條可取消。
- 遮蔽作用在選取範圍碰到的每一個像素圖層，包含隱藏的層，文字與形狀圖層一併點陣化，不碰遮色片與調整圖層的設定。理由：圖層檔裡任何一層留著原始像素，遮蔽就沒有意義。
- 不做：本套件不碰宿主的剪貼簿以外的東西；系統剪貼簿只在使用者自己按拷貝 / 剪下時寫（`navigator.clipboard.write`，不支援時略過），不主動讀，只收使用者自己的 `paste` 事件。檔案下載、解密、上傳、垃圾桶、toast 都歸宿主（H1）。

## 契約

只加不改 00-overview §3；沒有新的 subpath、export、錯誤碼。`ImageEditor` 的 props 不變，全部工具走 10 的 `registerTool`，在 `./image-editor` chunk 內自行註冊。

- 檔案：`src/image-editor/tools/select/`、`tools/paint/`、`tools/heal/`、`tools/redact.ts`、`tools/eyedropper.ts`、`ui/color-picker.tsx`；`worker/jobs.ts` 加 job 種類 `wand`、`heal`、`contentFill`（輸入像素與參數，輸出像素；都收 `AbortSignal`，取消後畫面與文件沒有改變）。
- 快捷鍵：選取 `M`（`⇧M` 矩形 / 橢圓）、套索 `L`（`⇧L` 自由 / 多邊形）、魔術棒 `W`、移動 `V`、筆刷 `B`、橡皮擦 `E`、仿製 `S`、污點修復 `J`、漸層 `G`、滴管 `I`、筆刷大小 `[` `]`、硬度 `⇧[` `⇧]`；`⌘A` 全選、`⌘D` 取消、`⇧⌘D` 重新選取、`⇧⌘I` 反轉、`⌘C` `⇧⌘C` `⌘X` `⌘V`、`⇧F5` 填色、`X` 交換前景背景、`D` 回黑白、Delete 清除。
- i18n：只加 key，en 與 zh-TW 同步（`src/i18n/en.ts`、`zh-TW.ts`），前綴 `imageEditor.select.*`（工具名、運算模式、選單、屬性欄、魔術棒參數）、`imageEditor.paint.*`（筆刷、仿製、修補、漸層、顏色挑選器、點陣化確認、進度與取消、遮蔽對話框）。
- 抄來的檔頭：`Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, <原路徑>), MIT, Copyright (c) 2026 Wonder Assembly LLC`（格式同 10）。`THIRD_PARTY_NOTICES.md` 的 Compositor 條目 01 已建，本份不改。

## 形式

- 工具列（10 的左側）加：選取（矩形 / 橢圓）、套索（自由 / 多邊形）、魔術棒、筆刷、橡皮擦、仿製印章、污點修復、漸層、滴管；底部前景 / 背景兩個色塊。同一格多個工具時長按或右鍵展開。點色塊開顏色挑選器（HSV 方塊 + 色相條 + hex 輸入，Base UI Popover）。
- 屬性欄（10 的右上）依工具顯示：選取的運算模式（新、加 Shift、減 Alt、交集 Shift + Alt，四顆 ToggleGroup）與羽化；魔術棒的容許值（0–255，預設 32）、取樣大小（1、3×3、5×5）、連續、取樣目前圖層 / 全部圖層；筆刷的大小（1–2100 px）、硬度、不透明度、平滑；仿製的對齊與取樣來源；修補的模式；漸層的種類與色標。數字可拖曳標籤調整（同 10）。
- 筆刷游標是一個圈，大小跟著縮放；硬度低時畫兩圈（內圈是硬的部分）。仿製時另外顯示來源的十字。選取虛線在 10 的 overlay 層上，條紋隨時間移動。
- 選單「選取」：全選、取消、重新選取、反轉、擴張…、收縮…、羽化…、載入圖層透明度。選單「編輯」：剪下、拷貝、拷貝合併、貼上、填色…、清除。選單「影像」加「遮蔽選取範圍…」。
- 長時間的 worker 工作（內容感知、修補大區域、魔術棒在大圖）在畫布上方出進度條，可取消。
- 遮蔽對話框說明：遮蔽會改掉每一層的像素；存檔後新檔裡沒有原始像素；這不是模糊（模糊有機會還原）。用「儲存」取代原檔時舊版的去留由宿主決定（H1），對話框不承諾。

## Phase 01 — 選取範圍、移動與剪貼

blocker：10 Phase 01 前三步；model：sonnet。

1. 選取範圍的資料與 GPU 運算。新 `src/image-editor/tools/select/{mask.ts,morph.glsl.ts,ants.ts,load.ts}`：`mask.ts` 管 R8 texture 與四種運算（取代、max、`a × (1 − b)`、min）、全選、取消、重新選取、反轉；`morph.glsl.ts` 的擴張 / 收縮（十字與方形 3×3 交替，上限 500 px）與可分離高斯羽化（σ = 半徑 / 2，上限 250 px）；`ants.ts` 在 GL 裡從 R8 找出跨過 128 的邊界圖，交給 overlay 以 `(x + y + 時間)` 條紋畫虛線；`load.ts` 從圖層 alpha 或遮色片載入（`⌘` 點縮圖，配合 Shift / Alt 加減）。測試：`mask.test.ts`、`morph.test.ts`（node，純 TS 參考實作部分：運算的真值表、擴張 10 再收縮 10 回到原形在八角近似的誤差內、羽化 σ 與半徑的換算）；`selection-gl.browser.test.ts` 在 Chromium 讀回比對四種運算與羽化（誤差 ≤ 1/255）。verify：`pnpm test src/image-editor/tools/select && pnpm test:browser src/image-editor/tools/select`。commit：`feat(image-select-paint): add selection mask with gpu set operations, morphology and feather`
2. 矩形、橢圓、套索工具。新 `tools/select/{marquee.ts,lasso.ts}` 與 `ui/select-panel.tsx`（運算模式 ToggleGroup、羽化）；用 `registerTool` 註冊；矩形 / 橢圓 Shift 鎖正方 / 正圓、Alt 從中心拉、在選取範圍內拖曳是搬移選取框；套索點擊加點、雙擊或 Enter 封口、Backspace 刪最後一點、Esc 放棄，路徑在 GPU 上以 even-odd 填進 R8；選單「選取」全部項目與 `⌘A` `⌘D` `⇧⌘D` `⇧⌘I` 快捷鍵；i18n `imageEditor.select.*` 的工具、選單、屬性欄 key。測試：`lasso.test.ts`（even-odd 點在內外、多邊形加點刪點封口、Esc 放棄不留痕）、`marquee.test.ts`（Shift / Alt 的幾何）；`tools/select/select-tools.browser.test.tsx` 用 Pointer 事件在 Chromium 驅動各工具，Shift / Alt / Shift + Alt 的結果與 undo 都對。verify：`pnpm test src/image-editor/tools/select && pnpm test:browser src/image-editor/tools/select`。commit：`feat(image-select-paint): add marquee and lasso selection tools`
3. 魔術棒。新 `tools/select/wand.ts`（抄 `Rendering/WandPixels.c` 的 `wand_mask`：參考色是點擊處 (2r + 1)² 方塊的平均、每個通道含 alpha 都在容許值內才算符合、「連續」用 4 連通 flood fill；邊緣用一次 1 px 羽化反鋸齒）；`worker/jobs.ts` 加 `wand` job（取樣目前圖層用 `readRegion`，全部圖層用合成結果，結果寫進選取 texture）；屬性欄加魔術棒參數；大圖出進度條可取消。測試：`wand.test.ts` 改寫自 Compositor `MagicWandTests.swift` 的案例（容許值邊界、連續與不連續、alpha 也比對）。verify：`pnpm test src/image-editor/tools/select/wand`。commit：`feat(image-select-paint): add magic wand selection in worker`
4. 浮動選取與移動工具。新 `tools/select/floating.ts`（抄 `Document/FloatingSelection.swift`：選取的像素剪成浮動像素加一個 `LayerTransform`，可移動、縮放、旋轉，Enter 或換工具時合併回原層，Alt + 拖曳複製一份；合併走 `commit`）。測試：`floating.test.ts`（剪出、平移、旋轉後合併的像素位置、Alt 複製原層不動、合併後 undo 還原）。verify：`pnpm test src/image-editor/tools/select/floating`。commit：`feat(image-select-paint): add floating selection and move tool`
5. 剪貼與填色。新 `tools/select/clipboard.ts`：`⌘C` 拷貝目前圖層選取範圍內的像素、`⇧⌘C` 拷貝合併結果、`⌘X` 剪下、`⌘V` 貼上成新圖層放在原位置（沒有選取時 `⌘C` / `⌘V` 是整層複製貼上，同 Compositor）；剪貼簿本體在編輯器自己記憶體；同時在按鍵事件裡同步建 `new ClipboardItem({ "image/png": pngPromise })` 呼叫 `navigator.clipboard.write`（PNG 用 10 的 worker 編碼器編好再 resolve；不支援就略過）；`paste` 事件帶 image 也變新圖層，尺寸受 10 的像素預算限制，超過就用 10 既有的錯誤提示；Delete 清除選取範圍內像素（目標是遮色片時塗黑）；`⇧F5` 填色對話框（前景色、背景色、不透明度；內容感知選項這一步先灰掉，Phase 03 接上）。測試：`clipboard.test.ts`（拷貝像素與座標、貼上位置、無選取時整層、Delete 在圖層與遮色片）、`clipboard.browser.test.ts`（`ClipboardItem` 在使用者手勢內同步建立）。verify：`pnpm test src/image-editor/tools/select/clipboard && pnpm test:browser src/image-editor/tools/select/clipboard`。commit：`feat(image-select-paint): add copy, cut, paste, clear and fill`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check`

## Phase 02 — 筆刷、橡皮擦、漸層、滴管

blocker：Phase 01；model：opus（Metal kernel 改寫成 GLSL 要判斷）。

1. 筆畫路徑。新 `tools/paint/stroke-path.ts`（抄 `Document/BrushStroke.swift` 的 centripetal Catmull–Rom、適應性細分到 0.2 px、遞迴深度上限 10；`EditorSession+Brush.swift` 的「懶繩」平滑；Shift 點兩點畫直線）。測試：`stroke-path.test.ts`（細分後每段弦離曲線最遠 ≤ 0.2 px、深度上限、直線移動只產生一段、懶繩在繩長內不動）。verify：`pnpm test src/image-editor/tools/paint/stroke-path`。commit：`feat(image-select-paint): add brush stroke path with catmull-rom and lazy rope`
2. 筆刷覆蓋率 shader 與筆畫 buffer。新 `tools/paint/{brush.glsl.ts,stroke-buffer.ts}`：改寫 `Rendering/MetalBrushCoverage.swift` 的 `continuousBrush` 成 fragment shader，每一段只畫外框矩形；軟筆刷沿線段把光學密度做 8 點 Gauss–Legendre 積分、覆蓋率 = 1 − e^−密度，硬筆刷取距離決定的覆蓋率最大值；一筆先畫進筆畫 buffer（同一筆重疊不累加），放開或每段畫完以不透明度合到目標，有選取範圍時乘上選取。測試：`brush-gl.browser.test.ts`（軟筆刷一筆的覆蓋率與 TS 參考（同一個積分公式）誤差 ≤ 1/255、同一筆重疊處不比單次深、有選取時選取外沒有改變）。verify：`pnpm test:browser src/image-editor/tools/paint`。commit：`feat(image-select-paint): add gpu brush coverage and stroke buffer`
3. 筆刷與橡皮擦工具。新 `tools/paint/{brush-tool.ts,eraser-tool.ts,cursor.ts}` 與 `ui/paint-panel.tsx`；目標是圖層像素或遮色片（遮色片時顏色換灰階；調整圖層只能畫遮色片，沒有就先建全白的）；文字與形狀圖層畫下去前出 Base UI AlertDialog「要把文字點陣化嗎？」，確定就丟掉 `text` / `shape` 資料；畫到圖層範圍外：圖層沒有縮放與旋轉時擴大到涵蓋這一筆（不超過畫布與 10 的像素預算），否則只畫在圖層矩形內，遮色片同樣；每一筆完成時把碰到的 256 × 256 塊交給 `commit`；`[` `]` `⇧[` `⇧]`、數字鍵不透明度；i18n `imageEditor.paint.*` 的筆刷與點陣化 key。測試：`brush-tool.browser.test.tsx`（圖層與遮色片各一筆、文字層出確認且確定後 `text` 消失、畫出範圍外圖層擴大、undo 還原、5000 × 5000 圖層連續畫 2 秒每幀 < 16 ms 的量測只印出不當閘門）。verify：`pnpm test:browser src/image-editor/tools/paint`。commit：`feat(image-select-paint): add brush and eraser tools`
4. 漸層、滴管與顏色挑選器。新 `tools/paint/gradient-tool.ts`（線性 / 放射、兩個色標：前景到背景或前景到透明；拖曳決定方向與長度，Shift 鎖 45°；放開時點陣化畫進目前圖層，不存成資料，有選取就只畫在選取內）、`tools/eyedropper.ts`（取目前圖層或合併結果，1、3×3、5×5 平均；Alt 加筆刷時暫時變滴管）、`ui/color-picker.tsx`（前景 / 背景色塊、`X` `D`、HSV 方塊 + 色相條 + hex 輸入，Base UI Popover）。測試：`gradient-tool.test.ts`（Shift 鎖 45° 的角度、色標內插）、`eyedropper.test.ts`（取樣平均）、`color-picker.test.tsx`（hex 輸入與 HSV 互轉、非法 hex 不更新）。verify：`pnpm test src/image-editor/tools/paint src/image-editor/ui/color-picker`。commit：`feat(image-select-paint): add gradient, eyedropper and color picker`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check`

## Phase 03 — 仿製、污點修復、內容感知填色

blocker：Phase 02；model：opus。

1. 仿製印章。新 `tools/paint/clone.ts`（抄 `Document/CloneStamp.swift`：Alt 點設來源，之後的筆畫從來源處取樣、用筆刷覆蓋率畫上去；選項「對齊」與取樣目前圖層 / 全部圖層，全部 = 這一筆開始時的合成結果），屬性欄加對齊與取樣來源，游標顯示來源十字，i18n。測試：`clone.test.ts` 改寫自 `CloneStampTests.swift`（對齊與不對齊的位移、取樣來源）。verify：`pnpm test src/image-editor/tools/paint/clone`。commit：`feat(image-select-paint): add clone stamp`
2. 污點修復。新 `tools/heal/spot-heal.ts`（抄 `Rendering/HealPixels.c` 的 `spot_heal`、`heal_solve`：筆畫畫出要修的區域，放開時讀回外框加一圈邊；「內容感知」模式在 24 個角度 × 5 個距離找邊環最像的一塊、再 ±3 px 微調，邊緣差用多重網格解 Laplace 方程攤進去；「產生紋理」模式是平滑填補加上照周圍細節配的顆粒；隨機部分用 C 的 `heal_hash` 照抄）；`worker/jobs.ts` 加 `heal` job；工具 `J` 與屬性欄的模式；結果寫回並 `commit`；進度條可取消，取消後沒有改變。fixture：用本機 `cc` 編原始 C 檔對固定輸入跑一次，輸出存 `tools/heal/__fixtures__/spot-heal.*`，產生腳本放 `scripts/gen-heal-fixtures.mjs`（只在更新 fixture 時手動跑，不進 CI）。測試：`spot-heal.test.ts` 改寫自 `SpotHealingTests.swift`，加與 C 版輸出逐像素相差 ≤ 1（差異只來自 C 的 float 與 JS 的 double）；`heal-worker.browser.test.ts`（job 取消後文件與畫面不變）。verify：`pnpm test src/image-editor/tools/heal/spot-heal && pnpm test:browser src/image-editor/tools/heal`。commit：`feat(image-select-paint): add spot healing in worker`
3. 內容感知填色。新 `tools/heal/content-fill.ts`（抄 `Rendering/ContentFill.c` 的 `content_fill`：從邊界往內一圈圈填，每個像素比 4 個鄰居傳來的候選加 24 個隨機候選、5×5 SSD，再做半徑從 64 減半的隨機搜尋；隨機用 C 的 `next_random` 照抄）；`worker/jobs.ts` 加 `contentFill` job；填色對話框（Phase 01 第 5 步）的「內容感知」選項接上，洞超過 4 MP 時選項停用並顯示原因；進度條可取消。fixture 同上，`scripts/gen-heal-fixtures.mjs` 加這一支。測試：`content-fill.test.ts`（與 C 版輸出逐像素相差 ≤ 1、洞超過 4 MP 拒絕、`AbortSignal` 中途取消回傳不寫入）。verify：`pnpm test src/image-editor/tools/heal/content-fill`。commit：`feat(image-select-paint): add content-aware fill in worker`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check`

## Phase 04 — 遮蔽與走查

blocker：Phase 03；model：sonnet。

1. 遮蔽選取範圍。新 `tools/redact.ts`（作用在選取範圍碰到的每一個像素圖層，含隱藏的層；文字與形狀圖層點陣化後處理；馬賽克（格子大小可調）或實心黑色；不碰遮色片與調整圖層設定；一個 `commit` 一步 undo）、`ui/redact-dialog.tsx`（Base UI Dialog，說明文字見「形式」）、選單「影像 › 遮蔽選取範圍…」、i18n。測試：`redact.test.ts`（三層，其中一層隱藏、一層文字：遮蔽後每一層選取範圍內的像素都是馬賽克或黑、文字層的 `text` 不見了、選取範圍外 byte 相同、遮色片不變、undo 一步還原）。verify：`pnpm test src/image-editor/tools/redact`。commit：`feat(image-select-paint): add redact selection across all pixel layers`
2. 整合走查。新 `src/image-editor/tools/walkthrough.browser.test.tsx`：在 Chromium 以 Pointer 與鍵盤事件走一遍：開一張測試圖 → 魔術棒選一塊 → 羽化 → 拷貝貼上成新圖層 → 在遮色片上用筆刷修邊 → 污點修復一個點 → 仿製一塊 → 選一塊做遮蔽（含一層隱藏的圖層）→ 取 `onSave` 的 `.comp.zip` blob 用 09 的 `readComp` 重讀，確認隱藏層那塊也被遮蔽；鍵盤切工具 `M` `L` `W` `B` `E` `S` `J` `G` `I`、`[` `]`；快捷鍵衝突（與 10 已註冊的 key）在測試裡斷言沒有重複。同一步補任何走查找到的 i18n 缺 key（en 與 zh-TW 的 key 集合相同，用既有的 key 對齊測試）。verify：`pnpm test:browser src/image-editor/tools/walkthrough`。commit：`test(image-select-paint): add select, paint and redact walkthrough`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/image-editor && pnpm check`

驗收（主 agent，不是 step）：桌面 Chrome、Safari、Firefox 與 iPad 尺寸的 Safari 用觸控畫一筆；5000 × 5000 圖層連續畫 10 秒每幀 < 16 ms（DevTools Performance）；site playground 亮暗兩種給 CEO 看過。宿主要做的事：遮蔽後 replace 存檔的舊版保留與提示歸 H1（storage 22 Phase 3）。

## 之後再做

- 選取主體、物件選取、去背（自架瀏覽器端分割模型，授權另查）。
- 顏色範圍（`WandPixels.c` 的 `color_range_mask` 可以照抄）。
- 真正的 PatchMatch 內容感知填色（多尺度、迭代、投票），以及填色延伸到畫布外。
- 塗抹 / 液化（`MetalWarp.swift`）、模糊工具。
- 筆刷壓力（Pointer Events 的 `pressure`）、自訂筆尖。
