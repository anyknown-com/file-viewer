# 01 scaffold — 空的 `@anyknown/file-viewer` 能 build、能測、能檢查、能發佈

狀態：planned（2026-10-08）；blocker：無；model：sonnet（Phase 01–03），主 agent（Phase 04）；push：Phase 04 一次（repo 在 Phase 04 才建）。
執行方式：每一步交給一個獨立的 subagent。執行的 agent 只讀本檔的頭部（狀態、判斷、契約）和自己那一步；做完、verify 綠了、commit 就停。本檔裡所有路徑都相對於 repo 根目錄 `/Users/solemnis/Documents/anyknown-com/file-viewer`。從 P01-2 起，每一步改完檔案、跑 verify 之前，先執行 `pnpm fmt`；從別的 repo 複製來的檔案縮排與分號都不同，不先排版就過不了 `fmt:check`。

## 判斷

- 先把之後 12 份 plan 都要用的命令與閘門一次定好：`pnpm test`、`pnpm test:browser`、`pnpm check`、`pnpm build`。之後的 plan 只加套件（`pnpm add`），不改設定檔。
- build 用 tsdown，不用 tsc。理由：
  - 多個 entry 共用的程式要由 bundler 切成共用 chunk；
  - 入口檢查要看的是 build 出來的靜態 import 圖。
  
  設定照 `../storage/client/tsdown.config.ts`。00-overview §6 的 01 列寫「tsc build」，以本份為準。
- 工具版本照 2026-10-08 npm 上的版本：tsdown 0.23、vitest 5 加上 `@vitest/browser-playwright` 5、playwright 1.64、oxlint 1.87、oxfmt 0.72、turbo 2.11。TypeScript 跟兩個有發 d.ts 的套件（`../ui`、`../storage/client`）一樣用 5.9；tsdown 0.23 的 peer 接受 5–7。
- lint 照 `../storage/.oxlintrc.json`：≤ 300 行、kebab-case、禁 `any`、`consistent-type-imports`、`import/no-cycle`。另加兩條：
  - 禁 `useEffect` / `useLayoutEffect`，寫法照 `../product/.oxlintrc.json` 的 `apps/web/**` override；
  - `src/**` 不准 import `@anyknown/*`：本套件不 import storage、product，也不 import ui 的任何 JS（00-overview §2）。`tokens.css` 由宿主 import。
- 格式照 `../storage/.oxfmtrc.json`（product 也是這組），所以從 storage 搬來的程式不用重排。
- 測試分兩個 vitest project：
  - `jsdom` 跑 `*.test.ts(x)`，另外也跑 `scripts/**/*.test.mjs`；
  - `browser` 跑 `*.browser.test.ts(x)`，用 headless Chromium，給 WebGL2、WebCodecs、canvas 實測。
  
  01 在兩個 project 各放一個環境測試，證明環境真的是宣稱的那樣：CI 上拿不到 WebGL2，這裡就會紅，不必等到 06 / 10 才發現。
- 檢查走 turbo，remote cache 照 ui：server 是 `turbo.anyknown.com`，一個 repo 一個 teamSlug，本 repo 用 `anyknown-file-viewer`。
- 發佈照 ui：
  - 打 tag `v*` 觸發 `release.yml`，tag 與 `package.json` 的版本不一樣就失敗；
  - 用 npm trusted publishing（OIDC），repo 不存 npm token；
  - 第一版只能在本機手動發，因為 npm 只能幫已經存在的套件綁 trusted publisher（`../npm-publish-todo.txt`、`../ui/README.md` 的 Release 段）。
  
  首發 0.0.1 只是佔名，沒有 API。第一個能用的版本是 0.1.0，由 tag 發。
- 不做：
  - docs 站（05 做）；
  - React 與 `@anyknown/ui` 的 peer：02 第一次用到時用 `pnpm add` 加；
  - publint / attw / size-limit：exports 交給 `verify:pack` 驗，入口大小交給 `check-entry-deps.mjs` 驗。

## 契約

`package.json`（Phase 01 第 1 步建立）。之後的 plan 只在 `dependencies` / `peerDependencies` / `devDependencies` 加東西；新增 subpath 時同一個 commit 改三處：`exports`、`tsdown.config.ts` 的 `entry`、`src/<subpath>/index.ts`。

```jsonc
{
  "name": "@anyknown/file-viewer",
  "version": "0.0.1",
  "description": "View and edit files in the browser: bytes in, Blob out, no server.",
  "homepage": "https://github.com/anyknown-com/file-viewer",
  "bugs": { "url": "https://github.com/anyknown-com/file-viewer/issues" },
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/anyknown-com/file-viewer.git" },
  "type": "module",
  "sideEffects": ["**/*.css"],
  "files": ["dist", "LICENSE", "THIRD_PARTY_NOTICES.md"],
  "exports": {
    ".":              { "types": "./dist/index.d.ts",              "default": "./dist/index.js" },
    "./styles.css":   "./dist/styles.css",
    "./markdown":     { "types": "./dist/markdown/index.d.ts",     "default": "./dist/markdown/index.js" },
    "./excalidraw":   { "types": "./dist/excalidraw/index.d.ts",   "default": "./dist/excalidraw/index.js" },
    "./video-editor": { "types": "./dist/video-editor/index.d.ts", "default": "./dist/video-editor/index.js" },
    "./audio-editor": { "types": "./dist/audio-editor/index.d.ts", "default": "./dist/audio-editor/index.js" },
    "./image-editor": { "types": "./dist/image-editor/index.d.ts", "default": "./dist/image-editor/index.js" },
    "./comp":         { "types": "./dist/comp/index.d.ts",         "default": "./dist/comp/index.js" }
  },
  "publishConfig": { "access": "public" },
  "packageManager": "pnpm@10.30.3"
}
```

`repository.url` 必須是上面這個值：npm provenance 會拿它比對簽章裡的 repo。

完成後的 scripts（每一步只加自己那幾條）：

| script | 內容 | 哪一步加 |
| --- | --- | --- |
| `build` | `tsdown` | P01-1 |
| `typecheck` | `tsc --noEmit && tsc --noEmit -p tsconfig.comp.json` | P01-2 |
| `lint` | `oxlint` | P01-2 |
| `fmt` / `fmt:check` | `oxfmt` / `oxfmt --check` | P01-2 |
| `check:entry` | P01-2 是 `tsdown`；P02-1 改成 `tsdown && node scripts/check-entry-deps.mjs` | P01-2、P02-1 |
| `check` | `turbo run typecheck lint fmt:check check:entry` | P01-2 |
| `test` | `vitest run --project jsdom` | P01-3 |
| `test:browser` | `vitest run --project browser` | P01-3 |
| `verify:pack` | `pnpm build && node scripts/verify-pack.mjs` | P02-2 |
| `prepublishOnly` | `pnpm check && pnpm test && pnpm test:browser && pnpm verify:pack && pnpm check:licenses` | P02-2 |
| `check:licenses` | `node scripts/check-licenses.mjs` | P02-3 |

`pnpm test <path>` 與 `pnpm test:browser <path>` 只跑那個路徑底下的測試。

入口檢查（`scripts/check-entry-deps.mjs`）：

- 從 `dist/index.js` 出發，只沿著靜態 `import` / `export … from` 的相對路徑走，`import()` 不跟。走到的所有檔案就是入口的靜態 import 圖。
- 圖裡出現下面任何一個 bare specifier 就失敗：`@excalidraw/` 開頭、`mediabunny`、`react-markdown`、`remark-` 開頭、`rehype-` 開頭、`unified`、`fflate`。
- 圖裡所有檔案的大小加起來超過 65536 bytes 就失敗。上限要調高，理由寫在調高的那個 commit 的訊息裡。

授權檢查（`scripts/check-licenses.mjs`）：

- 讀 `pnpm licenses list --prod --json`，輸出形狀是 `{ [license: string]: { name: string }[] }`。
- 允許的 license：MIT、ISC、BSD-2-Clause、BSD-3-Clause、Apache-2.0、0BSD。
- 寫成 `(A OR B)` 的 license，只要其中一個在允許清單裡就通過。
- 唯一的例外：名稱是 `mediabunny` 的套件可以是 MPL-2.0。
- 其他 license 一律失敗，包括 GPL、LGPL 與 `Unknown`。
- `package.json` 的 `dependencies` 裡每個套件名，都必須逐字出現在 `THIRD_PARTY_NOTICES.md` 裡。

## Phase 01 — 工具鏈與空殼

blocker：無；model：sonnet。

1. repo 與 build。
   - 在 repo 根目錄執行 `git init -b main`。已經存在的 `docs/plans/*.md` 一起進這個 commit。
   - 新增 `package.json`：內容就是契約那段 JSON，加上 `"scripts": { "build": "tsdown" }`。
   - 執行 `pnpm add -D tsdown@^0.23.0 typescript@^5.9.3`。
   - 新增 `tsdown.config.ts`：

     ```ts
     import { defineConfig } from "tsdown";

     export default defineConfig({
       entry: {
         index: "src/index.ts",
         "markdown/index": "src/markdown/index.ts",
         "excalidraw/index": "src/excalidraw/index.ts",
         "video-editor/index": "src/video-editor/index.ts",
         "audio-editor/index": "src/audio-editor/index.ts",
         "image-editor/index": "src/image-editor/index.ts",
         "comp/index": "src/comp/index.ts",
       },
       format: ["esm"],
       platform: "neutral",
       dts: true,
       sourcemap: true,
       clean: true,
       fixedExtension: false,
       copy: [{ from: "src/styles.css", to: "dist" }],
     });
     ```
   - 新增 `tsconfig.json`：
     - `compilerOptions`：`target` ES2022、`module` ESNext、`moduleResolution` bundler、`jsx` react-jsx、`strict` true、`noEmit` true、`verbatimModuleSyntax` true、`isolatedModules` true、`skipLibCheck` true、`lib` ["ES2022", "DOM", "DOM.Iterable"]、`types` []。
     - `include`：["src", "vitest.config.ts", "tsdown.config.ts"]。
   - 新增 `tsconfig.comp.json`：
     - 內容是 `{ "extends": "./tsconfig.json", "compilerOptions": { "lib": ["ES2022"] }, "include": ["src/comp"] }`。
     - 作用：`src/comp` 一用到 DOM 型別就會報錯（00-overview §7）。
   - 新增空殼檔。每個檔第一行是一行註解，指出哪份 plan 會填它；第二行是 `export {};`。
     - `src/index.ts`：註解 `// "." entry. Filled by 02 contract and 03 viewer-core.`
     - `src/markdown/index.ts`、`src/excalidraw/index.ts`：註解寫 `04 markdown-excalidraw`。
     - `src/video-editor/index.ts`：註解寫 `07 video-editor`。
     - `src/audio-editor/index.ts`：註解寫 `08 audio-editor`。
     - `src/image-editor/index.ts`：註解寫 `10 image-editor`。
     - `src/comp/index.ts`：註解寫 `09 comp-format`。
   - 新增 `src/styles.css`：只有一行註解 `/* fv-* classes. Filled by 02 contract. */`。
   - 新增 `.gitignore`，共九行：`node_modules`、`dist`、`site/dist`、`.wrangler`、`.DS_Store`、`*.tsbuildinfo`、`.turbo`、`.env`、`*.log`。
   - 新增 `LICENSE`：
     - 內容是 MIT 全文，從 `../ui/LICENSE` 整份複製；
     - 版權行寫 `Copyright (c) 2026 Senlima Sun`（00-overview §8 第 1 題）。
   - 測試：無。
   - verify：`pnpm install && pnpm build && ls dist/index.js dist/index.d.ts dist/markdown/index.js dist/comp/index.d.ts dist/styles.css`
   - commit：`build(scaffold): set up package, tsdown entries and empty subpaths`
2. typecheck、lint、format 與 `pnpm check`。
   - 執行 `pnpm add -D oxlint@^1.87.0 oxfmt@^0.72.0 turbo@^2.11.7`。
   - 新增 `.oxlintrc.json`。
     - 先整份複製 `../storage/.oxlintrc.json`，然後改兩處。
     - 第一處：`ignorePatterns` 改成 `["**/dist/**", "**/node_modules/**", "**/*.d.ts"]`。
     - 第二處：在 `overrides` 陣列加一個元素，內容如下（`no-restricted-properties` 的寫法照 `../product/.oxlintrc.json` 裡 `"files": ["apps/web/**", …]` 那個 override）：

       ```json
       {
         "files": ["src/**"],
         "rules": {
           "no-restricted-imports": ["error", {
             "paths": [{ "name": "react", "importNames": ["useEffect", "useLayoutEffect"],
                         "message": "no effects: use a ref callback with cleanup or an event handler" }],
             "patterns": [{ "group": ["@anyknown/*"],
                            "message": "file-viewer imports no @anyknown package; hosts import tokens.css (00-overview §2)" }]
           }],
           "no-restricted-properties": ["error",
             { "object": "React", "property": "useEffect", "message": "no effects: use a ref callback with cleanup or an event handler" },
             { "object": "React", "property": "useLayoutEffect", "message": "no effects: use a ref callback with cleanup or an event handler" }]
         }
       }
       ```
   - 新增 `.oxfmtrc.json`。
     - 先整份複製 `../storage/.oxfmtrc.json`。
     - 再把 `ignorePatterns` 改成 `["**/dist/**", "**/node_modules/**", "pnpm-lock.yaml", "**/*.md"]`。markdown 不交給 oxfmt 排版，做法同 `../ui/.oxfmtrc.json`。
   - 新增 `turbo.json`：

     ```json
     {
       "$schema": "https://turborepo.com/schema.json",
       "agentGuidance": false,
       "remoteCache": { "apiUrl": "https://turbo.anyknown.com", "teamSlug": "anyknown-file-viewer" },
       "tasks": {
         "build": { "inputs": ["src/**", "!src/**/*.test.*", "tsconfig.json", "tsdown.config.ts"], "outputs": ["dist/**"] },
         "typecheck": { "inputs": ["src/**", "tsconfig.json", "tsconfig.comp.json", "vitest.config.ts", "tsdown.config.ts"] },
         "lint": { "inputs": ["src/**", "scripts/**", ".oxlintrc.json"] },
         "fmt:check": { "inputs": ["$TURBO_DEFAULT$", "!**/*.md"] },
         "check:entry": { "cache": false },
         "test": { "inputs": ["src/**", "scripts/**", "vitest.config.ts"] },
         "test:browser": { "inputs": ["src/**", "vitest.config.ts"] },
         "verify:pack": { "cache": false }
       }
     }
     ```
   - `package.json` 的 `scripts` 加這幾條（內容照契約的 scripts 表）：`typecheck`、`lint`、`fmt`、`fmt:check`、`check:entry`（本步的值是 `tsdown`）、`check`。
   - 執行 `pnpm fmt`，讓現有的檔案都符合格式。
   - 測試：無。lint 規則的反例寫在 verify 裡。
   - verify：

     ```
     pnpm check && printf 'import { useEffect } from "react";\nexport const x = useEffect;\n' > src/x.ts && ! pnpm lint && printf 'import "@anyknown/storage-client";\n' > src/x.ts && ! pnpm lint && rm src/x.ts && pnpm lint
     ```
   - commit：`build(scaffold): add typecheck, oxlint, oxfmt and the check task`
3. vitest 的兩種模式。
   - 執行 `pnpm add -D vitest@^5.0.3 @vitest/browser-playwright@^5.0.3 playwright@^1.64.0 jsdom@^30.1.2 vite@^8.2.2`。
   - 新增 `vitest.config.ts`。
     - 測試檔一律從 `vitest` 明確 import，不開 `globals`。
     - Chromium 的兩個 launch arg 是為了讓沒有 GPU 的 CI 也拿得到 WebGL2（走軟體 rasterizer SwiftShader）。
     - 檔案內容：

     ```ts
     import { playwright } from "@vitest/browser-playwright";
     import { defineConfig } from "vitest/config";

     export default defineConfig({
       test: {
         projects: [
           {
             test: {
               name: "jsdom",
               environment: "jsdom",
               include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
               exclude: ["**/*.browser.test.*", "**/node_modules/**"],
             },
           },
           {
             test: {
               name: "browser",
               include: ["src/**/*.browser.test.{ts,tsx}"],
               browser: {
                 enabled: true,
                 headless: true,
                 provider: playwright({
                   launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] },
                 }),
                 instances: [{ browser: "chromium" }],
               },
             },
           },
         ],
       },
     });
     ```
   - `package.json` 的 `scripts` 加兩條：`test` 是 `vitest run --project jsdom`，`test:browser` 是 `vitest run --project browser`。
   - 測試：
     - 新增 `src/test/env.test.ts`，案例：`document.createElement("div")` 是 `HTMLDivElement`；`new Blob(["a"]).size === 1`。
     - 新增 `src/test/env.browser.test.ts`，案例：
       - `document.createElement("canvas").getContext("webgl2")` 不是 null；
       - `typeof VideoDecoder === "function"`；
       - `typeof VideoEncoder === "function"`；
       - `typeof AudioDecoder === "function"`。
   - verify：`pnpm exec playwright install chromium && pnpm test && pnpm test:browser && pnpm check`
   - commit：`test(scaffold): run vitest in jsdom and headless chromium`

phase 結尾 verify：`pnpm test && pnpm test:browser && pnpm check`

## Phase 02 — 發佈閘門

blocker：Phase 01；model：sonnet。

1. 入口檢查。
   - 執行 `pnpm add -D es-module-lexer@^3.0.3`。
   - 新增 `scripts/check-entry-deps.mjs`，規則見契約的「入口檢查」，匯出以下符號：
     - `export const FORBIDDEN = [/^@excalidraw\//, /^mediabunny$/, /^react-markdown$/, /^remark-/, /^rehype-/, /^unified$/, /^fflate$/]`。
     - `export const MAX_BYTES = 65536`。
     - `export async function staticGraph(entryFile)`，回傳 `{ files: string[], bare: { specifier: string, from: string }[], bytes: number }`。
       - 用 `es-module-lexer` 的 `init` 與 `parse` 解析每個檔，一律不用 regex。
       - 只看 `d === -1` 的 import，也就是靜態 import 與 `export … from`。
       - specifier 以 `./` 或 `../` 開頭的，相對於所在的檔 resolve，再遞迴往下走；其他的 specifier 收進 `bare`。
     - `export function findViolations(graph)`，回傳 `string[]`：
       - 每個符合 `FORBIDDEN` 的 bare specifier 一行，寫成 `"<specifier> imported by <from>"`；
       - `bytes > MAX_BYTES` 時再多一行 `"entry graph is <bytes> bytes, limit <MAX_BYTES>"`。
     - 直接執行時（判斷式 `import.meta.url === pathToFileURL(process.argv[1]).href`）：
       - 對 `dist/index.js` 跑 `staticGraph` 與 `findViolations`；
       - 有違規就逐行印到 stderr，然後 `process.exit(1)`；
       - 沒有違規就印 `entry graph ok: <files.length> files, <bytes> bytes`。
   - `package.json` 的 `check:entry` 改成 `tsdown && node scripts/check-entry-deps.mjs`。
   - `turbo.json` 的 `tasks["check:entry"]` 改成 `{ "inputs": ["src/**", "tsdown.config.ts", "scripts/check-entry-deps.mjs"] }`，也就是拿掉 `cache: false`。
   - 測試：新增 `scripts/check-entry-deps.test.mjs`。`vitest.config.ts` 的 `jsdom` project 已經 include `scripts/**/*.test.mjs`（P01-3 加的），所以 `pnpm test` 會跑到它。
     - 第一行是 `// @vitest-environment node`。
     - 每個案例在 `fs.mkdtempSync(path.join(os.tmpdir(), "fv-entry-"))` 底下寫假的 dist 檔，再對它跑 `staticGraph` 與 `findViolations`。
     - 案例：
       - `index.js` 靜態 import `./chunk.js`，`chunk.js` 再 `import "mediabunny"`：違規一行，內容含 `mediabunny` 與 `chunk.js`；
       - `index.js` 寫 `import("mediabunny")`：沒有違規；
       - `index.js` 寫 `export * from "./x.js"`，`x.js` 再 `import "fflate"`：抓到 `fflate`；
       - `index.js` 有 70000 bytes：違規一行，內容含 `limit 65536`；
       - `index.js` 只 import `react`：沒有違規。
   - verify：`pnpm test scripts/check-entry-deps.test.mjs && pnpm check`
   - commit：`build(scaffold): fail the check when the main entry statically imports a heavy dependency`
2. verify:pack。
   - 新增 `scripts/verify-pack.mjs`：整份複製 `../ui/scripts/verify-pack.mjs`，只改下面兩處，其餘逐字保留。
     - `mkdtempSync` 的前綴從 `anyknown-ui-pack-` 改成 `anyknown-file-viewer-pack-`。
     - symlink 的位置不再寫死 `@anyknown/ui`。在讀完 tarball 裡的 `package.json` 拿到 `name` 之後，再建 `join(consumer, "node_modules", ...name.split("/"))` 的父目錄並建 symlink。原檔先 symlink、後讀 `name`，這裡要把順序調過來。
   - `package.json` 的 `scripts` 加兩條：
     - `verify:pack` 是 `pnpm build && node scripts/verify-pack.mjs`；
     - `prepublishOnly` 是 `pnpm check && pnpm test && pnpm test:browser && pnpm verify:pack && pnpm check:licenses`。`check:licenses` 會在 P02-3 才加，本步的 verify 不會跑到 `prepublishOnly`。
   - 測試：無，這個 script 本身就是驗證。
   - verify：`pnpm verify:pack 2>&1 | tail -n 1 | grep -q "all 8 export entries resolve"`
   - commit：`build(scaffold): resolve every export from the packed tarball`
3. 授權檢查與 third-party notices。
   - 新增 `scripts/check-licenses.mjs`，規則見契約的「授權檢查」，匯出兩個符號：
     - `export const ALLOWED = ["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD"]`。
     - `export function checkLicenses(report, deps, notices)`，回傳 `string[]`，每個問題一行：
       - `report` 是 `pnpm licenses list --prod --json` parse 之後的物件，空的時候傳 `{}`；
       - `deps` 是 `Object.keys(pkg.dependencies ?? {})`；
       - `notices` 是 `THIRD_PARTY_NOTICES.md` 的全文。
   - 直接執行時（判斷式同 `scripts/check-entry-deps.mjs`）：
     - 用 `execFileSync("pnpm", ["licenses", "list", "--prod", "--json"])` 取得報告；輸出去掉空白後是空字串，或是以 `No licenses` 開頭，就當成 `{}`；
     - 有問題就逐行印到 stderr，然後 exit 1；
     - 沒有問題就印 `licenses ok: <套件數> production packages`。
   - 新增 `THIRD_PARTY_NOTICES.md`（英文）。
     - 檔頭寫維護規則：「Whoever adds a production dependency adds its line here in the same commit. Upgrading mediabunny updates its version and source URL here in the same commit.」
     - 第一段 `## Code copied into this package`：內容是 `None yet. Each entry lists the upstream repository, commit, copied paths and the full MIT license text.`
     - 第二段 `## Runtime dependencies`：內容是 `None yet.`
   - `package.json` 的 `scripts` 加 `check:licenses`，內容照契約。
   - `turbo.json` 的 `tasks` 加 `"check:licenses": { "inputs": ["package.json", "pnpm-lock.yaml", "THIRD_PARTY_NOTICES.md", "scripts/check-licenses.mjs"] }`。
   - 測試：新增 `scripts/check-licenses.test.mjs`（`pnpm test` 由 `vitest.config.ts` 的 `jsdom` project 跑到它）。
     - 第一行是 `// @vitest-environment node`。
     - 案例：
       - `{ "GPL-3.0": [{ name: "x" }] }` 有一行問題；
       - `{ "MPL-2.0": [{ name: "mediabunny" }] }`，deps 與 notices 都有 mediabunny：沒有問題；
       - `{ "MPL-2.0": [{ name: "other" }] }` 有一行問題；
       - `{ "(MIT OR GPL-3.0)": [{ name: "y" }] }`：沒有問題；
       - deps 有 `zod`、notices 沒寫 `zod`：一行問題；
       - `{}`，deps 空：沒有問題。
   - verify：`pnpm test scripts && pnpm check:licenses && pnpm check`
   - commit：`build(scaffold): check production licenses against an allowlist and the notices file`

phase 結尾 verify：`pnpm test && pnpm test:browser && pnpm check && pnpm verify:pack && pnpm check:licenses`

## Phase 03 — 文件與 GitHub Actions

blocker：Phase 02；model：sonnet。

1. `CLAUDE.md`、`README.md`、`CHANGELOG.md`。
   - 新增 `CLAUDE.md`：給在本 repo 工作的 agent 看，中文，≤ 60 行。依序七段：
     1. 一句話定位：`@anyknown/file-viewer`，瀏覽器內檢視與編輯檔案的 React 元件庫；設計見 `docs/plans/00-overview.md`。
     2. 命令：把本檔契約的 scripts 表抄過去，拿掉「哪一步加」那一欄。
     3. 程式規則：
        - 檔案 ≤ 300 行，檔名 kebab-case，禁 `any`；
        - React 禁 `useEffect`，改用 ref callback 加 cleanup、或事件處理器；
        - 動畫不回彈；
        - 樣式只用 `--ak-*` CSS 變數加 plain CSS；互動元件用 `@base-ui/react`；不用 StyleX、Tailwind、shadcn；
        - 本套件不發任何網路請求，不開 `blob:` worker；
        - `src/**` 不 import 任何 `@anyknown/*`。
     4. 入口與 subpath：
        - `src/index.ts` 不得靜態 import 重依賴，要用 `import()` 按需載入（`pnpm check` 的 `check:entry` 會擋）；
        - 新增 subpath 要在同一個 commit 改 `package.json` 的 `exports`、`tsdown.config.ts` 的 `entry`、`src/<subpath>/index.ts`。
     5. 依賴：加 production 依賴時，同一個 commit 在 `THIRD_PARTY_NOTICES.md` 加一列；抄進來的程式在檔頭寫來源路徑、commit、MIT。
     6. Commits：逐字複製 `../ui/CLAUDE.md` 的 `## Commits` 段（英文原文），再加一行「plan 名當 scope」。
     7. Plans 與輸出：
        - plan 規則見 `docs/plans/README.md`；
        - build / test 的輸出導到 scratchpad 或 `/tmp`，不寫進 repo。
   - 新增 `README.md`：英文，寫給 npm 與 GitHub 的讀者。依序五段：
     1. 標題 `# @anyknown/file-viewer`，加一段定位，改寫自 00-overview 開頭引言的「一句話」。
     2. `## Status`：寫明 0.0.x 只用來佔住套件名稱、還沒有 API，第一個能用的版本是 0.1.0。
     3. `## Planned formats`：表格，內容取自 00-overview §5 的 v0.1 表，翻成英文。
     4. `## Development`：命令表，同 `CLAUDE.md` 第 2 段，翻成英文。
     5. `## Release` 與 `## License`：
        - Release 段改寫自 `../ui/README.md` 的 Release 段：tag `v*`、tag 必須與版本一致、trusted publishing、`npm publish` 而不是 `pnpm publish`、0.0.1 是手動發的；
        - License 段寫 MIT，並指向 `THIRD_PARTY_NOTICES.md`。
   - 新增 `CHANGELOG.md`：Keep a Changelog 格式，有 `## [Unreleased]`（內容空）與 `## [0.0.1] - 2026-10-08`（內容是 `Package name reserved. No API yet.`）。
   - 測試：無。
   - verify：`pnpm fmt:check && pnpm verify:pack`
   - commit：`docs(scaffold): add agent guide, readme and changelog`
2. CI 與 release workflow。
   - 新增 `.github/workflows/ci.yml`。
     - 先整份複製 `../ui/.github/workflows/ci.yml`。
     - 再把 `- run: pnpm install --frozen-lockfile` 之後的所有 step 換成下面三條（`verify:pack` 前那段註解照原檔保留）：
       - `pnpm exec playwright install --with-deps chromium`
       - `pnpm turbo run build typecheck lint fmt:check check:entry test test:browser check:licenses`
       - `pnpm verify:pack`
   - 新增 `.github/workflows/release.yml`：先整份複製 `../ui/.github/workflows/release.yml`，連註解一起抄，然後改三處：
     - 在 `- run: pnpm install --frozen-lockfile` 之後加一步 `- run: pnpm exec playwright install --with-deps chromium`。
     - `pnpm turbo run typecheck lint fmt:check test site:test` 改成 `pnpm turbo run typecheck lint fmt:check check:entry test test:browser check:licenses`。
     - 註解裡的 `@anyknown/ui` 改成 `@anyknown/file-viewer`，`anyknown-com/ui` 改成 `anyknown-com/file-viewer`，`v0.1.0 是本機手動發的` 改成 `v0.0.1 是本機手動發的`。
   - 測試：無。
   - verify：`actionlint .github/workflows/ci.yml .github/workflows/release.yml`
   - commit：`ci(scaffold): run checks, browser tests and pack verification; publish on v* tags`

phase 結尾 verify：`pnpm test && pnpm test:browser && pnpm check && pnpm verify:pack && pnpm check:licenses && actionlint .github/workflows/*.yml`

## Phase 04 — GitHub repo 與 npm 首發

blocker：Phase 03；model：主 agent 做（建 repo、設 secret、發 npm 都是對外、不可逆的動作，不交給 subagent）。

1. 建 public repo 並推上去。
   - 依序執行：
     - `gh repo create anyknown-com/file-viewer --public --source=. --remote=origin --description "View and edit files in the browser: bytes in, Blob out, no server."`
     - `gh secret set TURBO_TOKEN -R anyknown-com/file-viewer < ~/.anyknown/turbo-token`
     - `git push -u origin main`
   - verify：等 CI 跑完，用一次阻塞等待，不要輪詢：

     ```
     gh run watch --exit-status $(gh run list -R anyknown-com/file-viewer -L 1 --json databaseId -q '.[0].databaseId') -R anyknown-com/file-viewer
     ```

     - CI 綠了，就表示 ubuntu 上的 headless Chromium 拿得到 WebGL2 和 WebCodecs。
     - 如果紅在 `src/test/env.browser.test.ts`：修 `vitest.config.ts` 裡的 launch args，用 `fix(scaffold)` commit 推上去，再等一次。不要把這件事延到後面的 plan。
   - commit：無。這一步只推 Phase 01–03 的 commits。
2. npm 首發 0.0.1，並綁 trusted publisher。
   - 確認登入：執行 `npx -y npm@latest whoami`，結果要是 `anyknown-admin`。如果還沒登入，請 CEO 執行 `npm login`，只有 CEO 能做。
   - 發佈：執行 `npx -y npm@latest publish --access public`。
     - 發佈前 `prepublishOnly` 會先把整個 gate 跑一遍。
     - 帳號有 2FA，指令會印出一個網址。請 CEO 在已登入 npm 的瀏覽器打開完成驗證，只有 CEO 能做。
   - 綁 trusted publisher：執行 `npx -y npm@latest trust github @anyknown/file-viewer --file release.yml --repo anyknown-com/file-viewer --allow-publish -y`。
   - 不打 `v0.0.1` tag。打了的話，`release.yml` 會再發一次同一個版本，然後失敗。第一個由 tag 發的版本是 v0.1.0（04、05 完成之後）。
   - verify：`npm view @anyknown/file-viewer version`，結果要是 `0.0.1`。
   - commit：無。

## 之後再做

- docs 站、playground、`site:*` 命令，以及部署 `file-viewer.anyknown.com`：05 做。
- React、`@anyknown/ui` 的 peer 與 `@base-ui/react`：02 第一次用到時加。
- CI 上的 H.264 / AAC 編碼：Playwright 的 Chromium 不一定帶專有 codec。06 寫 codec 測試時再決定要不要用 `channel: "chrome"`。
- branch protection、CODEOWNERS、issue templates、Renovate：有外部貢獻者時再做。
- coverage 報告。
