import type { BlendMode, LayerAdjustment, LayerRecord, Manifest } from "../comp/index"; // 09
import type { ViewerError } from "../contract/errors"; // 02
import type { Messages, Vars } from "../i18n/messages"; // 02；Messages 已含 & ImageMessages（第 1 步），11–13 加自己的區域
import type { ComponentType, ReactNode } from "react";
import type { JobInput, JobKind, JobOutput } from "./worker/jobs";
export type { BlendMode }; // 09 的 24 個字串，順序見 BLEND_MODES
export type Layer = LayerRecord; // 09 的 LayerRecord：id、name、isVisible、transform、imageFile?、parentID?、isGroup?、opacity?、blendMode?、maskFile?、maskEnabled?、maskSourceID?、maskPlacement?、maskLinked?、adjustment?、effects?、text?、shape?（以及 extra）
export type LayerId = string; // 大寫 UUID
export type AdjustmentSettings = LayerAdjustment;
export type AdjustmentKind = AdjustmentSettings["kind"];
export type MessageKey = Extract<keyof Messages, string>; // 任何區域的 key；用 src/image-editor/labels.ts 的合併表翻譯（規則見「判斷」的跨區域翻譯）
export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Mat2D = readonly [a: number, b: number, c: number, d: number, e: number, f: number]; // x' = a x + c y + e；y' = b x + d y + f
export type PixelTarget = "image" | "mask";

export type LayerPixels =
  | { kind: "png"; bytes: Uint8Array } // 沒改過：原 PNG，存檔原樣寫回
  | { kind: "gpu"; png?: Uint8Array }; // 改過：以 texture 為準；png 是背景編好的快取（第 10 步），存檔與 context 重建優先用
export type Doc = {
  manifest: Manifest; // 樹的順序（09 讀檔時已排好）
  pixels: ReadonlyMap<LayerId, { image?: LayerPixels; mask?: LayerPixels }>;
};
export type Command = (doc: Doc) => Doc; // 純函式，src/image-editor/doc/commands/*
export type PixelTile = {
  // 256 × 256（右、下邊緣較小），圖層自己的像素座標
  layer: LayerId;
  target: PixelTarget;
  x: number;
  y: number;
  width: number;
  height: number;
  before: Uint8Array;
  after?: Uint8Array; // RGBA8 直通 alpha（image）或 R8（mask）；after 由 commit 填
};
export type LayerResize = {
  // 改像素尺寸的 undo 紀錄：resizePixels 回傳，交給 commit 的第 4 個參數
  layer: LayerId;
  target: PixelTarget;
  before: { width: number; height: number; data: Uint8Array }; // 改之前整張
  after?: { width: number; height: number; data: Uint8Array }; // commit 讀回整張
};
export type Selection = {
  // 選取範圍（內容由 11 提供）：畫布大小的 R8，255 = 全選
  version: number; // 每次改動遞增
  texture: WebGLTexture; // 文件座標，寬高 = manifest.width × height，R8
  bounds: Rect; // 非零像素的外框（文件座標，非空）
  read(rect: Rect): Uint8Array; // 文件座標的 R8；畫布外的部分是 0
};

export type Session = {
  active: LayerId | null;
  target: PixelTarget; // 「畫在遮色片上」
  tool: string; // ToolSpec.id
  collapsed: ReadonlySet<LayerId>;
  renderHidden: ReadonlySet<LayerId>; // 只影響畫面（13 編輯文字時藏那一層），不進文件、匯出照畫
};
export type ViewTransform = { zoom: number; dpr: number; docToScreen: Mat2D; screenToDoc: Mat2D }; // screen = canvas 元素的 CSS px
export type PassView = {
  scale: number;
  width: number;
  height: number;
  docFromPx: Mat2D;
  forExport: boolean;
}; // docFromPx：輸出 px → 文件座標；forExport = render 的 opts.forExport（存檔、匯出、readComposite 為 true，畫面為 false）
export type EffectTarget = {
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
  pad: number;
};

export interface EditorApi {
  readonly gl: WebGL2RenderingContext;
  doc(): Doc;
  session(): Session;
  setSession(patch: Partial<Session>): void;
  dispatch(command: Command, label?: MessageKey): void; // 有 label = 記一步 undo；沒有 = 即時預覽，不記，下一次有 label 的 dispatch / commit 從上一個記錄點算
  commit(label: MessageKey, doc: Doc, tiles: PixelTile[], resizes?: readonly LayerResize[]): void; // 像素已寫進 GPU；tiles 來自 snapshotTiles、resizes 來自 resizePixels，commit 讀回 after。undo：先寫回 tiles 的 before，再換回 resizes 的 before；redo：先換成 resizes 的 after，再寫 tiles 的 after
  snapshotTiles(id: LayerId, target: PixelTarget, rect: Rect): PixelTile[]; // 改像素之前呼叫，讀回 before
  layerTexture(id: LayerId): WebGLTexture;
  maskTexture(id: LayerId): WebGLTexture | null;
  pixelSize(id: LayerId, target: PixelTarget): Size | null; // texture 的像素尺寸；還沒有 texture（資料夾、調整圖層、還沒寫過的新層、沒有遮色片）回 null
  resizePixels(
    id: LayerId,
    target: PixelTarget,
    size: Size,
    opts?: { offset?: Point; pixels?: Uint8Array },
  ): LayerResize; // 換成 size 大小的新 texture：有 pixels（size 大小，image RGBA8 直通 / mask R8）就整張寫入；否則舊像素放在新 texture 的 offset（預設 0,0，可為負），其餘 image 透明、mask 填舊遮色片邊緣多數的值。沒有舊 texture 時先當作 transform 大小的透明（mask 全 255）。邊長 > min(MAX_TEXTURE_SIZE, 30,000) 丟 ViewerError("too_large")；預算由呼叫端先 checkBudget。不改文件、不記 undo：呼叫端改 transform（resizedTransform、patchLayer）後把回傳值交給 commit
  writeRegion(id: LayerId, target: PixelTarget, rect: Rect, pixels: Uint8Array): void; // 圖層像素座標；image = RGBA8 直通 alpha，mask = R8
  readRegion(id: LayerId, target: PixelTarget, rect: Rect): Uint8Array;
  readComposite(rect: Rect): Uint8Array; // 文件座標，合併結果 RGBA8 直通 alpha（原尺寸，不受畫面縮放影響）
  layerMatrix(id: LayerId): Mat2D; // 文件座標 → 圖層像素座標（= layerMatrixOf(transform, pixelSize ?? transform 的大小)）
  checkBudget(add: { layerPx?: number; maskPx?: number }): ViewerError | null; // 超過回 too_large
  runInWorker<K extends JobKind>(
    job: { kind: K; input: JobInput<K> },
    transfer?: Transferable[],
    signal?: AbortSignal,
  ): Promise<JobOutput<K>>;
  requestRender(): void;
  selection(): Selection | null; // selectionProvider()?.get(this) ?? null；沒註冊 provider 或沒有選取時 null
  openDialog(render: (close: () => void) => ReactNode): () => void; // 在編輯器自己的 React 樹裡（ViewerRoot 之內，主題、語系、宿主 messages 都生效）掛一個節點，通常是 02 的 Dialog；回傳 close
  showError(e: ViewerError, key?: MessageKey, vars?: Vars): void; // 交給宿主 onError（useRoot().report），提示條顯示 key（沒給用 `error.<code>`），直到下一次有 label 的 dispatch / commit 或下一個 showError
  t(key: MessageKey, vars?: Vars): string; // 用合併表與目前語系、宿主 messages 翻譯（React 外用）
}

export type ToolSpec = {
  id: string;
  label: MessageKey;
  icon: ComponentType;
  cursor: string | ((api: EditorApi) => string);
  key: string; // 單鍵（"V"）；同一鍵多個工具時 Shift + 鍵循環
  slot?: string; // 工具列同一格（長按或右鍵展開）；沒給 = 自己一格
  onPointerDown?(p: Point, e: PointerEvent, api: EditorApi): void; // p 是文件座標
  onPointerMove?(p: Point, e: PointerEvent, api: EditorApi): void;
  onPointerUp?(p: Point, e: PointerEvent, api: EditorApi): void;
  onKeyDown?(e: KeyboardEvent, api: EditorApi): boolean; // 工具作用中的按鍵；回 true = 吃掉
  drawOverlay?(ctx: CanvasRenderingContext2D, view: ViewTransform, api: EditorApi): void;
  onDeactivate?(api: EditorApi): void; // session.tool 從這個工具換成別的之前呼叫一次（收尾：結束文字編輯、合併浮動像素）
  panel?: ComponentType<{ api: EditorApi }>; // 右上屬性欄最上面（工具選項）
};
export type SelectionProvider = {
  // 11 用 registerSelection 註冊一次
  get(api: EditorApi): Selection | null; // null = 沒有選取
  clear?(api: EditorApi): void; // 有選取時的 Delete / Backspace：清掉目前圖層（或遮色片）選取範圍內的像素，記一步
  move?: Pick<
    ToolSpec,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onKeyDown" | "drawOverlay" | "onDeactivate"
  >; // 移動工具在有選取時改交給它：移動選取範圍內的像素
};
export type PropertyPanelSpec = {
  id: string;
  order?: number; // 屬性欄裡依 order 由上往下，排在目前工具的 panel 下面
  when(layer: Layer, api: EditorApi): boolean; // layer = session.active 那一層；回 true 才畫
  component: ComponentType<{ api: EditorApi; layer: Layer }>; // undo / redo 後收到新的 layer
};
export type SetupFn = (api: EditorApi, root: HTMLElement) => (() => void) | void; // 每個編輯器掛上時呼叫一次；root = 編輯器的 .fv-root；回傳的函式在卸載時呼叫
export type AdjustmentHooks = {
  // lut 與 pass 擇一
  lut?(gl: WebGL2RenderingContext, s: AdjustmentSettings): { dims: 1 | 3; texture: WebGLTexture }; // 1：256×1 RGBA16F TEXTURE_2D，逐通道查；3：33³ RGBA16F TEXTURE_3D，三線性。10 的合成 shader 取樣；texture 歸 10 管理，換設定或刪層時由 10 `deleteTexture`
  pass?(
    gl: WebGL2RenderingContext,
    src: WebGLTexture,
    dst: WebGLFramebuffer,
    s: AdjustmentSettings,
    view: PassView,
  ): void; // src = 下面累積結果（預乘）
  reach(s: AdjustmentSettings, scale: number): number; // 往外要幾 px（輸出 px）
};
export type EffectsHooks = {
  pass(
    gl: WebGL2RenderingContext,
    layer: Layer,
    src: WebGLTexture,
    dst: EffectTarget,
    view: PassView & { version: number },
  ): void; // src = 套過自己遮色片的圖層像素；dst 四邊各多 pad；version 在該層像素改變時遞增
  reach(effects: NonNullable<Layer["effects"]>, scale: number): number;
};
export type MenuId =
  | "edit"
  | "image"
  | "layer"
  | "select"
  | "layer-context"
  | "layer-new"
  | "hidden"; // hidden = 只有快捷鍵
export type MenuItemSpec = {
  id: string;
  menu: MenuId;
  label: MessageKey;
  order?: number;
  shortcut?: string; // "Mod+Shift+D"；Mod = macOS ⌘、其他 Ctrl；Alt、Shift；按鍵用 KeyboardEvent.key 的大寫
  enabled?(api: EditorApi): boolean;
  run(api: EditorApi): void;
};
export type LayerDecor = {
  id: string;
  thumbnail?(layer: Layer, api: EditorApi): ReactNode | null; // 第一個回非 null 的取代預設縮圖
  badge?(layer: Layer, api: EditorApi): ReactNode | null; // 名稱右邊（12 的 fx）
  onTransformEnd?(id: LayerId, before: Layer["transform"], api: EditorApi): void; // 變形工具每次 commit 後（13 的形狀重畫）
  onThumbnailClick?(
    layer: Layer,
    target: PixelTarget,
    mods: { mod: boolean; shift: boolean; alt: boolean },
    api: EditorApi,
  ): boolean; // 點圖層縮圖（"image"）或遮色片縮圖（"mask"）時、10 的預設處理之前依註冊順序呼叫；回 true = 吃掉（11 的 ⌘ 點載入選取）；mod = macOS ⌘、其他 Ctrl
};
export type OverlaySpec = {
  id: string;
  draw(ctx: CanvasRenderingContext2D, view: ViewTransform, api: EditorApi, time: number): void;
  animated?(api: EditorApi): boolean;
};

export const BLEND_MODES: readonly BlendMode[] = [
  "Normal",
  "Darken",
  "Multiply",
  "Color Burn",
  "Linear Burn",
  "Lighten",
  "Screen",
  "Color Dodge",
  "Linear Dodge (Add)",
  "Overlay",
  "Soft Light",
  "Hard Light",
  "Vivid Light",
  "Linear Light",
  "Pin Light",
  "Hard Mix",
  "Difference",
  "Exclusion",
  "Subtract",
  "Divide",
  "Hue",
  "Saturation",
  "Color",
  "Luminosity",
];

// Compositor Document/LayerAppearance.swift `groups`: separators in the blend mode menu.
export const BLEND_GROUPS: readonly (readonly BlendMode[])[] = [
  BLEND_MODES.slice(0, 1),
  BLEND_MODES.slice(1, 5),
  BLEND_MODES.slice(5, 9),
  BLEND_MODES.slice(9, 16),
  BLEND_MODES.slice(16, 20),
  BLEND_MODES.slice(20, 24),
];
