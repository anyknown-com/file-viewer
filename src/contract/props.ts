import type { ReactNode } from "react";
import type { Locale, Messages } from "../i18n/messages";
import type { ByteSource, FileRef } from "./byte-source";
import type { ViewerError } from "./errors";
import type { ImageResolver } from "./image-resolver";
import type { Limits } from "./limits";
import type { SaveHandler } from "./save";

/** Color scheme the viewer renders in. */
export type Theme = "light" | "dark";

/** Props shared by the viewer and every editor. */
export type CommonProps = {
  /** The file to open. */
  file: FileRef;
  /** Language of the built-in text. Defaults to "en". */
  locale?: Locale;
  /** Overrides for individual built-in strings. */
  messages?: Partial<Messages>;
  /** Color scheme. When omitted, none is forced and the surrounding --ak-* tokens apply. */
  theme?: Theme;
  /** Size limits that replace the defaults, key by key. */
  limits?: Partial<Limits>;
  /** Called when opening or saving fails, with the error and its code. */
  onError?: (e: ViewerError) => void;
};

export type RootProps = Omit<CommonProps, "file"> & { className?: string; children: ReactNode };

/** Describes one asset an AssetProvider can supply. */
export type AssetInfo = {
  /** Stable identifier passed back to AssetProvider.open. */
  id: string;
  /** File name shown to the user. */
  name: string;
  /** MIME type of the asset. */
  mime: string;
  /** Size in bytes. */
  size: number;
};
/** Supplies the host's own assets (for example library images) to an editor. */
export type AssetProvider = {
  /** Lists the assets the user can pick from. */
  list(): Promise<AssetInfo[]>;
  /** Opens one asset by its AssetInfo id. */
  open(id: string): Promise<ByteSource>;
};

/** Props of FileViewer. */
export type FileViewerProps = CommonProps & {
  /** Receives the edited file when the user saves. Without it the viewer is read-only. */
  onSave?: SaveHandler;
  /** Called when unsaved changes appear or are cleared. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called with true when an editor opens and false when it closes. */
  onEditingChange?: (editing: boolean) => void; // 按「編輯」時 true；編輯器 onClose 時 false
  /** Options for Markdown files. */
  markdown?: { resolveImage?: ImageResolver };
  /** Options for Excalidraw diagrams. */
  excalidraw?: { assetPath?: string };
  /** Options for the editors. */
  editor?: { maxOutputBytes?: number; assets?: AssetProvider };
};
