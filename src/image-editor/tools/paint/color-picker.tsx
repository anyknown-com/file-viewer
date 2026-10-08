import { useState } from "react";
import { useT } from "../../../i18n/use-t";
import { Slider } from "../../../primitives/slider";
import { selectPaintMessages } from "../messages";
import type { RGBA } from "../state";

type RGB = [number, number, number];
/** Hue 0–360, saturation and value 0–1. */
type HSV = [number, number, number];

/** `#rgb` or `#rrggbb`, any case; null for anything else. */
export function hexToRgb(hex: string): RGB | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

export function rgbToHex([r, g, b]: readonly number[]): string {
  return `#${[r, g, b].map((v) => Math.round(v!).toString(16).padStart(2, "0")).join("")}`;
}

export function rgbToHsv([r, g, b]: readonly number[]): HSV {
  const [rr, gg, bb] = [r! / 255, g! / 255, b! / 255];
  const max = Math.max(rr, gg, bb);
  const d = max - Math.min(rr, gg, bb);
  let h = 0;
  if (d > 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

export function hsvToRgb([h, s, v]: HSV): RGB {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return [f(5), f(3), f(1)];
}

const SQUARE = 160;

function drawSquare(canvas: HTMLCanvasElement, hue: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const [r, g, b] = hsvToRgb([hue, 1, 1]);
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, SQUARE, SQUARE);
  const white = ctx.createLinearGradient(0, 0, SQUARE, 0);
  white.addColorStop(0, "#fff");
  white.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = white;
  ctx.fillRect(0, 0, SQUARE, SQUARE);
  const black = ctx.createLinearGradient(0, 0, 0, SQUARE);
  black.addColorStop(0, "rgba(0, 0, 0, 0)");
  black.addColorStop(1, "#000");
  ctx.fillStyle = black;
  ctx.fillRect(0, 0, SQUARE, SQUARE);
}

/** HSV square, hue slider and hex field. Keeps the hue while saturation or value is 0. */
export function ColorPicker({
  value,
  onChange,
}: {
  value: RGBA;
  onChange(v: RGBA): void;
}): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const hex = rgbToHex(value);
  const [hsv, setHsv] = useState(() => ({ for: hex, hsv: rgbToHsv(value) }));
  const [draft, setDraft] = useState({ for: hex, text: hex });
  let shown = hsv.hsv;
  if (hsv.for !== hex) {
    shown = rgbToHsv(value);
    setHsv({ for: hex, hsv: shown });
  }
  if (draft.for !== hex) setDraft({ for: hex, text: hex });
  const commit = (next: HSV): void => {
    const rgb = hsvToRgb(next);
    setHsv({ for: rgbToHex(rgb), hsv: next });
    onChange([...rgb, value[3]]);
  };
  const pick = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const box = e.currentTarget.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    commit([shown[0], s, v]);
  };
  return (
    <div style={{ display: "grid", gap: "var(--ak-space-2)", width: SQUARE }}>
      <canvas
        ref={(el) => {
          if (el) drawSquare(el, shown[0]);
        }}
        width={SQUARE}
        height={SQUARE}
        style={{ touchAction: "none", cursor: "crosshair", borderRadius: "var(--ak-radius-md)" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
        }}
      />
      <Slider
        label={t("image.paint.hue")}
        value={Math.round(shown[0])}
        min={0}
        max={360}
        onValueChange={(h) => commit([h, shown[1], shown[2]])}
      />
      <input
        aria-label={t("image.paint.hex")}
        className="fv-number-field-input"
        value={draft.text}
        spellCheck={false}
        onChange={(e) => {
          const text = e.currentTarget.value;
          const rgb = hexToRgb(text);
          setDraft({ for: rgb ? rgbToHex(rgb) : hex, text });
          if (rgb) onChange([...rgb, value[3]]);
        }}
      />
    </div>
  );
}
