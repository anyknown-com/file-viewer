import { useSyncExternalStore } from "react";
import type { EditorApi } from "../api";
import type { DocStore } from "../doc/store";
import { internalsOf } from "../editor-api";
import { propertyPanels, tools } from "../registry";

/** The current tool's panel, then every registered panel that wants the active layer. */
export function Properties({ api, store }: { api: EditorApi; store: DocStore }): React.JSX.Element {
  const doc = useSyncExternalStore(store.subscribe, store.get);
  const session = useSyncExternalStore(internalsOf(api).subscribeSession, api.session);
  const ToolPanel = tools().find((t) => t.id === session.tool)?.panel;
  const layer = doc.manifest.layers.find((l) => l.id === session.active);
  return (
    <div className="fv-ie-properties">
      {ToolPanel && <ToolPanel api={api} />}
      {layer &&
        propertyPanels()
          .filter((spec) => spec.when(layer, api))
          .map(({ id, component: Panel }) => <Panel key={id} api={api} layer={layer} />)}
    </div>
  );
}
