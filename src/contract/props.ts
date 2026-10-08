import type { ReactNode } from "react";
import type { Locale, Messages } from "../i18n/messages";
import type { ByteSource, FileRef } from "./byte-source";
import type { ViewerError } from "./errors";
import type { Limits } from "./limits";
import type { SaveHandler } from "./save";

export type Theme = "light" | "dark";

export type CommonProps = {
  file: FileRef;
  locale?: Locale;
  messages?: Partial<Messages>;
  theme?: Theme;
  limits?: Partial<Limits>;
  onError?: (e: ViewerError) => void;
};

export type RootProps = Omit<CommonProps, "file"> & { className?: string; children: ReactNode };

export type AssetInfo = { id: string; name: string; mime: string; size: number };
export type AssetProvider = {
  list(): Promise<AssetInfo[]>;
  open(id: string): Promise<ByteSource>;
};

export type FileViewerProps = CommonProps & {
  onSave?: SaveHandler;
  onDirtyChange?: (dirty: boolean) => void;
  markdown?: { resolveImage?: (src: string, alt: string) => string | null };
  excalidraw?: { assetPath?: string };
  editor?: { maxOutputBytes?: number; assets?: AssetProvider };
};
