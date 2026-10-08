// Image > Image size: the canvas, every layer and every mask scaled to a new width and height.
import { useState } from "react";
import { ViewerError } from "../../contract/errors";
import { commonMessages } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import { Dialog } from "../../primitives/dialog";
import { NumberField } from "../../primitives/number-field";
import { Switch } from "../../primitives/switch";
import type { EditorApi, PixelTarget, Size } from "../api";
import { scaleImage } from "../doc/commands/index";
import { readTexture } from "../engine/gl/read";
import { resample } from "../engine/resample";
import { MAX_LAYER_SIDE } from "../limits";
import { useLabel } from "./use-label";

type Job = { id: string; target: PixelTarget; from: Size; to: Size };

/**
 * Resamples every layer and mask texture by the canvas's scale and scales the transforms, one undo
 * step. Returns the error and changes nothing when a texture would be too large or the pixel budget
 * runs out.
 */
export function resizeImage(api: EditorApi, width: number, height: number): ViewerError | null {
  const doc = api.doc();
  const { width: w0, height: h0, layers } = doc.manifest;
  if (width === w0 && height === h0) return null;
  const jobs: Job[] = layers.flatMap((l) =>
    (["image", "mask"] as const).flatMap((target) => {
      const from = api.pixelSize(l.id, target);
      if (!from) return [];
      const to = {
        width: Math.max(1, Math.round((from.width * width) / w0)),
        height: Math.max(1, Math.round((from.height * height) / h0)),
      };
      return [{ id: l.id, target, from, to }];
    }),
  );
  const gl = api.gl;
  const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, MAX_LAYER_SIDE);
  const grows = (target: PixelTarget) =>
    jobs
      .filter((j) => j.target === target)
      .reduce((n, j) => n + j.to.width * j.to.height - j.from.width * j.from.height, 0);
  const error = jobs.some((j) => j.to.width > max || j.to.height > max)
    ? new ViewerError("too_large")
    : api.checkBudget({ layerPx: grows("image"), maskPx: grows("mask") });
  if (error) return error;
  const resizes = jobs.map(({ id, target, from, to }) => {
    const src = target === "image" ? api.layerTexture(id) : api.maskTexture(id);
    if (!src) throw new Error(`No ${target} texture for ${id}.`);
    const texture = resample(
      gl,
      src,
      { w: from.width, h: from.height },
      { w: to.width, h: to.height },
    );
    const pixels = readTexture(gl, texture, { x: 0, y: 0, ...to }, target === "mask" ? 1 : 4);
    gl.deleteTexture(texture);
    return api.resizePixels(id, target, to, { pixels });
  });
  api.commit("image.canvas.imageSize", scaleImage(width, height)(doc), [], resizes);
  return null;
}

function ImageSizeDialog(props: { api: EditorApi; close(): void }): React.JSX.Element {
  const { api, close } = props;
  const label = useLabel();
  const common = useT(commonMessages);
  const m = api.doc().manifest;
  const [size, setSize] = useState({ width: m.width, height: m.height });
  const [lock, setLock] = useState(true);
  const [over, setOver] = useState(false);
  const change = (side: "width" | "height", v: number) => {
    const value = Math.max(1, Math.round(v));
    setOver(false);
    if (!lock) return setSize((s) => ({ ...s, [side]: value }));
    if (side === "width")
      return setSize({
        width: value,
        height: Math.max(1, Math.round((value * m.height) / m.width)),
      });
    setSize({ width: Math.max(1, Math.round((value * m.width) / m.height)), height: value });
  };
  const apply = () => {
    if (resizeImage(api, size.width, size.height)) return setOver(true);
    close();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={label("image.imageSize.title")}
      footer={
        <>
          <Button onClick={close}>{common("common.cancel")}</Button>
          <Button variant="primary" onClick={apply}>
            {label("image.crop.confirm")}
          </Button>
        </>
      }
    >
      <NumberField
        label={label("image.imageSize.width")}
        value={size.width}
        min={1}
        step={1}
        onChange={(v) => change("width", v)}
      />
      <NumberField
        label={label("image.imageSize.height")}
        value={size.height}
        min={1}
        step={1}
        onChange={(v) => change("height", v)}
      />
      <Switch label={label("image.imageSize.lockRatio")} checked={lock} onCheckedChange={setLock} />
      {over && (
        <p role="alert" className="fv-ie-dialog-error">
          {label("image.open.budget")}
        </p>
      )}
    </Dialog>
  );
}

export function openImageSizeDialog(api: EditorApi): void {
  api.openDialog((close) => <ImageSizeDialog api={api} close={close} />);
}
