# 07 video-editor — 在瀏覽器裡剪影片：多軌時間軸、修剪 / 分割 / ripple、文字與圖片疊加，輸出 MP4

狀態：planned（2026-10-08）；blocker：03 viewer-core（編輯切換點與 `EditorProps`）、06 media-io（`src/media/` 的 `openInput`、`probeMedia`、`hasWebCodecs`、`BlobSink`）；model：sonnet（Phase 01、05）、opus（Phase 02–04）；與 08 平行；push：做完一次。來源：storage `docs/plans/14-video-editor.md`，設計照搬；SDK `files.reader`、Blob 上傳不整包讀、`vault-source`、`EditorHost`、`saveFile`、`docs/e2e` 走查歸 H1 Phase 2。

## 判斷

- 範圍照 storage 14 §2：1 條主影片軌（片段不重疊，同時只有一個影片解碼器在跑，下一段先預讀）；疊加軌放文字與圖片，條數不限；音訊軌最多 3 條，加上主軌影片自帶的聲音一共 4 條。操作有：從素材欄加素材、拖邊修剪、在播放頭分割（`S`）、刪除與 ripple 刪除、拖曳搬移並吸附到播放頭與片段邊緣、每段音量與靜音、文字（Geist、大小、顏色、底框、位置）、圖片疊加（位置、大小）。畫布比例可選原片、16:9、9:16、1:1，每段可選 fit 或 fill。undo / redo 上限 200 步。v1 不存專案檔，關掉就沒了，關閉前有 AlertDialog 擋。
- 自己寫一個精簡的剪輯器，只從 opencut-classic（github.com/OpenCut-app/opencut-classic，MIT，「Copyright 2025-2026 OpenCut」，已 archived，commit `cf5e79e919144200294fb9fed22a222592a0aeea`）抄純 TS 的邏輯。下面的路徑都在它的 `apps/web/src/` 下，2026-10-08 逐一查過存在：
  - `commands/base-command.ts`、`commands/batch-command.ts` 抄到 `model/commands.ts`
  - `timeline/snapping/{types,build,resolve,threshold}.ts` 抄到 `model/snapping.ts`
  - `commands/timeline/element/split-elements.ts` 裡切 trim 的算法抄到 `model/split.ts`（storage 14 寫的是 `retime/split.ts`，那個檔只處理變速設定的分割，真正切片段的是這一個）
  - `ripple/{apply,shift}.ts` 抄到 `model/ripple.ts`
  - `timeline/placement/overlap.ts` 的重疊判斷抄到 `model/placement.ts`
  - `services/video-cache/service.ts` 抄到 `engine/frame-cache.ts`：保留目前幀與下一幀；往後 2 秒內用 iterator 往前走，超過就重新 seek；預讀下一幀
  - `services/renderer/scene-exporter.ts` 的輸出迴圈抄到 `export/export.ts`：`BufferTarget` 換成 `StreamTarget`，聲音改成每秒混一次再 add，拿掉 EventEmitter
  - `retime/__tests__/split.test.ts`、`timeline/placement/__tests__/resolve.test.ts` 裡適用的案例改寫後帶過來

  每個抄來的檔，檔頭寫來源路徑、commit、MIT。不抄 `EditorCore`、`opencut-wasm`、變速、關鍵影格、遮罩、效果、storage、字幕、音效庫、貼圖、字型、auth / db。
- 時間單位用整數 tick，每秒 120,000 tick，跟 opencut 的 `rust/crates/time/src/media_time.rs` 的 `TICKS_PER_SECOND` 一樣。專案資料裡只放整數 tick；呼叫 mediabunny 時才換成秒。軌道的資料形狀照 opencut 的 `SceneTracks`，分成 `{ overlay[], main, audio[] }`，ripple 與擺放邏輯因此可以直接對照原檔。
- 專案狀態是不可變的純資料。每個操作產生一個 `Command`，內容是 `{ apply, revert }`，各存修改前與修改後的 `tracks`（共用沒改到的部分）；undo 就是執行 `revert`。React 用 `useSyncExternalStore` 讀狀態，不用 `useEffect`。canvas、`AudioContext`、mediabunny `Input` 的生命週期都掛在 ref callback 加 cleanup 上。
- 媒體層全部用 06：`src/media/source.ts` 的 `openInput`（storage 14 §3 的 `CustomSource` 接 `ByteSource`）、`src/media/probe.ts` 的 `probeMedia`（`canDecode` 檢查與錯誤碼）、`src/media/support.ts` 的 `hasWebCodecs`、`src/media/blob-sink.ts` 的 `BlobSink`。本份程式直接 import mediabunny 的地方只有 sink 與 output，也就是 `CanvasSink`、`AudioBufferSink`、`Output`、`Mp4OutputFormat`、`StreamTarget`、`CanvasSource`、`AudioBufferSource`、`canEncodeVideo`、`canEncodeAudio`，這些都在 mediabunny 1.61 的 `dist/mediabunny.d.ts` 裡查過。
- 記憶體上限照 storage 14 §3：同一時間最多開 8 個 `Input`，超過就關掉最久沒用的那個；`CanvasSink` 的 `poolSize` 設 2；縮圖條與波形只算畫面上看得到的範圍，只放在記憶體裡（各有 LRU 上限）；輸出經 `StreamTarget` 接 06 的 `BlobSink`，不整包放進記憶體。解出來的影音不寫 IndexedDB、OPFS、localStorage。
- 預覽用 Canvas2D 合成：影片幀來自 `CanvasSink`，聲音來自 `AudioBufferSink`，排進 `AudioContext` 播放，播放時鐘用 `AudioContext.currentTime`。輸出用同一個 `renderFrame` 畫到 `OffscreenCanvas`。
- 輸出規格：MP4，H.264，`Mp4OutputFormat({ fastStart: "fragmented" })`。畫質三種：原尺寸、1080p、720p（以短邊算，例如 9:16 的 1080p 是 1080×1920）；1080p 用 8 Mbps，720p 用 5 Mbps，原尺寸依像素數等比換算，夾在 1–40 Mbps 之間。比原片大的畫質不列出來。fps 用專案的 fps（原片，上限 60）。音訊 48 kHz、立體聲、128 kbps：`canEncodeAudio("aac", …)` 為 true 就用 AAC，否則用 Opus 放在 MP4 容器裡。不用 `@mediabunny/aac-encoder`，因為它會開 `blob:` worker。開始前先估大小：`(視訊位元率 + 音訊位元率) × 秒數 ÷ 8 × 1.05`；超過 `maxOutputBytes` 就不讓開始。
- 存檔一律是「輸出成新檔」（00-overview §2）：呼叫 `onSave({ mode: "export", ext: ".mp4", mime: "video/mp4", suggestedName: "<主檔名> (edited).mp4" })`，原片不動。按鈕只寫「輸出」。`onSave` resolve 後，編輯器標成已存並呼叫 `onClose`；新檔要不要打開由宿主決定（H1）。reject 時留在輸出 Dialog，顯示 `error.message`。
- 版面跟 00-overview §3 的規則走：編輯器撐滿宿主給的容器，不自己開全螢幕 Dialog（storage 14 §4 是全螢幕 Dialog，這裡改掉）。容器寬度小於 768 px 或瀏覽器沒有 WebCodecs 時，編輯器只顯示說明與「回到預覽」。storage 14 原本是讓「編輯」按鈕變成 tooltip；這裡改成進編輯器後才判斷，這樣 03 的按鈕不必知道影片的特殊規則。
- 文字字型用 Geist（`@fontsource-variable/geist`，同源自架，CSP 不用改；13 image-text-shapes 也用它）。它的授權是 OFL-1.1，不在 00-overview §7 授權檢查的允許清單裡，所以加套件的那一步同時把 OFL-1.1 加進允許清單（只准字型套件）。
- 讀素材時不顯示百分比，只顯示不定進度的載入條，因為 `ByteSource` 沒有進度回呼。素材解不了的話，片段畫紅框，加上說明。
- 不做：專案檔、轉場、關鍵影格、變速、濾鏡、子母畫面、自動字幕、手機版、邊編碼邊上傳（見「之後再做」）。

## 契約

只加不改 00-overview §3。

公開（`./video-editor` subpath；01 的 exports map 已列 `./video-editor` → `src/video-editor/index.ts`）：

```ts
export type VideoEditorProps = {
  file: FileRef;
  locale?: Locale; messages?: Partial<Messages>; theme?: "light" | "dark";
  onError?: (e: ViewerError) => void;
  onSave: SaveHandler;                     // 一律 mode "export"
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  maxOutputBytes?: number;                 // 預設 DEFAULT_MAX_OUTPUT_BYTES = 2 GiB
  assets?: AssetProvider;                  // 不給 = 素材欄只有原片
};
export function VideoEditor(props: VideoEditorProps): JSX.Element; // 自己包 02 的 FvRoot
```

內部模組（下面的步驟都照這份簽名寫；路徑都在 `src/video-editor/` 下）：

```ts
// model/time.ts
export const TICKS_PER_SECOND = 120_000;
export type Ticks = number;                                   // 一律整數
export function secondsToTicks(seconds: number): Ticks;       // Math.round
export function ticksToSeconds(ticks: Ticks): number;
export function frameTicks(fps: number): Ticks;               // Math.round(TICKS_PER_SECOND / fps)
export function roundToFrame(ticks: Ticks, fps: number): Ticks;
export function formatTimecode(ticks: Ticks, fps: number): string; // "MM:SS:FF"；≥ 1 小時 "H:MM:SS:FF"

// model/ids.ts
export function newId(): string;                              // crypto.randomUUID()

// model/project.ts
export const SOURCE_ASSET_ID = "source";
export const MAX_AUDIO_TRACKS = 3;
export type AssetKind = "video" | "audio" | "image";
export type AssetInfo = { id: string; name: string; kind: AssetKind; duration: Ticks | null;
  width: number; height: number; fps: number | null; hasAudio: boolean };
export type Aspect = "source" | "16:9" | "9:16" | "1:1";
export type Fit = "fit" | "fill";
export type VideoClip = { id: string; kind: "video"; assetId: string; start: Ticks; in: Ticks; out: Ticks;
  volume: number /* 0–2，預設 1 */; muted: boolean; fit: Fit };
export type AudioClip = { id: string; kind: "audio"; assetId: string; start: Ticks; in: Ticks; out: Ticks;
  volume: number; muted: boolean };
export type ImageClip = { id: string; kind: "image"; assetId: string; start: Ticks; duration: Ticks;
  x: number; y: number; width: number };                      // 中心點與寬，都是畫布的比例 0–1
export type TextClip = { id: string; kind: "text"; start: Ticks; duration: Ticks; text: string;
  size: number /* 字高佔畫布高的比例 0.02–0.3 */; color: string /* #rrggbb */; background: boolean;
  x: number; y: number };
export type Clip = VideoClip | AudioClip | ImageClip | TextClip;
export type Track<C extends Clip = Clip> = { id: string; muted: boolean; locked: boolean; clips: C[] }; // 依 start 排序、不重疊
export type Tracks = { overlay: Track<ImageClip | TextClip>[]; main: Track<VideoClip>; audio: Track<AudioClip>[] }; // overlay[0] 在最上層
export type Project = { width: number; height: number; fps: number; aspect: Aspect;
  source: { width: number; height: number }; tracks: Tracks };
export function clipLength(clip: Clip): Ticks;               // out − in 或 duration
export function clipEnd(clip: Clip): Ticks;
export function allTracks(tracks: Tracks): Track[];           // overlay…, main, audio…
export function findClip(tracks: Tracks, clipId: string): { track: Track; clip: Clip } | null;
export function projectDuration(p: Project): Ticks;
export function canvasSize(aspect: Aspect, source: { width: number; height: number }): { width: number; height: number };
export function createProject(source: AssetInfo): Project;

// model/commands.ts
export type Command = { label: string; apply(p: Project): Project; revert(p: Project): Project };
export function tracksCommand(label: string, before: Tracks, after: Tracks): Command;
export function settingsCommand(label: string, before: Pick<Project, "aspect" | "width" | "height">,
  after: Pick<Project, "aspect" | "width" | "height">): Command;
export function batch(label: string, commands: Command[]): Command;

// model/history.ts
export const MAX_HISTORY = 200;
export class History { constructor(project: Project); readonly project: Project; readonly canUndo: boolean;
  readonly canRedo: boolean; readonly dirty: boolean; run(c: Command): void; undo(): void; redo(): void;
  markSaved(): void; subscribe(listener: () => void): () => void }

// model/snapping.ts
export type SnapPoint = { time: Ticks; type: "clip-start" | "clip-end" | "playhead"; clipId?: string };
export function buildSnapPoints(tracks: Tracks, playhead: Ticks, exclude: ReadonlySet<string>): SnapPoint[];
export function snapThreshold(pixelsPerSecond: number, thresholdPx?: number /* 10 */): Ticks;
export function resolveSnap(target: Ticks, points: SnapPoint[], maxDistance: Ticks): { time: Ticks; point: SnapPoint | null };

// model/split.ts
export function splitClip<C extends Clip>(clip: C, at: Ticks, rightId: string): [C, C] | null;
export function splitTracks(tracks: Tracks, at: Ticks, selected: ReadonlySet<string>, makeId: () => string): Tracks;

// model/ripple.ts
export type RippleAdjustment = { trackId: string; afterTime: Ticks; shift: Ticks };
export function applyRipple(tracks: Tracks, adjustments: RippleAdjustment[]): Tracks;
export function removeClips(tracks: Tracks, ids: ReadonlySet<string>, ripple: boolean): Tracks;

// model/placement.ts
export type Lane = "main" | "overlay" | "audio";
export function laneOf(clip: Clip): Lane;
export function overlaps(track: Track, start: Ticks, end: Ticks, excludeId?: string): boolean;
export function nearestFreeStart(track: Track, length: Ticks, desired: Ticks, excludeId?: string): Ticks;
export function placeClip(tracks: Tracks, clip: Clip, targetTrackId: string | null, makeId: () => string): Tracks | null;
export function pruneEmpty(tracks: Tracks): Tracks;

// model/edits.ts（都回 Command | null，null = 沒有變化或不允許）
export type ClipPatch = Partial<{ volume: number; muted: boolean; fit: Fit; text: string; size: number;
  color: string; background: boolean; x: number; y: number; width: number }>;
export function addAsset(p: Project, asset: AssetInfo, at: Ticks, targetTrackId: string | null): Command | null;
export function addText(p: Project, at: Ticks, text: string): Command | null;
export function moveClip(p: Project, clipId: string, targetTrackId: string, start: Ticks): Command | null;
export function trimClip(p: Project, clipId: string, edge: "start" | "end", to: Ticks, assetDuration: Ticks | null): Command | null;
export function splitAt(p: Project, at: Ticks, selected: ReadonlySet<string>): Command | null;
export function deleteClips(p: Project, ids: ReadonlySet<string>, ripple: boolean): Command | null;
export function updateClip(p: Project, clipId: string, patch: ClipPatch): Command | null;
export function setTrackFlag(p: Project, trackId: string, flag: "muted" | "locked", value: boolean): Command | null;
export function setAspect(p: Project, aspect: Aspect): Command | null;

// engine/read-blob.ts
export function readBlob(source: ByteSource, mime: string, signal: AbortSignal): Promise<Blob>;

// engine/assets.ts
export type AssetEntry = { id: string; name: string; mime: string; size: number; kind: AssetKind };
export type AssetStatus = { state: "idle" } | { state: "loading" } | { state: "ready"; info: AssetInfo }
  | { state: "unsupported"; code: ViewerErrorCode };
export class AssetStore { constructor(o: { file: FileRef; provider?: AssetProvider; signal: AbortSignal });
  list(): Promise<AssetEntry[]>; status(id: string): AssetStatus; load(id: string): Promise<AssetInfo>;
  input(id: string): Promise<Input>; image(id: string): Promise<ImageBitmap>;
  onEvict(listener: (id: string) => void): () => void; subscribe(listener: () => void): () => void; dispose(): void }

// engine/frame-cache.ts
export class FrameCache { constructor(assets: AssetStore);
  frameAt(assetId: string, seconds: number): Promise<WrappedCanvas | null>;
  preload(assetId: string, seconds: number): void; drop(assetId: string): void; dispose(): void }

// engine/render-frame.ts
export const TEXT_FONT = '"Geist Variable", sans-serif';
export type DrawItem = { kind: "video"; assetId: string; seconds: number; fit: Fit }
  | { kind: "image"; assetId: string; x: number; y: number; width: number } | { kind: "text"; clip: TextClip };
export type FrameSources = { frame(assetId: string, seconds: number): Promise<CanvasImageSource | null>;
  image(assetId: string): Promise<ImageBitmap | null> };
export function drawPlan(p: Project, t: Ticks): DrawItem[];
export function fitRect(sw: number, sh: number, dw: number, dh: number, fit: Fit): { x: number; y: number; w: number; h: number };
export function ensureFonts(): Promise<void>;
export function renderFrame(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, p: Project, t: Ticks, s: FrameSources): Promise<void>;

// engine/audio-plan.ts
export type AudioSegment = { clipId: string; assetId: string; at: Ticks; from: number; to: number; gain: number }; // from / to 是來源的秒
export function audioSegments(p: Project, withAudio: ReadonlySet<string>, from: Ticks, to: Ticks): AudioSegment[];

// engine/playback.ts
export class Player { constructor(o: { assets: AssetStore; frames: FrameCache; getProject(): Project; onTime(t: Ticks): void });
  attach(canvas: HTMLCanvasElement): () => void; readonly playing: boolean; readonly time: Ticks;
  play(): void; pause(): void; toggle(): void; seek(t: Ticks): void; step(frames: number): void; jump(seconds: number): void;
  redraw(): void; dispose(): void }

// engine/thumbnails.ts
export class Thumbnails { constructor(assets: AssetStore);
  strip(assetId: string, seconds: number[]): Promise<(ImageBitmap | null)[]>;
  peaks(assetId: string, from: number, to: number, buckets: number): Promise<Float32Array>; dispose(): void }

// export/settings.ts
export const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 ** 3;
export type PresetId = "original" | "1080p" | "720p";
export type ExportPreset = { id: PresetId; width: number; height: number; fps: number; videoBitrate: number; audioBitrate: 128_000 };
export function exportPresets(p: Project): ExportPreset[];
export function estimateBytes(preset: ExportPreset, duration: Ticks): number;
export function pickAudioCodec(): Promise<"aac" | "opus">;
export function canEncodePreset(preset: ExportPreset): Promise<boolean>;

// export/audio-mix.ts
export const MIX_SAMPLE_RATE = 48_000;
export function mixAudio(p: Project, assets: AssetStore, from: Ticks, to: Ticks): Promise<AudioBuffer>;

// export/export.ts
export type ExportProgress = { done: number /* 0–1 */; etaSeconds: number | null };
export function runExport(o: { project: Project; assets: AssetStore; preset: ExportPreset; audioCodec: "aac" | "opus";
  signal: AbortSignal; onProgress(p: ExportProgress): void }): Promise<Blob>;

// ui/session.ts
export type SessionState = { status: "loading" | "ready" | "unsupported"; error: ViewerError | null;
  selection: ReadonlySet<string>; playhead: Ticks; pixelsPerSecond: number; snapLine: Ticks | null };
export class EditorSession { constructor(o: { file: FileRef; provider?: AssetProvider; onError?(e: ViewerError): void });
  readonly assets: AssetStore; readonly frames: FrameCache; readonly player: Player; readonly thumbs: Thumbnails;
  readonly history: History | null; readonly state: SessionState; start(): Promise<void>; run(c: Command | null): void;
  select(ids: string[], additive: boolean): void; setPlayhead(t: Ticks): void; setZoom(pps: number): void;
  setSnapLine(t: Ticks | null): void; subscribe(l: () => void): () => void; dispose(): void }
```

`Messages` 加 `videoEditor` 區塊，`src/i18n/en.ts` 與 `src/i18n/zh-TW.ts` 同時加，在 Phase 03 第 11 步一次加齊：

- `close`、`undo`、`redo`、`export`、`split`、`delete`、`rippleDelete`、`addText`、`defaultText`
- `notice.noWebCodecs`、`notice.narrow`、`notice.codec`、`notice.readFailed`、`notice.back`
- `discard.title`、`discard.body`、`discard.confirm`、`discard.cancel`、`discardExport.title`
- `assets.title`、`assets.search`、`assets.empty`、`assets.source`、`assets.add`
- `clip.loading`、`clip.unsupported`
- `track.mute`、`track.unmute`、`track.hide`、`track.show`、`track.lock`、`track.unlock`、`timeline.zoom`
- `preview.play`、`preview.pause`、`preview.aspect`、`preview.aspectSource`
- `inspector.empty`、`inspector.volume`、`inspector.mute`、`inspector.fit`、`inspector.fill`、`inspector.text`、`inspector.size`、`inspector.color`、`inspector.background`、`inspector.x`、`inspector.y`、`inspector.width`
- `exportDialog.title`、`exportDialog.original`、`exportDialog.estimate`（`{size}`）、`exportDialog.tooLarge`、`exportDialog.noH264`、`exportDialog.start`、`exportDialog.cancel`、`exportDialog.progress`（`{percent}`、`{time}`）、`exportDialog.saving`、`exportDialog.saveFailed`（`{message}`）

錯誤碼：會用到 §3 已有的 `webcodecs_unavailable`、`codec_unsupported`、`read_failed`、`decode_failed`、`output_too_large`、`save_failed`，不新增。

假設其他 plan 提供的東西（實際名稱不同時，由主 agent 改這裡）：

- 02：`src/contract/index.ts` 匯出 §3 的全部型別，以及 `blobSource`、`kindOf`、`ViewerError`（建構子是 `new ViewerError(code, { cause? })`）；`src/i18n/index.ts` 匯出 `useT()`，回傳 `t(key: string, vars?: Record<string, string | number>) => string`，`Messages` 的型別由 `src/i18n/en.ts` 推出；`src/primitives/` 有 `Button`、`Dialog`、`AlertDialog`、`Menu`、`Slider`、`Tooltip`，以及 `FvRoot({ locale, messages, theme, children })`（會畫出 `.fv-root` 並提供 i18n）；全部樣式放在 `src/styles.css`。
- 01：vitest 把 `*.browser.test.ts(x)` 放在 browser 模式跑，其他檔用 jsdom 跑；`scripts/` 底下的授權檢查有一份允許清單。
- 03：`src/viewer/editor-props.ts` 匯出 `EditorProps = { file: FileRef; onSave: SaveHandler; onClose(): void; onDirtyChange(d: boolean): void; onError(e: ViewerError): void; maxOutputBytes?: number; assets?: AssetProvider }`；`src/viewer/editor-registry.ts` 匯出 `editorLoaders: Record<EditKind, (() => Promise<ComponentType<EditorProps>>) | null>`；`kindOf` 判斷影片能不能編輯時不看檔案大小。
- 06：`src/media/source.ts` 匯出 `openInput(source: ByteSource): Input`；`src/media/probe.ts` 匯出 `probeMedia(input: Input): Promise<MediaProbe>`，其中 `MediaProbe = { video: InputVideoTrack | null; audio: InputAudioTrack | null; duration: number; width: number; height: number; fps: number | null }`，主軌解不了時丟 `ViewerError("codec_unsupported")`，讀不了時丟 `decode_failed`；`src/media/support.ts` 匯出 `hasWebCodecs(): boolean`；`src/media/blob-sink.ts` 匯出 `class BlobSink { writable: WritableStream<StreamTargetChunk>; toBlob(type: string): Blob; discard(): void }`；`mediabunny` 已經鎖成確切版本，並寫進 notices。

## 形式

- 編輯器撐滿容器，分四區：左邊素材欄（240 px：可以搜尋，列出原片與 `assets` 裡的影片 / 音訊 / 圖片，可以拖進時間軸，也可以按「+」加到播放頭的位置）；中間預覽（canvas 照畫布比例置中；下方有播放 / 暫停、時間碼、比例選單）；右邊屬性欄（280 px：選到的片段的音量、靜音、fit / fill、文字內容、大小、顏色、底框、位置、圖片寬度；沒選到東西時顯示提示）；下面時間軸（高度佔 40%：尺標、軌道標頭有靜音或隱藏、鎖定，縮放滑桿，播放頭，吸附時顯示一條直線）。
- 頂列：「關閉」、檔名、undo、redo、「分割」、「加文字」，最右邊是「輸出」（主按鈕）。
- 輸出 Dialog：用 radio 選畫質，顯示估計大小；超過上限、或不能編 H.264 時，按鈕停用並顯示原因；輸出中顯示進度條、百分比、剩餘時間，以及「取消」。
- 片段：影片片段上是縮圖條，音訊片段上是波形，文字片段顯示文字，圖片片段顯示縮圖。載入中顯示線性的載入條（不回彈）；解不了的片段畫紅框，加上 `clip.unsupported`。
- 顏色只用 `--ak-*`：選取用 `--ak-signal`，吸附線用 `--ak-accent`，紅框用 `--ak-danger`，軌道底色用 `--ak-layer1` 與 `--ak-layer2`。

## Phase 01 — 專案模型與編輯邏輯

blocker：02（`src/contract/index.ts`）；model：sonnet。全部是純函式，在 jsdom 跑。

1. 時間與專案模型。新增 `src/video-editor/model/time.ts`、`src/video-editor/model/ids.ts`、`src/video-editor/model/project.ts`，簽名照「契約」的 `model/time.ts`、`model/ids.ts`、`model/project.ts`。規則：
   - `canvasSize`：`source` 回傳原片尺寸；其他比例以原片短邊 `b = min(width, height)` 為準：16:9 是 `b×16/9 × b`，9:16 是 `b × b×16/9`，1:1 是 `b × b`。寬高都四捨五入成偶數。
   - `createProject(source)`：`fps = min(round(source.fps ?? 30), 60)`；`aspect "source"`；`tracks` 裡 `main` 放一個 `VideoClip`（`assetId SOURCE_ASSET_ID`、`start 0`、`in 0`、`out source.duration`、`volume 1`、`muted false`、`fit "fit"`），`overlay` 與 `audio` 是空陣列；三種軌的 `id` 都用 `newId()`。

   測試：`src/video-editor/model/time.test.ts`
   - 1 秒是 120000 tick
   - 30 fps 的一格是 4000 tick
   - `roundToFrame(4100, 30)` 是 4000
   - `formatTimecode` 的 0、59.99 秒、1 小時

   測試：`src/video-editor/model/project.test.ts`
   - 四種比例下 `canvasSize` 的結果都是偶數
   - 1920×1080 的 9:16 是 1080×1920
   - `createProject` 的長度等於來源長度
   - 120 fps 的來源被夾到 60
   - `clipEnd`、`clipLength` 對四種片段都正確
   - `findClip` 找不到時回 null

   verify：`pnpm test src/video-editor/model`。commit：`feat(video-editor): add time units and the project model`
2. Command 與 undo 歷史，並加上 opencut 授權聲明。新增 `src/video-editor/model/commands.ts`：檔頭寫「Adapted from opencut-classic apps/web/src/commands/base-command.ts and batch-command.ts @cf5e79e919144200294fb9fed22a222592a0aeea, MIT, Copyright 2025-2026 OpenCut」。
   - `tracksCommand`：`apply` 回傳 `{ ...p, tracks: after }`，`revert` 回傳 `{ ...p, tracks: before }`。
   - `settingsCommand` 的做法跟 `tracksCommand` 一樣，只是換的是 `aspect`、`width`、`height` 三個欄位。
   - `batch`：`apply` 依序執行各個 command，`revert` 反序執行，跟 opencut 的 `BatchCommand` 一樣。

   新增 `src/video-editor/model/history.ts`，`History` 照「契約」。它的狀態有 past 與 future 兩個堆疊、目前的 `project`、已存的 project 參照。
   - `run` 會清空 future；past 超過 `MAX_HISTORY` 時丟掉最舊的一筆。
   - `dirty` 等於「目前的 project !== 已存的參照」，`markSaved` 把目前的 project 設成已存。
   - 每次狀態改變都通知 `subscribe` 的 listener。

   `THIRD_PARTY_NOTICES.md` 的「抄進來的程式」段加上 opencut-classic 條目：repo 網址、commit、MIT 全文、版權行「Copyright 2025-2026 OpenCut」。

   測試：`src/video-editor/model/history.test.ts`
   - 執行 250 個 command 後只能 undo 200 次
   - undo 200 次再 redo 200 次，回到同一個 project（用 `toEqual` 比對）
   - undo 回到已存的狀態時 `dirty` 是 false
   - `run` 之後就不能 redo
   - `batch` 的 revert 順序是反的（用會記錄順序的 command 驗）
   - listener 每次改變剛好被叫一次

   verify：`pnpm test src/video-editor/model`。commit：`feat(video-editor): add commands and a 200-step undo history`
3. 吸附、分割、ripple。下面三個檔，檔頭都寫來源檔、commit `cf5e79e919144200294fb9fed22a222592a0aeea`、MIT；簽名照「契約」的 `model/snapping.ts`、`model/split.ts`、`model/ripple.ts`。
   - 新增 `src/video-editor/model/snapping.ts`，來源是 opencut 的 `timeline/snapping/{types,build,resolve,threshold}.ts`。`snapThreshold` 的公式是 `thresholdPx / pixelsPerSecond × TICKS_PER_SECOND`，取整數，預設 10 px。`buildSnapPoints` 收集每個片段的頭尾（排除 `exclude` 裡的 id）與播放頭。`resolveSnap` 在距離不超過 `maxDistance` 時取最近的點，否則原值不動。
   - 新增 `src/video-editor/model/split.ts`，來源是 opencut 的 `commands/timeline/element/split-elements.ts` 切 trim 的部分。`splitClip` 在 `at ≤ start` 或 `at ≥ clipEnd` 時回 null。影片 / 音訊片段：左段 `out = in + (at − start)`；右段 `start = at`、`in = 左段的 out`、`id = rightId`。圖片 / 文字片段：左段 `duration = at − start`，右段 `start = at`、`duration = 原長 − 左段長`。`splitTracks` 的範圍：`selected` 不是空的，就只切被選到而且蓋住 `at` 的片段；是空的，就切所有沒鎖的軌上蓋住 `at` 的片段。
   - 新增 `src/video-editor/model/ripple.ts`，來源是 opencut 的 `ripple/{apply,shift}.ts`。`applyRipple` 每條軌照 `afterTime` 由大到小處理，`start ≥ afterTime` 的片段往前移 `shift`。`removeClips` 不刪鎖住的軌上的片段；`ripple` 為 true 時，每個刪掉的片段在自己那條軌產生 `{ afterTime: clipEnd, shift: clipLength }`。

   測試：`src/video-editor/model/snapping.test.ts`
   - 在閾值內會吸到最近的點
   - 在閾值外不吸
   - `exclude` 裡的片段不算吸附點
   - 縮放加倍時閾值的 tick 數減半

   測試：`src/video-editor/model/split.test.ts`（從 opencut 的 `retime/__tests__/split.test.ts` 改寫）
   - 在片段中間分割，兩段的 in / out 接得起來，總長不變
   - 剛好在片段頭或尾分割時回 null
   - 文字片段分割
   - 鎖住的軌不切
   - 有選取時只切被選的片段

   測試：`src/video-editor/model/ripple.test.ts`
   - ripple 刪除後，後面的片段往前補
   - 不 ripple 時留下空隙
   - 同一條軌刪兩段，後面片段的位移是兩段長度相加
   - 別條軌的片段不動
   - 鎖住的軌不動

   verify：`pnpm test src/video-editor/model`。commit：`feat(video-editor): port snapping, split and ripple from opencut-classic`
4. 擺放規則。新增 `src/video-editor/model/placement.ts`，`overlaps` 的檔頭寫來源 opencut `timeline/placement/overlap.ts` @cf5e79e…、MIT；簽名照「契約」的 `model/placement.ts`。規則：
   - `laneOf`：video 放 main；image 與 text 放 overlay；audio 放 audio。
   - `nearestFreeStart`：找出 ≥ 0、離 `desired` 最近而且放得下 `length` 的 start；兩個候選一樣近時取較早的。
   - `placeClip`（傳進來的 `clip.start` 就是想放的位置），先檢查：目標軌鎖住、或 lane 不對，都回 null。`targetTrackId` 是 null 時：
     - main：用 `nearestFreeStart` 放進主軌
     - overlay：放進第一條（由上往下）沒有重疊的疊加軌；都重疊的話，在最上面新增一條疊加軌
     - audio：放進第一條沒有重疊的音訊軌；都重疊的話，在 `audio.length < MAX_AUDIO_TRACKS` 時新增一條，否則用 `nearestFreeStart` 放進 `audio[0]`

     有指定 `targetTrackId`、而且放上去會重疊時：
     - main：改用 `nearestFreeStart` 的位置
     - overlay：在目標軌正上方新增一條疊加軌
     - audio：在目標軌正下方新增一條音訊軌；已達上限的話，改用 `nearestFreeStart` 放在目標軌

     新軌的 id 用 `makeId()`，`muted` 與 `locked` 都是 false。
   - `pruneEmpty`：移除空的疊加軌與音訊軌，main 永遠留著。

   測試：`src/video-editor/model/placement.test.ts`（從 opencut 的 `timeline/placement/__tests__/resolve.test.ts` 改寫「firstAvailable picks the first compatible track without overlap」「firstAvailable creates a new track when all compatible tracks are full」「preferIndex creates a new overlay track above the main track」三案）
   - 主軌放進重疊的位置時，改放到最近的空位
   - 疊加軌全滿時，在最上面新增一條
   - 音訊軌第 4 條會被擋，改放空位
   - 放進鎖住的軌回 null
   - lane 不對回 null
   - `pruneEmpty` 不會刪 main

   verify：`pnpm test src/video-editor/model`。commit：`feat(video-editor): place clips on tracks without overlap`
5. 編輯操作。新增 `src/video-editor/model/edits.ts`，簽名照「契約」的 `model/edits.ts`。每個函式算出新的 `tracks`，經 `src/video-editor/model/placement.ts` 的 `pruneEmpty` 後，用 `src/video-editor/model/commands.ts` 的 `tracksCommand`（`setAspect` 用 `settingsCommand`）包成 Command 回傳；結果跟原本一樣時回 null。進來的時間先用 `src/video-editor/model/time.ts` 的 `roundToFrame(t, p.fps)` 對齊格線。各函式的規則：
   - `addAsset`
     - video：新增 `VideoClip`，`in 0`、`out asset.duration`、`volume 1`、`fit "fit"`
     - audio：新增 `AudioClip`，`in 0`、`out duration`、`volume 1`
     - image：新增 `ImageClip`，`duration` 5 秒、`x 0.5`、`y 0.5`、`width 0.3`

     片段的 id 用 `src/video-editor/model/ids.ts` 的 `newId`，擺放交給 `src/video-editor/model/placement.ts` 的 `placeClip`。
   - `addText`：新增 `TextClip`，`duration` 3 秒、`size 0.08`、`color "#ffffff"`、`background false`、`x 0.5`、`y 0.85`，擺放走 `placeClip`（`targetTrackId` 是 null）。
   - `moveClip`：先把片段從原軌拿掉，改 start 後交給 `placeClip`；原軌或目標軌鎖住時回 null。
   - `trimClip`：最短一格（`src/video-editor/model/time.ts` 的 `frameTicks(p.fps)`）。
     - 影片 / 音訊拉頭：`start` 與 `in` 一起動，`in` 至少 0，`start` 不早於前一個片段的 end。
     - 影片 / 音訊拉尾：`out` 不超過 `assetDuration`，end 不晚於下一個片段的 start。
     - 圖片 / 文字：只改 `start` 與 `duration`，不受來源長度限制。
   - `splitAt`：用 `src/video-editor/model/split.ts` 的 `splitTracks`，id 用 `newId`。
   - `deleteClips`：用 `src/video-editor/model/ripple.ts` 的 `removeClips`。
   - `updateClip`：只套片段型別有的欄位（例如影片片段收到 `text` 就忽略）；`volume` 夾在 0–2，`size` 夾在 0.02–0.3，`x`、`y`、`width` 夾在 0–1。片段在鎖住的軌上時回 null。
   - `setTrackFlag`：改那條軌的 `muted` 或 `locked`。
   - `setAspect`：新尺寸用 `src/video-editor/model/project.ts` 的 `canvasSize(aspect, p.source)`。

   測試：`src/video-editor/model/edits.test.ts`
   - 加影片、音訊、圖片、文字後，各自在對的軌與位置
   - 拉頭修剪時 `in` 不會小於 0
   - 拉尾修剪時 `out` 不會超過來源長度，也不會蓋到下一段
   - 修剪不會短於一格
   - 主軌上拖曳搬移後不會跟其他片段重疊
   - 鎖住的軌不能搬、不能改、不能刪
   - `updateClip` 的值超出範圍時被夾住
   - 主軌把一段刪掉並 ripple 後沒有空隙
   - `setAspect("1:1")` 以後 undo 回到原尺寸
   - 結果沒變時回 null

   verify：`pnpm test src/video-editor/model`。commit：`feat(video-editor): add edit commands for add, move, trim, split, delete and properties`

phase 結尾的 verify：`pnpm test src/video-editor && pnpm check`。

## Phase 02 — 素材、取幀、合成與播放

blocker：Phase 01、06；model：opus。在 browser 模式實測 WebCodecs。

6. 測試素材與 `AssetStore`。用 ffmpeg 在本機產生測試素材，放進 `test/fixtures/video-editor/`（只放在 repo 裡測試用，不進發佈的套件）：
   ```
   cd test/fixtures/video-editor
   ffmpeg -y -f lavfi -i color=c=red:size=320x180:rate=30:duration=2 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=2 -c:v libvpx-vp9 -b:v 100k -pix_fmt yuv420p -c:a libopus -b:a 48k -shortest red-2s.webm
   ffmpeg -y -f lavfi -i color=c=lime:size=320x180:rate=30:duration=3 -f lavfi -i sine=frequency=880:sample_rate=48000:duration=3 -c:v libvpx-vp9 -b:v 100k -pix_fmt yuv420p -c:a libopus -b:a 48k -shortest green-3s.webm
   ffmpeg -y -f lavfi -i color=c=black:size=320x180:rate=30:duration=1 -c:v libvpx-vp9 -b:v 50k -pix_fmt yuv420p -an silent-1s.webm
   ffmpeg -y -f lavfi -i sine=frequency=660:sample_rate=48000:duration=2 -c:a libopus -b:a 48k tone-2s.ogg
   ffmpeg -y -f lavfi -i color=c=blue:size=64x64 -frames:v 1 blue-64.png
   ```
   新增 `src/video-editor/test-utils/fixtures.ts`：`fixtureFile(name: string): Promise<File>`（`import.meta.glob("../../../test/fixtures/video-editor/*", { query: "?url", import: "default", eager: true })` 取得 URL，再 fetch 成 File）與 `fixtureRef(name: string): Promise<FileRef>`（`source` 用 `src/contract/index.ts` 的 `blobSource`）。

   新增 `src/video-editor/engine/read-blob.ts`：`readBlob` 有 `source.blob` 就直接用；沒有的話每次 `read` 4 MiB，把片段組成 `new Blob(parts, { type: mime })`。

   新增 `src/video-editor/engine/assets.ts`，`AssetStore` 照「契約」。
   - `list()`：第一個是原片（`id` 用 `src/video-editor/model/project.ts` 的 `SOURCE_ASSET_ID`，名稱、大小取自 `file`）；其他來自 `provider.list()`，用 `src/contract/index.ts` 的 `kindOf` 分類：`edit === "video"` 是 video，`edit === "audio"` 是 audio，`view === "image"` 是 image，其他捨棄。
   - `load(id)`：影片 / 音訊用 `src/media/source.ts` 的 `openInput` 與 `src/media/probe.ts` 的 `probeMedia` 算出 `AssetInfo`（`duration` 用 `src/video-editor/model/time.ts` 的 `secondsToTicks`；`hasAudio` = `audio !== null`）。圖片用 `readBlob` 讀，超過 64 MiB 就當 `unsupported "too_large"`，再用 `createImageBitmap` 取得寬高（`duration null`）。
   - 狀態流程：`idle` → `loading` → `ready` 或 `unsupported`。`ViewerError` 的 `codec_unsupported` 或 `decode_failed` 變成 `unsupported`；其他錯誤記成 `unsupported "read_failed"`。
   - `input(id)`：最多同時開 8 個 `Input`，超過就 `dispose()` 最久沒用的，並通知 `onEvict`。
   - `image(id)`：快取 `ImageBitmap`。
   - `dispose()`：關掉全部 `Input` 與 bitmap。建構子收到的 `signal` 被 abort 時也呼叫 `dispose()`。

   測試：`src/video-editor/engine/assets.browser.test.ts`
   - 開 `red-2s.webm`：`duration` 約 240000 tick（誤差一格內）、320×180、`hasAudio` 是 true
   - 開 `silent-1s.webm`：`hasAudio` 是 false
   - 開 `blue-64.png`：64×64，`duration` 是 null
   - `list()` 用 `kindOf` 過濾掉 `.txt`
   - 開第 9 個 input 時，最早開的那個被 dispose，並觸發 `onEvict`
   - 用 `vi.mock("../../media/probe")` 讓它丟 `codec_unsupported`，狀態變成 `unsupported`
   - `readBlob` 對沒有 `blob()` 的來源也組得出相同 bytes

   verify：`pnpm test:browser src/video-editor/engine/assets.browser.test.ts`。commit：`feat(video-editor): open and probe assets with a bounded input pool`
7. 取幀快取。新增 `src/video-editor/engine/frame-cache.ts`，檔頭寫來源 opencut `services/video-cache/service.ts` @cf5e79e…、MIT；`FrameCache` 照「契約」。每個 asset 一份狀態：`CanvasSink`（mediabunny，`new CanvasSink(track, { poolSize: 2 })`，`track` 來自 `src/video-editor/engine/assets.ts` 的 `assets.input(id)` 再取 `getPrimaryVideoTrack()`）、iterator、目前幀、下一幀、上一次要求的時間、預讀中的 promise、seek 世代號。`frameAt` 的規則照原檔的 `resolveFrame`：
   - 下一幀已經到了，就把它升成目前幀
   - 目前幀涵蓋要求的時間，就直接回傳
   - 要求的時間在上一次之後、2 秒以內，就用 iterator 往前走
   - 其他情況用 `sink.canvases(seconds)` 重新 seek，世代號不對的結果丟掉

   取到幀以後都開始預讀下一幀。`preload` 只建好 sink 並 seek 到指定時間。建構時向 `assets.onEvict` 註冊 `drop`；`dispose` 時把每個 iterator 都 `return()` 掉。

   測試：`src/video-editor/engine/frame-cache.browser.test.ts`（素材用 `src/video-editor/test-utils/fixtures.ts` 的 `fixtureRef("green-3s.webm")`）
   - `frameAt(1.5)` 回傳的幀 `timestamp ≤ 1.5 < timestamp + duration`
   - 從 0 秒逐格要到 1 秒，`canvases` 只被呼叫一次（spy `CanvasSink.prototype.canvases`）
   - 往後跳 2.5 秒會重新 seek，`canvases` 被呼叫第二次
   - 同時發出兩個 seek，只有最後一個的結果被採用
   - `drop` 以後再要幀，會重建 sink

   verify：`pnpm test:browser src/video-editor/engine/frame-cache.browser.test.ts`。commit：`feat(video-editor): cache and prefetch decoded frames`
8. 合成一幀與 Geist 字型。執行 `pnpm add @fontsource-variable/geist`（13 已經加過就略過）；在 `scripts/` 下的授權檢查允許清單（`rg -l "MPL-2.0" scripts/` 找到那個檔）加上 `OFL-1.1`，只允許 `@fontsource*` 的套件；`THIRD_PARTY_NOTICES.md` 的 runtime 依賴清單加上 Geist（OFL-1.1，github.com/vercel/geist-font）。13 已經做過的項目就略過。

   新增 `src/video-editor/engine/render-frame.ts`，簽名照「契約」的 `engine/render-frame.ts`。檔頭 `import "@fontsource-variable/geist";`。
   - `drawPlan`（純函式）：主軌蓋住 `t` 的影片片段，`seconds = ticksToSeconds(t − start + in)`（`src/video-editor/model/time.ts`）；疊加軌從最下面（`overlay` 陣列的最後一條）畫到最上面（`overlay[0]`）；`muted` 的疊加軌不畫；主軌的 `muted` 只影響聲音。
   - `fitRect`：`fit` 等比放進畫布並置中，`fill` 等比蓋滿並置中裁切。
   - `renderFrame` 的順序：
     1. 用黑色鋪滿畫布
     2. 畫影片幀（`FrameSources.frame`）
     3. 畫圖片：寬 = `width × 畫布寬`，高照 bitmap 的比例，以 (x, y) 為中心
     4. 畫文字：`font = ${size × 畫布高}px ${TEXT_FONT}`，依 `\n` 分行，行高 1.2，以 (x, y) 為中心置中；`background` 為 true 時，先在後面畫 `rgba(0,0,0,0.6)` 的圓角矩形（內距 0.3em）
   - `ensureFonts`：執行 `document.fonts.load(\`32px ${TEXT_FONT}\`)`。

   測試：`src/video-editor/engine/render-frame.test.ts`（jsdom）
   - `drawPlan` 的順序：影片、最下面的疊加軌、最上面的疊加軌
   - 隱藏的疊加軌不在清單裡
   - `t` 落在兩段之間的空隙時，沒有 video 項
   - `fitRect` 的 fit / fill 對 16:9 放進 1:1 的數值

   測試：`src/video-editor/engine/render-frame.browser.test.ts`
   - 用實際的 `FrameCache` 畫 `red-2s.webm`，畫布設成 1:1、`fit`：中心像素是紅的（r > 200、g < 60），上緣像素是黑的
   - 改成 `fill` 以後，上緣也是紅的
   - 加一個白字有底框的文字片段，文字中心附近有白色像素
   - 加 `blue-64.png` 的疊加，中心像素是藍的

   verify：`pnpm test src/video-editor/engine/render-frame.test.ts && pnpm test:browser src/video-editor/engine/render-frame.browser.test.ts && pnpm check`。commit：`feat(video-editor): composite a frame with video, images and Geist text`
9. 播放。新增 `src/video-editor/engine/audio-plan.ts`：`audioSegments` 收集主軌的影片片段（asset 在 `withAudio` 裡）與音訊軌的片段，跳過片段或軌道 `muted` 的，再把每段裁到 `[from, to)` 範圍內；`at` 是時間軸上的開始時間，`from` / `to` 是來源的秒數，`gain` 等於 `volume`。

   新增 `src/video-editor/engine/playback.ts`，`Player` 照「契約」。
   - `attach(canvas)`：建立 `AudioContext`，回傳的 cleanup 會 `pause()` 並 `close()` 它。
   - 時鐘：`play()` 時記下 `ctx.currentTime` 與播放頭位置；每個 `requestAnimationFrame` 算出時間，呼叫 `onTime`，用 `src/video-editor/engine/render-frame.ts` 的 `renderFrame` 畫出來（`FrameSources.frame` 接 `src/video-editor/engine/frame-cache.ts` 的 `frameAt`，`image` 接 `src/video-editor/engine/assets.ts` 的 `assets.image`）。
   - 聲音：播放中，聲音排到的時間比播放頭早不到 1 秒時，就用 `audioSegments` 排下一個 1 秒。每段用 mediabunny 的 `new AudioBufferSink(audioTrack).buffers(from, to)` 讀，每個 buffer 接一個 `AudioBufferSourceNode`，經過 `GainNode(gain)` 再 `start(when, offset)`。
   - 預讀：播放頭離目前這段主軌片段的結尾不到 1 秒時，對下一段呼叫 `frames.preload`。
   - 停止與跳轉：播到 `projectDuration` 就停。`pause` 與 `seek` 會停掉所有排好的 node。`step(n)` 先暫停，再移動 n 格。`jump(s)` 移動 s 秒，保持原本有沒有在播。
   - `redraw()`：重畫目前這一幀。

   測試：`src/video-editor/engine/audio-plan.test.ts`
   - 靜音的片段或軌道不出現
   - 片段跨過範圍邊界時，`from` / `to` 被裁剪
   - 沒有聲音的影片不出現
   - `gain` 等於 volume

   測試：`src/video-editor/engine/playback.browser.test.ts`
   - `play` 後 300 ms 內 `time` 有增加
   - `pause` 後 `time` 不再變
   - `step(3)` 剛好走 3 格
   - `seek` 超過結尾時被夾在 `projectDuration`
   - 播到結尾自己停
   - cleanup 後 `AudioContext.state` 是 `"closed"`

   verify：`pnpm test src/video-editor/engine/audio-plan.test.ts && pnpm test:browser src/video-editor/engine/playback.browser.test.ts`。commit：`feat(video-editor): play the timeline with an audio clock`
10. 縮圖條與波形。新增 `src/video-editor/engine/thumbnails.ts`，`Thumbnails` 照「契約」。
    - `strip(assetId, seconds[])`：每個 asset 一個 `new CanvasSink(track, { height: 48, poolSize: 1 })`，用 `canvasesAtTimestamps(seconds)` 取幀，每張轉成 `createImageBitmap`。快取的 key 是 `${assetId}:${秒數取到 0.1 秒}`，LRU 最多 300 張，淘汰時 `close()` bitmap。
    - `peaks(assetId, from, to, buckets)`：用 mediabunny 的 `AudioBufferSink(audioTrack).buffers(from, to)` 讀，每一格取所有聲道的最大絕對值。key 是 `${assetId}:${from}:${to}:${buckets}`，LRU 最多 64 筆。
    - 向 `assets.onEvict` 註冊，清掉那個 asset 的 sink。

    測試：`src/video-editor/engine/thumbnails.browser.test.ts`
    - `green-3s.webm` 取 [0, 1, 2] 三張，高度都是 48
    - 同一組時間第二次呼叫不再解碼（spy `canvasesAtTimestamps`）
    - 第 301 張進來時，最舊的被淘汰
    - `tone-2s.ogg` 的 `peaks(…, 100)` 長度是 100，數值都在 0.05–1 之間
    - `silent-1s.webm` 呼叫 `peaks` 回傳全 0

    verify：`pnpm test:browser src/video-editor/engine/thumbnails.browser.test.ts`。commit：`feat(video-editor): draw thumbnail strips and waveforms for the visible range`

phase 結尾的 verify：`pnpm test src/video-editor && pnpm test:browser src/video-editor && pnpm check`。

## Phase 03 — 編輯器畫面

blocker：Phase 02、03 viewer-core；model：opus。UI 測試在 jsdom 跑，用 `vi.mock` 換掉 `src/video-editor/engine/*`。

11. 外殼、session、i18n 與入口。
    - `src/i18n/en.ts` 與 `src/i18n/zh-TW.ts`：一次加齊「契約」列出的全部 `videoEditor.*` key。
    - 新增 `src/video-editor/ui/session.ts`，`EditorSession` 照「契約」。建構時做三件事：建 `AbortController`；建 `src/video-editor/engine/assets.ts` 的 `AssetStore`、`src/video-editor/engine/frame-cache.ts` 的 `FrameCache`、`src/video-editor/engine/playback.ts` 的 `Player`（`onTime` 寫進 `state.playhead`）、`src/video-editor/engine/thumbnails.ts` 的 `Thumbnails`；初始 `pixelsPerSecond` 設 50。
    - `start()`：先看 `src/media/support.ts` 的 `hasWebCodecs()`，沒有就進 `unsupported`，錯誤是 `webcodecs_unavailable`。接著 `assets.load(SOURCE_ASSET_ID)`：成功就用 `src/video-editor/model/project.ts` 的 `createProject` 建 `src/video-editor/model/history.ts` 的 `History`，進入 `ready`；失敗就進 `unsupported`，錯誤是那個 `ViewerError`，並呼叫 `onError`。
    - `run(c)`：c 是 null 就忽略，否則 `history.run(c)` 再 `player.redraw()`。
    - `dispose()`：abort，再 `dispose` 全部 engine。
    - 新增 `src/video-editor/ui/editor-body.tsx`：`VideoEditorBody(props: EditorProps)`，`EditorProps` 來自 `src/viewer/editor-props.ts`。
      - 在根 `div` 的 ref callback 裡建立 session 並呼叫 `start()`，cleanup 時 `dispose()`；同一個 ref callback 掛 `ResizeObserver`，寬度 < 768 px 就把 `narrow` 設成 true。
      - 用 `useSyncExternalStore` 讀 session 與 `history`；`history.dirty` 改變時，在 subscribe 的 listener 裡呼叫 `props.onDirtyChange`。
      - 三種狀態：`unsupported` 或 `narrow` 時畫 `src/video-editor/ui/notice.tsx`；`ready` 時畫頂列加四區版面（各區先放空的容器，class 是 `fv-ve-assets`、`fv-ve-preview`、`fv-ve-inspector`、`fv-ve-timeline`）；`loading` 時畫載入條。
    - 新增 `src/video-editor/ui/notice.tsx`：圖示、說明文字（`notice.noWebCodecs` / `notice.narrow` / `notice.codec` / `notice.readFailed`）、「回到預覽」按鈕（`notice.back`，呼叫 `onClose`）。
    - 新增 `src/video-editor/ui/top-bar.tsx`：`TopBar({ name, canUndo, canRedo, onClose, onUndo, onRedo, onSplit, onAddText, onExport })`，按鈕用 `src/primitives/` 的 `Button` 與 `Tooltip`。
    - 新增 `src/video-editor/ui/close-guard.tsx`：`CloseGuard({ open, exporting, onConfirm, onCancel })`，用 `src/primitives/` 的 `AlertDialog`，標題是 `discard.title`，輸出中改用 `discardExport.title`。按「關閉」時：dirty 或輸出中就打開它，否則直接 `onClose`。
    - 新增 `src/video-editor/ui/video-editor.tsx`：`VideoEditor(props: VideoEditorProps)` 用 `src/primitives/` 的 `FvRoot` 包住 `VideoEditorBody`（沒給的 `onDirtyChange` 換成空函式，沒給的 `onError` 也換成空函式）。
    - 新增 `src/video-editor/index.ts`：匯出 `VideoEditor` 與 `type VideoEditorProps`。
    - `src/viewer/editor-registry.ts`：`video` 改成 `() => import("../video-editor/ui/editor-body").then((m) => m.VideoEditorBody)`。
    - `src/styles.css`：在檔尾加 `/* video-editor */` 段，寫 `.fv-ve-root` 的四區 grid（左欄 240 px、右欄 280 px、時間軸 40%）、`.fv-ve-notice`、`.fv-ve-loading`（線性載入動畫，用 `--ak-motion-linear`）。

    測試：`src/video-editor/ui/editor-body.test.tsx`（jsdom，用 `vi.mock("../../media/support")` 與 `vi.mock("../engine/assets")`）
    - 沒有 WebCodecs 時顯示 `notice.noWebCodecs`，按「回到預覽」會呼叫 `onClose`
    - 容器寬 600 px 時顯示 `notice.narrow`
    - 載入失敗、錯誤是 `codec_unsupported` 時顯示 `notice.codec`，並呼叫 `onError`
    - 沒修改時按「關閉」直接 `onClose`
    - 修改過再按「關閉」會出 AlertDialog，按取消後留在原地
    - `onDirtyChange` 在第一次修改時被呼叫，參數是 true

    測試：`src/video-editor/index.test.ts`：`VideoEditor` 匯出存在。

    verify：`pnpm test src/video-editor/ui && pnpm check`。commit：`feat(video-editor): add the editor shell, session and unsupported states`
12. 時間軸。
    - 新增 `src/video-editor/ui/timeline/geometry.ts`（純函式）：
      - `ticksToPx(t, pps)`、`pxToTicks(px, pps)`
      - `dragMove({ clip, dxPx, pps, points, playhead })`：用 `src/video-editor/model/snapping.ts` 的 `resolveSnap` 與 `snapThreshold`，片段的頭或尾任一端吸到就算；回傳 `{ start, snapLine: Ticks | null }`
      - `dragTrim({ clip, edge, dxPx, pps, points })`：回傳 `{ to, snapLine }`
    - 新增 `src/video-editor/ui/timeline/timeline.tsx`：`Timeline({ session })`。
      - 尺標（`src/video-editor/ui/timeline/ruler.tsx`，依 `pps` 選擇 1、5、10、30、60 秒的刻度，標籤用 `src/video-editor/model/time.ts` 的 `formatTimecode`）。
      - 軌道列由上往下是：疊加軌、主軌、音訊軌。每列由 `src/video-editor/ui/timeline/track-header.tsx` 與 `src/video-editor/ui/timeline/clip-view.tsx` 組成。軌道標頭的按鈕：疊加軌是隱藏 / 顯示，主軌與音訊軌是靜音；每條軌都有鎖定。按下去呼叫 `src/video-editor/model/edits.ts` 的 `setTrackFlag`，經 `session.run` 執行。
      - 播放頭可以拖；點尺標會 `session.player.seek`。
      - 縮放用 `src/primitives/` 的 `Slider`，`pps` 範圍 5–400，呼叫 `session.setZoom`。
      - 吸附線取自 `session.state.snapLine`。
    - `clip-view.tsx` 用 pointer events：
      - 點一下選取，按 Shift 加選，呼叫 `session.select`。
      - 拖主體是搬移：拖曳中只更新預覽位置與 `session.setSnapLine`；放開時用 `edits.moveClip` 經 `session.run` 執行，目標軌是指標下方那一列。
      - 拖左右 6 px 內的邊緣是修剪：放開時呼叫 `edits.trimClip`，`assetDuration` 取自 `session.assets.status(id)` 的 `info.duration`。
      - 鎖住的軌不能拖。
      - 片段標籤：影片 / 音訊 / 圖片用素材名，文字片段用文字內容。
    - `src/styles.css` 的 video-editor 段加上時間軸的 class（`.fv-ve-track`、`.fv-ve-clip`、`.fv-ve-clip[data-selected]`、`.fv-ve-snapline`、`.fv-ve-playhead`）。

    測試：`src/video-editor/ui/timeline/geometry.test.ts`
    - px 與 tick 互轉可以還原
    - 拖曳時尾端在 10 px 內，會吸到播放頭
    - 超過 10 px 不吸
    - 修剪時拉頭可以吸到前一個片段的尾

    測試：`src/video-editor/ui/timeline/timeline.test.tsx`（jsdom，用 `src/video-editor/model/history.ts` 的真實 `History` 加假的 session）
    - 三種軌的順序正確
    - 點片段會選取，按 Shift 會加選
    - 拖片段 100 px 後，`history` 多一步，start 也變了
    - 鎖住的軌拖不動
    - 按軌道標頭的鎖會切換 `locked`

    verify：`pnpm test src/video-editor/ui/timeline`。commit：`feat(video-editor): add the timeline with drag, trim, snapping and track headers`
13. 預覽區與鍵盤。
    - 新增 `src/video-editor/ui/preview-panel.tsx`：`PreviewPanel({ session })`。
      - canvas 照專案的寬高比置中縮放，`width` / `height` 屬性設成專案尺寸。在 ref callback 裡呼叫 `session.player.attach(canvas)`，cleanup 用它回傳的函式。
      - 下方控制列：播放 / 暫停（`preview.play` / `preview.pause`）；時間碼 `formatTimecode(playhead) / formatTimecode(projectDuration)`；比例選單（`src/primitives/` 的 `Menu`，項目是 `preview.aspectSource`、「16:9」、「9:16」、「1:1」，選了呼叫 `src/video-editor/model/edits.ts` 的 `setAspect`，經 `session.run` 執行）。
    - 新增 `src/video-editor/ui/keyboard.ts`（純函式）：`keyAction(e: { key; code; shiftKey; metaKey; ctrlKey; target })`，回傳 `"toggle" | "pause" | "play" | "back5" | "prevFrame" | "nextFrame" | "split" | "delete" | "rippleDelete" | "undo" | "redo" | "deselect" | null`。對照：
      - Space 是 toggle，K 是 pause，L 是 play，J 是 back5
      - ← 是 prevFrame，→ 是 nextFrame
      - S 是 split
      - Delete 或 Backspace 是 delete，加 Shift 是 rippleDelete
      - ⌘Z 或 Ctrl+Z 是 undo；⌘⇧Z、Ctrl+⇧Z、Ctrl+Y 是 redo
      - Esc 是 deselect
      - 焦點在 `input`、`textarea`、`select`、`[contenteditable]` 上時一律回 null
    - `src/video-editor/ui/editor-body.tsx`：根 `div` 加 `tabIndex={0}` 與 `onKeyDown`，把動作對應到 `session.player.*` 與 `src/video-editor/model/edits.ts` 的 `splitAt` / `deleteClips`（經 `session.run`）、`history.undo` / `history.redo`；在 `fv-ve-preview` 那一區放 `PreviewPanel`，在 `fv-ve-timeline` 那一區放 `src/video-editor/ui/timeline/timeline.tsx` 的 `Timeline`。

    測試：`src/video-editor/ui/keyboard.test.ts`
    - 每個按鍵對到的動作
    - 在 textarea 裡按 S 回傳 null
    - Shift+Delete 是 rippleDelete

    測試：`src/video-editor/ui/preview-panel.test.tsx`（jsdom，假的 session）
    - 按播放鍵會呼叫 `player.toggle`
    - 選「1:1」以後專案尺寸變成正方形
    - 時間碼的格式正確

    verify：`pnpm test src/video-editor/ui`。commit：`feat(video-editor): add the preview panel and keyboard shortcuts`
14. 素材欄、屬性欄、片段縮圖。
    - 新增 `src/video-editor/ui/asset-panel.tsx`：`AssetPanel({ session })`。
      - `session.assets.list()` 的結果用 `useSyncExternalStore` 讀；搜尋框依名稱過濾，不分大小寫。
      - 每一項：可以拖（`dataTransfer.setData("application/x-fv-asset", id)`），有「+」按鈕（`assets.add`）。按「+」時先 `await session.assets.load(id)`，再用 `src/video-editor/model/edits.ts` 的 `addAsset(project, info, playhead, null)` 經 `session.run` 執行。
      - 載入中顯示線性載入條；`unsupported` 顯示紅色說明。
    - `src/video-editor/ui/timeline/timeline.tsx`：軌道列加 `onDragOver` / `onDrop`；drop 時讀出 asset id，`load` 後呼叫 `addAsset(project, info, pxToTicks(x), 那列的 trackId)`。
    - 新增 `src/video-editor/ui/inspector.tsx`：`Inspector({ session })`。
      - 選到一個片段時才顯示欄位，沒選或多選時顯示 `inspector.empty`。
      - 影片 / 音訊片段：音量（`Slider` 0–200%）、靜音；影片片段多一個 fit / fill。
      - 文字片段：內容（`textarea`）、大小、顏色（`input type="color"`）、底框、x、y。
      - 圖片片段：x、y、寬度。
      - 每次改值都經 `src/video-editor/model/edits.ts` 的 `updateClip` 與 `session.run`。滑桿在拖曳中只更新畫面，放開時才 run 一次（一步 undo）。
    - 新增 `src/video-editor/ui/timeline/clip-media.tsx`：`ClipMedia({ session, clip, pps, visibleFrom, visibleTo })`。
      - 影片片段：只對畫面上看得到的範圍每 64 px 取一張，用 `session.thumbs.strip`。
      - 音訊片段，以及有聲音的影片片段下半部：用 `session.thumbs.peaks` 畫在 canvas 上。
      - 圖片片段：顯示 `session.assets.image` 的縮圖。
      - `src/video-editor/ui/timeline/clip-view.tsx` 把它放進片段裡；asset 狀態是 `loading` 時顯示線性載入條，`unsupported` 時片段加 `data-unsupported`（紅框）並顯示 `clip.unsupported`。
    - `src/video-editor/ui/editor-body.tsx`：`fv-ve-assets` 放 `AssetPanel`，`fv-ve-inspector` 放 `Inspector`；頂列的「加文字」呼叫 `addText(project, playhead, t("videoEditor.defaultText"))`，「分割」呼叫 `splitAt`。
    - `src/styles.css` 的 video-editor 段加上 `.fv-ve-asset`、`.fv-ve-inspector-field`、`.fv-ve-clip[data-unsupported]`。

    測試：`src/video-editor/ui/asset-panel.test.tsx`（jsdom）
    - 搜尋會過濾
    - 按「+」後片段加在播放頭的位置
    - `unsupported` 的素材顯示說明

    測試：`src/video-editor/ui/inspector.test.tsx`
    - 選文字片段後改字，`history` 多一步
    - 音量滑桿拖曳中不 run，放開後只多一步
    - 影片片段沒有文字欄位
    - 多選時顯示 `inspector.empty`

    測試：`src/video-editor/ui/timeline/clip-media.test.tsx`
    - 只對看得到的範圍要縮圖（檢查傳給 `strip` 的秒數都在範圍內）
    - `unsupported` 時有 `data-unsupported`

    verify：`pnpm test src/video-editor/ui && pnpm check`。commit：`feat(video-editor): add the asset panel, inspector and clip thumbnails`

phase 結尾的 verify：`pnpm test src/video-editor && pnpm check && pnpm build`（`pnpm check` 裡的 `scripts/check-entry-deps.mjs` 會確認主入口沒有靜態 import mediabunny）。

## Phase 04 — 輸出

blocker：Phase 03；model：opus。

15. 輸出設定。新增 `src/video-editor/export/settings.ts`，簽名照「契約」的 `export/settings.ts`。
    - `exportPresets(p)`：`original` 用 `p.width × p.height`，位元率 = `round(8_000_000 × p.width × p.height / (1920 × 1080))`，夾在 1_000_000–40_000_000；`1080p` 與 `720p` 照畫布比例，短邊設成 1080 或 720，寬高取偶數，位元率分別是 8_000_000 與 5_000_000。短邊比 `p.width` 與 `p.height` 的短邊還大的畫質不列出。`fps` 一律是 `p.fps`。
    - `estimateBytes`：`ceil((videoBitrate + audioBitrate) × ticksToSeconds(duration) / 8 × 1.05)`（`ticksToSeconds` 來自 `src/video-editor/model/time.ts`）。
    - `pickAudioCodec`：mediabunny 的 `canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: 48000, bitrate: 128000 })` 為 true 就回 `"aac"`，否則回 `"opus"`。
    - `canEncodePreset`：`canEncodeVideo("avc", { width, height, bitrate })`。

    測試：`src/video-editor/export/settings.test.ts`（jsdom，用 `vi.mock("mediabunny")` 換掉 `canEncodeAudio` 與 `canEncodeVideo`）
    - 1920×1080 的專案有三種畫質，1080p 的位元率是 8 Mbps
    - 1280×720 的專案沒有 1080p
    - 9:16 的 1080p 是 1080×1920
    - 4K 原尺寸的位元率被夾在 ≤ 40 Mbps
    - 2 分鐘 1080p 的估計值等於公式算出的值
    - 不能編 AAC 時回 `"opus"`

    verify：`pnpm test src/video-editor/export/settings.test.ts`。commit：`feat(video-editor): choose export presets, codecs and size estimates`
16. 混音。新增 `src/video-editor/export/audio-mix.ts`：`mixAudio(p, assets, from, to)`。
    - 建 `new OfflineAudioContext(2, round(ticksToSeconds(to − from) × 48000), 48000)`（`ticksToSeconds` 來自 `src/video-editor/model/time.ts`）。
    - 用 `src/video-editor/engine/audio-plan.ts` 的 `audioSegments(p, withAudio, from, to)` 取得要混的段落；`withAudio` 是 `src/video-editor/engine/assets.ts` 裡狀態 `ready` 而且 `info.hasAudio` 為 true 的 asset。
    - 每段用 mediabunny 的 `new AudioBufferSink((await assets.input(id)).getPrimaryAudioTrack()).buffers(seg.from, seg.to)` 讀。每個 buffer 建一個 `AudioBufferSourceNode`，接 `GainNode(seg.gain)` 再接 destination。
      - 開始位置 `startAt = ticksToSeconds(seg.at − from) + (wrapped.timestamp − seg.from)`；`startAt < 0` 時用 `start(0, −startAt)`，否則用 `start(startAt)`。
      - 在 `ticksToSeconds(seg.at − from) + (seg.to − seg.from)` 呼叫 `stop`。
    - 最後回傳 `startRendering()` 的結果。不同的取樣率交給 `OfflineAudioContext` 重取樣。

    測試：`src/video-editor/export/audio-mix.browser.test.ts`（素材用 `src/video-editor/test-utils/fixtures.ts` 的 `fixtureRef("tone-2s.ogg")` 與 `fixtureRef("red-2s.webm")`）
    - 混 0–1 秒，長度剛好 48000 frame、2 聲道
    - 音量 0.5 時峰值約是音量 1 時的一半（誤差 10% 以內）
    - 靜音的片段輸出全 0
    - 兩段疊在一起時峰值比單段大
    - 從片段中間的 1.5 秒混到 2.5 秒，前 0.5 秒有聲音、後 0.5 秒沒有

    verify：`pnpm test:browser src/video-editor/export/audio-mix.browser.test.ts`。commit：`feat(video-editor): mix timeline audio one second at a time`
17. 輸出迴圈。新增 `src/video-editor/export/export.ts`，檔頭寫來源 opencut `services/renderer/scene-exporter.ts` @cf5e79e…、MIT；`runExport` 照「契約」。
    - 準備：`new OffscreenCanvas(preset.width, preset.height)`；新建一個 `src/video-editor/engine/frame-cache.ts` 的 `FrameCache(assets)`，不跟預覽共用；`await` `src/video-editor/engine/render-frame.ts` 的 `ensureFonts()`。
    - 輸出物件：`const sink = new BlobSink()`（`src/media/blob-sink.ts`）。`new Output({ format: new Mp4OutputFormat({ fastStart: "fragmented" }), target: new StreamTarget(sink.writable) })`；視訊用 `new CanvasSource(canvas, { codec: "avc", bitrate: preset.videoBitrate })`，音訊用 `new AudioBufferSource({ codec: audioCodec, bitrate: 128_000 })`；有任何 asset 有聲音才加音訊軌，然後 `await output.start()`。
    - 迴圈：總格數 `N = ceil(projectDuration / frameTicks(fps))`。在第 n 格：
      1. 如果 n 是每秒的第一格，先 `await audioSource.add(await mixAudio(p, assets, 這一秒的頭, min(這一秒的尾, projectDuration)))`（`mixAudio` 來自 `src/video-editor/export/audio-mix.ts`）
      2. 用 `renderFrame` 畫 `t = n × frameTicks`（畫布尺寸是輸出尺寸，專案座標一律用比例，所以直接畫）
      3. `await videoSource.add(n / fps, 1 / fps)`
      4. 回報 `onProgress({ done: (n + 1) / N, etaSeconds: 已花秒數 / done × (1 − done) })`
    - 取消：`signal` 被 abort 時呼叫 `await output.cancel()`、`sink.discard()`、`frames.dispose()`，再丟出 `new DOMException("aborted", "AbortError")`。
    - 收尾：`await output.finalize()`，`frames.dispose()`，回傳 `sink.toBlob("video/mp4")`。

    測試：`src/video-editor/export/export.browser.test.ts`。專案依序放 `red-2s.webm`、`green-3s.webm` 的前 1 秒、`red-2s.webm` 的後 1 秒，加一個文字片段與一段 `tone-2s.ogg`，輸出 `original`：
    - 用 mediabunny 的 `new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })` 讀回來，視訊軌的 codec 是 `"avc"`，有音訊軌
    - `computeDuration()` 跟專案長度相差不到一格
    - `onProgress` 最後一次的 done 是 1
    - 第一次 progress 後就 abort：promise 以 `AbortError` reject，`BlobSink.prototype.discard` 被呼叫（spy）

    測試瀏覽器的 `canEncodeVideo("avc")` 如果是 false，表示 01 的瀏覽器設定要改成 `channel: "chrome"`。這時停下來回報，不改測試。

    verify：`pnpm test:browser src/video-editor/export/export.browser.test.ts`。commit：`feat(video-editor): export the timeline to fragmented MP4`
18. 輸出 Dialog 與存檔。新增 `src/video-editor/ui/export-dialog.tsx`：`ExportDialog({ session, open, maxOutputBytes, onSave, onError, onDone, onOpenChange })`，用 `src/primitives/` 的 `Dialog`。
    - 開啟時：用 `src/video-editor/export/settings.ts` 的 `exportPresets` 列出 radio，預設 `1080p`，沒有 1080p 就預設 `original`。估計大小用 `estimateBytes` 算，以 MB 顯示（`exportDialog.estimate`）。
    - 擋下的情況：估計大小超過 `maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES` 時，按鈕停用並顯示 `exportDialog.tooLarge`；`canEncodePreset` 回 false 時，停用並顯示 `exportDialog.noH264`。
    - 按「開始」：先 `pickAudioCodec()`，再用 `src/video-editor/export/export.ts` 的 `runExport` 開始輸出（`AbortController` 由 Dialog 持有），畫面顯示進度條與 `exportDialog.progress`。按「取消」就 abort，回到設定畫面。
    - 輸出完成後：
      - `blob.size > maxOutputBytes` 時，不呼叫 `onSave`，顯示 `exportDialog.tooLarge`，並 `onError(new ViewerError("output_too_large"))`。
      - 否則顯示 `exportDialog.saving`，然後 `await onSave({ blob, mime: "video/mp4", ext: ".mp4", mode: "export", suggestedName: \`${主檔名} (edited).mp4\` })`。主檔名是 `file.name` 去掉最後一個副檔名。
      - `onSave` resolve：`history.markSaved()`，然後 `onDone()`。
      - `onSave` reject：留在 Dialog，顯示 `exportDialog.saveFailed`（帶 `error.message`），並 `onError(new ViewerError("save_failed", { cause }))`。
    - `src/video-editor/ui/editor-body.tsx`：頂列的「輸出」打開 `ExportDialog`；`onDone` 呼叫 `props.onClose`。輸出中按「關閉」時，`src/video-editor/ui/close-guard.tsx` 的 `CloseGuard` 傳入 `exporting = true`，確認後先 abort 再 `onClose`。

    測試：`src/video-editor/ui/export-dialog.test.tsx`（jsdom，用 `vi.mock("../export/export")` 讓 `runExport` 回傳假的 Blob，`vi.mock("../export/settings")` 的 `canEncodePreset` 回 true）
    - `suggestedName` 是 `"trip (edited).mp4"`（輸入的檔名是 `trip.mov`），`mode` 是 `"export"`
    - 估計大小超過上限時按鈕停用
    - 不能編 H.264 時顯示 `noH264`
    - `onSave` reject 後留在 Dialog、顯示訊息、`onError` 收到 `save_failed`
    - 成功後呼叫 `onClose`，`onDirtyChange` 收到 false
    - 輸出中按取消，不會呼叫 `onSave`
    - 輸出中關閉編輯器會出 `discardExport.title`

    verify：`pnpm test src/video-editor/ui && pnpm check`。commit：`feat(video-editor): add the export dialog and hand the result to onSave`

phase 結尾的 verify：`pnpm test src/video-editor && pnpm test:browser src/video-editor && pnpm check && pnpm build`。

## Phase 05 — 整合

blocker：Phase 04、05 site；model：sonnet。

19. 端到端整合測試。新增 `src/video-editor/story.browser.test.tsx`（browser 模式，畫出真的 `VideoEditor`，從 `src/video-editor/index.ts` import；`file` 用 `src/video-editor/test-utils/fixtures.ts` 的 `fixtureRef("green-3s.webm")`；`assets` 是記憶體內的 `AssetProvider`，提供 `tone-2s.ogg` 與 `blue-64.png`）。流程：
    1. 等 ready
    2. 把播放頭移到 1 秒，按 `S`
    3. 再移到 2 秒，按 `S`
    4. 選中間那段，按 Shift+Delete，總長變成 2 秒
    5. 按「加文字」，在屬性欄改字
    6. 從素材欄按 `tone-2s.ogg` 的「+」，在屬性欄把音量調到 50%
    7. 按 ⌘Z 再按 ⇧⌘Z，狀態相同
    8. 輸出 `original`（320×180 的素材不會列出 720p）

    斷言：
    - `onSave` 收到的 `SaveRequest` 是 `mode "export"`、`ext ".mp4"`
    - 用 mediabunny 讀回 Blob，長度約 2 秒（誤差一格），有音訊軌
    - `onClose` 被呼叫一次

    verify：`pnpm test:browser src/video-editor/story.browser.test.tsx && pnpm test && pnpm check && pnpm build`。commit：`test(video-editor): cover split, ripple delete, text, music and export end to end`
20. playground 素材欄。在 05 的 playground 元件（`rg -l "<FileViewer" site/` 找到的那個檔）傳入 `editor={{ assets }}`。`assets` 是用使用者拖進 playground 的其他檔案組成的 `AssetProvider`：`list()` 回傳 `{ id: 索引字串, name, mime: file.type, size }`，`open(id)` 回傳 `src/contract/index.ts` 的 `blobSource(file)`。docs 站「接上你的 app」頁加一段「影片編輯器」，說明 `editor.assets` 與 `editor.maxOutputBytes`，並寫明這個元件不需要放寬 CSP、不開 worker。

    測試：在同一個 playground 元件的現有測試檔（同目錄的 `*.test.tsx`）加一案：拖進兩個檔以後，`assets.list()` 有兩項。

    verify：`pnpm test site && pnpm site:build`。commit：`feat(video-editor): offer dropped files as editor assets in the playground`

phase 結尾的 verify：`pnpm test && pnpm test:browser src/video-editor && pnpm check && pnpm build && pnpm site:build`。

## 驗收（主 agent；本機 `pnpm site:dev` 的 playground，使用者自己開）

- 一支 1.5 GiB 的 mp4：在任意位置拖播放頭，1 秒內出畫面；DevTools Memory 看 JS heap 不超過 500 MB。mov、webm 各開一支。Firefox 開 HEVC 會出現 `notice.codec`。
- 剪一段 3 個片段、加文字與一條配樂的 2 分鐘影片，輸出 1080p：Chrome、Safari、Firefox 與 macOS QuickTime 都能播，長度誤差小於一格，聲音同步。輸出 20 分鐘的 1080p 時 heap 不超過 1 GB。
- Network 面板沒有任何請求；console 沒有 CSP violation；亮暗兩種主題各看一次。

## 之後再做

- 專案檔（存下來，下次接著剪）。
- 轉場、關鍵影格動畫、變速、濾鏡與調色（可以共用 10 的 GL 管線）、子母畫面（第二條影片軌）。
- 自動字幕（在瀏覽器裡跑語音模型，授權另查）。
- 手機版剪輯器、倒著播（J 目前是往回跳 5 秒）。
- 讀素材時的百分比進度（要 `ByteSource` 提供進度回呼，屬於 02 的契約）。
- 邊編碼邊上傳、超過 2 GiB 的輸出（宿主那邊要改 contract）。
- 宿主那邊的事（SDK `files.reader`、Blob 上傳不整包讀、`vaultSource`、`maxOutputBytes` 依配額算、`AssetProvider` 接檔案清單、撞名、走查 Story）：H1 Phase 2。
- OpenCut 重寫版出了可以嵌入的瀏覽器套件、而且授權仍是 MIT 的話，重新評估要不要換過去。
