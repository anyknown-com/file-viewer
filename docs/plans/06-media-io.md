# 06 media-io — 把 `ByteSource` 接進 mediabunny、把輸出收成 `Blob`，影片與音訊編輯器共用

狀態：planned（2026-10-08，CTO；內容搬自 storage `docs/plans/14-video-editor.md` §3 與 §5 第 4、5 步的 `src/editors/media/`，15 只是使用者）；blocker：02 contract 落地 `src/contract/byte-source.ts` 與 `src/contract/errors.ts` 的那一步（01 scaffold 全部做完）；model：sonnet；push：本 plan 做完一次。

## 判斷

- **一個內部模組 `src/media/`，沒有自己的 subpath。** 只有 07 video-editor 與 08 audio-editor 會 import 它（`import { openMedia } from "../media"`），`package.json` 的 `exports` 與 `tsdown.config.ts` 不動。mediabunny 只出現在這個目錄與兩個 editor 裡；`src/index.ts`（`.` 入口）不得 import `src/media/index.ts`，`scripts/check-entry-deps.mjs` 會擋。唯一給入口用的是 `src/media/support.ts`：它不 import mediabunny，03 的「編輯」按鈕可以直接 import 這個檔（不經 `index.ts`）。
- **mediabunny 鎖 1.61.1。** 本 plan 的 API 都對著 1.61.1 的 `dist/mediabunny.d.ts` 與 `src/target.ts` 核過（storage 14 寫的也是這一版）。今天 npm 的 latest 是 1.61.3，升版另開一個 commit，同時改 `THIRD_PARTY_NOTICES.md`。MPL-2.0：原封不動當 npm 依賴，不改、不抄、不 patch（00-overview §2）。它帶兩個 runtime 依賴 `@types/dom-webcodecs`、`@types/dom-mediacapture-transform`（MIT），型別會和 TS 自帶的 DOM lib 重複宣告，01 的 `skipLibCheck: true` 會蓋掉，不另外處理。
- **輸入用 `CustomSource`，不用 mediabunny 的 `BlobSource`。** `ByteSource` 可能是宿主邊解密邊給的（E2EE），只有 `read(start, end, signal)` 一定有。`CustomSource({ getSize, read, prefetchProfile: "network" })`，`maxCacheSize` 用預設的 8 MiB（storage 14 §3）。一支 2 GiB 的影片同時只有幾十 MiB 在記憶體。
- **能不能解交給 mediabunny 的 `track.canDecode()`。** 它在 1.61.1 的行為：PCM（WAV）自己解，所有環境都回 true；其他 codec 沒有 `VideoDecoder` / `AudioDecoder` 就回 false，有的話問 `isConfigSupported`。所以「解不了」再分兩種錯誤碼：沒有 decoder API 的是 `webcodecs_unavailable`，有 API 但不支援這個 codec 的是 `codec_unsupported`（例如 Firefox 的 HEVC）。影片的聲音解不了時，只把 `audio` 設成 `null`，不算錯；07 把它當成無聲片段。
- **輸出用 `StreamTarget` 接自己的 `WritableStream`（`blob-sink.ts`），不用 `BufferTarget`，也不用 `AppendOnlyStreamTarget`。** `BufferTarget` 會把整個檔放在一塊 `ArrayBuffer` 裡。`AppendOnlyStreamTarget` 只能往後寫，但 WAV 與非 fragmented MP4（08 的 `.m4a`）收尾時要回頭改檔頭。sink 的做法照 storage 14 §3：檔頭 1 MiB 一直留在記憶體；之後的資料先累積，每滿 64 MiB 就封成一個 `Blob`，但最後至少 64 KiB 不封，這樣 fragmented MP4 收尾改 mfra 最後 4 bytes 時，那個位置一定還沒封；最後把全部片段組成一個 `Blob`。覆寫只准落在檔頭或還沒封的尾段，其他位置直接丟錯。`StreamTarget` 用預設的非 chunked 模式。mediabunny 會自己補零填空洞（`StreamTarget._write`），所以寫入位置超過目前大小是不可能發生的；真的發生就丟錯，不補零。
- **`maxOutputBytes` 在 sink 裡硬擋。** 開始前估大小、擋按鈕是 07 / 08 的事（各格式的估法不同）；sink 這邊再擋一道：寫入的結尾超過上限就丟 `ViewerError("output_too_large")`。mediabunny 會把這個寫入錯誤記下來，在下一次 flush 時丟出來（`StreamTarget._writeError`），所以它會從 `add()` / `finalize()` 冒出來，editor 不會呼叫 `onSave`。
- **錯誤碼只用 00-overview §3 已有的 `ViewerErrorCode`，不加新碼。** 錯誤訊息的 i18n key 由 02 為每個碼各定一個，本 plan 不加 key。abort 不轉成 `ViewerError`，直接丟 `signal.reason`，呼叫端照慣例忽略 abort。
- **測試分兩層。** Node 環境（`// @vitest-environment node`，jsdom 的 `Blob` 不可靠）跑解析、錯誤碼、sink 與 WAV 來回，用 `vi.stubGlobal` 模擬「有 decoder API 但不支援」。Chromium（`*.browser.test.ts`）跑真的 WebCodecs 編碼後再讀回來。編碼器用 VP9 放進 MP4 容器：playwright 的 Chromium 不一定有 H.264 / AAC 編碼器，而這裡要驗的是容器的回頭寫（mfra 與 mdat 檔頭），不是 codec。H.264 輸出由 07 在三個真瀏覽器上驗。
- **AAC 的 encoder priming 由 `src/media/aac-track.ts` 的 `addAacTrack` 處理。** Chromium 的 AAC encoder 在開頭加 2112 個 priming frames，mediabunny 1.61.1 的 `AudioSampleSource` / `AudioBufferSource` 不扣，檔案會多約 44 ms 靜音。07 / 08 的 AAC 改用 `EncodedAudioPacketSource` 加自己的 `AudioEncoder`：每個 packet 往前平移 priming（mediabunny 把負的起點寫成 elst），最後一個 packet 的 `duration` 裁到最後一個輸入 frame；`aac-track.browser.test.ts` 驗開頭 ≤ 1 ms、長度差 ≤ 1 個 AAC frame。Opus 不經它（Ogg 本來就對）。
- 宿主的事（H1，storage `docs/plans/22-file-viewer-host.md` Phase 2）：SDK `files.reader` 包成 `ByteSource`（`vaultSource`）、Blob 上傳只用 `slice`、用配額算 `maxOutputBytes`。本 plan 不碰。

## 契約

全部在 `src/media/`，`src/media/index.ts` 只 re-export（`support.ts` 不經它）。用到的 02 符號（簽名以 00-overview §3 / §9.1 為準）：`ByteSource`（`read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>>`、`size: number`）、`blobSource(blob: Blob)`、`bytesSource(bytes: Uint8Array<ArrayBuffer>)`（皆在 `src/contract/byte-source.ts`），`ViewerError`（`new ViewerError(code, { message?, cause? })`，`.code`、`.cause`）、`ViewerErrorCode`、`isAbortError(e: unknown): boolean`（皆在 `src/contract/errors.ts`）。

```ts
// src/media/support.ts（入口可用：不 import mediabunny）
export function hasVideoCodecs(): boolean; // typeof VideoDecoder === "function" && typeof VideoEncoder === "function"

// src/media/media-error.ts（error 是 abort 時原樣 throw，不回傳）
export function toMediaError(error: unknown, fallback: ViewerErrorCode): ViewerError;

// src/media/source.ts
export function mediaSource(source: ByteSource, signal?: AbortSignal): CustomSource;

// src/media/open-media.ts
export type MediaNeed = "video" | "audio";
export type OpenedMedia = {
  input: Input;                     // mediabunny Input，07 / 08 從它建 CanvasSink、AudioBufferSink、AudioSampleSink
  video: InputVideoTrack | null;    // need = "video" 時一定不是 null；need = "audio" 時一定是 null
  audio: InputAudioTrack | null;    // 解得了才有；need = "audio" 時一定不是 null
  duration: number;                 // 秒，input.computeDuration()
  dispose(): void;                  // input.dispose() 並拿掉 abort listener
};
export function openMedia(source: ByteSource, need: MediaNeed, signal?: AbortSignal): Promise<OpenedMedia>;

// src/media/blob-sink.ts
export type SinkLayout = { headBytes: number; sealBytes: number; keepBytes: number };
export const DEFAULT_LAYOUT: SinkLayout; // { headBytes: 1 MiB, sealBytes: 64 MiB, keepBytes: 64 KiB }
export type BlobSink = {
  readonly writable: WritableStream<StreamTargetChunk>; // 交給 new StreamTarget(sink.writable)
  readonly size: number;                                // 目前寫到的最大結尾
  toBlob(mime: string): Blob;                           // writable 關掉（output.finalize() 完成）之後才可以叫
};
export function createBlobSink(options?: { maxBytes?: number }, layout?: SinkLayout): BlobSink;
```

錯誤碼對照（`openMedia` 與 sink 會丟的）：

| 情況 | code |
| --- | --- |
| 容器認不得（mediabunny `UnsupportedInputFormatError`），或沒有要的軌（need 是 video 但沒有影片軌、need 是 audio 但沒有音訊軌） | `unsupported` |
| 要的軌 `canDecode()` 是 false，而且對應的 `VideoDecoder` / `AudioDecoder` 存在 | `codec_unsupported` |
| 要的軌 `canDecode()` 是 false，而且對應的 decoder API 不存在 | `webcodecs_unavailable` |
| `ByteSource.read` 丟錯（不是 abort） | `read_failed` |
| 開檔時的其他錯誤 | `decode_failed` |
| sink 收到結尾超過 `maxBytes` 的寫入 | `output_too_large` |
| `signal` abort | 不轉，丟 `signal.reason` |

07 / 08 在播放與輸出時遇到的錯誤，用 `toMediaError(e, "decode_failed")` 轉。

## Phase 01 — 讀進來、寫出去

blocker：02 的 `src/contract/byte-source.ts` 與 `src/contract/errors.ts` 已落地；01 全部做完；model：sonnet。

1. 加 mediabunny、錯誤轉換與 WebCodecs 檢查。
   - 執行 `pnpm add mediabunny@1.61.1 --save-exact`。`package.json` 的 `dependencies` 會出現 `"mediabunny": "1.61.1"`，`pnpm-lock.yaml` 也會跟著改。
   - 改 `THIRD_PARTY_NOTICES.md` 的「Runtime dependencies」段。如果內容還是「None yet.」，換成下面這一列；否則照字母順序插入這一列：`- mediabunny 1.61.1 — MPL-2.0 — used unmodified as an npm dependency; source: https://github.com/Vanilagy/mediabunny/tree/v1.61.1`
   - 新增 `src/media/media-error.ts`，匯出 `toMediaError(error: unknown, fallback: ViewerErrorCode): ViewerError`，依序判斷：
     - `isAbortError(error)`（從 `src/contract/errors.ts` import）為真，就 `throw error`（abort 原樣丟，不轉）；
     - 沿著 `error`、`error.cause`、`error.cause.cause`…往下找，找到第一個 `instanceof ViewerError` 的就原樣回傳；
     - `error instanceof UnsupportedInputFormatError`（從 `"mediabunny"` import）回 `new ViewerError("unsupported", { cause: error })`；
     - 其他情況回 `new ViewerError(fallback, { cause: error })`。
     - `ViewerError`、`ViewerErrorCode`、`isAbortError` 從 `src/contract/errors.ts` import。
   - 新增 `src/media/support.ts`，匯出 `hasVideoCodecs(): boolean`，內容是 `typeof VideoDecoder === "function" && typeof VideoEncoder === "function"`。這個檔不准 import 任何東西。
   - 新增 `src/media/index.ts`，只寫 `export { toMediaError } from "./media-error";`。
   - 測試：
     - 新增 `src/media/media-error.test.ts`（jsdom），五案：`new DOMException("x", "AbortError")` 被 `toMediaError(e, "decode_failed")` 原樣 throw（`expect(() => …).toThrow(e)` 且丟出的是同一個物件）；`ViewerError` 原樣回傳（同一個 instance）；`new Error("x", { cause: new ViewerError("read_failed", { cause: 1 }) })` 回傳裡面那個 `ViewerError`；`new UnsupportedInputFormatError()` 回 code `unsupported`，`cause` 是原物件；`"boom"` 字串回 fallback code，`cause` 是 `"boom"`。
     - 新增 `src/media/support.test.ts`（jsdom），三案：什麼都沒 stub 時回 false；用 `vi.stubGlobal` 把 `VideoDecoder`、`VideoEncoder` 都設成 `function () {}` 時回 true；只 stub `VideoDecoder` 時回 false。每案後面 `vi.unstubAllGlobals()`。
   - verify：`pnpm test src/media && pnpm check:licenses && pnpm check`
   - commit：`feat(media-io): add mediabunny and map media errors to viewer error codes`

2. 把 `ByteSource` 接成 mediabunny 的 `Input`，開檔時檢查能不能解。
   - 新增 `src/media/source.ts`，匯出 `mediaSource(source: ByteSource, signal?: AbortSignal): CustomSource`，回傳 `new CustomSource({ getSize: () => source.size, read: (start, end) => source.read(start, end, signal).catch((e) => { throw signal?.aborted ? e : toMediaError(e, "read_failed"); }), prefetchProfile: "network" })`。`CustomSource` 從 `"mediabunny"` import，`ByteSource` 從 `src/contract/byte-source.ts` import，`toMediaError` 從 `src/media/media-error.ts` import。不設 `maxCacheSize`，用預設的 8 MiB。
   - 新增 `src/media/open-media.ts`，匯出型別 `MediaNeed`、`OpenedMedia`（形狀見契約），以及 `openMedia(source, need, signal?)`。流程：
     1. 先 `signal?.throwIfAborted()`。
     2. 建 `input = new Input({ formats: ALL_FORMATS, source: mediaSource(source, signal) })`（`Input`、`ALL_FORMATS` 從 `"mediabunny"` import）。
     3. 掛 `onAbort = () => input.dispose()` 到 `signal` 的 `abort`（`{ once: true }`）。
     4. need 是 `"video"`：`video = await input.getPrimaryVideoTrack()`，`null` 就丟 `new ViewerError("unsupported")`；`await video.canDecode()` 是 false，就在 `typeof VideoDecoder === "undefined"` 時丟 `webcodecs_unavailable`，否則丟 `codec_unsupported`。接著 `a = await input.getPrimaryAudioTrack()`，`a` 不是 null 而且 `await a.canDecode()` 是 true 才放進 `audio`，否則 `audio = null`。
     5. need 是 `"audio"`：`audio = await input.getPrimaryAudioTrack()`，`null` 就丟 `unsupported`；`canDecode()` 是 false，就在 `typeof AudioDecoder === "undefined"` 時丟 `webcodecs_unavailable`，否則丟 `codec_unsupported`。`video = null`，不查影片軌。
     6. `duration = await input.computeDuration()`。
     7. 回傳 `{ input, video, audio, duration, dispose }`。`dispose` 會 `signal?.removeEventListener("abort", onAbort)` 再 `input.dispose()`。成功回傳後 listener 留著，元件卸載時 abort 同一個 signal 就會關掉 input。
     8. 第 4–6 小步包在 try 裡。catch 時先 `input.dispose()` 並拿掉 listener，然後 `signal?.aborted` 為真就丟 `signal.reason`，否則丟 `toMediaError(e, "decode_failed")`。
   - `src/media/index.ts` 加兩行：`export { mediaSource } from "./source";`、`export { openMedia, type MediaNeed, type OpenedMedia } from "./open-media";`。
   - fixture（在本機用 ffmpeg 產生後 commit，不會進發佈的套件，因為 `files` 只有 `dist`）：
     - `src/media/fixtures/clip-1s.mp4`：64×64 的 H.264 加單聲道 AAC，1 秒。產生命令：`ffmpeg -y -f lavfi -i testsrc=size=64x64:rate=10:duration=1 -f lavfi -i sine=frequency=440:duration=1 -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 32k -ac 1 -shortest -movflags +faststart src/media/fixtures/clip-1s.mp4`
     - `src/media/fixtures/tone-1s.wav`：8 kHz 單聲道 16-bit PCM，1 秒。產生命令：`ffmpeg -y -f lavfi -i sine=frequency=440:duration=1 -ac 1 -ar 8000 -c:a pcm_s16le src/media/fixtures/tone-1s.wav`
   - 測試：新增 `src/media/open-media.test.ts`，檔頭寫 `// @vitest-environment node`。fixture 用 `readFileSync(new URL("./fixtures/<名字>", import.meta.url))` 讀，再用 `bytesSource(new Uint8Array(buf))` 包。每案後面 `vi.unstubAllGlobals()`。十案：
     1. `tone-1s.wav` 用 `"audio"` 開：`audio` 不是 null，`video` 是 null，`|duration − 1| < 0.01`。
     2. `clip-1s.mp4` 用 `"video"` 開（Node 沒有 `VideoDecoder`）：reject，code 是 `webcodecs_unavailable`。
     3. `clip-1s.mp4` 用 `"video"` 開，先 `vi.stubGlobal("VideoDecoder", { isConfigSupported: async () => ({ supported: false }) })`：code 是 `codec_unsupported`。
     4. `clip-1s.mp4` 用 `"video"` 開，`VideoDecoder` stub 成 `{ isConfigSupported: async () => ({ supported: true }) }`，不 stub `AudioDecoder`：`video` 不是 null，`audio` 是 null（AAC 解不了就丟掉聲音，不算錯）。
     5. `clip-1s.mp4` 用 `"audio"` 開（Node 沒有 `AudioDecoder`）：code 是 `webcodecs_unavailable`。
     6. `bytesSource(new TextEncoder().encode("not media at all"))` 用 `"video"` 開：code 是 `unsupported`。
     7. `tone-1s.wav` 用 `"video"` 開：code 是 `unsupported`（沒有影片軌）。
     8. `read` 一律 reject `new Error("disk gone")` 的 `ByteSource`（`size: 1000`）：code 是 `read_failed`，沿著 `cause` 鏈找得到那個 `Error("disk gone")`。
     9. abort：`read` 會一直等到 signal abort 才 reject 的 `ByteSource`。開檔後 abort controller，reject 的值要 `=== controller.signal.reason`。
     10. 已經 abort 的 signal：直接 reject `signal.reason`，`read` 一次都沒被叫。
   - verify：`pnpm test src/media/open-media.test.ts && pnpm check`
   - commit：`feat(media-io): open a byte source as a mediabunny input and check decodability`

3. 把 `StreamTarget` 的輸出收成 `Blob`。
   - 新增 `src/media/blob-sink.ts`，匯出 `SinkLayout`、`DEFAULT_LAYOUT = { headBytes: 1024 * 1024, sealBytes: 64 * 1024 * 1024, keepBytes: 64 * 1024 }`、`BlobSink`、`createBlobSink(options = {}, layout = DEFAULT_LAYOUT)`。`StreamTargetChunk` 用 `import type` 從 `"mediabunny"` 引入。內部狀態：
     - `head = new Uint8Array(layout.headBytes)`：位置 `[0, headBytes)`。
     - `sealed: Blob[]`，以及 `tailStart`：初始值是 `headBytes`，代表第一個還沒封的位置。
     - `tail`：可以長大的 `Uint8Array`，容量不夠時倍增；`tailLen` 是 `tail` 裡用到的長度。
     - `size`：目前寫到的最大結尾。
     - `closed`。
   - `writable = new WritableStream<StreamTargetChunk>({ write, close })`。`write({ data, position })` 的規則，照順序判斷：
     1. `end = position + data.byteLength`。`options.maxBytes` 有給而且 `end > maxBytes`，丟 `new ViewerError("output_too_large")`。
     2. `position > size` 丟 `Error("blob-sink: write past end")`。
     3. 落在 `[0, headBytes)` 的部分寫進 `head`。
     4. 剩下的部分如果起點小於 `tailStart`（也就是落在已經封好的範圍），丟 `Error("blob-sink: write into sealed range")`；否則寫進 `tail` 的 `position − tailStart`，必要時擴容，然後更新 `tailLen`。
     5. `size = max(size, end)`。
     6. 只要 `tailLen ≥ sealBytes + keepBytes`，就把 `tail` 的前 `sealBytes` 封成 `new Blob([tail.slice(0, sealBytes)])` 推進 `sealed`，剩下的往前搬，`tailStart += sealBytes`、`tailLen −= sealBytes`。
   - `close()` 把 `closed` 設成 true。
   - `toBlob(mime)`：`closed` 是 false 就丟 `Error("blob-sink: not closed")`。否則回 `new Blob([head.slice(0, min(size, headBytes)), ...sealed, tail.slice(0, tailLen)], { type: mime })`。
   - `size` 用 getter 讀。
   - `src/media/index.ts` 加一行：`export { createBlobSink, DEFAULT_LAYOUT, type BlobSink, type SinkLayout } from "./blob-sink";`。
   - 測試：新增 `src/media/blob-sink.test.ts`，檔頭寫 `// @vitest-environment node`。除了第 1 案，layout 都用 `{ headBytes: 16, sealBytes: 32, keepBytes: 8 }`。寫入走 `sink.writable.getWriter()` 的 `write({ type: "write", data, position })`，最後 `close()`。每案都同時寫一份參考 `Uint8Array`，比對 `new Uint8Array(await sink.toBlob("x/y").arrayBuffer())`。十一案：
     1. `DEFAULT_LAYOUT` 等於 `{ headBytes: 1048576, sealBytes: 67108864, keepBytes: 65536 }`。
     2. 每次 7 bytes、從 0 循序寫到 100 bytes：內容與參考相同，`blob.type` 是 `"x/y"`，`size` 是 100。
     3. 寫到 100 bytes 之後，在位置 4 覆寫 4 bytes（檔頭內）：成功，內容與參考相同。
     4. 寫到 100 bytes 之後，覆寫最後 4 bytes（還沒封的尾段）：成功，內容與參考相同。
     5. 寫到 56 bytes（16 + 32 + 8，剛好觸發一次封存）之後，在位置 20 寫入：reject，訊息含 `sealed`。
     6. 寫到 55 bytes（還沒封）之後，在位置 20 寫入：成功。
     7. 在位置 10 寫 12 bytes（跨過檔頭邊界）：內容與參考相同。
     8. 從 40 寫 30 bytes 到 70（這一筆觸發封存，跨過封存點）之後，覆寫位置 66–69：成功，內容與參考相同。
     9. 寫到 10 bytes 之後，在位置 12 寫入：reject，訊息含 `past end`。
     10. `createBlobSink({ maxBytes: 50 }, layout)`：寫到結尾剛好 50 成功；再寫 1 byte 時 reject，錯誤是 `ViewerError`，code 是 `output_too_large`。
     11. 還沒 `close()` 就叫 `toBlob`：丟錯，訊息含 `not closed`。
   - verify：`pnpm test src/media/blob-sink.test.ts && pnpm check`
   - commit：`feat(media-io): collect stream target output into a blob without one big buffer`

4. 用 mediabunny 真的寫出來再讀回去（WAV 在 Node 跑，MP4 在 Chromium 跑）。
   - 新增 `src/media/round-trip.test.ts`，檔頭寫 `// @vitest-environment node`。一案：
     - `sink = createBlobSink({}, { headBytes: 64, sealBytes: 256, keepBytes: 64 })`（`src/media/blob-sink.ts`）。
     - `output = new Output({ format: new WavOutputFormat(), target: new StreamTarget(sink.writable) })`；`src = new AudioSampleSource({ codec: "pcm-s16" })`；`output.addAudioTrack(src)`；`await output.start()`。
     - 8 次 `await src.add(new AudioSample({ data: <1000 個 frame 的 Float32Array 正弦波>, format: "f32-planar", numberOfChannels: 1, sampleRate: 8000, timestamp: i * 0.125 }))`，然後 `await output.finalize()`。以上 mediabunny 的名字都從 `"mediabunny"` import。
     - 斷言：`sink.size > 64 + 256 + 64`（證明真的封存過）；`blob = sink.toBlob("audio/wav")` 的前 4 bytes 是 `RIFF`；`m = await openMedia(blobSource(blob), "audio")`（`src/media/open-media.ts`、`src/contract/byte-source.ts`）得到 `|m.duration − 1| < 1 / 8000`；`m.dispose()`。
     - 這一案證明收尾回頭改 RIFF 與 data 長度時，位置落在檔頭內。
     - 預設：如果 Node 下 `AudioSample` 或 `AudioSampleSource` 丟錯，把這一案原封不動搬進下一個檔，當成第 3 案。
   - 新增 `src/media/round-trip.browser.test.ts`（Chromium）。共用一個 helper `encodeClip(fastStart)`：
     - `OffscreenCanvas(128, 128)`；`CanvasSource(canvas, { codec: "vp9", quality: QUALITY_HIGH })`；`Output({ format: new Mp4OutputFormat({ fastStart }), target: new StreamTarget(sink.writable) })`。
     - sink 用 `createBlobSink({}, { headBytes: 1024, sealBytes: 4096, keepBytes: 1024 })`。
     - 60 幀、30 fps，每幀用 `ctx.fillRect` 畫隨機顏色的 8×8 方格，`await source.add(i / 30, 1 / 30)`，最後 `finalize()`。
     - 回傳 `sink`。
     - 前置斷言 `await canEncodeVideo("vp9")` 是 true（從 `"mediabunny"` import）。
     - 三案：
       1. `fastStart: "fragmented"`：`sink.size > 6144`；`openMedia(blobSource(sink.toBlob("video/mp4")), "video")` 的 `video` 不是 null，`|duration − 2| < 1 / 30`。
       2. `fastStart: false`：條件與第 1 案相同。這一案證明 mdat 檔頭的回頭寫落在檔頭內。
       3. `createBlobSink({ maxBytes: 2048 }, …)` 跑 `fastStart: "fragmented"`：`add` 或 `finalize` reject，`toMediaError(e, "decode_failed").code` 是 `output_too_large`（`src/media/media-error.ts`）。
   - verify：`pnpm test src/media && pnpm test:browser src/media/round-trip.browser.test.ts && pnpm check`
   - commit：`test(media-io): round-trip wav and mp4 through the blob sink`

phase 結尾的 verify：`pnpm test && pnpm test:browser && pnpm check && pnpm check:licenses`

## 之後再做

- 用 HTTP Range 實作的 `urlSource`（00-overview §5 的「之後」）。
- 輸出大小的估算 helper：各格式的算法在 07 / 08，等第三個使用者出現再抽出來。
- 超過 2 GiB 的輸出、邊編碼邊交給宿主（要宿主的上傳能吃串流，H1 的事）。
- 把 mediabunny 升到 1.61.3 以上：另開一個 commit，同時改 `THIRD_PARTY_NOTICES.md`。
- H.264 / AAC 的編解碼在 CI 裡驗：要換成有 proprietary codecs 的 Chrome channel，07 驗收時再看要不要做。
