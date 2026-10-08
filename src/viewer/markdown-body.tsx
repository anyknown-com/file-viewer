import { lazy, Suspense, useCallback, useState } from "react";
import { splitName, suggestedName } from "../contract/save";
import { DiagramBlock } from "../excalidraw/diagram-block";
import { commonMessages } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { MarkdownView, replaceFence, type Fence } from "../markdown";
import { Spinner } from "../primitives/spinner";
import type { BodyProps } from "./bodies";

const LazyDiagramEditor = lazy(() => import("../excalidraw/diagram-editor"));

export default function MarkdownBody({ file, loaded, viewer }: BodyProps): React.JSX.Element {
  const [source, setSource] = useState(loaded.text ?? "");
  const [editing, setEditing] = useState<Fence | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const t = useT(commonMessages);

  // Back from the editor: focus the diagram that was edited.
  const docRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || focusIndex === null) return;
      node.querySelector<HTMLElement>(`[data-fence="${focusIndex}"] .fv-diagram`)?.focus();
      setFocusIndex(null);
    },
    [focusIndex],
  );

  if (editing) {
    const close = () => {
      viewer.onEditingChange?.(false);
      setFocusIndex(editing.index);
      setEditing(null);
    };
    const save = async (json: string) => {
      const next = replaceFence(source, editing, json);
      const { ext } = splitName(file.name);
      // Only reachable through onEdit, which exists only when viewer.onSave does.
      await viewer.onSave!({
        blob: new Blob([next], { type: "text/markdown" }),
        mime: "text/markdown",
        ext,
        mode: "replace",
        suggestedName: suggestedName(file.name, ext, "replace"),
      });
      setSource(next);
    };
    return (
      <Suspense fallback={<Spinner label={t("common.loading")} />}>
        <LazyDiagramEditor
          json={editing.json}
          assetPath={viewer.excalidraw?.assetPath}
          onDirtyChange={viewer.onDirtyChange}
          onSave={save}
          onClose={close}
        />
      </Suspense>
    );
  }

  return (
    <div className="fv-md-body" ref={docRef}>
      <MarkdownView
        source={source}
        resolveImage={viewer.markdown?.resolveImage}
        renderDiagram={(fence) => (
          <div className="fv-diagram-slot" data-fence={fence.index}>
            <DiagramBlock
              json={fence.json}
              assetPath={viewer.excalidraw?.assetPath}
              onEdit={
                viewer.onSave
                  ? () => {
                      viewer.onEditingChange?.(true);
                      setEditing(fence);
                    }
                  : undefined
              }
            />
          </div>
        )}
      />
    </div>
  );
}
