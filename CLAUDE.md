# @anyknown/file-viewer

瀏覽器內檢視與編輯檔案的 React 元件庫：丟進 bytes，存檔時交回 `Blob`，不連任何伺服器。設計見 `docs/plans/00-overview.md`。

## 命令

| script | 內容 |
| --- | --- |
| `build` | `tsdown` |
| `typecheck` | `tsc --noEmit && tsc --noEmit -p tsconfig.comp.json` |
| `lint` | `oxlint` |
| `fmt` / `fmt:check` | `oxfmt` / `oxfmt --check` |
| `check:entry` | `tsdown && node scripts/check-entry-deps.mjs` |
| `check` | `turbo run typecheck lint fmt:check check:entry` |
| `test` | `vitest run --project jsdom` |
| `test:browser` | `vitest run --project browser` |
| `verify:pack` | `pnpm build && node scripts/verify-pack.mjs` |
| `prepublishOnly` | `pnpm check && pnpm test && pnpm test:browser && pnpm verify:pack && pnpm check:licenses` |
| `check:licenses` | `node scripts/check-licenses.mjs` |

`pnpm test <path>` 與 `pnpm test:browser <path>` 只跑那個路徑底下的測試。改完檔案先跑 `pnpm fmt`。

## 程式規則

- 檔案 ≤ 300 行，檔名 kebab-case，禁 `any`。
- React 禁 `useEffect`，改用 ref callback 加 cleanup、或事件處理器。
- 動畫不回彈。
- 樣式只用 `--ak-*` CSS 變數加 plain CSS；互動元件用 `@base-ui/react`；不用 StyleX、Tailwind、shadcn。
- 本套件不發任何網路請求，不開 `blob:` worker。
- `src/**` 不 import 任何 `@anyknown/*`。

## 入口與 subpath

- `src/index.ts` 不得靜態 import 重依賴，要用 `import()` 按需載入（`pnpm check` 的 `check:entry` 會擋）。
- 新增 subpath 要在同一個 commit 改 `package.json` 的 `exports`、`tsdown.config.ts` 的 `entry`、`src/<subpath>/index.ts`。
- dynamic import 的目標檔不能叫 `index.*`（宿主的 chunk 會變成 `index-<hash>`，product 的 chunks-check 拒絕），要指向定義元件的檔本身；`check:entry` 會擋。

## 依賴

加 production 依賴時，同一個 commit 在 `THIRD_PARTY_NOTICES.md` 加一列；抄進來的程式在檔頭寫來源路徑、commit、MIT。

## Commits

- Commit messages are written in English.
- The title follows Conventional Commits: `<type>(<optional scope>): <summary>`, imperative mood, lower case, no trailing period, ≤ 72 characters.
- Types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`.
- A breaking change carries `!` after the type or scope and a `BREAKING CHANGE:` footer.
- One topic per commit.
- The plan name is the scope.

## Plans 與輸出

- plan 規則見 `docs/plans/README.md`。
- build / test 的輸出導到 scratchpad 或 `/tmp`，不寫進 repo。
