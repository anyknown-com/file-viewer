# 08 audio-editor — 單軌音訊剪輯：看波形、選範圍、修剪 / 分割 / 刪除、淡入淡出、音量與正規化、去掉靜音、循環播放，輸出成新檔

狀態：planned（2026-10-08；設計與選型照搬 storage 15，2026-10-05 CTO 定）；blocker：01 scaffold（`pnpm test` / `test:browser` / `check` / `build`）、02 contract（P01–P03 與 P04-1～P04-4）、03 viewer-core 第 8 步（`editors`、`EditorProps`）、06 media-io（P01-1～P01-3）；各 Phase 實際等哪一步見 Phase 開頭；model：Phase 01–02 sonnet、Phase 03–05 opus；push：整份做完一次（v0.2 等 07 也做完才發）。

執行方式：每一步交給一個獨立 subagent，只讀本檔頭部（到「形式」為止）和自己那一步，做完 commit 就停。步驟用到的跨步驟型別都定在「契約 · 本模組內部型別」，外部符號都在「契約 · 外部符號」（出處以 00-overview §9 為準）。

撞檔與先後：

- 07 video-editor 同時進行，兩邊只寫自己的目錄（`src/video-editor/`、`src/audio-editor/`）。共同會碰的只有 `package.json` 的 `exports`、`tsdown.config.ts` 的 `entry`、`src/styles.css`、`src/i18n/messages.ts`（`Messages` 加一行 `& AudioMessages`）、`src/viewer/editors.ts`（加 `audio` 一行）。都是追加，誰後到誰 rebase、兩邊都留。
- 不改 `src/media/`（06）、`src/contract/`（02）、`src/primitives/`（02）。本 plan 不在 `src/primitives/` 新增檔案；缺元件時停下回報主 agent，由 02 增補。外部符號跟下表不符時：照實際存在的名字改用，並在回報列出差異；實際不存在就停下回報，不自己補進別人的目錄。

宿主要做的事（不寫進 step）：H1 Phase 2 把 SDK 的 `files.reader` 包成 `ByteSource`（`vaultSource`）、用配額算 `maxOutputBytes`、`onSave` 接 `saveFile` 並處理撞名（`<name> (edited) 2.m4a`）、存好後在預覽打開新檔。H2 不開音訊編輯（不給音訊傳 `onSave`）。

## 判斷

- **照搬 storage 15，不重開。** 單軌、非破壞；mediabunny + WebCodecs 解碼與編碼，Web Audio 播放；波形自己用 Canvas2D 畫。不用 wavesurfer.js（沒有 peaks 時整檔 `decodeAudioData`）、peaks.js（LGPL-3.0）、`@mediabunny/*-encoder`（`blob:` worker，mp3 版含 LGPL 的 LAME）、ffmpeg.wasm（GPL）。本 plan 不加新套件：mediabunny 由 06 加、鎖版本、寫進 `THIRD_PARTY_NOTICES.md`；`@base-ui/react` 由 02 加。
- **邊界。** 本體在 `src/audio-editor/`，只認 `ByteSource`、`SaveHandler` 與回呼。來源只用隨機 `read`，經 06 的 `openMedia(source, "audio", signal)` 接成 mediabunny 的 `Input`；成品經 06 的 `createBlobSink` 收成 `Blob`。不整檔讀，所以超過 `previewBytes` 的檔照樣能編（overview §1）。
- **能不能編輯歸 02 的 `kindOf`**（mime 清單與副檔名照 storage 15 §2；沒有 mime 的 `.webm` 算影片）；`audio` 登錄在 `editors` 之後 `kindOf` 才回 `edit: "audio"`。本 plan 不改 `kindOf`。
- **能不能解交給 06 的 `openMedia`。** 它在 `need: "audio"` 時檢查 `track.canDecode()`：PCM（WAV）mediabunny 自己解；壓縮格式走 WebCodecs `AudioDecoder`（Chrome / Edge 94、Firefox 130、Safari 26 起；Firefox Android 沒有）。解不了時 `openMedia` 丟 `codec_unsupported`（有 `AudioDecoder` 但不支援這個 codec）或 `webcodecs_unavailable`（沒有 `AudioDecoder`）；認不得的容器或沒有音軌丟 `unsupported`。編輯器掛上後 `openTrack` 失敗就顯示 `error.<code>`（02 的字串），「編輯」按鈕不用另外查 WebCodecs。
- **聲道。** 單聲道、立體聲照原樣。超過 2 聲道的，波形、播放、輸出都先混成立體聲，混法照 Web Audio 規格的 down-mix：4 聲道 `L = 0.5(L + SL)`、`R = 0.5(R + SR)`；6 聲道 `L = L + 0.7071(C + SL)`、`R = R + 0.7071(C + SR)`（LFE 丟掉）；其他聲道數只留前兩個。
- **狀態是純資料**（型別見契約）。`segments` 是依輸出順序排的來源區段（秒），`gains` 在輸出時間軸上。所有操作都是 `edit.ts` 的純函式；正規化與去掉靜音只算出要加的 `gain` 或要 `cut` 的範圍，再走同一組函式。
- **undo / redo。** `useReducer` 加兩個快照堆疊，各 200 步。去掉靜音的整批刪除算一步。
- **增益。** 同一時間點上的 gain 相乘；淡入 `sin(πx/2)`、淡出 `cos(πx/2)`（x 是在區間裡的位置 0..1），不給曲線選項。兩個區段接起來而且來源不連續（`prev.out ≠ next.in`）的地方，接縫兩側各加 5 ms 的短淡出、淡入。播放與輸出呼叫同一個 `applyGains`：聽到的就是輸出的。
- **正規化。** 峰值正規化到 −1 dBFS（可調 −6 到 0），範圍是選取或整段。用峰值表算、不重新解碼：每格的最大振幅乘上那一格裡最大的 gain，取全部的最大值。峰值表往外取整，所以結果絕不超過目標。
- **去掉靜音。** 低於 −50 dBFS（可調 −70 到 −20）、連續至少 1 秒（可調 0.3 到 5）算靜音，兩側各留 0.2 秒。只看峰值表。先在波形上標出來，按「刪除這些」才執行。
- **峰值表與記憶體。** 打開後依序跑一遍 `AudioSampleSink.samples()`，每個 `AudioSample` 拷進每聲道一塊重複使用的 `Float32Array`、更新 min / max、`close()`，不留整段 PCM。每格 256 frame；總格數超過 2^21 時每格加倍直到不超過。min、max 存 `Int16Array`（min 往下、max 往上取整），最大 16 MiB。往上建每層粗 4 倍的縮圖層，直到 ≤ 1024 格。這一遍邊跑邊畫、有進度；播放、選取、刪除一開始就能用，正規化與去掉靜音等它跑完。
- **畫。** Canvas2D，只畫看得到的寬度，乘 `devicePixelRatio`。每像素對到幾個 frame，就挑 `framesPerBin` 不大於它的最粗一層；放大到每像素不到一格時，只解碼畫面上那一段直接畫 sample，只快取這一個視窗。畫的是輸出時間軸，振幅乘上 gain；來源不連續的接縫畫一條細線。顏色在畫的時候從 canvas 的 computed style 讀 `--ak-*`。
- **播放。** 一個 `AudioContext`，以 `currentTime` 當時鐘，排程器往前排 1 秒：`AudioBufferSink.buffers(start, end)` 取塊、套 `applyGains`、`AudioBufferSourceNode.start(when, offset, duration)` 一塊接一塊排。循環播放時排到選取終點就從起點接著排，沒有空隙；不用 `AudioBufferSourceNode.loop`。取樣率不同由 Web Audio 自己轉。排程中的錯誤用 `toMediaError(e, "decode_failed")`（`src/media/media-error.ts`）轉成 `ViewerError`，停止播放並交給 `useRoot().report`。
- **輸出格式**（2026-10-05 查過：Chrome / Edge 只編 Opus 與 AAC，AAC 用 OS 編碼器、Linux 沒有、只收 1 / 2 / 6 聲道與 44.1 / 48 kHz；Firefox 130 起只編 Opus 與 Vorbis；Safari 26 起 AAC 與 Opus；沒有瀏覽器編 MP3 或 FLAC；PCM 由 mediabunny 自己編）。只列 `canEncodeAudio` 回 true 的：
  - AAC：`.m4a`、`new Mp4OutputFormat({ fastStart: false })`、codec `"aac"`、128 / 192 kbps（預設 192）；來源不是 44100 / 48000 Hz 的轉成 48000。
  - Opus：`.ogg`、`new OggOutputFormat()`、codec `"opus"`、96 / 128 / 160 kbps（預設 128）、一律 48000 Hz。QuickTime 不播 Ogg，選項旁註明。
  - WAV：`.wav`、`new WavOutputFormat()`、codec `"pcm-s16"`、原取樣率。
  - 預設：來源 codec 是 `pcm-*` 或 `flac` 就選 WAV；其他選 AAC，不能編 AAC 就選 Opus。MP3、FLAC 來源存不回原格式，對話框寫明。取樣率轉換用 `AudioEncodingConfig.transform.sampleRate`，不自己寫重取樣。
- **輸出也是串流。** 每個區段跑 `samples(in, out)`，頭尾用 `copyTo` 的 `frameOffset` / `frameCount` 切齊，套 `applyGains`，建成輸出時間上的新 `AudioSample`，`await AudioSampleSource.add()`（背壓）。WAV 與非 fragmented MP4 收尾時回頭改檔頭，靠 06 的 `createBlobSink`（預設 layout 的 `headBytes` = 1 MiB，檔頭一直留在記憶體；06 P01-3 的 round-trip 測試已用 `fastStart: false` 與 WAV 驗過），本 plan 用預設 layout。
- **輸出上限。** 開始前估大小，超過 `maxOutputBytes` 就不讓開始，`onError` 收 `output_too_large`；寫入中 sink 也會在超過 `maxBytes` 時丟 `output_too_large`（`createBlobSink({ maxBytes: maxOutputBytes })`）。可以中途取消，取消後不呼叫 `onSave`。
- **存檔永遠是另存。** `mode: "export"`，按鈕寫「輸出」（理由：storage 15 §2，重新編碼有損、MP3 / FLAC 存不回）。`onSave` resolve 就呼叫 `onClose`；reject 就留在輸出對話框、顯示 `error.message`（空的才用 `error.save_failed`），`onError` 收 `save_failed`。
- **生命週期不用 `useEffect`**（01 的 lint 禁用）。canvas、`AudioContext`、`OpenedMedia`、`ResizeObserver`、`requestAnimationFrame` 都掛在 ref callback 加 cleanup；鍵盤用編輯器根元素（`tabIndex={0}`）的 `onKeyDown`，不掛 window；`onDirtyChange` 在 dispatch 的包裝裡呼叫。卸載時同一個 `AbortController` 取消所有讀取。
- **不開 worker、不放寬 CSP、不發請求、不寫 IndexedDB / OPFS / localStorage。**
- **UI 全用 02 的元件。** 按鈕 `Button`、提示 `Tooltip`、滑桿 `Slider`、浮出面板 `Popover`、輸出對話框 `Dialog`、格式與位元率 `RadioGroup`、進度 `Progress`、放棄修改 `DiscardDialog`、「停止輸出並關閉？」`ConfirmDialog`。圖示只有 `CloseIcon` 用 02 的 `glyphs.tsx`，其餘畫在 `src/audio-editor/glyphs.tsx`。
- **需要「開啟時做事、關閉時收尾」的面板（去掉靜音）用 `Popover` 的 `onOpenChange(open)`（§9.3，02 P04-4）。** 開啟時算出並標記靜音範圍，關閉時（`Esc`、點外面、再按一次 trigger）`onMark([])` 清掉標記。設定值存在 `SilencePopover` 自己的 `useState`，不靠內容卸載，也沒有 ref cleanup 的繞路。

## 契約

只加不改 overview §3、§9。

### 對外

- subpath `./audio-editor`：`export { AudioEditor }`、`export type { AudioEditorProps }`。主入口 `src/index.ts` 不 import 它；`src/viewer/editors.ts`（03）的 `audio` 項用 `lazy(() => import("../audio-editor/audio-editor").then((m) => ({ default: m.AudioEditor })))` 載入（目標檔是定義 `AudioEditor` 的 `audio-editor.tsx`，不是 `index.ts`：宿主的 chunk 名取自目標檔名，`index-*` 會被 product 的 chunks-check 拒絕，00-overview §7）。
- `AudioEditorProps`：`export type AudioEditorProps = EditorProps`（`EditorProps` 來自 `src/contract/editor.ts`，03 第 8 步；形狀見 overview §3：`CommonProps & { onSave; onClose; onDirtyChange?; maxOutputBytes?; assets? }`）。`assets` 不用。`maxOutputBytes` 不給 = 不擋。
- `AudioEditor(props: EditorProps)`：最外層是 `ViewerRoot`（`src/primitives/root.tsx`；`locale`、`messages`、`theme`、`limits`、`onError` 從 props 傳入，已在 `ViewerRoot` 裡時不重包），裡面才是 `EditorBody`（`src/audio-editor/editor-body.tsx`），所以 `useRoot()`、`useT()` 都在 `EditorBody` 以下用。錯誤回報一律 `useRoot().report(e)`（它轉給 `props.onError`）。
- `SaveRequest`：`mode: "export"`；`mime` + `ext` 是 `"audio/mp4"` + `".m4a"`、`"audio/ogg"` + `".ogg"`、`"audio/wav"` + `".wav"`；`suggestedName = suggestedName(file.name, ext, "export")`。
- 用到的錯誤碼（都在 §3）：`unsupported`、`codec_unsupported`、`webcodecs_unavailable`（以上三個由 `openMedia` 丟）、`read_failed`（06 包好丟出）、`decode_failed`、`output_too_large`、`save_failed`。畫面上的訊息一律查 `error.<code>`（`commonMessages`），只有 `save_failed` 顯示宿主給的 `error.message`。

### 外部符號（本 plan 假設存在；名字不同照實際的用，並回報）

| 出處 | 檔 | 符號 |
| --- | --- | --- |
| 02 P02-2 | `src/contract/byte-source.ts` | `ByteSource`（`size`、`read(start, end, signal?): Promise<Uint8Array<ArrayBuffer>>`）、`FileRef`（`{ name; mime?; source }`）、`bytesSource(bytes: Uint8Array<ArrayBuffer>): ByteSource`（測試） |
| 02 P02-4 | `src/contract/save.ts` | `SaveHandler`、`SaveRequest`（`{ blob; mime; ext; mode; suggestedName }`）、`SaveMode`、`suggestedName(original: string, ext: string, mode: SaveMode): string` |
| 02 P02-1 | `src/contract/errors.ts` | `ViewerError`（`new ViewerError(code: ViewerErrorCode, options?: { message?: string; cause?: unknown })`，`.code`）、`ViewerErrorCode` |
| 03 第 8 步 | `src/contract/editor.ts` | `EditorProps` |
| 03 第 8 步 | `src/viewer/editors.ts` | `editors: EditorRegistry`（`Partial<Record<EditKind, ComponentType<EditorProps>>>`），本 plan 加 `audio` 一行 |
| 02 P03-1 | `src/i18n/messages.ts` | `MessageTable<K>`、`Vars`、`Messages`（本 plan 加 `& AudioMessages`）、`commonMessages` |
| 02 P03-3 | `src/i18n/use-t.ts` | `useT<K extends string>(table: MessageTable<K>): (key: K, vars?: Vars) => string` |
| 02 P03-3 | `src/primitives/root.tsx`、`root-context.ts`、`cx.ts` | `ViewerRoot(props: Omit<CommonProps, "file"> & { className?; children })`；`useRoot(): { locale; overrides; limits; theme; portal; report(e: ViewerError): void }`；`cx(...)` |
| 02 P04-1 | `src/primitives/icon.tsx`、`glyphs.tsx`、`button.tsx` | `Icon(props: { size?: "sm" \| "md" \| "lg"; label?: string; children })`、`IconSize`；`CloseIcon(props: { size?; label? })`；`Button(props: ComponentProps<"button"> & { variant?: "primary" \| "secondary" \| "ghost" \| "danger"; icon?: ReactNode })`（只有圖示時必須給 `aria-label`） |
| 02 P04-2 | `src/primitives/tooltip.tsx`、`slider.tsx` | `Tooltip(props: { content: string; delay?: number; children: ReactElement })`；`Slider(props: { label; value; min; max; step?; disabled?; onValueChange(v: number): void; onValueCommitted?(v: number): void })` |
| 02 P04-3 | `src/primitives/dialog.tsx` | `Dialog(props: { open; onOpenChange(open: boolean): void; title: string; description?: string; children?; footer? })`；`ConfirmDialog(props: { open; onOpenChange; title; description; confirmLabel; cancelLabel; danger?; onConfirm(): void })`；`DiscardDialog(props: { open; onOpenChange; onDiscard(): void })`（字串固定用 `discard.*`） |
| 02 P04-4 | `src/primitives/popover.tsx`、`radio-group.tsx`、`progress.tsx` | `Popover(props: { trigger: ReactElement; label: string; children; onOpenChange?(open: boolean): void })`（`label` 是 trigger 的 `aria-label`；`onOpenChange` 在每次開、關時呼叫）；`RadioGroup<T extends string>(props: { label; value: T; options: readonly { value: T; label: string; description?; disabled? }[]; onChange(v: T): void })`；`Progress(props: { label: string; value: number \| null })`（0–1，`null` = 不定進度） |
| 06 P01-1 | `src/media/media-error.ts` | `toMediaError(error: unknown, fallback: ViewerErrorCode): ViewerError`（abort 原樣丟） |
| 06 P01-2 | `src/media/open-media.ts` | `openMedia(source: ByteSource, need: "video" \| "audio", signal?: AbortSignal): Promise<OpenedMedia>`；`OpenedMedia = { input: Input; video: InputVideoTrack \| null; audio: InputAudioTrack \| null; duration: number; dispose(): void }`；`need: "audio"` 時 `video` 是 null、`audio` 不是 null；錯誤碼照 06 的對照表 |
| 06 P01-3 | `src/media/blob-sink.ts` | `createBlobSink(options?: { maxBytes?: number }, layout?: SinkLayout): BlobSink`；`BlobSink = { readonly writable: WritableStream<StreamTargetChunk>; readonly size: number; toBlob(mime: string): Blob }`；用法 `new StreamTarget(sink.writable)`，`output.finalize()` 之後 `sink.toBlob(mime)`；取消時丟掉 sink 的參照，沒有 `discard()` |
| 06 | `src/media/index.ts` | 以上 `toMediaError`、`openMedia`、`createBlobSink` 的對外 re-export；本 plan 從 `"../media"` import |
| 01 | 測試設定 | `*.test.ts(x)` 走 jsdom（`pnpm test <path>`）；`*.browser.test.ts` 走 Chromium（`pnpm test:browser <path>`）；`pnpm check`、`pnpm build` |
| mediabunny（06 鎖的版本，1.61.x 已查過 d.ts） | `mediabunny` | `InputAudioTrack`（`canDecode()`、`codec`、`sampleRate`、`numberOfChannels`）、`AudioSampleSink.samples(start?, end?)`、`AudioBufferSink.buffers(start?, end?)` → `WrappedAudioBuffer { buffer, timestamp, duration }`、`AudioSample`（`copyTo(dest, { planeIndex, format, frameOffset, frameCount })`、`numberOfFrames`、`timestamp`、`close()`、`new AudioSample({ data, format, numberOfChannels, sampleRate, timestamp })`）、`AudioSampleSource`（`new AudioSampleSource({ codec, bitrate, transform: { sampleRate } })`、`add()`）、`Output`（`addAudioTrack`、`start`、`finalize`、`cancel`）、`StreamTarget`、`Mp4OutputFormat`、`OggOutputFormat`、`WavOutputFormat`、`BufferTarget`（只在測試）、`canEncodeAudio(codec, { numberOfChannels, sampleRate })`、`AudioCodec` |

### 本模組內部型別（各步驟照這裡實作與引用）

```ts
// src/audio-editor/edit.ts
export type Range = { start: number; end: number };                 // 秒，start < end
export type Segment = { id: string; in: number; out: number };      // 來源時間
export type Gain = { id: string; start: number; end: number; kind: "gain" | "fadeIn" | "fadeOut"; db?: number }; // 輸出時間；kind = "gain" 才有 db
export type AudioEdit = { segments: Segment[]; gains: Gain[] };
// id：segment 是 "s<n>"、gain 是 "g<n>"，n = 現有同類 id 最大數字 + 1（決定性，測試好寫）

// src/audio-editor/peaks.ts
export type PeakLevel = { framesPerBin: number; min: Int16Array[]; max: Int16Array[] }; // 每聲道一個陣列
export type Peaks = { sampleRate: number; channels: 1 | 2; frames: number; levels: PeakLevel[] }; // levels[0] 最細

// src/audio-editor/open-track.ts
export type OpenedTrack = { track: InputAudioTrack; duration: number; sampleRate: number; channels: number; codec: AudioCodec | null; dispose(): void }; // dispose = OpenedMedia.dispose

// src/audio-editor/history.ts
export type History = { past: AudioEdit[]; present: AudioEdit; future: AudioEdit[]; initial: AudioEdit };
export type HistoryAction = { type: "apply"; next: AudioEdit } | { type: "undo" } | { type: "redo" };

// src/audio-editor/view.ts
export type View = { start: number; secondsPerPixel: number; width: number }; // 輸出時間

// src/audio-editor/plan.ts
export type Block = { outStart: number; srcStart: number; srcEnd: number };

// src/audio-editor/formats.ts
export type FormatId = "aac" | "opus" | "wav";
export type OutputChoice = { format: FormatId; bitrate: number | null }; // wav 是 null，單位 bps
```

### i18n（`src/audio-editor/messages.ts`，`audio.*` 扁平 key，en / zh-TW）

檔案形狀照 02：`const en = {…} satisfies Record<string, string>`、`export type AudioKey = keyof typeof en`、`export type AudioMessages = Record<AudioKey, string>`、`export const audioMessages: MessageTable<AudioKey> = { en, "zh-TW": {…} }`。檔案超過 300 行就拆 `messages-en.ts`、`messages-zh-tw.ts`，表名不變。

已由 02 提供、本 plan 不重複定義：`common.close`（關閉）、`common.cancel`（取消）、`common.loading`（載入中…）、`discard.*`（放棄修改的整組字串，經 `DiscardDialog`）、`error.<code>`（所有錯誤訊息，含 `error.codec_unsupported`、`error.webcodecs_unavailable`、`error.unsupported`、`error.output_too_large`、`error.save_failed`）。

| key | en | zh-TW |
| --- | --- | --- |
| `audio.undo` / `audio.redo` / `audio.export` | Undo / Redo / Export | 復原 / 重做 / 輸出 |
| `audio.scanning` | Reading waveform… | 正在讀取波形… |
| `audio.waveform` | Waveform | 波形 |
| `audio.exportClosing` | Stop exporting and close? | 停止輸出並關閉？ |
| `audio.exportClosingBody` | The export in progress will be lost. | 進行中的輸出會被丟掉。 |
| `audio.exportClosingConfirm` / `audio.exportKeep` | Stop and close / Keep exporting | 停止並關閉 / 繼續輸出 |
| `audio.play` / `audio.pause` / `audio.loop` | Play / Pause / Loop selection | 播放 / 暫停 / 循環播放選取 |
| `audio.toStart` / `audio.toEnd` / `audio.position` / `audio.selection` | Go to start / Go to end / Position / Selection | 跳到開頭 / 跳到結尾 / 位置 / 選取長度 |
| `audio.delete` / `audio.keepSelection` / `audio.split` | Delete / Keep selection / Split | 刪除 / 只留選取 / 分割 |
| `audio.fadeIn` / `audio.fadeOut` / `audio.volume` | Fade in / Fade out / Volume | 淡入 / 淡出 / 音量 |
| `audio.normalize` / `audio.normalizeTarget` / `audio.apply` | Normalize / Peak level / Apply | 正規化 / 峰值 / 套用 |
| `audio.removeSilence` / `audio.silenceThreshold` / `audio.silenceMinLength` | Remove silence / Threshold / Minimum length | 去掉靜音 / 閾值 / 最短長度 |
| `audio.silenceFound` / `audio.silenceRemove` | {count} silent ranges / Delete these | 找到 {count} 段靜音 / 刪除這些 |
| `audio.exportTitle` / `audio.format` / `audio.bitrate` | Export audio / Format / Bitrate | 輸出音訊 / 格式 / 位元率 |
| `audio.formatAac` / `audio.formatOpus` / `audio.formatWav` | AAC (.m4a) / Opus (.ogg) / WAV (lossless) | AAC（.m4a）/ Opus（.ogg）/ WAV（無損） |
| `audio.opusNote` | QuickTime can't play .ogg files. | QuickTime 播不了 .ogg。 |
| `audio.noSameFormat` | MP3 and FLAC can't be exported in their own format. | MP3 與 FLAC 無法輸出成原格式。 |
| `audio.estimatedSize` / `audio.remaining` | About {size} / {time} left | 約 {size} / 剩 {time} |
| `audio.exporting` | Exporting… | 輸出中… |
| `audio.start` | Start | 開始 |
| `audio.tooLarge` | Too large to export. Pick a lower bitrate or a compressed format. | 太大了，請改用較低的位元率或壓縮格式。 |

## 形式

`AudioEditor` 撐滿 viewer 的容器（不自己開 modal），根元素 class `fv-audio`，由上到下：

- 頂列 `fv-audio-top`：「關閉」、檔名、undo / redo、「輸出」。
- 波形：上面一條總覽 `fv-audio-overview`（整檔，框出目前看到的範圍，可以拖；峰值表還在跑時上方一條進度），下面主波形 `fv-audio-wave`。滾輪捲動，Ctrl + 滾輪或雙指縮放，`+` `-` `0`（0 = 整段放進畫面）。拖曳選取，兩邊把手可拖，吸附到播放頭與區段邊界；雙擊兩條邊界之間選起那一段。
- 播放列 `fv-audio-transport`：播放 / 暫停（空白鍵）、循環（`L`）、`Home` / `End`、時間碼（`位置 m:ss.mmm`、`選取長度 m:ss.mmm`）。
- 工具列 `fv-audio-tools`：刪除（`Delete` / `Backspace`）、只留選取（`T`）、分割（`S`）、淡入、淡出、音量（`Popover` + `Slider`，−24 到 +12 dB，step 0.5）、正規化（`Popover` + `Slider`，−6 到 0 dB，step 0.1）、去掉靜音（`Popover`：閾值 −70 到 −20 dBFS step 1、最短 0.3 到 5 秒 step 0.1；即時標出範圍，「刪除這些」才執行）。沒有選取時要範圍的鍵 disabled（正規化沒選取 = 整段，不 disabled）；峰值表跑完前正規化與去掉靜音 disabled。undo / redo：`Ctrl/⌘ + Z`、`Ctrl/⌘ + Shift + Z`。套用後 Popover 留著（02 的 `Popover` 沒有關閉方法），按 `Esc` 或點外面關。
- 寬度 < 640 px（container query `@container (max-width: 639px)`）：工具列變成底部一排只有 icon 的鍵（`aria-label` 用 i18n 字，文字 `<span className="fv-audio-tool-label">` 用 CSS 藏起來），波形佔滿寬度；選取把手觸控範圍至少 44 px。
- 輸出對話框（`Dialog`）：格式（`RadioGroup`）、位元率（`RadioGroup`）、估計大小、`Progress` 加剩餘時間、取消。
- 改過沒輸出就按「關閉」或 `Esc`：`DiscardDialog`。輸出中對話框的關閉（`Esc`、點外面）先問 `ConfirmDialog`（`audio.exportClosing`）；輸出對話框開著時背景是 inert，頂列「關閉」按不到。
- 顏色：底 `--ak-surface`、波形 `--ak-text-muted`、選取 `--ak-accent-subtle`、播放頭 `--ak-accent`、接縫 `--ak-border-strong`、標出的靜音 `--ak-danger-subtle`、文字 `--ak-text`。

## Phase 01 — 編輯模型

blocker：01 P01-3（`pnpm test` 可用）；model：sonnet。純函式，不碰 DOM、mediabunny 與 02 / 03 / 06 的任何檔，可和它們平行。

1. 區段與 gain 的編輯。新 `src/audio-editor/edit.ts`：契約裡的 `Range`、`Segment`、`Gain`、`AudioEdit` 型別，以及
   - `initialEdit(duration: number): AudioEdit` → `{ segments: [{ id: "s1", in: 0, out: duration }], gains: [] }`
   - `outputDuration(state): number`（各區段 `out − in` 相加）
   - `boundaries(state): number[]`（輸出時間上每個區段的起點與終點，去重、遞增，含 0 與總長）
   - `sourceAt(state, t: number): { segment: Segment; source: number } | null`（輸出時間 → 來源時間；`t` 落在邊界時歸後一段，等於總長時歸最後一段）
   - `cut(state, range): AudioEdit`：區段在範圍邊界上切開、丟掉範圍內的部分；`gains` 整個落在範圍內的刪掉、跨邊界的截短、在範圍之後的 `start` / `end` 都減掉 `range.end − range.start`
   - `keep(state, range): AudioEdit` = 先 `cut` 範圍之後、再 `cut` 範圍之前
   - `split(state, t): AudioEdit`：`t` 所在區段切成兩段（新 id），`t` 剛好在邊界上就原樣回傳
   - `fade(state, range, dir: "in" | "out"): AudioEdit`（加一個 `fadeIn` / `fadeOut` gain）、`gain(state, range, db: number): AudioEdit`（加一個 `kind: "gain"`）
   - 所有函式不改輸入，回新物件。
   測試：新 `src/audio-editor/edit.test.ts`：刪除橫跨兩個區段的範圍後剩兩段且 in / out 正確；`keep` 後總長等於範圍長度；刪除後在後面的 gain 往前移；跨刪除邊界的 gain 被截短；整段落在範圍內的 gain 被刪掉；`split` 後 `boundaries` 多一條、`outputDuration` 不變；`split` 在邊界上不變；`sourceAt` 跨區段與落在邊界上；id 遞增且不重複；輸入物件沒被改。
   verify：`pnpm test src/audio-editor/edit.test.ts`
   commit：`feat(audio-editor): add non-destructive segment and gain edits`
2. 增益套用。新 `src/audio-editor/gain.ts`，用 `src/audio-editor/edit.ts` 的 `AudioEdit`、`boundaries`：
   - `gainAt(state: AudioEdit, t: number): number`（線性倍率；`kind: "gain"` 是 `10^(db/20)`；`fadeIn` 是 `sin(πx/2)`、`fadeOut` 是 `cos(πx/2)`，x = `(t − start) / (end − start)`；重疊的相乘；在來源不連續的接縫（相鄰區段 `prev.out ≠ next.in`）兩側 5 ms 內再乘 `sin` 形狀的短淡出 / 淡入）
   - `applyGains(planes: Float32Array[], t0: number, sampleRate: number, state: AudioEdit): void`（就地乘：第 i 個 frame 的時間是 `t0 + i / sampleRate`；沒有任何 gain 也不在接縫附近時直接 return）
   - `downmixToStereo(planes: Float32Array[]): Float32Array[]`（1 或 2 聲道原樣回傳；4 聲道與 6 聲道用判斷裡的公式；其他聲道數回前兩個）
   測試：新 `src/audio-editor/gain.test.ts`：淡入在 start 是 0、在 end 是 1；淡出相反；+6 dB 倍率 ≈ 1.9953；兩個重疊的 gain 相乘；接縫淡化只出現在來源不連續的地方（`split` 產生的接縫沒有）；`split` 前後 `applyGains` 的輸出逐 byte 相同；6 聲道混成立體聲的係數；單聲道與立體聲原樣。
   verify：`pnpm test src/audio-editor/gain.test.ts`
   commit：`feat(audio-editor): apply gains, fades and seam fades to sample planes`
3. undo / redo。新 `src/audio-editor/history.ts`，用 `src/audio-editor/edit.ts` 的 `AudioEdit`：契約裡的 `History`、`HistoryAction`，以及 `HISTORY_LIMIT = 200`、`initialHistory(edit: AudioEdit): History`、`historyReducer(h: History, a: HistoryAction): History`（`apply`：present 推進 past、超過 200 丟最舊的、清空 future；`undo` / `redo` 在堆疊空時原樣回傳）、`isDirty(h: History): boolean`（`present !== initial`，以參照比較）。
   測試：新 `src/audio-editor/history.test.ts`：undo 到底再 redo 到底回到同一個 present；第 201 次 apply 後 past 長度仍是 200 且最舊的被丟掉；apply 清空 future；undo 到 initial 時 `isDirty` 是 false；空堆疊 undo 不變。
   verify：`pnpm test src/audio-editor && pnpm check`
   commit：`feat(audio-editor): keep 200 steps of undo and redo`

## Phase 02 — 峰值表、去掉靜音、正規化、讀檔

blocker：Phase 01；第 3 步要 02 P02-2（`src/contract/byte-source.ts`、`errors.ts`）與 06 P01-1、P01-2（`toMediaError`、`openMedia`）已合併；model：sonnet。

1. 峰值表。新 `src/audio-editor/peaks.ts`：契約裡的 `PeakLevel`、`Peaks`，以及
   - `BASE_FRAMES_PER_BIN = 256`、`MAX_BINS = 2 ** 21`
   - `framesPerBinFor(totalFrames: number, maxBins = MAX_BINS): number`（從 256 起，總格數超過 `maxBins` 就加倍）
   - `class PeakBuilder { constructor(o: { sampleRate: number; channels: 1 | 2; totalFrames: number; maxBins?: number }); push(planes: Float32Array[], frames: number): void; finish(): Peaks; progress(): number }`（樣本值乘 32767 後 min 用 `Math.floor`、max 用 `Math.ceil`，夾在 −32768..32767；`finish` 會呼叫 `buildLevels`）
   - `buildLevels(base: PeakLevel): PeakLevel[]`（每層 `framesPerBin × 4`，直到格數 ≤ 1024；第 0 層是 base）
   - `levelFor(peaks: Peaks, framesPerPixel: number): PeakLevel`（`framesPerBin ≤ framesPerPixel` 的最粗一層，都比它大就回 `levels[0]`）
   - `peakIn(peaks: Peaks, startFrame: number, endFrame: number): number`（範圍內兩聲道絕對值最大，0..1；範圍邊界往外取到整格）
   測試：新 `src/audio-editor/peaks.test.ts`：振幅 0.5 的正弦波 max ≈ 16384、min ≈ −16384；取整一律往外（0.10001 存成 ≥ 3277.1 的整數）；`maxBins = 8` 時 framesPerBin 加倍到格數 ≤ 8；縮圖層等於直接用粗格算；分 7 次 `push` 與一次 `push` 結果相同；`levelFor` 選層正確。
   verify：`pnpm test src/audio-editor/peaks.test.ts`
   commit：`feat(audio-editor): build multi-level peak tables`
2. 去掉靜音與正規化。新 `src/audio-editor/silence.ts` 與 `src/audio-editor/normalize.ts`，用 `src/audio-editor/peaks.ts` 的 `Peaks`、`PeakLevel`，`src/audio-editor/edit.ts` 的 `AudioEdit`、`Range`，`src/audio-editor/gain.ts` 的 `gainAt`：
   - `findSilence(peaks: Peaks, state: AudioEdit, o: { thresholdDb: number; minSeconds: number }): Range[]`：在輸出時間軸上逐格（用 `levels[0]`）看 `max(|min|, |max|) / 32768 × gainAt(state, 格中點)`，低於 `10^(thresholdDb/20)` 的連續格長度 ≥ `minSeconds` 的算靜音；回傳每段兩側各內縮 0.2 秒後的範圍（內縮後長度 ≤ 0 的丟掉）；預設常數 `SILENCE_DEFAULTS = { thresholdDb: -50, minSeconds: 1 }`、`SILENCE_PAD = 0.2`
   - `normalizeGain(peaks: Peaks, state: AudioEdit, range: Range, targetDb: number): number`：範圍內每格的振幅乘上那格裡 `gainAt` 的最大值，取最大值 p，回 `targetDb − 20·log10(p)`（p = 0 回 0）；`NORMALIZE_DEFAULT_DB = -1`
   測試：新 `src/audio-editor/silence.test.ts`：「1 秒音調 + 2 秒靜音 + 1 秒音調」找到一段、兩側各留 0.2 秒；−60 dBFS 底噪判成靜音；短於 `minSeconds` 的不算；淡出到 0 的尾巴也算靜音（看的是乘過 gain 的振幅）。新 `src/audio-editor/normalize.test.ts`：套用回傳的 dB 後峰值不超過目標；−40 dBFS 以上的來源與目標差 < 0.05 dB；已有 +6 dB gain 時回傳值少 6 dB；全靜音回 0。
   verify：`pnpm test src/audio-editor/silence.test.ts src/audio-editor/normalize.test.ts`
   commit：`feat(audio-editor): find silence and compute normalize gain from peaks`
3. 打開音軌與掃峰值。新四個檔：
   - `src/audio-editor/testing/synth-wav.ts`：`synthWavSource(o: { seconds: number; sampleRate: number; channels: number; tone: (t: number, ch: number) => number }): ByteSource`（`ByteSource` 來自 `src/contract/byte-source.ts`；有 `size`；16-bit PCM WAV，`read(start, end)` 依公式算出那段 bytes、回 `Uint8Array<ArrayBuffer>`，整檔不放記憶體；不從 `src/audio-editor/index.ts` export）
   - `src/audio-editor/testing/encode-opus.ts`：`encodeOpusOgg(o: { seconds: number; frequency: number }): Promise<Uint8Array<ArrayBuffer>>`：48 kHz 單聲道正弦波；`new Output({ format: new OggOutputFormat(), target: new BufferTarget() })`、`new AudioSampleSource({ codec: "opus", bitrate: 128000 })`、`output.addAudioTrack(source)`、`await output.start()`，每 1 秒一個 `new AudioSample({ data: Float32Array, format: "f32-planar", numberOfChannels: 1, sampleRate: 48000, timestamp })` 用 `await source.add(sample)` 加入再 `sample.close()`，`await output.finalize()`，回 `new Uint8Array(target.buffer!)`（只給 `*.browser.test.ts` 用，不從 `index.ts` export）
   - `src/audio-editor/open-track.ts`：`openTrack(source: ByteSource, signal: AbortSignal): Promise<OpenedTrack>`：`const media = await openMedia(source, "audio", signal)`（`openMedia` 從 `"../media"`；它自己處理 `canDecode()`，並丟 `unsupported` / `codec_unsupported` / `webcodecs_unavailable` / `read_failed` / `decode_failed`，本函式不再包一層）；`const track = media.audio`，是 `null`（`openMedia` 不會發生，只為型別）就 `media.dispose()` 並丟 `new ViewerError("unsupported")`（`src/contract/errors.ts`）；回 `{ track, duration: media.duration, sampleRate: track.sampleRate, channels: track.numberOfChannels, codec: track.codec, dispose: () => media.dispose() }`
   - `src/audio-editor/scan.ts`：`scanPeaks(t: OpenedTrack, o: { signal: AbortSignal; onProgress?: (builder: PeakBuilder) => void }): Promise<Peaks>`（`new AudioSampleSink(t.track).samples()`；每個 sample 對每個 `planeIndex` `copyTo(buf, { planeIndex, format: "f32-planar" })` 進重複使用的 `Float32Array`（不夠大才重配），超過 2 聲道先 `src/audio-editor/gain.ts` 的 `downmixToStereo`，`PeakBuilder.push`、`sample.close()`；每 0.25 秒的音訊呼叫一次 `onProgress`；`signal.aborted` 時停下丟 `signal.reason`；mediabunny 丟的錯一律 `throw toMediaError(e, "decode_failed")`（`"../media"`；它對 abort 原樣丟、對 `ViewerError` 原樣回傳））
   測試：新 `src/audio-editor/scan.browser.test.ts`：3 秒 48 kHz 立體聲 WAV 的峰值等於直接用 `PeakBuilder` 算公式樣本的結果；6 聲道 WAV 混成立體聲；`encodeOpusOgg({ seconds: 3, frequency: 440 })` 打開後 `scanPeaks` 掃得完、`duration` 與 3 秒誤差 < 30 ms；`bytesSource(new Uint8Array(64))` 的 `openTrack` 丟 `unsupported`（06 對照表：容器認不得）；`vi.stubGlobal("AudioDecoder", { isConfigSupported: async () => ({ supported: false }) })` 後打開 `encodeOpusOgg` 的檔丟 `codec_unsupported`；`vi.stubGlobal("AudioDecoder", undefined)` 後同一個檔丟 `webcodecs_unavailable`（兩案的 stub 在 `afterEach` 用 `vi.unstubAllGlobals()` 還原）；開始後 abort 會 reject；合成 30 分鐘 48 kHz 立體聲 WAV 掃完後 `performance.memory.usedJSHeapSize`（型別寫 `Performance & { memory?: { usedJSHeapSize: number } }`，沒有就跳過這一斷言）比開始時多不到 100 MB。
   verify：`pnpm test:browser src/audio-editor/scan.browser.test.ts && pnpm test src/audio-editor && pnpm check`
   commit：`feat(audio-editor): open audio tracks and scan peaks while streaming`

## Phase 03 — 編輯器畫面與波形

blocker：Phase 02；02 P03-1～P03-3、P04-1～P04-4 已合併（`ViewerRoot`、`useT`、`Button`、`Tooltip`、`Slider`、`Dialog`、`ConfirmDialog`、`DiscardDialog`、`Popover`、`RadioGroup`、`Progress`）；03 第 8 步已合併（`src/contract/editor.ts`、`src/viewer/editors.ts`）；model：opus。

1. 編輯器外框、入口與全部字串。
   - 新 `src/audio-editor/messages.ts`：契約「i18n」表的全部 `audio.*` key，en 與 zh-TW，形狀照該節。`src/i18n/messages.ts` 的 `Messages` 加 `& AudioMessages`（`import type { AudioMessages } from "../audio-editor/messages"`）。不改 `src/i18n/en.ts`、`zh-tw.ts`。
   - 新 `src/audio-editor/glyphs.tsx`：每個都是 `(props: { size?: IconSize; label?: string }) => JSX.Element`，內容 `<Icon size={size} label={label}>…</Icon>`（`Icon`、`IconSize` 來自 `src/primitives/icon.tsx`；24 單位 viewBox、stroke 2，由 `Icon` 提供）。`children` 的 path：`UndoIcon` = `<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>`；`RedoIcon` = `<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>`；`PlayIcon` = `<path d="M7 4v16l13-8z"/>`；`PauseIcon` = `<path d="M8 5v14M16 5v14"/>`；`LoopIcon` = `<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>`；`ToStartIcon` = `<path d="M6 5v14"/><path d="M19 5v14L9 12z"/>`；`ToEndIcon` = `<path d="M18 5v14"/><path d="M5 5v14l10-7z"/>`；`DeleteIcon` = `<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/>`；`KeepIcon` = `<path d="M6 3v18M18 3v18"/><path d="M10 12h4"/>`；`SplitIcon` = `<path d="M12 3v18"/><path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>`；`FadeInIcon` = `<path d="M3 20 21 4v16z"/>`；`FadeOutIcon` = `<path d="M21 20 3 4v16z"/>`；`VolumeIcon` = `<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/>`；`NormalizeIcon` = `<path d="M3 12h2M7 8v8M11 4v16M15 8v8M19 10v4"/>`；`SilenceIcon` = `<path d="M3 12h18"/><path d="m9 8 6 8M15 8l-6 8"/>`。
   - 新 `src/audio-editor/audio-editor.tsx`：`export type AudioEditorProps = EditorProps`（`EditorProps` 來自 `src/contract/editor.ts`）與 `AudioEditor(props: AudioEditorProps)`：回 `<ViewerRoot locale={props.locale} messages={props.messages} theme={props.theme} limits={props.limits} onError={props.onError}><EditorBody {...props} /></ViewerRoot>`（`ViewerRoot` 來自 `src/primitives/root.tsx`）。
   - 新 `src/audio-editor/editor-body.tsx`：`EditorBody(props: EditorProps)`。`const t = useT(audioMessages)`、`const tc = useT(commonMessages)`（`useT` 來自 `src/i18n/use-t.ts`，`commonMessages` 來自 `src/i18n/messages.ts`）、`const root = useRoot()`（`src/primitives/root-context.ts`）。根元素 `<div className="fv-audio" tabIndex={0} onKeyDown={…}>`，內含頂列（`Button`，`src/primitives/button.tsx`：關閉（`CloseIcon`，`src/primitives/glyphs.tsx`，`aria-label` = `tc("common.close")`）、undo（`UndoIcon`）、redo（`RedoIcon`）、輸出（`variant="primary"`，本步 disabled））、檔名、波形區佔位 `<div className="fv-audio-wave-slot">`、播放列佔位、工具列佔位。根元素的 ref callback：建 `AbortController`，`openTrack(props.file.source, signal)`（`src/audio-editor/open-track.ts`）→ `scanPeaks`（`src/audio-editor/scan.ts`），結果放進 state（`status: "opening" | "scanning" | "ready" | "error"`、`opened`、`peaks`、`progress`）；cleanup 時 abort 並 `opened.dispose()`。`opening` 時顯示 `tc("common.loading")`，`scanning` 時 `Progress`（`src/primitives/progress.tsx`，`label={t("audio.scanning")}`、`value={progress}`）。錯誤（abort 以外）時顯示 `tc(\`error.${e.code}\`)`（`e` 是 `ViewerError`），並呼叫 `root.report(e)`。`historyReducer` / `initialHistory`（`src/audio-editor/history.ts`）用 `useReducer`，包一個 `dispatch` 在每次之後算 `isDirty` 並在值改變時呼叫 `props.onDirtyChange`。「關閉」與 `Esc`：`isDirty` 時開 `DiscardDialog`（`src/primitives/dialog.tsx`；`onDiscard` → `props.onClose()`，`onOpenChange(false)` 關掉對話框），否則直接 `props.onClose()`。`Ctrl/⌘ + Z`、`Ctrl/⌘ + Shift + Z` 接 undo / redo。
   - 新 `src/audio-editor/index.ts`：`export { AudioEditor } from "./audio-editor"`、`export type { AudioEditorProps } from "./audio-editor"`。
   - 新 `src/audio-editor/audio-editor.css`：`.fv-audio`（grid：頂列 / 波形 / 播放列 / 工具列，`container-type: inline-size`，撐滿容器）、`.fv-audio-top`、`.fv-audio-status`；只用 `--ak-*`。`src/styles.css` 檔尾加 `@import "./audio-editor/audio-editor.css";`。
   - `src/viewer/editors.ts` 的 `editors` 加一行 `audio: lazy(() => import("../audio-editor/audio-editor").then((m) => ({ default: m.AudioEditor }))),`（目標檔不能叫 `index.*`，`pnpm check` 的 `check:entry` 會擋；`lazy` 該檔已 import；不動別的行）。
   - `package.json` 的 `exports` 加 `"./audio-editor": { "types": "./dist/audio-editor/index.d.ts", "default": "./dist/audio-editor/index.js" }`、`tsdown.config.ts` 的 `entry` 加 `"src/audio-editor/index.ts"`（形狀照檔內 `.` 那條；已經有就不動）。
   測試：新 `src/audio-editor/messages.test.ts`：`audioMessages.en` 與 `["zh-TW"]` 的 key 集合相同、值都不是空字串、每個 key 都以 `audio.` 開頭、同一個 key 的 `{count}` / `{size}` / `{time}` 占位符兩種語言一致。新 `src/audio-editor/audio-editor.test.tsx`（jsdom；`vi.mock("./open-track")` 與 `vi.mock("./scan")`，`openTrack` 預設回 `{ track: {}, duration: 10, sampleRate: 48000, channels: 2, codec: "pcm-s16", dispose: vi.fn() }`）：顯示檔名；`openTrack` 丟 `new ViewerError("codec_unsupported")` 時顯示 en 字串 `error.codec_unsupported` 的內容且 `onError` 收到同一個 code；丟 `webcodecs_unavailable` 時顯示 `error.webcodecs_unavailable` 的內容；沒改過按關閉與按 `Esc` 都直接呼叫 `onClose`；卸載時 abort signal 被觸發且 `dispose` 被呼叫。
   verify：`pnpm test && pnpm build && pnpm check`（全部 `pnpm test` 是為了確認登錄 `editors.audio` 沒弄壞 03 的測試；弄壞的是 03 的假設，照實際行為修那個測試並在回報列出）
   commit：`feat(audio-editor): open the audio editor from the viewer`
2. 波形與總覽。
   - 新 `src/audio-editor/view.ts`（純函式，型別 `View` 見契約）：`fitView(duration: number, width: number): View`；`timeAt(view, x: number): number`、`xAt(view, t: number): number`；`zoom(view, factor: number, anchorX: number, duration: number): View`（以 anchor 為中心，`secondsPerPixel` 夾在 `1 / sampleRate` 與 `duration / width` 之間，`start` 夾在 0..`duration − width × secondsPerPixel`）；`scroll(view, dx: number, duration: number): View`；`columns(peaks: Peaks, state: AudioEdit, view: View): { min: Float32Array; max: Float32Array; seams: number[] }`（每個像素欄：輸出時間 → `sourceAt`（`src/audio-editor/edit.ts`）→ 用 `levelFor`（`src/audio-editor/peaks.ts`）那層的格子取 min / max（兩聲道合併），乘 `gainAt`（`src/audio-editor/gain.ts`），換成 −1..1；`seams` 是來源不連續接縫的 x）。
   - 新 `src/audio-editor/zoom-window.ts`：`createZoomWindow(track: InputAudioTrack): { get(range: Range): Float32Array[] | null; load(range: Range, signal: AbortSignal): Promise<void> }`（用 `AudioSampleSink.samples(range.start, range.end)` 解出那段 PCM，超過 2 聲道 `downmixToStereo`；只留最近一個視窗；錯誤 `throw toMediaError(e, "decode_failed")`）。`columns` 在每像素不到 `levels[0].framesPerBin` 時由呼叫端改用這個視窗的 sample 畫。
   - 新 `src/audio-editor/waveform.tsx`：`Waveform(props: { peaks: Peaks | null; progress: number; state: AudioEdit; view: View; duration: number; zoomWindow: ReturnType<typeof createZoomWindow>; onViewChange: (v: View) => void; playhead: () => number; overlay?: ReactNode })`。canvas 在 ref callback 建 `ResizeObserver`（寬度變了就 `onViewChange`）與 `requestAnimationFrame` 迴圈，cleanup 時 disconnect 與 `cancelAnimationFrame`；畫布大小乘 `devicePixelRatio`；`aria-label` = `audio.waveform`；顏色每次重畫從 `getComputedStyle(canvas)` 讀形式裡的 `--ak-*`。滾輪捲動、Ctrl + 滾輪縮放（`zoom`）、兩指 pointer 縮放。`overlay` 放在 canvas 上面（給選取層用）。
   - 新 `src/audio-editor/overview.tsx`：`Overview(props: { peaks: Peaks | null; progress: number; state: AudioEdit; duration: number; view: View; onViewChange: (v: View) => void })`：整檔畫一次（用 `fitView`），框出 `view` 的範圍，拖框改 `view.start`；`progress < 1` 時上方畫進度條。
   - `src/audio-editor/editor-body.tsx` 把波形區佔位換成 `Overview` + `Waveform`，view 存在 state；根元素 `onKeyDown` 加 `+` / `-` / `0`。
   - `src/audio-editor/audio-editor.css` 加 `.fv-audio-overview`、`.fv-audio-wave`。
   測試：新 `src/audio-editor/view.test.ts`：`timeAt` / `xAt` 互逆；`zoom` 以 anchor 為中心（anchor 下的時間縮放前後相同）；縮放與捲動都夾在邊界內；`fitView` 讓整段剛好放滿；`columns` 在每像素 1000 frame 時用的是 `framesPerBin ≤ 1000` 的最粗層；淡入區段的欄位振幅遞增；刪掉中間一段後 `seams` 有一條在正確的 x。
   verify：`pnpm test src/audio-editor/view.test.ts src/audio-editor/audio-editor.test.tsx && pnpm check`
   commit：`feat(audio-editor): draw the waveform and overview on the output timeline`
3. 選取與剪輯工具。
   - 新 `src/audio-editor/selection.ts`（純函式）：`SNAP_PX = 8`；`snap(t: number, targets: number[], view: View): number`（離最近 target 的像素距離 ≤ 8 就吸過去）；`dragSelect(anchor: number, t: number, targets, view): Range`；`moveHandle(sel: Range, which: "start" | "end", t: number, targets, view): Range`（拖過另一邊時交換）；`segmentAt(state: AudioEdit, t: number): Range`（雙擊：`boundaries` 裡夾住 t 的兩條）。targets = `boundaries(state)`（`src/audio-editor/edit.ts`）加播放頭。
   - 新 `src/audio-editor/selection-layer.tsx`：`SelectionLayer(props: { view: View; state: AudioEdit; selection: Range | null; playhead: number; silence: Range[]; onSelect: (r: Range | null) => void; onSeek: (t: number) => void })`：pointer 拖曳選取、點一下設播放頭並清掉選取、雙擊選段；兩個把手 `<div className="fv-audio-handle">`，觸控範圍 44 px；`silence` 範圍畫成 `--ak-danger-subtle` 色塊。
   - 新 `src/audio-editor/tools.tsx`：`Tools(props: { selection: Range | null; playhead: number; onApply: (next: AudioEdit) => void; state: AudioEdit; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; children?: ReactNode })`：鍵「刪除」（`cut`）、「只留選取」（`keep`）、「分割」（`split` 在播放頭）、「淡入」「淡出」（`fade`），全部來自 `src/audio-editor/edit.ts`；沒有選取時刪除 / 只留 / 淡入 / 淡出 disabled。每顆鍵是 `<Tooltip content={label}><Button variant="ghost" aria-label={label} icon={<…Icon />} disabled={…}><span className="fv-audio-tool-label">{label}</span></Button></Tooltip>`（`Button` 來自 `src/primitives/button.tsx`、`Tooltip` 來自 `src/primitives/tooltip.tsx`、圖示來自 `src/audio-editor/glyphs.tsx`：`DeleteIcon`、`KeepIcon`、`SplitIcon`、`FadeInIcon`、`FadeOutIcon`）；`children` 放下一步的三個 Popover。`canUndo` / `canRedo` / `onUndo` / `onRedo` 供窄版底部列放 undo / redo 用（寬版的 undo / redo 在頂列）。
   - `src/audio-editor/editor-body.tsx`：selection 與 playhead 存 state；`Waveform` 的 `overlay` 放 `SelectionLayer`；工具列佔位換成 `Tools`；根元素 `onKeyDown` 加 `Delete` / `Backspace`（cut）、`T`（keep）、`S`（split），有選取才動作（split 不需要選取）。
   - `src/audio-editor/audio-editor.css` 加 `.fv-audio-tools`、`.fv-audio-tool-label`、`.fv-audio-handle`、`.fv-audio-selection`，以及 `@container (max-width: 639px)` 的底部 icon 列（藏 `.fv-audio-tool-label`）。
   測試：新 `src/audio-editor/selection.test.ts`：8 px 內吸過去、9 px 不吸；把手拖過另一邊時交換；雙擊選起夾住的兩條邊界；沒有區段邊界時雙擊選整段。新 `src/audio-editor/tools.test.tsx`：沒有選取時刪除 / 只留 / 淡入 / 淡出是 disabled、分割不是；按分割呼叫 `onApply` 且新 state 多一條邊界；選一段按刪除後 `outputDuration` 變短。在 `src/audio-editor/audio-editor.test.tsx` 加（沿用第 1 步的 mock）：按分割後 `onDirtyChange(true)`；之後按關閉先出 `DiscardDialog`、`onClose` 還沒被呼叫，按「放棄修改」才呼叫；按「繼續編輯」關掉對話框且沒呼叫 `onClose`；`Esc` 同樣先出對話框。
   verify：`pnpm test src/audio-editor/selection.test.ts src/audio-editor/tools.test.tsx src/audio-editor/audio-editor.test.tsx && pnpm check`
   commit：`feat(audio-editor): select ranges and cut, keep, split and fade them`
4. 音量、正規化、去掉靜音。三個面板都用 `Popover`（`src/primitives/popover.tsx`，02 P04-4）；不新增 `src/primitives/` 的檔、不改 `src/styles.css` 的 primitives 段。
   - 新 `src/audio-editor/volume-popover.tsx`：`VolumePopover(props: { selection: Range | null; state: AudioEdit; onApply: (next: AudioEdit) => void })`：`<Popover label={t("audio.volume")} trigger={<Button variant="ghost" icon={<VolumeIcon />} disabled={selection === null}><span className="fv-audio-tool-label">{t("audio.volume")}</span></Button>}>`；內容是獨立元件 `VolumePanel`（自己的 `useState` 存 dB），一個 `Slider`（`src/primitives/slider.tsx`）−24..+12 step 0.5、預設 0，「套用」（`audio.apply`）呼叫 `gain(state, selection, db)`（`src/audio-editor/edit.ts`）。
   - 新 `src/audio-editor/normalize-popover.tsx`：`NormalizePopover(props: { peaks: Peaks | null; selection: Range | null; state: AudioEdit; onApply })`：同樣結構，`NormalizePanel` 一個 `Slider` −6..0 step 0.1、預設 `NORMALIZE_DEFAULT_DB`（`src/audio-editor/normalize.ts`）；「套用」用 `normalizeGain` 算出 dB，範圍是選取、沒有選取就整段（`{ start: 0, end: outputDuration(state) }`，`outputDuration` 來自 `edit.ts`），再 `gain(...)`；`peaks` 是 null 時 trigger disabled。
   - 新 `src/audio-editor/silence-popover.tsx`：`SilencePopover(props: { peaks: Peaks | null; state: AudioEdit; onMark: (ranges: Range[]) => void; onApply: (next: AudioEdit) => void })`：`SilencePopover` 自己用 `useState` 存兩個設定（閾值 −70..−20 step 1、最短 0.3..5 step 0.1，初值 `SILENCE_DEFAULTS`，`src/audio-editor/silence.ts`），範圍 `ranges` 也存在 state；`<Popover onOpenChange={(open) => { if (open) mark(settings); else onMark([]); }}>`，其中 `mark(s)` = `findSilence(peaks, state, s)` 算出後 `setRanges` 並 `onMark`；內容是兩個 `Slider`，`onValueChange` 時更新設定並 `mark(新設定)`（事件處理器，不用 effect）；顯示 `audio.silenceFound`（`{count}`）；「刪除這些」（`audio.silenceRemove`）從最後一段往前依序 `cut`，最後只呼叫一次 `onApply`（一步 undo），接著用新 state 重算 `findSilence(peaks, next, settings)`（已無靜音）並 `onMark`；`peaks` 是 null 時 trigger disabled。
   - `src/audio-editor/editor-body.tsx`：三個 Popover 放進 `Tools` 的 `children`；`silence` 標記存 state 傳給 `SelectionLayer`。
   測試：新 `src/audio-editor/volume-popover.test.tsx`：沒有選取時 trigger disabled；有選取時點 trigger、按「套用」，`onApply` 收到的 state 在選取範圍內多一個 `kind: "gain"`、`db` 為 0。新 `src/audio-editor/silence-popover.test.tsx`（假的 `Peaks`：音調 + 2 秒靜音 + 音調 + 2 秒靜音 + 音調）：打開後 `onMark` 最後一次收到 2 段；「刪除這些」只呼叫一次 `onApply`、新 state 總長少 2 × (2 − 0.4) 秒；按 `Esc` 關閉後 `onMark` 最後一次收到 `[]`；關閉再重開，兩個 slider 保持上次的值、`onMark` 收到用那組值算出的範圍；`peaks` 是 null 時 disabled。新 `src/audio-editor/normalize-popover.test.tsx`：沒有選取時套用的 gain 範圍是整段；`peaks` 是 null 時 disabled。
   verify：`pnpm test src/audio-editor && pnpm test:browser src/audio-editor && pnpm build && pnpm check`
   commit：`feat(audio-editor): adjust volume, normalize and remove silence`

## Phase 04 — 播放

blocker：Phase 03；model：opus。

1. 排程計畫。新 `src/audio-editor/plan.ts`（純函式），型別 `Block` 見契約：`plan(state: AudioEdit, from: number, to: number, loop: Range | null): Block[]`。從輸出時間 `from` 走到 `to`（`to − from` 是要排的長度）；每遇到區段邊界就開新的一塊（`srcStart` / `srcEnd` 是來源時間，`outStart` 是這塊的輸出起點）；`loop` 不是 null 時，走到 `loop.end` 就從 `loop.start` 接著走，`outStart` 繼續遞增（用「已排長度」累計，不回頭）；`from` 在 loop 之外而且 loop 不是 null 時，先走到 `loop.end` 再開始循環。用 `src/audio-editor/edit.ts` 的 `sourceAt`、`boundaries`。
   測試：新 `src/audio-editor/plan.test.ts`：單區段一塊；跨兩個區段時兩塊頭尾相接（前一塊的 `outStart + (srcEnd − srcStart)` = 下一塊的 `outStart`）；刪掉中間一段後跳過那段來源；循環 2 秒的選取排 5 秒時塊長加總 = 5 且在 `loop.end` 接回 `loop.start`；從區段中間開始時第一塊的 `srcStart` 正確。
   verify：`pnpm test src/audio-editor/plan.test.ts`
   commit：`feat(audio-editor): plan playback blocks across segments and loops`
2. 播放器與播放列。
   - 新 `src/audio-editor/player.ts`：`createPlayer(ctx: BaseAudioContext, track: InputAudioTrack, getState: () => { edit: AudioEdit; loop: Range | null }, onError: (e: ViewerError) => void): Player`（`ViewerError` 來自 `src/contract/errors.ts`），`Player = { play(from: number): void; pause(): void; seek(t: number): void; position(): number; playing(): boolean; pump(until: number): Promise<void>; dispose(): void }`。`play` 記下 `ctx.currentTime` 與起點，每 250 ms（`setTimeout`，`dispose` 清掉）呼叫 `pump(ctx.currentTime + 1)`。`pump`：用 `src/audio-editor/plan.ts` 的 `plan` 算出還沒排的那段，每塊用 `new AudioBufferSink(track).buffers(srcStart, srcEnd)` 取 `WrappedAudioBuffer`，超過 2 聲道用 `src/audio-editor/gain.ts` 的 `downmixToStereo` 另建 2 聲道的 `AudioBuffer`，`applyGains`（輸出時間 = `outStart + (wrapped.timestamp − srcStart)`），`AudioBufferSourceNode.start(when, offset, duration)` 排上去（`offset` / `duration` 切掉塊外的部分），node 存起來給 `pause` / `seek` 時 `stop()`。`pump` 內的錯誤用 `toMediaError(e, "decode_failed")`（`"../media"`）轉換後 `pause()` 並呼叫 `onError`（由定時器呼叫時不讓 promise 未處理 rejection；直接 `await pump()` 的測試仍會收到 reject）。`position()` 依 `ctx.currentTime` 算輸出時間（循環時折回 loop 內）。編輯改變（`getState` 回的 edit 換了）時 `seek(position())` 重排。
   - 新 `src/audio-editor/transport.tsx`：`Transport(props: { player: Player | null; duration: number; selection: Range | null; loop: boolean; onLoopChange: (on: boolean) => void })`：`Button`（`src/primitives/button.tsx`）加 `Tooltip`（`src/primitives/tooltip.tsx`）：播放 / 暫停（`PlayIcon` / `PauseIcon`）、循環（`LoopIcon`，`aria-pressed`）、跳到開頭 / 結尾（`ToStartIcon` / `ToEndIcon`），圖示來自 `src/audio-editor/glyphs.tsx`，字串 `audio.play` / `audio.pause` / `audio.loop` / `audio.toStart` / `audio.toEnd`；時間碼（`audio.position` 與 `audio.selection` 長度，格式 `m:ss.mmm`，由 `requestAnimationFrame` 在 ref callback 裡更新、cleanup 取消）。
   - `src/audio-editor/editor-body.tsx`：根元素的 ref callback 在 `openTrack` 成功後 `new AudioContext()` + `createPlayer(ctx, opened.track, getState, root.report)`，cleanup 時 `player.dispose()` 與 `ctx.close()`；播放列佔位換成 `Transport`；`Waveform` 的 `playhead` 讀 `player.position()`；根元素 `onKeyDown` 加空白鍵（播放 / 暫停）、`L`（循環）、`Home` / `End`。
   - `src/audio-editor/audio-editor.css` 加 `.fv-audio-transport`。
   測試：新 `src/audio-editor/player.browser.test.ts`（`new OfflineAudioContext(2, 48000 × 秒數, 48000)`，來源用 `src/audio-editor/testing/synth-wav.ts` 的 440 Hz、振幅 0.5 正弦波經 `openTrack` 打開；`play(0)` 後直接 `await pump(總長)` 再 `startRendering()`；`onError` 用 `vi.fn()`）：循環 2 秒選取 5 次，渲染長度正確且第 2.0 秒前後沒有整段 0（無空隙）；循環接縫與刪除剪點前後相鄰 sample 的差 ≤ `2π × 440 / 48000 × 0.5 × 1.1`（無爆音，接縫有 5 ms 淡化）；有淡入時第一個 sample 是 0；`AudioBufferSink` 的 `buffers` 丟錯時（`vi.spyOn`）`pump` reject 的錯誤 `.code` 是 `decode_failed`。
   verify：`pnpm test:browser src/audio-editor/player.browser.test.ts && pnpm test src/audio-editor && pnpm check`
   commit：`feat(audio-editor): play the edit with gapless loops`

## Phase 05 — 輸出

blocker：Phase 04；第 2 步要 06 P01-3（`createBlobSink`）已合併；model：opus。

1. 可用格式。新 `src/audio-editor/formats.ts`，型別 `FormatId`、`OutputChoice` 見契約：
   - `FORMATS: Record<FormatId, { codec: AudioCodec; ext: ".m4a" | ".ogg" | ".wav"; mime: "audio/mp4" | "audio/ogg" | "audio/wav"; bitrates: number[] | null; defaultBitrate: number | null }>`（aac：`[128000, 192000]` 預設 192000；opus：`[96000, 128000, 160000]` 預設 128000；wav：`"pcm-s16"`、null）
   - `outputSampleRate(format: FormatId, sourceRate: number): number`（aac：44100 / 48000 原樣、其他 48000；opus：48000；wav：原樣）
   - `availableFormats(canEncode: (codec: AudioCodec, o: { numberOfChannels: number; sampleRate: number }) => Promise<boolean>, channels: 1 | 2, sourceRate: number): Promise<FormatId[]>`（依 aac、opus、wav 的順序；wav 一律列入不查；`canEncode` 的預設由呼叫端傳 mediabunny 的 `canEncodeAudio`）
   - `defaultFormat(sourceCodec: AudioCodec | null, available: FormatId[]): FormatId`（`pcm-*` 或 `flac` → wav；否則 aac 在就 aac、再來 opus、最後 wav）
   - `estimateBytes(choice: OutputChoice, outFrames: number, channels: 1 | 2, sampleRate: number): number`（wav：`outFrames × channels × 2 + 44`；其他：`bitrate × (outFrames / sampleRate) × 1.05 / 8`，無條件進位）
   - `isSameFormatLost(sourceCodec: AudioCodec | null): boolean`（`mp3` 或 `flac` 為 true）
   測試：新 `src/audio-editor/formats.test.ts`（假的 `canEncode`）：三種都能編時順序是 aac、opus、wav；只能編 opus 時是 opus、wav；都不能編時只剩 wav；`pcm-s16` 與 `flac` 來源預設 wav；mp3 來源在沒有 aac 時預設 opus；22050 Hz 來源的 aac 輸出 48000；估計大小公式（wav 10 秒 48 kHz 立體聲 = 1920044）。
   verify：`pnpm test src/audio-editor/formats.test.ts`
   commit：`feat(audio-editor): pick output formats the browser can encode`
2. 串流輸出。新 `src/audio-editor/export.ts`：`exportAudio(o: { opened: OpenedTrack; edit: AudioEdit; choice: OutputChoice; maxOutputBytes?: number; signal: AbortSignal; onProgress?: (fraction: number) => void }): Promise<Blob>`。
   - 先用 `src/audio-editor/formats.ts` 的 `estimateBytes`（`outFrames = round(outputDuration(edit) × opened.sampleRate)`，聲道 = `min(opened.channels, 2)`）估大小，超過 `maxOutputBytes` 就丟 `new ViewerError("output_too_large")`（`src/contract/errors.ts`），不讀任何 sample。
   - `const sink = createBlobSink({ maxBytes: o.maxOutputBytes })`（`"../media"`，預設 layout）；`new Output({ format, target: new StreamTarget(sink.writable) })`（`StreamTarget` 來自 `mediabunny`），format 照 `FORMATS[choice.format]`：aac → `new Mp4OutputFormat({ fastStart: false })`、opus → `new OggOutputFormat()`、wav → `new WavOutputFormat()`；`new AudioSampleSource({ codec, bitrate: choice.bitrate ?? undefined, transform: { sampleRate: outputSampleRate(...) } })`，`output.addAudioTrack(source)`，`await output.start()`。
   - 依序對每個區段：`new AudioSampleSink(opened.track).samples(seg.in, seg.out)`，每個 sample 用 `copyTo` 的 `frameOffset` / `frameCount` 切掉落在 `[seg.in, seg.out)` 之外的 frame，拷成 `f32-planar` planes，超過 2 聲道 `downmixToStereo`，`applyGains`（`src/audio-editor/gain.ts`，`t0` 是這段在輸出時間軸上的位置），組成一塊 planar `Float32Array`，`new AudioSample({ data, format: "f32-planar", numberOfChannels, sampleRate: opened.sampleRate, timestamp: 輸出時間 })`，`await source.add(sample)`，然後兩個 sample 都 `close()`；每塊之後 `onProgress(已輸出長度 / 總長)`。
   - 結束 `await output.finalize()`，回 `sink.toBlob(FORMATS[choice.format].mime)`。`signal` abort 時 `await output.cancel()`（`sink` 丟掉不用）並丟 `signal.reason`；其他錯誤（含 sink 的 `output_too_large`）一律 `throw toMediaError(e, "decode_failed")`（`"../media"`）。
   測試：新 `src/audio-editor/export.browser.test.ts`（來源用 `src/audio-editor/testing/synth-wav.ts`，經 `src/audio-editor/open-track.ts` 的 `openTrack` 打開；輸出的 Blob 用 `bytesSource(new Uint8Array(await blob.arrayBuffer()))` 再 `openTrack` 讀回）：10 秒來源切成 3 個區段（刪掉兩段）+ 開頭淡入 + 結尾淡出 + 正規化到 −1 dB，輸出 WAV：讀回的 frame 數等於 3 段相加（誤差 ≤ 1 frame）、峰值在 −1 dBFS ± 0.2；同一段輸出 opus：讀回的長度誤差 < 30 ms；輸出 aac（`canEncodeAudio("aac", …)` 為 false 的環境跳過這一案）：讀回的長度誤差 < 30 ms 且 `blob.type` 是 `audio/mp4`（驗證 `fastStart: false` 回頭改檔頭落在 sink 的檔頭內）；`maxOutputBytes: 1000` 時丟 `output_too_large` 且 `AudioSampleSink` 沒被建（`vi.spyOn`）；來源 WAV 估計值低於 `maxOutputBytes` 但實際輸出超過時（`maxOutputBytes` 設成估計值的一半並 `vi.spyOn` 讓 `estimateBytes` 回 0），丟的錯誤 `.code` 是 `output_too_large`；開始後 abort 會 reject 且 `onProgress` 不再被呼叫；合成 20 分鐘 48 kHz 立體聲 WAV 輸出成 WAV 時 `performance.memory.usedJSHeapSize` 增加 < 100 MB（沒有 `performance.memory` 就跳過這一斷言）。
   verify：`pnpm test:browser src/audio-editor/export.browser.test.ts && pnpm check`
   commit：`feat(audio-editor): stream the edit into m4a, ogg or wav`
3. 輸出對話框與存檔。
   - 新 `src/audio-editor/export-dialog.tsx`：`ExportDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; opened: OpenedTrack; edit: AudioEdit; fileName: string; maxOutputBytes?: number; onSave: SaveHandler; onDone: () => void; onError?: (e: ViewerError) => void; canEncode?: (codec: AudioCodec, o: { numberOfChannels: number; sampleRate: number }) => Promise<boolean>; runExport?: typeof exportAudio })`（`canEncode` 預設 mediabunny 的 `canEncodeAudio`、`runExport` 預設 `src/audio-editor/export.ts` 的 `exportAudio`，只為測試注入；`SaveHandler`、`suggestedName` 來自 `src/contract/save.ts`，`ViewerError` 來自 `src/contract/errors.ts`；`const t = useT(audioMessages)`、`const tc = useT(commonMessages)`）。用 `Dialog`（`src/primitives/dialog.tsx`，`title={t("audio.exportTitle")}`，`footer` 放「開始」（`audio.start`）與「取消」（`common.cancel`）的 `Button`）：打開時跑 `availableFormats` 與 `defaultFormat`（`src/audio-editor/formats.ts`）；格式用 `RadioGroup`（`src/primitives/radio-group.tsx`，`label={t("audio.format")}`，選項字串 `audio.formatAac` / `audio.formatOpus` / `audio.formatWav`，opus 選項的 `description` 是 `audio.opusNote`）；`isSameFormatLost` 時顯示 `audio.noSameFormat`；位元率用另一個 `RadioGroup`（`label={t("audio.bitrate")}`，`value` 是 `String(bps)`，選項 label `${bps / 1000} kbps`，列 `FORMATS[f].bitrates`；wav 不顯示）；`audio.estimatedSize`（`{size}` 是 MB，一位小數）；估計超過 `maxOutputBytes` 時顯示 `audio.tooLarge`、「開始」disabled、`onError(new ViewerError("output_too_large"))`。按「開始」：`runExport`，進度用 `Progress`（`src/primitives/progress.tsx`，`label={t("audio.exporting")}`、`value` = 進度 0..1）加 `audio.remaining`（`{time}` = `已用秒數 × (1 − p) / p` 的 `m:ss`，p < 0.02 時不顯示）；「取消」abort 並回到選格式的畫面。`runExport` 失敗（非 abort）時在對話框顯示 `tc(\`error.${e.code}\`)`（`e` 是 `ViewerError`）並 `onError(e)`。完成後 `await onSave({ blob, mime, ext, mode: "export", suggestedName: suggestedName(fileName, ext, "export") })`；resolve → `onDone()`；reject → 留在對話框，顯示 `e.message`（空字串才用 `tc("error.save_failed")`），`onError(new ViewerError("save_failed", { cause: e }))`。輸出中 `onOpenChange(false)`（`Esc`、點外面）不直接關：內部 state 開一個 `ConfirmDialog`（`src/primitives/dialog.tsx`，`title={t("audio.exportClosing")}`、`description={t("audio.exportClosingBody")}`、`confirmLabel={t("audio.exportClosingConfirm")}`、`cancelLabel={t("audio.exportKeep")}`、`danger`），`onConfirm` 才 abort 並呼叫 `props.onOpenChange(false)`；不在輸出中時照常關閉。
   - `src/audio-editor/editor-body.tsx`：頂列「輸出」在 `status === "ready"` 時 enable，打開 `ExportDialog`（`onError={root.report}`）；`onDone` 呼叫 `props.onClose()`。
   - `src/audio-editor/audio-editor.css` 加 `.fv-audio-export`、`.fv-audio-progress`。
   測試：新 `src/audio-editor/export-dialog.test.tsx`（jsdom；假的 `canEncode` 與 `runExport`）：只能編 opus 時只列 opus 與 wav、預設 opus；`maxOutputBytes` 太小時「開始」disabled 且顯示 `tooLarge` 的字串；完成後 `onSave` 收到 `mode: "export"`、`ext: ".ogg"`、`mime: "audio/ogg"`、`suggestedName` 等於 `suggestedName(fileName, ".ogg", "export")`，然後 `onDone`；`onSave` reject 時對話框還開著、顯示錯誤訊息、`onDone` 沒被呼叫、`onError` 收到 `save_failed`；按「取消」後 `runExport` 收到的 signal 是 aborted、`onSave` 沒被呼叫；輸出中按 `Esc` 先出 `exportClosing` 對話框、`onOpenChange` 還沒被呼叫，按「繼續輸出」後仍在輸出，按「停止並關閉」後 signal aborted 且 `onOpenChange(false)` 被呼叫；mp3 來源顯示 `noSameFormat`；`runExport` 丟 `output_too_large` 時顯示 `error.output_too_large` 的字串。
   verify：`pnpm test && pnpm test:browser src/audio-editor && pnpm build && pnpm check`
   commit：`feat(audio-editor): export the edit and hand it to the host`

驗收（主 agent，本機 `pnpm site:dev` 的 playground，給 CEO 自己開）：開一支音訊 → 編輯 → 選一段刪掉 → 開頭淡入、結尾淡出 → 正規化 → 去掉靜音 → 選一段循環播放 → 輸出 m4a（Firefox 是 ogg）→ 下載的檔在 Chrome、Safari、Firefox 與 QuickTime（ogg 除外）都能播；鍵盤（空白鍵、`L`、`S`、Delete、Esc）；390 px 寬；亮暗兩種。

## 之後再做

- 多軌、混音、節拍格線、MIDI、效果鏈（要做時另開一份，從 07 的時間軸與 command 模式長出來）。
- EQ、壓縮、降噪、變速不變調。
- 響度（LUFS，ITU-R BS.1770）正規化。
- MP3 / FLAC 輸出（要同源 worker 跑 wasm 編碼器；MP3 牽涉 LAME 的 LGPL）。
- 從影片抽出聲音來剪。
- 專案檔（下次接著剪）。
- 頻譜圖。
- 錄音。
