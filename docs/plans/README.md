# docs/plans

程式碼是唯一的真相。契約看 `src/contract/` 與 `src/i18n/messages.ts`（02 之後才有），exports 看 `package.json`，設計與決策看 `00-overview.md`。

這個目錄只放還沒做完的 plan。某份 plan 做完：

- 刪掉它的檔，不留歷史，也不寫「已被取代」；
- 在 `00-overview.md` §6 表裡，把那一列的「一句話」改成「已完成（日期）」。

13 份全部做完、兩個宿主都換上 1.0 之後，連 `00-overview.md` 一起刪。

## 怎麼寫 plan

一份 plan 一個檔：`docs/plans/NN-<name>.md`。編號照 00-overview §6 的表，`<name>` 就是表裡「Plan」那一欄。檔案結構固定如下：

```
# NN <name> — 一句話
狀態行：planned / in-progress（日期、誰決定）、blocker（哪份 plan 的哪個 phase）、model
判斷      為什麼這樣做、不做什麼
契約      這份 plan 對外的型別 / export / subpath / 錯誤碼 / i18n key 的形狀；只加不改 00-overview §3
形式      UI 長什麼樣（沒有 UI 就省略）
## Phase NN — 標題
blocker、model（沒標就跟 plan 頭部一樣）
1. <一個 commit 的改動>：哪些檔、改成什麼。測試：<檔與案例>。verify：<一條命令>。commit：`feat(<name>): <英文摘要>`
2. …
phase 結尾的 verify：全模組測試 + `pnpm check`
## 之後再做   明確排除的事，一行一件
```

- **一個 step 就是一個 commit。**
  - step 寫的是那個 commit 的 diff：哪些檔、改成什麼、測試改哪裡、verify 跑哪一條命令。
  - verify 綠了才 commit。commit 訊息用英文 Conventional Commits，plan 名當 scope：`feat(<name>): <step summary>`。
  - 一個 step 塞不進一個 commit，就拆成兩步；兩個 step 非得在同一個 commit 裡才會綠，就合成一步。
- **每一步都要自足。** 執行的 agent 只讀 plan 頭部和自己那一步（見下一節），所以每一步都要寫到：
  - 要新增或修改的每個檔的完整 repo 路徑，以及改成什麼：函式、元件、型別的名稱與簽名。
  - 用到前面步驟或其他 plan 的產物時，寫明「哪個檔的哪個符號」。不寫「同上」、「見前一步」、「照前面的做法」。
  - 要測哪些案例（逐條列出）、一條可以直接複製執行的 verify 命令、commit 訊息。
  - 不留需要判斷的空白。會影響 API、檔案結構或行為的選擇，在 plan 裡就決定好。真的要動手時才知道的事，寫明「預設怎麼做」。
  - 步驟之間只能有「需要前一步的產物」這種順序依賴，不能寫「做到這裡再看要不要……」。
- **每個 commit 都要綠。**
  - §3 的契約只加不改。加 export 或 subpath 的那個 commit，要同時改 `package.json` 的 `exports`、`tsdown.config.ts` 的 `entry`、`src/<subpath>/index.ts`，`pnpm verify:pack` 才會綠。
  - 加 production 依賴的那個 commit，要同時改 `THIRD_PARTY_NOTICES.md`，`pnpm check:licenses` 才會綠。
  - 入口（`src/index.ts`）不得靜態 import 重依賴，`pnpm check` 會擋。
- **一份 plan 是 push 的單位。**
  - step 依序做，只 commit 不 push。整份 plan 做完，由主 agent `git pull --rebase && git push` 一次。每次 push 都會跑一次 CI。
  - 例外：blocker 寫明要先上的 phase（例如別份 plan 在等它），那個 phase 一結束就 push。
  - 發佈只由 tag `v*` 觸發（`.github/workflows/release.yml`），由主 agent 打 tag。
- **model 標在 phase 上。** 設計判斷多的用 opus（Opus 5.5），照規格做的用 sonnet。對外、不可逆的動作（建 repo、發 npm、打 tag、部署）標「主 agent 做」。
- **寫的時候對著程式碼寫。**
  - 本 repo 還沒有的新檔，路徑照 00-overview §7 的目錄規劃。
  - 引用到現有的程式（`../ui`、`../storage`、`../product`、第三方套件的 API），每個檔名與符號都要 grep 確認存在，第三方套件查 `node_modules` 或 `npm pack` 下來的 d.ts。
  - 從 storage 搬來的 plan（§6 表的最後一欄），storage 那份已經定的設計與選型照搬，不重開。宿主的段落拿掉，交給 H1 / H2。
- **宿主的事寫成一行指向 H1 / H2。** 下載、解密、上傳、trash、toast、撞名、主題色票對應都歸宿主，不寫進 step。
- 不寫「以後可能」、不加設定項、不加抽象。排除的事放在「之後再做」，一行帶過。

## 給執行 subagent 的說明

**一個 agent 只做一個 step。**

- 讀兩樣東西：自己那份 plan 的頭部（狀態行、判斷、契約、形式），以及自己那一步。
- 做完、verify 綠了、commit，就停。不讀也不開始下一步。
- 主 agent 派工時，prompt 帶三樣東西：plan 路徑、step 編號、本節全文。

**參考檔是唯讀的。**

- 要抄的參考檔在同層目錄：`../ui`（`tokens.css`、`scripts/verify-pack.mjs`、Base UI 的用法）、`../storage`（原 plan `docs/plans/NN-*.md`、`src/components/files/preview.tsx`）、`../product`（`packages/shell-ui/src/memory/entry-detail/entry-assets/`）。
- 上游原始碼（Compositor @11d8d7a、opencut-classic @cf5e79e）clone 到 scratchpad 或 `/tmp` 去讀，不放進 repo。

**不動 `../storage`、`../product`、`../ui`。**

- 需要改 ui 的事（例如 `tokens.css` 的子樹選擇器、發新的 minor），以及需要宿主做的事，都寫在回報裡，由主 agent 處理。
- 宿主那邊的工作歸 H1（storage）與 H2（product）。

**只動自己 plan 列出的檔。**

- root 設定檔（`package.json` 的 scripts 與 exports、`tsconfig*.json`、`tsdown.config.ts`、`vitest.config.ts`、`.oxlintrc.json`、`.oxfmtrc.json`、`turbo.json`、`.github/workflows/`）在 01 之後就已經就位，step 沒寫到就不改。
- 需要新套件就用 `pnpm add`（production 依賴要鎖 step 寫的版本範圍；mediabunny 鎖確切版本），並在回報裡列出。

**不問人、不用 AskUserQuestion。**

- 契約有疑義，照契約寫，不自己改。
- 技術選擇照 plan 的「判斷」段與本節自己決定。
- 這兩種情況都列在回報裡。

**命令（01 建好之後）：**

- `pnpm test <path>`：vitest，jsdom 模式。
- `pnpm test:browser <path>`：vitest browser 模式，用 headless Chromium，WebGL2 / WebCodecs / canvas 都是實測。
- `pnpm check`：依序跑 tsc --noEmit（含 `tsconfig.comp.json`）、oxlint、oxfmt --check、入口檢查。
- `pnpm build`：tsdown，輸出 ESM + d.ts。
- `pnpm verify:pack`：打包後從外面 resolve 每一條 export。
- `pnpm check:licenses`：檢查 production 依賴的授權。
- `pnpm site:dev` / `pnpm site:build`：docs 站（05 建好之後才有）。
- 改完檔案先跑 `pnpm fmt` 再 verify。

**測試怎麼跑。**

- 照迭代規則：平常只跑改到的檔（`pnpm test <path>`）。commit 前才跑該 step 的 verify；phase 的最後一步，再跑 phase 結尾的 verify。
- 摸得到 GL、WebCodecs、canvas 像素、worker 的測試，寫成 `*.browser.test.ts(x)`，用 `pnpm test:browser` 跑。jsdom 的假實作驗不到這些行為。
- build / test 的輸出寫進 scratchpad 或 `/tmp` 的 log 檔，然後用 `tail -n 30` 或 grep 看。不要把整段輸出印進 context，也不要寫進 repo 目錄。

**改名或刪符號之後**，用 `rg` 掃全 repo（含 `site/`、`scripts/`、`docs/`）找殘留。typecheck 掃不到這些地方。

**程式規則：**

- 每個檔案 ≤ 300 行（oxlint 會擋）；檔名 kebab-case；`any` 禁用。
- React 禁用 `useEffect` / `useLayoutEffect`（oxlint 會擋），改用 ref callback 加 cleanup，或事件處理器。
- 動畫不回彈。
- 樣式只用 `--ak-*` CSS 變數加 plain CSS（`fv-*` class）。互動元件用 `@base-ui/react`。不用 StyleX、Tailwind、shadcn。
- `src/**` 不 import 任何 `@anyknown/*`（oxlint 會擋）。
- 本套件不發任何網路請求。不開 `blob:` worker；需要 worker 時用同源 module worker：`new Worker(new URL(…, import.meta.url), { type: "module" })`。
- 抄進來的程式，檔頭寫來源路徑、commit、MIT，同一個 commit 在 `THIRD_PARTY_NOTICES.md` 加一條。
- 不做 plan 以外的功能，不加抽象，不加設定項，不寫「以後可能用到」的東西。

**commit：**

- 一步一個 commit。訊息用英文 Conventional Commits，plan 名當 scope：`feat(<name>): <step summary>`。
- sub agent 不 push、不打 tag、不 `npm publish`、不 `gh run watch`。push 由主 agent 照上一節的規則做，CI 也由主 agent 在 plan 結束時等一次。
- author 已設好（Senlima Sun <admin@anyknown.com>），不要改。

**停止規則：**

- 同一個 verify 連續失敗兩次，就停下來回報，寫明試過什麼、卡在哪裡。
- 超過約 150 turns，先 commit 能用的部分，回報後停。
- 等背景程序時，用一次阻塞等待加 timeout，不要每個 turn 輪詢。

**接續：**

- 下一步動的是同一批檔、而且這個 agent 的 context 還小，主 agent 可以用 SendMessage 讓同一個 agent 繼續下一步。
- 其他情況開新 agent，只傳前一步的結論：commit hash、摘要、偏離的地方。

回報格式（最後一則訊息，不要貼整份 diff）：

```
commit：<hash> <訊息>（或：卡在 verify，原因）
摘要：<一行>
verify 結果：<命令> 的最後摘要行
偏離 plan 的地方：（沒有就寫「無」）
需要主 agent 處理：（要改 ui 的事、宿主 H1 / H2 的事、新加的套件、契約疑義）
```

## 系列

設計與依賴圖見 `00-overview.md` §6。

- `00-overview.md`：總覽，包括定位、已定決策、宿主介面草案、套件結構、分期、repo 與發佈。
- `01-scaffold.md`：repo 骨架，包括 pnpm、tsdown、exports 空殼、oxlint / oxfmt、vitest jsdom 與 browser、入口與授權檢查、CI、release，以及 GitHub repo 與 npm 首發 0.0.1。
- `02-contract.md`：`ByteSource` / `kindOf` / `ViewerError` / i18n / 主題根元素 / Base UI 基本元件與 `styles.css`；以及 ui 的 `[data-theme="light"]` 子樹選擇器（要改 ui，由主 agent 處理）。
- `03-viewer-core.md`：`FileViewer` 的分派、整檔讀取與上限、image / video / audio / pdf / text / unsupported / too_large、「編輯」切換點。
- `04-markdown-excalidraw.md`：`.md` 排版、fence 的解析與替換、讀模式的 SVG、Excalidraw 編輯器、`.excalidraw` 檔、字型 asset path（從 storage 11 搬來）。
- `05-site.md`：docs 站與 playground、「接上你的 app」頁，部署到 `file-viewer.anyknown.com`。
- `06-media-io.md`：`ByteSource` 接 mediabunny source、`StreamTarget` 收成 `Blob`、`canDecode`（從 storage 14 搬來）。
- `07-video-editor.md`：多軌時間軸、修剪 / 分割 / ripple、疊加、輸出 MP4（從 storage 14 搬來）。
- `08-audio-editor.md`：單軌波形、剪接 / 淡入淡出 / 正規化 / 去靜音、輸出（從 storage 15 搬來）。
- `09-comp-format.md`：`.comp.zip` 讀寫、manifest 驗證、`readHead`、圖層樹摘要；`./comp` 不碰 DOM（從 storage 17 搬來）。
- `10-image-editor.md`：圖層文件、WebGL2 合成、混合模式、遮色片、變形、undo、存檔、`.comp.zip` 預覽（從 storage 13 搬來）。
- `11-image-select-paint.md`：選取、魔術棒、筆刷、仿製、修復、內容感知填色、漸層（從 storage 18 搬來）。
- `12-image-adjustments-effects.md`：調整圖層與圖層效果（從 storage 19 搬來）。
- `13-image-text-shapes.md`：文字圖層、形狀圖層（從 storage 20 搬來）。
- H1（屬 storage repo）：`../storage/docs/plans/22-file-viewer-host.md`，storage 換用 `FileViewer`，分三個 phase，對應 v0.1 / v0.2 / v0.3。
- H2（屬 product repo）：`../product/docs/plans/file-viewer-host.md`，product 的 `AssetBody` 換用 `FileViewer`，在 v0.1 之後做。
