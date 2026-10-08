# Anyknown file-viewer — 瀏覽器內的檔案檢視與編輯元件（總覽）

> 狀態：設計（2026-10-08）。repo 還沒建；01–13 已寫成 plan，都還沒動工。storage 的 11、13–15、17–20 也都還沒動工，內容整批搬進本系列（§6），storage 那邊只留宿主整合。
> **跨 plan 的名字以本檔為準。** 符號、檔案路徑、簽名、誰在哪一步建立，看 §9「跨 plan 介面表」。plan 裡寫的跟 §9 不同時，照 §9 做。
> 依賴：`@anyknown/ui` 的 `tokens.css`（只用 `--ak-*` CSS 變數）；不依賴 storage、product 任何程式。
> 一句話：一個 React 元件庫 `@anyknown/file-viewer`（public repo `anyknown-com/file-viewer`，MIT），丟進一份 bytes 就能在瀏覽器裡看圖、影片、音訊、PDF、文字、Markdown、Excalidraw 圖，並在同一個元件裡編輯；存檔時交回一個 `Blob`。不連任何伺服器，所以可以直接放在端對端加密的產品裡。
> 原則：每份 plan 只做一件事、可獨立驗收；元件只認 bytes 和回呼，下載、解密、上傳、垃圾桶、toast 都歸宿主；重的套件按需載入，入口不含它們。

## 1. 定位

要解決的問題：storage（E2EE 雲端硬碟）和 product（AI 平台的記憶附件）都要「打開一個檔來看，有時候改一下再存回去」。兩邊現在各寫一份：

- storage `src/components/files/preview.tsx`：`previewKind` 依 mime 分成 image / video / audio / pdf / text，≤ 64 MiB（`MAX_PREVIEW`）用 objectURL 開在 Dialog，text ≤ 1 MiB（`MAX_TEXT`），`.md` 目前是等寬純文字（storage 08 狀態行）。
- product `packages/shell-ui/src/memory/entry-detail/entry-assets/`：`asset-body.tsx` 的 `AssetBody` 分派 image（`<img>`）、`text/markdown`（`FencedMarkdown`）、其他文字（`<pre>`）、PDF（`pdf-frame.tsx` 的 `PdfFrame`，objectURL 進 `<iframe>`），其餘走 `no-preview.tsx` 的 `NoPreview`（「下載後用系統的 app 打開」）。
- storage 的 11、13–15、17–20 還規劃了 Markdown + Excalidraw、圖層式影像編輯器、影片與音訊剪輯，而且 13 §1 早就要求編輯器「不知道 E2EE、storage、SDK 存在，要能原封不動抽出去開源」。

本產品把這些做成一份，兩個宿主共用，也給外部開發者用。

給誰用：

1. 我們自己的宿主：storage web、product shell-ui（desktop 與 web 都經 shell-ui）。
2. 外部開發者：想在自己的 app 裡預覽或編輯使用者檔案、又不想把檔案送到第三方的人；特別是做 E2EE、本機優先、內網的產品。

和市面方案的差別：

| | file-viewer | 雲端硬碟的預覽（Drive、Dropbox） | 一般 React doc viewer | 線上編輯器（Photopea 等） |
| --- | --- | --- | --- | --- |
| 在哪裡算 | 全部在瀏覽器 | 伺服器轉檔、伺服器看得到內容 | 部分格式交給線上 viewer（要把檔案 URL 給第三方） | 瀏覽器，但是別人的網站 |
| 伺服器 | 零：不發任何請求、不開 `blob:` worker、不需要放寬 CSP | 必要 | 視格式而定 | 對方的 |
| 可編輯 | 是：Excalidraw 圖、圖層影像、影片、音訊 | 否 | 否 | 是，但不能嵌進自己的產品 |
| 搭 E2EE | 是：輸入是 `ByteSource`（宿主邊解密邊給），輸出是 `Blob`（宿主自己加密上傳） | 否 | 否 | 否 |
| 授權 | MIT；唯一 copyleft 依賴是 mediabunny（MPL-2.0，檔案層級，見 §2） | — | 各異 | 專有 |

viewer 與 editor 的關係：名稱是 file-viewer，因為所有入口都是「打開一個檔」。看是預設，編輯是同一個元件裡的第二個狀態：

- `FileViewer` 只讀，永遠可用。宿主有傳 `onSave`、而且這種檔可以編輯時，頂列多一顆「編輯」；按下去在同一個容器裡換成對應的 editor（按需載入），存完或取消回到 viewer。宿主不傳 `onSave` 就是純檢視，editor 的程式一行都不會載入。
- 每個 editor 也從 subpath 單獨匯出（§4），宿主想直接開編輯器（例如「新建圖」）可以跳過 viewer。
- 能不能看和能不能編輯分開判斷：超過預覽上限的影片看不了（要整檔讀進記憶體），但影片編輯器是分段讀的，照樣能編輯（storage 14 §2 的規則）。

非目標：

- 原生 iOS / Android：mobile 是原生 Swift + Kotlin，用不到 React 元件；它們的預覽另外做。
- 檔案管理（列表、上傳、搬移、分享、版本）：那是宿主。
- 伺服器端轉檔（Office → PDF 之類）：與「零伺服器」衝突，永遠不做。Office 格式之後只做純瀏覽器解析得了的（§5）。

## 2. 已定的決策（不重開）

CEO 已定（2026-10-08，本系列開工前）：

- 獨立產品、獨立 public repo `anyknown-com/file-viewer`、MIT、npm `@anyknown/file-viewer`，發佈與 docs 站模式照 `ui`。不放在 storage：storage repo 是 private、沒有 license。
- 宿主介面只吃 bytes 或 `ByteSource`，存檔交出 `Blob`；不 import storage SDK、E2EE、trash、toast。
- 樣式只依賴 `@anyknown/ui/tokens.css` 的 `--ak-*` 變數，不綁 StyleX、不綁 Tailwind；storage（shadcn + Tailwind）與 product（StyleX）都要能用。
- 第一批宿主：storage 的 `preview.tsx`、product 的 `entry-assets/`。

從 storage plans 沿用（CEO 或 CTO 當時已定，理由見原文件）：

- 圖用 Excalidraw（`@excalidraw/excalidraw`，MIT），不用 tldraw（正式環境要付費商用授權）。文件格式是一般 `.md`，每張圖是 info string `excalidraw` 的 fenced code block；存檔只改那一段的內容行（storage 11 §1、§2）。
- Markdown 用 `react-markdown` + `remark-gfm` + `rehype-sanitize`，`skipHtml`、不裝 `rehype-raw`；fence 定位用 `unified` + `remark-parse` 先跑一次（storage 11 §2）。補一條本系列的理由：`@anyknown/ui` 的 `Markdown`（`src/components/markdown/Markdown.tsx`，marked tokens 轉 React、不走 innerHTML）也安全，但它綁 StyleX，本套件不能用。product 因此會同時有兩個 renderer：聊天訊息用 ui 的、附件用本套件的（後者按需載入），接受。
- 讀的畫面不掛整個 Excalidraw：`exportToSvg` → `blob:` URL → `<img>`，點圖才開編輯器（storage 11 §2）。
- 影像編輯器的品質標竿是 Compositor（MIT，`main` @11d8d7a），專案檔是 `.comp.zip`：STORE zip 包 Compositor v11 package，manifest 放第一個 entry，解壓就是 Compositor 打得開的 `.comp`（storage 13 §1、17 §2）。
- 合成用 WebGL2，不用 WebGPU；GL 呼叫包在 `engine/gl/` 裡，之後要換再轉 WGSL（storage 13 §1）。
- 影片與音訊的媒體層用 mediabunny，MPL-2.0 CEO 2026-10-05 已接受：原封不動當 npm 依賴、鎖確切版本、授權聲明寫版本與原始碼位置；不改、不抄、不 patch（storage 14 §1）。不用 ffmpeg.wasm（GPL）、`@mediabunny/*-encoder`（`blob:` worker）。
- 影片剪輯照抄 opencut-classic（MIT，@cf5e79e）的純 TS 邏輯；音訊單軌、非破壞（storage 14 §2、15 §1–§2）。
- 影片與音訊的編輯一律「輸出成新檔」，不取代原檔；影像專案「儲存」取代、「另存」與「匯出」是新檔（storage 13 §3、14 §2、15 §2）。
- 不開 `blob:` worker、不要求宿主放寬 CSP；需要 worker 時用同源 module worker（storage 13 §3）。

本系列新定（CTO）：

- 互動元件用 `@base-ui/react`（無樣式、MIT，`ui` 也用它）加本套件自己的 plain CSS。storage 13–15 原本寫「用 shadcn 元件」，在本套件裡改成這套；外觀用 `--ak-*`，所以在 product 裡長得像 `@anyknown/ui`。
- 不依賴 `@anyknown/ui` 的任何 JS（它的 `LocaleProvider` 等都在 StyleX 的入口裡）。i18n 自帶（§3）。
- 抄進來的程式（Compositor、opencut-classic）每個檔頭寫來源路徑、commit、MIT，總表在 `THIRD_PARTY_NOTICES.md`（§7）。
- 檔案上限的預設值沿用 storage：預覽 64 MiB、純文字 1 MiB、Markdown / Excalidraw 8 MiB、`.comp.zip` 1 GiB；宿主可以覆寫（§3 `limits`）。


## 3. 宿主介面（02 定稿；之後只加不改）

下面是定稿的形狀。行尾標 `// +NN` 的是 NN 號 plan 對 02 的增補（只加不改），由那份 plan 在 §9 寫的那一步加上。

```ts
// 輸入：可隨機讀的 bytes。E2EE 宿主邊解密邊給；一般宿主用 blobSource(file)。
export interface ByteSource {
  readonly size: number;
  // [start, end)；0 ≤ start ≤ end ≤ size 的整數，否則 RangeError；回傳長度 = end - start；signal 中止時以 signal.reason reject
  read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>>;
  blob?(signal?: AbortSignal): Promise<Blob>; // 有的話整檔讀走這條（File / Blob 零拷貝）
}
export function blobSource(blob: Blob): ByteSource;
export function bytesSource(bytes: Uint8Array<ArrayBuffer>): ByteSource; // read 回複本，不回 subarray

export type FileRef = { name: string; mime?: string; source: ByteSource };

// 判斷：能不能看、能不能編輯，分開回。依副檔名優先（上傳的 mime 常是空的或 octet-stream），也認 mime。
export type ViewKind = "image" | "video" | "audio" | "pdf" | "text" | "markdown" | "excalidraw"
  | "comp";                                                   // +10（.comp.zip 的檔頭預覽）
export type EditKind = "markdown" | "excalidraw" | "image" | "video" | "audio"; // image 含 .comp.zip
export type KindResult = {
  view: ViewKind | null;
  edit: EditKind | null;   // 只在 src/viewer/editors.ts 有登錄這個 kind 時才回（見下方「編輯器開關」）
  tooLarge: boolean;       // 格式認得、但超過上限；view 此時是 null
};
export function kindOf(file: { name: string; mime?: string; size: number }, limits?: Partial<Limits>): KindResult;
export function mimeOf(file: { name: string; mime?: string }): string;

export type Limits = {
  previewBytes: number;  // 64 MiB：image、video、audio、pdf
  textBytes: number;     // 1 MiB
  docBytes: number;      // 8 MiB：markdown、excalidraw
  projectBytes: number;  // 1 GiB：.comp.zip（整檔讀進記憶體）
};
export const DEFAULT_LIMITS: Readonly<Limits>;

// 存檔：editor 交出 Blob，命名、撞名、上傳、刪舊檔都是宿主的事。
export type SaveMode = "replace" | "copy" | "export";
export type SaveRequest = {
  blob: Blob;              // 由多段組成，不是一整塊 ArrayBuffer
  mime: string;
  ext: string;             // ".md"、".comp.zip"、".mp4"…
  mode: SaveMode;
  suggestedName: string;   // replace = 原主檔名 + ext；copy / export = "<主檔名> (edited)<ext>"，撞名由宿主處理
};
export type SaveHandler = (req: SaveRequest) => Promise<void>; // resolve = 存好；reject = editor 留在原地、保持未存，顯示 error.message

// 錯誤：UI 自己會顯示；onError 只給宿主記錄。
export type ViewerErrorCode =
  | "unsupported" | "too_large" | "read_failed" | "decode_failed" | "codec_unsupported"
  | "webgl_unavailable" | "webcodecs_unavailable" | "output_too_large" | "save_failed"
  | "render_failed";                                          // +03（lazy chunk 載不到、body 或 editor render 時丟錯）
export class ViewerError extends Error {
  readonly code: ViewerErrorCode;
  constructor(code: ViewerErrorCode, options?: { message?: string; cause?: unknown }); // message 預設等於 code
}

// i18n：內建 en、zh-TW；其他語言給整份 messages，或只覆寫幾個字串。
export type Locale = "en" | "zh-TW";
export type Messages = CommonMessages /* & 每份 plan 的 <Area>Messages，見下方 i18n */;

export type Theme = "light" | "dark";
export type CommonProps = {
  file: FileRef;
  locale?: Locale;                 // 預設 "en"
  messages?: Partial<Messages>;
  theme?: Theme;                   // 不給就跟宿主頁面與 OS（tokens.css 的 prefers-color-scheme）
  limits?: Partial<Limits>;
  onError?: (e: ViewerError) => void;
};

export type ImageResolution = string | { link: string } | null;   // +04
export type ImageResolver = (src: string, alt: string) => ImageResolution; // +04

export type FileViewerProps = CommonProps & {
  onSave?: SaveHandler;                     // 不給 = 純檢視，editor 不載入
  onDirtyChange?: (dirty: boolean) => void; // 宿主自己的關閉鍵 / Esc 用它決定要不要先問
  onEditingChange?: (editing: boolean) => void; // +03：按「編輯」時 true，editor onClose 時 false
  markdown?: { resolveImage?: ImageResolver };  // +04 放寬回傳；null = 顯示 [圖片：alt]，不載入
  excalidraw?: { assetPath?: string };          // 裡面有 fonts/ 的目錄 URL，例如 "/excalidraw-assets/"
  editor?: { maxOutputBytes?: number; assets?: AssetProvider };
};
export function FileViewer(props: FileViewerProps): JSX.Element;  // 03

// 每個 editor 的 props，subpath 單獨匯出的 editor 也用它。檔案：src/contract/editor.ts（03）。
export type EditorProps = CommonProps & {
  onSave: SaveHandler;
  onClose: () => void;              // 取消，或存完要回 viewer；dirty 時由 editor 自己先問「放棄修改？」
  onDirtyChange?: (dirty: boolean) => void;
  maxOutputBytes?: number;
  assets?: AssetProvider;
};

// 影片編輯器的素材欄（storage 14 §1）。
export type AssetInfo = { id: string; name: string; mime: string; size: number };
export type AssetProvider = { list(): Promise<AssetInfo[]>; open(id: string): Promise<ByteSource> };
```

`./comp`（09）有自己的錯誤類別，不混進 `ViewerErrorCode`：

```ts
export type ProjectErrorCode =
  | "not_zip" | "not_project" | "too_new" | "invalid" | "missing_asset" | "unsafe_entry" | "too_large"
  | "bad_png";              // +09：壞 PNG、16-bit、APNG、遮色片不是 8-bit 灰階
export class ProjectError extends Error { readonly code: ProjectErrorCode; readonly details: string[] }
```

10 開 `.comp.zip` 時把 `ProjectError` 換成 `ViewerError`：`too_large` → `too_large`，其餘（含 `missing_asset`、`bad_png`）→ `decode_failed`。

規則：

- 版面：`FileViewer` 撐滿宿主給的容器，不自己開 modal。lightbox、Dialog、上一個 / 下一個、下載按鈕都在宿主（storage 的 `Dialog`、product 的 `AssetLightbox`）。editor 的內部對話框（「放棄修改？」、匯出設定）由本套件用 Base UI 開，popup 一律 portal 到 `ViewerRoot` 裡的 `.fv-portal`。
- **編輯器開關只有一個地方：`src/viewer/editors.ts` 的 `editors`。** 每份 editor plan 交付時在這裡加一行 `<kind>: lazy(() => import("../<dir>/<定義元件的檔>").then((m) => ({ default: m.<Editor> })))`。`kindOf` 的 `edit` 先照 02 的 `editKindOf` 算，再看 `editors[kind]` 有沒有登錄，沒有就回 `null`；`FileViewer` 的「編輯」鈕也只看同一張表。沒有其他旗標（不設 `SHIPPED_EDITORS`、`IMAGE_EDITOR_ENABLED`、`editorLoaders`）。
  - 04 登錄 `excalidraw`（`.excalidraw` 檔）。`markdown` 不登錄：v0.1 不編輯 `.md` 文字，所以 `kindOf` 對 `.md` 回 `edit: null`、頂列沒有「編輯」；文件裡的圖由 markdown body 自己開編輯器（點圖）。
  - 07 登錄 `video`，08 登錄 `audio`。
  - `image` 由 v0.3 發版的 commit（主 agent，11、12、13 都驗收之後）登錄。在那之前 `./image-editor` 照常可以從 subpath 直接用，`.comp.zip` 也照常有檔頭預覽（`ViewKind` 的 `"comp"` 不受開關影響）。
  - 依賴方向：`src/contract/kinds.ts` → `src/viewer/editors.ts`（只有這一條從 contract 指向 viewer）；`editors.ts` 只用 dynamic `import()` 載入 editor，所以入口檢查與 `import/no-cycle` 都不受影響（oxlint 不把 dynamic import 與 `import type` 算成循環，2026-10-08 用 oxlint 1.80 實測）。
- 大檔與串流：viewer 整檔讀的種類（image、pdf、text、markdown、excalidraw，以及 ≤ `previewBytes` 的影音）一律呼叫 02 的 `readBlob`：先試 `source.blob()`，沒有就每次 4 MiB 循序 `read`，片段直接組成 `Blob`，不併成一整塊。超過上限時 `kindOf` 回 `tooLarge: true`，viewer 顯示 `too_large` 狀態（宿主的下載鍵照常在）。video / audio editor 只用隨機 `read`，交給 06 的 `openMedia`（mediabunny `CustomSource`）；輸出經 06 的 `createBlobSink` 收片段組成 `Blob`。輸出超過 `maxOutputBytes` 時在呼叫 `onSave` 前停下，回 `output_too_large`。元件卸載時用同一個 `AbortSignal` 取消所有讀取。
- 主題：根元件是 02 的 `ViewerRoot`，畫出 `<div class="fv-root" data-theme lang>`，巢狀時不再包一層；`FileViewer` 與每個 editor 最外層都包它。Excalidraw 的 `theme` 與 `exportWithDarkMode` 跟著同一個值。`tokens.css` 的 `data-theme="light"` 目前只在 `<html>` 上有效（ui `docs/guides/theming.md`「It only works on the root element」），OS 是深色、宿主要淺色時子樹鎖不住，所以 02 先給 `ui` 加一段 `[data-theme="light"]` 子樹選擇器（ui 0.11.0），本套件的 peer 範圍從那一版起。宿主要自己的色票（storage 的 shadcn 色），在 `.fv-root` 上覆寫 `--ak-*` 即可。
- i18n：key 是扁平字串 `<area>.<name>`。`common.*`、`discard.*`、`error.*` 在 `src/i18n/en.ts` 與 `src/i18n/zh-tw.ts`（02）；其他每個區域一個 `src/<dir>/messages.ts`，匯出 `<Area>Key`、`<Area>Messages` 型別與 `<area>Messages: MessageTable<<Area>Key>` 表，跟著自己的 chunk 載入。加區域的同一個 commit 在 `src/i18n/messages.ts` 的 `Messages` 加 `& <Area>Messages`（`import type`）。元件用 `useT(<area>Messages)` 拿翻譯函式。錯誤訊息一律查 `error.<code>`，不另立同義的 key。各區域的檔與表名見 §9.2。
- CSP：宿主的最低需求就是 storage 現行的 `public/_headers`：`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`，字型同源。04 的 CSP 測試與 05 的 site smoke 都在這組 CSP 下跑。
- **PDF 與 `object-src 'none'`（2026-10-08 實測）。** 疑慮是：blob 文件會繼承建立者的 CSP，`object-src 'none'` 可能擋掉 Chrome 內建的 PDF viewer。用 playwright 開 headless Chrome 155.0.8059.39 與 Chromium 153.0.8010.12 測了以下幾種情況：
  - 頁面帶 storage 那條 CSP（含 `object-src 'none'` 與 `frame-ancestors 'none'`），`<iframe src="blob:…">` 指向 `type: "application/pdf"` 的 Blob：PDF viewer 正常畫出頁面，console 沒有 violation。
  - 同一頁改用 `<embed type="application/pdf" src="blob:…">`：被擋，console 出現「Loading plugin data from 'blob:…' violates … "object-src 'none'"」。只有 `default-src 'self'`、沒有寫 `object-src` 時也一樣被擋。
  - CSP 沒有 `frame-src blob:`：iframe 被擋（「Framing 'blob:…' violates … default-src」）。
  - WebKit 的 headless build 連沒有 CSP 的頁面都不畫 PDF，Firefox 沒有裝，所以這兩個在 headless 下驗不了，v0.1 驗收時手動開。

  結論：CSP 建議保留 `object-src 'none'`；PDF 照 03 的做法，用 `<iframe>` 加 `type: "application/pdf"` 的 blob URL、不加 `sandbox`；任何 plan 都不准用 `<embed>` 或 `<object>` 顯示 PDF。`frame-src blob:` 是必要的。
- Excalidraw 字型：04 在 `pnpm build` 時把 Excalidraw 的 `dist/prod/fonts/` 複製到本套件的 `dist/excalidraw-assets/fonts/`。宿主把 `dist/excalidraw-assets/` 複製到自己的靜態目錄，用 `excalidraw.assetPath` 告訴本套件位置，本套件轉給 `window.EXCALIDRAW_ASSET_PATH`。**沒有傳 `assetPath` 時，Excalidraw 會去 `https://esm.sh/@excalidraw/excalidraw@<版本>/dist/prod/` 抓字型**（這個備援網址寫死在 Excalidraw 0.18.1 裡，關不掉），CSP 會擋下並報 violation。05 的「接上你的 app」頁要寫清楚。
- 網路：本套件自己不發任何請求，前提是宿主給了 `excalidraw.assetPath`。Markdown 的圖片只在 `resolveImage` 回 URL 時才載入；回 `{ link }` 時只顯示連結，回 `null` 或不給時顯示 `[圖片：alt]`（product 現在的 `fenceImages` 擋外部圖，宿主照自己的規則回）。

## 4. 套件結構：一個套件、subpath exports

選一個套件，不拆成多個套件。理由：

- 按需載入靠的是 dynamic `import()`，不是套件邊界。`FileViewer` 在第一次需要時才 `import("./markdown/…")`、`import("./image-editor/…")`；Vite、webpack、Next 都會把它們切成獨立 chunk。拆套件並不會讓 bundle 更小。
- 契約（`ByteSource`、`SaveRequest`、`Messages`、錯誤碼）在 viewer 和每個 editor 之間共用，必須一起改版。拆成多個套件就得對齊版本、用 changesets、寫多份 CHANGELOG 和授權聲明。兩個宿主都要全部格式，這些成本換不到東西。
- 代價是安裝的人一定會裝到 Excalidraw 和 mediabunny，安裝體積比較大。可以接受：沒用到的不會進 bundle。之後如果真的有人只要 viewer、又在意安裝體積，再把重的依賴改成 optional peer。

exports（`sideEffects` 只列 CSS）。01 只建 `.` 與 `./styles.css`；其他 subpath 由擁有它的 plan 在交付那一步加上，同一個 commit 改 `package.json` 的 `exports`、`tsdown.config.ts` 的 `entry`、`src/<subpath>/index.ts`，形狀照 `.` 那條（`{ "types", "default" }`）。不發佈空的 export。

| subpath | 內容 | 載入時機 | 誰加（plan / phase / step） |
| --- | --- | --- | --- |
| `.` | `FileViewer`、`kindOf`、`mimeOf`、`blobSource`、`bytesSource`、`ViewerError`、`DEFAULT_LIMITS`、§3 的型別 | 入口；不 import 任何重依賴 | 01 P01-1 建空的；02 P03-4 填契約；03 第 6、8 步加 `FileViewer`、`EditorProps`；04 P01-2 加 `ImageResolution`、`ImageResolver` |
| `./styles.css` | 本套件全部 `fv-*` class（一個 plain CSS 檔，只用 `--ak-*`；每份 plan 在檔尾加一段 `/* == <area> (NN) == */`） | 宿主在 `tokens.css` 之後 import 一次 | 01 P01-1 建；02 P03-3 起各 plan 增補 |
| `./markdown` | `MarkdownView`、`findFences` / `maskFences` / `replaceFence`、`Fence` | 第一次開 `.md` | 04 P01-1 |
| `./excalidraw` | `DiagramImage`、`DiagramEditor`（含 Excalidraw 的 CSS）、`ExcalidrawFileEditor`、`parseScene`、`setAssetPath` | 第一張圖要畫時 | 04 P02-2 |
| `./video-editor` | `VideoEditor`、`VideoEditorProps`（= `EditorProps`）；mediabunny 由 bundler 拆成共用 chunk | 按「編輯」時 | 07 第 11 步 |
| `./audio-editor` | `AudioEditor`、`AudioEditorProps`（= `EditorProps`） | 按「編輯」時 | 08 P03-1 |
| `./image-editor` | `ImageEditor`、`ImageEditorProps`（= `EditorProps`）；GL 引擎、同源 module worker | 按「編輯」時 | 10 第 7 步 |
| `./comp` | `.comp.zip` 讀寫、`readHead`、manifest 型別與驗證、PNG 編解碼、圖層樹摘要。**不碰 DOM**，Node 22 也能跑 | product runtime 的 docs 工具（`product/docs/plans/park/ai-readable-docs.md` 的「影像專案的圖層樹」）直接 import | 09 P01-1 |

`.comp.zip` 在 viewer 裡的預覽只用到 `./comp`：10 的 `src/image-editor/comp-preview.tsx` 由 viewer 的 `bodies.comp` 用 `lazy()` 載入，它只 import `src/comp/`、`src/contract/`、`src/i18n/`、`src/primitives/`，用 `readHead` 經 `ByteSource.read` 只讀檔頭。開預覽不會載入編輯器的 chunk（GL 引擎、worker）。

依賴：

- peerDependencies：`react` / `react-dom` ^19、`@anyknown/ui` >=0.11.0（只用 `tokens.css`）。02 加版本範圍；三個都是 optional peer（`peerDependenciesMeta`，01 寫在 `package.json` 的初版），因為只用 `./comp` 的人（例如 product 的 docs 工具）不需要 React。
- dependencies：
  - `@base-ui/react` ^1.8.0（02）；
  - `react-markdown` ^10.1.0、`remark-gfm` ^4.0.1、`rehype-sanitize` ^6.0.0、`unified` ^11.0.5、`remark-parse` ^11.0.0（04）；
  - `@excalidraw/excalidraw` 0.18.1，確切版本（04）；
  - `mediabunny` 1.61.1，確切版本（06）；
  - `fflate` ^0.8.3、`zod` ^4.4.3（09）；
  - `@fontsource-variable/geist` 5.3.0，確切版本，用 `pnpm add --save-exact @fontsource-variable/geist@5.3.0`（OFL-1.1，影片編輯器的文字與影像編輯器的文字圖層共用；07 第 8 步加，13 第 2 步用同一個版本，已存在就不動）。
- 加 production 依賴的那個 commit 同時改 `THIRD_PARTY_NOTICES.md`，`pnpm check:licenses` 才會綠。CI 的入口檢查（§7）保證 `.` 不會靜態 import 到重依賴。

宿主的 Vite 設定：image editor 的 worker 用 `new Worker(new URL(…, import.meta.url), { type: "module" })`，Vite 預先打包 `node_modules` 時會找不到這種寫法的 worker 檔，所以宿主要在 `optimizeDeps.exclude` 加 `@anyknown/file-viewer`。這條只有 image editor 需要，所以**只由 10 第 12 步處理**（其他 plan 不寫、不預留），10 第 12 步在 `docs/guides/connect.md` 與 `site/vite.config.ts` 寫上。v0.1、v0.2 的宿主不需要任何 Vite 設定：排除一個套件也會讓它的 CJS 依賴不被預先打包，提早要求只有壞處。storage 的整合（H1 Phase 3）照做。

## 5. 格式範圍與分期

v0.1（第一個發佈版，兩個宿主都換上）：底是 storage 08 現有的預覽種類，加上 `.md` 與 Excalidraw。

| 種類 | 看 | 編輯 |
| --- | --- | --- |
| image（jpeg / png / webp / avif / gif / bmp / svg，`<img>` + objectURL；SVG 放在 `<img>` 裡不會跑 script） | 有 | v0.3 |
| video / audio（原生播放器，≤ 64 MiB） | 有 | v0.2 |
| pdf（`<iframe>` + objectURL，用瀏覽器內建的 viewer） | 有 | 不做 |
| text / json（≤ 1 MiB，等寬） | 有 | 之後 |
| markdown（排版、` ```excalidraw ` 畫成圖、`resolveImage`） | 有 | 圖：有（存檔只改那一段）；文字：之後 |
| `.excalidraw` | 有 | 有 |
| 其他 | `unsupported` 狀態（圖示 + 說明，下載鍵由宿主提供） | — |

v0.2：影片剪輯、音訊剪輯（storage 14、15 的範圍不變）。
v0.3：圖層式影像編輯器與 `.comp.zip`（storage 13、17–20 的範圍不變，五份一起驗收才開放入口，同 storage 13 狀態行：發版的 commit 在 `src/viewer/editors.ts` 登錄 `image`）；`.comp.zip` 的預覽圖從檔頭讀。
1.0：兩個宿主都換上 v0.3 時發；之後契約的破壞性改動走 major。

之後（不排期，有宿主要再開）：在 UI 編輯 `.md` 文字、新建文件或新圖；程式碼語法上色；CSV / TSV 表格；用 pdf.js 取代 iframe（各瀏覽器內建 viewer 的行為不一，手機上尤其差）；超過預覽上限的影片串流播放（MSE）；HEIC / RAW；zip 內容列表；純瀏覽器解析的 docx / xlsx；用 HTTP Range 實作的 `urlSource`；WebGPU。


## 6. Plans 與依賴

```
01 scaffold ── 02 contract ──┬── 03 viewer-core ──┬── 04 markdown-excalidraw ─┐
                             │                    └── 05 site ─────────────────┼── v0.1 ── H1 storage 22 Phase 1、H2 product
                             ├── 06 media-io ──┬── 07 video-editor ──┐          │
                             │                 └── 08 audio-editor ──┴── v0.2 ── H1 Phase 2
                             └── 09 comp-format ── 10 image-editor ──┬── 11 / 12 / 13 ── v0.3 ── H1 Phase 3
```

步驟的寫法：01、02、04、06、08、09、11 的步驟每個 phase 從 1 起算，本檔寫成 `P02-3`（Phase 02 第 3 步）；03、05、07、10、12、13 的步驟整份連續編號，本檔寫成「第 8 步」。編號指 2026-10-08 寫成時的編號；之後哪份 plan 增刪步驟，同一個 commit 改 §9 的參照。

宿主 plan 的位置：H1 = `/Users/solemnis/Documents/anyknown-com/storage/docs/plans/22-file-viewer-host.md`（storage repo）；H2 = `/Users/solemnis/Documents/anyknown-com/product/docs/plans/file-viewer-host.md`（product repo）。

| #  | Plan | 一句話 | 依賴 | 從 storage 搬來 |
| --- | --- | --- | --- | --- |
| 01 | scaffold | repo 骨架：pnpm、tsdown build（ESM + d.ts）、exports map（只有 `.` 與 `./styles.css`）、oxlint / oxfmt、vitest（jsdom 與 browser 模式）、入口檢查、授權檢查、`verify:pack`、CI、release、`LICENSE`、`THIRD_PARTY_NOTICES.md`、`README.md`、`docs/plans/README.md`、npm 0.0.1 佔名 | 無 | — |
| 02 | contract | §3 的型別與 `blobSource` / `bytesSource` / `readBlob` / `kindOf` / `ViewerError` / i18n / `ViewerRoot` / §9.3 的全部 Base UI 基本元件與 `styles.css`；ui 的 `[data-theme="light"]` 子樹選擇器 | 01 | 13 §1、14 §1 的 `ByteSource` 與 editor 邊界 |
| 03 | viewer-core | `FileViewer`：分派、整檔讀取與上限、image / video / audio / pdf / text / unsupported / too_large、loading 與錯誤狀態、`EditorProps`、編輯器開關 `editors` 與「編輯」切換點 | 02 | storage 08 的 `preview.tsx` 行為（Body 部分） |
| 04 | markdown-excalidraw | `.md` 排版、fence 解析與替換、讀的 SVG、Excalidraw 編輯器、`.excalidraw`、字型 asset path | 03 | **storage 11**（除了 `saveText`，那段歸 H1） |
| 05 | site | docs 站 + playground（拖檔進來看與編輯，存檔就是下載）、API 表、「接上你的 app」頁（CSP、Vite、主題、字型），部署 `file-viewer.anyknown.com` | 03（Phase 04 等 04） | — |
| 06 | media-io | `ByteSource` → mediabunny `Input`（`openMedia`）、`StreamTarget` → `Blob`（`createBlobSink`）、`canDecode` 檢查與錯誤碼、`hasVideoCodecs` | 02 P02-1、P02-2 | **storage 14** 的 `src/editors/media/`（`byte-source.ts` 歸 02） |
| 07 | video-editor | 多軌時間軸、修剪 / 分割 / ripple、疊加、輸出 MP4 | 03、06 | **storage 14**（SDK 的 `files.reader`、Blob 上傳、`vault-source` 歸 H1） |
| 08 | audio-editor | 單軌波形、剪 / 淡入淡出 / 正規化 / 去靜音、循環播放、輸出 | 03、06 | **storage 15** |
| 09 | comp-format | `.comp.zip` 讀寫、PNG 編解碼、manifest 型別與 `validateLikeCompositor`、`readHead`、圖層樹摘要與 golden fixture；`./comp` 不碰 DOM | 01 | **storage 17** |
| 10 | image-editor | 圖層文件、WebGL2 合成（含 LUT 查表）、24 種混合模式、遮色片、變形、undo、擴充介面、存檔匯出、`.comp.zip` 預覽 | 03、09 | **storage 13**（`EditorHost`、`save-file`、`edit-kind` 歸 H1） |
| 11 | image-select-paint | 選取、魔術棒、筆刷、仿製、修復、內容感知填色、漸層 | 10 第 1–3 步 | **storage 18** |
| 12 | image-adjustments-effects | 12 種調整圖層（8 種建 LUT texture、4 種自己的 pass）、6 種圖層效果 | 10 第 1–3 步、09；Phase 03 另等 10 第 4 步（圖層面板） | **storage 19** |
| 13 | image-text-shapes | 文字圖層、形狀圖層 | 10 第 1–3 步、09；Phase 03 另等 10 第 4 步（圖層面板） | **storage 20** |
| H1 | storage `docs/plans/22-file-viewer-host.md`（**屬 storage repo**） | Phase 1（22 §4）：`vaultSource`、`preview.tsx` 的 Body 換成 `FileViewer`、存檔（`saveFile` 的 `replace`）與垃圾桶守門、`uniqueName` 撞名命名、主題與 `--ak-*` 對應、字型目錄、third-party notices。Phase 2（22 §5）：SDK `files.reader` 與 Blob 上傳不整包讀、`vaultSource` 改隨機讀、`maxOutputBytes`、`AssetProvider`、`export` 存檔（影音輸出，撞名走 Phase 1 的 `uniqueName`）。Phase 3（22 §6）：升版、Vite `optimizeDeps.exclude`、遮蔽說明的保留天數、影像編輯入口。並把 storage 11、13–15、17–20 標成「已搬到 file-viewer」 | v0.1 / v0.2 / v0.3；replace 存檔前要 storage 16 trash 先上線 | 11、13–15 的宿主段 |
| H2 | product `docs/plans/file-viewer-host.md`（**屬 product repo**） | `AssetBody` 的分派換成 `FileViewer`（`blobSource(await asset.blob())`），`PdfFrame` / `NoPreview` 刪掉，`AssetLightbox` 的外框與下載留著；`resolveImage` 照 `fenceImages` 的規則；`ai-readable-docs` 的影像專案條目改指 `@anyknown/file-viewer/comp` | v0.1 | — |

執行方式：

- 規則照 product 的 `docs/plans/README.md`；本 repo 的 `docs/plans/README.md` 由 01 寫（P03-1 與 `README.md`、`CHANGELOG.md` 同一個 commit），02 不寫。
- 01 的 Phase 01–03 交給 subagent，Phase 04（建 public repo、npm 手動發 0.0.1 並綁 trusted publisher）由主 agent 做。
- 之後每個 step 交給一個 subagent，它只讀 plan 頭部和自己那一步（`docs/plans/README.md`「給執行 subagent 的說明」）。用到別份 plan 的符號，照 §9 的檔案路徑與簽名 import。
- 06 與 09 不依賴 03，可以和 03–05 平行。07 與 08 平行。11、12、13 平行。

## 7. Repo 與發佈

目錄：

```
file-viewer/
  src/
    index.ts              # "." 入口（02 P03-4 起）
    styles.css            # 唯一的 CSS 檔；每份 plan 在檔尾加一段 /* == <area> (NN) == */
    contract/             # errors、limits、byte-source、formats、kinds、save、props（02）；editor.ts（03）；image-resolver.ts（04）
    i18n/                 # en.ts、zh-tw.ts、messages.ts、use-t.ts（02）；檔名 kebab-case，locale 值仍是 "zh-TW"
    primitives/           # root、root-context、cx 與 §9.3 的全部基本元件（02）
    viewer/               # 03；editors.ts 是編輯器開關；markdown-body.tsx、excalidraw-body.tsx（04）
    markdown/  excalidraw/                    # 04
    media/                # 06；沒有自己的 subpath
    video-editor/  audio-editor/              # 07、08
    comp/                 # 09；tsconfig.comp.json 不含 DOM lib
    image-editor/         # 10：engine/gl/、worker/、ui/、doc/；11：tools/；12：adjust/、effects/；13：text/、shapes/
  site/                   # docs 站 + playground（05），不進發佈的套件
    public/               # _headers（CSP）、samples/、theme-boot.js
  docs/
    plans/                # README.md（01）
    guides/               # 05 起：guides.json、getting-started.md、connect.md（04、10 增補）
  scripts/                # check-entry-deps.mjs、verify-pack.mjs、check-licenses.mjs（01）；api-docs.mjs、llms-txt.mjs、site-smoke.mjs（05）；smoke-comp.mjs（09）
  test/                   # 跨模組的 fixture 與 CSP 測試頁（04、07）
  LICENSE  THIRD_PARTY_NOTICES.md  README.md  CHANGELOG.md  CLAUDE.md
  tsconfig.json  tsconfig.comp.json  tsdown.config.ts  vitest.config.ts
  .github/workflows/ci.yml  release.yml
```

- build 用 tsdown（不是 tsc）：多個 entry 共用的程式要由 bundler 切成共用 chunk，入口檢查看的也是 build 出來的靜態 import 圖。設定照 `../storage/client/tsdown.config.ts`。
- docs 站與 playground 合成一個 `site/`：同一頁就能拖檔進來看、編輯、下載存檔。這本身就證明「零伺服器」（DevTools 的 Network 是空的）。部署到 Cloudflare Workers 的 `file-viewer.anyknown.com`，方法照 ui 的 `site:deploy`。
- 版本：semver。首發 0.0.1 只是佔名、沒有 API，在本機手動發（npm 只能給已經存在的套件綁 trusted publisher，照 ui 的經驗，01 P04-2）。第一個能用的版本是 0.1.0，之後一律由 tag `v*` 觸發 `release.yml`，tag 和 `package.json` 不一致就失敗。npm trusted publishing（OIDC），repo 不存 npm token。`CHANGELOG.md` 用 Keep a Changelog。
- 宿主只吃 npm 發佈的版本；開發時用 `pnpm link` 試，不 commit。
- third-party notices：`THIRD_PARTY_NOTICES.md` 放進發佈的 `files`。內容有兩段：抄進來的程式（Compositor @11d8d7a、opencut-classic @cf5e79e，附 MIT 全文與版權行），以及 runtime 依賴的清單；mediabunny 那一條寫確切版本、MPL-2.0、對應 tag 的原始碼網址。升 mediabunny 時同一個 commit 改這個檔。宿主自己的 notices（storage 規劃中的 `public/third-party-notices.txt`）再收錄本套件。
- 程式規則：dynamic import 的目標檔不能叫 `index.*`（例如 `import("../video-editor/ui/video-editor")`，不是 `import("../video-editor/index")`）。宿主 bundler 用目標檔名當 chunk 名，會變成 `index-<hash>`，product 的 chunks-check 拒絕 `index-*`。`scripts/check-entry-deps.mjs` 會檢查 build 出來的 `dist/`（01 P02-1）。
- CI（`ci.yml`，照 ui 用 turbo 遠端快取，teamSlug `anyknown`（server 一個 token 對一個 team，共用 ~/.anyknown/turbo-token））：`pnpm check`（typecheck、lint、fmt:check、入口檢查）、`pnpm test`（jsdom），還有：
  - `pnpm test:browser`：browser 模式的 vitest（headless Chromium），給 GL、WebCodecs、canvas 的測試用；
  - `pnpm verify:pack`（`scripts/verify-pack.mjs`）：打包後從外面 resolve exports map 的每一條；
  - 入口檢查（`scripts/check-entry-deps.mjs`）：build 後的 `dist/index.js` 靜態 import 圖裡不能有 `@excalidraw/`、`mediabunny`、`react-markdown`、`remark-`、`rehype-`、`unified`、`fflate`，大小合計 ≤ 64 KiB；另外掃整個 `dist/`，`import()` 的相對路徑目標檔名不能是 `index.*` 或 `index-*`；
  - 授權檢查（`scripts/check-licenses.mjs`）：production 依賴只准 MIT、ISC、BSD-2-Clause、BSD-3-Clause、Apache-2.0、0BSD；例外兩條：`mediabunny` 可以是 MPL-2.0，名稱以 `@fontsource/` 或 `@fontsource-variable/` 開頭的字型套件可以是 OFL-1.1（01 P02-3 一次寫好，07、13 不改這支 script）。出現 GPL / LGPL / Unknown 就失敗；`dependencies` 裡每個套件名都必須出現在 `THIRD_PARTY_NOTICES.md`；
  - lint 規則：`src/**` 不准 import `@anyknown/*`（不 import storage、product，也不 import ui 的任何 JS）。package 邊界是主要證明，lint 只是第二道。
- 授權：`LICENSE` 是 MIT，版權行照 ui 目前的寫法（見 §8 第 1 題）。

## 8. 開放問題（要 CEO 決定）

1. `LICENSE` 的版權人：ui 寫的是個人（「Copyright (c) 2026 Senlima Sun」）。file-viewer 要照寫個人，還是改成公司？等答覆前先照 ui 寫，之後改一行就好，不擋開工。
2. `file-viewer.anyknown.com` 的定位：只當給開發者看的 docs 與 playground，還是也當成給一般使用者的工具（「檔案丟進來就能看和改，不會上傳」），放進 anyknown 的品牌與行銷？這會決定 05 要不要做 landing 等級的首頁、SEO 和文案。等答覆前 05 照開發者文件做。

## 9. 跨 plan 介面表

被兩份以上 plan 用到的符號都在這裡；一份 plan 自己內部用的不列。規則：

- **值與型別都從「檔案路徑」那欄的檔 import**，不經 `src/index.ts`，也沒有 `src/contract/index.ts`、`src/i18n/index.ts`。例外：`src/media/index.ts`、`src/comp/index.ts` 是那個模組的對外 re-export，07 / 08 從 `src/media/index.ts`（`support.ts` 直接 import），10–13 從 `src/comp/index.ts`。
- editor 目錄（`src/markdown`、`src/excalidraw`、`src/video-editor`、`src/audio-editor`、`src/image-editor`）可以 import `src/contract/`、`src/i18n/`、`src/primitives/`、`src/media/`、`src/comp/`，不 import `src/viewer/`。`src/viewer/` 只用 `import()` 載入 editor。例外：04 的 `src/viewer/markdown-body.tsx`、`excalidraw-body.tsx` 與 10 的 `bodies.comp` 是 viewer 這一側的檔。
- 「擁有」是建立這個符號的 plan 與步驟；「增補」是之後只加不改的步驟。

### 9.1 契約（`src/contract/`）

| 符號 | 檔案路徑 | 簽名 | 擁有 | 使用 |
| --- | --- | --- | --- | --- |
| `ByteSource` | `src/contract/byte-source.ts` | 見 §3；`read` 回 `Promise<Uint8Array<ArrayBuffer>>`，收 `signal` | 02 P02-2 | 03、04、05、06、07、08、10；09 的 `ReadRange` 與它相容（`(s, e) => source.read(s, e)`） |
| `FileRef` | `src/contract/byte-source.ts` | `{ name: string; mime?: string; source: ByteSource }` | 02 P02-2 | 03–08、10 |
| `blobSource`、`bytesSource` | `src/contract/byte-source.ts` | `(blob: Blob) => ByteSource`；`(bytes: Uint8Array<ArrayBuffer>) => ByteSource` | 02 P02-2 | 03、05、06、07、08、10（測試與宿主） |
| `readBlob`、`READ_CHUNK_BYTES` | `src/contract/byte-source.ts` | `readBlob(source: ByteSource, opts: { type: string; signal?: AbortSignal }): Promise<Blob>`；4 MiB；讀錯包成 `read_failed`，中止原樣丟 | 02 P02-2 | 03（`load.ts`）、04（`ExcalidrawFileEditor`）、07（圖片素材）、10（開檔） |
| `Limits`、`DEFAULT_LIMITS`、`resolveLimits` | `src/contract/limits.ts` | `{ previewBytes; textBytes; docBytes; projectBytes }`；`resolveLimits(partial?: Partial<Limits>): Limits` | 02 P02-1 | 03、04、10 |
| `ViewKind`、`EditKind` | `src/contract/formats.ts`（`kinds.ts` 再匯出） | 見 §3 | 02 P02-3；`"comp"` 由 10 第 9 步加（同一個 commit 在 `bodies` 加 `comp`） | 03、04、10 |
| `EDITABLE_IMAGE_EXT`、`COMP_SUFFIX` | `src/contract/formats.ts` | `ReadonlySet<string>`；`".comp.zip"` | 02 P02-3 | 10 |
| `kindOf`、`KindResult`、`FileInfo` | `src/contract/kinds.ts` | `kindOf(file: FileInfo, limits?: Partial<Limits>): KindResult`；`KindResult = { view; edit; tooLarge }` | 02 P02-3；03 第 8 步讓 `edit` 只回 `editors` 有登錄的 kind；10 第 9 步加 `.comp.zip` → `view: "comp"` | 03、05、H1、H2 |
| `mimeOf`、`extOf`、`formatOf`、`editKindOf` | `src/contract/kinds.ts` | `mimeOf(file): string`；`extOf(name): string`（`.comp.zip` 回 `"comp.zip"`）；`formatOf(file): ViewKind \| null`；`editKindOf(file, limits: Limits): EditKind \| null`（不看 `editors`） | 02 P02-3 | 03（`mimeOf` 當 Blob type）、10（`extOf(name) === "comp.zip"` 判斷專案檔） |
| `SaveMode`、`SaveRequest`、`SaveHandler` | `src/contract/save.ts` | 見 §3 | 02 P02-4 | 03、04、05、07、08、10 |
| `splitName`、`suggestedName` | `src/contract/save.ts` | `splitName(name): { stem; ext }`（`.comp.zip` 整個算副檔名）；`suggestedName(original: string, ext: string, mode: SaveMode): string` | 02 P02-4 | 04、07、08、10 |
| `ViewerError`、`ViewerErrorCode` | `src/contract/errors.ts` | `new ViewerError(code, { message?, cause? })`；`.code`；`.cause` | 02 P02-1；`"render_failed"` 由 03 第 4 步加 | 全部 |
| `toViewerError`、`isAbortError` | `src/contract/errors.ts` | `toViewerError(e: unknown, code: ViewerErrorCode): ViewerError`；`isAbortError(e: unknown): boolean` | 02 P02-1 | 03、06、07、08、10 |
| `Theme`、`CommonProps`、`FileViewerProps`、`AssetInfo`、`AssetProvider` | `src/contract/props.ts` | 見 §3 | 02 P03-2（含 `excalidraw.assetPath`）；`onEditingChange` 由 03 第 8 步加；`markdown.resolveImage` 的型別由 04 P01-2 改成 `ImageResolver` | 03、04、05、07、10 |
| `EditorProps` | `src/contract/editor.ts` | `CommonProps & { onSave: SaveHandler; onClose: () => void; onDirtyChange?; maxOutputBytes?: number; assets?: AssetProvider }`；`.` 用 `export type` 匯出 | 03 第 8 步 | 04、07、08、10（各 editor 的 props 都是它；`VideoEditorProps` / `AudioEditorProps` / `ImageEditorProps` 只是別名） |
| `ImageResolution`、`ImageResolver` | `src/contract/image-resolver.ts` | `string \| { link: string } \| null`；`(src: string, alt: string) => ImageResolution` | 04 P01-2 | 05（API 頁）、H2 |

### 9.2 i18n 與根元件（`src/i18n/`、`src/primitives/root*`）

| 符號 | 檔案路徑 | 簽名 | 擁有 | 使用 |
| --- | --- | --- | --- | --- |
| `Locale`、`Vars`、`MessageTable`、`Messages`、`format`、`translate`、`commonMessages` | `src/i18n/messages.ts` | 見 02 契約；`MessageTable<K> = Record<Locale, Record<K, string>>`；`Messages = CommonMessages & <各區域>` | 02 P03-1；各區域在加表的那一步加 `& <Area>Messages` | 全部有 UI 的 plan |
| `en`、`zhTW`、`CommonKey`、`CommonMessages` | `src/i18n/en.ts`、`src/i18n/zh-tw.ts` | `common.*`、`discard.*`、`error.*`（每個 `ViewerErrorCode` 一條） | 02 P03-1；`error.render_failed` 由 03 第 4 步加 | 03（狀態訊息查 `error.<code>`）、04、07、08、10 |
| `useT` | `src/i18n/use-t.ts` | `useT<K extends string>(table: MessageTable<K>): (key: K, vars?: Vars) => string` | 02 P03-3 | 03、04、07、08、10–13 |
| `ViewerRoot`、`RootProps` | `src/primitives/root.tsx`、`src/contract/props.ts` | `ViewerRoot(props: Omit<CommonProps, "file"> & { className?: string; children: ReactNode })`；畫 `.fv-root`、`data-theme`、`lang`、`.fv-portal`；巢狀時直接渲染 children | 02 P03-3 | 03（`FileViewer`）、07、08、10（各 editor 最外層） |
| `useRoot`、`RootContext`、`RootContextValue` | `src/primitives/root-context.ts` | `useRoot(): { locale; overrides; limits; theme: Theme \| undefined; portal: HTMLElement \| null; report(e: ViewerError): void }` | 02 P03-3 | 03、04、07、08、10–13 |
| `cx` | `src/primitives/cx.ts` | `cx(...names: (string \| false \| null \| undefined)[]): string` | 02 P03-3 | 有 UI 的 plan |

各區域的字串表（形狀照 02：`<Area>Key`、`<Area>Messages`、`<area>Messages`；key 一律 `<area>.<name>` 扁平字串）：

| 區域（key 前綴） | 檔 | 表名 | 擁有 |
| --- | --- | --- | --- |
| `common.*`、`discard.*`、`error.*` | `src/i18n/en.ts`、`src/i18n/zh-tw.ts` | `commonMessages`（`src/i18n/messages.ts`） | 02 P03-1 |
| `viewer.*` | `src/viewer/messages.ts` | `viewerMessages` | 03 第 4 步 |
| `markdown.*` | `src/markdown/messages.ts` | `markdownMessages` | 04 P01-2 |
| `excalidraw.*` | `src/excalidraw/messages.ts` | `excalidrawMessages` | 04 P02-2 |
| `video.*` | `src/video-editor/messages.ts` | `videoMessages` | 07 第 11 步 |
| `audio.*` | `src/audio-editor/messages.ts` | `audioMessages` | 08 P03-1 |
| `image.*`（10 的部分） | `src/image-editor/messages.ts` | `imageMessages` | 10 第 1 步起，每步加自己的 key |
| `image.select.*`、`image.paint.*` | `src/image-editor/tools/messages.ts` | `selectPaintMessages` | 11 P01-1 起 |
| `image.adjust.*`、`image.effects.*` | `src/image-editor/adjust/messages.ts` | `adjustMessages` | 12 第 1 步起 |
| `image.text.*`、`image.shape.*` | `src/image-editor/text/messages.ts` | `textShapeMessages` | 13 第 1 步起 |

一個檔超過 300 行就把兩種語言拆成同目錄的 `messages-en.ts`、`messages-zh-tw.ts`，表名不變。**每個區域的 `messages.ts` 都會保留**：拆檔之後它只負責組合並匯出該區域的表（`<area>Messages`），不會消失或改名。05 第 9 步的 `scripts/api-docs.mjs` 就是用 glob 讀 `src/**/messages.ts` 的 `*Messages` export 來產生 Messages 表，依賴這個保證。06 不加 key（錯誤都用 `error.<code>`）。

### 9.3 基本元件（`src/primitives/`，全部由 02 提供）

每個都從 `@base-ui/react/<part>` 的 subpath import，popup portal 到 `useRoot().portal`，CSS 加在 `src/styles.css` 的 primitives 段。其他 plan 不在 `src/primitives/` 新增檔案；缺元件時回報主 agent，由 02 的檔增補。

| 元件 | 檔 | 簽名 | 02 的步驟 | 使用 |
| --- | --- | --- | --- | --- |
| `Icon`、`IconSize` | `icon.tsx` | `Icon(props: { size?: "sm" \| "md" \| "lg"; label?: string; children: ReactNode })` | P04-1 | 全部 |
| `CloseIcon`、`EditIcon`、`AlertIcon`、`FileIcon` | `glyphs.tsx` | `(props: { size?: IconSize; label?: string }) => JSX.Element`；其他 plan 的圖示放在自己目錄的 `glyphs.tsx` | P04-1 | 03（狀態面板，40 px 由 `.fv-status` 的 CSS 放大）、04、07、08、10 |
| `Button`、`ButtonVariant` | `button.tsx` | `Button(props: ComponentProps<"button"> & { variant?: "primary" \| "secondary" \| "ghost" \| "danger"; icon?: ReactNode })`；只有圖示時必須給 `aria-label` | P04-1 | 03、04、07、08、10–13 |
| `Spinner` | `spinner.tsx` | `Spinner(props: { label: string })` | P04-1 | 03、04、10 |
| `Tooltip` | `tooltip.tsx` | `Tooltip(props: { content: string; delay?: number; children: ReactElement })` | P04-2 | 07、08、10 |
| `Menu`、`MenuItem` | `menu.tsx` | `MenuItem = { id; label; onSelect(): void; disabled?; danger? }`；`Menu(props: { trigger: ReactElement; items: readonly MenuItem[] })` | P04-2 | 07（比例選單）、10（圖層面板的「新增」下拉；12 的項目經 `registerMenuItem({ menu: "layer-new" })` 進來） |
| `Slider` | `slider.tsx` | `Slider(props: { label; value; min; max; step?; disabled?; onValueChange(v: number): void; onValueCommitted?(v: number): void })` | P04-2 | 07、08、10、11、12 |
| `Dialog` | `dialog.tsx` | `Dialog(props: { open; onOpenChange(open: boolean): void; title: string; description?: string; children?: ReactNode; footer?: ReactNode })` | P04-3 | 07、08、10（輸出 / 匯出對話框）、11（擴張 / 收縮 / 羽化、填色、遮蔽，經 `api.openDialog`） |
| `ConfirmDialog` | `dialog.tsx` | `ConfirmDialog(props: { open; onOpenChange; title; description; confirmLabel; cancelLabel; danger?: boolean; onConfirm(): void })`；底下是 Base UI `AlertDialog`。各 plan 寫的「AlertDialog」都是它 | P04-3 | 07（輸出中關閉）、08（輸出中關閉）、10（存檔選擇以外的確認）、11（點陣化文字 / 形狀圖層）、13（缺字型） |
| `DiscardDialog` | `dialog.tsx` | `DiscardDialog(props: { open; onOpenChange; onDiscard(): void })`；字串固定用 `discard.*` | P04-3 | 04、07、08、10 |
| `Popover` | `popover.tsx` | `Popover(props: { trigger: ReactElement; label: string; children: ReactNode; onOpenChange?(open: boolean): void })`；`label` 是 trigger 的 `aria-label`；`onOpenChange` 在每次開、關時呼叫（Base UI 的 `Popover.Root` 本來就支援） | P04-4（新增） | 08（音量、正規化、去掉靜音）、11（顏色挑選器） |
| `ToggleGroup` | `toggle-group.tsx` | `ToggleGroup<T extends string>(props: { label: string; value: T; options: readonly { value: T; label: string; icon?: ReactNode }[]; onChange(v: T): void })` | P04-4（新增） | 10（裁切比例、匯出格式）、11（選取運算模式、取樣、漸層、遮蔽樣式）、13（文字對齊、形狀種類） |
| `RadioGroup` | `radio-group.tsx` | `RadioGroup<T extends string>(props: { label: string; value: T; options: readonly { value: T; label: string; description?: string; disabled?: boolean }[]; onChange(v: T): void })` | P04-4（新增） | 07（輸出畫質）、08（輸出格式與位元率） |
| `Switch` | `switch.tsx` | `Switch(props: { label: string; checked: boolean; onCheckedChange(checked: boolean): void; disabled?: boolean })` | P04-4（新增） | 11（魔術棒、仿製）、12（調整與效果面板）、13（自動行距） |
| `Progress` | `progress.tsx` | `Progress(props: { label: string; value: number \| null })`；0–1，`null` = 不定進度（線性、不回彈） | P04-4（新增） | 07（素材載入、輸出）、08（掃峰值、輸出）、11（長時間的 worker 工作） |
| `Select` | `select.tsx` | `Select<T extends string>(props: { label: string; value: T; groups: readonly (readonly { value: T; label: string }[])[]; onChange(v: T): void })`；組間畫分隔線 | P04-5（新增） | 10（混合模式）、12（通道、色域、筆畫位置）、13（字重） |
| `NumberField` | `number-field.tsx` | `NumberField(props: { label: string; value: number; min?: number; max?: number; step?: number; onChange(v: number): void; onCommit?(v: number): void })`；標籤可拖曳（Base UI `ScrubArea`） | P04-5（新增） | 10（變形、不透明度）、11（筆刷、容許值、選取的數值）、13（字級、字距、行距、圓角、線寬） |
| `ContextMenu` | `context-menu.tsx` | `ContextMenu(props: { items: readonly MenuItem[]; children: ReactElement })` | P04-5（新增） | 10（圖層右鍵；12 的項目經 `registerMenuItem({ menu: "layer-context" })` 進來） |
| `Menubar` | `menubar.tsx` | `Menubar(props: { menus: readonly { id: string; label: string; items: readonly (MenuItem & { shortcut?: string })[] }[] })` | P04-5（新增） | 10（選單列；11 的項目經 `registerMenuItem` 進來） |

### 9.4 viewer（`src/viewer/`）

| 符號 | 檔案路徑 | 簽名 | 擁有 | 使用 |
| --- | --- | --- | --- | --- |
| `FileViewer` | `src/viewer/file-viewer.tsx` | `FileViewer(props: FileViewerProps): JSX.Element` | 03 第 6 步；編輯模式第 9 步 | 05、H1、H2 |
| `editors`、`EditorRegistry` | `src/viewer/editors.ts` | `EditorRegistry = Partial<Record<EditKind, ComponentType<EditorProps>>>`；每行 `<kind>: lazy(() => import("../<dir>/<定義元件的檔>").then((m) => ({ default: m.<Editor> })))`；目標檔不能叫 `index.*`（§7），例如 `excalidraw` → `../excalidraw/file-editor`、`video` → `../video-editor/ui/video-editor`、`audio` → `../audio-editor/audio-editor`、`image` → `../image-editor/image-editor` | 03 第 8 步（空表） | `kindOf`（03 第 8 步接上）；04 P03-2 加 `excalidraw`（`ExcalidrawFileEditor`，檔 `src/excalidraw/file-editor.tsx`）；07 第 11 步加 `video`（`VideoEditor`）；08 P03-1 加 `audio`（`AudioEditor`）；v0.3 發版 commit 加 `image`（`ImageEditor`） |
| `bodies`、`BodyProps` | `src/viewer/bodies.tsx` | `bodies: Record<ViewKind, ComponentType<BodyProps>>`；`BodyProps = { file: FileRef; loaded: Loaded; fail(e: ViewerError): void; viewer: FileViewerProps }` | 03 第 5 步 | 04 P01-4 換 `markdown`、P02-3 換 `excalidraw`；10 第 9 步加 `comp`（`lazy(() => import("../image-editor/comp-preview"))`） |
| `Loaded`、`load` | `src/viewer/load.ts` | `Loaded = { blob: Blob; url: string \| null; text: string \| null }`；`load(view, file, signal, limits)` 用 `readBlob`，`type` 是 `view === "pdf" ? "application/pdf" : mimeOf(file)`；大小依 kind 檢查（previewBytes / textBytes / docBytes）。`view === "comp"` 不讀檔、不檢查大小，回空的 `Loaded`，body 用 `BodyProps.file.source` 自己 `readHead`；`Limits.projectBytes` 只在進入編輯時檢查，預覽不檢查 | 03 第 3 步 | 04、10 的 body |

### 9.5 媒體層（`src/media/`，06）

| 符號 | 檔案路徑 | 簽名 | 擁有 | 使用 |
| --- | --- | --- | --- | --- |
| `hasVideoCodecs` | `src/media/support.ts`（不 import mediabunny，不經 `index.ts`） | `(): boolean`：`VideoDecoder` 與 `VideoEncoder` 都存在 | 06 P01-1 | 07（進編輯器後判斷，沒有就顯示說明） |
| `toMediaError` | `src/media/media-error.ts` | `toMediaError(error: unknown, fallback: ViewerErrorCode): ViewerError`；abort 原樣丟 | 06 P01-1 | 07、08（播放與輸出時的錯誤用 `toMediaError(e, "decode_failed")`） |
| `mediaSource` | `src/media/source.ts` | `mediaSource(source: ByteSource, signal?: AbortSignal): CustomSource` | 06 P01-2 | 06 內部；07、08 一律經 `openMedia` |
| `openMedia`、`MediaNeed`、`OpenedMedia` | `src/media/open-media.ts` | `openMedia(source: ByteSource, need: "video" \| "audio", signal?: AbortSignal): Promise<OpenedMedia>`；`OpenedMedia = { input: Input; video: InputVideoTrack \| null; audio: InputAudioTrack \| null; duration: number; dispose(): void }`；錯誤碼照 06 的對照表 | 06 P01-2 | 07（每個影片 / 音訊素材；寬高從 `video.displayWidth` / `displayHeight`、fps 從 `video.computePacketStats()` 由 07 自己算）、08（`need: "audio"`） |
| `createBlobSink`、`BlobSink`、`SinkLayout`、`DEFAULT_LAYOUT` | `src/media/blob-sink.ts` | `createBlobSink(options?: { maxBytes?: number }, layout?: SinkLayout): BlobSink`；`BlobSink = { readonly writable: WritableStream<StreamTargetChunk>; readonly size: number; toBlob(mime: string): Blob }`；用法 `new StreamTarget(sink.writable)`，`output.finalize()` 之後 `sink.toBlob(mime)`；超過 `maxBytes` 丟 `output_too_large`；取消時丟掉 sink 的參照即可，沒有 `discard()` | 06 P01-3 | 07、08 |

### 9.6 `./comp`（`src/comp/`，09）

全部從 `src/comp/index.ts` import。

| 符號 | 簽名 | 擁有 | 使用 |
| --- | --- | --- | --- |
| `ProjectError`、`ProjectErrorCode` | 見 §3 | 09 P01-1 | 10（轉成 `ViewerError`） |
| `PngImage`、`decodePng`、`pngSize`、`encodePng`、`encodeMask`、`createPngEncoder` | `PngImage = { width; height; channels: 1 \| 4; data: Uint8Array }`；`decodePng(bytes, kind: "layer" \| "mask"): PngImage`；`pngSize(bytes): { width; height }`；`encodePng(image: PngImage): Uint8Array` | 09 P02-1、P02-2 | 10（worker 的 `encodePng` / `decodePng` job、開檔前用 `pngSize` 算像素預算） |
| `Manifest`、`LayerRecord`、`LayerTransform`、`LayerAdjustment`、`LayerEffects`、`LayerTextStyle`、`LayerShapeStyle`、`CanvasGuide`、`BlendMode` | zod schema 推出的型別，欄位照 Compositor v11 | 09 P03-1–P03-3 | 10（`Layer` = `LayerRecord`）、12（調整與效果）、13（文字用 `LayerTextStyle`、形狀用 `LayerShapeStyle`） |
| `parseManifest`、`stringifyManifest`、`treeEntries` | 見 09 契約 | 09 P03-3 | 10 |
| `validateLikeCompositor` | `(m: Manifest): string[]`，空陣列 = 合法 | 09 P03-4 | 10、13 |
| `Project`、`readProject`、`writeProject`、`fromImage` | `Project = { manifest; assets: Map<string, Uint8Array>; preview?: Uint8Array }`；`readProject(bytes: Uint8Array): Project`；`writeProject(p: Project): Blob`；`fromImage(image: { width; height; rgba }, layerName: string): Project` | 09 P04-1 | 10（開檔、存檔）、11、12（測試裡重讀存出來的 `.comp.zip`） |
| `ReadRange`、`readHead` | `ReadRange = (start, end) => Promise<Uint8Array>`；`readHead(read): Promise<{ manifest; preview? } \| null>` | 09 P04-2 | 10（`comp-preview.tsx`）、H2 |
| `summarize` | `(m: Manifest, name: string): string` | 09 P04-3 | H2 |

### 9.7 影像編輯器的擴充介面（`src/image-editor/`，10）

11–13 只透過這些介面接進 10：import 下表「檔案路徑」欄的檔，不改 10 的其他檔（唯一的改動是 `installExtensions` 加一行 import 與一行呼叫）。型別與註冊函式在 10 第 1 步定下，純函式在第 2 步，GL 與 `EditorApi` 的實作在第 3 步；11–13 只等這三步（畫在外框上的部分另等第 4、5 步，見「擁有」欄）。之後只加不改。

規則：

- **翻譯**：交給 10 的 `MessageKey`（`ToolSpec.label`、`MenuItemSpec.label`、`dispatch` / `commit` 的 label、`showError` 的 key、`api.t`、`useLabel()`）一律用 `src/image-editor/labels.ts` 的合併表翻：`commonMessages` → `imageMessages` → `registerMessages` 註冊的表（依註冊順序），同一個 key 取第一張有它的表；宿主 `messages` 蓋過全部；語系是 `useRoot().locale`。所以每份擴充的 `register…()` 第一行是 `registerMessages(<自己的表>)`。擴充自己的 React 元件：自己區域的 key 用 `useT(<自己的表>)`，`common.*` / `error.*` 用 `useT(commonMessages)`，別的區域用 `useLabel()`；React 外用 `api.t`。
- **快捷鍵衝突照 Photoshop**（10 第 4 步 `ui/shortcuts.ts` 的分派順序）：輸入框有焦點 → 不處理；目前工具的 `onKeyDown`；有選取且按不帶修飾鍵的 Delete / Backspace → `SelectionProvider.clear`（清掉選取範圍內的像素）；選單快捷鍵（`layer.delete` 在這一層，所以沒有選取時才刪圖層）；工具鍵。移動工具（`V`，10 第 5 步）在有選取時把拖曳、按鍵、overlay 與換工具的收尾交給 `SelectionProvider.move`（移動選取範圍內的像素）。11 只要 `registerSelection` 就接手這兩個行為。
- **測試**：`mountCanvas`、`mountEditor` 不呼叫 `installExtensions`；擴充的測試在 `beforeEach` 先 `resetRegistry()` 再呼叫自己的 register 函式，然後才 mount（`mountEditor` 自己呼叫冪等的 `registerCore()`）。兩者都畫 `UiOutlet`、都在掛上後呼叫 `setups()`。
- **按需載入**：`import()` 的目標不准叫 `index.*`（product 的 chunks-check 拒絕 `index-*` chunk）。`bodies.comp` 載入 `src/image-editor/comp-preview.tsx`；`editors.image` 載入 `src/image-editor/image-editor.tsx`（`m.ImageEditor`），不載入 `index.ts`。11–13 不用 `import()`。

| 符號 | 檔案路徑 | 簽名 | 擁有 | 使用 |
| --- | --- | --- | --- | --- |
| `ImageEditor`、`ImageEditorProps` | `src/image-editor/index.ts`（實作 `image-editor.tsx`） | `ImageEditor(props: EditorProps)`；`ImageEditorProps = EditorProps` | 10 第 7 步 | 05（API 頁）、v0.3 發版 commit（登錄 `editors.image`：`lazy(() => import("../image-editor/image-editor").then((m) => ({ default: m.ImageEditor })))`）、11（走查測試） |
| `EditorApi` 與 `Layer`、`LayerId`、`Doc`、`LayerPixels`、`Command`、`PixelTile`、`Session`、`Rect`、`Point`、`Size`、`Mat2D`、`PixelTarget`、`ViewTransform`、`EffectTarget`、`MessageKey`、`BLEND_MODES` | `src/image-editor/api.ts` | 照 10 契約「擴充介面」原文。改像素：`snapshotTiles` → `writeRegion` → `commit(label, doc, tiles)` | 10 第 1 步 | 11、12、13 |
| `AdjustmentSettings`、`AdjustmentKind` | `src/image-editor/api.ts` | `AdjustmentSettings = LayerAdjustment`（09）；`AdjustmentKind = AdjustmentSettings["kind"]` | 10 第 1 步 | 12 |
| `PassView` | `src/image-editor/api.ts` | `{ scale; width; height; docFromPx: Mat2D; forExport: boolean }`；`forExport` = 存檔、匯出、`readComposite` 時為 true，畫面為 false | 10 第 1 步；傳值在第 3 步的 `engine/render.ts` | 12（`forExport` 時效果不套預覽上限、不進快取） |
| `EditorApi.pixelSize`、`resizePixels`、`LayerResize`、`commit` 的第 4 個參數 | `src/image-editor/api.ts` | `pixelSize(id, target): Size \| null`（texture 尺寸，沒有 texture 回 null）；`resizePixels(id, target, size: Size, opts?: { offset?: Point; pixels?: Uint8Array }): LayerResize`（換成新尺寸的 texture；有 `pixels` 就整張寫入，否則舊像素放在 `offset`，其餘 image 透明、mask 填邊緣多數值；邊長超過丟 `too_large`；不改文件、不記 undo）；`commit(label, doc, tiles, resizes?: readonly LayerResize[])`：undo 先寫回 tiles 的 before 再換回 resizes 的 before，redo 相反 | 10 第 1 步；實作第 3 步 | 11（畫到圖層外擴大圖層、圖層像素尺寸）、13（文字 / 形狀重畫成新大小時原 id 就地換） |
| `EditorApi.selection`、`Selection`、`SelectionProvider`、`registerSelection`、`selectionProvider` | `src/image-editor/api.ts`、`registry.ts` | `Selection = { version: number; texture: WebGLTexture /* 畫布大小 R8，255 = 全選 */; bounds: Rect; read(rect: Rect): Uint8Array /* 文件座標 R8 */ }`；`SelectionProvider = { get(api): Selection \| null; clear?(api): void; move?: Pick<ToolSpec, "onPointerDown" \| "onPointerMove" \| "onPointerUp" \| "onKeyDown" \| "drawOverlay" \| "onDeactivate"> }`；`registerSelection(p)` 只能一次，第二次丟 Error；`api.selection()` = `selectionProvider()?.get(api) ?? null` | 10 第 1 步；`api.selection` 第 3 步；Delete 分派第 4 步、移動工具第 5 步 | 11（註冊 provider：內容、清除、移動像素）、12（新增調整圖層時拿選取當遮色片） |
| `registerPropertyPanel`、`PropertyPanelSpec`、`propertyPanels` | `src/image-editor/registry.ts`、`api.ts` | `PropertyPanelSpec = { id; order?; when(layer: Layer, api): boolean; component: ComponentType<{ api: EditorApi; layer: Layer }> }`；屬性欄先畫目前工具的 `panel`，再依 `order` 畫 `session.active` 那一層 `when` 為 true 的面板；id 重複丟 Error | 10 第 1 步；畫出來在第 4 步的 `ui/properties.tsx` | 12（調整面板、效果面板） |
| `EditorApi.openDialog`、`showError`、`t` | `src/image-editor/api.ts`（後台 `src/image-editor/ui-slot.tsx` 的 `createUiSlot`、`UiOutlet`） | `openDialog(render: (close: () => void) => ReactNode): () => void`（節點畫在編輯器自己的 `ViewerRoot` 裡，主題、語系、宿主 `messages` 生效）；`showError(e: ViewerError, key?: MessageKey, vars?: Vars): void`（交給宿主 `onError`，提示條顯示 key，沒給用 `error.<code>`，下一次有 label 的 dispatch / commit 清掉）；`t(key: MessageKey, vars?: Vars): string` | 10 第 1 步（slot）；接到 `EditorApi` 第 3 步；提示條第 4 步 | 11（選取 / 填色 / 遮蔽 / 點陣化對話框、預算錯誤、貼上的圖層名）、13（形狀圖層名） |
| `registerSetup`、`SetupFn`、`setups` | `src/image-editor/registry.ts`、`api.ts` | `SetupFn = (api: EditorApi, root: HTMLElement) => (() => void) \| void`；每個編輯器掛上時呼叫一次，root 是 `.fv-root`，回傳的函式在卸載時呼叫；同一個函式第二次註冊略過 | 10 第 1 步；呼叫點在第 3 步 `mountCanvas`、第 4 步 `mountEditor`、第 7 步 `ImageEditor` | 11（在 `.fv-root` 收 `paste`；走查測試取得 `api`） |
| `registerMessages`、`messageTables`、`labelTable`、`labelOf`、`useLabel` | `src/image-editor/registry.ts`、`labels.ts`、`ui/use-label.ts` | `registerMessages(table: MessageTable<string>): void`（同一個物件第二次略過）；`labelOf(locale, overrides, key, vars?)`；`useLabel(): (key: MessageKey, vars?: Vars) => string`；合併規則見上面「翻譯」 | 10 第 1 步；`useLabel` 第 4 步 | 11、12、13（`register…()` 第一行註冊自己的表；12 的元件用 `useLabel` 翻別區的 key） |
| `registerTool`、`ToolSpec`（含 `onDeactivate`） | `src/image-editor/registry.ts`、`api.ts` | `registerTool(spec: ToolSpec): void`；工具鍵或 id 重複丟 Error；`onDeactivate?(api)`：`setSession` 把 `tool` 換走之前呼叫一次 | 10 第 1 步；`onDeactivate` 呼叫點第 3 步 | 11（換工具時合併浮動像素）、13（換工具時結束文字編輯） |
| `registerAdjustment`、`AdjustmentHooks` | 同上 | `lut?(gl, s): { dims: 1 \| 3; texture: WebGLTexture }`（1 = 256×1 RGBA16F `TEXTURE_2D`、3 = 33³ RGBA16F `TEXTURE_3D`）；`pass?(gl, src, dst, s, view: PassView)`；`reach(s, scale): number`；`lut` 與 `pass` 擇一 | 10 第 1 步；查表 shader 在 10 第 3 步的 `src/image-editor/engine/render.ts` | 12（8 種只建 LUT texture，4 種給 `pass`；12 不寫查表 shader） |
| `registerEffects`、`EffectsHooks` | 同上 | `pass(gl, layer, src, dst: EffectTarget, view: PassView & { version: number })`；`reach(effects, scale): number` | 10 第 1 步 | 12 |
| `registerMenuItem`、`MenuItemSpec`、`MenuId` | 同上 | `MenuId = "edit" \| "image" \| "layer" \| "select" \| "layer-context" \| "layer-new" \| "hidden"`；`shortcut` 寫成 `"Mod+Shift+D"` | 10 第 1 步 | 11（選取、編輯、影像選單與快捷鍵）、12（右鍵效果項目、新增調整圖層） |
| `registerLayerDecor`、`LayerDecor` | 同上 | `{ id; thumbnail?(layer, api); badge?(layer, api); onTransformEnd?(id, before, api); onThumbnailClick?(layer, target: PixelTarget, mods: { mod; shift; alt }, api): boolean }`；`onThumbnailClick` 在 10 的預設處理之前依序呼叫，回 true 吃掉 | 10 第 1 步；畫出來與點擊在 10 第 4 步的圖層列 | 11（⌘ 點縮圖載入選取）、12（調整標記、`fx` 標記）、13（文字 / 形狀縮圖、形狀變形後重畫） |
| `registerOverlay`、`OverlaySpec` | 同上 | `{ id; draw(ctx, view, api, time); animated?(api): boolean }` | 10 第 1 步 | 11（選取虛線） |
| `resetRegistry` | `src/image-editor/registry.ts` | `(): void`，只給測試；清空所有表（含 messages、selection provider、setups） | 10 第 1 步 | 11、12、13 的測試 |
| `installExtensions` | `src/image-editor/extensions.ts` | `installExtensions(): void`，冪等；11、12、13 各加一行 import 與一行呼叫自己的 `register…()` | 10 第 1 步 | 11、12、13 |
| `insertLayer`、`removeLayers`、`patchLayer` | `src/image-editor/doc/commands/layers.ts` | `insertLayer(record: Layer, above: LayerId \| null): Command`（插在 `above` 正上方、沿用它的 `parentID`；`above` 是資料夾時插在整個子樹上方；null 時放根層最上面；`activeLayerID` 設成新層；非資料夾、非調整圖層的 `pixels.image` 設 `{ kind: "gpu" }`，有 `maskFile` 時 `pixels.mask` 也設）；`removeLayers(ids: readonly LayerId[]): Command`（資料夾連子孫、`pixels`、指向它們的 `maskSourceID` 一起拿掉）；`patchLayer(id, patch: Partial<Layer>): Command`（淺合併，值為 `undefined` 的 key 刪掉） | 10 第 2 步 | 11（貼上的新層、點陣化、擴大圖層後的 transform）、12（新增調整圖層、改設定與效果）、13（新增 / 刪除 / 改文字與形狀圖層） |
| `layerMatrixOf`、`resizedTransform` | `src/image-editor/doc/layer-matrix.ts` | `layerMatrixOf(t: Layer["transform"], px: Size): Mat2D`（文件 → 圖層像素）；`resizedTransform(t, from: Size, to: Size, offset: Point): Layer["transform"]`（舊像素留在原文件位置、像素密度不變的新 transform） | 10 第 2 步 | 11（擴大圖層或遮色片） |
| `compile`、`FULLSCREEN_VS`、`drawFullscreen`、`createTarget` | `src/image-editor/engine/gl/program.ts`、`target.ts` | `compile(gl, vs, fs): WebGLProgram`（依 gl 與原始碼快取，失敗丟含 info log 的 Error）；`FULLSCREEN_VS`（`#version 300 es`，輸出 `v_uv`）；`drawFullscreen(gl)`；`createTarget(gl, width, height, format: "rgba16f" \| "rgba8" \| "r8"): { texture; framebuffer; width; height; dispose() }` | 10 第 3 步 | 11（選取、筆刷 shader）、12（調整與效果的 pass；12 不另帶 GL helper） |
| `jobs`、`JobKind`、`JobInput`、`JobOutput`、`runInWorker` | `src/image-editor/worker/jobs.ts`；`EditorApi.runInWorker` | `encodePng: (input: PngImage, signal) => Uint8Array`；`decodePng: (input: { bytes: Uint8Array; kind: "layer" \| "mask" }, signal) => PngImage`；其他 plan 加一個 key | 10 第 1 步 | 11（加 `wand`、`heal`、`contentFill`；剪貼簿用 `encodePng`）、13（只在整合測試用 `encodePng`，元件只 `writeRegion`） |
| `setSession` 的 `renderHidden` | `src/image-editor/api.ts` 的 `Session` | `ReadonlySet<LayerId>`，只影響畫面 | 10 第 1 步 | 13（編輯文字時藏那一層） |
| `makeDoc`、`mountCanvas`、`mountEditor` | `src/image-editor/test/make-doc.ts`、`mount-canvas.tsx`、`mount-editor.tsx` | 測試輔助；見上面「測試」 | 10 第 2、3、4 步 | 11、12、13 的測試 |

### 9.8 repo 層的共用檔

| 東西 | 路徑 | 擁有 | 誰增補 |
| --- | --- | --- | --- |
| `package.json` 的 `exports` 與 `tsdown.config.ts` 的 `entry` | repo 根 | 01 P01-1（`.`、`./styles.css`） | §4 表的「誰加」 |
| `src/styles.css` | `src/styles.css` | 01 P01-1 建、02 P03-3 寫 root 段 | 每份有 UI 的 plan 在檔尾加一段，不用 `@import` |
| `tsconfig.comp.json`（`src/comp/**`，不含 DOM lib；一開始就含 `@types/node` 與 `types: ["node"]`） | repo 根 | 01 P01-2（`typecheck` 已含 `tsc --noEmit -p tsconfig.comp.json`） | 不改：09 不另建 `src/comp/tsconfig.json`、不改 scripts、不補 `@types/node` 與 `types` |
| `src/comp/index.ts` | `src/comp/` | 01 P01-2 建空殼（兩行註解加 `export {};`，不在 `exports` 與 `entry` 裡） | 09 P01-1 整檔覆寫並加 `./comp` export；之後 09 的各步加匯出 |
| `scripts/check-entry-deps.mjs` | `scripts/` | 01 P02-1（含 dynamic import 目標不得叫 `index.*` 的檢查，§7） | 不改；黑名單見 §7 |
| `scripts/check-licenses.mjs`（含 OFL-1.1 字型例外） | `scripts/` | 01 P02-3 | 不改 |
| `THIRD_PARTY_NOTICES.md` | repo 根 | 01 P02-3 | 02（`@base-ui/react`）、04、06、07、09、10、13：加依賴或抄程式的那一步 |
| `docs/plans/README.md` | `docs/plans/` | 01 P03-1 | — |
| `docs/guides/connect.md`、`docs/guides/guides.json` | `docs/guides/` | 05 第 6、8 步 | 04 → 05 Phase 04（字型、`assetPath`）；07 第 20 步（影片編輯器：`editor.assets`、`maxOutputBytes`、不放寬 CSP）；10 第 12 步（WebGL2、`optimizeDeps.exclude`；這條只由 10 處理） |
| `site/vite.config.ts`、`site/public/_headers` | `site/` | 05 第 1、4 步 | 10 第 12 步（`optimizeDeps.exclude`；只由 10 處理，05 不寫） |
| playground（`site/playground/`，對外只有 `Playground({ locale, theme })`） | `site/playground/` | 05 第 2 步 | 07 第 20 步（素材欄的 `editor.assets`） |
| `@fontsource-variable/geist@5.3.0`（`pnpm add --save-exact`，確切版本） | `package.json` 的 `dependencies` | 07 第 8 步 | 13 第 2 步（同版本，已存在就不動） |
