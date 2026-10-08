# 08 audio-editor — 單軌音訊剪輯：看波形、選範圍、修剪 / 分割 / 刪除、淡入淡出、音量與正規化、去掉靜音、循環播放，輸出成新檔

狀態：planned（2026-10-08；設計與選型照搬 storage 15，2026-10-05 CTO 定）；blocker：02 contract（型別、i18n、primitives）、03 viewer-core（editor 分派表）、06 media-io（`src/media/`）；model：Phase 01–02 sonnet、Phase 03–05 opus；push：整份做完一次（v0.2 等 07 也做完才發）。

執行方式：每一步交給一個獨立 subagent，只讀本檔頭部（到「形式」為止）和自己那一步，做完 commit 就停。步驟用到的跨步驟型別都定在「契約 · 本模組內部型別」，外部符號都在「契約 · 外部符號」。

撞檔與先後：

- 07 video-editor 同時進行，兩邊只寫自己的目錄（`src/video-editor/`、`src/audio-editor/`）。共同會碰的只有 `package.json` 的 `exports`、`tsdown.config.ts` 的 `entry`、`src/styles.css`、`src/i18n/{en,zh-TW,messages}.ts`、`src/viewer/editor-loaders.ts`、`src/primitives/`（本 plan 新增 `popover.tsx`）。都是追加，誰後到誰 rebase、兩邊都留；07 要用 popover 就用本 plan 的這一份。
- 不改 `src/media/`（06）與 `src/contract/`（02）。外部符號跟下表不符時：照實際存在的名字改用，並在回報列出差異；實際不存在就停下回報，不自己補進別人的目錄。

宿主要做的事（不寫進 step）：H1 Phase 2 把 SDK 的 `files.reader` 包成 `ByteSource`（`vaultSource`）、用配額算 `maxOutputBytes`、`onSave` 接 `saveFile` 並處理撞名（`<name> (edited) 2.m4a`）、存好後在預覽打開新檔。H2 不開音訊編輯（不給音訊傳 `onSave`）。

## 判斷

- **照搬 storage 15，不重開。** 單軌、非破壞；mediabunny + WebCodecs 解碼與編碼，Web Audio 播放；波形自己用 Canvas2D 畫。不用 wavesurfer.js（沒有 peaks 時整檔 `decodeAudioData`）、peaks.js（LGPL-3.0）、`@mediabunny/*-encoder`（`blob:` worker，mp3 版含 LGPL 的 LAME）、ffmpeg.wasm（GPL）。本 plan 不加新套件：mediabunny 由 06 加、鎖版本、寫進 `THIRD_PARTY_NOTICES.md`；`@base-ui/react` 由 02 加。
- **邊界。** 本體在 `src/audio-editor/`，只認 `ByteSource`、`SaveHandler` 與回呼。來源只用隨機 `read`，經 06 接成 mediabunny 的 `Input`；成品經 06 的 blob sink 收成 `Blob`。不整檔讀，所以超過 `previewBytes` 的檔照樣能編（overview §1）。
- **能不能編輯歸 02 的 `kindOf`**（mime 清單與副檔名照 storage 15 §2；沒有 mime 的 `.webm` 算影片）。本 plan 不改 `kindOf`。
- **能不能解交給 mediabunny。** 打開後 `track.canDecode()`：PCM（WAV）mediabunny 自己解；壓縮格式走 WebCodecs `AudioDecoder`（Chrome / Edge 94、Firefox 130、Safari 26 起；Firefox Android 沒有）。解不了就在編輯器裡顯示 `codec_unsupported`，「編輯」按鈕不用另外查 WebCodecs。
- **聲道。** 單聲道、立體聲照原樣。超過 2 聲道的，波形、播放、輸出都先混成立體聲，混法照 Web Audio 規格的 down-mix：4 聲道 `L = 0.5(L + SL)`、`R = 0.5(R + SR)`；6 聲道 `L = L + 0.7071(C + SL)`、`R = R + 0.7071(C + SR)`（LFE 丟掉）；其他聲道數只留前兩個。
- **狀態是純資料**（型別見契約）。`segments` 是依輸出順序排的來源區段（秒），`gains` 在輸出時間軸上。所有操作都是 `edit.ts` 的純函式；正規化與去掉靜音只算出要加的 `gain` 或要 `cut` 的範圍，再走同一組函式。
- **undo / redo。** `useReducer` 加兩個快照堆疊，各 200 步。去掉靜音的整批刪除算一步。
- **增益。** 同一時間點上的 gain 相乘；淡入 `sin(πx/2)`、淡出 `cos(πx/2)`（x 是在區間裡的位置 0..1），不給曲線選項。兩個區段接起來而且來源不連續（`prev.out ≠ next.in`）的地方，接縫兩側各加 5 ms 的短淡出、淡入。播放與輸出呼叫同一個 `applyGains`：聽到的就是輸出的。
- **正規化。** 峰值正規化到 −1 dBFS（可調 −6 到 0），範圍是選取或整段。用峰值表算、不重新解碼：每格的最大振幅乘上那一格裡最大的 gain，取全部的最大值。峰值表往外取整，所以結果絕不超過目標。
- **去掉靜音。** 低於 −50 dBFS（可調 −70 到 −20）、連續至少 1 秒（可調 0.3 到 5）算靜音，兩側各留 0.2 秒。只看峰值表。先在波形上標出來，按「刪除這些」才執行。
- **峰值表與記憶體。** 打開後依序跑一遍 `AudioSampleSink.samples()`，每個 `AudioSample` 拷進每聲道一塊重複使用的 `Float32Array`、更新 min / max、`close()`，不留整段 PCM。每格 256 frame；總格數超過 2^21 時每格加倍直到不超過。min、max 存 `Int16Array`（min 往下、max 往上取整），最大 16 MiB。往上建每層粗 4 倍的縮圖層，直到 ≤ 1024 格。這一遍邊跑邊畫、有進度；播放、選取、刪除一開始就能用，正規化與去掉靜音等它跑完。
- **畫。** Canvas2D，只畫看得到的寬度，乘 `devicePixelRatio`。每像素對到幾個 frame，就挑 `framesPerBin` 不大於它的最粗一層；放大到每像素不到一格時，只解碼畫面上那一段直接畫 sample，只快取這一個視窗。畫的是輸出時間軸，振幅乘上 gain；來源不連續的接縫畫一條細線。顏色在畫的時候從 canvas 的 computed style 讀 `--ak-*`。
- **播放。** 一個 `AudioContext`，以 `currentTime` 當時鐘，排程器往前排 1 秒：`AudioBufferSink.buffers(start, end)` 取塊、套 `applyGains`、`AudioBufferSourceNode.start(when, offset, duration)` 一塊接一塊排。循環播放時排到選取終點就從起點接著排，沒有空隙；不用 `AudioBufferSourceNode.loop`。取樣率不同由 Web Audio 自己轉。
- **輸出格式**（2026-10-05 查過：Chrome / Edge 只編 Opus 與 AAC，AAC 用 OS 編碼器、Linux 沒有、只收 1 / 2 / 6 聲道與 44.1 / 48 kHz；Firefox 130 起只編 Opus 與 Vorbis；Safari 26 起 AAC 與 Opus；沒有瀏覽器編 MP3 或 FLAC；PCM 由 mediabunny 自己編）。只列 `canEncodeAudio` 回 true 的：
  - AAC：`.m4a`、`new Mp4OutputFormat({ fastStart: false })`、codec `"aac"`、128 / 192 kbps（預設 192）；來源不是 44100 / 48000 Hz 的轉成 48000。
  - Opus：`.ogg`、`new OggOutputFormat()`、codec `"opus"`、96 / 128 / 160 kbps（預設 128）、一律 48000 Hz。QuickTime 不播 Ogg，選項旁註明。
  - WAV：`.wav`、`new WavOutputFormat()`、codec `"pcm-s16"`、原取樣率。
  - 預設：來源 codec 是 `pcm-*` 或 `flac` 就選 WAV；其他選 AAC，不能編 AAC 就選 Opus。MP3、FLAC 來源存不回原格式，對話框寫明。取樣率轉換用 `AudioEncodingConfig.transform.sampleRate`，不自己寫重取樣。
- **輸出也是串流。** 每個區段跑 `samples(in, out)`，頭尾用 `copyTo` 的 `frameOffset` / `frameCount` 切齊，套 `applyGains`，建成輸出時間上的新 `AudioSample`，`await AudioSampleSource.add()`（背壓）。WAV 與非 fragmented MP4 收尾時回頭改檔頭，靠 06 的 blob sink 留住檔頭 1 MiB。
- **輸出上限。** 開始前估大小，超過 `maxOutputBytes` 就不讓開始，`onError` 收 `output_too_large`。可以中途取消，取消後不呼叫 `onSave`。
- **存檔永遠是另存。** `mode: "export"`，按鈕寫「輸出」（理由：storage 15 §2，重新編碼有損、MP3 / FLAC 存不回）。`onSave` resolve 就呼叫 `onClose`；reject 就留在輸出對話框、顯示 `error.message`，`onError` 收 `save_failed`。
- **生命週期不用 `useEffect`。** canvas、`AudioContext`、mediabunny `Input`、`ResizeObserver`、`requestAnimationFrame` 都掛在 ref callback 加 cleanup；鍵盤用編輯器根元素（`tabIndex={0}`）的 `onKeyDown`，不掛 window；`onDirtyChange` 在 dispatch 的包裝裡呼叫。卸載時同一個 `AbortController` 取消所有讀取。
- **不開 worker、不放寬 CSP、不發請求、不寫 IndexedDB / OPFS / localStorage。**

## 契約

只加不改 overview §3。

### 對外

- subpath `./audio-editor`：`export { AudioEditor }`、`export type { AudioEditorProps }`。主入口 `src/index.ts` 不 import 它；`src/viewer/editor-loaders.ts`（03）的 `audio` 項用 dynamic import 載入。
- `AudioEditorProps = EditorProps`（`src/viewer/editor-props.ts`，03），預期形狀：
  `{ file: FileRef; onSave: SaveHandler; onClose: () => void; onDirtyChange?: (dirty: boolean) => void; maxOutputBytes?: number; locale?: Locale; messages?: Partial<Messages>; theme?: "light" | "dark"; onError?: (e: ViewerError) => void }`。`maxOutputBytes` 不給 = 不擋。
- `SaveRequest`：`mode: "export"`；`mime` + `ext` 是 `"audio/mp4"` + `".m4a"`、`"audio/ogg"` + `".ogg"`、`"audio/wav"` + `".wav"`；`suggestedName = suggestedName(file.name, ext, "export")`。
- 用到的錯誤碼（都在 §3）：`codec_unsupported`、`read_failed`（06 包好丟出）、`decode_failed`、`output_too_large`、`save_failed`。
- `src/primitives/popover.tsx`：`Popover({ trigger: ReactNode; label: string; children: ReactNode })`，`@base-ui/react/popover` 的 `Root` / `Trigger` / `Portal` / `Positioner` / `Popup`，class `fv-popover`。

### 外部符號（本 plan 假設存在；名字不同照實際的用，並回報）

| 出處 | 檔 | 符號 |
| --- | --- | --- |
| 02 | `src/contract/byte-source.ts` | `ByteSource`、`bytesSource(bytes: Uint8Array): ByteSource` |
| 02 | `src/contract/file-ref.ts` | `FileRef` |
| 02 | `src/contract/save.ts` | `SaveHandler`、`SaveRequest`、`suggestedName(name: string, ext: string, mode: SaveRequest["mode"]): string` |
| 02 | `src/contract/errors.ts` | `ViewerError`（`new ViewerError(code: ViewerErrorCode, options?: { message?: string; cause?: unknown })`）、`ViewerErrorCode` |
| 02 | `src/i18n/messages.ts`、`en.ts`、`zh-TW.ts` | `Messages`（扁平 key，`"audioEditor.close"` 這種）、`en`、`zhTW`、`useT(): (key: keyof Messages, vars?: Record<string, string \| number>) => string`（`{name}` 代入） |
| 02 | `src/primitives/` | `button.tsx` 的 `Button`、`dialog.tsx` 的 `Dialog`（`open`、`onOpenChange`、`title`、`children`、`footer`）、`slider.tsx` 的 `Slider`（`min`、`max`、`step`、`value`、`onValueChange`、`label`）、`tooltip.tsx` 的 `Tooltip` |
| 03 | `src/viewer/editor-props.ts` | `EditorProps`（形狀見上） |
| 03 | `src/viewer/editor-loaders.ts` | `editorLoaders: Partial<Record<EditKind, () => Promise<ComponentType<EditorProps>>>>` |
| 06 | `src/media/source.ts` | `openInput(source: ByteSource, signal?: AbortSignal): Input`（mediabunny `Input` + `CustomSource`，讀取錯誤丟 `ViewerError("read_failed")`） |
| 06 | `src/media/blob-sink.ts` | `createBlobSink(): { target: StreamTarget; blob(mime: string): Blob }` |
| 01 | 測試設定 | `*.test.ts(x)` 走 jsdom（`pnpm test <path>`）；`*.browser.test.ts` 走 Chromium（`pnpm test:browser <path>`） |
| mediabunny（06 鎖的版本，1.61.x 已查過 d.ts） | `mediabunny` | `Input`、`InputAudioTrack`（`getPrimaryAudioTrack`、`canDecode()`、`codec`、`sampleRate`、`numberOfChannels`、`computeDuration()`）、`AudioSampleSink.samples(start?, end?)`、`AudioBufferSink.buffers(start?, end?)` → `WrappedAudioBuffer { buffer, timestamp, duration }`、`AudioSample`（`copyTo(dest, { planeIndex, format, frameOffset, frameCount })`、`numberOfFrames`、`timestamp`、`close()`、`new AudioSample({ data, format, numberOfChannels, sampleRate, timestamp })`）、`AudioSampleSource`（`new AudioSampleSource({ codec, bitrate, transform: { sampleRate } })`、`add()`）、`Output`（`addAudioTrack`、`start`、`finalize`、`cancel`）、`Mp4OutputFormat`、`OggOutputFormat`、`WavOutputFormat`、`BufferTarget`、`canEncodeAudio(codec, { numberOfChannels, sampleRate })`、`AudioCodec` |

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
export type OpenedTrack = { input: Input; track: InputAudioTrack; duration: number; sampleRate: number; channels: number; codec: AudioCodec | null };

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

### i18n（`src/i18n/` 加 `audioEditor.*`，en / zh-TW）

| key | en | zh-TW |
| --- | --- | --- |
| close / undo / redo / export | Close / Undo / Redo / Export | 關閉 / 復原 / 重做 / 輸出 |
| scanning | Reading waveform… | 正在讀取波形… |
| codecUnsupported | This browser can't decode this file's audio. | 這個瀏覽器解不了這個檔的編碼。 |
| discardTitle / discardBody | Discard this edit? / Your changes haven't been exported. | 放棄這次的剪輯？ / 改過的內容還沒輸出。 |
| discard / keepEditing | Discard / Keep editing | 放棄 / 繼續剪 |
| exportClosing | Stop exporting and close? | 停止輸出並關閉？ |
| play / pause / loop | Play / Pause / Loop selection | 播放 / 暫停 / 循環播放選取 |
| toStart / toEnd / position / selection | Go to start / Go to end / Position / Selection | 跳到開頭 / 跳到結尾 / 位置 / 選取長度 |
| delete / keepSelection / split | Delete / Keep selection / Split | 刪除 / 只留選取 / 分割 |
| fadeIn / fadeOut / volume | Fade in / Fade out / Volume | 淡入 / 淡出 / 音量 |
| normalize / normalizeTarget / apply | Normalize / Peak level / Apply | 正規化 / 峰值 / 套用 |
| removeSilence / silenceThreshold / silenceMinLength | Remove silence / Threshold / Minimum length | 去掉靜音 / 閾值 / 最短長度 |
| silenceFound / silenceRemove | {count} silent ranges / Delete these | 找到 {count} 段靜音 / 刪除這些 |
| exportTitle / format / bitrate | Export audio / Format / Bitrate | 輸出音訊 / 格式 / 位元率 |
| formatAac / formatOpus / formatWav | AAC (.m4a) / Opus (.ogg) / WAV (lossless) | AAC（.m4a）/ Opus（.ogg）/ WAV（無損） |
| opusNote | QuickTime can't play .ogg files. | QuickTime 播不了 .ogg。 |
| noSameFormat | MP3 and FLAC can't be exported in their own format. | MP3 與 FLAC 無法輸出成原格式。 |
| estimatedSize / remaining | About {size} / {time} left | 約 {size} / 剩 {time} |
| start / cancel | Start / Cancel | 開始 / 取消 |
| tooLarge | Too large to export. Pick a lower bitrate or a compressed format. | 太大了，請改用較低的位元率或壓縮格式。 |

## 形式

`AudioEditor` 撐滿 viewer 的容器（不自己開 modal），根元素 class `fv-audio`，由上到下：

- 頂列 `fv-audio-top`：「關閉」、檔名、undo / redo、「輸出」。
- 波形：上面一條總覽 `fv-audio-overview`（整檔，框出目前看到的範圍，可以拖；峰值表還在跑時上方一條進度），下面主波形 `fv-audio-wave`。滾輪捲動，Ctrl + 滾輪或雙指縮放，`+` `-` `0`（0 = 整段放進畫面）。拖曳選取，兩邊把手可拖，吸附到播放頭與區段邊界；雙擊兩條邊界之間選起那一段。
- 播放列 `fv-audio-transport`：播放 / 暫停（空白鍵）、循環（`L`）、`Home` / `End`、時間碼（`位置 m:ss.mmm`、`選取長度 m:ss.mmm`）。
- 工具列 `fv-audio-tools`：刪除（`Delete` / `Backspace`）、只留選取（`T`）、分割（`S`）、淡入、淡出、音量（Popover + Slider，−24 到 +12 dB，step 0.5）、正規化（Popover + Slider，−6 到 0 dB，step 0.1）、去掉靜音（Popover：閾值 −70 到 −20 dBFS step 1、最短 0.3 到 5 秒 step 0.1；即時標出範圍，「刪除這些」才執行）。沒有選取時要範圍的鍵 disabled（正規化沒選取 = 整段，不 disabled）；峰值表跑完前正規化與去掉靜音 disabled。undo / redo：`Ctrl/⌘ + Z`、`Ctrl/⌘ + Shift + Z`。
- 寬度 < 640 px（container query `@container (max-width: 639px)`）：工具列變成底部一排只有 icon 的鍵（`aria-label` 用 i18n 字），波形佔滿寬度；選取把手觸控範圍至少 44 px。
- 輸出對話框（`Dialog`）：格式、位元率、估計大小、進度條加剩餘時間、取消。
- 改過沒輸出就按「關閉」或 `Esc`：`Dialog` 問 `discardTitle`。輸出中關閉先問 `exportClosing`。
- 顏色：底 `--ak-surface`、波形 `--ak-text-muted`、選取 `--ak-accent-subtle`、播放頭 `--ak-accent`、接縫 `--ak-border-strong`、標出的靜音 `--ak-danger-subtle`、文字 `--ak-text`。

## Phase 01 — 編輯模型

blocker：02；model：sonnet。純函式，不碰 DOM 與 mediabunny，可和 03、06 平行。

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

blocker：Phase 01；第 3 步要 06 已合併；model：sonnet。

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
3. 打開音軌與掃峰值。新三個檔：
   - `src/audio-editor/testing/synth-wav.ts`：`synthWavSource(o: { seconds: number; sampleRate: number; channels: number; tone: (t: number, ch: number) => number }): ByteSource`（`ByteSource` 來自 `src/contract/byte-source.ts`；16-bit PCM WAV，`read(start, end)` 依公式算出那段 bytes，整檔不放記憶體；不從 `src/audio-editor/index.ts` export）
   - `src/audio-editor/open-track.ts`：`openTrack(source: ByteSource, signal: AbortSignal): Promise<OpenedTrack>`（`src/media/source.ts` 的 `openInput` → `input.getPrimaryAudioTrack()`；沒有音軌或 `track.canDecode()` 是 false 就 `input.dispose()` 並丟 `new ViewerError("codec_unsupported")`（`src/contract/errors.ts`）；`duration` 用 `track.computeDuration()`）
   - `src/audio-editor/scan.ts`：`scanPeaks(t: OpenedTrack, o: { signal: AbortSignal; onProgress?: (builder: PeakBuilder) => void }): Promise<Peaks>`（`new AudioSampleSink(t.track).samples()`；每個 sample 對每個 `planeIndex` `copyTo(buf, { planeIndex, format: "f32-planar" })` 進重複使用的 `Float32Array`（不夠大才重配），超過 2 聲道先 `src/audio-editor/gain.ts` 的 `downmixToStereo`，`PeakBuilder.push`、`sample.close()`；每 0.25 秒的音訊呼叫一次 `onProgress`；`signal.aborted` 時停下丟 `signal.reason`；mediabunny 解碼丟錯包成 `new ViewerError("decode_failed", { cause })`，已是 `ViewerError` 的原樣丟出）
   測試：新 `src/audio-editor/scan.browser.test.ts`：3 秒 48 kHz 立體聲 WAV 的峰值等於直接用 `PeakBuilder` 算公式樣本的結果；6 聲道 WAV 混成立體聲；用 mediabunny `Output` + `BufferTarget` + `OggOutputFormat` 先編一段 Opus 再掃得完、時長誤差 < 30 ms；`bytesSource(new Uint8Array(64))` 丟 `codec_unsupported`；開始後 abort 會 reject；合成 30 分鐘 48 kHz 立體聲 WAV 掃完後 `performance.memory.usedJSHeapSize`（型別寫 `Performance & { memory?: { usedJSHeapSize: number } }`，沒有就跳過這一斷言）比開始時多不到 100 MB。
   verify：`pnpm test:browser src/audio-editor/scan.browser.test.ts && pnpm test src/audio-editor && pnpm check`
   commit：`feat(audio-editor): open audio tracks and scan peaks while streaming`

## Phase 03 — 編輯器畫面與波形

blocker：Phase 02、03 viewer-core 已合併；model：opus。

1. 編輯器外框、入口與全部字串。
   - `src/i18n/messages.ts` 的 `Messages` 加契約 i18n 表的全部 `audioEditor.*` key；`src/i18n/en.ts`、`src/i18n/zh-TW.ts` 照表加字串。
   - 新 `src/audio-editor/audio-editor.tsx`：`AudioEditor(props: EditorProps)`（`EditorProps` 來自 `src/viewer/editor-props.ts`）。根元素 `<div className="fv-audio" tabIndex={0} onKeyDown={…}>`，內含頂列（`src/primitives/button.tsx` 的 `Button`：關閉、undo、redo、輸出（本步 disabled））、檔名、波形區佔位 `<div className="fv-audio-wave-slot">`、播放列佔位、工具列佔位。根元素的 ref callback：建 `AbortController`，`openTrack(props.file.source, signal)`（`src/audio-editor/open-track.ts`）→ `scanPeaks`（`src/audio-editor/scan.ts`），結果放進 state（`status: "opening" | "scanning" | "ready" | "error"`、`opened`、`peaks`、`progress`）；cleanup 時 abort 並 `opened.input.dispose()`。錯誤時顯示 `audioEditor.codecUnsupported`（`codec_unsupported`）或 `error.message`，並呼叫 `props.onError`。`historyReducer` / `initialHistory`（`src/audio-editor/history.ts`）用 `useReducer`，包一個 `dispatch` 在每次之後算 `isDirty` 並在值改變時呼叫 `props.onDirtyChange`。「關閉」與 `Esc`：`isDirty` 時開 `src/primitives/dialog.tsx` 的 `Dialog`（`discardTitle` / `discardBody`，鍵 `discard` → `props.onClose()`、`keepEditing` 關掉對話框），否則直接 `props.onClose()`。`Ctrl/⌘ + Z`、`Ctrl/⌘ + Shift + Z` 接 undo / redo。
   - 新 `src/audio-editor/index.ts`：`export { AudioEditor } from "./audio-editor.js"`、`export type { EditorProps as AudioEditorProps } from "../viewer/editor-props.js"`。
   - 新 `src/audio-editor/audio-editor.css`：`.fv-audio`（grid：頂列 / 波形 / 播放列 / 工具列，`container-type: inline-size`，撐滿容器）、`.fv-audio-top`、`.fv-audio-status`；只用 `--ak-*`。`src/styles.css` 加 `@import "./audio-editor/audio-editor.css";`。
   - `src/viewer/editor-loaders.ts` 的 `editorLoaders` 加 `audio: () => import("../audio-editor/index.js").then((m) => m.AudioEditor)`。
   - `package.json` 的 `exports` 加 `"./audio-editor": { "types": "./dist/audio-editor/index.d.ts", "import": "./dist/audio-editor/index.js" }`、`tsdown.config.ts` 的 `entry` 加 `"src/audio-editor/index.ts"`（已經有就不動，寫法照檔內既有的其他 subpath）。
   測試：新 `src/audio-editor/audio-editor.test.tsx`（jsdom；`vi.mock("./open-track.js")` 與 `vi.mock("./scan.js")`）：顯示檔名；`openTrack` 丟 `codec_unsupported` 時顯示 `codecUnsupported` 字串且 `onError` 收到同一個 code；沒改過按關閉直接呼叫 `onClose`；`dispatch` 一次 apply 後 `onDirtyChange(true)`、按關閉先出對話框、按「放棄」才 `onClose`；卸載時 abort signal 被觸發。另在 `src/i18n/` 既有的「en 與 zh-TW key 相同」測試裡不用改，跑它確認。
   verify：`pnpm test src/audio-editor src/i18n && pnpm build && pnpm check`
   commit：`feat(audio-editor): open the audio editor from the viewer`
2. 波形與總覽。
   - 新 `src/audio-editor/view.ts`（純函式，型別 `View` 見契約）：`fitView(duration: number, width: number): View`；`timeAt(view, x: number): number`、`xAt(view, t: number): number`；`zoom(view, factor: number, anchorX: number, duration: number): View`（以 anchor 為中心，`secondsPerPixel` 夾在 `1 / sampleRate` 與 `duration / width` 之間，`start` 夾在 0..`duration − width × secondsPerPixel`）；`scroll(view, dx: number, duration: number): View`；`columns(peaks: Peaks, state: AudioEdit, view: View): { min: Float32Array; max: Float32Array; seams: number[] }`（每個像素欄：輸出時間 → `sourceAt`（`src/audio-editor/edit.ts`）→ 用 `levelFor`（`src/audio-editor/peaks.ts`）那層的格子取 min / max（兩聲道合併），乘 `gainAt`（`src/audio-editor/gain.ts`），換成 −1..1；`seams` 是來源不連續接縫的 x）。
   - 新 `src/audio-editor/zoom-window.ts`：`createZoomWindow(track: InputAudioTrack): { get(range: Range): Float32Array[] | null; load(range: Range, signal: AbortSignal): Promise<void> }`（用 `AudioSampleSink.samples(range.start, range.end)` 解出那段 PCM，超過 2 聲道 `downmixToStereo`；只留最近一個視窗）。`columns` 在每像素不到 `levels[0].framesPerBin` 時由呼叫端改用這個視窗的 sample 畫。
   - 新 `src/audio-editor/waveform.tsx`：`Waveform(props: { peaks: Peaks | null; progress: number; state: AudioEdit; view: View; duration: number; zoomWindow: ReturnType<typeof createZoomWindow>; onViewChange: (v: View) => void; playhead: () => number; overlay?: ReactNode })`。canvas 在 ref callback 建 `ResizeObserver`（寬度變了就 `onViewChange`）與 `requestAnimationFrame` 迴圈，cleanup 時 disconnect 與 `cancelAnimationFrame`；畫布大小乘 `devicePixelRatio`；顏色每次重畫從 `getComputedStyle(canvas)` 讀形式裡的 `--ak-*`。滾輪捲動、Ctrl + 滾輪縮放（`zoom`）、兩指 pointer 縮放。`overlay` 放在 canvas 上面（給選取層用）。
   - 新 `src/audio-editor/overview.tsx`：`Overview(props: { peaks: Peaks | null; progress: number; state: AudioEdit; duration: number; view: View; onViewChange: (v: View) => void })`：整檔畫一次（用 `fitView`），框出 `view` 的範圍，拖框改 `view.start`；`progress < 1` 時上方畫進度條。
   - `src/audio-editor/audio-editor.tsx` 把波形區佔位換成 `Overview` + `Waveform`，view 存在 state；根元素 `onKeyDown` 加 `+` / `-` / `0`。
   - `src/audio-editor/audio-editor.css` 加 `.fv-audio-overview`、`.fv-audio-wave`。
   測試：新 `src/audio-editor/view.test.ts`：`timeAt` / `xAt` 互逆；`zoom` 以 anchor 為中心（anchor 下的時間縮放前後相同）；縮放與捲動都夾在邊界內；`fitView` 讓整段剛好放滿；`columns` 在每像素 1000 frame 時用的是 `framesPerBin ≤ 1000` 的最粗層；淡入區段的欄位振幅遞增；刪掉中間一段後 `seams` 有一條在正確的 x。
   verify：`pnpm test src/audio-editor/view.test.ts src/audio-editor/audio-editor.test.tsx && pnpm check`
   commit：`feat(audio-editor): draw the waveform and overview on the output timeline`
3. 選取與剪輯工具。
   - 新 `src/audio-editor/selection.ts`（純函式）：`SNAP_PX = 8`；`snap(t: number, targets: number[], view: View): number`（離最近 target 的像素距離 ≤ 8 就吸過去）；`dragSelect(anchor: number, t: number, targets, view): Range`；`moveHandle(sel: Range, which: "start" | "end", t: number, targets, view): Range`（拖過另一邊時交換）；`segmentAt(state: AudioEdit, t: number): Range`（雙擊：`boundaries` 裡夾住 t 的兩條）。targets = `boundaries(state)`（`src/audio-editor/edit.ts`）加播放頭。
   - 新 `src/audio-editor/selection-layer.tsx`：`SelectionLayer(props: { view: View; state: AudioEdit; selection: Range | null; playhead: number; silence: Range[]; onSelect: (r: Range | null) => void; onSeek: (t: number) => void })`：pointer 拖曳選取、點一下設播放頭並清掉選取、雙擊選段；兩個把手 `<div className="fv-audio-handle">`，觸控範圍 44 px；`silence` 範圍畫成 `--ak-danger-subtle` 色塊。
   - 新 `src/audio-editor/tools.tsx`：`Tools(props: { selection: Range | null; playhead: number; onApply: (next: AudioEdit) => void; state: AudioEdit; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; children?: ReactNode })`：鍵「刪除」（`cut`）、「只留選取」（`keep`）、「分割」（`split` 在播放頭）、「淡入」「淡出」（`fade`），全部來自 `src/audio-editor/edit.ts`；沒有選取時刪除 / 只留 / 淡入 / 淡出 disabled；`children` 放下一步的三個 Popover。每顆鍵有 icon 與 `aria-label`，寬度 < 640 px 時只顯示 icon（CSS）。
   - `src/audio-editor/audio-editor.tsx`：selection 與 playhead 存 state；`Waveform` 的 `overlay` 放 `SelectionLayer`；工具列佔位換成 `Tools`；根元素 `onKeyDown` 加 `Delete` / `Backspace`（cut）、`T`（keep）、`S`（split），有選取才動作。
   - `src/audio-editor/audio-editor.css` 加 `.fv-audio-tools`、`.fv-audio-handle`、`.fv-audio-selection`，以及 `@container (max-width: 639px)` 的底部 icon 列。
   測試：新 `src/audio-editor/selection.test.ts`：8 px 內吸過去、9 px 不吸；把手拖過另一邊時交換；雙擊選起夾住的兩條邊界；沒有區段邊界時雙擊選整段。新 `src/audio-editor/tools.test.tsx`：沒有選取時刪除 / 只留 / 淡入 / 淡出是 disabled、分割不是；按分割呼叫 `onApply` 且新 state 多一條邊界；選一段按刪除後 `outputDuration` 變短。
   verify：`pnpm test src/audio-editor/selection.test.ts src/audio-editor/tools.test.tsx src/audio-editor/audio-editor.test.tsx && pnpm check`
   commit：`feat(audio-editor): select ranges and cut, keep, split and fade them`
4. 音量、正規化、去掉靜音。
   - 新 `src/primitives/popover.tsx`：契約裡的 `Popover`；新 `src/primitives/popover.css`（`.fv-popover`：`--ak-surface-raised` 底、`--ak-shadow-popover`、`--ak-corner-float`、z-index `--ak-z-index-popup`）並在 `src/styles.css` 加 `@import "./primitives/popover.css";`。
   - 新 `src/audio-editor/volume-popover.tsx`：`VolumePopover(props: { selection: Range | null; state: AudioEdit; onApply: (next: AudioEdit) => void })`：`Slider`（`src/primitives/slider.tsx`）−24..+12 step 0.5、預設 0，「套用」呼叫 `gain(state, selection, db)`（`src/audio-editor/edit.ts`）；沒有選取時 trigger disabled。
   - 新 `src/audio-editor/normalize-popover.tsx`：`NormalizePopover(props: { peaks: Peaks | null; selection: Range | null; state: AudioEdit; duration: number; onApply })`：`Slider` −6..0 step 0.1、預設 `NORMALIZE_DEFAULT_DB`；「套用」用 `normalizeGain`（`src/audio-editor/normalize.ts`）算出 dB，範圍是選取、沒有選取就整段（`{ start: 0, end: outputDuration(state) }`），再 `gain(...)`；`peaks` 是 null 時 trigger disabled。
   - 新 `src/audio-editor/silence-popover.tsx`：`SilencePopover(props: { peaks: Peaks | null; state: AudioEdit; onMark: (ranges: Range[]) => void; onApply })`：兩個 `Slider`（閾值 −70..−20 step 1、最短 0.3..5 step 0.1，預設 `SILENCE_DEFAULTS`）；值一變就 `findSilence`（`src/audio-editor/silence.ts`）並 `onMark`；顯示 `silenceFound`；「刪除這些」從最後一段往前依序 `cut`，最後只呼叫一次 `onApply`（一步 undo），然後 `onMark([])`；Popover 關閉時 `onMark([])`；`peaks` 是 null 時 trigger disabled。
   - `src/audio-editor/audio-editor.tsx`：三個 Popover 放進 `Tools` 的 `children`；`silence` 標記存 state 傳給 `SelectionLayer`。
   測試：新 `src/primitives/popover.test.tsx`：點 trigger 打開、`Esc` 關閉、`label` 是 trigger 的 `aria-label`。新 `src/audio-editor/silence-popover.test.tsx`（假的 `Peaks`：音調 + 2 秒靜音 + 音調 + 2 秒靜音 + 音調）：打開後 `onMark` 收到 2 段；「刪除這些」只呼叫一次 `onApply`、新 state 總長少 2 × (2 − 0.4) 秒；`peaks` 是 null 時 disabled。新 `src/audio-editor/normalize-popover.test.tsx`：沒有選取時套用的 gain 範圍是整段；`peaks` 是 null 時 disabled。
   verify：`pnpm test src/audio-editor src/primitives/popover.test.tsx && pnpm test:browser src/audio-editor && pnpm build && pnpm check`
   commit：`feat(audio-editor): adjust volume, normalize and remove silence`

## Phase 04 — 播放

blocker：Phase 03；model：opus。

1. 排程計畫。新 `src/audio-editor/plan.ts`（純函式），型別 `Block` 見契約：`plan(state: AudioEdit, from: number, to: number, loop: Range | null): Block[]`。從輸出時間 `from` 走到 `to`（`to − from` 是要排的長度）；每遇到區段邊界就開新的一塊（`srcStart` / `srcEnd` 是來源時間，`outStart` 是這塊的輸出起點）；`loop` 不是 null 時，走到 `loop.end` 就從 `loop.start` 接著走，`outStart` 繼續遞增（用「已排長度」累計，不回頭）；`from` 在 loop 之外而且 loop 不是 null 時，先走到 `loop.end` 再開始循環。用 `src/audio-editor/edit.ts` 的 `sourceAt`、`boundaries`。
   測試：新 `src/audio-editor/plan.test.ts`：單區段一塊；跨兩個區段時兩塊頭尾相接（前一塊的 `outStart + (srcEnd − srcStart)` = 下一塊的 `outStart`）；刪掉中間一段後跳過那段來源；循環 2 秒的選取排 5 秒時塊長加總 = 5 且在 `loop.end` 接回 `loop.start`；從區段中間開始時第一塊的 `srcStart` 正確。
   verify：`pnpm test src/audio-editor/plan.test.ts`
   commit：`feat(audio-editor): plan playback blocks across segments and loops`
2. 播放器與播放列。
   - 新 `src/audio-editor/player.ts`：`createPlayer(ctx: BaseAudioContext, track: InputAudioTrack, getState: () => { edit: AudioEdit; loop: Range | null }): Player`，`Player = { play(from: number): void; pause(): void; seek(t: number): void; position(): number; playing(): boolean; pump(until: number): Promise<void>; dispose(): void }`。`play` 記下 `ctx.currentTime` 與起點，每 250 ms（`setTimeout`，`dispose` 清掉）呼叫 `pump(ctx.currentTime + 1)`。`pump`：用 `src/audio-editor/plan.ts` 的 `plan` 算出還沒排的那段，每塊用 `new AudioBufferSink(track).buffers(srcStart, srcEnd)` 取 `WrappedAudioBuffer`，超過 2 聲道用 `src/audio-editor/gain.ts` 的 `downmixToStereo` 另建 2 聲道的 `AudioBuffer`，`applyGains`（輸出時間 = `outStart + (wrapped.timestamp − srcStart)`），`AudioBufferSourceNode.start(when, offset, duration)` 排上去（`offset` / `duration` 切掉塊外的部分），node 存起來給 `pause` / `seek` 時 `stop()`。`position()` 依 `ctx.currentTime` 算輸出時間（循環時折回 loop 內）。編輯改變（`getState` 回的 edit 換了）時 `seek(position())` 重排。
   - 新 `src/audio-editor/transport.tsx`：`Transport(props: { player: Player | null; duration: number; selection: Range | null; loop: boolean; onLoopChange: (on: boolean) => void })`：播放 / 暫停、循環（`aria-pressed`）、跳到開頭 / 結尾、時間碼（`position` 與 `selection` 長度，格式 `m:ss.mmm`，由 `requestAnimationFrame` 在 ref callback 裡更新、cleanup 取消）。
   - `src/audio-editor/audio-editor.tsx`：根元素的 ref callback 在 `openTrack` 成功後 `new AudioContext()` + `createPlayer`，cleanup 時 `player.dispose()` 與 `ctx.close()`；播放列佔位換成 `Transport`；`Waveform` 的 `playhead` 讀 `player.position()`；根元素 `onKeyDown` 加空白鍵（播放 / 暫停）、`L`（循環）、`Home` / `End`。
   測試：新 `src/audio-editor/player.browser.test.ts`（`new OfflineAudioContext(2, 48000 × 秒數, 48000)`，來源用 `src/audio-editor/testing/synth-wav.ts` 的 440 Hz、振幅 0.5 正弦波經 `openTrack` 打開；`play(0)` 後直接 `await pump(總長)` 再 `startRendering()`）：循環 2 秒選取 5 次，渲染長度正確且第 2.0 秒前後沒有整段 0（無空隙）；循環接縫與刪除剪點前後相鄰 sample 的差 ≤ `2π × 440 / 48000 × 0.5 × 1.1`（無爆音，接縫有 5 ms 淡化）；有淡入時第一個 sample 是 0。
   verify：`pnpm test:browser src/audio-editor/player.browser.test.ts && pnpm test src/audio-editor && pnpm check`
   commit：`feat(audio-editor): play the edit with gapless loops`

## Phase 05 — 輸出

blocker：Phase 04；model：opus。

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
   - `const sink = createBlobSink()`（`src/media/blob-sink.ts`）；`new Output({ format, target: sink.target })`，format 照 `FORMATS[choice.format]`：aac → `new Mp4OutputFormat({ fastStart: false })`、opus → `new OggOutputFormat()`、wav → `new WavOutputFormat()`；`new AudioSampleSource({ codec, bitrate: choice.bitrate ?? undefined, transform: { sampleRate: outputSampleRate(...) } })`，`output.addAudioTrack(source)`，`await output.start()`。
   - 依序對每個區段：`new AudioSampleSink(opened.track).samples(seg.in, seg.out)`，每個 sample 用 `copyTo` 的 `frameOffset` / `frameCount` 切掉落在 `[seg.in, seg.out)` 之外的 frame，拷成 `f32-planar` planes，超過 2 聲道 `downmixToStereo`，`applyGains`（`src/audio-editor/gain.ts`，`t0` 是這段在輸出時間軸上的位置），組成一塊 planar `Float32Array`，`new AudioSample({ data, format: "f32-planar", numberOfChannels, sampleRate: opened.sampleRate, timestamp: 輸出時間 })`，`await source.add(sample)`，然後兩個 sample 都 `close()`；每塊之後 `onProgress(已輸出長度 / 總長)`。
   - 結束 `await output.finalize()`，回 `sink.blob(FORMATS[choice.format].mime)`。`signal` abort 時 `await output.cancel()` 並丟 `signal.reason`；mediabunny 丟的非 `ViewerError` 錯誤包成 `new ViewerError("decode_failed", { cause })`。
   測試：新 `src/audio-editor/export.browser.test.ts`（來源用 `src/audio-editor/testing/synth-wav.ts`，經 `src/audio-editor/open-track.ts` 的 `openTrack` 打開；輸出的 Blob 用 `bytesSource(new Uint8Array(await blob.arrayBuffer()))` 再 `openTrack` 讀回）：10 秒來源切成 3 個區段（刪掉兩段）+ 開頭淡入 + 結尾淡出 + 正規化到 −1 dB，輸出 WAV：讀回的 frame 數等於 3 段相加（誤差 ≤ 1 frame）、峰值在 −1 dBFS ± 0.2；同一段輸出 opus：讀回的長度誤差 < 30 ms；`maxOutputBytes: 1000` 時丟 `output_too_large` 且 `AudioSampleSink` 沒被建（`vi.spyOn`）；開始後 abort 會 reject 且 `onProgress` 不再被呼叫；合成 20 分鐘 48 kHz 立體聲 WAV 輸出成 WAV 時 `performance.memory.usedJSHeapSize` 增加 < 100 MB（沒有 `performance.memory` 就跳過這一斷言）。
   verify：`pnpm test:browser src/audio-editor/export.browser.test.ts && pnpm check`
   commit：`feat(audio-editor): stream the edit into m4a, ogg or wav`
3. 輸出對話框與存檔。
   - 新 `src/audio-editor/export-dialog.tsx`：`ExportDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; opened: OpenedTrack; edit: AudioEdit; fileName: string; maxOutputBytes?: number; onSave: SaveHandler; onDone: () => void; onError?: (e: ViewerError) => void; canEncode?: (codec: AudioCodec, o: { numberOfChannels: number; sampleRate: number }) => Promise<boolean>; runExport?: typeof exportAudio })`（`canEncode` 預設 mediabunny 的 `canEncodeAudio`、`runExport` 預設 `src/audio-editor/export.ts` 的 `exportAudio`，只為測試注入）。用 `src/primitives/dialog.tsx` 的 `Dialog`：打開時跑 `availableFormats` 與 `defaultFormat`（`src/audio-editor/formats.ts`）；格式用 `@base-ui/react/radio-group` 列出（字串 `formatAac` / `formatOpus` / `formatWav`，opus 旁加 `opusNote`）；`isSameFormatLost` 時顯示 `noSameFormat`；位元率用 radio-group 列 `FORMATS[f].bitrates`（wav 不顯示）；`estimatedSize`（MB，一位小數）；估計超過 `maxOutputBytes` 時顯示 `tooLarge`、「開始」disabled、`onError(new ViewerError("output_too_large"))`。按「開始」：`runExport`，進度條 + `remaining`（`已用秒數 × (1 − p) / p`，p < 0.02 時不顯示）；「取消」abort 並回到選格式的畫面。完成後 `await onSave({ blob, mime, ext, mode: "export", suggestedName: suggestedName(fileName, ext, "export") })`（`src/contract/save.ts`）；resolve → `onDone()`；reject → 留在對話框顯示 `error.message`，`onError(new ViewerError("save_failed", { cause }))`。輸出中按關閉（`onOpenChange(false)`）先在對話框裡問 `exportClosing`，確認才 abort 並關閉。
   - `src/audio-editor/audio-editor.tsx`：頂列「輸出」在 `status === "ready"` 時 enable，打開 `ExportDialog`；`onDone` 呼叫 `props.onClose()`；輸出中按頂列「關閉」或 `Esc` 也先問 `exportClosing`。
   - `src/audio-editor/audio-editor.css` 加 `.fv-audio-export`、`.fv-audio-progress`。
   測試：新 `src/audio-editor/export-dialog.test.tsx`（jsdom；假的 `canEncode` 與 `runExport`）：只能編 opus 時只列 opus 與 wav、預設 opus；`maxOutputBytes` 太小時「開始」disabled 且顯示 `tooLarge`；完成後 `onSave` 收到 `mode: "export"`、`ext: ".ogg"`、`mime: "audio/ogg"`、`suggestedName` 等於 `suggestedName(fileName, ".ogg", "export")`，然後 `onDone`；`onSave` reject 時對話框還開著、顯示錯誤訊息、`onDone` 沒被呼叫；按「取消」後 `runExport` 收到的 signal 是 aborted、`onSave` 沒被呼叫；mp3 來源顯示 `noSameFormat`。
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
