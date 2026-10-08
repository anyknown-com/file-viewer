import type { MessageTable } from "../i18n/messages";
import type {
  AdjustmentHooks,
  AdjustmentKind,
  EffectsHooks,
  LayerDecor,
  MenuId,
  MenuItemSpec,
  OverlaySpec,
  PropertyPanelSpec,
  SelectionProvider,
  SetupFn,
  ToolSpec,
} from "./api";
import { parseShortcut, type Shortcut } from "./shortcut";

// Module-level tables. Duplicate ids and shortcut or tool key clashes throw.
const toolTable = new Map<string, ToolSpec>();
const adjustmentTable = new Map<AdjustmentKind, AdjustmentHooks>();
let effectsHooks: EffectsHooks | undefined;
const menuTable = new Map<string, MenuItemSpec>();
const decorTable = new Map<string, LayerDecor>();
const overlayTable = new Map<string, OverlaySpec>();
const tables: MessageTable<string>[] = [];
const panelTable = new Map<string, PropertyPanelSpec>();
let provider: SelectionProvider | undefined;
const setupList: SetupFn[] = [];

function sameShortcut(a: Shortcut, b: Shortcut): boolean {
  return a.key === b.key && a.mod === b.mod && a.alt === b.alt && a.shift === b.shift;
}

// A tool key is the bare key; Shift + key cycles tools on that key, so both are taken.
function clashesWithToolKey(s: Shortcut, toolKey: string): boolean {
  return !s.mod && !s.alt && s.key === toolKey.toUpperCase();
}

function byOrder<T extends { order?: number }>(items: Iterable<T>): T[] {
  return [...items].toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function registerTool(spec: ToolSpec): void {
  if (toolTable.has(spec.id))
    throw new Error(`image-editor: tool "${spec.id}" is already registered`);
  for (const item of menuTable.values()) {
    if (item.shortcut && clashesWithToolKey(parseShortcut(item.shortcut), spec.key)) {
      throw new Error(`image-editor: tool key "${spec.key}" clashes with menu item "${item.id}"`);
    }
  }
  toolTable.set(spec.id, spec);
}

export function registerAdjustment(kind: AdjustmentKind, hooks: AdjustmentHooks): void {
  if (adjustmentTable.has(kind))
    throw new Error(`image-editor: adjustment "${kind}" is already registered`);
  if (!hooks.lut === !hooks.pass)
    throw new Error(`image-editor: adjustment "${kind}" needs exactly one of lut and pass`);
  adjustmentTable.set(kind, hooks);
}

export function registerEffects(hooks: EffectsHooks): void {
  if (effectsHooks) throw new Error("image-editor: effects are already registered");
  effectsHooks = hooks;
}

export function registerMenuItem(spec: MenuItemSpec): void {
  if (menuTable.has(spec.id))
    throw new Error(`image-editor: menu item "${spec.id}" is already registered`);
  if (spec.shortcut) {
    const s = parseShortcut(spec.shortcut);
    for (const item of menuTable.values()) {
      if (item.shortcut && sameShortcut(parseShortcut(item.shortcut), s)) {
        throw new Error(
          `image-editor: shortcut "${spec.shortcut}" is already used by "${item.id}"`,
        );
      }
    }
    for (const tool of toolTable.values()) {
      if (clashesWithToolKey(s, tool.key)) {
        throw new Error(`image-editor: shortcut "${spec.shortcut}" clashes with tool "${tool.id}"`);
      }
    }
  }
  menuTable.set(spec.id, spec);
}

export function registerLayerDecor(decor: LayerDecor): void {
  if (decorTable.has(decor.id))
    throw new Error(`image-editor: layer decor "${decor.id}" is already registered`);
  decorTable.set(decor.id, decor);
}

export function registerOverlay(spec: OverlaySpec): void {
  if (overlayTable.has(spec.id))
    throw new Error(`image-editor: overlay "${spec.id}" is already registered`);
  overlayTable.set(spec.id, spec);
}

// The same table object a second time is skipped.
export function registerMessages(table: MessageTable<string>): void {
  if (!tables.includes(table)) tables.push(table);
}

export function registerPropertyPanel(spec: PropertyPanelSpec): void {
  if (panelTable.has(spec.id))
    throw new Error(`image-editor: property panel "${spec.id}" is already registered`);
  panelTable.set(spec.id, spec);
}

export function registerSelection(p: SelectionProvider): void {
  if (provider) throw new Error("image-editor: a selection provider is already registered");
  provider = p;
}

// The same function a second time is skipped.
export function registerSetup(fn: SetupFn): void {
  if (!setupList.includes(fn)) setupList.push(fn);
}

export function tools(): readonly ToolSpec[] {
  return [...toolTable.values()];
}

export function adjustment(kind: AdjustmentKind): AdjustmentHooks | undefined {
  return adjustmentTable.get(kind);
}

export function effects(): EffectsHooks | undefined {
  return effectsHooks;
}

// Sorted by order (missing = 0), then registration order.
export function menuItems(menu: MenuId): readonly MenuItemSpec[] {
  return byOrder([...menuTable.values()].filter((item) => item.menu === menu));
}

export function layerDecors(): readonly LayerDecor[] {
  return [...decorTable.values()];
}

export function overlays(): readonly OverlaySpec[] {
  return [...overlayTable.values()];
}

export function messageTables(): readonly MessageTable<string>[] {
  return [...tables];
}

// Sorted by order (missing = 0), then registration order.
export function propertyPanels(): readonly PropertyPanelSpec[] {
  return byOrder(panelTable.values());
}

export function selectionProvider(): SelectionProvider | undefined {
  return provider;
}

export function setups(): readonly SetupFn[] {
  return [...setupList];
}

// Tests only: empties every table, including messages, the selection provider and setups.
export function resetRegistry(): void {
  toolTable.clear();
  adjustmentTable.clear();
  effectsHooks = undefined;
  menuTable.clear();
  decorTable.clear();
  overlayTable.clear();
  tables.length = 0;
  panelTable.clear();
  provider = undefined;
  setupList.length = 0;
}
