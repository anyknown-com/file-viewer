# 02 contract — 宿主與每個 editor 共用的型別、bytes 讀取、格式判斷、錯誤、i18n、根元素、Base UI 基本元件與 `styles.css`

狀態：planned（2026-10-08）；blocker：Phase 01 無（在 `../ui` 做），Phase 02–04 要 01 scaffold Phase 02 做完（`pnpm test`、`pnpm test:browser`、`pnpm check`、`check:licenses` 都在）；model：主 agent（Phase 01），sonnet（Phase 02–04）；push：Phase 01 在 `../ui` 自己 push 並打 tag，file-viewer 這邊整份做完 push 一次。

本份定稿 00-overview §3。03–13 只能在這裡定的型別上「加」（加欄位、加 union 成員、加 i18n key、加 CSS 段），不能改名、不能改簽名。符號名、路徑、簽名、擁有者以 00-overview §9 為準；下面「契約」的每個符號都對得到 §9.1–§9.3。

## 判斷

- **`ByteSource` 定稿成 `read(start, end, signal?) → Promise<Uint8Array<ArrayBuffer>>`。** 00-overview §3 寫的是 `Uint8Array`；收窄成 `Uint8Array<ArrayBuffer>`（TS 5.7 起的泛型），是因為 `new Blob([...])` 只吃 `ArrayBuffer` 底的 view，`ArrayBufferLike`（可能是 `SharedArrayBuffer`）要先複製一次。宿主解密出來的本來就是 `ArrayBuffer`，收窄不增加宿主負擔，全套件的 `readBlob` 與 mediabunny source 都省一次複製。`read` 的規則寫死：`0 ≤ start ≤ end ≤ size` 的整數，否則丟 `RangeError`；回傳長度必須剛好 `end - start`；`signal` 已中止時以 `signal.reason` reject。storage 14 §1 的 `ByteSource` 沒有 `signal`，本份加上，因為元件卸載時要能一次取消所有讀取（00-overview §3 規則）。
- **`bytesSource` 的 `read` 回傳複本**（`bytes.slice`），不回 `subarray`：editor 可能把結果 transfer 給 worker，transfer 一個 subarray 會把宿主整塊 buffer detach 掉。`bytesSource` 本來就只給小檔用，多一次複製可以接受。
- **整檔讀取只有一個實作：`readBlob`**（`src/contract/byte-source.ts`，不從 `.` 匯出）。先試 `source.blob()`；沒有就每次 4 MiB 循序 `read`，片段直接組成 `Blob`，不併成一整塊。03 的 `src/viewer/load.ts`、04 的 `ExcalidrawFileEditor`、07 的圖片素材、10 的 `.comp.zip` 開檔都呼叫它；其他 plan 不另寫整檔讀取。讀到長度不對、或 `read` 丟出非中止的錯誤，一律包成 `ViewerError("read_failed")`。中止的錯誤原樣往上丟，UI 不把中止當錯誤顯示。
- **`kindOf` 依副檔名優先，副檔名不認得才看 mime**（storage 11 §2、13 §3、14 §2、15 §2 的規則合起來）。唯一的例外沿用 storage 15：`.webm` 只有在 mime 是 `audio/webm` 時算 audio，其餘算 video。表格只列瀏覽器真的畫得出來的格式，所以 `image/heic` 這類 mime 回 `null`，不像 storage 的 `previewKind` 一律收 `image/*`。
- **`kindOf` 的回傳多一個 `tooLarge: boolean`**（對 §3 是「加」）。§3 的 `{ view, edit }` 分不出「格式不支援」和「格式支援但太大」，03 卻要分別顯示 `unsupported` 與 `too_large`。
- **`Limits` 多一個 `projectBytes`（預設 1 GiB）**（對 §3 是「加」）。`.comp.zip` 要整檔讀進記憶體再解每一層，上限沿用 storage 13 §3。影片與音訊的編輯不設大小上限，因為 editor 只做隨機 `read`（storage 14 §2）；輸出的上限是 `maxOutputBytes`，由 06 檢查。
- **能編輯的判斷寫在 02，「本版有沒有出這個 editor」由 03 的 `editors` 管。** `editKindOf` 是完整的規則，02 一次寫完並測完，不看任何登錄表。02 的 `kindOf` 先回 `edit: editKindOf(...)`；`kindOf` 的 `edit` 改成只在 `src/viewer/editors.ts` 的 `editors[kind]` 有登錄時才回，是 03 第 8 步加的（00-overview §3「編輯器開關」）。02 沒有任何出貨旗標或集合。因此 02 的測試只透過 `editKindOf` 驗編輯規則，不斷言 `kindOf(...).edit`，03 第 8 步改 `kindOf` 時 02 的測試不用改。`EditorProps` 也不在 02：它由 03 第 8 步定義在 `src/contract/editor.ts`（形狀見 00-overview §3）。
- **`.comp.zip` 在 02 的 `view` 是 `null`。** 10 第 9 步要做檔頭預覽時，在 `src/contract/formats.ts` 的 `ViewKind` 加 `"comp"`，並讓 `kindOf` 對 `.comp.zip` 回 `view: "comp"`（只加不改；同一個 commit 在 `bodies` 加 `comp`）。
- **錯誤只有一個類別 `ViewerError`。** 錯誤碼照 §3，`message` 預設等於 code。02 定九個碼；`"render_failed"` 由 03 第 4 步加進 `ViewerErrorCode`，同一步在 `src/i18n/en.ts`、`zh-tw.ts` 加 `error.render_failed`。UI 依 code 查 `error.<code>` 字串顯示。唯一的例外是 `save_failed`：宿主的 `onSave` reject 時，UI 顯示宿主給的 `error.message`；message 是空的才用 `error.save_failed`。
- **i18n 依區域切檔，型別合成一份。** 00-overview §7 原本是一份 `en.ts` 放全部字串。改成每個區域（`common`、`viewer`、`markdown`、`video`…）各有一張表，放在自己的目錄裡，跟著自己的 chunk 載入。理由：五份影像 plan 的字串會有幾百條，兩種語言如果全放進入口，會吃掉入口檢查的 64 KiB 上限（01 契約）。`Messages` 型別在 `src/i18n/messages.ts` 用 `import type` 把各區的型別交集起來，型別匯入不會進 bundle。所以宿主的 `messages?: Partial<Messages>` 照樣能覆寫任何一條字串。各區域的檔與表名見 00-overview §9.2。
- **檔名用 `zh-tw.ts`，不是 §7 寫的 `zh-TW.ts`。** 01 的 lint 規定檔名一律 kebab-case。locale 的值仍是 `"zh-TW"`。
- **不做複數、不做 RTL。** 字串用 `{name}` 插值，數量相關的句子要寫成不需要複數變化的說法。
- **根元素 `ViewerRoot`（內部元件，不從 `.` 匯出）。** `FileViewer` 和每個從 subpath 單獨匯出的 editor，最外層都包一層 `ViewerRoot`。它做四件事：
  - 渲染 `<div class="fv-root" data-theme lang>`；
  - 提供 context（locale、字串覆寫、limits、`report`、portal 容器）；
  - 在自己最後放一個 portal 容器 `<div class="fv-portal">`；
  - 巢狀時不再包一層：已經在另一個 `ViewerRoot` 裡面，就直接渲染 children。`FileViewer` 開 editor 時就是這種情況。
- **popup 一律 portal 到 `.fv-portal`，不 portal 到 `<body>`。** 這樣宿主在 `.fv-root` 上覆寫的 `--ak-*`（storage 的 shadcn 色），以及 `data-theme`，popup 都吃得到。ui 的 theming 指南說主題要放在 `<html>`，原因正是 popup 會 portal 到 body；本套件是嵌在別人頁面裡的元件，不能要求宿主改 `<html>`。代價是 `.fv-root` 會設 `overflow: hidden`，所以 Tooltip 與 Menu 的 Positioner 一律用 `positionMethod="fixed"`，Dialog 的 popup 也用 `position: fixed`。
- **`.fv-root` 與 popup 都不設 `transform` / `filter` / `contain`。** 這三個屬性會讓 `position: fixed` 改成相對於該元素定位。Dialog 置中改用 `inset: 0; margin: auto`，不用 `translate(-50%, -50%)`。
- **主題。** `theme` 不給，就不寫 `data-theme`，跟著宿主頁面與 OS 走。給了就寫上，同時設 `color-scheme`，原生的捲軸與表單控制項才會跟著變。
  - `tokens.css` 的 `[data-theme="dark"]` 本來就對任何子樹有效。
  - `[data-theme="light"]` 目前只在 `<html>` 上有效，所以 Phase 01 先改 ui 的 generator，補一段子樹選擇器，發 ui 的下一個 minor（寫這份時是 0.11.0）。本套件的 peer 範圍從那一版開始。
  - Phase 04 第 6 步在真的 Chromium 裡驗：頁面是深色，`.fv-root[data-theme="light"]` 仍拿到淺色的 `--ak-bg`。
- **基本元件全部由 02 提供（00-overview §9.3），其他 plan 不在 `src/primitives/` 新增檔案；** 缺元件時回報主 agent，由 02 的檔增補。清單：`Icon`、四個圖示、`Button`、`Spinner`、`Tooltip`、`Menu`、`Slider`、`Dialog`、`ConfirmDialog`、`DiscardDialog`、`Popover`、`ToggleGroup`、`RadioGroup`、`Switch`、`Progress`、`Select`、`NumberField`、`ContextMenu`、`Menubar`。各 plan 寫的「AlertDialog」都是 `ConfirmDialog`。
  - 外觀對照 `../ui/src/components/{button,tooltip,dropdown,slider,dialog,popover,segmented,radio,progress,select}/` 的樣子（沒有對應目錄的就照同一套 `--ak-*` 自己配），用 plain CSS 加 `--ak-*` 重寫。不 import ui 的任何 JS（01 的 lint 擋 `@anyknown/*`）。
  - 圖示不加套件，用 24 單位 viewBox、stroke 2 的 inline SVG（同 ui 的 `ICON_STROKE`）。02 只畫四個（close、edit、alert、file）；其他 plan 的圖示放在各自目錄的 `glyphs.tsx`。
- **`styles.css` 只有一個檔，每份 plan 在檔尾加一段。** 01 的 tsdown 只複製 `src/styles.css`（`copy: [{ from: "src/styles.css", to: "dist" }]`）。改成多檔加 `@import`，要動 01 的 build 設定，換來的只是檔案分開，不值得。
  - 每段開頭寫 `/* == <area> (<plan 編號>) == */`；
  - class 一律 `fv-<area>-*`；
  - oxlint 不檢查 CSS 的行數。
- **editor 的邊界**（從 storage 13 §1、14 §1 搬過來，改成本 repo 的路徑）：
  - 每個 editor 只吃 `EditorProps`：`file: FileRef`（bytes 從 `file.source` 讀），以及 `onSave`、`onClose`。存檔只交出 `SaveRequest`。
  - 不知道 E2EE、storage、SDK 存在。
  - 字串不再由宿主傳 `t` 進來（storage 13 §1 的做法），改由 editor 自己呼叫 `useT(<area>Messages)`，宿主用 `locale` / `messages` 控制。
  - import 範圍：`src/<editor>/**` 只准 import 自己的目錄、`src/contract/**`、`src/i18n/**`、`src/primitives/**`、`src/media/**`（06）、`src/comp/**`（09），以及自己的 npm 依賴；不准 import `src/viewer/**`。`src/viewer/**` 只能用 `import()` 載入 editor。
  - 這條邊界由 `scripts/check-entry-deps.mjs`（01）在入口那一側把關，另外靠 code review。本份不另外加 lint 規則，因為 01 定了「之後的 plan 不改設定檔」。
- **不做**：`urlSource`（HTTP Range）、其他語言的內建字串、icon 套件、`CSPProvider`。storage 的 CSP 有 `style-src 'unsafe-inline'`，Base UI 的 inline style 不受影響。

## 契約

檔案（全部在 `src/`）：

| 檔 | 符號 | 從 `.` 匯出 |
| --- | --- | --- |
| `contract/errors.ts` | `ViewerErrorCode`、`ViewerError`、`toViewerError`、`isAbortError` | `ViewerErrorCode`、`ViewerError` |
| `contract/limits.ts` | `Limits`、`DEFAULT_LIMITS`、`resolveLimits` | `Limits`、`DEFAULT_LIMITS` |
| `contract/byte-source.ts` | `ByteSource`、`FileRef`、`blobSource`、`bytesSource`、`readBlob`、`READ_CHUNK_BYTES` | `ByteSource`、`FileRef`、`blobSource`、`bytesSource` |
| `contract/formats.ts` | `ViewKind`、`EditKind`（型別放這裡，`kinds.ts` 再匯出）、`IMAGE_EXT`、`VIDEO_EXT`、`AUDIO_EXT`、`TEXT_EXT`、`MARKDOWN_EXT`、`EXCALIDRAW_EXT`、`PDF_EXT`（`Record<副檔名, mime>`）、`*_MIME`（`ReadonlySet<string>`）、`EDITABLE_IMAGE_EXT`、`COMP_SUFFIX` | 無 |
| `contract/kinds.ts` | `ViewKind`、`EditKind`、`KindResult`、`FileInfo`、`kindOf`、`mimeOf`、`formatOf`、`editKindOf`、`extOf` | `ViewKind`、`EditKind`、`KindResult`、`kindOf`、`mimeOf` |
| `contract/save.ts` | `SaveMode`、`SaveRequest`、`SaveHandler`、`splitName`、`suggestedName` | `SaveMode`、`SaveRequest`、`SaveHandler` |
| `contract/props.ts` | `Theme`、`CommonProps`、`RootProps`、`FileViewerProps`、`AssetInfo`、`AssetProvider` | 除了 `RootProps` 都匯出 |
| `contract/editor.ts` | `EditorProps`（**03 第 8 步建，02 不寫**；形狀見 00-overview §3；`.` 用 `export type` 匯出） | 03 第 8 步加 |
| `i18n/en.ts`、`i18n/zh-tw.ts` | `en`、`CommonKey`、`CommonMessages`、`zhTW` | 無 |
| `i18n/messages.ts` | `Locale`、`MessageTable`、`Messages`、`Vars`、`format`、`translate`、`commonMessages` | `Locale`、`Messages` |
| `i18n/use-t.ts` | `useT` | 無 |
| `primitives/root-context.ts` | `RootContextValue`、`RootContext`、`useRoot` | 無 |
| `primitives/root.tsx` | `ViewerRoot` | 無 |
| `primitives/cx.ts` | `cx` | 無 |
| `primitives/{icon,glyphs,button,spinner,tooltip,menu,slider,dialog,popover,toggle-group,radio-group,switch,progress,select,number-field,context-menu,menubar}.tsx` | 見下方「基本元件」 | 無 |
| `styles.css` | `fv-root`、`fv-portal`、`fv-icon*`、`fv-button*`、`fv-spinner`、`fv-tooltip*`、`fv-menu*`、`fv-slider*`、`fv-dialog*`、`fv-popover*`、`fv-toggle-group*`、`fv-radio*`、`fv-switch*`、`fv-progress*`、`fv-select*`、`fv-number-field*`、`fv-menubar*` | `./styles.css` |

型別與簽名（定稿；之後只加）：

```ts
// contract/byte-source.ts
export interface ByteSource {
  readonly size: number;
  /** [start, end)；0 ≤ start ≤ end ≤ size 的整數，否則 RangeError；回傳長度 = end - start；signal 中止時以 signal.reason reject */
  read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>>;
  /** 有的話整檔讀走這條（File / Blob 零拷貝） */
  blob?(signal?: AbortSignal): Promise<Blob>;
}
export type FileRef = { name: string; mime?: string; source: ByteSource };
export function blobSource(blob: Blob): ByteSource;
export function bytesSource(bytes: Uint8Array<ArrayBuffer>): ByteSource;
export const READ_CHUNK_BYTES = 4 * 1024 * 1024;
/** 內部：整檔讀成 Blob，type 設成 opts.type */
export function readBlob(source: ByteSource, opts: { type: string; signal?: AbortSignal }): Promise<Blob>;

// contract/limits.ts
export type Limits = { previewBytes: number; textBytes: number; docBytes: number; projectBytes: number };
export const DEFAULT_LIMITS: Readonly<Limits>; // 64 MiB / 1 MiB / 8 MiB / 1 GiB
export function resolveLimits(partial?: Partial<Limits>): Limits; // undefined 的欄位用預設

// contract/formats.ts（kinds.ts 再匯出）
export type ViewKind = "image" | "video" | "audio" | "pdf" | "text" | "markdown" | "excalidraw"; // 10 第 9 步加 "comp"
export type EditKind = "markdown" | "excalidraw" | "image" | "video" | "audio";
export const EDITABLE_IMAGE_EXT: ReadonlySet<string>; // jpg jpeg png webp avif bmp
export const COMP_SUFFIX = ".comp.zip";

// contract/kinds.ts
export type { ViewKind, EditKind } from "./formats";
export type FileInfo = { name: string; mime?: string; size: number };
export type KindResult = { view: ViewKind | null; edit: EditKind | null; tooLarge: boolean };
export function kindOf(file: FileInfo, limits?: Partial<Limits>): KindResult; // 02：edit = editKindOf(...)；03 第 8 步改成只回 editors 有登錄的 kind
export function mimeOf(file: { name: string; mime?: string }): string;
export function extOf(name: string): string;                                     // 內部：小寫、不含點；".comp.zip" 回 "comp.zip"
export function formatOf(file: { name: string; mime?: string }): ViewKind | null; // 內部：不看大小
export function editKindOf(file: FileInfo, limits: Limits): EditKind | null;      // 內部：不看 editors 登錄

// contract/save.ts
export type SaveMode = "replace" | "copy" | "export";
export type SaveRequest = { blob: Blob; mime: string; ext: string; mode: SaveMode; suggestedName: string };
export type SaveHandler = (req: SaveRequest) => Promise<void>;
export function splitName(name: string): { stem: string; ext: string }; // 內部；ext 含點；".comp.zip" 整個算副檔名
export function suggestedName(original: string, ext: string, mode: SaveMode): string; // 內部

// contract/errors.ts
export type ViewerErrorCode =
  | "unsupported" | "too_large" | "read_failed" | "decode_failed" | "codec_unsupported"
  | "webgl_unavailable" | "webcodecs_unavailable" | "output_too_large" | "save_failed"; // 03 第 4 步加 "render_failed"
export class ViewerError extends Error {
  readonly code: ViewerErrorCode;
  constructor(code: ViewerErrorCode, options?: { message?: string; cause?: unknown });
}
export function toViewerError(e: unknown, code: ViewerErrorCode): ViewerError; // 內部
export function isAbortError(e: unknown): boolean;                             // 內部

// contract/props.ts
export type Theme = "light" | "dark";
export type CommonProps = {
  file: FileRef;
  locale?: Locale;               // 預設 "en"
  messages?: Partial<Messages>;
  theme?: Theme;                 // 不給就跟宿主頁面與 OS
  limits?: Partial<Limits>;
  onError?: (e: ViewerError) => void;
};
export type RootProps = Omit<CommonProps, "file"> & { className?: string; children: ReactNode }; // 內部
// EditorProps 不在這裡：03 第 8 步定義在 contract/editor.ts
export type FileViewerProps = CommonProps & {
  onSave?: SaveHandler;
  onDirtyChange?: (dirty: boolean) => void;
  markdown?: { resolveImage?: (src: string, alt: string) => string | null }; // 04 P01-2 改成回 ImageResolution（型別在 contract/image-resolver.ts）
  excalidraw?: { assetPath?: string };                                       // 04：轉給 window.EXCALIDRAW_ASSET_PATH
  editor?: { maxOutputBytes?: number; assets?: AssetProvider };              // 07、08、10
  // onEditingChange?: (editing: boolean) => void  ← 03 第 8 步加
};
export type AssetInfo = { id: string; name: string; mime: string; size: number };
export type AssetProvider = { list(): Promise<AssetInfo[]>; open(id: string): Promise<ByteSource> };

// i18n/messages.ts
export type Locale = "en" | "zh-TW";
export type Vars = Record<string, string | number>;
export type MessageTable<K extends string> = Record<Locale, Record<K, string>>;
export type Messages = CommonMessages; // 每份 plan 在這一行加 `& <Area>Messages`（import type）
export function format(template: string, vars?: Vars): string; // {name} 換成 vars.name；沒給的保留原樣
export function translate<K extends string>(table: MessageTable<K>, locale: Locale, overrides: Partial<Messages>, key: K, vars?: Vars): string;
export const commonMessages: MessageTable<CommonKey>;

// i18n/use-t.ts
export function useT<K extends string>(table: MessageTable<K>): (key: K, vars?: Vars) => string;

// primitives/root-context.ts
export type RootContextValue = {
  locale: Locale; overrides: Partial<Messages>; limits: Limits; theme: Theme | undefined;
  portal: HTMLElement | null; report: (e: ViewerError) => void;
};
export const RootContext: React.Context<RootContextValue | null>;
export function useRoot(): RootContextValue; // 在 ViewerRoot 外呼叫丟 Error("@anyknown/file-viewer: rendered outside ViewerRoot")
```

格式表（`contract/formats.ts`；副檔名小寫、不含點 → 標準 mime）：

| kind | 副檔名 → mime | 也認的 mime |
| --- | --- | --- |
| image | jpg、jpeg → image/jpeg；png → image/png；webp → image/webp；avif → image/avif；gif → image/gif；bmp → image/bmp；svg → image/svg+xml | 左欄的 mime |
| video | mp4、m4v → video/mp4；mov → video/quicktime；webm → video/webm；mkv → video/x-matroska | 左欄的 mime |
| audio | mp3 → audio/mpeg；m4a → audio/mp4；aac → audio/aac；wav → audio/wav；ogg、oga → audio/ogg；opus → audio/opus；flac → audio/flac | 左欄的 mime，加 audio/x-m4a、audio/x-wav、audio/wave、audio/webm、audio/x-flac |
| pdf | pdf → application/pdf | application/pdf |
| markdown | md、markdown → text/markdown | text/markdown、text/x-markdown |
| excalidraw | excalidraw → application/vnd.excalidraw+json | application/vnd.excalidraw+json |
| text | txt、text、log → text/plain；csv → text/csv；tsv → text/tab-separated-values；json → application/json；xml → application/xml；yaml、yml → text/yaml | 任何 `text/*`（markdown 的兩個除外）、application/json、application/xml |

規則：

- `formatOf` 的判斷順序：
  1. 檔名小寫後以 `.comp.zip` 結尾，回 `null`。
  2. 副檔名在表裡，就照表回。例外：副檔名是 `webm`、而且 mime 是 `audio/webm`，回 audio。
  3. 副檔名不在表裡，看 mime（小寫、去掉 `;` 之後的參數）。mime 是空的或 `application/octet-stream`，回 `null`。
- `kindOf` 的大小上限：
  - image、video、audio、pdf 用 `previewBytes`；text 用 `textBytes`；markdown、excalidraw 用 `docBytes`。
  - 大小在上限內：`view` 是那個 kind，`tooLarge` 是 false。
  - 超過上限：`view` 是 `null`，`tooLarge` 是 true。
  - 格式不認得：`view` 是 `null`，`tooLarge` 是 false。
  - `edit` = `editKindOf(file, resolveLimits(limits))`。（03 第 8 步會改成：只有 `editors[kind]` 有登錄才回，否則 `null`。）
- `editKindOf` 的規則：
  - markdown 或 excalidraw 格式、而且 ≤ `docBytes`：回同名的 kind。
  - 副檔名在 `EDITABLE_IMAGE_EXT`（jpg、jpeg、png、webp、avif、bmp）、而且 ≤ `previewBytes`：回 `"image"`。
  - 檔名以 `.comp.zip` 結尾、而且 ≤ `projectBytes`：回 `"image"`。
  - video 格式回 `"video"`、audio 格式回 `"audio"`，都不看大小。
  - 其他回 `null`。
  - 不開 gif（存檔會丟掉動畫）、svg（向量、可能帶 script），沿用 storage 13 §3。
- `mimeOf` 的判斷順序：
  1. `.comp.zip` 結尾，回 `application/zip`。
  2. 副檔名在表裡，回表裡的 mime（`webm` 加上 `audio/webm` 的組合，回 `audio/webm`）。
  3. mime 不是空的、也不是 `application/octet-stream`，回小寫的 mime。
  4. 都不是，回 `application/octet-stream`。
  - 03 用 `mimeOf` 的結果當 objectURL 的 type。SVG 放進 `<img>` 一定要是 `image/svg+xml`。
- `suggestedName`：`replace` 回 `stem + ext`；`copy`、`export` 回 `` `${stem} (edited)${ext}` ``。撞名由宿主處理。

i18n：

- key 的命名是 `<area>.<name>`。各區域與負責的 plan：
  - `common.*`、`discard.*`、`error.*`：02；
  - `viewer.*`：03（`src/viewer/messages.ts`）；
  - `markdown.*`（`src/markdown/messages.ts`）、`excalidraw.*`（`src/excalidraw/messages.ts`）：04；
  - `video.*`：07（`src/video-editor/messages.ts`）；
  - `audio.*`：08（`src/audio-editor/messages.ts`）；
  - `image.*`：10–13（`src/image-editor/messages.ts`、`tools/messages.ts`、`adjust/messages.ts`、`text/messages.ts`）；
  - 06 不加 key，錯誤一律用 `error.<code>`。
- 每個區域一個檔 `src/<dir>/messages.ts`，內容有：
  - `const en = {…} satisfies Record<string, string>`；
  - `export type <Area>Key = keyof typeof en`；
  - `export type <Area>Messages = Record<<Area>Key, string>`；
  - `export const <area>Messages: MessageTable<<Area>Key> = { en, "zh-TW": {…} }`。
  - 檔案超過 300 行，就把兩種語言拆成 `messages-en.ts` 與 `messages-zh-tw.ts`。
- 加一個區域的同一個 commit，要在 `src/i18n/messages.ts` 的 `Messages` 加上 `& <Area>Messages`。
- 02 的 key：

| key | en | zh-TW |
| --- | --- | --- |
| `common.cancel` | Cancel | 取消 |
| `common.close` | Close | 關閉 |
| `common.save` | Save | 儲存 |
| `common.edit` | Edit | 編輯 |
| `common.loading` | Loading… | 載入中… |
| `discard.title` | Discard your changes? | 要放棄修改嗎？ |
| `discard.body` | Your changes haven't been saved. | 修改還沒有儲存。 |
| `discard.confirm` | Discard | 放棄修改 |
| `discard.keep` | Keep editing | 繼續編輯 |
| `error.unsupported` | This file type can't be previewed. | 這種檔案無法預覽。 |
| `error.too_large` | This file is too large to preview. | 這個檔案太大，無法預覽。 |
| `error.read_failed` | The file couldn't be read. | 讀不到這個檔案。 |
| `error.decode_failed` | This file is damaged or in a format that can't be opened. | 這個檔案損壞，或格式無法開啟。 |
| `error.codec_unsupported` | This browser can't decode this file's codec. | 這個瀏覽器解不了這個檔案的編碼。 |
| `error.webgl_unavailable` | This browser doesn't support WebGL2, which the editor needs. | 這個瀏覽器不支援編輯器需要的 WebGL2。 |
| `error.webcodecs_unavailable` | This browser doesn't support WebCodecs, which the editor needs. | 這個瀏覽器不支援編輯器需要的 WebCodecs。 |
| `error.output_too_large` | The result would be larger than allowed. Try a lower quality. | 輸出的檔案會超過上限，請改用較低的畫質。 |
| `error.save_failed` | Couldn't save the file. | 存檔失敗。 |

基本元件（`src/primitives/`；全部從 `@base-ui/react/<part>` 的 subpath import；每個 popup 都 portal 到 `useRoot().portal`）：

```ts
// icon.tsx
export type IconSize = "sm" | "md" | "lg"; // 14 / 16 / 20 px（--ak-icon-size-sm / -md / -lg）
export function Icon(props: { size?: IconSize; label?: string; children: ReactNode }): React.JSX.Element;
// glyphs.tsx
export function CloseIcon(props: { size?: IconSize; label?: string }): React.JSX.Element; // 另有 EditIcon、AlertIcon、FileIcon，簽名相同
// button.tsx
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonProps = Omit<React.ComponentProps<"button">, "children"> & { variant?: ButtonVariant; icon?: ReactNode }
  & ({ children: ReactNode } | { children?: undefined; "aria-label": string });
export function Button(props: ButtonProps): React.JSX.Element;
// spinner.tsx
export function Spinner(props: { label: string }): React.JSX.Element;
// tooltip.tsx
export function Tooltip(props: { content: string; delay?: number; children: React.ReactElement }): React.JSX.Element; // delay 預設 400
// menu.tsx
export type MenuItem = { id: string; label: string; onSelect: () => void; disabled?: boolean; danger?: boolean };
export function Menu(props: { trigger: React.ReactElement; items: readonly MenuItem[] }): React.JSX.Element;
// slider.tsx
export function Slider(props: {
  label: string; value: number; min: number; max: number; step?: number; disabled?: boolean;
  onValueChange: (value: number) => void; onValueCommitted?: (value: number) => void;
}): React.JSX.Element;
// dialog.tsx
export function Dialog(props: { open: boolean; onOpenChange: (open: boolean) => void; title: string;
  description?: string; children?: ReactNode; footer?: ReactNode }): React.JSX.Element;
export function ConfirmDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; title: string;
  description: string; confirmLabel: string; cancelLabel: string; danger?: boolean; onConfirm: () => void }): React.JSX.Element;
export function DiscardDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; onDiscard: () => void }): React.JSX.Element;
// popover.tsx
export function Popover(props: { trigger: React.ReactElement; label: string; children: ReactNode }): React.JSX.Element; // label = trigger 的 aria-label
// toggle-group.tsx
export function ToggleGroup<T extends string>(props: {
  label: string; value: T; options: readonly { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void;
}): React.JSX.Element;
// radio-group.tsx
export function RadioGroup<T extends string>(props: {
  label: string; value: T; options: readonly { value: T; label: string; description?: string; disabled?: boolean }[]; onChange: (v: T) => void;
}): React.JSX.Element;
// switch.tsx
export function Switch(props: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean }): React.JSX.Element;
// progress.tsx
export function Progress(props: { label: string; value: number | null }): React.JSX.Element; // 0–1；null = 不定進度（線性、不回彈）
// select.tsx
export function Select<T extends string>(props: {
  label: string; value: T; groups: readonly (readonly { value: T; label: string }[])[]; onChange: (v: T) => void;
}): React.JSX.Element; // 組與組之間畫分隔線
// number-field.tsx
export function NumberField(props: {
  label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; onCommit?: (v: number) => void;
}): React.JSX.Element; // 標籤可拖曳（Base UI ScrubArea）
// context-menu.tsx（MenuItem 從 ./menu import）
export function ContextMenu(props: { items: readonly MenuItem[]; children: React.ReactElement }): React.JSX.Element;
// menubar.tsx
export function Menubar(props: {
  menus: readonly { id: string; label: string; items: readonly (MenuItem & { shortcut?: string })[] }[];
}): React.JSX.Element;
```

依賴（02 加入）：

- dependencies：`@base-ui/react@^1.8.0`。
- peerDependencies：`react: "^19"`、`react-dom: "^19"`、`@anyknown/ui: ">=0.11.0"`。peer 範圍放寬到 `>=`，因為本套件只用 `--ak-*` 變數名；已經發佈的變數名要等 ui 的 major 才會拿掉（`../ui/scripts/tokens-css.mjs` 的 `PUBLISHED`）。
- devDependencies：`react`、`react-dom`、`@types/react`、`@types/react-dom`、`@testing-library/react@^16`、`@testing-library/dom@^10`、`@testing-library/user-event@^14`、`@anyknown/ui@0.11.0`。

宿主要做的（寫進 05 的「接上你的 app」頁，H1 / H2 照做）：

- 依序 import `@anyknown/ui/tokens.css`、`@anyknown/file-viewer/styles.css`。
- 要自己的色票，就在 `.fv-root` 上覆寫 `--ak-*`。

## 形式

- 所有元件的外觀都跟 `@anyknown/ui` 一致：同樣的圓角（`--ak-corner-*`）、陰影（`--ak-shadow-*`）、字級（`--ak-type-*`）、動畫時間（`--ak-motion-quick` 加 `--ak-motion-ease-out`）。動畫只做淡入淡出，不縮放、不回彈。
- `Button`：高 32 px。
  - secondary：`--ak-surface` 底、`--ak-border-control` 框；
  - primary：`--ak-accent` 底、`--ak-accent-text` 字；
  - ghost：透明；
  - danger：`--ak-danger-solid` 底；
  - 只有圖示時是 32 × 32 的正方形。
- `Dialog` / `ConfirmDialog`：`--ak-scrim` 遮罩，置中卡片寬 `min(420px, 100vw - 32px)`，圓角 `--ak-corner-modal`，按鈕列靠右，取消在左、確認在右。
- `Tooltip`：`--ak-surface-raised` 底，`--ak-type-t1` 字。
- `Menu`：同一個底色，項目被選中時用 `--ak-ink-n8` 的底；`danger` 的項目用 `--ak-danger` 字色。
- `Slider`：4 px 的軌道，14 px 的圓形把手。
- `Popover`：外觀同 `Menu` 的 popup（`--ak-surface-raised` 底、`--ak-border` 框、`--ak-shadow-float`），內距 `--ak-space-md`。
- `ToggleGroup`：一排相連的按鈕，選中的用 `--ak-ink-n8` 底；高 32 px。
- `RadioGroup`：圓形單選鈕在左，label 在右，`description` 在 label 下方用 `--ak-text-muted`。
- `Switch`：36 × 20 px 的軌道，開啟時 `--ak-accent` 底，把手 16 px。
- `Progress`：4 px 高的線性軌道；`value` 為 `null` 時，40% 寬的指示條用 `left` 從 -40% 滑到 100%，循環播放，不回彈。
- `Select`：trigger 外觀同 secondary `Button`，高 32 px；popup 同 `Menu`；組間 1 px `--ak-border` 分隔線。
- `NumberField`：高 32 px 的輸入框，標籤在左、可拖曳（游標 `ew-resize`）。
- `ContextMenu`、`Menubar`：popup 外觀同 `Menu`；`Menubar` 的頂列項目高 32 px，`shortcut` 靠右用 `--ak-text-faint`。

## Phase 01 — ui：`data-theme="light"` 對任何子樹都有效（主 agent 在 `../ui` 做）

blocker：無；執行：主 agent。依 `../ui` 的 CLAUDE.md 與 git 規則，在 `/Users/solemnis/Documents/anyknown-com/ui` 的 `main` 上做。本 phase 是 file-viewer 這邊 Phase 04 第 6 步的前提，所以單獨 push 並發版。

1. generator 加子樹淺色段，重新生成，補測試、文件、changelog。
   - 現況（寫這份時讀過）：
     - `/Users/solemnis/Documents/anyknown-com/ui/scripts/tokens-css.mjs` 的 `generate(groups)` 輸出四段：`html {…}`、`:root {…}`（全部淺色值）、`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`、`[data-theme="dark"] {…}`。後兩段放的是 `themed` 群組裡有 `dark` 值的變數。
     - `src/tokens.css` 是生成出來的檔：`:root` 在第 11 行，`@media` 在第 144 行，`[data-theme="dark"]` 在第 196 行。
     - 現在 OS 是深色時，子樹上的 `data-theme="light"` 沒有任何規則把變數設回淺色，因為子樹從 `:root` 繼承的是深色值。
   - 改 `scripts/tokens-css.mjs` 的 `generate`：
     - 在 `[data-theme="dark"] {…}` 那段之後，加上這一段（`<locked>` 的產法見下一點）：

       ```
       /* data-theme="light" locks light on any element and its subtree, even on a dark OS or inside data-theme="dark". */
       [data-theme="light"] {
       <locked>
       }
       ```
     - `<locked>` 的產法：`themed` 群組裡有 `dark` 值的變數，每個輸出一行 `\t<varName>: <cssValue(v.light)>;`。群組之間空一行，寫法同 `block("dark", "\t")`。
     - `expected()`、`declarations()`、`readGroups()` 都不改。
   - 執行 `pnpm gen:tokens-css`，重新生成 `src/tokens.css`。
   - `src/tokens-css.test.ts` 加一個測試，標題 `[data-theme="light"] 有每個會變色的變數的淺色值`：
     - 期望值：`Object.fromEntries([...want.dark.keys()].map((k) => [k, want.light.get(k)]))`；
     - 實際值：`Object.fromEntries(declarations(css, '[data-theme="light"]'))`；
     - 兩者要相等。
     - 註：`declarations` 用 `indexOf('[data-theme="light"] {')` 找段落。`:root:not([data-theme="light"]) {` 裡那段字後面是 `)`，所以不會被誤認。
   - `docs/guides/theming.md`：
     - 「Lock a theme with `data-theme`」的 CSS 範例，在 `[data-theme="dark"]` 之後加 `[data-theme="light"] { /* light values of the variables that change */ }`。
     - 第 45 行那條改成：「`data-theme="light"` turns any element and its subtree light, also on a dark OS or inside `data-theme="dark"`.」
     - `color-scheme` 範例把 `:root[data-theme="dark"]` 改成 `[data-theme="dark"]`，並加一段 `[data-theme="light"] { color-scheme: light; }`。
   - `CHANGELOG.md`：`## Unreleased` 底下的 `Nothing yet.` 換成：
     - 一個標題 `### Added`；
     - 一條：`- **tokens.css:** \`data-theme="light"\` now locks light on any element and its subtree, also on a dark OS or inside \`data-theme="dark"\`. Before, it only worked on \`<html>\`.`
   - verify：`cd /Users/solemnis/Documents/anyknown-com/ui && pnpm test src/tokens-css.test.ts && pnpm check`
   - commit：`feat(tokens): lock light theme on any subtree with data-theme`
2. 發 `@anyknown/ui` 0.11.0，並更新 docs 站。
   - `package.json` 的 `version` 改成 `0.11.0`。
   - `CHANGELOG.md`：
     - 第 1 步加的 `### Added` 段，移到新標題 `## 0.11.0 — <當天日期 YYYY-MM-DD>` 底下；
     - `## Unreleased` 底下放回 `Nothing yet.`。
   - commit：`chore(release): v0.11.0`。接著 `git pull --rebase && git push`，再 `git tag v0.11.0 && git push origin v0.11.0`。
   - 等 release workflow 跑完，用一次阻塞等待：`gh run watch --exit-status $(gh run list -R anyknown-com/ui --workflow release.yml -L 1 --json databaseId -q '.[0].databaseId')`。
   - 執行 `pnpm site:deploy`，ui.anyknown.com 的 Theming 頁才會換成新的說明。
   - verify：`npm view @anyknown/ui@0.11.0 version`，結果要是 `0.11.0`。

## Phase 02 — 契約的純程式：錯誤、上限、bytes、格式判斷、存檔命名

blocker：01 scaffold Phase 02；model：sonnet。這個 phase 不用 React，不加任何套件。

1. 錯誤與上限。
   - 新增 `src/contract/errors.ts`：
     - `export type ViewerErrorCode`：九個值，照契約。
     - `export class ViewerError extends Error`：
       - `readonly code: ViewerErrorCode`；
       - `constructor(code, options?: { message?: string; cause?: unknown })` 呼叫 `super(options?.message ?? code, { cause: options?.cause })`；
       - `this.name = "ViewerError"`。
     - `export function toViewerError(e: unknown, code: ViewerErrorCode): ViewerError`：`e` 已經是 `ViewerError` 就原樣回傳；否則回 `new ViewerError(code, { cause: e })`。
     - `export function isAbortError(e: unknown): boolean`：`e` 是 `DOMException`（或任何有 `name` 屬性的物件），而且 `name === "AbortError"`。
   - 新增 `src/contract/limits.ts`：
     - `export type Limits`：四個欄位，照契約。
     - `export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({ previewBytes: 64 * 1024 * 1024, textBytes: 1024 * 1024, docBytes: 8 * 1024 * 1024, projectBytes: 1024 * 1024 * 1024 })`。
     - `export function resolveLimits(partial?: Partial<Limits>): Limits`：回一個新物件，以 `DEFAULT_LIMITS` 為底；`partial` 裡值不是 `undefined` 的欄位蓋上去。
   - 測試，新增 `src/contract/errors.test.ts`，案例：
     - `new ViewerError("too_large")` 的 `code` 是 `"too_large"`、`message` 是 `"too_large"`、`name` 是 `"ViewerError"`，而且 `instanceof Error`；
     - 帶 `{ message: "x", cause: c }` 時，`message` 是 `"x"`，`cause` 是 `c`；
     - `toViewerError(new ViewerError("save_failed"), "read_failed")` 的 code 仍是 `save_failed`；
     - `toViewerError(new Error("boom"), "read_failed")` 的 code 是 `read_failed`，`cause` 是原本那個錯誤；
     - `isAbortError(new DOMException("x", "AbortError"))` 是 true；`isAbortError(new Error("x"))` 與 `isAbortError("AbortError")` 都是 false。
   - 測試，新增 `src/contract/limits.test.ts`，案例：
     - `resolveLimits()` 等於 `DEFAULT_LIMITS`，但不是同一個物件；
     - `resolveLimits({ textBytes: 5 })` 只有 `textBytes` 變成 5；
     - `resolveLimits({ textBytes: undefined })` 等於預設值；
     - `DEFAULT_LIMITS` 是 frozen。
   - verify：`pnpm test src/contract/errors.test.ts src/contract/limits.test.ts && pnpm check`
   - commit：`feat(contract): add viewer errors and size limits`
2. `ByteSource` 與整檔讀取。
   - 新增 `src/contract/byte-source.ts`。
     - `ByteSource`、`FileRef` 的型別照契約。
     - `export const READ_CHUNK_BYTES = 4 * 1024 * 1024`。
     - 內部函式 `checkRange(size: number, start: number, end: number): void`：`start`、`end` 要是整數，而且 `0 ≤ start ≤ end ≤ size`；不符合就丟 `new RangeError(\`read(${start}, ${end}) outside [0, ${size}]\`)`。
     - `export function blobSource(blob: Blob): ByteSource`：
       - `size: blob.size`；
       - `read` 依序做：`signal?.throwIfAborted()` → `checkRange` → `new Uint8Array(await blob.slice(start, end).arrayBuffer())` → 再呼叫一次 `signal?.throwIfAborted()`，然後回傳；
       - `blob` 依序做：`signal?.throwIfAborted()` → 回傳 `blob` 本身。
     - `export function bytesSource(bytes: Uint8Array<ArrayBuffer>): ByteSource`：
       - `size: bytes.byteLength`；
       - `read` 依序做：`signal?.throwIfAborted()` → `checkRange` → 回 `bytes.slice(start, end)`（是複本，理由見判斷）；
       - `blob` 回 `new Blob([bytes])`。
     - `export async function readBlob(source: ByteSource, opts: { type: string; signal?: AbortSignal }): Promise<Blob>`：
       - `source.blob` 存在時：`const b = await source.blob(opts.signal)`。`b.type === opts.type` 就回 `b`，否則回 `b.slice(0, b.size, opts.type)`。
       - 不存在時：從 0 開始，每次讀 `READ_CHUNK_BYTES`（最後一段讀到 `size`），呼叫 `source.read(pos, end, opts.signal)`，片段收進陣列。每段讀完檢查 `part.byteLength === end - pos`，不符合就丟 `new ViewerError("read_failed", { message: "short read" })`。全部讀完回 `new Blob(parts, { type: opts.type })`。
       - 錯誤處理：`isAbortError(e)` 的錯誤原樣再丟；其他錯誤丟 `toViewerError(e, "read_failed")`。`ViewerError`、`isAbortError`、`toViewerError` 都從 `src/contract/errors.ts` import。
   - 測試，新增 `src/contract/byte-source.browser.test.ts`。放 browser project 是因為要用真的 Chromium 的 `Blob`，那才是宿主實際給進來的東西。案例：
     - `blobSource(new Blob(["hello"]))`：`size` 是 5；`read(1, 4)` 解碼出來是 `"ell"`；`read(0, 0)` 的長度是 0；`read(2, 1)` 與 `read(0, 6)` 都 reject `RangeError`；`blob()` 回傳的是同一個 Blob 實體；
     - 用一個已經 `abort()` 的 signal 呼叫 `read`，reject 出來的錯誤 `name === "AbortError"`；
     - `bytesSource(new Uint8Array([1, 2, 3]))`：改掉 `read(0, 3)` 回傳陣列的第 0 個 byte，再讀一次，值不變；`(await blob()).size` 是 3；
     - `readBlob` 遇到有 `blob()` 的來源，而且 type 不同（`"image/png"`）：回傳 Blob 的 `type` 是 `"image/png"`，內容相同；
     - `readBlob` 遇到只有 `read` 的假來源（size 9 MiB，`read` 回填 0 的陣列，並記錄每次的參數）：呼叫三次，參數依序是 `[0, 4Mi)`、`[4Mi, 8Mi)`、`[8Mi, 9Mi)`，結果的 size 是 9 MiB；
     - 假來源的 `read` 回傳的長度少了：reject `ViewerError`，code 是 `read_failed`；
     - 假來源的 `read` 丟 `new Error("boom")`：reject `ViewerError`，code 是 `read_failed`，`cause.message` 是 `"boom"`；
     - 讀完第一段就 `abort`：reject 的錯誤 `name === "AbortError"`，而且不是 `ViewerError`。
   - verify：`pnpm test:browser src/contract/byte-source.browser.test.ts && pnpm check`
   - commit：`feat(contract): add byte sources and whole-file blob reads`
3. 格式表與 `kindOf`。
   - 新增 `src/contract/formats.ts`，不 import 任何檔，內容照契約的「格式表」：
     - `export type ViewKind`、`export type EditKind`，值照契約；
     - `IMAGE_EXT`、`VIDEO_EXT`、`AUDIO_EXT`、`PDF_EXT`、`MARKDOWN_EXT`、`EXCALIDRAW_EXT`、`TEXT_EXT`：型別是 `Readonly<Record<string, string>>`，副檔名對 mime。
     - `IMAGE_MIME`、`VIDEO_MIME`、`AUDIO_MIME`、`PDF_MIME`、`MARKDOWN_MIME`、`EXCALIDRAW_MIME`、`TEXT_MIME`：型別是 `ReadonlySet<string>`，放「也認的 mime」。text 另外靠 `text/` 前綴判斷，`TEXT_MIME` 只放 `application/json`、`application/xml`。
     - `EDITABLE_IMAGE_EXT: ReadonlySet<string>`：`jpg jpeg png webp avif bmp`。
     - `COMP_SUFFIX = ".comp.zip"`。
   - 新增 `src/contract/kinds.ts`：
     - `export type { ViewKind, EditKind } from "./formats"`；`FileInfo`、`KindResult` 的型別照契約；
     - `extOf`、`formatOf`、`editKindOf`、`kindOf`、`mimeOf`，規則照契約的「規則」段；
     - `Limits`、`resolveLimits` 從 `./limits` import；`ViewKind`、`EditKind`、各 `*_EXT` / `*_MIME`、`EDITABLE_IMAGE_EXT`、`COMP_SUFFIX` 從 `./formats` import。
     - `kindOf` 回傳的 `edit` 是 `editKindOf(file, resolveLimits(limits))`；不查任何登錄表（`editors` 過濾由 03 第 8 步加在 `kindOf` 裡）。
     - 檔案超過 300 行，就把 `mimeOf` 移到 `src/contract/mime.ts`，並由 `kinds.ts` 再匯出。
   - 測試，新增 `src/contract/kinds.test.ts`。用 `kindOf` 測 view 與 tooLarge，用 `editKindOf(f, DEFAULT_LIMITS)`（從 `src/contract/kinds.ts` import）測 edit；**不斷言 `kindOf(...).edit`**（03 第 8 步會讓它依 `editors` 過濾）。案例：
     - `photo.JPG`，mime `""`，size 1：view `image`，`mimeOf` 是 `image/jpeg`；
     - `a.bin`，mime `image/png`：view `image`；
     - `a.png`，mime `application/octet-stream`：view `image`，`mimeOf` 是 `image/png`；
     - `x.svg`：view `image`、`mimeOf` 是 `image/svg+xml`、edit 是 `null`；
     - `x.gif`：view `image`、edit 是 `null`；
     - `photo.heic`，mime `image/heic`：view `null`、tooLarge false；
     - `clip.webm`，mime `""`：view `video`；同一個檔名、mime `audio/webm`：view `audio`，`mimeOf` 是 `audio/webm`；
     - `song.mp3`、`a.oga`：view `audio`；
     - `doc.pdf`：view `pdf`；
     - `notes.md`，2 MiB：view `markdown`、edit `markdown`；`notes.md`，9 MiB：view `null`、tooLarge true、edit `null`；
     - `x`，mime `text/markdown`：view `markdown`；
     - `readme.txt`，2 MiB：view `null`、tooLarge true；`data.json`：view `text`；`script`，mime `text/x-python; charset=utf-8`：view `text`；
     - `scene.excalidraw`：view `excalidraw`、edit `excalidraw`；
     - `movie.mp4`，3 GiB：view `null`、tooLarge true、edit `video`；
     - `p.COMP.ZIP`，10 MiB：view `null`、tooLarge false、edit `image`、`mimeOf` 是 `application/zip`；同一個檔名、2 GiB：edit `null`；
     - `big.png`，65 MiB：edit `null`；
     - `a.zip`，以及 `noext` 配 mime `""`：view `null`、tooLarge false，`mimeOf` 是 `application/octet-stream`；
     - `kindOf({ name: "a.png", size: 11 }, { previewBytes: 10 })`：tooLarge true；
     - `editKindOf({ name: "a.png", size: 1 }, { ...DEFAULT_LIMITS, previewBytes: 0 })` 是 `null`（上限由參數決定）。
   - verify：`pnpm test src/contract/kinds.test.ts && pnpm check`
   - commit：`feat(contract): classify files into view and edit kinds`
4. 存檔請求與命名。
   - 新增 `src/contract/save.ts`：
     - `SaveMode`、`SaveRequest`、`SaveHandler` 的型別照契約。
     - `splitName(name)` 的規則：
       - 名稱小寫後以 `.comp.zip` 結尾、而且前面還有字：`ext` 是原名的最後 9 個字元（保留大小寫）；
       - 否則找最後一個 `.`。`.` 的位置大於 0、而且不是最後一個字元時，從那裡切開；
       - 其他情況：`ext` 是 `""`，`stem` 是整個名稱。
     - `suggestedName(original, ext, mode)`：先 `splitName(original).stem`，再照契約組出名稱。
   - 測試，新增 `src/contract/save.test.ts`，案例：
     - `splitName("a.md")` 回 `{ stem: "a", ext: ".md" }`；
     - `splitName("A.COMP.ZIP")` 回 `{ stem: "A", ext: ".COMP.ZIP" }`；
     - `splitName("x.tar.gz")` 回 `{ stem: "x.tar", ext: ".gz" }`；
     - `splitName(".bashrc")` 回 `{ stem: ".bashrc", ext: "" }`；
     - `splitName("a.")` 回 `{ stem: "a.", ext: "" }`；
     - `splitName("noext")` 回 `{ stem: "noext", ext: "" }`；
     - `suggestedName("clip.mov", ".mp4", "copy")` 回 `"clip (edited).mp4"`；
     - `suggestedName("photo.jpg", ".comp.zip", "replace")` 回 `"photo.comp.zip"`；
     - `suggestedName("p.comp.zip", ".png", "export")` 回 `"p (edited).png"`。
   - verify：`pnpm test src/contract && pnpm check`

     這條 verify 只跑 jsdom 的 project，`byte-source.browser.test.ts` 不在內。
   - commit：`feat(contract): add save requests and suggested names`

phase 結尾的 verify：`pnpm test src/contract && pnpm test:browser src/contract && pnpm check`

## Phase 03 — i18n、宿主 props、根元素、入口匯出

blocker：Phase 02；model：sonnet。

1. 字串表與翻譯函式（純 TS，還不用 React）。
   - 新增 `src/i18n/en.ts`：
     - `export const en = { … } satisfies Record<string, string> & Record<\`error.${ViewerErrorCode}\`, string>;`，內容是契約表裡 18 個 key 的 en 欄；
     - `export type CommonKey = keyof typeof en;`
     - `export type CommonMessages = Record<CommonKey, string>;`
     - `ViewerErrorCode` 從 `../contract/errors` 用 `import type` 引入。
   - 新增 `src/i18n/zh-tw.ts`：`export const zhTW: CommonMessages = { … }`，內容是契約表的 zh-TW 欄。
   - 新增 `src/i18n/messages.ts`：
     - `Locale`、`Vars`、`MessageTable`、`Messages` 照契約。`Messages = CommonMessages`，上面加一行註解：`// Each area adds "& <Area>Messages" here with import type (02-contract).`
     - `export function format(template: string, vars?: Vars): string`：用 `/\{(\w+)\}/g` 取代成 `String(vars[name])`；`vars` 裡沒有這個 name 時保留原字。
     - `export function translate(table, locale, overrides, key, vars)`：`const s = (overrides as Partial<Record<string, string>>)[key] ?? table[locale][key]`，回傳 `format(s, vars)`。
     - `export const commonMessages: MessageTable<CommonKey> = { en, "zh-TW": zhTW }`。
   - 測試，新增 `src/i18n/messages.test.ts`，案例：
     - `format("Hi {name}", { name: "A" })` 回 `"Hi A"`；
     - `format("{n} of {total}", { n: 1 })` 回 `"1 of {total}"`；
     - 沒有任何 `{` 的字串原樣回傳；
     - `translate(commonMessages, "zh-TW", {}, "common.save")` 回 `"儲存"`；
     - 有覆寫 `{ "common.save": "Store" }` 時回 `"Store"`；
     - `Object.keys(en).sort()` 等於 `Object.keys(zhTW).sort()`；
     - 每個 `ViewerErrorCode`（用測試裡列出的九個字串）都有 `error.<code>` 的 key。
   - verify：`pnpm test src/i18n && pnpm check`
   - commit：`feat(contract): add english and taiwanese mandarin messages`
2. 宿主 props 型別。
   - 新增 `src/contract/props.ts`。內容照契約的 `Theme`、`CommonProps`、`RootProps`、`FileViewerProps`、`AssetInfo`、`AssetProvider`（沒有 `EditorProps`，它在 03 第 8 步的 `src/contract/editor.ts`），全部用 `import type` 引入：
     - `ReactNode` 從 `react`；
     - `FileRef`、`ByteSource` 從 `./byte-source`；
     - `Limits` 從 `./limits`；
     - `SaveHandler` 從 `./save`；
     - `ViewerError` 從 `./errors`；
     - `Locale`、`Messages` 從 `../i18n/messages`。
   - 本步先加型別套件：`pnpm add -D react@^19 react-dom@^19 @types/react@^19 @types/react-dom@^19`。
   - `package.json` 的 `peerDependencies` 手動加 `"react": "^19"`、`"react-dom": "^19"`。01 契約允許之後的 plan 改 `peerDependencies`。
   - 測試，新增 `src/contract/props.test.ts`（用 vitest 的 `expectTypeOf`），案例：
     - `FileViewerProps` 不帶 `onSave` 也成立；
     - `FileViewerProps` 的 `onSave` 型別是 `SaveHandler | undefined`；
     - `CommonProps["theme"]` 等於 `"light" | "dark" | undefined`；
     - `AssetProvider["open"]` 的回傳是 `Promise<ByteSource>`。
   - verify：`pnpm test src/contract/props.test.ts && pnpm check`
   - commit：`feat(contract): add host and editor prop types`
3. `ViewerRoot`、`useRoot`、`useT`，以及 `styles.css` 的 root 段。
   - 加測試套件：`pnpm add -D @testing-library/react@^16 @testing-library/dom@^10 @testing-library/user-event@^14`。
   - 新增 `src/primitives/cx.ts`：`export function cx(...parts: Array<string | false | null | undefined>): string`，把 truthy 的值用空白串起來。
   - 新增 `src/primitives/root-context.ts`：`RootContextValue`、`RootContext`（`createContext<RootContextValue | null>(null)`）、`useRoot()`，簽名與錯誤訊息照契約。
   - 新增 `src/primitives/root.tsx`，`export function ViewerRoot(props: RootProps): React.JSX.Element`。`RootProps` 從 `src/contract/props.ts` 引入。行為：
     - `const parent = useContext(RootContext)`；有 parent 就直接回 `<>{props.children}</>`。
     - 沒有 parent：
       - `const [portal, setPortal] = useState<HTMLElement | null>(null)`；
       - `limits = resolveLimits(props.limits)`，`resolveLimits` 從 `src/contract/limits.ts` 引入；
       - context value 用 `useMemo`，內容是 `{ locale: props.locale ?? "en", overrides: props.messages ?? {}, limits, theme: props.theme, portal, report: (e) => props.onError?.(e) }`；
       - 渲染 `<RootContext value={…}><div className={cx("fv-root", props.className)} data-theme={props.theme} lang={locale}>{children}<div className="fv-portal" ref={setPortal} /></div></RootContext>`。React 19 可以直接把 context 當 provider 用。
     - 不用 `useEffect`：portal 的元素由 ref callback（`setPortal`）拿到。
   - 新增 `src/i18n/use-t.ts`：`export function useT<K extends string>(table: MessageTable<K>)`。
     - 回傳 `useCallback((key, vars) => translate(table, root.locale, root.overrides, key, vars), [table, root.locale, root.overrides])`；
     - `root = useRoot()`，從 `src/primitives/root-context.ts` 引入；`translate` 從 `src/i18n/messages.ts` 引入。
   - `src/styles.css`：
     - 整個檔換成以下內容；第一行註解改成 `/* fv-* classes. Each plan appends its own section at the end (02-contract). */`。
     - 段落 `/* == root (02) == */`：
       - `.fv-root`：`position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; overflow: hidden; color: var(--ak-text); background: var(--ak-bg); font-family: var(--ak-font-body); font-size: var(--ak-type-t3); line-height: var(--ak-type-body);`
       - `.fv-root[data-theme="light"] { color-scheme: light; }`、`.fv-root[data-theme="dark"] { color-scheme: dark; }`
       - `.fv-root *, .fv-root *::before, .fv-root *::after { box-sizing: border-box; }`
       - `.fv-root :focus-visible { outline: var(--ak-focus-ring-width) solid var(--ak-focus-ring); outline-offset: 2px; }`
       - `.fv-portal { display: contents; }`
       - 不准出現 `transform`、`filter`、`contain`（理由見判斷）。
   - 測試，新增 `src/primitives/root.test.tsx`。檔頭 `afterEach(cleanup)`：01 的 vitest 沒開 globals，Testing Library 不會自動清畫面。案例：
     - `theme="dark"`：有一個 `.fv-root`，`data-theme="dark"`；
     - 不給 theme：`.fv-root` 沒有 `data-theme` 屬性；
     - `locale="zh-TW"`：`lang="zh-TW"`；
     - 在 root 裡用一個測試元件呼叫 `useT(commonMessages)("common.save")`：locale 是 zh-TW 時顯示「儲存」；`messages={{ "common.save": "Store" }}` 時顯示 `Store`；
     - 測試元件呼叫 `useRoot().report(new ViewerError("read_failed"))`：`onError` 收到那個錯誤；
     - 兩層巢狀的 `ViewerRoot`：DOM 裡只有一個 `.fv-root`；
     - 測試元件讀 `useRoot().portal`：重新渲染後，它等於 `.fv-root > .fv-portal` 那個元素；
     - 在 root 外呼叫 `useRoot()`：丟出的錯誤訊息包含 `rendered outside ViewerRoot`；
     - `useRoot().limits.textBytes`：給 `limits={{ textBytes: 5 }}` 時是 5，其他欄位是預設值。
   - verify：`pnpm test src/primitives/root.test.tsx && pnpm check`
   - commit：`feat(contract): add the themed root with portal and messages`
4. 入口匯出。
   - `src/index.ts` 整個換掉。保留一行註解 `// "." entry. Filled by 02 contract and 03 viewer-core.`，內容如下：
     - 值：`blobSource`、`bytesSource`（從 `./contract/byte-source`）；`kindOf`、`mimeOf`（從 `./contract/kinds`）；`DEFAULT_LIMITS`（從 `./contract/limits`）；`ViewerError`（從 `./contract/errors`）。
     - 型別（`export type`）：
       - `ByteSource`、`FileRef`；
       - `ViewKind`、`EditKind`、`KindResult`；
       - `Limits`；
       - `SaveMode`、`SaveRequest`、`SaveHandler`；
       - `ViewerErrorCode`；
       - `Locale`、`Messages`；
       - `Theme`、`CommonProps`、`FileViewerProps`、`AssetInfo`、`AssetProvider`（`EditorProps` 由 03 第 8 步加）。
     - 不匯出：`readBlob`、`formatOf`、`editKindOf`、`extOf`、`splitName`、`suggestedName`、`ViewerRoot`、`useT`、`useRoot`、primitives。它們是內部共用的，其他 plan 用相對路徑 import。
   - 測試，新增 `src/index.test.ts`：
     - `import * as api from "./index"`；
     - 對 `blobSource`、`bytesSource`、`kindOf`、`mimeOf`、`DEFAULT_LIMITS`、`ViewerError` 逐一 `expect(api).toHaveProperty(name)`；
     - `expect(api).not.toHaveProperty("readBlob")`。
     - 用 `toHaveProperty` 而不是比對整份清單，這樣 03 加 `FileViewer` 時這個測試不用改。
   - verify：`pnpm test src/index.test.ts && pnpm build && pnpm check`
   - commit：`feat(contract): export the contract from the package entry`

phase 結尾的 verify：`pnpm test && pnpm test:browser && pnpm build && pnpm check`

## Phase 04 — Base UI 基本元件、主題實測

blocker：Phase 03；第 6 步另外要等 Phase 01 第 2 步（npm 上已經有 `@anyknown/ui@0.11.0`）；model：sonnet。

這個 phase 的每個元件測試檔，開頭都要：

- `afterEach(cleanup)`；
- 用 `<ViewerRoot>`（`src/primitives/root.tsx`）把受測元件包起來，因為 popup 要靠它的 portal。

1. `Icon`、圖示、`Button`、`Spinner`。
   - 執行 `pnpm add @base-ui/react@^1.8.0`。
   - `THIRD_PARTY_NOTICES.md` 的 `## Runtime dependencies` 段：把 `None yet.` 換成一行 `- \`@base-ui/react\` — MIT — https://github.com/mui/base-ui`。01 的授權檢查要求每個 dependency 都出現在這個檔。
   - 新增 `src/primitives/icon.tsx`，`Icon` 的簽名照契約。渲染：
     - `<svg className={cx("fv-icon", \`fv-icon-${size}\`)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">`；
     - 有 `label` 時加 `role="img"` 與 `aria-label`；沒有時加 `aria-hidden`；
     - `size` 預設 `"md"`。
   - 新增 `src/primitives/glyphs.tsx`，四個元件，props 是 `{ size?: IconSize; label?: string }`，各自把下面的 path 包在 `Icon` 裡：
     - `CloseIcon`：`M6 6l12 12M18 6L6 18`；
     - `EditIcon`：`M4 20h4L19 9l-4-4L4 16v4z`；
     - `AlertIcon`：`<circle cx="12" cy="12" r="9"/>` 加上 `M12 8v5M12 16h.01`；
     - `FileIcon`：`M6 3h8l4 4v14H6z` 加上 `M14 3v4h4`。
   - 新增 `src/primitives/button.tsx`，`Button` 與 `ButtonProps` 照契約：
     - 渲染 `@base-ui/react/button` 的 `Button`；
     - `className = cx("fv-button", \`fv-button-${variant}\`, children === undefined && "fv-button-icon", props.className)`；
     - `variant` 預設 `"secondary"`；
     - `icon` 放在 children 前面；
     - 其餘 props 原樣傳下去，包括 `ref`（React 19 的 ref 就是一般的 prop）。
   - 新增 `src/primitives/spinner.tsx`：`<span className="fv-spinner" role="status" aria-label={label} />`。
   - `src/styles.css` 在檔尾加段落 `/* == primitives (02) == */`：
     - `.fv-icon`：`flex-shrink: 0; pointer-events: none`；`.fv-icon-sm`、`-md`、`-lg` 的 width 與 height 分別用 `var(--ak-icon-size-sm)`、`var(--ak-icon-size-md)`、`var(--ak-icon-size-lg)`。
     - `.fv-button`：`display: inline-flex; align-items: center; justify-content: center; gap: var(--ak-space-xs); height: 32px; padding: 0 var(--ak-space-md); border: 1px solid var(--ak-border-control); border-radius: var(--ak-corner-control); background: var(--ak-surface); color: var(--ak-text); font: inherit; font-size: var(--ak-type-t2); cursor: pointer; transition: background-color var(--ak-motion-quick) var(--ak-motion-ease-out);`；hover 時 `background: var(--ak-surface-raised)`。
     - `.fv-button-primary`：`background: var(--ak-accent); color: var(--ak-accent-text); border-color: transparent`。
     - `.fv-button-ghost`：`background: transparent; border-color: transparent`；hover 時 `background: var(--ak-ink-n8)`。
     - `.fv-button-danger`：`background: var(--ak-danger-solid); color: var(--ak-on-danger-solid); border-color: transparent`。
     - `.fv-button-icon`：`width: 32px; padding: 0`。
     - `.fv-button[data-disabled]`：`opacity: 0.5; cursor: not-allowed`。
     - `.fv-spinner`：`display: inline-block; width: 16px; height: 16px; border: 2px solid var(--ak-ink-n18); border-top-color: var(--ak-text); border-radius: var(--ak-radius-full); animation: fv-spin var(--ak-motion-loop) linear infinite`；另外定義 `@keyframes fv-spin { to { rotate: 360deg; } }`。這裡用 `rotate` 屬性，不用 `transform`。
   - 測試，新增 `src/primitives/button.test.tsx`，案例：
     - 預設：一個 `button`，class 有 `fv-button` 與 `fv-button-secondary`；
     - `variant="primary"`：class 有 `fv-button-primary`；
     - 只給 `icon` 和 `aria-label="Close"`：`getByRole("button", { name: "Close" })` 找得到，class 有 `fv-button-icon`；
     - 點一下會呼叫 `onClick`；`disabled` 時點了不會呼叫；
     - `Spinner label="Loading"`：`getByRole("status", { name: "Loading" })` 找得到；
     - `CloseIcon label="Close"`：`getByRole("img", { name: "Close" })` 找得到；沒有 label 時 svg 有 `aria-hidden`。
   - verify：`pnpm test src/primitives/button.test.tsx && pnpm check && pnpm check:licenses`
   - commit：`feat(contract): add button, icon and spinner primitives`
2. `Tooltip`、`Menu`、`Slider`。
   - 新增 `src/primitives/tooltip.tsx`，`Tooltip` 的簽名照契約。結構是 `@base-ui/react/tooltip` 的：
     - `Tooltip.Root`
     - └ `Tooltip.Trigger`，`render={children}`、`delay={delay ?? 400}`
     - └ `Tooltip.Portal`，`container={useRoot().portal}`
     -   └ `Tooltip.Positioner`，`positionMethod="fixed"`、`sideOffset={6}`、`className="fv-tooltip-positioner"`
     -     └ `Tooltip.Popup`，`className="fv-tooltip"`，內容是 `{content}`
   - 新增 `src/primitives/menu.tsx`，`Menu` 與 `MenuItem` 照契約。結構是 `@base-ui/react/menu` 的：
     - `Menu.Root`
     - └ `Menu.Trigger`，`render={trigger}`
     - └ `Menu.Portal`，`container={useRoot().portal}`
     -   └ `Menu.Positioner`，`positionMethod="fixed"`、`sideOffset={4}`、`align="start"`、`className="fv-menu-positioner"`
     -     └ `Menu.Popup`，`className="fv-menu"`
     -       └ 每個 item 一個 `Menu.Item`，`key={id}`、`disabled`、`onClick={onSelect}`、`className={cx("fv-menu-item", danger && "fv-menu-item-danger")}`
   - 新增 `src/primitives/slider.tsx`，`Slider` 的簽名照契約。結構是 `@base-ui/react/slider` 的：
     - `Slider.Root`，`value`、`min`、`max`、`step={step ?? 1}`、`disabled`、`onValueChange={(v) => onValueChange(v)}`、`onValueCommitted`、`className="fv-slider"`
     - └ `Slider.Control`，`className="fv-slider-control"`
     -   └ `Slider.Track`，`className="fv-slider-track"`
     -     ├ `Slider.Indicator`，`className="fv-slider-indicator"`
     -     └ `Slider.Thumb`，`aria-label={label}`、`className="fv-slider-thumb"`
   - `src/styles.css` 在 primitives 段的最後加：
     - `.fv-tooltip-positioner`：`z-index: var(--ak-z-index-tooltip)`。
     - `.fv-tooltip`：`padding: 4px 8px; border: 1px solid var(--ak-border); border-radius: var(--ak-corner-small); background: var(--ak-surface-raised); color: var(--ak-text); box-shadow: var(--ak-shadow-float); font-size: var(--ak-type-t1); transition: opacity var(--ak-motion-quick) var(--ak-motion-ease-out)`。
     - `.fv-tooltip[data-starting-style]` 與 `.fv-tooltip[data-ending-style]`：`opacity: 0`。
     - `.fv-menu-positioner`：`z-index: var(--ak-z-index-popup)`。
     - `.fv-menu`：`min-width: 160px; padding: var(--ak-space-xs); border: 1px solid var(--ak-border); border-radius: var(--ak-corner-float); background: var(--ak-surface-raised); box-shadow: var(--ak-shadow-float); transition: opacity var(--ak-motion-quick) var(--ak-motion-ease-out)`；`.fv-menu[data-starting-style]` 與 `.fv-menu[data-ending-style]`：`opacity: 0`。
     - `.fv-menu-item`：`display: flex; align-items: center; padding: var(--ak-space-xs) var(--ak-space-sm); border-radius: var(--ak-corner-small); font-size: var(--ak-type-t2); cursor: default; outline: none`。
     - `.fv-menu-item[data-highlighted]`：`background: var(--ak-ink-n8)`。
     - `.fv-menu-item[data-disabled]`：`color: var(--ak-text-faint)`。
     - `.fv-menu-item-danger`：`color: var(--ak-danger)`。
     - `.fv-slider-control`：`display: flex; align-items: center; height: 20px; width: 100%; touch-action: none`。
     - `.fv-slider-track`：`position: relative; flex: 1; height: 4px; border-radius: var(--ak-radius-full); background: var(--ak-ink-n14)`。
     - `.fv-slider-indicator`：`border-radius: inherit; background: var(--ak-accent)`。
     - `.fv-slider-thumb`：`width: 14px; height: 14px; border: 2px solid var(--ak-accent); border-radius: var(--ak-radius-full); background: var(--ak-surface)`。
     - `.fv-slider-thumb:has(:focus-visible)`：`outline: var(--ak-focus-ring-width) solid var(--ak-focus-ring); outline-offset: 2px`。
   - 測試，新增 `src/primitives/tooltip.test.tsx`。案例：`<Tooltip content="Edit" delay={0}><Button aria-label="e" icon={…} /></Tooltip>`，`user.hover` 這顆按鈕之後，`await screen.findByText("Edit")` 找得到，而且找到的元素在 `.fv-portal` 裡面（`closest(".fv-portal")` 不是 null）。
   - 測試，新增 `src/primitives/menu.test.tsx`，案例：
     - 點 trigger 之後，看得到兩個 `menuitem`，而且都在 `.fv-portal` 裡；
     - 點第一個 item，它的 `onSelect` 被呼叫一次，選單關掉（`queryByRole("menu")` 最後是 null，用 `waitFor` 等）；
     - `disabled` 的 item 點了不會呼叫 `onSelect`。
   - 測試，新增 `src/primitives/slider.test.tsx`，案例：
     - 用 `getByRole("slider", { name: "Volume" })` 找得到，`aria-valuenow` 等於 `value`；
     - focus 之後按 `{ArrowRight}`，`onValueChange` 收到 `value + step`；
     - `disabled` 時按鍵不會呼叫 `onValueChange`。
   - verify：`pnpm test src/primitives && pnpm check`
   - commit：`feat(contract): add tooltip, menu and slider primitives`
3. `Dialog`、`ConfirmDialog`、`DiscardDialog`。
   - 新增 `src/primitives/dialog.tsx`，三個元件的簽名照契約。
     - `Dialog` 的結構是 `@base-ui/react/dialog` 的：
       - `Dialog.Root`，`open`、`onOpenChange={(o) => onOpenChange(o)}`
       - └ `Dialog.Portal`，`container={useRoot().portal}`
       -   ├ `Dialog.Backdrop`，`className="fv-dialog-backdrop"`
       -   └ `Dialog.Popup`，`className="fv-dialog"`
       -     ├ `Dialog.Title`，`className="fv-dialog-title"`
       -     ├ `description` 有值時：`Dialog.Description`，`className="fv-dialog-description"`
       -     ├ `children`
       -     └ `footer` 有值時：`<div className="fv-dialog-footer">`
     - `ConfirmDialog` 的結構相同，但改用 `@base-ui/react/alert-dialog` 的同名部件。footer 固定兩顆 `Button`（`src/primitives/button.tsx`）：
       - 取消：`variant="secondary"`，按下去呼叫 `onOpenChange(false)`；
       - 確認：`danger` 時用 `variant="danger"`，否則用 `"primary"`；按下去先呼叫 `onConfirm()`，再呼叫 `onOpenChange(false)`。
     - `DiscardDialog`：
       - `const t = useT(commonMessages)`（`src/i18n/use-t.ts`、`src/i18n/messages.ts`）；
       - 渲染 `ConfirmDialog`，`title={t("discard.title")}`、`description={t("discard.body")}`、`confirmLabel={t("discard.confirm")}`、`cancelLabel={t("discard.keep")}`、`danger`、`onConfirm={onDiscard}`。
   - `src/styles.css` 在 primitives 段的最後加：
     - `.fv-dialog-backdrop`：`position: fixed; inset: 0; background: var(--ak-scrim); z-index: var(--ak-z-index-dialog-backdrop); transition: opacity var(--ak-motion-quick) var(--ak-motion-ease-out)`。
     - `.fv-dialog`：`position: fixed; inset: 0; margin: auto; width: min(420px, calc(100vw - 32px)); height: fit-content; max-height: calc(100dvh - 32px); overflow: auto; padding: var(--ak-space-lg); border-radius: var(--ak-corner-modal); background: var(--ak-surface); color: var(--ak-text); box-shadow: var(--ak-shadow-modal); z-index: var(--ak-z-index-dialog); transition: opacity var(--ak-motion-quick) var(--ak-motion-ease-out)`。置中用 inset 加 margin，不用 transform。
     - `.fv-dialog-backdrop`、`.fv-dialog` 的 `[data-starting-style]` 與 `[data-ending-style]`：`opacity: 0`。
     - `.fv-dialog-title`：`margin: 0; font-size: var(--ak-type-t4); font-weight: 600`。
     - `.fv-dialog-description`：`margin: var(--ak-space-xs) 0 0; color: var(--ak-text-muted); font-size: var(--ak-type-t2)`。
     - `.fv-dialog-footer`：`display: flex; justify-content: flex-end; gap: var(--ak-space-sm); margin-top: var(--ak-space-lg)`。
   - 測試，新增 `src/primitives/dialog.test.tsx`，案例：
     - `Dialog open`：`getByRole("dialog", { name: title })` 找得到，而且在 `.fv-portal` 裡；按 `{Escape}`，`onOpenChange` 收到 `false`；
     - `ConfirmDialog open`：`getByRole("alertdialog")` 找得到；點確認鍵依序呼叫 `onConfirm` 與 `onOpenChange(false)`；點取消鍵只呼叫 `onOpenChange(false)`；
     - `DiscardDialog` 放在 `ViewerRoot locale="zh-TW"` 裡：看得到「要放棄修改嗎？」，以及「放棄修改」「繼續編輯」兩顆按鈕；點「放棄修改」會呼叫 `onDiscard`。
   - verify：`pnpm test src/primitives && pnpm check`
   - commit：`feat(contract): add dialog, confirm dialog and discard dialog`
4. `Popover`、`ToggleGroup`、`RadioGroup`、`Switch`、`Progress`。
   - 新增 `src/primitives/popover.tsx`，`Popover` 簽名見契約的「基本元件」。結構是 `@base-ui/react/popover` 的：
     - `Popover.Root`
     - └ `Popover.Trigger`，`render={trigger}`、`aria-label={label}`
     - └ `Popover.Portal`，`container={useRoot().portal}`（`useRoot` 從 `src/primitives/root-context.ts` import）
     -   └ `Popover.Positioner`，`positionMethod="fixed"`、`sideOffset={6}`、`className="fv-popover-positioner"`
     -     └ `Popover.Popup`，`aria-label={label}`、`className="fv-popover"`，內容是 `{children}`
   - 新增 `src/primitives/toggle-group.tsx`，`ToggleGroup<T extends string>`：
     - `@base-ui/react/toggle-group` 的 `ToggleGroup`，`value={[value]}`、`multiple={false}`、`aria-label={label}`、`className="fv-toggle-group"`、`onValueChange={(next) => { const v = next[0]; if (v !== undefined) onChange(v as T); }}`。再按一次已選中的項目時 `next` 是空陣列，什麼都不做（維持選中）。
     - 每個 option 一個 `@base-ui/react/toggle` 的 `Toggle`，`key={o.value}`、`value={o.value}`、`className="fv-toggle-group-item"`，children 是 `{o.icon}{o.label}`。
   - 新增 `src/primitives/radio-group.tsx`，`RadioGroup<T extends string>`：
     - `@base-ui/react/radio-group` 的 `RadioGroup`，`value`、`aria-label={label}`、`className="fv-radio-group"`、`onValueChange={(v) => onChange(v as T)}`。
     - 同檔內部元件 `RadioItem`（不匯出），用 `useId()` 產生 `labelId`、`descId`，渲染 `<div className="fv-radio-item">`：`@base-ui/react/radio` 的 `Radio.Root`（`value`、`disabled`、`aria-labelledby={labelId}`、`aria-describedby={description ? descId : undefined}`、`className="fv-radio"`）裡放 `Radio.Indicator`（`className="fv-radio-indicator"`）；旁邊 `<span id={labelId} className="fv-radio-label">`，有 `description` 時再一個 `<span id={descId} className="fv-radio-description">`。
   - 新增 `src/primitives/switch.tsx`，`Switch`：`<label className="fv-switch-row">` 裡放 `@base-ui/react/switch` 的 `Switch.Root`（`checked`、`onCheckedChange={(c) => onCheckedChange(c)}`、`disabled`、`aria-label={label}`、`className="fv-switch"`，內含 `Switch.Thumb className="fv-switch-thumb"`）加 `<span className="fv-switch-label">{label}</span>`。
   - 新增 `src/primitives/progress.tsx`，`Progress`：`@base-ui/react/progress` 的 `Progress.Root`，`value={value}`、`min={0}`、`max={1}`、`aria-label={label}`、`className="fv-progress"`；裡面 `Progress.Track className="fv-progress-track"` > `Progress.Indicator className="fv-progress-indicator"`。
   - `src/styles.css` 在 primitives 段的最後加：
     - `.fv-popover-positioner`：`z-index: var(--ak-z-index-popup)`。
     - `.fv-popover`：`padding: var(--ak-space-md); border: 1px solid var(--ak-border); border-radius: var(--ak-corner-float); background: var(--ak-surface-raised); color: var(--ak-text); box-shadow: var(--ak-shadow-float); transition: opacity var(--ak-motion-quick) var(--ak-motion-ease-out)`；`.fv-popover[data-starting-style]`、`.fv-popover[data-ending-style]`：`opacity: 0`。
     - `.fv-toggle-group`：`display: inline-flex; border: 1px solid var(--ak-border-control); border-radius: var(--ak-corner-control); overflow: hidden`。
     - `.fv-toggle-group-item`：`display: inline-flex; align-items: center; gap: var(--ak-space-xs); height: 30px; padding: 0 var(--ak-space-md); border: 0; background: var(--ak-surface); color: var(--ak-text); font: inherit; font-size: var(--ak-type-t2); cursor: pointer`；`.fv-toggle-group-item + .fv-toggle-group-item`：`border-left: 1px solid var(--ak-border-control)`；`.fv-toggle-group-item[data-pressed]`：`background: var(--ak-ink-n8)`。
     - `.fv-radio-group`：`display: flex; flex-direction: column; gap: var(--ak-space-sm)`。
     - `.fv-radio-item`：`display: grid; grid-template-columns: auto 1fr; column-gap: var(--ak-space-sm); align-items: center`。
     - `.fv-radio`：`width: 16px; height: 16px; padding: 0; border: 1px solid var(--ak-border-control); border-radius: var(--ak-radius-full); background: var(--ak-surface)`；`.fv-radio[data-checked]`：`border-color: var(--ak-accent)`；`.fv-radio[data-disabled]`：`opacity: 0.5`。
     - `.fv-radio-indicator`：`display: block; width: 8px; height: 8px; margin: auto; border-radius: var(--ak-radius-full); background: var(--ak-accent)`。
     - `.fv-radio-label`：`font-size: var(--ak-type-t2)`；`.fv-radio-description`：`grid-column: 2; color: var(--ak-text-muted); font-size: var(--ak-type-t1)`。
     - `.fv-switch-row`：`display: inline-flex; align-items: center; gap: var(--ak-space-sm); font-size: var(--ak-type-t2)`。
     - `.fv-switch`：`position: relative; width: 36px; height: 20px; padding: 0; border: 0; border-radius: var(--ak-radius-full); background: var(--ak-ink-n18); cursor: pointer; transition: background-color var(--ak-motion-quick) var(--ak-motion-ease-out)`；`.fv-switch[data-checked]`：`background: var(--ak-accent)`；`.fv-switch[data-disabled]`：`opacity: 0.5; cursor: not-allowed`。
     - `.fv-switch-thumb`：`position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: var(--ak-radius-full); background: var(--ak-surface); transition: left var(--ak-motion-quick) var(--ak-motion-ease-out)`；`.fv-switch-thumb[data-checked]`：`left: 18px`。
     - `.fv-progress`：`width: 100%`；`.fv-progress-track`：`position: relative; height: 4px; overflow: hidden; border-radius: var(--ak-radius-full); background: var(--ak-ink-n14)`；`.fv-progress-indicator`：`height: 100%; border-radius: inherit; background: var(--ak-accent)`。
     - `.fv-progress-indicator[data-indeterminate]`：`position: relative; width: 40%; animation: fv-progress-slide var(--ak-motion-loop) linear infinite`；`@keyframes fv-progress-slide { from { left: -40%; } to { left: 100%; } }`。
   - 測試，新增 `src/primitives/popover.test.tsx`、`toggle-group.test.tsx`、`radio-group.test.tsx`、`switch.test.tsx`、`progress.test.tsx`，案例：
     - Popover：`<Popover label="Volume" trigger={<Button>Open</Button>}>content</Popover>`，點 `getByRole("button", { name: "Volume" })` 之後 `await screen.findByText("content")` 找得到，而且 `closest(".fv-portal")` 不是 null；按 `{Escape}` 之後 `content` 消失（`waitFor`）。
     - ToggleGroup：三個 option `a`、`b`、`c`，`value="a"`：`getByRole("group", { name: "Mode" })` 找得到，`a` 的 `aria-pressed` 是 `"true"`；點 `b` 呼叫 `onChange("b")`；再點已選中的 `a` 不呼叫 `onChange`。
     - RadioGroup：`getByRole("radiogroup", { name: "Format" })` 找得到；`value` 對應的 radio `aria-checked` 是 `"true"`；點另一個 radio 呼叫 `onChange` 帶那個值；`disabled` 的 option 點了不呼叫；有 `description` 的 radio，`toHaveAccessibleDescription` 等於該文字。
     - Switch：`getByRole("switch", { name: "Fast" })` 的 `aria-checked` 等於 `checked`；點一下呼叫 `onCheckedChange(!checked)`；`disabled` 時點了不呼叫。
     - Progress：`value={0.5}` 時 `getByRole("progressbar", { name: "Export" })` 的 `aria-valuenow` 是 `"0.5"`；`value={null}` 時沒有 `aria-valuenow` 屬性，而且 `.fv-progress-indicator` 有 `data-indeterminate` 屬性。
   - verify：`pnpm test src/primitives && pnpm check`
   - commit：`feat(contract): add popover, toggle group, radio group, switch and progress primitives`
5. `Select`、`NumberField`、`ContextMenu`、`Menubar`。
   - 新增 `src/primitives/select.tsx`，`Select<T extends string>`。結構是 `@base-ui/react/select` 的：
     - `Select.Root`，`value`、`items={groups.flat()}`（讓 `Select.Value` 顯示 label）、`onValueChange={(v) => { if (v !== null) onChange(v as T); }}`
     - ├ `Select.Trigger`，`aria-label={label}`、`className="fv-select"`，裡面 `<Select.Value />` 加 `<Select.Icon className="fv-select-icon">`（`Icon` 的 `size="sm"`，path `M6 9l6 6 6-6`）
     - └ `Select.Portal`，`container={useRoot().portal}`
     -   └ `Select.Positioner`，`positionMethod="fixed"`、`alignItemWithTrigger={false}`、`sideOffset={4}`、`className="fv-select-positioner"`
     -     └ `Select.Popup`，`className="fv-select-popup"` > `Select.List`
     -       └ 每一組：`Select.Group`（第 2 組起，前面先放一個 `Select.Separator className="fv-select-separator"`）> 每個選項一個 `Select.Item`（`key={o.value}`、`value={o.value}`、`className="fv-select-item"`）> `Select.ItemText`（內容 `{o.label}`）
   - 新增 `src/primitives/number-field.tsx`，`NumberField`。結構是 `@base-ui/react/number-field` 的：
     - `NumberField.Root`，`value`、`min`、`max`、`step`、`className="fv-number-field"`、`onValueChange={(v) => { if (v !== null) onChange(v); }}`、`onValueCommitted={(v) => { if (v !== null) onCommit?.(v); }}`
     - ├ `NumberField.ScrubArea`，`className="fv-number-field-scrub"`，裡面 `<span>{label}</span>` 加 `NumberField.ScrubAreaCursor`（內容 `↔`）
     - └ `NumberField.Group` > `NumberField.Input`，`aria-label={label}`、`className="fv-number-field-input"`
   - 新增 `src/primitives/context-menu.tsx`，`ContextMenu`（`MenuItem` 從 `src/primitives/menu.tsx` import）。結構是 `@base-ui/react/context-menu` 的：
     - `ContextMenu.Root`
     - ├ `ContextMenu.Trigger`，`render={children}`
     - └ `ContextMenu.Portal`，`container={useRoot().portal}`
     -   └ `ContextMenu.Positioner`，`positionMethod="fixed"`、`className="fv-menu-positioner"`
     -     └ `ContextMenu.Popup`，`className="fv-menu"` > 每個 item 一個 `ContextMenu.Item`，屬性與 `src/primitives/menu.tsx` 的 `Menu.Item` 相同（`key={id}`、`disabled`、`onClick={onSelect}`、`className={cx("fv-menu-item", danger && "fv-menu-item-danger")}`）
   - 新增 `src/primitives/menubar.tsx`，`Menubar`（`MenuItem` 從 `src/primitives/menu.tsx` import）：
     - `@base-ui/react/menubar` 的 `Menubar`，`className="fv-menubar"`；每個 menu 一個 `@base-ui/react/menu` 的 `Menu.Root`，`key={id}`。
     - `Menu.Trigger`，`className="fv-menubar-trigger"`，內容 `{label}`；`Menu.Portal`，`container={useRoot().portal}` > `Menu.Positioner`（`positionMethod="fixed"`、`sideOffset={4}`、`align="start"`、`className="fv-menu-positioner"`）> `Menu.Popup`（`className="fv-menu"`）。
     - 每個 item 一個 `Menu.Item`，屬性同 `Menu`；有 `shortcut` 時，label 後面放 `<span className="fv-menubar-shortcut">{shortcut}</span>`（`.fv-menu-item` 是 flex，shortcut 用 `margin-left: auto`）。
   - `src/styles.css` 在 primitives 段的最後加：
     - `.fv-select`：同 `.fv-button` 的外觀再加 `justify-content: space-between; min-width: 120px`（直接在選擇器清單加 `.fv-select`，不重複宣告）。
     - `.fv-select-positioner`：`z-index: var(--ak-z-index-popup)`。
     - `.fv-select-popup`：`min-width: var(--anchor-width); padding: var(--ak-space-xs); border: 1px solid var(--ak-border); border-radius: var(--ak-corner-float); background: var(--ak-surface-raised); box-shadow: var(--ak-shadow-float); transition: opacity var(--ak-motion-quick) var(--ak-motion-ease-out)`；`[data-starting-style]`、`[data-ending-style]`：`opacity: 0`。
     - `.fv-select-item`：同 `.fv-menu-item` 的外觀（加進該選擇器清單）；`.fv-select-item[data-highlighted]` 加進 `.fv-menu-item[data-highlighted]` 的選擇器清單。
     - `.fv-select-separator`：`height: 1px; margin: var(--ak-space-xs) 0; background: var(--ak-border)`。
     - `.fv-number-field`：`display: inline-flex; align-items: center; gap: var(--ak-space-sm); height: 32px`。
     - `.fv-number-field-scrub`：`cursor: ew-resize; color: var(--ak-text-muted); font-size: var(--ak-type-t2); user-select: none`。
     - `.fv-number-field-input`：`width: 72px; height: 32px; padding: 0 var(--ak-space-sm); border: 1px solid var(--ak-border-control); border-radius: var(--ak-corner-control); background: var(--ak-surface); color: var(--ak-text); font: inherit; font-size: var(--ak-type-t2)`。
     - `.fv-menubar`：`display: flex; align-items: center; gap: var(--ak-space-xs); height: 36px; padding: 0 var(--ak-space-xs); border-bottom: 1px solid var(--ak-border)`。
     - `.fv-menubar-trigger`：`height: 28px; padding: 0 var(--ak-space-sm); border: 0; border-radius: var(--ak-corner-small); background: transparent; color: var(--ak-text); font: inherit; font-size: var(--ak-type-t2); cursor: default`；`[data-popup-open]` 與 `:hover`：`background: var(--ak-ink-n8)`。
     - `.fv-menubar-shortcut`：`margin-left: auto; padding-left: var(--ak-space-lg); color: var(--ak-text-faint); font-size: var(--ak-type-t1)`。
   - 測試，新增 `src/primitives/select.test.tsx`、`number-field.test.tsx`、`context-menu.test.tsx`、`menubar.test.tsx`，案例：
     - Select：`groups={[[a, b], [c]]}`，`value="a"`：`getByRole("combobox", { name: "Mode" })` 的文字含 `a` 的 label；點開之後 `getAllByRole("option")` 長度 3，而且在 `.fv-portal` 裡；`getAllByRole("separator")` 長度 1；點 `c` 呼叫 `onChange("c")`。
     - NumberField：`getByRole("textbox", { name: "Opacity" })`（Base UI 的輸入框 role 為 `textbox`）的值是 `value` 的字串；輸入 `42` 再 `{Enter}` 後，`onChange` 收到 `42`、`onCommit` 收到 `42`；輸入超過 `max` 的值再 blur，`onCommit` 收到 `max`；`getByText("Opacity")` 所在元素有 class `fv-number-field-scrub`。
     - ContextMenu：用 `fireEvent.contextMenu` 在 children 上觸發，兩個 `menuitem` 出現在 `.fv-portal` 裡；點第一個呼叫 `onSelect` 一次；`disabled` 的 item 點了不呼叫。
     - Menubar：兩個 menu `File`、`Edit`；`getByRole("menubar")` 找得到；點 `File` 之後看到它的 `menuitem`，其中有 `shortcut` 的那個，文字含該快捷鍵；點 item 呼叫 `onSelect`；`Edit` 的 item 在 `File` 打開前不在 DOM。
   - verify：`pnpm test src/primitives && pnpm check`
   - commit：`feat(contract): add select, number field, context menu and menubar primitives`
6. 主題在真的瀏覽器裡鎖得住（要等 npm 上有 `@anyknown/ui@0.11.0`）。
   - 執行 `pnpm add -D @anyknown/ui@0.11.0`。
   - `package.json` 的 `peerDependencies` 手動加 `"@anyknown/ui": ">=0.11.0"`。
   - 新增 `src/primitives/theme.browser.test.tsx`：
     - 第一行：`// oxlint-disable-next-line no-restricted-imports -- test only: hosts import tokens.css before styles.css`
     - 第二行：`import "@anyknown/ui/tokens.css";`
     - 接著 `import "../styles.css";`。
     - 每個案例結束都要 `cleanup()`，並移除 `document.documentElement` 的 `data-theme`。
     - 讀值的寫法：`getComputedStyle(el).getPropertyValue("--ak-bg").trim()`。
     - 案例：
       - `<html data-theme="dark">` 裡放 `ViewerRoot theme="light"`：`.fv-root` 的 `--ak-bg` 是 `#ffffff`，`color-scheme` 是 `light`；
       - `<html data-theme="light">` 裡放 `ViewerRoot theme="dark"`：`--ak-bg` 是 `#121212`；
       - `<html data-theme="dark">` 裡放沒有 theme 的 `ViewerRoot`：`--ak-bg` 是 `#121212`（跟著宿主頁面）；
       - `<html data-theme="dark">` 裡放 `ViewerRoot theme="light"`，開一個 `Dialog`（`src/primitives/dialog.tsx`）：`.fv-dialog` 的 `--ak-bg` 也是 `#ffffff`。這證明 portal 在 root 裡面。
     - 用 `<html data-theme="dark">` 代替 OS 深色：兩種情況都是在 root 上放深色值，再由子樹繼承。Phase 01 加的 `[data-theme="light"]` 段處理的就是這種情況。
   - verify：`pnpm test:browser src/primitives/theme.browser.test.tsx && pnpm check`
   - commit：`test(contract): lock light and dark themes on the viewer subtree`
phase 結尾的 verify：`pnpm test && pnpm test:browser && pnpm build && pnpm check && pnpm check:licenses`

## 之後再做

- `urlSource`（HTTP Range 讀取）：等有宿主要從 URL 開檔再做（00-overview §5）。
- 字串的複數變化與 RTL：等加第三種語言時再做。
- en、zh-TW 以外的內建語言：宿主可以用 `messages` 給整份字串。
- icon 套件：圖示一律自己畫 inline SVG。
- `CSPProvider` 的 nonce 與 `disableStyleElements`：等有宿主的 CSP 不允許 inline style 時再做。
- 編輯器的 import 邊界改用 lint 擋：等 01 開放改設定檔，或出現第一次越界時再做。
