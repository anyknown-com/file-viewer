# 09 comp-format — `.comp.zip` 讀寫、PNG 編解碼、Compositor v11 manifest 與圖層樹摘要，Node 與瀏覽器都能跑

狀態：planned（2026-10-08；格式由 CTO 在 storage 17 定，2026-10-05，本份照搬）；blocker：01 scaffold 完成（repo、`pnpm test` / `pnpm check` / `pnpm build` 可用）；model：Phase 01、02、04 sonnet，Phase 03 opus；push：整份做完一次。
來源：storage `docs/plans/17-image-project-format.md`（下稱 storage 17）。宿主相關的段落（storage 的 4 MiB chunk、GCM、`files.reader`）歸 H1，不在本份。
下游：10 image-editor（讀寫專案、預覽、匯出 PNG）、12 / 13（manifest 型別）、H2 product（`ai-readable-docs` 的影像專案條目直接 import `@anyknown/file-viewer/comp`）。

用到其他 plan 的東西（符號名、路徑以 `00-overview.md` §9 為準；本份是這些東西的使用方，不是擁有者）：

| 東西 | 出處 | 本份怎麼用 |
| --- | --- | --- |
| `tsconfig.comp.json`（repo 根；`extends ./tsconfig.json`、`lib: ["ES2022"]`、`include: ["src/comp"]`） | 01 P01-2，§9.8；`pnpm typecheck` 已含 `tsc --noEmit -p tsconfig.comp.json` | Phase 01 第 1 步只在它的 `compilerOptions` 加 `"types": ["node"]`；不建 `src/comp/tsconfig.json`、不改 `scripts` |
| `package.json` 的 `exports` 形狀 `{ "types", "default" }`、`tsdown.config.ts` 的 `entry` 寫法 | 01 P01-1，§4 | Phase 01 第 1 步加 `./comp` 與 `"comp/index"`；條件寫 `"default"`，不寫 `"import"` |
| `.oxlintrc.json` 的 `overrides`（已有 `files: ["src/**"]` 那條，含 `@anyknown/*` 的 `patterns`） | 01 P01-2 | Phase 01 第 1 步在 `overrides` 尾端加 `src/comp/**` 的條目 |
| `scripts/check-entry-deps.mjs`、`THIRD_PARTY_NOTICES.md`、`pnpm check:licenses` | 01 P02-1、P02-3，§9.8 | 不改；Phase 01 第 1 步在加 `fflate`、`zod` 的那個 commit 加 notices 行（§4 規則）；Phase 03 第 4 步用 `pnpm check` 驗入口 |
| `ByteSource.read(start, end): Promise<Uint8Array<ArrayBuffer>>` | 02 P02-2，`src/contract/byte-source.ts`，§9.1 | 本份**不 import**（`src/comp/` 不 import `src/contract/`）；`ReadRange` 與它相容，10 以 `(s, e) => source.read(s, e)` 傳進 `readHead` |
| `ViewerError`、`ViewerErrorCode`、`toViewerError` | 02 P02-1，`src/contract/errors.ts`，§9.1 | 本份不用；`ProjectError` 由 10 轉成 `ViewerError`（§9.6） |
| `./comp` 的符號與擁有者 | §9.6 | 本份全部擁有；符號、簽名、步驟對照 §9.6 與下面的「契約」 |

參考原始碼（每一步要對 Compositor 的，都先做這個；不放進 repo）：

```sh
git clone https://github.com/robbietilton/Compositor "$SCRATCH/compositor" && git -C "$SCRATCH/compositor" checkout 11d8d7a
```

`$SCRATCH` 是執行者自己的 scratchpad 目錄。下文寫 `Compositor/...` 與 `<clone>/docs/...` 的路徑都在這個 clone 裡（例如 `Compositor/IO/ProjectStore.swift`、`<clone>/docs/writing-comp-files.md`），不是本 repo 的 `docs/`。

## 判斷

- **容器是 zip，內容照抄 Compositor v11 的 package，不另外發明 schema**（storage 17 §2）。`.comp` 是「一個資料夾，裡面 `manifest.json` 加 `images/<圖層 UUID>.png`」，zip 起來就是一個檔，Finder 的「壓縮」反過來也是。互通不用轉換器。schema 涵蓋圖層、資料夾、混合模式、遮色片、剪裁、調整、效果、文字、形狀，我們存出來的每個檔都是合法的 Compositor 專案。不選：base64 JSON（大 33%、讀 manifest 要解整檔）、PSD、OpenRaster、多檔資料夾（理由見 storage 17 §2）。
- **manifest 永遠是第一個 entry，STORE、不用 data descriptor**，所以讀的一方不看 central directory、從 offset 0 一個 local header 就拿到 manifest（`readHead`）。AI 與預覽只讀檔頭，不必整檔下載或解密。
- **zip 自己寫，不用 fflate 寫**：fflate 的串流 `Zip` 一定設 bit 3（破壞從檔頭讀）；`zipSync` 要把全部 entry 拼成一塊 `Uint8Array`，幾百 MB 的專案多一份拷貝。自己寫的只產生檔頭，PNG bytes 原樣當 `Blob` 的片段。fflate（MIT）只用來壓縮 / 解壓：`inflateSync`（zip method 8，raw DEFLATE）、`zlibSync` / `unzlibSync` / `Zlib`（PNG 的 IDAT，帶 zlib 外殼）。
- **PNG 自己編解**：瀏覽器的 `createImageBitmap` + canvas 讀回會預乘 alpha，半透明像素存一次掉一次。自己解才保證「打開再存，沒改的層 byte 相同、改過的層像素相同」。照片（JPEG 等）的解碼歸 10，不在這裡。
- **`./comp` 不碰 DOM**：只用 ES2022 加 Node 22 與瀏覽器都有的 `Blob`、`TextEncoder`、`TextDecoder`、`crypto.randomUUID`。`tsconfig.comp.json`（01 建，`lib` 只有 ES2022、不含 DOM）、oxlint 擋 DOM / Node 專屬的全域與 import，測試在 vitest 的 node 環境跑，最後用 `node` 直接 import 建好的套件驗一次。10 的 worker 與 product 的 runtime 都能用。
- **預覽圖 `QuickLook/Preview.jpg` 由呼叫端給 bytes**：產生 JPEG 要 canvas，那是 10 的事（長邊 ≤ 1024 px、白底、品質 0.8、畫布 > 50 MP 不寫，同 Compositor `IO/ImageExporter.swift` 的 `quickLookImages`）。本份只負責把它放在第二個 entry、讀的時候拿出來。
- **和 storage 17 不一樣的地方**（都是小改，理由寫在這）：
  - `validateLikeCompositor(m)` 不收 `assetNames`：檔名規則（`<ID>.png`）不需要知道 zip 裡有什麼；「圖不存在」由 `readProject` / `writeProject` 回 `missing_asset`。這樣 `readHead`（拿不到 entry 清單）也能做完整驗證。
  - `summarize(m, name)` 多收檔名：storage 17 §5 說檔名由呼叫端傳入，§4 的簽名漏了。
  - PNG 解碼接受 1 / 2 / 4 / 8 bit 的灰階與調色盤（storage 17 只寫 8-bit）：Compositor `IO/ProjectStore.swift` `readPackage` 的條件是 depth ≤ 8，AI 或腳本寫的檔可能是低位元調色盤，Compositor 打得開的我們也要打得開。
  - 新增錯誤碼 `bad_png`（壞 PNG、16-bit、APNG、遮色片不是 8-bit 灰階），不混進 `invalid`。
  - zip 宣告總大小上限寫死 4 GiB（storage 17 是「storage 單檔上限的兩倍」= 4 GiB；本套件沒有單檔上限，取同一個數）。
  - `fromImage(image, layerName)`：第二個參數是圖層名（呼叫端傳原檔的主檔名），storage 17 寫成固定 `Background`。
- **H2 不再自己實作摘要**：ai-readable-docs 原本要在 product 寫 `image-project-summary.ts` 對 golden fixture；改成直接 import 本份的 `readHead` / `readProject` / `summarize` / `stringifyManifest`，fixture 只留在本 repo 的測試裡。H2 要做什麼見「之後再做」。
- 不做：寫 ZIP64（> 4 GiB 直接丟錯）、PSD / OpenRaster 匯入匯出、JPEG 編解碼、像素預算（10 用 `pngSize` 自己算）、讀單一圖層而不讀整檔的 API（等 product 的「讀圖片」真的要再開）。

## 契約

目錄 `src/comp/`（平的，沒有子目錄，只有 `fixtures/`）。subpath `@anyknown/file-viewer/comp` → `src/comp/index.ts`。只 import `fflate`、`zod` 與 `src/comp/` 內的檔，不 import React、`src/contract/`、`node:*`。

公開 API（`src/comp/index.ts` 匯出的全部；之後只加不改）：

```ts
// errors.ts
export type ProjectErrorCode =
  | "not_zip" | "not_project" | "too_new" | "invalid" | "missing_asset" | "unsafe_entry" | "too_large" | "bad_png";
export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  readonly details: string[]; // 給人看的原因（英文），invalid 時是 validateLikeCompositor 的結果
  constructor(code: ProjectErrorCode, details?: string[]);
}

// png-decode.ts / png-encode.ts
export type PngImage = { width: number; height: number; channels: 1 | 4; data: Uint8Array }; // 直通 alpha、RGBA8 或 8-bit 灰階
export function decodePng(bytes: Uint8Array, kind: "layer" | "mask"): PngImage; // layer → channels 4；mask → channels 1
export function pngSize(bytes: Uint8Array): { width: number; height: number };   // 只讀前 33 bytes
export function encodePng(image: PngImage): Uint8Array;
export function encodeMask(mask: PngImage): Uint8Array; // channels 必須 1；整張同一個值時寫 1×1
export type PngColor = "gray" | "rgb" | "rgba";
export function createPngEncoder(header: { width: number; height: number; color: PngColor }):
  { push(rows: Uint8Array): void; end(): Uint8Array[] };

// manifest*.ts（zod schema 推出的型別；每筆記錄多一個 extra 放不認得的 key）
export type Manifest; export type LayerRecord; export type LayerTransform; export type LayerAdjustment;
export type LayerEffects; export type LayerTextStyle; export type LayerShapeStyle; export type CanvasGuide;
export type BlendMode; // 24 種，字串照 Compositor
export function parseManifest(bytes: Uint8Array): Manifest; // 丟 ProjectError：not_project / too_new / invalid
export function stringifyManifest(m: Manifest): string;     // key 排序、兩格縮排、extra 合併回去
export function treeEntries(layers: LayerRecord[], topFirst: boolean):
  { layer: LayerRecord; depth: number; visible: boolean }[];

// validate.ts
export function validateLikeCompositor(m: Manifest): string[]; // 空陣列 = 合法

// project.ts / project-head.ts / summary.ts
export type Project = {
  manifest: Manifest;
  assets: Map<string, Uint8Array>; // "images/<ID>.png" / "images/<ID>.mask.png" → PNG bytes
  preview?: Uint8Array;            // QuickLook/Preview.jpg
};
export function readProject(bytes: Uint8Array): Project;
export function writeProject(p: Project): Blob;
export type ReadRange = (start: number, end: number) => Promise<Uint8Array>; // [start, end)；ByteSource.read 直接可傳
export function readHead(read: ReadRange): Promise<{ manifest: Manifest; preview?: Uint8Array } | null>;
export function fromImage(image: { width: number; height: number; rgba: Uint8Array }, layerName: string): Project;
export function summarize(m: Manifest, name: string): string;
```

內部（不從 index 匯出）：`crc32.ts` 的 `crc32(bytes, seed?)`；`zip-write.ts` 的 `writeZip`、`entryHeaders`；`zip-read.ts` 的 `readZip`；`zip-head.ts` 的 `readHeadEntries`；`extra.ts` 的 `record`、`toJsonValue`。

zip 格式（寫）：

- entry 順序固定：`manifest.json`、`QuickLook/Preview.jpg`（有才寫）、之後是 `images/*.png`，照 manifest 圖層陣列的順序，每層先 `<ID>.png` 再 `<ID>.mask.png`。
- 全部 method 0（STORE）；general purpose flag 只設 bit 11（UTF-8 檔名），bit 3 永遠 0，CRC-32 與大小寫在 local header 裡；version needed 20；時間欄位固定 DOS 1980-01-01 00:00（輸出可重現）；沒有 extra field、沒有 comment。
- 不寫 ZIP64：任一 entry 大小、任一 local header offset、central directory 的 offset 或大小 > 0xFFFFFFFF 時丟 `ProjectError("too_large")`。
- PNG 的 bytes 原樣當 `Blob` 的片段，不拼成一整塊。

zip 格式（讀）：

- 從檔尾往前找 EOCD（簽章 `PK\x05\x06`，最多往前 65,557 bytes），找不到 → `not_zip`。走 central directory。
- method 只接受 0（STORE）與 8（DEFLATE，fflate `inflateSync`，`out` 給 central directory 宣告的 uncompressed size 大小的 buffer，解出長度不等於宣告值 → `not_zip`）。CRC-32 對不上 → `not_zip`。
- 拒絕：加密（bit 0）、其他 method、ZIP64（任一欄位 0xFFFFFFFF / 0xFFFF，或有 ZIP64 EOCD locator）→ `not_zip`；檔名含 `..` 段、以 `/` 開頭、含 `\`、含 `:`（磁碟代號）、兩個 entry 同名 → `unsafe_entry`；單一 entry 宣告 > 512 MiB、`manifest.json` > 4 MiB（Compositor `IO/ProjectStore.swift` `readPackage` 的 `checkFile`）、全部 entry 宣告的 uncompressed size 總和 > 4 GiB → `too_large`。
- 正規化：先略過資料夾 entry（名字以 `/` 結尾）、`__MACOSX/` 底下的、basename 是 `.DS_Store` 的；剩下的全在同一個 `<任何名字>.comp/` 底下時去掉那一層（Finder / `ditto --keepParent` 壓的就是這樣）。結果是 `Map<string, Uint8Array>`（名字 → 解好的 bytes）。不認得的 entry 留在 map 裡，由 `readProject` 決定略過。
- 檔頭讀（`readHeadEntries`）：從 offset 0 解析 local header；第一個 entry 是 `manifest.json`、method 0、bit 0 與 bit 3 都沒設 → 回 manifest bytes（CRC 對不上丟 `not_zip`）；第二個 entry 是 `QuickLook/Preview.jpg`、method 0、bit 3 沒設、大小 ≤ 4 MiB → 一起回；其餘情形（DEFLATE、bit 3、第一個不是 manifest、`read` 回的長度比要的短）回 `null`，呼叫端改走整檔讀。

manifest 規則（Phase 03 的每一步都照這幾條）：

- 欄位一欄一欄照 Compositor v11 的 Swift 型別；**必填與否照 Swift 合成的 Codable**：型別是 `T?` 的選填，其他（就算有預設值，例如 `var hue: Double = 0`）在 JSON 裡都必填。Compositor 沒有自訂 `init(from:)`（已查：`Compositor/Document/*.swift`、`Compositor/IO/*.swift` 沒有）。`<clone>/docs/project-format.md` 說「都選填」是寫錯的，以程式為準。
- Swift → JSON：`Int` → 整數；`Double` / `CGFloat` → number；`UInt32` → 0…4294967295 的整數；`UUID` → UUID 字串（讀時不分大小寫，解析後一律轉大寫）；`CGPoint` / `CGSize` → 兩個 number 的陣列；`enum: String` → 它的 raw value；`[K: V]` 的 enum key 字典 → Swift 編成的交錯陣列 `[k1, v1, k2, v2, …]`（`HueSaturationSettings.adjustments` / `.bands`），原樣保留為 `unknown[]`、只驗結構（偶數長度、偶數位是字串、奇數位是物件）。
- 每個物件 schema 都用 `src/comp/extra.ts` 的 `record(shape)`：不認得的 key 收進 `extra: Record<string, unknown>`（沒有就不帶這個欄位），`stringifyManifest` 寫回時合併。Compositor 新加的「Additive layer fields」不跟版本號走，因此不會被我們存檔弄丟。
- `version` > 11 → `too_new`（details：`"saved by a newer Compositor (version N)"`）；`format` 不是 `com.compositor.project` → `not_project`；JSON 壞掉或 zod 不過 → `invalid`（details 是 zod issue 的路徑加訊息）。
- 效果（`effects`）的數值 Compositor 讀檔時不檢查（`ProjectStore.validate` 沒呼叫 `LayerEffects.isValid`），我們讀進來夾到 `Compositor/Document/LayerEffects.swift` 各 `isValid` 的範圍內，不拒絕。
- 圖層順序：`parseManifest` 把 `layers` 穩定排成「樹的順序」（Compositor `Compositor/Document/LayerGroups.swift` `LayerHierarchy.entries(topFirst: false)`：從根開始，每個節點後面接它的子孫，同一個父節點底下的相對順序不變）。之後一律以這個順序畫、摘要、寫回。
- 寫出：`version` 一律寫 11、UUID 大寫、key 依 JS 預設排序（UTF-16 碼位）遞迴排序、`JSON.stringify(…, null, 2)`、結尾不加換行；每層都寫 `isGroup`、`opacity`、`blendMode`（沒有就補 `false` / `1` / `"Normal"`，同 Compositor 存檔）；`undefined` 的選填欄位不寫。

檔頭註解：每個照 Compositor 寫的檔，第一行寫 `// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, <原路徑>), MIT, Copyright (c) 2026 Wonder Assembly LLC`；每條格式規則旁邊註解它在 Compositor 原始碼的出處（檔名與型別或函式名）。

測試慣例：`src/comp/**/*.test.ts` 第一行都是 `// @vitest-environment node`（vitest 4 支援的檔頭指令），確保在 Node 下跑、沒有 jsdom 的全域。

## Phase 01 — zip 容器與 `./comp` subpath

blocker：01 scaffold；model：sonnet。可和 Phase 02、03 平行的部分：Phase 02、03 只依賴本 phase 第 1 步。

1. **`./comp` subpath 骨架、錯誤型別、CRC-32。**
   - `pnpm add fflate@^0.8.3 zod@^4.4.3`（已在 `package.json` 的 `dependencies` 就不動）。
   - `package.json`：`exports` 加 `"./comp": { "types": "./dist/comp/index.d.ts", "default": "./dist/comp/index.js" }`（條件寫 `"default"`，照 01 的 `"."` 那條，不寫 `"import"`；01 只建 `.` 與 `./styles.css`）。不改 `scripts`（01 的 `typecheck` 已含 `tsc --noEmit -p tsconfig.comp.json`，`check` 會跑到它）。
   - `tsdown.config.ts`：`entry` 加 `{ "comp/index": "src/comp/index.ts" }`（照 01 的 entry 寫法，輸出到 `dist/comp/index.js` 與 `.d.ts`）。
   - `pnpm add -D @types/node@^22`（已存在就不動）；`tsconfig.comp.json`（repo 根，01 建）的 `compilerOptions` 加 `"types": ["node"]`（01 的基底 `tsconfig.json` 是 `types: []`，沒有它 `Blob`、`TextEncoder`、`crypto`、測試檔的 `node:*` 都編不過）。`lib` 維持 01 的 `["ES2022"]`、沒有 DOM，用到 `document`、`ImageData`、`OffscreenCanvas` 會編不過。不建 `src/comp/tsconfig.json`。
   - `.oxlintrc.json`（01 建）的 `overrides` 尾端加一條 `files: ["src/comp/**"]`：`no-restricted-imports` 擋 `react`、`react-dom`、`react/*`、`node:*`、`../*`、`@anyknown/*`（這條 override 會蓋掉 01 的 `src/**` 那條同名規則，所以 `@anyknown/*` 要重列）（`src/comp/` 是平的，`../` 一定是出了這個目錄；`./fixtures/*` 不受影響）；`no-restricted-globals` 擋 `window`、`document`、`self`、`Buffer`、`process`、`createImageBitmap`、`OffscreenCanvas`、`Image`、`ImageData`。緊接著再加一條 `files: ["src/comp/**/*.test.ts"]`，把這兩條規則設成 `"off"`（測試可以用 `node:fs`、`node:child_process` 產生與檢查 fixture；後面的 override 蓋過前面的）。
   - `src/comp/errors.ts`：契約裡的 `ProjectErrorCode`、`ProjectError`（`name = "ProjectError"`，`message` = `code` 加上 `details.join("; ")`，`details` 預設 `[]`）。
   - `src/comp/crc32.ts`：`crc32(bytes: Uint8Array, seed = 0): number`，標準 CRC-32（多項式 0xEDB88320，查表，表在 module 載入時算一次），回無號 32 位元；`seed` 讓呼叫端分段累算（`crc32(b, crc32(a)) === crc32(a + b)`）。
   - `src/comp/index.ts`：匯出 `ProjectError`、`type ProjectErrorCode`。
   - `THIRD_PARTY_NOTICES.md`（01 建）：`## Runtime dependencies` 段（把 `None yet.` 換掉；已有別的依賴就接在後面）加 `fflate` 與 `zod` 各一行（套件名逐字出現，格式照該檔已有的行：名稱、版本、授權 MIT、來源 URL）；`## Code copied into this package` 段加 Compositor 一條（repo `https://github.com/robbietilton/Compositor`、commit `11d8d7a`、抄的路徑 `IO/ProjectStore.swift`、`IO/ImageExporter.swift`、`Document/*.swift` 的規則、MIT 全文、`Copyright (c) 2026 Wonder Assembly LLC`）。
   測試：`src/comp/crc32.test.ts`：`"123456789"` → `0xCBF43926`；空陣列 → 0；分段累算等於整段；`src/comp/errors.test.ts`：`code`、`details`、`instanceof Error`、`message` 含 details。
   verify：`pnpm test src/comp && pnpm check && pnpm check:licenses && pnpm build && node --input-type=module -e "import { ProjectError } from '@anyknown/file-viewer/comp'; const e = new ProjectError('invalid', ['x']); if (e.code !== 'invalid') process.exit(1)"`
   commit：`feat(comp-format): add the ./comp subpath with project errors and crc32`

2. **寫 zip。** `src/comp/zip-write.ts`：
   - `entryHeaders(name: string, crc: number, size: number, offset: number): { local: Uint8Array; central: Uint8Array }`：照契約「zip 格式（寫）」產生一個 entry 的 local header（簽章 `0x04034b50`，30 bytes + UTF-8 檔名）與 central directory header（簽章 `0x02014b50`，46 bytes + 檔名，version made by 20、external attributes 0、local header offset = `offset`）；`size` 或 `offset` > 0xFFFFFFFF 丟 `ProjectError("too_large", ["<name> is over 4 GiB"])`（`ProjectError` 來自 `src/comp/errors.ts`）。
   - `writeZip(entries: { name: string; data: Uint8Array }[]): Blob`：依序算每個 entry 的 `crc32`（`src/comp/crc32.ts`）、`entryHeaders`，組成 `new Blob([local₁, data₁, local₂, data₂, …, central₁, …, eocd])`；EOCD 簽章 `0x06054b50`、entry 數、central directory 大小與 offset，它們 > 0xFFFFFFFF（或 entry 數 > 0xFFFF）丟 `too_large`。不排序，照傳進來的順序寫（順序是 `writeProject` 的責任）。
   測試：`src/comp/zip-write.test.ts`：寫三個 entry（含中文檔名、0 byte 的 entry）後用手寫的最小解析（測試檔裡的 helper，從 offset 0 逐個 local header 走）讀回：名字、bytes、CRC 都對；每個 local header 的 method = 0、flag = 0x0800（bit 3 = 0）；central directory 的 offset 指到正確的 local header；同樣輸入寫兩次 bytes 完全相同；`entryHeaders("a", 0, 2 ** 32, 0)` 與 `entryHeaders("a", 0, 1, 2 ** 32)` 丟 `too_large`（假的數字，不配置大記憶體）；`unzip -t`（macOS / Linux 內建）驗證寫出的檔：把 Blob 寫到 `os.tmpdir()` 再用 `node:child_process` 的 `execFileSync("unzip", ["-t", path])`，exit 0（測試檔可以 import `node:*`：`.oxlintrc.json` 對 `src/comp/**/*.test.ts` 關掉了 `no-restricted-imports`）。
   verify：`pnpm test src/comp/zip-write.test.ts && pnpm check`
   commit：`feat(comp-format): write stored zip entries with sizes in the local header`

3. **讀 zip。** `src/comp/zip-read.ts`：`readZip(bytes: Uint8Array): Map<string, Uint8Array>`，完全照契約「zip 格式（讀）」：EOCD 搜尋、central directory、STORE / DEFLATE（`inflateSync` from `fflate`，`{ out: new Uint8Array(uncompressedSize) }`）、CRC 檢查（`crc32` from `src/comp/crc32.ts`）、拒絕條件與錯誤碼（`ProjectError` from `src/comp/errors.ts`）、`__MACOSX/` / `.DS_Store` / 資料夾 entry 略過、單一 `<name>.comp/` 根資料夾去掉。資料位置從 central directory 的 local header offset 找到 local header，再跳過「local header 自己的」檔名長度與 extra 長度（不能用 central 的 extra 長度，兩者可以不同）。
   - fixture `src/comp/fixtures/ditto-sample.comp.zip`（commit 二進位檔）用 macOS 產生，命令寫在測試檔頭的註解：
     ```sh
     d=$(mktemp -d) && mkdir -p "$d/sample.comp/images" \
       && node -e "process.stdout.write(JSON.stringify({hello:'world'.repeat(200)}))" > "$d/sample.comp/manifest.json" \
       && printf 'mask mask mask mask mask mask' > "$d/sample.comp/images/A.mask.png" \
       && head -c 3000 /dev/urandom > "$d/sample.comp/images/A.png" \
       && touch "$d/sample.comp/.DS_Store" && xattr -w com.example.test 1 "$d/sample.comp/manifest.json" \
       && (cd "$d" && ditto -c -k --sequesterRsrc --keepParent sample.comp sample.comp.zip) \
       && cp "$d/sample.comp.zip" src/comp/fixtures/ditto-sample.comp.zip
     ```
     這樣產生的檔有根資料夾、DEFLATE 加 data descriptor（bit 3）、`__MACOSX/`、`.DS_Store`（2026-10-08 在本機驗過 `ditto` 會產生這些）。測試裡期望值直接用 `zipinfo` 看到的內容寫死：map 的 key 剛好是 `manifest.json`、`images/A.png`、`images/A.mask.png`，bytes 與產生時一致（manifest 內容可重算；`A.png` 的 3000 bytes 用 `readZip` 讀出後比 CRC 與長度）。
   測試：`src/comp/zip-read.test.ts`：用 `writeZip`（`src/comp/zip-write.ts`）寫再用 `readZip` 讀，bytes 相同；ditto fixture 讀得出三個檔；用測試 helper 改 bytes 造出的壞檔各一個：`../evil.png`、`/abs.png`、`a\\b.png`、`C:x.png` → `unsafe_entry`；重複檔名 → `unsafe_entry`；加密 bit → `not_zip`；method 12 → `not_zip`；central directory 宣告一個 entry uncompressed size 為 0xFFFFFFFE（≈ 4 GiB，> 512 MiB）→ `too_large`；`manifest.json` 宣告 5 MiB → `too_large`；CRC 改一個 bit → `not_zip`；隨機 100 bytes → `not_zip`；只有資料夾 entry 的 zip → 空 map；兩個不同根資料夾的 zip → 不去掉根，key 保留原路徑。
   verify：`pnpm test src/comp/zip-read.test.ts && pnpm check`
   commit：`feat(comp-format): read zip archives including Finder-compressed projects`

4. **從檔頭讀 entry。** `src/comp/zip-head.ts`：`readHeadEntries(read: (start: number, end: number) => Promise<Uint8Array>): Promise<{ manifest: Uint8Array; preview?: Uint8Array } | null>`，照契約「zip 格式（讀）」的「檔頭讀」：`read(0, 30)` → 檢查簽章 `0x04034b50`、method 0、flag 的 bit 0 與 bit 3 都是 0、compressed size = uncompressed size；`read(30, 30 + nameLen + extraLen)` → 檔名必須是 `manifest.json`；大小 > 4 MiB 丟 `ProjectError("too_large")`；讀 manifest bytes、`crc32`（`src/comp/crc32.ts`）對 local header 的 CRC，不符丟 `ProjectError("not_zip", ["manifest.json crc mismatch"])`；接著在 manifest 結束的位置讀下一個 local header，名字是 `QuickLook/Preview.jpg`、method 0、bit 3 = 0、大小 ≤ 4 MiB 時讀進來（CRC 不符就當沒有預覽，不丟錯）。讀 manifest 的過程中任何一次 `read` 回的長度比要的短 → 回 `null`；manifest 已經拿到之後、找預覽時回的長度不夠 → 只回 manifest。不讀 `images/` 的資料範圍。
   測試：`src/comp/zip-head.test.ts`：用 `writeZip`（`src/comp/zip-write.ts`）寫 `manifest.json`、`QuickLook/Preview.jpg`、`images/A.png`，`read` 用一個只給前 N bytes 的假實作：N = manifest 結束位置時拿到 manifest、沒有 preview；N = 整檔時兩個都有；記錄 `read` 呼叫，確認不碰 `images/` 的範圍；第一個 entry 不是 manifest → null；ditto fixture `src/comp/fixtures/ditto-sample.comp.zip`（DEFLATE、bit 3、根資料夾）→ null；把 flag 改成 bit 3 → null；manifest 宣告 5 MiB → `too_large`；manifest CRC 壞 → `not_zip`；preview CRC 壞 → 只回 manifest。
   verify：`pnpm test src/comp/zip-head.test.ts && pnpm check`
   commit：`feat(comp-format): read the manifest and preview from the head of a zip`

phase 結尾的 verify：`pnpm test src/comp && pnpm check && pnpm build`

## Phase 02 — PNG 編解碼

blocker：Phase 01 第 1 步（`src/comp/` 的 tsconfig、lint、`ProjectError`）；model：sonnet。可和 Phase 01 第 2–4 步、Phase 03 平行。

1. **解碼與 `pngSize`。** `pnpm add -D pngjs@7.0.0 @types/pngjs@6.0.5`（MIT，只在測試裡當對照組）。`src/comp/png-decode.ts`：
   - `pngSize(bytes)`：只看前 33 bytes（8 bytes 簽章 + IHDR 的 length、type、13 bytes 資料、CRC），驗簽章、第一個 chunk 是 `IHDR`、IHDR 的 CRC（`crc32` from `src/comp/crc32.ts`，算 type + data），回 `{ width, height }`；任何不符丟 `ProjectError("bad_png", [...])`（`src/comp/errors.ts`）。
   - `decodePng(bytes, kind)`：逐 chunk 走，每個 chunk 驗 CRC；收 `IHDR`、`PLTE`、`tRNS`、所有 `IDAT`（串起來後 `unzlibSync` from `fflate`）、到 `IEND` 停；看到 `acTL`（APNG）丟 `bad_png`；其他不認得的 chunk：type 第一個字母大寫（critical）丟 `bad_png`，小寫（ancillary，含 `gAMA`、`iCCP`、`sRGB`、`pHYs`）略過，一律當 sRGB。支援 color type 0（bit depth 1 / 2 / 4 / 8）、2（8）、3（1 / 2 / 4 / 8）、4（8）、6（8）；16-bit 與其他組合丟 `bad_png`（Compositor `IO/ProjectStore.swift` `readPackage`：depth ≤ 8）。五種 filter（None、Sub、Up、Average、Paeth），interlace 0 與 Adam7（七個 pass 各自 unfilter 再散到最終位置）。寬或高 > 30,000 丟 `bad_png`（Compositor `Compositor/Document/DocumentLimits.swift` `maxSide`）。輸出：`kind === "layer"` → `channels: 4`、直通 alpha 的 RGBA8（灰階複製到 RGB、調色盤查 `PLTE` 與 `tRNS`、color type 0 / 2 有 `tRNS` 時那個值 alpha = 0、低位元灰階放大到 0–255：值 × 255 / (2^depth − 1)）；`kind === "mask"` → 只接受 color type 0 且 bit depth 8，其他丟 `bad_png`（Compositor `Compositor/Document/LayerMask.swift` `isValid`：monochrome、8 bit、沒有 alpha），回 `channels: 1`。
   - fixture：PngSuite（Willem van Schaik，授權允許任何用途，`PngSuite.LICENSE` 一起放進來）。`curl -sSL http://www.schaik.com/pngsuite/PngSuite-2017jul19.tgz | tar xz -C "$SCRATCH/pngsuite"`，複製這幾個到 `src/comp/fixtures/pngsuite/`：`basn0g04.png`、`basn0g08.png`、`basn0g16.png`、`basn2c08.png`、`basn3p04.png`、`basn3p08.png`、`basn4a08.png`、`basn6a08.png`、`tbbn3p08.png`、`tbrn2c08.png`、`basi0g08.png`、`basi3p08.png`、`basi6a08.png`、`PngSuite.LICENSE`。
   - `src/comp/index.ts` 加匯出 `decodePng`、`pngSize`、`type PngImage`。
   測試：`src/comp/png-decode.test.ts`：除了 `basn0g16.png`，每個 fixture 的 `decodePng(…, "layer")` 與 `PNG.sync.read(buffer)`（`pngjs`，輸出 RGBA）的 `width` / `height` / `data` 完全相同；`basn0g16.png` → `bad_png`；`basn0g08.png` 的 `"mask"` 解出 `channels: 1` 且等於原始灰階；`basn4a08.png`、`basn2c08.png` 的 `"mask"` → `bad_png`；IDAT 改一個 byte（CRC 壞）→ `bad_png`；在 IHDR 後面插一個合法 CRC 的 `acTL` chunk → `bad_png`；插一個 critical 的未知 chunk `ABCD` → `bad_png`、ancillary 的 `abCD` → 照常解；`pngSize` 只給前 33 bytes 也回正確寬高、給 32 bytes 丟 `bad_png`；寬 30,001 的 IHDR（只造檔頭）→ `bad_png`。
   verify：`pnpm test src/comp/png-decode.test.ts && pnpm check`
   commit：`feat(comp-format): decode 8-bit and lower-depth png without premultiplying`

2. **編碼。** `src/comp/png-encode.ts`：
   - `createPngEncoder({ width, height, color })`：`color` 是 `"gray"`（color type 0）、`"rgb"`（2）、`"rgba"`（6），bit depth 8、不交錯。建立時寫簽章與 `IHDR`；`push(rows)` 收任意整數列（`rows.length` 必須是「每列 bytes × 列數」，否則丟 `Error`），每列挑 filter：五種都試，取「filter 後的 bytes 當 signed byte 的絕對值和」最小的，前一列跨 `push` 保留；filter 後的資料餵 `fflate` 的 `new Zlib({ level: 6 }, ondata)`，每次 `ondata` 的輸出包成一個 `IDAT` chunk（`crc32` from `src/comp/crc32.ts`）；`end()` 檢查總列數等於 `height`（不等丟 `Error`）、`push(空, true)` 收尾、寫 `IEND`，回所有 chunk 的 `Uint8Array[]`（可直接當 `Blob` 片段）。
   - `encodePng(image: PngImage)`（`PngImage` from `src/comp/png-decode.ts`）：`channels === 1` → `gray`；`channels === 4` 且每個 alpha 都是 255 → 去掉 alpha 寫 `rgb`；否則 `rgba`。一次 `push` 全部列，把 `end()` 的片段接成一個 `Uint8Array` 回傳。
   - `encodeMask(mask: PngImage)`：`channels` 不是 1 丟 `Error`；每個值都相同時寫 1×1 的 gray（Compositor `Compositor/Document/LayerMask.swift` `solid`；`<clone>/docs/project-format.md`「A uniform 1×1 mask is valid」）；否則同 `encodePng`。
   - `src/comp/index.ts` 加匯出 `encodePng`、`encodeMask`、`createPngEncoder`、`type PngColor`。
   測試：`src/comp/png-encode.test.ts`：RGBA 半透明圖、全不透明圖、灰階圖各編一次，用 `PNG.sync.read`（`pngjs`）解回像素相同，並讀 IHDR 確認 color type 分別是 6、2、0；alpha 1 到 254、RGB 各種值的 254 個像素，`decodePng(encodePng(x), "layer")`（`src/comp/png-decode.ts`）完全等於 x（不預乘）；`encodeMask` 全 128 → 1×1、值是 128；`encodeMask` 非均勻 → 原尺寸；`createPngEncoder` 分三次 `push`（每次 10 列）與一次 `push` 30 列的結果解出來像素相同；`push` 長度不是整列丟錯；`end()` 時列數不足丟錯；每個 `IDAT` 的 CRC 正確。
   verify：`pnpm test src/comp/png-encode.test.ts && pnpm check`
   commit：`feat(comp-format): encode png with per-row filters and a banded encoder`

phase 結尾的 verify：`pnpm test src/comp && pnpm check`

## Phase 03 — Compositor v11 manifest 與驗證

blocker：Phase 01 第 1 步；model：opus（逐欄對 Swift、必填規則容易錯）。可和 Phase 01 第 2–4 步、Phase 02 平行。每一步先照「參考原始碼」clone Compositor @11d8d7a。

1. **`extra` 機制與調整圖層的型別。**
   - `src/comp/extra.ts`：
     - `record<S extends z.ZodRawShape>(shape: S)`：回 `z.looseObject(shape).transform(...)`（`zod` 4 的 `looseObject`），把 `shape` 以外的 key 搬進 `extra`（沒有不認得的 key 就不帶 `extra`）。推出的型別是 `z.output<…> & { extra?: Record<string, unknown> }`。
     - `toJsonValue(value: unknown): unknown`：遞迴：陣列逐項轉；物件先把 `extra` 的 key 合併回來（已知欄位優先）、刪掉 `extra` 與值為 `undefined` 的 key、key 照 JS 預設排序；其他原樣。
   - `src/comp/manifest-adjust.ts`（檔頭照契約的「檔頭註解」）：`AdjustmentKind`（12 個 raw value，`Compositor/Document/LayerAdjustment.swift` `AdjustmentKind`）、`levelsSchema`（`Compositor/Document/Levels.swift` `LevelsSettings` 與它的 range 型別）、`curvesSchema`（`Compositor/Document/Curves.swift` `CurvesSettings`，點是 `{ x, y }`）、`hueSaturationSchema`（`Compositor/Document/HueSaturation.swift` `HueSaturationSettings`：`range`、`colorize`、`invertRange`、`adjustments`、`bands` 五個都必填；`adjustments` 與 `bands` 是交錯陣列 `unknown[]`，`superRefine` 驗偶數長度、偶數位字串、奇數位物件）、`layerAdjustmentSchema`（`LayerAdjustment` 的每個欄位，必填照契約「manifest 規則」第一條：`kind`、`hue`、`saturation`、`lightness`、`colorize`、`levels`、`curves` 必填，其餘 `?` 選填；`noiseSeed` 是 UInt32）。
   - `src/comp/manifest-image-adjust.ts`：`ExposureSettings`、`GradientMapSettings`、`BlackWhiteSettings`、`ColorBalanceSettings`、`GrainSettings` 的 schema（`Compositor/Document/ImageAdjustments.swift`，裡面引用的子型別一併照寫），`manifest-adjust.ts` import 它們。
   - 所有物件都用 `record`；這一步只做「型別與必填」，數值範圍留給第 4 步的 `validateLikeCompositor`。匯出 `type LayerAdjustment = z.output<typeof layerAdjustmentSchema>`。
   測試：`src/comp/manifest-adjust.test.ts`：`<clone>/docs/writing-comp-files.md` 的 Curves 範例的 `adjustment` 物件（貼進測試）parse 通過；拿掉 `hue` → 失敗且 issue 路徑含 `hue`；拿掉 `blurRadius` → 通過；`adjustment` 裡加 `"futureKey": 1` 與 `levels` 裡加 `"x": true` → parse 後在各自的 `extra`，`toJsonValue` 後回到原位置；`hsvSettings` 的 `adjustments: ["Master", { … }, "Reds", { … }]` parse 後 `toJsonValue` 完全相同、順序不變；奇數長度 → 失敗；`noiseSeed: -1` / `4294967296` / `1.5` → 失敗；`kind: "Sharpen"` → 失敗。
   verify：`pnpm test src/comp/manifest-adjust.test.ts && pnpm check`
   commit：`feat(comp-format): model compositor adjustment records with unknown-key preservation`

2. **效果、文字、形狀、參考線的型別。**
   - `src/comp/manifest-effects.ts`：`StrokeEffect`、`ShadowEffect`、`ColorOverlayEffect`、`InnerShadowEffect`、`OuterGlowEffect`、`InnerGlowEffect`、`LayerEffects` 的 schema（`Compositor/Document/LayerEffects.swift`，必填照契約「manifest 規則」第一條，每個效果的 `enabled` 是選填），全部用 `record`（`src/comp/extra.ts`）。每個效果 schema 再接一個 `.transform` 把數值夾回該 struct `isValid` 的範圍（例：stroke `size` 0…500（`StrokeEffect.maxSize`）、`opacity` 0…1、`red` / `green` / `blue` 0…1；shadow / inner shadow `angle` −360…360、`distance` 0…5000、`blur` 0…500；glow `size` 0…500）；非有限值（JSON 裡不會出現，但 zod 要求 number）不需處理。註解寫「Compositor 不在讀檔時檢查效果（`ProjectStore.validate` 沒呼叫 `LayerEffects.isValid`），我們夾回而不拒絕」。
   - `src/comp/manifest-text-shape.ts`：`TextAlignment`（`Left` / `Center` / `Right`）、`LayerTextColorRun`、`LayerTextFontRun`、`LayerTextStyle`（`Compositor/Document/TypeTool.swift`：`content`、`fontName`、`fontSize`、`red`、`green`、`blue`、`alignment`、`tracking`、`leading` 必填；`boxSize`（CGSize → `[w, h]`）、`colorRuns`、`fontRuns` 選填）；`ShapeKind`（`Rectangle` / `Ellipse` / `Line`）、`LayerShapeStyle`（`Compositor/Document/ShapeTool.swift`：`kind`、`red`、`green`、`blue`、`cornerRadius` 必填；`lineWidth`、`start`、`end`（CGPoint → `[x, y]`）選填）。
   - `src/comp/manifest-guides.ts`：`CanvasGuide`（`Compositor/Document/Guides.swift`：`id`（UUID，轉大寫）、`axis`（`horizontal` / `vertical`）、`position`）。UUID 的 schema `uuidSchema` 也放這個檔並匯出：`z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).transform((s) => s.toUpperCase())`。
   - 匯出 `type LayerEffects`、`type LayerTextStyle`、`type LayerShapeStyle`、`type CanvasGuide`。
   測試：`src/comp/manifest-effects.test.ts`：stroke `size: 9999` → 夾成 maxSize、`opacity: 2` → 1、`angle: -720` → −360；沒有 `enabled` → 通過；效果裡的未知 key 進 `extra`；`src/comp/manifest-text-shape.test.ts`：完整的文字樣式通過；拿掉 `tracking` → 失敗；`boxSize: [400, 200]` 通過、`boxSize: { width: 400 }` 失敗；`alignment: "center"`（小寫）→ 失敗；形狀 `kind: "Line"` 帶 `start` / `end` 通過；guide 的小寫 UUID 讀進來變大寫。
   verify：`pnpm test src/comp/manifest-effects.test.ts src/comp/manifest-text-shape.test.ts && pnpm check`
   commit：`feat(comp-format): model compositor effects, text, shapes and guides`

3. **圖層、manifest、樹的順序、讀寫 JSON。**
   - `src/comp/manifest-layer.ts`：`BlendMode`（24 個 raw value，照 `Compositor/Document/LayerAppearance.swift` `LayerBlendMode` 的順序與拼法）、`LayerSampling`（`Nearest` / `Smooth` / `High quality`）、`layerTransformSchema`（`Compositor/Document/LayerTransform.swift`：`origin`、`size` 必填，`rotation`、`flipX`、`flipY`、`sampling` 雖有預設值也必填）、`layerRecordSchema`（`Compositor/IO/ProjectStore.swift` `ProjectLayerRecord`：`id`、`name`、`isVisible`、`transform` 必填；`imageFile`、`parentID`、`isGroup`、`opacity`、`blendMode`、`maskFile`、`maskEnabled`、`maskSourceID`、`adjustment`、`maskPlacement`、`maskLinked`、`shape`、`effects`、`text` 選填）。子 schema 來自 `src/comp/manifest-adjust.ts` 的 `layerAdjustmentSchema`、`src/comp/manifest-effects.ts`、`src/comp/manifest-text-shape.ts`；UUID 用 `src/comp/manifest-guides.ts` 的 `uuidSchema`；全部用 `record`（`src/comp/extra.ts`）。
   - `src/comp/tree.ts`：`treeEntries(layers, topFirst)`，照 `Compositor/Document/LayerGroups.swift` `LayerHierarchy.entries`（`collapsed` 永遠空）：按 `parentID` 分組（保留陣列順序），從根遞迴，`topFirst` 時每層兄弟反過來；資料夾（`isGroup === true`）後面接它的子孫；`depth > 64` 停；`visible` = 祖先都可見且自己 `isVisible`。`sortTreeOrder(layers)` = `treeEntries(layers, false).map((e) => e.layer)`，再把不在樹上的（`parentID` 指到不存在或非資料夾的）原樣接在最後（讓第 4 步的驗證能報出原因，而不是在排序時遺失）。
   - `src/comp/manifest.ts`：`manifestSchema`（`ProjectManifest`：`format`、`version`、`colorSpace`、`documentID`、`width`、`height`、`layers` 必填；`resolution`、`activeLayerID`、`guides` 選填）。`parseManifest(bytes)`：`TextDecoder("utf-8", { fatal: true })` 解碼 → `JSON.parse` → 先只讀 `format` 與 `version`（同 Compositor `ProjectStore.readPackage` 先 decode `Header`）：`format` 不對 → `ProjectError("not_project")`、`version` 是整數且 > 11 → `ProjectError("too_new", ["saved by a newer Compositor (version N)"])`；再 `manifestSchema.safeParse`，失敗 → `ProjectError("invalid", issues 的 "path: message")`；最後 `layers = sortTreeOrder(layers)`。`stringifyManifest(m)`：`version` 設 11、每層補 `isGroup ?? false`、`opacity ?? 1`、`blendMode ?? "Normal"`，經 `toJsonValue`（`src/comp/extra.ts`）後 `JSON.stringify(v, null, 2)`。`ProjectError` 來自 `src/comp/errors.ts`。
   - `src/comp/index.ts` 加匯出 `parseManifest`、`stringifyManifest`、`treeEntries`，以及 `type Manifest`、`LayerRecord`、`LayerTransform`、`BlendMode`、`LayerAdjustment`、`LayerEffects`、`LayerTextStyle`、`LayerShapeStyle`、`CanvasGuide`。
   測試：`src/comp/manifest.test.ts`：`<clone>/docs/writing-comp-files.md` 的最小 manifest（貼進測試）通過，`stringifyManifest(parseManifest(x))` 再 parse 一次深度相同；頂層、圖層、`transform`、`adjustment` 裡各加一個未知 key，往返後都還在原位置；`version: 12` → `too_new`；`format: "x"` → `not_project`；非 UTF-8 bytes 或壞 JSON → `invalid`；拿掉 `transform.sampling` → `invalid`；寫出的 JSON key 排序（逐層檢查）、兩格縮排、UUID 大寫、`version` 11；缺 `blendMode` 的層寫出時是 `"Normal"`；`src/comp/tree.test.ts`：陣列 `[A(folder), B(root), C(child of A)]` 排成 `[A, C, B]`；`topFirst` 時是 `[B, A, C]`，depth `[0, 0, 1]`；隱藏的資料夾讓子層 `visible: false`；同一個父底下的相對順序不變；`parentID` 指到不存在的 id 的層接在最後。
   verify：`pnpm test src/comp/manifest.test.ts src/comp/tree.test.ts && pnpm check`
   commit：`feat(comp-format): parse and stringify compositor v11 manifests in tree order`

4. **`validateLikeCompositor`。** `src/comp/validate.ts`（主規則）與 `src/comp/validate-records.ts`（各型別的 `isValid`），`validateLikeCompositor(m: Manifest): string[]`（`Manifest` from `src/comp/manifest.ts`）。每條規則一個訊息，格式 `"layer <ID 前 8 碼> \"<name>\": <field> <原因>"`（頂層的用 `"manifest: <field> <原因>"`），收集全部、不在第一條就停。規則逐條照 `Compositor/IO/ProjectStore.swift` 的 `validate` 與 `validateGuides`、`Compositor/Document/LayerGroups.swift` `LayerHierarchy.validate`、`Compositor/Document/LiveLayerMask.swift` `LiveMaskGraph.validate`，以及被呼叫的 `isValid`（`LayerTransform`、`LayerTextStyle`、`LayerAdjustment` 與它引用的 `CurvesSettings`、`LevelsSettings` 的 `normalized`、`ExposureSettings`、`GradientMapSettings`、`GrainSettings`、`BlackWhiteSettings`、`ColorBalanceSettings`）。必須涵蓋：
   - 頂層：`format`、版本 1–11、`colorSpace === "sRGB"`、`resolution` 有限且 1–9600、`width` / `height` 1–30,000（`DocumentLimits.maxSide`）、圖層 ≤ 10,000、`activeLayerID` 存在、`guides`：版本 < 8 時必須沒有，否則 ≤ 1,000、id 不重複、`position` 有限且 |p| ≤ 1,000,000。
   - 每層：id 不重複；`transform` 合法（有限、size 1–300,000、|origin| ≤ 1,000,000）；名字 trim 後非空、UTF-8 ≤ 16,384 bytes；`imageFile` 沒有或等於 `<ID>.png`；`maskFile` 等於 `<ID>.mask.png` 且版本 ≥ 4（資料夾 ≥ 6）；`maskEnabled` / `maskPlacement` 需要 `maskFile`，`maskPlacement` 是合法 transform；opacity 有限 0–1；版本 < 3 時 opacity 1 且 Normal；資料夾 blend 只能 Normal、版本 < 8 時 opacity 1；文字：`isValid`（`content` UTF-16 長度 ≤ 100,000、`fontSize` 1–2000、顏色 0–1、`tracking` −100–1000、`leading` 0–5000、`boxSize`、runs 排序不重疊長度 > 0 在內容內）、`colorRuns` 版本 ≥ 10、`fontRuns` 版本 ≥ 11、要有 `imageFile`、不是資料夾、沒有 `adjustment`；調整：版本 ≥ 7、不是資料夾、沒有 `imageFile`、`isValid`（含 `hsvSettings` 交錯陣列裡每個 adjustment 的 hue / saturation / lightness 範圍與 band handles 有限）、Gaussian Blur / Motion Blur / Add Noise 版本 ≥ 9。
   - 樹：資料夾沒有 `imageFile`；`parentID` 指到存在的資料夾、沒有循環、祖先 ≤ 64 層；版本 1 不能有 `parentID` / `isGroup`。
   - 剪裁（`maskSourceID`）：版本 ≥ 5；來源存在、不是資料夾、不是調整圖層；目標不是資料夾；鏈 < 256、沒有循環。
   - `src/comp/index.ts` 加匯出 `validateLikeCompositor`。
   測試：`src/comp/validate.test.ts`：最小 manifest 與 Curves 範例（`<clone>/docs/writing-comp-files.md`）回空陣列；上面每一條規則各一個只違反那一條的案例（以最小 manifest 為底改一處），回傳恰好一個訊息且含該層 id 前 8 碼與欄位名；同時違反三條回三個訊息；`imageFile` 用小寫 id → 有訊息（Compositor 比的是 `uuidString`，大寫）；邊界值（opacity 0 與 1、寬 30,000、64 層巢狀、255 長的剪裁鏈）回空陣列。測試檔可依規則類別拆成 `validate.test.ts` 與 `validate-records.test.ts`，各 ≤ 300 行。
   verify：`pnpm test src/comp/validate.test.ts src/comp/validate-records.test.ts && pnpm check`
   commit：`feat(comp-format): validate manifests with compositor's own rules and reasons`

phase 結尾的 verify：`pnpm test src/comp && pnpm check`

## Phase 04 — 專案讀寫、檔頭讀、圖層樹摘要

blocker：Phase 01、02、03 全部；model：sonnet。

1. **`readProject` / `writeProject` / `fromImage`。** `src/comp/project.ts`：
   - `type Project`（照契約）。
   - `readProject(bytes)`：`readZip`（`src/comp/zip-read.ts`）→ 沒有 `manifest.json` → `ProjectError("not_project")`（`src/comp/errors.ts`）→ `parseManifest`（`src/comp/manifest.ts`）→ `validateLikeCompositor`（`src/comp/validate.ts`）非空 → `ProjectError("invalid", 結果)` → 每層的 `imageFile` / `maskFile` 必須有 `images/<檔名>` entry，否則 `ProjectError("missing_asset", ["images/<檔名>"])`（全部缺的一起列）→ 每個用到的 asset 跑 `pngSize`（`src/comp/png-decode.ts`，壞的丟 `bad_png`）。`assets` 只收 manifest 用到的；`preview` = `QuickLook/Preview.jpg` entry（有才帶）；其他 entry 略過。
   - `writeProject(p)`：`validateLikeCompositor(p.manifest)` 非空 → `ProjectError("invalid", 結果)`；manifest 用到的 asset 缺了 → `missing_asset`；組 entries：`{ name: "manifest.json", data: TextEncoder 編的 stringifyManifest(p.manifest) }`（`src/comp/manifest.ts`）、有 `p.preview` 就接 `QuickLook/Preview.jpg`、再照 `p.manifest.layers` 順序每層 `images/<ID>.png`、`images/<ID>.mask.png`（有才寫）；`writeZip`（`src/comp/zip-write.ts`）回 `Blob`。`p.assets` 裡沒被用到的不寫。
   - `fromImage({ width, height, rgba }, layerName)`：一層，`id` 與 `documentID` 用 `crypto.randomUUID().toUpperCase()`；`version` 11、`colorSpace` `sRGB`、`resolution` 72、`activeLayerID` = 層 id；層：`name` = `layerName`（trim 後空字串時用 `"Background"`）、`isVisible` true、`isGroup` false、`opacity` 1、`blendMode` `Normal`、`imageFile` `<ID>.png`、`transform` `{ origin: [0, 0], size: [width, height], rotation: 0, flipX: false, flipY: false, sampling: "High quality" }`；asset 用 `encodePng({ width, height, channels: 4, data: rgba })`（`src/comp/png-encode.ts`）；沒有 preview。
   - fixture `src/comp/fixtures/ditto-project.comp.zip`（commit 二進位檔），產生命令寫在測試檔頭註解：在 `$d/ditto.comp/` 放 `<clone>/docs/writing-comp-files.md` 的最小 manifest（貼成 `manifest.json`，把 `width` / `height` 與 `transform.size` 改成 4×4）與 `images/6F1D3C2A-0B7E-4E8A-9C4D-2A1B3C4D5E6F.png`（`node -e` 用 `pngjs` 的 `PNG.sync.write` 產生 4×4 RGBA，像素 `(x*60, y*60, 128, 200)`），`touch .DS_Store`，`ditto -c -k --sequesterRsrc --keepParent ditto.comp ditto-project.comp.zip`。
   - `src/comp/index.ts` 加匯出 `readProject`、`writeProject`、`fromImage`、`type Project`。
   測試：`src/comp/project.test.ts`：`fromImage` 4×4 → `writeProject` → `readProject`：manifest 深度相同、asset bytes 相同；寫出的檔 `validateLikeCompositor` 空；讀 → 寫 → 讀，manifest 相同、每個 PNG byte 相同；寫出的 zip 第一個 entry 是 `manifest.json`、帶 preview 時第二個是 `QuickLook/Preview.jpg`（用 `readHeadEntries` from `src/comp/zip-head.ts` 確認拿得到兩者）；ditto fixture 讀得出 manifest 與那張 PNG，`decodePng(…, "layer")` 的像素等於產生時的值；manifest 指到不存在的圖 → `missing_asset` 且 details 列出路徑；manifest 的 `version: 3` 但有 mask → `invalid`；asset 不是 PNG → `bad_png`；`writeProject` 傳不合法的 manifest → `invalid`、不產生 Blob；`p.assets` 多一個沒用到的 → 寫出的 zip 沒有它。
   verify：`pnpm test src/comp/project.test.ts && pnpm check`
   commit：`feat(comp-format): read and write .comp.zip projects compatible with compositor`

2. **`readHead`。** `src/comp/project-head.ts`：`type ReadRange = (start: number, end: number) => Promise<Uint8Array>`；`readHead(read: ReadRange)`：`readHeadEntries(read)`（`src/comp/zip-head.ts`）回 null 就回 null；否則 `parseManifest`（`src/comp/manifest.ts`）、`validateLikeCompositor`（`src/comp/validate.ts`）非空丟 `ProjectError("invalid", 結果)`（`src/comp/errors.ts`）；回 `{ manifest, preview? }`。不檢查 asset 是否存在（拿不到 entry 清單）。`ByteSource.read(start, end, signal?)`（02 contract `src/contract/byte-source.ts`）在型別上可直接傳入，本檔不 import 它。`src/comp/index.ts` 加匯出 `readHead`、`type ReadRange`。
   測試：`src/comp/project-head.test.ts`：`writeProject(fromImage(…))`（`src/comp/project.ts`）加一個 preview 寫出的檔，`read` 只給到 preview 結束的位置，回的 manifest 等於 `readProject` 的、preview bytes 相同；`src/comp/fixtures/ditto-project.comp.zip` → null；manifest 有效但 `validateLikeCompositor` 不過（手寫 zip：`writeZip` 寫一個 `version: 1` 帶 `parentID` 的 manifest）→ `invalid`；`version: 12` → `too_new`。
   verify：`pnpm test src/comp/project-head.test.ts && pnpm check`
   commit：`feat(comp-format): read a project's manifest from the first entry only`

3. **圖層樹摘要與 golden fixture。** `src/comp/summary.ts`：`summarize(m: Manifest, name: string): string`（`Manifest` from `src/comp/manifest.ts`）。輸出（行之間 `\n`，結尾不加換行）：
   - 第一行 ` ```image-project `，最後一行 ` ``` `。
   - 標頭：`<name> · <width>×<height> · <resolution ?? 72> ppi · <n> layer(s) · <f> folder(s) · top first`。`n` 不含資料夾；`1 layer` / `2 layers`，`1 folder` / `2 folders`；`f` 為 0 時整段 `· 0 folders` 不寫。`ppi` 四捨五入到整數。
   - 圖層列照 `treeEntries(m.layers, true)`（`src/comp/tree.ts`）的順序，每列 `"  ".repeat(depth) + "- "` 開頭，然後依序用 ` · ` 接以下各段（沒有的段不寫）：
     1. 剪裁（`maskSourceID` 有值）時名字前加 `↳ `。
     2. 主體：資料夾 `folder <名字>`；其他 `<名字>`。名字用 `JSON.stringify(name)`（含引號與跳脫）。
     3. 種類：文字 `text <內容>`（`\r\n` 與 `\n` 換成 `⏎`，取前 80 個 code point（`Array.from`），截掉時尾端加 `…`，再 `JSON.stringify`）接 ` · <fontName> <fontSize> px · <alignment>`（`fontSize` 四捨五入到 0.1，整數不帶小數；`alignment` 原值 `Left` / `Center` / `Right`）；形狀 `shape <kind>`；調整 `adjustment <kind>`；沒有 `imageFile`、不是資料夾也不是調整 → `empty`。
     4. `hidden`（`isVisible === false`）。
     5. 混合模式（不是 `Normal` 時寫原值，例 `Screen`）。
     6. 不透明度（≠ 1 時 `Math.round(opacity * 100)%`）。
     7. 遮色片：有 `maskFile` 時 `maskEnabled === false` 寫 `mask off`，否則 `mask`。
     8. `clipped`（`maskSourceID` 有值）。
     9. 幾何（只有像素層與形狀層）：`<w>×<h> at (<x>, <y>)`，四捨五入成整數；`rotation` 四捨五入後 ≠ 0 時再接一段 `<rotation>°`。
     10. 效果：`effects: ` 加上啟用（`enabled !== false`）的效果 key，順序 `stroke, shadow, colorOverlay, innerShadow, outerGlow, innerGlow`，用 `, ` 接；全都停用或沒有就不寫。
     11. 最後接一個空格與 `#<id 前 8 碼>`（不是 ` · ` 分隔）。
   - 超過 500 列時只寫前 500 列，再加一列 `- … <剩下列數> more`。
   - 範例（golden fixture 第一個案例的期望值，資料照這段反推 manifest）：
     ~~~text
     ```image-project
     poster.comp.zip · 1920×1080 · 72 ppi · 6 layers · 1 folder · top first
     - folder "Sky" · 80% #2B9E4C11
       - ↳ "Tint" · adjustment Hue/Saturation · clipped #A1B2C3D4
       - "Clouds" · Screen · 60% · mask · 1920×600 at (0, 0) #6F1D3C2A
       - "Sun" · shape Ellipse · 300×300 at (1400, 120) · 15° · effects: stroke, shadow #0C5E7A91
     - "Title" · text "Summer sale" · Geist-Bold 96 px · Center #3B2D4F6A
     - "Warm grade" · adjustment Curves #8E1C9D0B
     - "Background" · hidden · 1920×1080 at (0, 0) #7A6F5E4D
     ```
     ~~~
     （`Tint` 剪裁到 `Clouds`：在陣列裡 `Tint` 在 `Clouds` 之後、同一個資料夾內，所以 top first 時在它上面。）
   - golden fixture `src/comp/fixtures/summary-v1.json`：`[{ "name": string, "manifest": object, "summary": string }]`，三個案例：(a) 上面的 poster；(b) 只有一層、`resolution` 缺、沒有資料夾、名字含引號與換行、文字超過 80 字且含換行、遮色片停用、效果全停用、空白層；(c) 510 層像素層（`summary` 是 500 列加 `- … 10 more`）。每個 `manifest` 都要通過 `validateLikeCompositor`（`src/comp/validate.ts`）。
   - `src/comp/index.ts` 加匯出 `summarize`。
   測試：`src/comp/summary.test.ts`：fixture 每個案例 `summarize(parseManifest(TextEncoder 編的 JSON.stringify(manifest)), name)` 與 `summary` 完全相同；每個 fixture manifest `validateLikeCompositor` 為空；標頭單複數（1 layer / 2 layers）。
   verify：`pnpm test src/comp/summary.test.ts && pnpm check`
   commit：`feat(comp-format): summarize the layer tree for models with a golden fixture`

4. **Node 端到端與入口檢查。** `scripts/smoke-comp.mjs`：從 `@anyknown/file-viewer/comp`（套件自我參照，需要先 `pnpm build`）import `fromImage`、`writeProject`、`readProject`、`readHead`、`summarize`、`stringifyManifest`；產生 2×2 的專案、寫出、`readProject`、用 `bytes.subarray` 包成 `ReadRange` 跑 `readHead`、印出 `summarize(…, "smoke.comp.zip")`；任何一步結果不符就 `process.exit(1)`。不改 `package.json` 的 `scripts`，直接用 `node scripts/smoke-comp.mjs` 跑；CI 不另加步驟（01 的 `verify:pack` 已 resolve 每條 exports）。另外確認 `scripts/check-entry-deps.mjs`（01）在 `dist/index.js` 的靜態 import 圖裡看不到 `fflate`、`zod`；看得到就是有人從 `.` 入口 import 了 `src/comp/`，修掉那個 import。
   測試：無新的 vitest 檔；這一步的完成標準就是 smoke 在純 Node（沒有 jsdom、沒有 DOM 全域）跑過。
   verify：`pnpm build && node scripts/smoke-comp.mjs && pnpm check`
   commit：`test(comp-format): smoke the ./comp subpath in plain node`

phase 結尾的 verify：`pnpm test src/comp && pnpm check && pnpm build && node scripts/smoke-comp.mjs`

## 之後再做

- 與 Compositor app 的實機互通（Compositor 打開我們寫的檔、我們打開它存的檔再存回去 Compositor 照樣打得開）：要 macOS 上裝 Compositor，歸 10 的驗收步驟（storage 13 第 5 步的那條）。
- `QuickLook/Preview.jpg` 的產生（合併、白底、JPEG）：10。
- 宿主（H1）：storage 的 `.comp.zip` 預覽用 vault 的隨機讀接 `readHead`（每個 chunk 照常 GCM 驗證、讀不到整檔就不比全檔 sha256，同 storage 14 §3 的取捨）；上傳 mime `application/zip`。
- 宿主（H2）：product `ai-readable-docs` 的影像專案條目改成 import `@anyknown/file-viewer/comp`：`.comp.zip` 用 `readHead`（接 vault 逐 chunk 解密的讀取），回 null 時 ≤ 2 MiB 改用 `readProject`，回 ` ```image-project ` 的 `summarize(manifest, 檔名)`；`raw: true` 回 `stringifyManifest(manifest)`；不再自己寫 `image-project-summary.ts`。ai-readable-docs 引用的「storage 17 §9」不存在（storage 17 只到 §8），寫回照 Compositor `<clone>/docs/writing-comp-files.md` 與本份的 `writeProject`。
- 只讀單一圖層的 PNG 而不讀整檔（從 central directory 隨機讀一個 entry）：product 的「讀圖片」真的要時再加 `readEntry(read, size, name)`。
- 寫 ZIP64、PSD / OpenRaster 匯入匯出、16-bit PNG。
