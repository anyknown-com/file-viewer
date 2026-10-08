import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { Menubar } from "../../primitives/menubar";
import type { EditorApi, MenuId } from "../api";
import { EditorCanvas, type View } from "../canvas";
import type { DocStore } from "../doc/store";
import { redo, undo } from "../layer-ops";
import { menuItems } from "../registry";
import { shortcutLabel } from "../shortcut";
import { UiOutlet, type UiSlot } from "../ui-slot";
import { LayerList } from "./layers/layer-list";
import { Notice } from "./notice";
import { Properties } from "./properties";
import { handleKey } from "./shortcuts";
import { Toolbar } from "./toolbar";
import { Topbar } from "./topbar";
import { useLabel } from "./use-label";

const MENUS = ["edit", "image", "layer", "select"] as const satisfies readonly MenuId[];

// Keys typed into menus, dialogs and selects belong to them.
const OWN_KEYS = "[role='menu'], [role='listbox'], [role='dialog']";

function EditorMenus({ api }: { api: EditorApi }): React.JSX.Element {
  const label = useLabel();
  const menus = MENUS.map((menu) => ({
    id: menu,
    label: label(`image.menu.${menu}`),
    items: menuItems(menu).map((spec) => ({
      id: spec.id,
      label: label(spec.label),
      onSelect: () => spec.run(api),
      disabled: spec.enabled ? !spec.enabled(api) : false,
      shortcut: spec.shortcut && shortcutLabel(spec.shortcut),
    })),
  })).filter((menu) => menu.items.length > 0);
  return <Menubar menus={menus} />;
}

/**
 * The editor's frame: top bar, menu bar and notices over the tool column, the canvas, and the
 * properties and layer panels. Keys anywhere in the editor (or on the page body) go to handleKey.
 * `ui` must be the slot `api` was made with.
 */
export function EditorShell(props: {
  api: EditorApi;
  store: DocStore;
  ui: UiSlot;
  name: string;
  view: View;
  onViewChange(v: View): void;
  saveSlot: ReactNode;
  onClose(): void;
}): React.JSX.Element {
  const { api, store, ui } = props;
  const label = useLabel();
  // Re-render on every document change: menu items' enabled state reads the document.
  useSyncExternalStore(store.subscribe, store.get);
  const dirty = useSyncExternalStore(store.subscribe, store.dirty);
  const canUndo = useSyncExternalStore(store.subscribe, store.canUndo);
  const canRedo = useSyncExternalStore(store.subscribe, store.canRedo);
  const notice = useSyncExternalStore(ui.subscribe, ui.notice);
  const [unsupported, setUnsupported] = useState(false);
  const onRender = useCallback((r: { unsupported: boolean }) => setUnsupported(r.unsupported), []);

  const keys = useCallback(
    (shell: HTMLDivElement | null) => {
      if (!shell) return;
      const doc = shell.ownerDocument;
      const root = shell.closest(".fv-root") ?? shell;
      const onKey = (e: KeyboardEvent) => {
        const target = e.target as Node | null;
        if (target !== doc.body && !root.contains(target)) return;
        if (target instanceof Element && target.closest(OWN_KEYS)) return;
        if (handleKey(e, api)) e.preventDefault();
      };
      doc.addEventListener("keydown", onKey);
      return () => doc.removeEventListener("keydown", onKey);
    },
    [api],
  );

  const messages = [
    ...(unsupported ? [{ key: "image.notice.unsupported" as const }] : []),
    ...(notice ? [notice] : []),
  ];
  return (
    <div className="fv-ie-shell" ref={keys}>
      <Topbar
        name={props.name}
        dirty={dirty}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => undo(api)}
        onRedo={() => redo(api)}
        onClose={props.onClose}
        saveSlot={props.saveSlot}
      />
      <EditorMenus api={api} />
      <Notice messages={messages} />
      <div className="fv-ie-main">
        <Toolbar api={api} />
        <div className="fv-ie-stage">
          <EditorCanvas
            api={api}
            view={props.view}
            onViewChange={props.onViewChange}
            onRender={onRender}
          />
          <output className="fv-ie-zoom" aria-label={label("image.zoom")}>
            {`${Math.round(props.view.zoom * 100)}%`}
          </output>
        </div>
        <div className="fv-ie-side">
          <Properties api={api} store={store} />
          <LayerList api={api} />
        </div>
      </div>
      <UiOutlet slot={ui} />
    </div>
  );
}
