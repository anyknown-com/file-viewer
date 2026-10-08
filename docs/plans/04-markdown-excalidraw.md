# 04 markdown-excalidraw — `.md` 排版、` ```excalidraw ` 畫成圖、點圖編輯；`.excalidraw` 單檔同一套

狀態：planned（2026-10-08；選型沿用 storage 11，2026-10-05 CEO / CTO 定）；blocker：03 viewer-core 全部（`bodies`、`editors`、`FileViewer` 的編輯模式）；與 05 平行；model：見各 Phase；push：本 plan 做完一次。

這份從 storage `docs/plans/11-doc-viewer.md` 搬來，設計不重開。和 storage 11 不同的地方：

- 路徑從 storage 的 `src/lib/`、`src/components/files/doc/` 改成本 repo 的 `src/markdown/`、`src/excalidraw/`、`src/viewer/`。
- `saveText`（`files.list()` 確認舊檔還在 → 上傳 → `remove` → `reload` → `openPreview`）不在這裡。本套件只交出 `SaveRequest`，其餘都是宿主的事：**H1（storage 22 Phase 1）** 用 `onSave` 做 storage 11 第 5 步的 `saveText`，同一段也處理「舊檔已被別處刪掉 → toast、不上傳」。
- Dialog / AlertDialog / Button / Spinner 用 02 的基本元件（`DiscardDialog`、`Button`、`Spinner`），不自己寫；樣式是 `--ak-*` 加 plain CSS（寫在 `src/styles.css`）。
- 字串不傳 `copy` 物件，改用 02 的 `useT(markdownMessages)`、`useT(excalidrawMessages)`；「儲存」「取消」用 `common.*`，放棄修改的對話框用 `discard.*`。
- 圖片多一條 `resolveImage` 回呼（00 §3）。storage 的做法是「圖片一律不載入」，現在變成本套件的預設值。
- 字型改由本套件打包：`pnpm build` 把 Excalidraw 的字型複製進 `dist/excalidraw-assets/`，宿主從本套件複製這個目錄（理由見判斷）。
- 走查（storage 11 第 6 步的 Story 6）換成本 repo 的 browser 測試和 `pnpm test:csp`。宿主各自的 e2e 由 H1 / H2 負責。

## 判斷

- **Markdown 用 `react-markdown@10` + `remark-gfm` + `rehype-sanitize`，開 `skipHtml`，不裝 `rehype-raw`**（storage 11 §2）。輸出 React 元素、不走 `innerHTML`。`components` 直接把 excalidraw 區塊換成宿主給的元件。
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
- **`.md` 沒有頂列的「編輯」**：`markdown` 不在 `src/viewer/editors.ts` 登錄（00 §3「編輯器開關」），`kindOf` 對 `.md` 回 `edit: null`，頂列自然沒有「編輯」。v0.1 能編輯的只有圖，入口是點圖，由 `src/viewer/markdown-body.tsx` 自己開 `DiagramEditor`。`.excalidraw` 在 P03-2 登錄進 `editors`，頂列「編輯」由 03 提供。
- **目錄依賴方向（00 §9）。** `src/markdown`、`src/excalidraw` 都只能 import `src/contract/`、`src/i18n/`、`src/primitives/`，彼此不 import，也不 import `src/viewer/`。所以 `MarkdownView` 不認得 Excalidraw：excalidraw 區塊由 `renderDiagram(fence)` 回呼畫（沒給時就畫成一般 code block，內容是原 JSON）。接上 Excalidraw 的工作只在 `src/viewer/markdown-body.tsx`、`src/viewer/excalidraw-body.tsx` 兩個檔裡做（00 §9 明列的例外）。
- **每個 subpath 的元件自己包 `ViewerRoot`**（`MarkdownView`、`DiagramEditor`、`ExcalidrawFileEditor`；巢狀時 `ViewerRoot` 直接渲染 children，所以在 `FileViewer` 裡不會多一層）。`DiagramImage` 不需要 root（只吃 props）。`DiagramBlock` 只給 viewer 側用，不匯出，要在 `ViewerRoot` 裡面。
- 不做（見「之後再做」）：在 UI 改 `.md` 文字、新建圖、相對路徑的圖片、程式碼上色。

## 契約

**本 plan 擁有的符號**（00 §9 登記；其他 plan 用到時以這張表為準）：

| 符號 | 檔 | 步驟 |
| --- | --- | --- |
| `ImageResolution`、`ImageResolver` | `src/contract/image-resolver.ts`；`src/index.ts` 再匯出型別 | P01-2 |
| `FileViewerProps["markdown"]` 改成 `{ resolveImage?: ImageResolver }` | `src/contract/props.ts` | P01-2 |
| `markdownMessages`、`MarkdownKey`、`MarkdownMessages`（key 前綴 `markdown.*`） | `src/markdown/messages.ts`；`src/i18n/messages.ts` 的 `Messages` 加 `& MarkdownMessages` | P01-2 |
| `excalidrawMessages`、`ExcalidrawKey`、`ExcalidrawMessages`（key 前綴 `excalidraw.*`） | `src/excalidraw/messages.ts`；`Messages` 加 `& ExcalidrawMessages` | P02-2 |
| `./markdown` 的 `exports` 與 `tsdown.config.ts` 的 `entry` | `package.json`、`tsdown.config.ts`、`src/markdown/index.ts` | P01-1 |
| `./excalidraw` 的 `exports` 與 `entry` | `package.json`、`tsdown.config.ts`、`src/excalidraw/index.ts` | P02-2 |
| `bodies.markdown`、`bodies.excalidraw` | `src/viewer/bodies.tsx` | P01-4、P02-3 |
| `editors.excalidraw` → `ExcalidrawFileEditor(props: EditorProps)` | `src/viewer/editors.ts`、`src/excalidraw/file-editor.tsx` | P03-2 |

**用到別的 plan 的符號**（出處以 00 §9 為準；實作時直接從這些檔 import，不經 `src/index.ts`）：

| 符號 | 檔 | 簽名 | 擁有 |
| --- | --- | --- | --- |
| `FileViewerProps`（含 `excalidraw?: { assetPath?: string }`、`onSave`、`onDirtyChange`、`onEditingChange`）、`CommonProps`、`Theme` | `src/contract/props.ts` | 00 §3 | 02 P03-2；`onEditingChange` 03 第 8 步 |
| `EditorProps` | `src/contract/editor.ts` | `CommonProps & { onSave: SaveHandler; onClose: () => void; onDirtyChange?; maxOutputBytes?; assets? }` | 03 第 8 步 |
| `SaveRequest`、`SaveHandler` | `src/contract/save.ts` | 00 §3 | 02 P02-4 |
| `splitName`、`suggestedName` | `src/contract/save.ts` | `splitName(name): { stem; ext }`（`ext` 含點）；`suggestedName(original: string, ext: string, mode: SaveMode): string` | 02 P02-4 |
| `ByteSource`、`FileRef`、`blobSource`、`bytesSource`、`readBlob` | `src/contract/byte-source.ts` | `readBlob(source: ByteSource, opts: { type: string; signal?: AbortSignal }): Promise<Blob>` | 02 P02-2 |
| `mimeOf` | `src/contract/kinds.ts` | `mimeOf(file: { name: string; mime?: string }): string` | 02 P02-3 |
| `ViewerError`、`toViewerError`、`isAbortError` | `src/contract/errors.ts` | `new ViewerError(code, { message?, cause? })`；`toViewerError(e: unknown, code: ViewerErrorCode): ViewerError`；`isAbortError(e: unknown): boolean` | 02 P02-1 |
| `Messages`、`MessageTable`、`Locale`、`commonMessages` | `src/i18n/messages.ts` | `MessageTable<K> = Record<Locale, Record<K, string>>`；`commonMessages: MessageTable<CommonKey>`（含 `common.save`、`common.cancel`、`common.close`、`common.loading`、`discard.*`、`error.<code>`） | 02 P03-1 |
| `useT` | `src/i18n/use-t.ts` | `useT<K extends string>(table: MessageTable<K>): (key: K, vars?: Vars) => string`（`Vars = Record<string, string \| number>`，`{name}` 由它代入） | 02 P03-3 |
| `ViewerRoot` | `src/primitives/root.tsx` | `ViewerRoot(props: Omit<CommonProps, "file"> & { className?: string; children: ReactNode })`；巢狀時直接渲染 children | 02 P03-3 |
| `useRoot` | `src/primitives/root-context.ts` | `useRoot(): { locale; overrides; limits; theme: Theme \| undefined; portal: HTMLElement \| null; report(e: ViewerError): void }`；在 `ViewerRoot` 外丟 Error | 02 P03-3 |
| `Button` | `src/primitives/button.tsx` | `Button(props: ComponentProps<"button"> & { variant?: "primary" \| "secondary" \| "ghost" \| "danger"; icon?: ReactNode })` | 02 P04-1 |
| `Spinner` | `src/primitives/spinner.tsx` | `Spinner(props: { label: string })`（`role="status"`、class `fv-spinner`） | 02 P04-1 |
| `DiscardDialog` | `src/primitives/dialog.tsx` | `DiscardDialog(props: { open: boolean; onOpenChange(open: boolean): void; onDiscard(): void })`；字串固定用 `discard.*`（en：`Discard your changes?`、`Discard`、`Keep editing`） | 02 P04-3 |
| `FileViewer` | `src/viewer/file-viewer.tsx` | `FileViewer(props: FileViewerProps): JSX.Element` | 03 第 6 步 |
| `bodies`、`BodyProps` | `src/viewer/bodies.tsx` | `bodies: Record<ViewKind, ComponentType<BodyProps>>`；`BodyProps = { file: FileRef; loaded: Loaded; fail(e: ViewerError): void; viewer: FileViewerProps }` | 03 第 5 步 |
| `Loaded` | `src/viewer/load.ts` | `{ blob: Blob; url: string \| null; text: string \| null }`；`markdown`、`excalidraw` 時 `text` 是字串 | 03 第 3 步 |
| `editors`、`EditorRegistry` | `src/viewer/editors.ts` | 每行 `<kind>: lazy(() => import("../<dir>/index").then((m) => ({ default: m.<Editor> })))` | 03 第 8 步 |

**本 plan 的型別與簽名：**

```ts
// src/contract/image-resolver.ts
export type ImageResolution = string | { link: string } | null;
export type ImageResolver = (src: string, alt: string) => ImageResolution;

// src/markdown/fences.ts
// start/end：整個 code block 在原文的 offset（mdast position）
export type Fence = { index: number; start: number; end: number; json: string };

// src/markdown/markdown-view.tsx
export type MarkdownViewProps = Omit<CommonProps, "file"> & {
  source: string;
  resolveImage?: ImageResolver;
  renderDiagram?: (fence: Fence) => ReactNode; // 沒給：excalidraw 區塊畫成一般 code block，內容是原 JSON
};

// src/excalidraw/diagram-image.tsx
export type DiagramImageProps = {
  json: string; theme: Theme; assetPath?: string; alt: string;
  loading: ReactNode; // 圖還沒好時顯示
  broken: ReactNode;  // export 失敗時顯示
};

// src/excalidraw/diagram-editor.tsx
export type DiagramEditorProps = Omit<CommonProps, "file"> & {
  json: string; assetPath?: string;
  onSave: (json: string) => Promise<void>; onClose: () => void; onDirtyChange?: (dirty: boolean) => void;
};

// src/excalidraw/file-editor.tsx
export function ExcalidrawFileEditor(props: EditorProps): JSX.Element;
```

- `./markdown`（`src/markdown/index.ts`）：`MarkdownView`、`MarkdownViewProps`、`findFences`、`maskFences`、`replaceFence`、`Fence`。
- `./excalidraw`（`src/excalidraw/index.ts`）：`DiagramImage`、`DiagramImageProps`、`DiagramEditor`、`DiagramEditorProps`、`ExcalidrawFileEditor`、`parseScene`、`setAssetPath`。
- i18n key（en / zh-TW；表在 `src/markdown/messages.ts`、`src/excalidraw/messages.ts`；用 `useT` 代入 `{alt}`、`{host}`）：

  | key | en | zh-TW |
  | --- | --- | --- |
  | `markdown.image` | `[Image: {alt}]` | `[圖片：{alt}]` |
  | `markdown.imageUntitled` | `Image` | `圖片` |
  | `markdown.imageLink` | `{alt} ({host})` | `{alt}（{host}）` |
  | `markdown.imageLinkTitle` | `Open image on {host}` | `在 {host} 開啟圖片` |
  | `excalidraw.loading` | `Loading diagram…` | `載入圖…` |
  | `excalidraw.broken` | `This diagram can't be read` | `這張圖讀不出來` |
  | `excalidraw.edit` | `Edit diagram` | `編輯這張圖` |

  「儲存」「取消」「關閉」「載入中」用 `common.save`、`common.cancel`、`common.close`、`common.loading`；放棄修改的對話框用 02 的 `DiscardDialog`。
- 存檔的 `SaveRequest`（00 §3）：
  - `.md`：`{ blob: new Blob([newSource], { type: "text/markdown" }), mime: "text/markdown", ext: splitName(file.name).ext, mode: "replace", suggestedName: suggestedName(file.name, ext, "replace") }`；
  - `.excalidraw`：`{ blob, mime: "application/vnd.excalidraw+json", ext: ".excalidraw", mode: "replace", suggestedName: suggestedName(file.name, ".excalidraw", "replace") }`。
- 依賴（新增到 `dependencies`；每個 `pnpm add` 的同一個 commit 都要在 `THIRD_PARTY_NOTICES.md` 的 `## Runtime dependencies` 加一行 `- <套件名> — MIT — <repo 網址>`，第一次加時把那段的 `None yet.` 換掉，否則 `pnpm check:licenses` 會紅）：
  - `react-markdown@^10.1.0`、`remark-gfm@^4.0.1`、`rehype-sanitize@^6.0.0`、`unified@^11.0.5`、`remark-parse@^11.0.0`；
  - `@excalidraw/excalidraw@0.18.1`（確切版本）。

**測試環境**（01 已提供）：`pnpm test`（jsdom，`*.test.ts(x)`）、`pnpm test:browser`（Chromium，`*.browser.test.ts(x)`）、`playwright` devDependency、`pnpm check`（含 `check:entry`，`scripts/check-entry-deps.mjs` 的黑名單含 `@excalidraw`、`react-markdown`、`remark-`、`rehype-`、`unified`）、`pnpm check:licenses`、`pnpm verify:pack`。`src/styles.css` 是單一 plain CSS 檔，每份 plan 在檔尾加一段 `/* == <area> (NN) == */`。

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
  - 改過沒存就按「取消」：跳出 02 的 `DiscardDialog`「放棄修改？」，選項是「繼續編輯」和「放棄修改」。
  - 存好之後回到文件，focus 停在同一張圖（同一個 `index`）。

## Phase 01 — Markdown 排版

blocker：03 全部；model：sonnet。

1. **fence 純函式與 `./markdown` 出口。**
   - `pnpm add remark-parse@^11.0.0 remark-gfm@^4.0.1 unified@^11.0.5`。
   - `THIRD_PARTY_NOTICES.md`：`## Runtime dependencies` 底下（把 `None yet.` 換掉）加三行：`- remark-parse — MIT — https://github.com/remarkjs/remark`、`- remark-gfm — MIT — https://github.com/remarkjs/remark-gfm`、`- unified — MIT — https://github.com/unifiedjs/unified`。
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
   - 新檔 `src/markdown/index.ts`：`export { findFences, maskFences, replaceFence } from "./fences"; export type { Fence } from "./fences";`。
   - `package.json` 的 `exports` 加 `"./markdown": { "types": "./dist/markdown/index.d.ts", "default": "./dist/markdown/index.js" }`；`tsdown.config.ts` 的 `entry` 加 `"markdown/index": "src/markdown/index.ts"`。
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
   - verify：`pnpm test src/markdown/fences.test.ts && pnpm build && test -f dist/markdown/index.js && pnpm verify:pack && pnpm check:licenses`
   - commit：`feat(markdown-excalidraw): locate, mask and replace excalidraw fences`

2. **圖片的宿主規則與字串。**
   - `pnpm add react-markdown@^10.1.0 rehype-sanitize@^6.0.0`；`THIRD_PARTY_NOTICES.md` 加 `- react-markdown — MIT — https://github.com/remarkjs/react-markdown`、`- rehype-sanitize — MIT — https://github.com/rehypejs/rehype-sanitize`。
   - 新檔 `src/contract/image-resolver.ts`：`ImageResolution`、`ImageResolver`，形狀見契約。
   - `src/contract/props.ts`（02 定義 `FileViewerProps` 的檔）：`import type { ImageResolver } from "./image-resolver"`，把 `markdown` 欄位改成 `markdown?: { resolveImage?: ImageResolver }`。`src/index.ts` 加 `export type { ImageResolution, ImageResolver } from "./contract/image-resolver"`。
   - 新檔 `src/markdown/messages.ts`（形狀照 02 契約 i18n 段）：
     - `const en = { "markdown.image": "[Image: {alt}]", "markdown.imageUntitled": "Image", "markdown.imageLink": "{alt} ({host})", "markdown.imageLinkTitle": "Open image on {host}" } satisfies Record<string, string>`；
     - `export type MarkdownKey = keyof typeof en`；`export type MarkdownMessages = Record<MarkdownKey, string>`；
     - `export const markdownMessages: MessageTable<MarkdownKey> = { en, "zh-TW": { … } }`，zh-TW 照契約表；`MessageTable` 從 `src/i18n/messages.ts` `import type`。
   - `src/i18n/messages.ts`：`import type { MarkdownMessages } from "../markdown/messages"`，`Messages` 型別的最後加 `& MarkdownMessages`。
   - 新檔 `src/markdown/sanitize-schema.ts`：`markdownSchema`，就是 `rehype-sanitize` 的 `defaultSchema` 再加上 `protocols: { ...defaultSchema.protocols, src: null }`（型別 `Schema` 也從 `rehype-sanitize` import）。
   - 新檔 `src/markdown/in-link.ts`：`InLinkContext = createContext(false)`。
   - 新檔 `src/markdown/markdown-image.tsx`：`MarkdownImage({ src, alt, resolveImage }: { src: string; alt: string; resolveImage?: ImageResolver })`，內部 `const t = useT(markdownMessages)`（`src/i18n/use-t.ts`）。`alt` 去掉空白後是空的，就改用 `t("markdown.imageUntitled")`。依 `resolveImage?.(src, alt) ?? null` 的結果顯示：
     - 字串：`<img className="fv-md-img" src={結果} alt={alt} loading="lazy">`。
     - `{ link }`：先過 `defaultUrlTransform(link)`（從 `react-markdown` import），結果是空字串就改走 `null` 那條。否則 `host = new URL(link).host`，label 是 `t("markdown.imageLink", { alt, host })`。如果 `use(InLinkContext)` 是 true（這張圖在連結裡），只輸出 `<span>{label}</span>`；不是的話輸出 `<a href={link} title={t("markdown.imageLinkTitle", { host })} target="_blank" rel="noopener noreferrer">{label}</a>`。
     - `null`：`<span className="fv-md-img-alt">{t("markdown.image", { alt })}</span>`。
   - 測試 `src/markdown/messages.test.ts`：en 與 zh-TW 的 key 集合相同；每個 key 都以 `markdown.` 開頭；`translate(markdownMessages, "zh-TW", {}, "markdown.image", { alt: "x" })`（`src/i18n/messages.ts`）等於 `[圖片：x]`。
   - 測試 `src/markdown/markdown-image.test.tsx`，用 jsdom 把元件包在 `<ViewerRoot>`（`src/primitives/root.tsx`）裡 render，案例：
     - 沒給 `resolveImage` 時顯示 `[Image: x]`，DOM 裡沒有 `img`；
     - 回字串時，`img` 的 src 就是那個字串；
     - 回 `{ link: "https://evil.example/a.png?d=1" }` 時，出現 `a`，文字是 `x (evil.example)`，`title` 是 `Open image on evil.example`；
     - 回 `{ link: "javascript:alert(1)" }` 時退回 alt 文字，沒有 `a`；
     - alt 是空的時用 `Image`；
     - 包在 `InLinkContext` 裡、回 `{ link }` 時只有文字、沒有 `a`；
     - `resolveImage` 收到的 `src`、`alt` 和傳進元件的完全一樣，包括 `data:`、`blob:`、`//host/x`。
   - verify：`pnpm test src/markdown && pnpm typecheck && pnpm check:licenses`
   - commit：`feat(markdown-excalidraw): resolve markdown images through the host`

3. **`MarkdownView`。**
   - 新檔 `src/raw.d.ts`：`declare module "*?raw" { const text: string; export default text; }`（測試用 `?raw` 讀 fixture）。
   - 新檔 `src/markdown/markdown-view.tsx`：`MarkdownView(props: MarkdownViewProps)`，props 見契約。`const { source, resolveImage, renderDiagram, ...root } = props`，輸出 `<ViewerRoot {...root}><MarkdownContent source resolveImage renderDiagram /></ViewerRoot>`（`ViewerRoot` 來自 `src/primitives/root.tsx`）。`MarkdownContent`（同檔內部元件）：
     - `fences = useMemo(() => findFences(source), [source])`、`masked = useMemo(() => maskFences(source, fences), [source, fences])`，兩個函式都來自 `src/markdown/fences.ts`。
     - `<div className="fv-md"><article className="fv-prose"><Markdown …>` 渲染 `masked`。`Markdown` 是 `react-markdown` 的 default export。
     - `Markdown` 的參數：`remarkPlugins={[remarkGfm]}`、`rehypePlugins={[[rehypeSanitize, markdownSchema]]}`（`markdownSchema` 來自 `src/markdown/sanitize-schema.ts`）、`skipHtml`。
     - `urlTransform={(url, key) => key === "src" ? url : defaultUrlTransform(url)}`。
   - `components` 換掉三個元件：
     - `a`：`href` 是空字串或沒有 `href` 時輸出 `<span>{children}</span>`；否則輸出 `<a href target="_blank" rel="noopener noreferrer">`，children 外面包一層 `<InLinkContext value={true}>`（`src/markdown/in-link.ts`）。
     - `img`：`<MarkdownImage src={String(src ?? "")} alt={String(alt ?? "")} resolveImage={resolveImage}>`（`src/markdown/markdown-image.tsx`）。
     - `pre`：用 `node`（react-markdown 會傳 hast 節點）找第一個 `code` 子元素。它的 `properties.className` 含 `language-excalidraw` 而且文字（序號）對得到 `fences` 裡的一個時：有 `renderDiagram` 就輸出 `renderDiagram(fence)`，沒有就輸出 `<pre className="fv-md-diagram-raw"><code>{fence.json}</code></pre>`。其他情況照一般的 `<pre>{children}</pre>` 輸出。
   - `src/styles.css` 檔尾加一段 `/* == markdown (04) == */`：`.fv-md`、`.fv-prose`（以及它下面的 h1–h4、p、ul、ol、`li:has(> input[type=checkbox])`、table、th、td、code、pre、blockquote、a、hr）、`.fv-md-img`、`.fv-md-img-alt`、`.fv-md-diagram-raw`，只用 `--ak-*` 變數。
   - `src/markdown/index.ts` 加 `export { MarkdownView } from "./markdown-view"; export type { MarkdownViewProps } from "./markdown-view";`。
   - 新 fixture `test/fixtures/doc-with-diagrams.md`，內容依序是：
     - h1、h2、一段文字；
     - 一個 GFM 表格、一個 task list（一項勾、一項沒勾）；
     - 一個 ` ```ts ` code block；
     - `![流量圖](https://evil.example/x.png)`；
     - 第一個 ` ```excalidraw `，內容是這一行（元素只寫必要欄位，其餘交給 Excalidraw 的 `restore` 補）：`{"type":"excalidraw","version":2,"elements":[{"id":"r1","type":"rectangle","x":0,"y":0,"width":200,"height":100},{"id":"t1","type":"text","x":40,"y":40,"width":60,"height":25,"text":"Hello","fontSize":20,"fontFamily":5}],"appState":{},"files":{}}`；
     - 一個 list 項目，裡面是縮排的第二個 ` ```excalidraw `，內容是這一行：`{"type":"excalidraw","version":2,"elements":[{"id":"e1","type":"ellipse","x":0,"y":0,"width":120,"height":80}],"appState":{},"files":{}}`；
     - 第三個 ` ```excalidraw `，內容是 `{not json`。
   - 測試 `src/markdown/markdown-view.test.tsx`（jsdom；用 `import doc from "../../test/fixtures/doc-with-diagrams.md?raw"`），案例：
     - 讀 fixture 渲染後，有 `h1`、`table`、兩個 checkbox（一個 checked）、`pre code.language-ts`；
     - 沒給 `renderDiagram` 時，三個 `.fv-md-diagram-raw`，文字依序是三個 fence 的 JSON；
     - 給 `renderDiagram={(f) => <div data-testid="d">{f.index}</div>}` 時，三個 `d`，文字依序是 `0`、`1`、`2`；
     - 外部圖片沒給 resolver 時顯示 `[Image: 流量圖]`；
     - 原文含 `<script>alert(1)</script>` 和 `<img src=x onerror=alert(1)>` 時，DOM 裡既沒有 `script` 也沒有 `img`；
     - `[x](javascript:alert(1))` 渲染成 `span`，沒有 `a`；
     - 一般連結帶 `target="_blank"`、`rel="noopener noreferrer"`；
     - `![a](data:image/png;base64,AAAA)` 搭配回傳原 src 的 resolver，`img` 的 src 以 `data:` 開頭（證明 sanitize 沒清掉）；
     - `[![a](https://x.example/a.png)](https://y.example)` 搭配回 `{ link }` 的 resolver，DOM 裡只有一個 `a`。
   - verify：`pnpm test src/markdown && pnpm build && pnpm verify:pack`
   - commit：`feat(markdown-excalidraw): render markdown with react-markdown and sanitize`

4. **`FileViewer` 開 `.md`。**
   - 新檔 `src/viewer/markdown-body.tsx`，`export default function MarkdownBody({ loaded, viewer }: BodyProps)`（`BodyProps` 從 `./bodies` `import type`）：輸出 `<MarkdownView source={loaded.text ?? ""} resolveImage={viewer.markdown?.resolveImage} />`（`MarkdownView` 從 `src/markdown/index.ts` import）。不用 `locale` / `theme` 等 props：在 `FileViewer` 裡 `ViewerRoot` 是巢狀的，直接用外層的。
   - `src/viewer/bodies.tsx`：加 `const MarkdownBody = lazy(() => import("./markdown-body"))`，把 `markdown: TextBody` 改成 `markdown: MarkdownBody`，並刪掉那行的註解 `// 04 換成 MarkdownView`。03 已經在 body 外包 `<Suspense>`（`file-viewer.tsx`），這裡不用再包。
   - 03 的 `src/viewer/bodies.test.tsx` 有一案 `bodies.markdown === bodies.text`：用 `grep -n "bodies.markdown" src/viewer/bodies.test.tsx` 找到，把與 `bodies.markdown` 有關的斷言刪掉（其他斷言不動）。
   - 測試 `src/viewer/markdown-body.test.tsx`（jsdom）。檔頭定義這個測試檔之後各步共用的輔助函式 `bodyProps(text: string, viewer: Partial<FileViewerProps> = {}): BodyProps`：`file = { name: "doc.md", source: blobSource(new Blob([text])) }`（`blobSource` 來自 `src/contract/byte-source.ts`）、`loaded = { blob: new Blob([text]), url: null, text }`、`fail = vi.fn()`、`viewer = { file, ...viewer }`。案例（元件包在 `<ViewerRoot>`）：
     - `# Hi` 渲染出 `h1`；
     - `viewer.markdown.resolveImage` 有被傳進去：`![a](x.png)` 搭配回 `"https://h.example/x.png"` 的 resolver，`img` 的 src 就是它。
   - 測試 `src/viewer/markdown-open.test.tsx`（jsdom）：`render(<FileViewer file={{ name: "doc.md", source: blobSource(new Blob(["# Hi"])) }} onSave={vi.fn()} />)`（`FileViewer` 來自 `src/viewer/file-viewer.tsx`）。案例：`await screen.findByRole("heading", { name: "Hi" })`；頂列沒有名稱是 `Edit` 的 button（`kindOf` 對 `.md` 回 `edit: null`，因為 `markdown` 沒登錄）。
   - verify：`pnpm test src/viewer src/markdown && pnpm build && pnpm check`（`pnpm check` 裡的 `scripts/check-entry-deps.mjs` 會確認 `dist/index.js` 沒有靜態 import `react-markdown`）
   - commit：`feat(markdown-excalidraw): open markdown files in FileViewer`

phase 結尾 verify：`pnpm test src/markdown src/viewer src/i18n && pnpm build && pnpm check && pnpm verify:pack && pnpm check:licenses`

## Phase 02 — 讀的圖與 `.excalidraw`

blocker：Phase 01；model：opus（字型路徑、CSP 測試架子要邊做邊判斷）。

1. **Excalidraw 依賴與字型。**
   - `pnpm add @excalidraw/excalidraw@0.18.1 --save-exact`。
   - 新檔 `scripts/copy-excalidraw-assets.mjs`：
     - 用 `createRequire(import.meta.url).resolve("@excalidraw/excalidraw")` 拿到 `.../dist/prod/index.js`，往上一層找到 `dist/prod/fonts/`；
     - 整個目錄用 `fs.cpSync(…, { recursive: true })` 複製到 `dist/excalidraw-assets/fonts/`；
     - 檢查 `dist/excalidraw-assets/fonts/Excalifont/` 至少有一個 `.woff2`，沒有就 `exit 1`。
   - `package.json` 的 `build` 從 `tsdown` 改成 `tsdown && node scripts/copy-excalidraw-assets.mjs`。`files` 已經包含 `dist`，不用改。
   - 新檔 `src/excalidraw/asset-path.ts`：
     - 加 `declare global { interface Window { EXCALIDRAW_ASSET_PATH?: string | string[] } }`；
     - `setAssetPath(path: string | undefined): void`：`path` 有值而且和目前值不同時，寫進 `window.EXCALIDRAW_ASSET_PATH`；沒值時不動。
   - `THIRD_PARTY_NOTICES.md`：
     - `## Runtime dependencies` 加 `- @excalidraw/excalidraw 0.18.1 — MIT — https://github.com/excalidraw/excalidraw`；
     - 新增一段 `## Bundled fonts`（`dist/excalidraw-assets/fonts`，copied from @excalidraw/excalidraw 0.18.1），逐一列出九個字型家族：Excalifont、Virgil、Xiaolai、Nunito、Lilita One、Cascadia Code、Liberation Sans、Assistant 是 SIL OFL 1.1，Comic Shanns 是 MIT；附 OFL 1.1 全文。
   - 測試 `src/excalidraw/asset-path.test.ts`：
     - 呼叫 `setAssetPath("/a/")` 後，`window.EXCALIDRAW_ASSET_PATH` 是 `"/a/"`；
     - 再呼叫 `setAssetPath(undefined)` 時值不變。
   - verify：`pnpm test src/excalidraw/asset-path.test.ts && pnpm build && ls dist/excalidraw-assets/fonts/Excalifont/*.woff2 && pnpm check && pnpm check:licenses`。若 `check:licenses` 只因為 `@excalidraw/excalidraw` 的遞移依賴授權失敗，停下來回報套件名與授權，不改 `scripts/check-licenses.mjs`。
   - commit：`feat(markdown-excalidraw): ship excalidraw fonts and asset path`

2. **`parseScene`、`DiagramImage` 與 `./excalidraw` 出口。**
   - 新檔 `src/excalidraw/parse-scene.ts`，不 import Excalidraw：
     - `parseScene(json: string): { ok: true; scene: { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> }; alt: string } | { ok: false }`；
     - `JSON.parse` 失敗、`type !== "excalidraw"`、或 `elements` 不是陣列時，回 `{ ok: false }`；
     - `appState`、`files` 沒有時補 `{}`；
     - `alt` = 前 10 個 `type === "text"` 而且 `isDeleted !== true` 的元素的 `text`，用空白串起來。
   - 新檔 `src/excalidraw/messages.ts`（形狀同 `src/markdown/messages.ts`）：key `excalidraw.loading`、`excalidraw.broken`、`excalidraw.edit`，字串見契約表；匯出 `ExcalidrawKey`、`ExcalidrawMessages`、`excalidrawMessages: MessageTable<ExcalidrawKey>`。`src/i18n/messages.ts` 的 `Messages` 再加 `& ExcalidrawMessages`（`import type` 從 `../excalidraw/messages`）。
   - 新檔 `src/excalidraw/diagram-image.tsx`：`DiagramImage({ json, theme, assetPath, alt, loading, broken }: DiagramImageProps)`，用 `export default` 匯出，方便 lazy 載入。
     - render 時先呼叫 `setAssetPath(assetPath)`（`src/excalidraw/asset-path.ts`）。這是冪等的全域賦值，一定要在 Excalidraw 讀字型之前做。
     - 狀態 `url: string | null`，以及 `failed: boolean`。
     - 用 `useCallback((img: HTMLImageElement | null) => { … return cleanup }, [json, theme])` 當 `<img ref>`，不用 `useEffect`。callback 依序做：
       1. `parseScene(json)`（`src/excalidraw/parse-scene.ts`）；
       2. `restore(scene, null, null)`（`@excalidraw/excalidraw`）；
       3. `exportToSvg({ elements: getNonDeletedElements(restored.elements), appState: { ...restored.appState, exportWithDarkMode: theme === "dark", exportBackground: true }, files: restored.files })`（`@excalidraw/excalidraw`）；
       4. `new XMLSerializer().serializeToString(svg)` → `new Blob([…], { type: "image/svg+xml" })` → `URL.createObjectURL` → `setUrl`。
     - cleanup 設 `cancelled = true`，並對已經建立的 URL 做 `URL.revokeObjectURL`。
     - 任何一步 throw，就把 `failed` 設成 true。
     - 輸出 `<img className="fv-diagram-img" alt={alt} src={url ?? undefined}>`；`url` 還沒好時，旁邊再顯示 `loading`。`failed` 時改成渲染 `broken`。
   - 新檔 `src/excalidraw/index.ts`：`export { default as DiagramImage } from "./diagram-image"; export type { DiagramImageProps } from "./diagram-image"; export { parseScene } from "./parse-scene"; export { setAssetPath } from "./asset-path";`。
   - `package.json` 的 `exports` 加 `"./excalidraw": { "types": "./dist/excalidraw/index.d.ts", "default": "./dist/excalidraw/index.js" }`；`tsdown.config.ts` 的 `entry` 加 `"excalidraw/index": "src/excalidraw/index.ts"`。
   - `src/styles.css` 檔尾加一段 `/* == excalidraw (04) == */`：`.fv-diagram-img`（最寬 100%、高 auto、置中）、`.fv-diagram-broken`。
   - 新 fixture `test/fixtures/diagram.excalidraw`：內容就是 `test/fixtures/doc-with-diagrams.md` 第一個 ` ```excalidraw ` 的那一行 JSON（逐字相同，結尾一個換行）。
   - 測試：
     - `src/excalidraw/messages.test.ts`：en 與 zh-TW 的 key 集合相同；每個 key 都以 `excalidraw.` 開頭。
     - `src/excalidraw/parse-scene.test.ts`（jsdom），案例：合法場景回 `ok` 而且 `alt` 是文字串；壞 JSON；`type` 不對；沒有 `elements`；`appState` 沒有時補 `{}`；超過 10 段文字時只取前 10 段；已刪除的文字不算。
     - `src/excalidraw/diagram-image.browser.test.tsx`（browser；`import diagram from "../../test/fixtures/diagram.excalidraw?raw"`），`loading` 傳 `<span>loading</span>`、`broken` 傳 `<span>broken</span>`，案例：
       - fixture 渲染後 `img.src` 以 `blob:` 開頭，`alt` 是 `Hello`；
       - theme 從 light 換成 dark 時 src 換了，舊的 URL 被 revoke（spy `URL.revokeObjectURL`）；
       - unmount 後，`createObjectURL` 和 `revokeObjectURL` 的呼叫次數相等；
       - `{not json` 顯示 `broken`。
   - 若 `pnpm test:browser` 在預先打包時報 target 錯誤，就在 vitest browser project 加 `optimizeDeps.esbuildOptions.target: "es2022"`（storage 11 第 1 步的做法）；沒報錯就不加。
   - verify：`pnpm test src/excalidraw && pnpm test:browser src/excalidraw/diagram-image.browser.test.tsx && pnpm build && test -f dist/excalidraw/index.js && pnpm verify:pack`
   - commit：`feat(markdown-excalidraw): render diagrams as svg images`

3. **文件裡的圖與 `.excalidraw` 預覽。**
   - 新檔 `src/excalidraw/use-resolved-theme.ts`：`useResolvedTheme(): Theme`（`Theme` 從 `src/contract/props.ts` `import type`）。`useRoot().theme`（`src/primitives/root-context.ts`）有值就用它；沒有就用 `useSyncExternalStore` 訂閱 `matchMedia("(prefers-color-scheme: dark)")`，server snapshot 是 `"light"`。
   - 新檔 `src/excalidraw/diagram-block.tsx`：`DiagramBlock({ json, assetPath, onEdit }: { json: string; assetPath?: string; onEdit?: () => void })`，具名匯出，要在 `ViewerRoot` 裡面用。`t = useT(excalidrawMessages)`，`theme = useResolvedTheme()`。
     - 先跑 `parseScene(json)`（`src/excalidraw/parse-scene.ts`）。失敗時輸出 `broken = <div className="fv-diagram-broken"><p>{t("excalidraw.broken")}</p><pre>{json}</pre></div>`，不載入 Excalidraw，也不管 `onEdit`。
     - 成功時 `loading = <span className="fv-diagram-loading"><Spinner label={t("excalidraw.loading")} />{t("excalidraw.loading")}</span>`（`Spinner` 來自 `src/primitives/spinner.tsx`），輸出 `<Suspense fallback={loading}><LazyDiagramImage json theme assetPath alt={…} loading={loading} broken={broken}/></Suspense>`，其中 `LazyDiagramImage = lazy(() => import("./diagram-image"))`；`alt` 用 `parseScene` 回的 `alt`。
     - 有 `onEdit` 時，外面包一層 `<button type="button" className="fv-diagram" aria-label={t("excalidraw.edit")} onClick={onEdit}>`，加一個 `<span className="fv-diagram-hint">{t("excalidraw.edit")}</span>`，只在 hover / focus-visible 時顯示。沒有 `onEdit` 時包 `<figure className="fv-diagram">`。
   - 新檔 `src/viewer/excalidraw-body.tsx`：`export default function ExcalidrawBody({ loaded, viewer }: BodyProps)`，輸出 `<div className="fv-excalidraw"><DiagramBlock json={loaded.text ?? ""} assetPath={viewer.excalidraw?.assetPath} /></div>`，不傳 `onEdit`；整檔的編輯走 03 的頂列鈕。`DiagramBlock` 從 `src/excalidraw/diagram-block.tsx` import。
   - `src/viewer/markdown-body.tsx`：`MarkdownView` 多傳 `renderDiagram={(fence) => <div className="fv-diagram-slot" data-fence={fence.index}><DiagramBlock json={fence.json} assetPath={viewer.excalidraw?.assetPath} /></div>}`。
   - `src/viewer/bodies.tsx`：加 `const ExcalidrawBody = lazy(() => import("./excalidraw-body"))`，把 `excalidraw: TextBody` 改成 `excalidraw: ExcalidrawBody` 並刪掉那行註解。`src/viewer/bodies.test.tsx` 裡與 `bodies.excalidraw` 有關、等於 `bodies.text` 的斷言（`grep -n "bodies.excalidraw" src/viewer/bodies.test.tsx`）刪掉。
   - `src/styles.css` 的 `/* == excalidraw (04) == */` 段加 `.fv-diagram`（button 去掉外框、`position: relative`、focus-visible 外框用 `--ak-*`）、`.fv-diagram-hint`、`.fv-diagram-loading`、`.fv-diagram-slot`、`.fv-excalidraw`（撐滿、置中、可捲動）。動畫只用 opacity，不回彈。
   - 測試（jsdom 的測試都要 `vi.mock("../excalidraw/diagram-image", () => ({ default: () => <img alt="mock" /> }))`，路徑依測試檔位置調整，避免在 jsdom 載入 Excalidraw）：
     - `src/excalidraw/use-resolved-theme.test.tsx`：在 `<ViewerRoot theme="dark">` 裡是 `"dark"`；沒給 theme 時，stub `window.matchMedia` 回 `matches: true` 得 `"dark"`、`false` 得 `"light"`。
     - `src/excalidraw/diagram-block.test.tsx`（包在 `<ViewerRoot>`）：壞 JSON → `.fv-diagram-broken`，含 `This diagram can't be read` 和原文；合法 JSON 沒給 `onEdit` → `figure.fv-diagram`；給 `onEdit` → `button.fv-diagram`，`aria-label` 是 `Edit diagram`，點下去 `onEdit` 被呼叫。
     - `src/viewer/markdown-body.test.tsx` 加案例：用 `test/fixtures/doc-with-diagrams.md`（`?raw`）當文字，渲染後有兩個 `.fv-diagram` 和一個 `.fv-diagram-broken`。
     - `src/viewer/excalidraw-body.test.tsx`：用 `test/fixtures/diagram.excalidraw` 渲染，出現 `.fv-excalidraw .fv-diagram`。
     - `src/viewer/excalidraw-open.test.tsx`：`FileViewer` 開 `diagram.excalidraw`（沒給 `onSave`），等到 `.fv-excalidraw` 出現。
   - verify：`pnpm test src/markdown src/excalidraw src/viewer && pnpm test:browser src/excalidraw && pnpm build && pnpm check`（入口檢查會確認 `dist/index.js` 不含 `@excalidraw`）
   - commit：`feat(markdown-excalidraw): show diagrams in markdown and excalidraw files`

4. **CSP 與零請求的測試。**
   - 新目錄 `test/csp/`：
     - `test/csp/index.html`：一個 `#root`，載入 `./main.tsx`。
     - `test/csp/main.tsx`：依 `location.search` 的 `?f=md` 或 `?f=excalidraw`，用 `blobSource`（`src/contract/byte-source.ts`）包 `import mdText from "../fixtures/doc-with-diagrams.md?raw"` 或 `import diagramText from "../fixtures/diagram.excalidraw?raw"`（轉成 `Blob`），渲染 `<FileViewer file excalidraw={{ assetPath: "/" }}>`（`FileViewer` 來自 `src/viewer/file-viewer.tsx`）。外面的容器 `height: 100vh`，依序 import `@anyknown/ui/tokens.css` 和 `../../src/styles.css`。
     - `test/csp/vite.config.ts`：
       - `root` 指向 `test/csp`，`esbuild: { jsx: "automatic" }`，`build: { outDir: "dist", emptyOutDir: true }`；
       - `publicDir` 指向 repo 的 `dist/excalidraw-assets`，所以字型會在 `/fonts/...`；
       - `preview.headers` 設 `Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`。這是 storage `public/_headers` 現行的 CSP，只拿掉 accounts 網域。
     - `.gitignore` 加一行 `test/csp/dist`。
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
   - `.github/workflows/ci.yml` 在 `pnpm turbo run build typecheck lint fmt:check check:entry test test:browser check:licenses` 那一步後面加一步 `- run: pnpm test:csp`（同一個縮排）。
   - verify：`pnpm test:csp`
   - commit：`test(markdown-excalidraw): prove diagrams render under the storage csp with no outside requests`

phase 結尾 verify：`pnpm test src/markdown src/excalidraw src/viewer && pnpm test:browser src/excalidraw && pnpm test:csp && pnpm check && pnpm verify:pack && pnpm check:licenses`

## Phase 03 — 圖的編輯與存檔

blocker：Phase 02；model：opus。

1. **`DiagramEditor`。**
   - 新檔 `src/excalidraw/diagram-editor.tsx`：`export default function DiagramEditor(props: DiagramEditorProps)`，props 見契約。`const { json, assetPath, onSave, onClose, onDirtyChange, ...root } = props`，輸出 `<ViewerRoot {...root}><EditorBody …/></ViewerRoot>`。`EditorBody`（同檔內部元件）：
     - 第一行（檔頭）`import "@excalidraw/excalidraw/index.css"`。render 時先 `setAssetPath(assetPath)`（`src/excalidraw/asset-path.ts`）。`tc = useT(commonMessages)`（`commonMessages` 來自 `src/i18n/messages.ts`），`theme = useResolvedTheme()`（`src/excalidraw/use-resolved-theme.ts`），`locale = useRoot().locale`。
     - 初始資料：`initial = useMemo(() => parseScene(json), [json])`（`src/excalidraw/parse-scene.ts`），呼叫端保證是 `ok`。
     - 渲染 `<Excalidraw>`（`@excalidraw/excalidraw`），參數：
       - `initialData={{ ...initial.scene, scrollToContent: true }}`、`theme={theme}`；
       - `langCode={locale === "zh-TW" ? "zh-TW" : "en"}`；
       - `UIOptions={{ canvasActions: { loadScene: false, export: false, saveToActiveFile: false, saveAsImage: false, toggleTheme: false } }}`；
       - `excalidrawAPI={(api) => { apiRef.current = api }}`。
     - `onChange`：
       - 第一次呼叫時，把 `hashElementsVersion(elements)`（`@excalidraw/excalidraw`）記成基準；
       - 之後每次都和基準比較，結果寫進 `dirtyRef`；
       - 只有 dirty 翻轉時才 `setDirty` 並呼叫 `onDirtyChange?.(dirty)`。
     - 頂列 `.fv-editor-bar`：左側是錯誤訊息，右側是「取消」（`Button variant="secondary"`，文字 `tc("common.cancel")`）「儲存」（`Button variant="primary"`，文字 `tc("common.save")`）兩顆（`Button` 來自 `src/primitives/button.tsx`）。
     - 儲存：
       1. `setSaving(true)`；
       2. `next = serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local")`（`@excalidraw/excalidraw`）；
       3. `await onSave(next)`；成功就 `onDirtyChange?.(false)`，再 `onClose()`；
       4. 失敗就 `setError(e instanceof Error ? e.message : String(e))`、`setSaving(false)`，dirty 保持不變。
       - 存檔中兩顆鈕都 `disabled`，「儲存」鈕的 `icon` 換成 `<Spinner label={tc("common.loading")} />`（`src/primitives/spinner.tsx`）。
     - 取消：dirty 時把 `confirmOpen` 設 true，畫 `<DiscardDialog open={confirmOpen} onOpenChange={setConfirmOpen} onDiscard={() => { onDirtyChange?.(false); onClose() }} />`（`src/primitives/dialog.tsx`；它自己 portal 到 `useRoot().portal`）；不 dirty 時直接 `onClose()`。
     - 外層 `<div className="fv-diagram-editor">`（`display: flex; flex-direction: column; height: 100%`），Excalidraw 放在 `flex: 1; min-height: 0` 的區塊裡。
   - `src/excalidraw/index.ts` 加 `export { default as DiagramEditor } from "./diagram-editor"; export type { DiagramEditorProps } from "./diagram-editor";`。
   - `src/styles.css` 的 `/* == excalidraw (04) == */` 段加 `.fv-diagram-editor`、`.fv-editor-bar`，動畫只用 opacity。
   - 測試 `src/excalidraw/diagram-editor.browser.test.tsx`（browser，外面包 `<ViewerRoot><div style={{ height: 600 }}><DiagramEditor json={…} … /></div></ViewerRoot>`；`json` 用 `diagram.excalidraw` fixture 的 `?raw`），案例：
     - 出現 `.excalidraw` 元素；`<ViewerRoot theme="dark">` 時有 `.theme--dark`；
     - 點 `[data-testid="main-menu-trigger"]` 打開主選單後，沒有 `[data-testid="load-button"]`、`[data-testid="json-export-button"]`、`[data-testid="image-export-button"]`、`[data-testid="save-button"]`、`[data-testid="save-as-button"]`；
     - 沒改就按「Cancel」：直接呼叫 `onClose`，沒有 dialog；
     - 按 `r` 在 canvas 上拖出一個矩形後，`onDirtyChange(true)` 只被呼叫一次；
     - dirty 時按「Cancel」出現「Discard your changes?」：按「Keep editing」後 dialog 關閉、`onClose` 沒被呼叫；按「Discard」後依序呼叫 `onDirtyChange(false)` 和 `onClose`；
     - 按「Save」時，`onSave` 收到的 JSON `JSON.parse` 後 `type === "excalidraw"`，`elements` 比原本多一個；
     - `onSave` reject `new Error("disk full")` 時，畫面出現 `disk full`、`onClose` 沒被呼叫、「Save」可以再按。
   - verify：`pnpm test:browser src/excalidraw/diagram-editor.browser.test.tsx && pnpm build && pnpm check`
   - commit：`feat(markdown-excalidraw): edit diagrams with excalidraw`

2. **接上 `FileViewer` 的存檔與 `.excalidraw` 編輯器。**
   - `src/viewer/markdown-body.tsx` 改動（`BodyProps` 的 `file`、`viewer` 都用得到）：
     - 狀態 `source`（初值 `loaded.text ?? ""`）、`editing: Fence | null`、`focusIndex: number | null`。`t = useT(commonMessages)`。
     - `viewer.onSave` 有給時，`renderDiagram` 裡的 `DiagramBlock` 多傳 `onEdit={() => { viewer.onEditingChange?.(true); setEditing(fence) }}`。
     - `editing` 有值時，整個 body 換成 `<Suspense fallback={<Spinner label={t("common.loading")} />}><LazyDiagramEditor json={editing.json} assetPath={viewer.excalidraw?.assetPath} onDirtyChange={viewer.onDirtyChange} onSave={save} onClose={close} /></Suspense>`。`LazyDiagramEditor = lazy(() => import("../excalidraw/diagram-editor"))`。`close`：`viewer.onEditingChange?.(false)`，`setFocusIndex(editing.index)`，`setEditing(null)`。
     - `save(json)`：`next = replaceFence(source, editing, json)`（`src/markdown/fences.ts`），`ext = splitName(file.name).ext`（`src/contract/save.ts`），然後 `await viewer.onSave({ blob: new Blob([next], { type: "text/markdown" }), mime: "text/markdown", ext, mode: "replace", suggestedName: suggestedName(file.name, ext, "replace") })`；成功後 `setSource(next)`。`viewer.onSave` 在 `save` 被呼叫時一定有值（沒有 `onSave` 就不會有 `onEdit`）。
     - 回到文件後，包住 `MarkdownView` 的 `<div ref={…}>` 的 ref callback 在 `focusIndex !== null` 時找 `` `[data-fence="${focusIndex}"] .fv-diagram` `` 並 `focus()`，然後 `setFocusIndex(null)`。
   - 新檔 `src/excalidraw/file-editor.tsx`：`export function ExcalidrawFileEditor(props: EditorProps)`。`const { onSave, onClose, onDirtyChange, maxOutputBytes, assets, file, ...root } = props`，輸出 `<ViewerRoot {...root}><FileEditorBody …/></ViewerRoot>`（`maxOutputBytes`、`assets` 收下不用）。`FileEditorBody`：
     - 用 `useEffect` 加 `AbortController` 讀檔：`text = await (await readBlob(file.source, { type: mimeOf(file), signal })).text()`（`readBlob` 在 `src/contract/byte-source.ts`，`mimeOf` 在 `src/contract/kinds.ts`）。狀態 `{ phase: "loading" } | { phase: "ready"; text: string } | { phase: "error"; message: string }`。中止（`isAbortError`，`src/contract/errors.ts`）不處理；其他錯誤 `useRoot().report(toViewerError(e, "read_failed"))`，狀態 `error`，message 是 `tc("error.read_failed")`。
     - `loading`：`<Spinner label={tc("common.loading")} />`。
     - `ready` 但 `parseScene(text)` 失敗：`report(new ViewerError("decode_failed"))`（只報一次），狀態同 `error`，message 是 `t("excalidraw.broken")`（`t = useT(excalidrawMessages)`）。
     - `error`：`<div className="fv-diagram-broken" role="alert"><p>{message}</p><Button onClick={onClose}>{tc("common.close")}</Button></div>`。
     - `ready` 且 ok：`<Suspense fallback={<Spinner …/>}><LazyDiagramEditor json={text} onDirtyChange={onDirtyChange} onClose={onClose} onSave={async (j) => { await onSave({ blob: new Blob([j], { type: "application/vnd.excalidraw+json" }), mime: "application/vnd.excalidraw+json", ext: ".excalidraw", mode: "replace", suggestedName: suggestedName(file.name, ".excalidraw", "replace") }) }} /></Suspense>`。`LazyDiagramEditor = lazy(() => import("./diagram-editor"))`。字型路徑：`EditorProps` 沒有 `assetPath`，所以這裡不傳，由 `window.EXCALIDRAW_ASSET_PATH` 沿用（`FileViewer` 開過檢視時已由 `setAssetPath` 設好；直接用 `./excalidraw` subpath 單獨掛 `ExcalidrawFileEditor` 的宿主要自己先呼叫 `setAssetPath`）。
   - `src/excalidraw/index.ts` 加 `export { ExcalidrawFileEditor } from "./file-editor";`。
   - `src/viewer/editors.ts`：在 `editors` 加 `excalidraw: lazy(() => import("../excalidraw/index").then((m) => ({ default: m.ExcalidrawFileEditor }))),`（`lazy` 從 `react` import）。`grep -n "editors" src/viewer/*.test.ts*`：03 若有測試斷言 `editors` 是空表，改成斷言 `Object.keys(editors)` 等於 `["excalidraw"]`。
   - `test/csp/main.tsx` 加 `onSave={async () => {}}`。`scripts/csp-smoke.mjs` 在 `?f=md` 那段多做：點第一個 `.fv-diagram`，等 `.excalidraw canvas` 出現，再斷言一次沒有 violation、沒有外部請求。
   - 測試 `src/viewer/markdown-body.test.tsx` 加案例（沿用檔頭的 `bodyProps`）。檔頭加 `vi.mock("../excalidraw/diagram-editor", …)`，換成假元件：一顆按鈕，按下去 `try { await p.onSave(EDITED); p.onClose() } catch {}`，`EDITED` 是 `{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{}}`。文字用 `test/fixtures/doc-with-diagrams.md`，`viewer.onSave` 用 `vi.fn()`：
     - 點第二個 `.fv-diagram` 再按假按鈕：`onSave` 收到 `mode: "replace"`、`ext: ".md"`、`mime: "text/markdown"`、`suggestedName: "doc.md"`；`blob.text()` 和原文逐字比對時只有第二個 fence 的內容行不同（list 縮排前綴保留），第一張圖和其他文字 byte 相同；`viewer.onEditingChange` 依序收到 `true`、`false`；
     - `onSave` reject 時 `source` 不變，假編輯器還在；
     - 沒給 `onSave` 時 `.fv-diagram` 不是 button；
     - 存好之後，`document.activeElement` 是 `[data-fence="1"] .fv-diagram`。
   - 測試 `src/excalidraw/file-editor.test.tsx`（jsdom，同樣 mock `./diagram-editor`；用 `bytesSource(new TextEncoder().encode(text))`，`bytesSource` 在 `src/contract/byte-source.ts`），案例：
     - 讀 `diagram.excalidraw` fixture，假編輯器收到的 `json` 等於檔案文字；按假按鈕後 `onSave` 收到 `ext: ".excalidraw"`、`mime: "application/vnd.excalidraw+json"`、`mode: "replace"`、`suggestedName: "a.excalidraw"`（`file.name` 是 `a.excalidraw`），blob 內容是 `EDITED`，之後 `onClose` 被呼叫；
     - 檔案內容 `{not json`：顯示 `This diagram can't be read` 和 `Close` 鈕，按下去 `onClose` 被呼叫，`onError` 收到 `decode_failed`；
     - `ByteSource.read` reject 時，`onError` 收到 `read_failed`。
   - 測試 `src/viewer/excalidraw-open.test.tsx` 加案例（檔頭 mock `../excalidraw/diagram-editor`，並 `vi.mock("../excalidraw/index", async () => ({ ExcalidrawFileEditor: (await import("../excalidraw/file-editor")).ExcalidrawFileEditor }))`，避免在 jsdom 載入 Excalidraw）：`FileViewer` 開 `diagram.excalidraw` 並給 `onSave`，頂列有 `Edit`；點下去後出現假編輯器；按假按鈕後 `onSave` 被呼叫，並回到檢視（`.fv-excalidraw` 再次出現）。
   - verify：`pnpm test src/viewer src/excalidraw && pnpm test:csp`
   - commit：`feat(markdown-excalidraw): save edited diagrams through onSave`

phase 結尾 verify：`pnpm test src/markdown src/excalidraw src/viewer src/i18n && pnpm test:browser src/excalidraw && pnpm test:csp && pnpm check && pnpm verify:pack && pnpm check:licenses`

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
