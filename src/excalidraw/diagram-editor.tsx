import "@excalidraw/excalidraw/index.css";
import { Excalidraw, hashElementsVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { useMemo, useRef, useState } from "react";
import type { CommonProps } from "../contract/props";
import { commonMessages } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { Button } from "../primitives/button";
import { DiscardDialog } from "../primitives/dialog";
import { useRoot } from "../primitives/root-context";
import { ViewerRoot } from "../primitives/root";
import { Spinner } from "../primitives/spinner";
import { setAssetPath } from "./asset-path";
import { parseScene } from "./parse-scene";
import { useResolvedTheme } from "./use-resolved-theme";

/** Props of DiagramEditor. */
export type DiagramEditorProps = Omit<CommonProps, "file"> & {
  /** The .excalidraw document text to edit; must parse with parseScene. */
  json: string;
  /** Folder Excalidraw loads its fonts from. */
  assetPath?: string;
  /** Called with the serialized scene on Save; a rejection keeps the editor open and shows its message. */
  onSave: (json: string) => Promise<void>;
  /** Called after a successful save, on Cancel with no changes, or after discarding changes. */
  onClose: () => void;
  /** Called when the scene starts or stops differing from the last saved one. */
  onDirtyChange?: (dirty: boolean) => void;
};

const UI_OPTIONS = {
  canvasActions: {
    loadScene: false,
    export: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
} as const;

type BodyProps = Pick<
  DiagramEditorProps,
  "json" | "assetPath" | "onSave" | "onClose" | "onDirtyChange"
>;

function EditorBody({ json, assetPath, onSave, onClose, onDirtyChange }: BodyProps) {
  // Idempotent global write; must happen before Excalidraw loads its fonts.
  setAssetPath(assetPath);
  const tc = useT(commonMessages);
  const theme = useResolvedTheme();
  const locale = useRoot().locale;
  // The caller only opens the editor for a scene that parsed.
  const initial = useMemo(() => parseScene(json), [json]);
  const initialData = useMemo(
    () =>
      ({
        ...(initial.ok ? initial.scene : {}),
        scrollToContent: true,
      }) as ExcalidrawInitialDataState,
    [initial],
  );

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const baseRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleChange(elements: Parameters<typeof hashElementsVersion>[0]) {
    const hash = hashElementsVersion(elements);
    if (baseRef.current === null) {
      baseRef.current = hash;
      return;
    }
    const next = hash !== baseRef.current;
    if (next === dirtyRef.current) return;
    dirtyRef.current = next;
    setDirty(next);
    onDirtyChange?.(next);
  }

  async function save() {
    const api = apiRef.current;
    if (!api) return;
    setSaving(true);
    setError(null);
    const next = serializeAsJSON(
      api.getSceneElements(),
      api.getAppState(),
      api.getFiles(),
      "local",
    );
    try {
      await onSave(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
      return;
    }
    onDirtyChange?.(false);
    onClose();
  }

  function cancel() {
    if (dirty) setConfirmOpen(true);
    else onClose();
  }

  return (
    <div className="fv-diagram-editor">
      <div className="fv-editor-bar">
        <p className="fv-editor-error" role={error ? "alert" : undefined}>
          {error}
        </p>
        <Button variant="secondary" disabled={saving} onClick={cancel}>
          {tc("common.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={saving}
          icon={saving ? <Spinner label={tc("common.loading")} /> : undefined}
          onClick={() => void save()}
        >
          {tc("common.save")}
        </Button>
      </div>
      <div className="fv-diagram-editor-canvas">
        <Excalidraw
          initialData={initialData}
          theme={theme}
          langCode={locale === "zh-TW" ? "zh-TW" : "en"}
          UIOptions={UI_OPTIONS}
          excalidrawAPI={(api) => {
            apiRef.current = api;
          }}
          onChange={handleChange}
        />
      </div>
      <DiscardDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onDiscard={() => {
          onDirtyChange?.(false);
          onClose();
        }}
      />
    </div>
  );
}

/** Edits one Excalidraw scene in place; Save hands back the serialized JSON. */
export default function DiagramEditor(props: DiagramEditorProps): React.JSX.Element {
  const { json, assetPath, onSave, onClose, onDirtyChange, ...root } = props;
  return (
    <ViewerRoot {...root}>
      <EditorBody
        json={json}
        assetPath={assetPath}
        onSave={onSave}
        onClose={onClose}
        onDirtyChange={onDirtyChange}
      />
    </ViewerRoot>
  );
}
