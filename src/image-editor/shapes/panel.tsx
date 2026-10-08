// The shape tool's properties: kind, color, corner radius and line width.
import { useSyncExternalStore } from "react";
import type { LayerShapeStyle } from "../../comp/index";
import { useT } from "../../i18n/use-t";
import { NumberField } from "../../primitives/number-field";
import { ToggleGroup } from "../../primitives/toggle-group";
import type { EditorApi } from "../api";
import { internalsOf } from "../editor-api";
import { EllipseIcon, LineIcon, RectangleIcon } from "../text/glyphs";
import { textShapeMessages } from "../text/messages";
import { updateShapeLayer } from "./layer";
import { DEFAULT_LINE_WIDTH } from "./render";
import { shapeToolState } from "./tool-state";

type Kind = LayerShapeStyle["kind"];

const hex = (s: LayerShapeStyle) =>
  `#${[s.red, s.green, s.blue]
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

export function ShapePanel({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(textShapeMessages);
  const { store, subscribeSession } = internalsOf(api);
  useSyncExternalStore(store.subscribe, store.get);
  useSyncExternalStore(subscribeSession, api.session);
  const next = useSyncExternalStore(shapeToolState.subscribe, shapeToolState.get);
  const layer = api.doc().manifest.layers.find((l) => l.id === api.session().active);
  const style = layer?.shape ?? next;

  /** Changes the selected shape layer (one undo step), else only the next shape's style. */
  const change = (patch: Partial<LayerShapeStyle>): void => {
    const merged = { ...style, ...patch };
    const updated: LayerShapeStyle = { ...merged, kind: patch.kind ?? merged.kind };
    if (updated.kind !== "Line") {
      delete updated.start;
      delete updated.end;
    }
    shapeToolState.set({ ...updated, start: undefined, end: undefined });
    if (layer?.shape) updateShapeLayer(api, layer.id, updated, "image.shape.change");
  };
  // The native change event (picker closed), not React's onChange (every input while picking).
  const colorRef = (el: HTMLInputElement | null) => {
    if (!el) return;
    const onChange = () => {
      const v = el.value;
      change({
        red: parseInt(v.slice(1, 3), 16) / 255,
        green: parseInt(v.slice(3, 5), 16) / 255,
        blue: parseInt(v.slice(5, 7), 16) / 255,
      });
    };
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  };

  return (
    <>
      <ToggleGroup<Kind>
        label={t("image.shape.kind")}
        value={style.kind}
        options={[
          { value: "Rectangle", label: t("image.shape.rectangle"), icon: <RectangleIcon /> },
          { value: "Ellipse", label: t("image.shape.ellipse"), icon: <EllipseIcon /> },
          { value: "Line", label: t("image.shape.line"), icon: <LineIcon /> },
        ]}
        onChange={(kind) => change({ kind })}
      />
      <input
        ref={colorRef}
        type="color"
        aria-label={t("image.shape.color")}
        key={hex(style)}
        defaultValue={hex(style)}
      />
      {style.kind === "Rectangle" && (
        <NumberField
          label={t("image.shape.cornerRadius")}
          value={style.cornerRadius}
          min={0}
          max={10000}
          onChange={() => {}}
          onCommit={(cornerRadius) => change({ cornerRadius })}
        />
      )}
      {style.kind === "Line" && (
        <NumberField
          label={t("image.shape.lineWidth")}
          value={style.lineWidth ?? DEFAULT_LINE_WIDTH}
          min={1}
          max={1000}
          onChange={() => {}}
          onCommit={(lineWidth) => change({ lineWidth })}
        />
      )}
    </>
  );
}
