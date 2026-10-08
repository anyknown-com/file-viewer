// The crop tool's options (the box's ratio, apply / cancel) and the state it shares with the tool.
import { useSyncExternalStore } from "react";
import { Button } from "../../primitives/button";
import { ToggleGroup } from "../../primitives/toggle-group";
import type { EditorApi, Point, Rect } from "../api";
import { crop } from "../doc/commands/index";
import { run } from "../layer-ops";
import { useLabel } from "../ui/use-label";

export const CROP_RATIOS = [
  "free",
  "original",
  "1:1",
  "4:3",
  "3:2",
  "16:9",
  "9:16",
  "3:4",
] as const;
export type CropRatio = (typeof CROP_RATIOS)[number];

type State = { ratio: CropRatio; box: Rect | null; start: Point | null };
type Entry = { state: State; listeners: Set<() => void> };

const entries = new WeakMap<EditorApi, Entry>();

function entry(api: EditorApi): Entry {
  let e = entries.get(api);
  if (!e) {
    e = { state: { ratio: "free", box: null, start: null }, listeners: new Set() };
    entries.set(api, e);
  }
  return e;
}

export function cropState(api: EditorApi): State {
  return entry(api).state;
}

export function subscribeCrop(api: EditorApi, fn: () => void): () => void {
  const { listeners } = entry(api);
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(api: EditorApi, patch: Partial<State>): void {
  const e = entry(api);
  e.state = { ...e.state, ...patch };
  for (const fn of e.listeners) fn();
  api.requestRender();
}

export function setCropRatio(api: EditorApi, ratio: CropRatio): void {
  update(api, { ratio });
}

/** Crops to the box in whole pixels, one undo step; false when there is no box. */
export function confirmCrop(api: EditorApi): boolean {
  const box = cropState(api).box;
  if (!box) return false;
  const x = Math.round(box.x);
  const y = Math.round(box.y);
  const width = Math.round(box.x + box.width) - x;
  const height = Math.round(box.y + box.height) - y;
  update(api, { box: null, start: null });
  if (width >= 1 && height >= 1) run(api, crop({ x, y, width, height }), "image.tools.crop");
  return true;
}

export function cancelCrop(api: EditorApi): void {
  update(api, { box: null, start: null });
}

export function CropPanel({ api }: { api: EditorApi }): React.JSX.Element {
  const label = useLabel();
  const state = useSyncExternalStore(
    (fn) => subscribeCrop(api, fn),
    () => cropState(api),
  );
  const options = CROP_RATIOS.map((value) => ({
    value,
    label:
      value === "free"
        ? label("image.crop.free")
        : value === "original"
          ? label("image.crop.original")
          : value,
  }));
  return (
    <div className="fv-ie-crop">
      <ToggleGroup
        label={label("image.tools.crop")}
        value={state.ratio}
        options={options}
        onChange={(ratio) => setCropRatio(api, ratio)}
      />
      <div className="fv-ie-crop-actions">
        <Button disabled={!state.box} onClick={() => cancelCrop(api)}>
          {label("image.crop.cancel")}
        </Button>
        <Button variant="primary" disabled={!state.box} onClick={() => confirmCrop(api)}>
          {label("image.crop.confirm")}
        </Button>
      </div>
    </div>
  );
}
