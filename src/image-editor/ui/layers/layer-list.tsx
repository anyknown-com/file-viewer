import { useRef, useState, useSyncExternalStore } from "react";
import type { Manifest } from "../../../comp/index";
import type { EditorApi, Layer, LayerId } from "../../api";
import { renameLayer, setVisible } from "../../doc/commands/index";
import { children, MAX_DEPTH } from "../../doc/tree";
import { internalsOf } from "../../editor-api";
import { isFolder, run } from "../../layer-ops";
import { useLabel } from "../use-label";
import { Appearance } from "./appearance";
import { clipAtBoundary, startLayerDrag } from "./layer-drag";
import { LayerActions } from "./layer-actions";
import { LayerRow } from "./layer-row";

type Entry = { layer: Layer; depth: number };

/** The rows on screen, top of the stack first; a collapsed folder hides what is inside it. */
function rowsOf(m: Manifest, collapsed: ReadonlySet<LayerId>): Entry[] {
  const out: Entry[] = [];
  const walk = (parent: LayerId | null, depth: number) => {
    const kids = children(m, parent);
    for (let i = kids.length - 1; i >= 0; i--) {
      const layer = kids[i];
      out.push({ layer, depth });
      if (isFolder(layer) && !collapsed.has(layer.id) && depth < MAX_DEPTH)
        walk(layer.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/**
 * The layer panel: blend mode and opacity, the layer tree, and the buttons under it. Keyboard on a
 * focused row: Up / Down change the active layer, Enter renames, Space shows or hides.
 */
export function LayerList({ api }: { api: EditorApi }): React.JSX.Element {
  const { store, subscribeSession } = internalsOf(api);
  const doc = useSyncExternalStore(store.subscribe, store.get);
  const session = useSyncExternalStore(subscribeSession, api.session);
  const label = useLabel();
  const [renaming, setRenaming] = useState<LayerId | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const rows = rowsOf(doc.manifest, session.collapsed);
  const active = doc.manifest.layers.find((l) => l.id === session.active);
  const focusable =
    active && rows.some((r) => r.layer.id === active.id) ? active.id : rows[0]?.layer.id;

  const toggleFolder = (id: LayerId) => {
    const collapsed = new Set(session.collapsed);
    if (!collapsed.delete(id)) collapsed.add(id);
    api.setSession({ collapsed });
  };
  const endRename = (id: LayerId, name: string | null) => {
    setRenaming(null);
    const layer = api.doc().manifest.layers.find((l) => l.id === id);
    if (name !== null && name.trim() !== "" && layer && name !== layer.name) {
      run(api, renameLayer(id, name), "image.layers.rename");
    }
    list.current?.querySelector<HTMLElement>(`[data-layer-id="${id}"]`)?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const row = e.target as HTMLElement;
    if (row.getAttribute("role") !== "treeitem" || e.metaKey || e.ctrlKey || e.altKey) return;
    const id = row.dataset.layerId as LayerId;
    const at = rows.findIndex((r) => r.layer.id === id);
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const next = rows[at + (e.key === "ArrowUp" ? -1 : 1)]?.layer.id;
      if (next) {
        api.setSession({ active: next });
        list.current?.querySelector<HTMLElement>(`[data-layer-id="${next}"]`)?.focus();
      }
    } else if (e.key === "Enter") {
      setRenaming(id);
    } else if (e.key === " ") {
      const layer = rows[at]?.layer;
      if (!layer) return;
      const key = layer.isVisible ? "image.layers.hide" : "image.layers.show";
      run(api, setVisible(id, !layer.isVisible), key);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };
  const onRowPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = list.current;
    if (!el || clipAtBoundary(e.nativeEvent, el, api)) return;
    startLayerDrag(e.nativeEvent, el, api, e.currentTarget.dataset.layerId as LayerId);
  };

  return (
    <div className="fv-ie-layers">
      {active && <Appearance api={api} layer={active} />}
      <div
        className="fv-ie-layer-tree"
        role="tree"
        aria-label={label("image.menu.layer")}
        tabIndex={-1}
        ref={list}
      >
        {rows.map(({ layer, depth }) => (
          <LayerRow
            key={layer.id}
            api={api}
            layer={layer}
            depth={depth}
            active={layer.id === session.active}
            target={session.target}
            focusable={layer.id === focusable}
            expanded={!session.collapsed.has(layer.id)}
            renaming={renaming === layer.id}
            onToggleFolder={() => toggleFolder(layer.id)}
            onStartRename={() => setRenaming(layer.id)}
            onEndRename={(name) => endRename(layer.id, name)}
            onPointerDown={onRowPointerDown}
            onKeyDown={onKeyDown}
          />
        ))}
      </div>
      <LayerActions api={api} active={active} />
    </div>
  );
}
