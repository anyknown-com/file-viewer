# 04 markdown-excalidraw — `.md` 排版、` ```excalidraw ` 畫成圖、點圖編輯；`.excalidraw` 單檔同一套

狀態：planned（2026-10-08；選型沿用 storage 11，2026-10-05 CEO / CTO 定）；blocker：03 viewer-core 全部（`FileViewer` 的分派與「編輯」切換點）；與 05 平行；model：見各 Phase；push：本 plan 做完一次。

這份從 storage `docs/plans/11-doc-viewer.md` 搬來，設計不重開。和 storage 11 不同的地方：

- 路徑從 storage 的 `src/lib/`、`src/components/files/doc/` 改成本 repo 的 `src/markdown/`、`src/excalidraw/`、`src/viewer/`。
- `saveText`（`files.list()` 確認舊檔還在 → 上傳 → `remove` → `reload` → `openPreview`）不在這裡。本套件只交出 `SaveRequest`，其餘都是宿主的事：**H1（storage 22 Phase 1）** 用 `onSave` 做 storage 11 第 5 步的 `saveText`，同一段也處理「舊檔已被別處刪掉 → toast、不上傳」。
- Dialog / AlertDialog 從 shadcn 改成 `@base-ui/react`；樣式從 Tailwind token 改成 `--ak-*` 加 plain CSS（寫在 `src/styles.css`）。
- 圖片多一條 `resolveImage` 回呼（00 §3）。storage 的做法是「圖片一律不載入」，現在變成本套件的預設值。
- 字型改由本套件打包：`pnpm build` 把 Excalidraw 的字型複製進 `dist/excalidraw-assets/`，宿主從本套件複製這個目錄（理由見判斷）。
- 走查（storage 11 第 6 步的 Story 6）換成本 repo 的 browser 測試和 `pnpm test:csp`。宿主各自的 e2e 由 H1 / H2 負責。

## 判斷

- **Markdown 用 `react-markdown@10` + `remark-gfm` + `rehype-sanitize`，開 `skipHtml`，不裝 `rehype-raw`**（storage 11 §2）。輸出 React 元素、不走 `innerHTML`。`components` 直接把 excalidraw 區塊換成元件。
- **fence 用同一套 parser 先定位**（`unified` + `remark-parse` + `remark-gfm`）。交給 react-markdown 的是遮過的原文：每個 excalidraw 區塊的內容換成序號 `0`、`1`…（storage 11 §2）。內容一樣的兩張圖分得開，大段 JSON 也不用跑 markdown pipeline。
- **存檔只改那一段**：`replaceFence` 只換內容行。開頭與收尾的 fence 標記、容器前綴（list 縮排、`> `）、換行符號、其他 byte 都不動（storage 11 §2）。
- **讀的畫面不掛 Excalidraw 元件**：`exportToSvg` 的結果序列化成 `blob:` URL，放進 `<img>`。點圖才載入編輯器（storage 11 §2）。
- **圖片由宿主決定（`resolveImage`）。** react-markdown 的 `defaultUrlTransform` 和 `rehype-sanitize` 預設 schema（`protocols.src: ["http","https"]`，hast-util-sanitize 5.0.2 `lib/schema.js:145`）都會清掉 `data:`、`blob:`。但 product 的 `fenceImages` 正好要留這兩種。所以兩處都不擋 `img` 的 `src`：sanitize schema 設 `protocols.src: null`（`lib/index.js:679`：沒有限制就全收），`urlTransform` 遇到 `src` 原樣放行。原始 `src` 一律交給 `img` 元件，元件問 `resolveImage`，元件自己絕不直接用原始 `src`。回傳值有三種：
  - 字串：載入這個 URL。
  - `{ link }`：不載入，顯示成連到原圖的連結。product 對外部 http(s) 圖就是這樣處理（`fence-images.test.ts` 第一案）。
  - `null`：顯示 `[圖片：alt]`。
  不給 `resolveImage` 時，每張圖都是 `null`，也就是 storage 11 原本的行為。`{ link }` 的 URL 再經過 `defaultUrlTransform`，被清空就退回 `null` 的顯示方式。product 用 marked 改寫原文，所以要處理「找不到原文就把所有 `![` 跳脫」的漏網情形。這裡每張圖都是 AST 節點、都經過同一個元件，沒有漏網的可能，因此不必搬那段。
- **H2 照 `fenceImages` 的規則寫 `resolveImage`**（宿主的事，寫給 H2）。`product/packages/shell-ui/src/markdown/image-kind.ts` 的 `imageKind(src, location.origin)` 有三種結果：
  - `keep`（`data:`、`blob:`、同源）→ 回 `src`；
  - `link` → 回 `{ link: url.href }`；
  - `text` → 回 `null`。
  字樣上只差一處：product 對 `text` 只顯示 alt，本套件顯示 `[圖片：alt]`。兩邊都不載入，H2 不必補。
- **字型由本套件打包。** Excalidraw 0.18.1 的字型網址寫死成 `./fonts/<Family>/<file>-<hash>.woff2`（`dist/prod/chunk-K2UTITRG.js`）。字型網址的候選順序是 `window.EXCALIDRAW_ASSET_PATH` 在前，`https://esm.sh/@excalidraw/excalidraw@<ver>/dist/prod/` 在後，後者一定會加上、關不掉。宿主如果自己從 `@excalidraw/excalidraw` 複製字型會有兩個問題：pnpm 嚴格模式下宿主根目錄 resolve 不到這個遞移依賴；而且字型 hash 必須和打包進去的 JS 同版本。所以：
  - `@excalidraw/excalidraw` 鎖確切版本 `0.18.1`；
  - `pnpm build` 把它的 `dist/prod/fonts/` 複製成本套件的 `dist/excalidraw-assets/fonts/`（約 13 MB，大部分是 Xiaolai CJK 子集）；
  - 宿主把 `node_modules/@anyknown/file-viewer/dist/excalidraw-assets/` 複製到自己的靜態目錄，再用 `excalidraw.assetPath` 告訴本套件位置。
  不給 `assetPath` 時就是 Excalidraw 的預設 CDN（esm.sh）。00 §3「本套件不發任何請求」的前提是宿主有給，05 的「接上你的 app」頁要寫清楚。
- **Excalidraw 的 subset worker 不違反「不開 `blob:` worker」**：它是 `new Worker(new URL(import.meta.url), { type: "module" })` 開的同源 chunk（`subset-worker.chunk.js`）。開不起來時會退回主執行緒（`chunk-K2UTITRG.js` 的 `WorkerInTheMainChunkError` 分支）。
- **Esc 交給 Excalidraw**（取消選取、離開工具），不拿來關編輯器；離開編輯器只能按「取消」鈕。storage 11 的「Esc 出來」是 shadcn Dialog 的行為，本套件不開 modal（00 §3「版面」），而且 Esc 在 Excalidraw 裡本來就有用途。
- **`.md` 沒有頂列的「編輯」**：`kindOf` 對 `.md` 回 `edit: "markdown"`，但文字編輯是「之後」才做的事（00 §5）。v0.1 能編輯的只有圖，入口是點圖。所以 `edit === "markdown"` 時，03 的頂列「編輯」鈕不顯示。`.excalidraw` 照 03 的規則顯示頂列「編輯」。
- **呈現元件只吃 props**：`MarkdownView`、`DiagramImage`、`DiagramEditor` 都不讀 03 的 context，文案用 `copy` 物件傳進來，所以 `./markdown`、`./excalidraw` 這兩個 subpath 可以單獨使用。接上 03 的工作只在 `src/viewer/markdown-body.tsx`、`src/viewer/excalidraw-body.tsx` 兩個檔裡做。
- 不做（見「之後再做」）：在 UI 改 `.md` 文字、新建圖、相對路徑的圖片、程式碼上色。

## 契約

只加不改 00 §3：

- `src/contract/image-resolver.ts`（新）：
  ```ts
  export type ImageResolution = string | { link: string } | null;
  export type ImageResolver = (src: string, alt: string) => ImageResolution;
  ```
  `FileViewerProps["markdown"]` 的型別改成 `{ resolveImage?: ImageResolver }`。`ImageResolver` 只放寬了回傳型別，原本回 `string | null` 的宿主照樣能編譯。
- `FileViewerProps` 加 `excalidraw?: { assetPath?: string }`。`assetPath` 是「裡面有 `fonts/` 的那個目錄」的 URL，例如 `"/excalidraw-assets/"`。
- `src/index.ts` 再匯出 `ImageResolution`、`ImageResolver` 兩個型別。
- `./markdown`（`src/markdown/index.ts`）：
  - `MarkdownView`、`MarkdownViewProps`；
  - `findFences`、`maskFences`、`replaceFence`、`Fence`；
  - `MarkdownCopy`、`markdownCopy`。
- `./excalidraw`（`src/excalidraw/index.ts`）：
  - `DiagramImage`、`DiagramImageProps`；
  - `DiagramEditor`、`DiagramEditorProps`、`DiagramEditorCopy`、`diagramEditorCopy`；
  - `parseScene`、`setAssetPath`。
- 簽名：
  ```ts
  type Fence = { index: number; start: number; end: number; json: string }; // start/end：整個 code block 在原文的 offset（mdast position）
  type MarkdownViewProps = { source: string; theme: "light" | "dark"; copy: MarkdownCopy;
    resolveImage?: ImageResolver; assetPath?: string; onEditDiagram?: (fence: Fence) => void; editLabel?: string };
  type DiagramImageProps = { json: string; theme: "light" | "dark"; assetPath?: string; alt: string; broken: ReactNode }; // broken：export 失敗時顯示的內容
  type DiagramEditorProps = { json: string; theme: "light" | "dark"; locale: Locale; copy: DiagramEditorCopy;
    assetPath?: string; onSave: (json: string) => Promise<void>; onClose: () => void; onDirtyChange?: (dirty: boolean) => void };
  ```
- i18n key（en / zh-TW；寫進 02 的 `Messages`；02 若用扁平 key，就拿下面這串文字直接當 key）：

  | key | en | zh-TW |
  | --- | --- | --- |
  | `markdown.image` | `[Image: {alt}]` | `[圖片：{alt}]` |
  | `markdown.imageUntitled` | `Image` | `圖片` |
  | `markdown.imageLink` | `{alt} ({host})` | `{alt}（{host}）` |
  | `markdown.imageLinkTitle` | `Open image on {host}` | `在 {host} 開啟圖片` |
  | `diagram.loading` | `Loading diagram…` | `載入圖…` |
  | `diagram.broken` | `This diagram can't be read` | `這張圖讀不出來` |
  | `diagram.edit` | `Edit diagram` | `編輯這張圖` |
  | `diagram.save` | `Save` | `儲存` |
  | `diagram.cancel` | `Cancel` | `取消` |
  | `diagram.discardTitle` | `Discard your changes?` | `放棄這次的修改？` |
  | `diagram.discard` | `Discard` | `放棄` |
  | `diagram.keepEditing` | `Keep editing` | `繼續編輯` |

  字串裡的 `{alt}`、`{host}` 由本 plan 的程式用 `replaceAll` 代入，不依賴 02 有沒有格式化函式。
- 存檔的 `SaveRequest`（00 §3）：
  - `.md`：`{ blob: new Blob([newSource], { type: "text/markdown" }), mime: "text/markdown", ext: <原檔副檔名，".md" 或 ".markdown">, mode: "replace", suggestedName: file.name }`；
  - `.excalidraw`：`{ blob, mime: "application/vnd.excalidraw+json", ext: ".excalidraw", mode: "replace", suggestedName: file.name }`。
- 依賴（新增到 `dependencies`）：
  - `react-markdown@^10.1.0`、`remark-gfm@^4.0.1`、`rehype-sanitize@^6.0.0`、`unified@^11.0.5`、`remark-parse@^11.0.0`；
  - `@excalidraw/excalidraw@0.18.1`（確切版本）。

**接 01–03 的介面**（假設前面的 plan 已經提供；實際名稱不同時，以 repo 裡的檔為準，用步驟裡寫的 grep 找到對應位置）：

- 01：
  - `pnpm test`（jsdom，檔名 `*.test.ts(x)`）與 `pnpm test:browser`（Chromium，檔名 `*.browser.test.ts(x)`）；
  - devDependency 裡有 `playwright`（vitest browser 的 provider）；
  - `scripts/check-entry-deps.mjs` 的黑名單含 `@excalidraw`、`react-markdown`；
  - `THIRD_PARTY_NOTICES.md` 有「runtime 依賴」一段；
  - `package.json` 的 exports 已經為 `./markdown`、`./excalidraw` 留了位置，指向 `src/markdown/index.ts`、`src/excalidraw/index.ts` 的 build 產物；
  - `src/styles.css` 是單一 plain CSS 檔。
- 02：
  - `src/contract/` 定義 `FileViewerProps`（含 `markdown?.resolveImage`）；
  - `src/i18n/messages.ts` 的 `Messages` 型別，`src/i18n/en.ts`、`src/i18n/zh-TW.ts` 兩份內容，以及一個 key 對齊測試（在 `src/i18n/`）；
  - `Locale` 型別；
  - `src/primitives/button.tsx` 的 `Button`，接受一般 `<button>` 的 props。
- 03：
  - `src/viewer/` 對 `ViewKind` 做 switch 的分派元件；`case "markdown"` 和 `case "excalidraw"` 先當 text 顯示；
  - 整檔讀取後交給 text 分支一個 `Blob`；
  - 一個 viewer context，帶 `messages`、`locale`、`theme`（可能是 undefined）和宿主的 props；
  - 頂列「編輯」鈕的條件（`onSave` 加上 `kind.edit`），以及編輯模式時對 `EditKind` 做 switch。

## 形式

- `.md`：容器裡一張可捲動的文件面板，置中，最寬 `48rem`（`.fv-md`）。
  - 內文樣式寫在 `.fv-prose`：標題、段落、list、表格、task list、行內 code、code block（等寬、`--ak-*` 的 muted 底色、可水平捲動）、引言。亮暗兩種都只用 `--ak-*`。
  - 連結開新分頁，帶 `rel="noopener noreferrer"`。被清掉的連結（例如 `javascript:`）只剩文字，點不了。
- 圖片分三種顯示：
  - 宿主回 URL：用 `<img loading="lazy">` 載入，最寬 100%；
  - 宿主回 `{ link }`：顯示連結「流量圖（evil.example）」，`title` 是「在 evil.example 開啟圖片」；
  - 宿主回 `null` 或沒給 `resolveImage`：顯示灰字 `[圖片：流量圖]`。
- ` ```excalidraw ` 區塊：
  - 圖置中，最寬 100%。
  - 宿主有給 `onSave` 時，圖本身是一個 button（`aria-label` 是「編輯這張圖」）。hover 或 focus 時右上角出現「編輯」小標，Tab 可以走到，Enter 或 Space 開編輯器。
  - 載入中：spinner 加「載入圖…」。
  - JSON 壞掉：卡片寫「這張圖讀不出來」，下面是原文 code block，不能點。
  - `<img>` 的 `alt` 是圖裡前 10 段文字。
- `.excalidraw`：整個容器就是一張圖，置中。頂列「編輯」由 03 提供。
- 編輯：在同一個容器裡換成 Excalidraw，頂列右側「取消」「儲存」。
  - Excalidraw 的選單裡沒有開檔、匯出、存檔、存成圖片、切換主題這幾項。
  - 存檔中：「儲存」轉成 spinner，兩顆鈕都停用。
  - 存檔失敗：頂列左側顯示 `error.message`，編輯器留在原地。
  - 改過沒存就按「取消」：跳出 AlertDialog「放棄這次的修改？」，選項是「繼續編輯」和「放棄」。
  - 存好之後回到文件，focus 停在同一張圖（同一個 `index`）。

## Phase 01 — Markdown 排版

blocker：03 全部；model：sonnet。

1. **fence 純函式。**
   - `pnpm add remark-parse@^11.0.0 remark-gfm@^4.0.1 unified@^11.0.5`。
   - 新檔 `src/markdown/fences.ts`，型別 `Fence = { index: number; start: number; end: number; json: string }`。
   - `findFences(source: string): Fence[]`：
     - 用 `unified().use(remarkParse).use(remarkGfm).parse(source)` 走整棵 mdast（list、blockquote 裡的也要），收集 `type === "code"` 且 `lang === "excalidraw"` 的節點；
     - `start` / `end` 取 `node.position.start.offset` / `node.position.end.offset`，`json` 取 `node.value`，`index` 依出現順序從 0 起算。
   - `replaceFence(source: string, fence: Fence, content: string): string`，規則如下：
     - 開頭 fence 那一行與收尾 fence 那一行的原文 byte 不變。檔尾沒有收尾 fence 時，就換到 `fence.end` 為止，不補收尾 fence。
     - 每一行新內容的前綴 = 開頭 fence 那一行從行首到 `fence.start` 的原文，再把裡面的 list 標記（`-`、`*`、`+`、`\d+[.)]`）換成等寬空白。這個前綴本身也包含 fence 前面那 0–3 格縮排。
     - 換行符號沿用開頭 fence 那一行的結尾（`\r\n` 或 `\n`）。
     - `fence` 以外的 byte 一個都不動。
   - `maskFences(source: string, fences: Fence[]): string`：從最後一個 fence 往前，逐一 `replaceFence(source, f, String(f.index))`。
   - 測試 `src/markdown/fences.test.ts`，案例：
     - 沒有 fence 回 `[]`；
     - 兩個 fence 的 `index` 是 0、1，`json` 正確；
     - list 項目裡縮排的 fence；
     - `> ` 引言裡的 fence；
     - `~~~` 和四個反引號的 fence；
     - info string 是 `excalidraw title` 也要算；
     - ` ```json ` 不算；
     - CRLF 原文換完仍然是 CRLF；
     - 檔尾沒有收尾 fence；
     - 兩段內容相同的 fence 各自替換，互不影響；
     - 替換後再跑一次 `findFences`：被換的那段 `json` 等於新內容，其他 fence 的原文 byte 不變，fence 以外的原文也不變；
     - `maskFences` 之後再跑 `findFences`，`json` 依序是 `"0"`、`"1"`。
   - verify：`pnpm test src/markdown/fences.test.ts`
   - commit：`feat(markdown-excalidraw): locate, mask and replace excalidraw fences`

2. **圖片的宿主規則。**
   - `pnpm add react-markdown@^10.1.0 rehype-sanitize@^6.0.0`。
   - 新檔 `src/contract/image-resolver.ts`：`ImageResolution`、`ImageResolver`，形狀見契約。
   - 02 定義 `FileViewerProps` 的那個檔（`grep -rn "resolveImage" src/contract`）把 `markdown` 欄位改成 `{ resolveImage?: ImageResolver }`。`src/index.ts` 加上 `export type { ImageResolution, ImageResolver } from "./contract/image-resolver"`。
   - 新檔 `src/markdown/copy.ts`：
     - `MarkdownCopy = { image: string; imageUntitled: string; imageLink: string; imageLinkTitle: string; diagramLoading: string; diagramBroken: string }`；
     - `markdownCopy(messages: Messages): MarkdownCopy`，從 02 的 `Messages`（`src/i18n/messages.ts`）取出契約表裡的 `markdown.*` 四個 key，以及 `diagram.loading`、`diagram.broken`。
   - 契約表的 `markdown.*`、`diagram.loading`、`diagram.broken` 加進 `src/i18n/messages.ts` 的型別、`src/i18n/en.ts` 和 `src/i18n/zh-TW.ts`。
   - 新檔 `src/markdown/sanitize-schema.ts`：`markdownSchema`，就是 `rehype-sanitize` 的 `defaultSchema` 再加上 `protocols: { ...defaultSchema.protocols, src: null }`。
   - 新檔 `src/markdown/in-link.ts`：`InLinkContext = createContext(false)`。
   - 新檔 `src/markdown/markdown-image.tsx`：`MarkdownImage({ src, alt, resolveImage, copy })`。`alt` 去掉空白後是空的，就改用 `copy.imageUntitled`。依 `resolveImage?.(src, alt) ?? null` 的結果顯示：
     - 字串：`<img className="fv-md-img" src={結果} alt={alt} loading="lazy">`。
     - `{ link }`：先過 `defaultUrlTransform(link)`（從 `react-markdown` import），結果是空字串就改走 `null` 那條。否則 `host = new URL(link).host`，label 是 `copy.imageLink` 代入 alt 與 host 後的字串。如果 `use(InLinkContext)` 是 true（這張圖在連結裡），只輸出 `<span>{label}</span>`；不是的話輸出 `<a href={link} title={copy.imageLinkTitle 代入 host} target="_blank" rel="noopener noreferrer">{label}</a>`。
     - `null`：`<span className="fv-md-img-alt">{copy.image 代入 alt}</span>`。
   - 測試 `src/markdown/markdown-image.test.tsx`，用 jsdom 直接 render 元件，案例：
     - 沒給 `resolveImage` 時顯示 `[Image: x]`，DOM 裡沒有 `img`；
     - 回字串時，`img` 的 src 就是那個字串；
     - 回 `{ link: "https://evil.example/a.png?d=1" }` 時，出現 `a`，文字是 `x (evil.example)`，`title` 是 `Open image on evil.example`；
     - 回 `{ link: "javascript:alert(1)" }` 時退回 alt 文字，沒有 `a`；
     - alt 是空的時用 `Image`；
     - 包在 `InLinkContext` 裡、回 `{ link }` 時只有文字、沒有 `a`；
     - `resolveImage` 收到的 `src`、`alt` 和傳進元件的完全一樣，包括 `data:`、`blob:`、`//host/x`。
   - verify：`pnpm test src/markdown/markdown-image.test.tsx src/i18n`
   - commit：`feat(markdown-excalidraw): resolve markdown images through the host`

3. **`MarkdownView`。**
   - 新檔 `src/markdown/markdown-view.tsx`：`MarkdownView(props: MarkdownViewProps)`，props 見契約；`assetPath`、`onEditDiagram`、`editLabel` 這一步先收下但不使用。內容：
     - `fences = useMemo(() => findFences(source), [source])`、`masked = useMemo(() => maskFences(source, fences), [source, fences])`，兩個函式都來自 `src/markdown/fences.ts`。
     - `<div className="fv-md"><article className="fv-prose"><Markdown …>` 渲染 `masked`。`Markdown` 是 `react-markdown` 的 default export。
     - `Markdown` 的參數：`remarkPlugins={[remarkGfm]}`、`rehypePlugins={[[rehypeSanitize, markdownSchema]]}`（`markdownSchema` 來自 `src/markdown/sanitize-schema.ts`）、`skipHtml`。
     - `urlTransform={(url, key) => key === "src" ? url : defaultUrlTransform(url)}`。
   - `components` 換掉三個元件：
     - `a`：`href` 是空字串或沒有 `href` 時輸出 `<span>{children}</span>`；否則輸出 `<a href target="_blank" rel="noopener noreferrer">`，children 外面包一層 `<InLinkContext value={true}>`（`src/markdown/in-link.ts`）。
     - `img`：`<MarkdownImage src={String(src ?? "")} alt={String(alt ?? "")} resolveImage={props.resolveImage} copy={props.copy}>`（`src/markdown/markdown-image.tsx`）。
     - `pre`：用 `node`（react-markdown 會傳 hast 節點）找第一個 `code` 子元素。它的 `properties.className` 含 `language-excalidraw` 時，讀它的文字（序號），到 `fences` 裡找對應的那一個，輸出 `<pre className="fv-md-diagram-pending">{fence.json}</pre>`（下一個 phase 才換成圖）。其他情況照一般的 `<pre>{children}</pre>` 輸出。
   - `src/styles.css` 追加 `.fv-md`、`.fv-prose`（以及它下面的 h1–h4、p、ul、ol、`li:has(> input[type=checkbox])`、table、th、td、code、pre、blockquote、a、hr）、`.fv-md-img`、`.fv-md-img-alt`，只用 `--ak-*` 變數。
   - 新檔 `src/markdown/index.ts`：匯出契約列的 `./markdown` 符號。這一步只有 `MarkdownView`、`MarkdownViewProps`、`findFences`、`maskFences`、`replaceFence`、`Fence`、`MarkdownCopy`、`markdownCopy`，而這就是 `./markdown` 的全部。
   - 新 fixture `test/fixtures/doc-with-diagrams.md`，內容依序是：
     - h1、h2、一段文字；
     - 一個 GFM 表格、一個 task list（一項勾、一項沒勾）；
     - 一個 ` ```ts ` code block；
     - `![流量圖](https://evil.example/x.png)`；
     - 第一個 ` ```excalidraw `：一個 rectangle 和一個寫著 `Hello` 的 text 元素。元素只寫 `id`、`type`、`x`、`y`、`width`、`height`（text 再加 `text`、`fontSize: 20`、`fontFamily: 5`），其餘欄位交給 Excalidraw 的 `restore` 補；
     - 一個 list 項目，裡面是縮排的第二個 ` ```excalidraw `（一個 ellipse）；
     - 第三個 ` ```excalidraw `，內容是 `{not json`。
   - 測試 `src/markdown/markdown-view.test.tsx`（jsdom），案例：
     - 讀 fixture 渲染後，有 `h1`、`table`、兩個 checkbox（一個 checked）、`pre code.language-ts`；
     - 三個 `.fv-md-diagram-pending`，文字依序是三個 fence 的 JSON；
     - 外部圖片沒給 resolver 時顯示 `[Image: 流量圖]`；
     - 原文含 `<script>alert(1)</script>` 和 `<img src=x onerror=alert(1)>` 時，DOM 裡既沒有 `script` 也沒有 `img`；
     - `[x](javascript:alert(1))` 渲染成 `span`，沒有 `a`；
     - 一般連結帶 `target="_blank"`、`rel="noopener noreferrer"`；
     - `![a](data:image/png;base64,AAAA)` 搭配回傳原 src 的 resolver，`img` 的 src 以 `data:` 開頭（證明 sanitize 沒清掉）；
     - `[![a](https://x.example/a.png)](https://y.example)` 搭配回 `{ link }` 的 resolver，DOM 裡只有一個 `a`。
   - verify：`pnpm test src/markdown`
   - commit：`feat(markdown-excalidraw): render markdown with react-markdown and sanitize`

4. **`FileViewer` 開 `.md`。**
   - 新檔 `src/viewer/markdown-body.tsx`：`MarkdownBody({ blob }: { blob: Blob })`，用 `export default` 匯出，方便 lazy 載入。
     - 新檔 `src/viewer/blob-text.ts`：`blobText(blob: Blob): Promise<string>`，用 module 層的 `WeakMap<Blob, Promise<string>>` 快取 `blob.text()`。不能在 render 裡用 `useMemo` 產生 promise：元件 suspend 時 memo 不會保留，每次重試都會拿到新的 promise，變成無窮迴圈。
     - 文字用 `use(blobText(blob))` 取得，不用 `useEffect`。
     - 從 03 的 viewer context 取 `messages`、`theme` 和宿主 props（`grep -rn "createContext" src/viewer`）。
     - 渲染 `<MarkdownView source theme={resolved} copy={markdownCopy(messages)} resolveImage={props.markdown?.resolveImage}>`，`MarkdownView` 和 `markdownCopy` 都從 `src/markdown/index.ts` import。
     - `resolved` 的來源：03 已經有「`theme` 沒給就跟 OS」的 hook 就用它（`grep -rn "prefers-color-scheme" src`）。沒有的話，新檔 `src/viewer/use-resolved-theme.ts`，`useResolvedTheme(theme?: "light" | "dark"): "light" | "dark"`，用 `useSyncExternalStore` 訂閱 `matchMedia("(prefers-color-scheme: dark)")`。
   - 03 的 view 分派元件（`grep -rn 'case "markdown"' src/viewer`）把 `case "markdown"` 改成 `<Suspense fallback={03 的 loading 狀態}><LazyMarkdownBody blob={…}/></Suspense>`，其中 `LazyMarkdownBody = lazy(() => import("./markdown-body"))`，`blob` 用 03 交給 text 分支的同一個。
   - 03 顯示頂列「編輯」鈕的條件（`grep -rn "kind.edit\|\.edit &&\|edit !== null" src/viewer`）加上 `&& kind.edit !== "markdown"`。
   - 測試：
     - 03 的分派測試檔（同一個 grep 會找到的 `*.test.tsx`）加一案：`file` 是 `doc.md`、內容 `# Hi` 時，等到 `h1` 出現。
     - 再加一案：有 `onSave` 的 `.md`，頂列沒有「Edit」鈕。
   - verify：`pnpm test src/viewer src/markdown && pnpm build && pnpm check`（`pnpm check` 裡的 `scripts/check-entry-deps.mjs` 會確認 `dist/index.js` 沒有靜態 import `react-markdown`）
   - commit：`feat(markdown-excalidraw): open markdown files in FileViewer`

phase 結尾 verify：`pnpm test src/markdown src/viewer src/i18n && pnpm build && pnpm check`

## Phase 02 — 讀的圖與 `.excalidraw`

blocker：Phase 01；model：opus（字型路徑、CSP 測試架子要邊做邊判斷）。

1. **Excalidraw 依賴與字型。**
   - `pnpm add @excalidraw/excalidraw@0.18.1 --save-exact`。
   - 新檔 `scripts/copy-excalidraw-assets.mjs`：
     - 用 `createRequire(import.meta.url).resolve("@excalidraw/excalidraw")` 拿到 `.../dist/prod/index.js`，往上一層找到 `dist/prod/fonts/`；
     - 整個目錄用 `fs.cpSync(…, { recursive: true })` 複製到 `dist/excalidraw-assets/fonts/`；
     - 檢查 `dist/excalidraw-assets/fonts/Excalifont/` 至少有一個 `.woff2`，沒有就 `exit 1`。
   - `package.json` 的 `build` 從原本的命令改成 `<原命令> && node scripts/copy-excalidraw-assets.mjs`。`files` 已經包含 `dist`，不用改。
   - 新檔 `src/excalidraw/asset-path.ts`：
     - 加 `declare global { interface Window { EXCALIDRAW_ASSET_PATH?: string | string[] } }`；
     - `setAssetPath(path: string | undefined): void`：`path` 有值而且和目前值不同時，寫進 `window.EXCALIDRAW_ASSET_PATH`；沒值時不動。
   - 02 定義 `FileViewerProps` 的那個檔加 `excalidraw?: { assetPath?: string }`，旁邊用註解寫明「裡面有 `fonts/` 的目錄 URL」。
   - `THIRD_PARTY_NOTICES.md`：
     - runtime 依賴段加 `@excalidraw/excalidraw 0.18.1 MIT`、`react-markdown`、`remark-gfm`、`rehype-sanitize`、`unified`、`remark-parse`（都是 MIT）；
     - 新增一段「Bundled fonts（`dist/excalidraw-assets/fonts`，copied from @excalidraw/excalidraw 0.18.1）」，逐一列出九個字型家族：Excalifont、Virgil、Xiaolai、Nunito、Lilita One、Cascadia Code、Liberation Sans、Assistant 是 SIL OFL 1.1，Comic Shanns 是 MIT；附 OFL 1.1 全文。
   - 測試 `src/excalidraw/asset-path.test.ts`：
     - 呼叫 `setAssetPath("/a/")` 後，`window.EXCALIDRAW_ASSET_PATH` 是 `"/a/"`；
     - 再呼叫 `setAssetPath(undefined)` 時值不變。
   - verify：`pnpm test src/excalidraw/asset-path.test.ts && pnpm build && ls dist/excalidraw-assets/fonts/Excalifont/*.woff2 && pnpm check`
   - commit：`feat(markdown-excalidraw): ship excalidraw fonts and asset path`

2. **`parseScene` 與 `DiagramImage`。**
   - 新檔 `src/excalidraw/parse-scene.ts`，不 import Excalidraw：
     - `parseScene(json: string): { ok: true; scene: { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> }; alt: string } | { ok: false }`；
     - `JSON.parse` 失敗、`type !== "excalidraw"`、或 `elements` 不是陣列時，回 `{ ok: false }`；
     - `appState`、`files` 沒有時補 `{}`；
     - `alt` = 前 10 個 `type === "text"` 而且 `isDeleted !== true` 的元素的 `text`，用空白串起來。
   - 新檔 `src/excalidraw/diagram-image.tsx`：`DiagramImage({ json, theme, assetPath, alt })`，用 `export default` 匯出，方便 lazy 載入。
     - render 時先呼叫 `setAssetPath(assetPath)`（`src/excalidraw/asset-path.ts`）。這是冪等的全域賦值，一定要在 Excalidraw 讀字型之前做。
     - 狀態 `url: string | null`，以及 `failed: boolean`。
     - 用 `useCallback((img: HTMLImageElement | null) => { … return cleanup }, [json, theme])` 當 `<img ref>`，不用 `useEffect`。callback 依序做：
       1. `parseScene(json)`（`src/excalidraw/parse-scene.ts`）；
       2. `restore(scene, null, null)`（`@excalidraw/excalidraw`）；
       3. `exportToSvg({ elements: getNonDeletedElements(restored.elements), appState: { ...restored.appState, exportWithDarkMode: theme === "dark", exportBackground: true }, files: restored.files })`（`@excalidraw/excalidraw`）；
       4. `new XMLSerializer().serializeToString(svg)` → `new Blob([…], { type: "image/svg+xml" })` → `URL.createObjectURL` → `setUrl`。
     - cleanup 設 `cancelled = true`，並對已經建立的 URL 做 `URL.revokeObjectURL`。
     - 任何一步 throw，就把 `failed` 設成 true。
     - `<img className="fv-diagram-img" alt={alt} src={url ?? undefined}>`。url 還沒好時，旁邊顯示 `className="fv-spinner"` 的 spinner（02 有 spinner 樣式就用 02 的 class，`grep -rn "spinner" src/styles.css`）。`failed` 時改成渲染 `props.broken`。
   - 新檔 `src/excalidraw/index.ts`：匯出 `DiagramImage`、`DiagramImageProps`、`parseScene`、`setAssetPath`。
   - `src/styles.css` 追加 `.fv-diagram-img`（最寬 100%、高 auto、置中）、`.fv-diagram-broken`。
   - 測試：
     - `src/excalidraw/parse-scene.test.ts`（jsdom），案例：合法場景回 `ok` 而且 `alt` 是文字串；壞 JSON；`type` 不對；沒有 `elements`；`appState` 沒有時補 `{}`；超過 10 段文字時只取前 10 段；已刪除的文字不算。
     - `src/excalidraw/diagram-image.browser.test.tsx`（browser），案例：
       - fixture 的第一張圖渲染後 `img.src` 以 `blob:` 開頭，`alt` 是 `Hello`；
       - theme 從 light 換成 dark 時 src 換了，舊的 URL 被 revoke（spy `URL.revokeObjectURL`）；
       - unmount 後，`createObjectURL` 和 `revokeObjectURL` 的呼叫次數相等；
       - `{not json` 顯示 broken 的內容和原文。
     - 圖的 JSON 從 `test/fixtures/doc-with-diagrams.md` 用 `findFences`（`src/markdown/fences.ts`）取。
   - 若 `pnpm test:browser` 在預先打包時報 target 錯誤，就在 vitest browser project 加 `optimizeDeps.esbuildOptions.target: "es2022"`（storage 11 第 1 步的做法）；沒報錯就不加。
   - verify：`pnpm test src/excalidraw && pnpm test:browser src/excalidraw/diagram-image.browser.test.tsx`
   - commit：`feat(markdown-excalidraw): render diagrams as svg images`

3. **文件裡的圖與 `.excalidraw` 預覽。**
   - 新檔 `src/markdown/diagram-block.tsx`：`DiagramBlock({ fence, theme, copy, assetPath, onEdit, editLabel }: { fence: Fence; theme: "light" | "dark"; copy: MarkdownCopy; assetPath?: string; onEdit?: () => void; editLabel?: string })`。
     - 先跑 `parseScene(fence.json)`（`src/excalidraw/parse-scene.ts`）。失敗時輸出 `<div className="fv-diagram-broken"><p>{copy.diagramBroken}</p><pre>{fence.json}</pre></div>`，不載入 Excalidraw。
     - 成功時輸出 `<Suspense fallback={<span className="fv-diagram-loading">spinner + {copy.diagramLoading}</span>}><LazyDiagramImage json={fence.json} theme assetPath alt={alt} broken={同上的 broken 區塊}/></Suspense>`，其中 `LazyDiagramImage = lazy(() => import("../excalidraw/diagram-image"))`。
     - 有 `onEdit` 時，外面包一層 `<button type="button" className="fv-diagram" aria-label={editLabel} onClick={onEdit}>`，加一個 `<span className="fv-diagram-hint">{editLabel}</span>`，只在 hover / focus-visible 時顯示。沒有 `onEdit` 時包 `<figure className="fv-diagram">`。
   - `src/markdown/markdown-view.tsx` 的 `pre` 元件：原本輸出 `.fv-md-diagram-pending` 的地方，改成 `<DiagramBlock fence theme={props.theme} copy={props.copy} assetPath={props.assetPath} onEdit={props.onEditDiagram && (() => props.onEditDiagram(fence))} editLabel={props.editLabel}>`。
   - `src/viewer/markdown-body.tsx`：多傳 `assetPath={props.excalidraw?.assetPath}`。
   - 新檔 `src/viewer/excalidraw-body.tsx`：`ExcalidrawBody({ blob }: { blob: Blob })`，用 `export default` 匯出。
     - 文字用 `use(blobText(blob))` 取得（`src/viewer/blob-text.ts`）。
     - 輸出 `<div className="fv-excalidraw">`，裡面是 `<DiagramBlock fence={{ index: 0, start: 0, end: text.length, json: text }} theme copy={markdownCopy(messages)} assetPath={props.excalidraw?.assetPath}>`，不傳 `onEdit`；整檔的編輯走 03 的頂列鈕。
     - `markdownCopy` 從 `src/markdown/copy.ts` import；theme 的取法和 `src/viewer/markdown-body.tsx` 一樣（它 import 的那個 hook）。
   - 03 的 view 分派元件（`grep -rn 'case "excalidraw"' src/viewer`）：`case "excalidraw"` 改成 `<Suspense><LazyExcalidrawBody blob/></Suspense>`，`LazyExcalidrawBody = lazy(() => import("./excalidraw-body"))`。
   - `src/styles.css` 追加 `.fv-diagram`（button 去掉外框、`position: relative`、focus-visible 外框用 `--ak-*`）、`.fv-diagram-hint`、`.fv-diagram-loading`、`.fv-excalidraw`（撐滿、置中、可捲動）。動畫只用 opacity，不回彈。
   - 新 fixture `test/fixtures/diagram.excalidraw`：和 `doc-with-diagrams.md` 第一張圖同一份 JSON。
   - 測試：
     - `src/markdown/markdown-view.test.tsx` 改案例：原本「三個 `.fv-md-diagram-pending`」改成「兩個 `.fv-diagram` 加一個 `.fv-diagram-broken`，broken 那個含 `This diagram can't be read`」。新增：有 `onEditDiagram` 時 `.fv-diagram` 是 `button`，點第二個會收到 `index === 1` 的 fence。jsdom 只驗結構，lazy 圖的內容不等。
     - 03 的分派測試檔加一案：開 `.excalidraw` 時出現 `.fv-excalidraw`。
   - verify：`pnpm test src/markdown src/viewer && pnpm test:browser src/excalidraw && pnpm build && pnpm check`（入口檢查會確認 `dist/index.js` 不含 `@excalidraw`）
   - commit：`feat(markdown-excalidraw): show diagrams in markdown and excalidraw files`

4. **CSP 與零請求的測試。**
   - 新目錄 `test/csp/`：
     - `test/csp/index.html`：一個 `#root`，載入 `./main.tsx`。
     - `test/csp/main.tsx`：依 `location.search` 的 `?f=md` 或 `?f=excalidraw`，用 `blobSource`（`src/index.ts`）包 `../fixtures/doc-with-diagrams.md` 或 `../fixtures/diagram.excalidraw`（`?raw` import 再轉成 `Blob`），渲染 `<FileViewer file excalidraw={{ assetPath: "/" }}>`。外面的容器 `height: 100vh`，`tokens.css` 和 `src/styles.css` 都要 import。
     - `test/csp/vite.config.ts`：
       - `root` 指向 `test/csp`；
       - `publicDir` 指向 repo 的 `dist/excalidraw-assets`，所以字型會在 `/fonts/...`；
       - `preview.headers` 設 `Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`。這是 storage `public/_headers` 現行的 CSP，只拿掉 accounts 網域。
   - 新檔 `scripts/csp-smoke.mjs`：
     1. 用 vite 的 `build({ configFile: "test/csp/vite.config.ts" })` 建置，再用 `preview(...)` 起在隨機 port。
     2. 用 `playwright` 的 `chromium` 開頁面。
     3. `page.addInitScript` 掛 `securitypolicyviolation` 的 listener，把事件存到 `window.__violations`。
     4. `page.on("request")` 記錄所有 origin 不是 preview 位址、也不是 `blob:` / `data:` 的請求。
     5. 開 `?f=md`，等到 2 個 `.fv-diagram img[src^="blob:"]` 出現。
     6. 開 `?f=excalidraw`，等到 1 個 `img[src^="blob:"]` 出現。
     7. 斷言：`__violations` 是空的；外部請求是 0 個；至少有一個 `/fonts/Excalifont/` 的回應是 200。
     8. 印出結果，失敗就 `exit 1`。
   - `package.json` 加 `"test:csp": "pnpm build && node scripts/csp-smoke.mjs"`。
   - `.github/workflows/ci.yml` 在 browser 測試那個 job 後面加一步 `pnpm test:csp`。
   - verify：`pnpm test:csp`
   - commit：`test(markdown-excalidraw): prove diagrams render under the storage csp with no outside requests`

phase 結尾 verify：`pnpm test src/markdown src/excalidraw src/viewer && pnpm test:browser src/excalidraw && pnpm test:csp && pnpm check`

## Phase 03 — 圖的編輯與存檔

blocker：Phase 02；model：opus。

1. **`DiagramEditor`。**
   - 新檔 `src/excalidraw/editor-copy.ts`：
     - `DiagramEditorCopy = { save: string; cancel: string; discardTitle: string; discard: string; keepEditing: string }`；
     - `diagramEditorCopy(messages: Messages): DiagramEditorCopy`，從 `src/i18n/messages.ts` 的 `Messages` 取 `diagram.save`、`diagram.cancel`、`diagram.discardTitle`、`diagram.discard`、`diagram.keepEditing`。
   - 這五個 key 加上 `diagram.edit`，寫進 `src/i18n/messages.ts`、`src/i18n/en.ts`、`src/i18n/zh-TW.ts`，字串見契約表。
   - 新檔 `src/excalidraw/discard-dialog.tsx`：`DiscardDialog({ open, copy, container, onKeep, onDiscard })`，用 `AlertDialog`（`@base-ui/react/alert-dialog`）的 `Root`、`Portal`、`Backdrop`、`Popup`、`Title`、`Close`。
     - `Portal` 的 `container` 用傳進來的 `.fv-root` 元素，這樣主題變數才套得到。
     - 兩顆鈕用 `Button`（`src/primitives/button.tsx`）。
     - class 用 `.fv-alert`、`.fv-alert-backdrop`。
   - 新檔 `src/excalidraw/diagram-editor.tsx`：`DiagramEditor(props: DiagramEditorProps)`，props 見契約，用 `export default` 匯出。
     - 第一行 `import "@excalidraw/excalidraw/index.css"`。render 時先 `setAssetPath(props.assetPath)`（`src/excalidraw/asset-path.ts`）。
     - 初始資料：`initial = useMemo(() => parseScene(props.json), [props.json])`（`src/excalidraw/parse-scene.ts`），呼叫端保證是 `ok`。
     - 渲染 `<Excalidraw>`（`@excalidraw/excalidraw`），參數：
       - `initialData={{ ...initial.scene, scrollToContent: true }}`、`theme={props.theme}`；
       - `langCode={props.locale === "zh-TW" ? "zh-TW" : "en"}`；
       - `UIOptions={{ canvasActions: { loadScene: false, export: false, saveToActiveFile: false, saveAsImage: false, toggleTheme: false } }}`；
       - `excalidrawAPI={(api) => { apiRef.current = api }}`。
     - `onChange`：
       - 第一次呼叫時，把 `hashElementsVersion(elements)`（`@excalidraw/excalidraw`）記成基準；
       - 之後每次都和基準比較，結果寫進 `dirtyRef`；
       - 只有 dirty 翻轉時才 `setDirty` 並呼叫 `props.onDirtyChange?.(dirty)`。
     - 頂列 `.fv-editor-bar`：左側是錯誤訊息，右側是「取消」「儲存」兩顆 `Button`。
     - 儲存：
       1. `setSaving(true)`；
       2. `json = serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local")`（`@excalidraw/excalidraw`）；
       3. `await props.onSave(json)`；成功就 `props.onDirtyChange?.(false)`，再 `props.onClose()`；
       4. 失敗就 `setError(e instanceof Error ? e.message : String(e))`、`setSaving(false)`，dirty 保持不變。
       - 存檔中兩顆鈕都 `disabled`，「儲存」鈕裡換成 spinner。
     - 取消：dirty 時打開 `DiscardDialog`（`src/excalidraw/discard-dialog.tsx`）。選「放棄」就呼叫 `props.onDirtyChange?.(false)` 再 `props.onClose()`；不 dirty 時直接 `props.onClose()`。
     - `.fv-root` 元素用編輯器根元素 ref 的 `closest(".fv-root")` 取得。
     - 外層 `.fv-diagram-editor`（`display: flex; flex-direction: column; height: 100%`），Excalidraw 放在 `flex: 1; min-height: 0` 的區塊裡。
   - `src/excalidraw/index.ts` 加匯出 `DiagramEditor`、`DiagramEditorProps`、`DiagramEditorCopy`、`diagramEditorCopy`。
   - `src/styles.css` 追加 `.fv-diagram-editor`、`.fv-editor-bar`、`.fv-alert`、`.fv-alert-backdrop`，動畫只用 opacity。
   - 測試 `src/excalidraw/diagram-editor.browser.test.tsx`（browser，外面包一個 `<div className="fv-root" style="height:600px">`），案例：
     - 出現 `.excalidraw` 元素；`theme="dark"` 時有 `.theme--dark`；
     - 點 `[data-testid="main-menu-trigger"]` 打開主選單後，沒有 `[data-testid="load-button"]`、`[data-testid="json-export-button"]`、`[data-testid="image-export-button"]`、`[data-testid="save-button"]`、`[data-testid="save-as-button"]`；
     - 沒改就按「Cancel」：直接呼叫 `onClose`，沒有 dialog；
     - 按 `r` 在 canvas 上拖出一個矩形後，`onDirtyChange(true)` 只被呼叫一次；
     - dirty 時按「Cancel」出現「Discard your changes?」：按「Keep editing」後 dialog 關閉、`onClose` 沒被呼叫；按「Discard」後依序呼叫 `onDirtyChange(false)` 和 `onClose`；
     - 按「Save」時，`onSave` 收到的 JSON `JSON.parse` 後 `type === "excalidraw"`，`elements` 比原本多一個；
     - `onSave` reject `new Error("disk full")` 時，畫面出現 `disk full`、`onClose` 沒被呼叫、「Save」可以再按。
   - verify：`pnpm test src/i18n && pnpm test:browser src/excalidraw/diagram-editor.browser.test.tsx`
   - commit：`feat(markdown-excalidraw): edit diagrams with excalidraw`

2. **接上 `FileViewer` 的存檔。**
   - `src/viewer/markdown-body.tsx` 改動：
     - 狀態 `source`（初值是讀到的文字）、`editing: Fence | null`、`focusIndex: number | null`。
     - 宿主有 `onSave` 時，`MarkdownView` 多傳 `onEditDiagram={(f) => setEditing(f)}` 和 `editLabel={messages 的 diagram.edit}`。
     - `editing` 有值時，整個 body 換成 `<Suspense><LazyDiagramEditor json={editing.json} theme locale copy={diagramEditorCopy(messages)} assetPath={props.excalidraw?.assetPath} onDirtyChange={props.onDirtyChange} onSave={save} onClose={() => { setFocusIndex(editing.index); setEditing(null) }}/></Suspense>`。`LazyDiagramEditor = lazy(() => import("../excalidraw/diagram-editor"))`，`diagramEditorCopy` 從 `src/excalidraw/editor-copy.ts` import。
     - `save(json)`：`next = replaceFence(source, editing, json)`（`src/markdown/fences.ts`），然後 `await props.onSave({ blob: new Blob([next], { type: "text/markdown" }), mime: "text/markdown", ext, mode: "replace", suggestedName: file.name })`；成功後 `setSource(next)`。`ext` 是 `file.name` 最後一個 `.` 起的小寫字串。
     - 回到文件後，用 `.fv-md` 的 ref callback 找第 `focusIndex` 個 `.fv-diagram` 並 `focus()`，然後清掉 `focusIndex`。
   - `src/viewer/excalidraw-body.tsx` 改動：多收 `editing: boolean`、`onExitEdit: () => void` 兩個 props，由 03 的編輯切換點傳進來。
     - 狀態 `json`（初值是讀到的文字）。
     - `editing` 時換成 `LazyDiagramEditor`，參數和 `markdown-body.tsx` 相同，但 `onSave = async (j) => { await props.onSave({ blob: new Blob([j], { type: "application/vnd.excalidraw+json" }), mime: "application/vnd.excalidraw+json", ext: ".excalidraw", mode: "replace", suggestedName: file.name }); setJson(j) }`，`onClose = props.onExitEdit`。
     - 檔案本身 `parseScene` 失敗時，不渲染編輯器，而是顯示 broken 區塊。
   - 03 的編輯切換點（`grep -rn 'case "excalidraw"\|EditKind' src/viewer`）：`edit === "excalidraw"` 時，不另開 editor 元件，而是把 `editing` 和 `onExitEdit` 傳給同一個 `ExcalidrawBody`，讓讀和編輯共用同一份已讀進來的 bytes。
   - `test/csp/main.tsx` 加 `onSave={async () => {}}`。`scripts/csp-smoke.mjs` 在 `?f=md` 那段多做：點第一個 `.fv-diagram`，等 `.excalidraw canvas` 出現，再斷言一次沒有 violation、沒有外部請求。
   - 測試 `src/viewer/markdown-body.test.tsx`（jsdom），用 `vi.mock("../excalidraw/diagram-editor")` 換成一個假元件：它有一顆按鈕，按下去呼叫 `onSave(<改過的 JSON>)`，成功後呼叫 `onClose`。fixture 用 `test/fixtures/doc-with-diagrams.md`。案例：
     - 點第二張圖再按假按鈕：`onSave` 收到 `mode: "replace"`、`ext: ".md"`、`mime: "text/markdown"`、`suggestedName: "doc-with-diagrams.md"`；`blob.text()` 和原文逐字比對時只有第二個 fence 的內容行不同（list 縮排前綴保留），第一張圖和其他文字 byte 相同；
     - `onSave` reject 時 `source` 不變，假編輯器還在；
     - 沒給 `onSave` 時 `.fv-diagram` 不是 button；
     - 存好之後，focus 在第二個 `.fv-diagram` 上。
   - 測試 `src/viewer/excalidraw-body.test.tsx`（jsdom，同樣 mock）：
     - `editing` 時按假按鈕，`onSave` 收到 `ext: ".excalidraw"`、`mime: "application/vnd.excalidraw+json"`，blob 內容就是新 JSON；
     - 成功後呼叫 `onExitEdit`。
   - verify：`pnpm test src/viewer && pnpm test:csp`
   - commit：`feat(markdown-excalidraw): save edited diagrams through onSave`

phase 結尾 verify：`pnpm test src/markdown src/excalidraw src/viewer src/i18n && pnpm test:browser src/excalidraw && pnpm test:csp && pnpm check`

宿主要做的事（不在本 plan 的步驟裡）：

- **H1（storage 22 Phase 1）**：
  - `onSave` 實作 storage 11 第 5 步的 `saveText`，包括舊檔已不在就 toast、不上傳；
  - build 時把 `node_modules/@anyknown/file-viewer/dist/excalidraw-assets/` 複製到 `public/excalidraw-assets/`，傳 `excalidraw={{ assetPath: "/excalidraw-assets/" }}`；
  - storage 的 `public/third-party-notices.txt` 收錄字型那一段；
  - 走查：storage 11 的 Story 6。
- **H2（product file-viewer-host）**：
  - `resolveImage` 照判斷裡的 `imageKind` 對應；
  - 字型目錄和 `assetPath` 的做法同 H1；
  - desktop 的 CSP 也要能載入同源的 `/excalidraw-assets/fonts/`。
- **05 site**：「接上你的 app」頁寫：
  - 複製 `dist/excalidraw-assets/` 並傳 `assetPath`，不給就會去 esm.sh 抓字型；
  - `resolveImage` 的三種回傳；
  - 最低 CSP 用 Phase 02 第 4 步那一行。

## 之後再做

- 在 UI 編輯 `.md` 的文字、新建文件、在文件裡插入新圖、新建 `.excalidraw`（00 §5 的「之後」）。
- `.md` 裡的相對連結與相對圖片指到宿主的其他檔：靠 `resolveImage` 擴充，宿主要時再開。
- 程式碼語法上色（00 §5）。
- Excalidraw 素材庫（「瀏覽素材庫」會開外站分頁，CSP 擋住頁面內的載入；不處理，同 storage 11 §3）。
- 字型目錄改成 optional（目前會跟著發佈，約 13 MB）：等有宿主在意安裝體積再說。
