// The move tool's options: position, size and angle of the active layer, and flips.
import { useRef, useState, useSyncExternalStore } from "react";
import { Button } from "../../primitives/button";
import { NumberField } from "../../primitives/number-field";
import { Switch } from "../../primitives/switch";
import type { EditorApi, Layer } from "../api";
import { setTransform } from "../doc/commands/index";
import { internalsOf } from "../editor-api";
import { useLabel } from "../ui/use-label";
import { endTransform, transformTarget } from "./transform-drag";

type Transform = Layer["transform"];
type Field = "x" | "y" | "width" | "height" | "angle";

const round = (v: number) => Math.round(v * 100) / 100;

function read(t: Transform, field: Field): number {
  if (field === "x") return t.origin[0];
  if (field === "y") return t.origin[1];
  if (field === "width") return t.size[0];
  if (field === "height") return t.size[1];
  return t.rotation;
}

/** `t` with `field` set to `v`; width and height keep the center, and each other's ratio when `lock`. */
function write(t: Transform, field: Field, v: number, lock: boolean): Transform {
  if (field === "x") return { ...t, origin: [v, t.origin[1]] };
  if (field === "y") return { ...t, origin: [t.origin[0], v] };
  if (field === "angle") return { ...t, rotation: v };
  const [w0, h0] = t.size;
  const w = field === "width" ? v : lock ? (v / h0) * w0 : w0;
  const h = field === "height" ? v : lock ? (v / w0) * h0 : h0;
  const cx = t.origin[0] + w0 / 2;
  const cy = t.origin[1] + h0 / 2;
  return { ...t, origin: [cx - w / 2, cy - h / 2], size: [w, h] };
}

const FIELDS = [
  ["x", "image.transform.x"],
  ["y", "image.transform.y"],
  ["width", "image.transform.width"],
  ["height", "image.transform.height"],
  ["angle", "image.transform.angle"],
] as const;

export function TransformPanel({ api }: { api: EditorApi }): React.JSX.Element | null {
  const label = useLabel();
  const { store, subscribeSession } = internalsOf(api);
  useSyncExternalStore(store.subscribe, store.get);
  useSyncExternalStore(subscribeSession, api.session);
  const [lock, setLock] = useState(false);
  // The transform when the field edit began, for onTransformEnd.
  const before = useRef<Transform | null>(null);
  const layer = transformTarget(api);
  if (!layer) return null;
  const { id, transform: t } = layer;
  const flip = (axis: "flipX" | "flipY") => {
    api.dispatch(setTransform(id, { ...t, [axis]: !t[axis] }));
    endTransform(api, id, t);
  };
  return (
    <div className="fv-ie-transform">
      {FIELDS.map(([field, key]) => (
        <NumberField
          key={field}
          label={label(key)}
          value={round(read(t, field))}
          min={field === "width" || field === "height" ? 1 : undefined}
          step={1}
          // While typing or scrubbing: a live preview; when done: one undo step.
          onChange={(v) => {
            before.current ??= t;
            api.dispatch(setTransform(id, write(t, field, v, lock)));
          }}
          onCommit={(v) => {
            const start = before.current;
            before.current = null;
            if (!start && round(read(t, field)) === v) return;
            api.dispatch(setTransform(id, write(t, field, v, lock)));
            endTransform(api, id, start ?? t);
          }}
        />
      ))}
      <Switch label={label("image.transform.lockRatio")} checked={lock} onCheckedChange={setLock} />
      <div className="fv-ie-transform-flips">
        <Button onClick={() => flip("flipX")}>{label("image.transform.flipH")}</Button>
        <Button onClick={() => flip("flipY")}>{label("image.transform.flipV")}</Button>
      </div>
    </div>
  );
}
