import type { EditorApi, Rect, Selection } from "../../api";
import { compile, drawFullscreen, FULLSCREEN_VS } from "../../engine/gl/program";
import { createR8, readRgba, withFramebuffer } from "../gl";

export type MaskOp = "replace" | "add" | "subtract" | "intersect";

const OPS: readonly MaskOp[] = ["replace", "add", "subtract", "intersect"];

/** CPU reference of the GPU combine: `a` is the current mask, `b` the incoming one. */
export function combineRef(a: Uint8Array, b: Uint8Array, op: MaskOp): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    if (op === "replace") out[i] = b[i];
    else if (op === "add") out[i] = Math.max(a[i], b[i]);
    else if (op === "subtract") out[i] = Math.round((a[i] * (255 - b[i])) / 255);
    else out[i] = Math.min(a[i], b[i]);
  }
  return out;
}

export function invertRef(a: Uint8Array): Uint8Array {
  return a.map((v) => 255 - v);
}

/** Shift + Alt intersects, Shift adds, Alt subtracts. */
export function opFromEvent(e: { shiftKey: boolean; altKey: boolean }, fallback: MaskOp): MaskOp {
  if (e.shiftKey && e.altKey) return "intersect";
  if (e.shiftKey) return "add";
  if (e.altKey) return "subtract";
  return fallback;
}

export type SelectOptions = { mode: MaskOp; feather: number };

const options = new WeakMap<EditorApi, SelectOptions>();

/** The marquee, lasso and wand options (mode and feather radius) of this editor. */
export function selectOptions(api: EditorApi): SelectOptions {
  return options.get(api) ?? { mode: "replace", feather: 0 };
}

export function setSelectOptions(api: EditorApi, patch: Partial<SelectOptions>): void {
  options.set(api, { ...selectOptions(api), ...patch });
}

type Cache = { version: number; bytes: Uint8Array; bounds: Rect | null };
type State = {
  texture: WebGLTexture;
  width: number;
  height: number;
  previous: Uint8Array | null;
  version: number;
  cache: Cache | null;
};

const states = new WeakMap<EditorApi, State>();

/** The per-editor selection state; rebuilt empty when the canvas size changes. */
function state(api: EditorApi): State {
  const { width, height } = api.doc().manifest;
  let s = states.get(api);
  if (!s) {
    s = {
      texture: createR8(api.gl, width, height),
      width,
      height,
      previous: null,
      version: 1,
      cache: null,
    };
    states.set(api, s);
  } else if (s.width !== width || s.height !== height) {
    api.gl.deleteTexture(s.texture);
    s.texture = createR8(api.gl, width, height);
    s.width = width;
    s.height = height;
    s.previous = null;
    s.version++;
    s.cache = null;
  }
  return s;
}

function touch(api: EditorApi, s: State): void {
  s.version++;
  s.cache = null;
  api.requestRender();
}

function analyze(api: EditorApi): Cache {
  const s = state(api);
  if (s.cache && s.cache.version === s.version) return s.cache;
  const { width: w, height: h } = s;
  const rgba = readRgba(api.gl, s.texture, { x: 0, y: 0, width: w, height: h });
  const bytes = new Uint8Array(w * h);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = rgba[(y * w + x) * 4];
      bytes[y * w + x] = v;
      if (v === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const bounds = x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  s.cache = { version: s.version, bytes, bounds };
  return s.cache;
}

/** GLSL for every pass that merges two coverage values; `op` is the index in `MaskOp` order. */
export const COMBINE_GLSL = `
float combine(float a, float b, int op) {
  if (op == 0) return b;
  if (op == 1) return max(a, b);
  if (op == 2) return a * (1.0 - b);
  return min(a, b);
}
`;

export const opIndex = (op: MaskOp): number => OPS.indexOf(op);

export function unbind(gl: WebGL2RenderingContext, units: number): void {
  for (let i = units - 1; i >= 0; i--) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  gl.activeTexture(gl.TEXTURE0);
}

/**
 * Renders `fs` (which reads the current selection as `u_sel`, texture unit 0) into a fresh
 * canvas-size R8 texture and makes that the selection. `bind` sets uniforms and units 1 and up.
 */
export function renderSelection(
  api: EditorApi,
  fs: string,
  bind: (gl: WebGL2RenderingContext, program: WebGLProgram) => void,
): void {
  const s = state(api);
  const gl = api.gl;
  const out = createR8(gl, s.width, s.height);
  const program = compile(gl, FULLSCREEN_VS, fs);
  gl.disable(gl.BLEND);
  gl.disable(gl.SCISSOR_TEST);
  withFramebuffer(gl, out, s.width, s.height, () => {
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.texture);
    gl.uniform1i(gl.getUniformLocation(program, "u_sel"), 0);
    bind(gl, program);
    drawFullscreen(gl);
    unbind(gl, 4);
  });
  gl.deleteTexture(s.texture);
  s.texture = out;
  touch(api, s);
}

export function selectionOf(api: EditorApi): {
  texture: WebGLTexture;
  width: number;
  height: number;
  version: number;
} {
  const s = state(api);
  return { texture: s.texture, width: s.width, height: s.height, version: s.version };
}

export function hasSelection(api: EditorApi): boolean {
  return analyze(api).bounds !== null;
}

/** The whole canvas as R8, row-major, 255 = selected. */
export function readSelection(api: EditorApi): Uint8Array {
  return analyze(api).bytes.slice();
}

const WRITE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_sel;
uniform sampler2D u_b;
uniform ivec4 u_rect;
uniform int u_op;
out vec4 o;
${COMBINE_GLSL}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float a = texelFetch(u_sel, p, 0).r;
  ivec2 q = p - u_rect.xy;
  float b = 0.0;
  if (q.x >= 0 && q.y >= 0 && q.x < u_rect.z && q.y < u_rect.w) b = texelFetch(u_b, q, 0).r;
  o = vec4(combine(a, b, u_op), 0.0, 0.0, 1.0);
}
`;

/** Merges `bytes` (R8, `rect` in document pixels) into the selection; outside `rect` counts as 0. */
export function writeSelection(api: EditorApi, bytes: Uint8Array, rect: Rect, op: MaskOp): void {
  const gl = api.gl;
  const empty = rect.width <= 0 || rect.height <= 0;
  const tex = createR8(
    gl,
    Math.max(1, rect.width),
    Math.max(1, rect.height),
    empty ? undefined : bytes,
  );
  renderSelection(api, WRITE_FS, (g, program) => {
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, tex);
    g.uniform1i(g.getUniformLocation(program, "u_b"), 1);
    g.uniform4i(
      g.getUniformLocation(program, "u_rect"),
      rect.x,
      rect.y,
      empty ? 0 : rect.width,
      empty ? 0 : rect.height,
    );
    g.uniform1i(g.getUniformLocation(program, "u_op"), opIndex(op));
  });
  gl.deleteTexture(tex);
}

export function selectAll(api: EditorApi): void {
  const { width, height } = state(api);
  writeSelection(
    api,
    new Uint8Array(width * height).fill(255),
    { x: 0, y: 0, width, height },
    "replace",
  );
}

/** Clears the selection and keeps what it was for `reselect`. */
export function deselect(api: EditorApi): void {
  if (!hasSelection(api)) return;
  const s = state(api);
  s.previous = readSelection(api);
  writeSelection(api, new Uint8Array(0), { x: 0, y: 0, width: 0, height: 0 }, "replace");
}

export function reselect(api: EditorApi): void {
  const s = state(api);
  if (!s.previous) return;
  const bytes = s.previous;
  writeSelection(api, bytes, { x: 0, y: 0, width: s.width, height: s.height }, "replace");
}

const INVERT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_sel;
out vec4 o;
void main() {
  o = vec4(1.0 - texelFetch(u_sel, ivec2(gl_FragCoord.xy), 0).r, 0.0, 0.0, 1.0);
}
`;

export function invertSelection(api: EditorApi): void {
  renderSelection(api, INVERT_FS, () => {});
}

/** The bounding box of the non-zero pixels, in document pixels. */
export function selectionBounds(api: EditorApi): Rect | null {
  return analyze(api).bounds;
}

/** The selection as the `Selection` the editor reads; null while nothing is selected. */
export function currentSelection(api: EditorApi): Selection | null {
  const a = analyze(api);
  if (!a.bounds) return null;
  const s = state(api);
  return {
    version: s.version,
    texture: s.texture,
    bounds: a.bounds,
    read(rect: Rect): Uint8Array {
      const out = new Uint8Array(Math.max(0, rect.width) * Math.max(0, rect.height));
      for (let y = 0; y < rect.height; y++) {
        const sy = rect.y + y;
        if (sy < 0 || sy >= s.height) continue;
        for (let x = 0; x < rect.width; x++) {
          const sx = rect.x + x;
          if (sx >= 0 && sx < s.width) out[y * rect.width + x] = a.bytes[sy * s.width + sx];
        }
      }
      return out;
    },
  };
}
