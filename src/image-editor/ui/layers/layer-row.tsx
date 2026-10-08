import { useCallback, useRef, type ReactNode } from "react";
import { cx } from "../../../primitives/cx";
import type { EditorApi, Layer, LayerId, PixelTarget } from "../../api";
import { setVisible } from "../../doc/commands/index";
import { internalsOf } from "../../editor-api";
import { ChevronIcon, ClipArrowIcon, EyeIcon, EyeOffIcon, FolderIcon } from "../../glyphs";
import { isFolder, run } from "../../layer-ops";
import { layerDecors } from "../../registry";
import { isMac } from "../../shortcut";
import { useLabel } from "../use-label";
import { LayerMenu } from "./layer-menu";

const THUMB = 32;

/** The layer's (or mask's) pixels shrunk to fit 32 px, redrawn when its pixel version changes. */
function PixelThumb(props: {
  api: EditorApi;
  id: LayerId;
  target: PixelTarget;
}): React.JSX.Element {
  const { api, id, target } = props;
  const version = internalsOf(api).pixelVersion(id);
  const draw = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, THUMB, THUMB);
      canvas.dataset.version = String(version);
      const size = api.pixelSize(id, target);
      if (!size) {
        // No texture yet: a mask reads as white, a layer as transparent.
        if (target === "mask") {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, THUMB, THUMB);
        }
        return;
      }
      const scale = Math.min(1, THUMB / Math.max(size.width, size.height));
      const w = Math.max(1, Math.round(size.width * scale));
      const h = Math.max(1, Math.round(size.height * scale));
      const src = api.readRegion(id, target, { x: 0, y: 0, ...size });
      const out = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        const sy = Math.min(size.height - 1, Math.floor((y + 0.5) / scale));
        for (let x = 0; x < w; x++) {
          const sx = Math.min(size.width - 1, Math.floor((x + 0.5) / scale));
          const i = sy * size.width + sx;
          const o = (y * w + x) * 4;
          if (target === "image") out.data.set(src.subarray(i * 4, i * 4 + 4), o);
          else out.data.set([src[i], src[i], src[i], 255], o);
        }
      }
      ctx.putImageData(out, Math.floor((THUMB - w) / 2), Math.floor((THUMB - h) / 2));
    },
    // version: redraw after the pixels change.
    [api, id, target, version],
  );
  return <canvas className="fv-ie-thumb-px" width={THUMB} height={THUMB} ref={draw} />;
}

function decorThumb(layer: Layer, api: EditorApi): ReactNode | null {
  for (const decor of layerDecors()) {
    const node = decor.thumbnail?.(layer, api) ?? null;
    if (node !== null) return node;
  }
  return null;
}

export type RowProps = {
  api: EditorApi;
  layer: Layer;
  depth: number;
  active: boolean;
  target: PixelTarget;
  focusable: boolean;
  expanded: boolean;
  renaming: boolean;
  onToggleFolder(): void;
  onStartRename(): void;
  onEndRename(name: string | null): void;
  onPointerDown(e: React.PointerEvent<HTMLDivElement>): void;
  onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void;
};

export function LayerRow(props: RowProps): React.JSX.Element {
  const { api, layer, active, target } = props;
  const label = useLabel();
  const folder = isFolder(layer);
  const visible = layer.isVisible;

  const clickThumb = (e: React.MouseEvent, which: PixelTarget) => {
    const mods = { mod: isMac() ? e.metaKey : e.ctrlKey, shift: e.shiftKey, alt: e.altKey };
    e.stopPropagation();
    for (const decor of layerDecors()) {
      if (decor.onThumbnailClick?.(layer, which, mods, api) === true) return;
    }
    api.setSession({ active: layer.id, target: which });
  };

  // Enter or Esc ends the rename; the blur that may follow must not end it again.
  const ended = useRef(false);
  const endRename = (name: string | null) => {
    if (ended.current) return;
    ended.current = true;
    props.onEndRename(name);
  };
  const renameInput = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    ended.current = false;
    input.focus();
    input.select();
  }, []);

  return (
    <LayerMenu api={api} layer={layer}>
      <div
        role="treeitem"
        aria-level={props.depth + 1}
        aria-selected={active}
        aria-expanded={folder ? props.expanded : undefined}
        aria-label={layer.name}
        tabIndex={props.focusable ? 0 : -1}
        onKeyDown={props.onKeyDown}
        data-layer-id={layer.id}
        className={cx("fv-ie-layer", active && "fv-ie-layer-on", !visible && "fv-ie-layer-hidden")}
        style={{ paddingInlineStart: `calc(${props.depth} * var(--ak-space-md))` }}
        onPointerDown={props.onPointerDown}
        onClick={() => api.setSession({ active: layer.id })}
        onContextMenu={() => api.setSession({ active: layer.id })}
      >
        <button
          type="button"
          className="fv-ie-eye"
          aria-label={label(visible ? "image.layers.hide" : "image.layers.show")}
          aria-pressed={visible}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            run(
              api,
              setVisible(layer.id, !visible),
              visible ? "image.layers.hide" : "image.layers.show",
            );
          }}
        >
          {visible ? <EyeIcon size="sm" /> : <EyeOffIcon size="sm" />}
        </button>
        {folder ? (
          <button
            type="button"
            className={cx("fv-ie-disclose", props.expanded && "fv-ie-disclose-open")}
            aria-label={label("image.layers.folder")}
            aria-expanded={props.expanded}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleFolder();
            }}
          >
            <ChevronIcon size="sm" />
          </button>
        ) : (
          layer.maskSourceID !== undefined && (
            <span className="fv-ie-clip-arrow">
              <ClipArrowIcon size="sm" />
            </span>
          )
        )}
        <button
          type="button"
          className={cx("fv-ie-thumb", active && target === "image" && "fv-ie-thumb-on")}
          aria-label={label("image.layers.paintOnImage")}
          data-thumb="image"
          onClick={(e) => clickThumb(e, "image")}
        >
          {decorThumb(layer, api) ??
            (folder ? <FolderIcon /> : <PixelThumb api={api} id={layer.id} target="image" />)}
        </button>
        {props.renaming ? (
          <input
            className="fv-ie-rename"
            aria-label={label("image.layers.rename")}
            defaultValue={layer.name}
            ref={renameInput}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") endRename(e.currentTarget.value);
              if (e.key === "Escape") endRename(null);
            }}
            onBlur={(e) => endRename(e.currentTarget.value)}
          />
        ) : (
          <span className="fv-ie-layer-name" onDoubleClick={props.onStartRename}>
            {layer.name}
          </span>
        )}
        {layerDecors().map((decor) => {
          const badge = decor.badge?.(layer, api) ?? null;
          return badge === null ? null : (
            <span key={decor.id} className="fv-ie-badge">
              {badge}
            </span>
          );
        })}
        {layer.maskFile !== undefined && (
          <button
            type="button"
            className={cx(
              "fv-ie-thumb",
              active && target === "mask" && "fv-ie-thumb-on",
              layer.maskEnabled === false && "fv-ie-thumb-off",
            )}
            aria-label={label("image.layers.paintOnMask")}
            data-thumb="mask"
            onClick={(e) => clickThumb(e, "mask")}
          >
            <PixelThumb api={api} id={layer.id} target="mask" />
          </button>
        )}
      </div>
    </LayerMenu>
  );
}
