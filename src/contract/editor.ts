import type { AssetProvider, CommonProps } from "./props";
import type { SaveHandler } from "./save";

/** Props every editor receives from FileViewer. */
export type EditorProps = CommonProps & {
  /** Receives the edited result when the user saves. */
  onSave: SaveHandler;
  /** Called when the user cancels, or after saving, to return to the viewer. */
  onClose: () => void; // 取消，或存完要回 viewer；dirty 時由編輯器自己先問「放棄修改？」
  /** Called when unsaved changes appear or are cleared. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Largest result the editor may produce, in bytes. */
  maxOutputBytes?: number;
  /** The host's own assets the editor can offer. */
  assets?: AssetProvider;
};
