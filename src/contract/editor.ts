import type { AssetProvider, CommonProps } from "./props";
import type { SaveHandler } from "./save";

export type EditorProps = CommonProps & {
  onSave: SaveHandler;
  onClose: () => void; // 取消，或存完要回 viewer；dirty 時由編輯器自己先問「放棄修改？」
  onDirtyChange?: (dirty: boolean) => void;
  maxOutputBytes?: number;
  assets?: AssetProvider;
};
