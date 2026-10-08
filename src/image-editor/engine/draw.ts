// The renderer's draw calls: one composite pass, one utility pass, and the uniforms they take.
import type { Mat2D } from "../api";
import { COMPOSITE_FS, type KIND, MAX_FOLDER_MASKS, UNIT } from "./gl/composite.glsl";
import { compile, drawFullscreen, FULLSCREEN_VS } from "./gl/program";
import { UTIL_FS } from "./gl/util.glsl";

/** A mask placed on the document: `mat` maps document → mask px; `edge` shows beyond it. */
export type MaskRef = {
  texture: WebGLTexture;
  mat: Mat2D;
  width: number;
  height: number;
  edge: number;
};

export type CompositeDraw = {
  kind: (typeof KIND)[keyof typeof KIND];
  acc: WebGLTexture;
  dst: WebGLFramebuffer;
  mode: number;
  opacity: number;
  src?: WebGLTexture;
  srcMat?: Mat2D;
  srcSize?: [number, number];
  srcOffset?: [number, number];
  mask?: MaskRef | null;
  folders?: readonly MaskRef[];
  cover?: WebGLTexture | null;
  lut?: { dims: 1 | 3; texture: WebGLTexture } | null;
};

export type Frame = { width: number; height: number; docFromPx: Mat2D };

const locations = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
const blanks = new WeakMap<WebGL2RenderingContext, { clear: WebGLTexture; white: WebGLTexture }>();

function mat3(m: Mat2D): Float32Array {
  return new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]);
}

function loc(gl: WebGL2RenderingContext, p: WebGLProgram, name: string) {
  let map = locations.get(p);
  if (!map) {
    map = new Map();
    locations.set(p, map);
  }
  if (!map.has(name)) map.set(name, gl.getUniformLocation(p, name));
  return map.get(name) ?? null;
}

function pixel(gl: WebGL2RenderingContext, rgba: number[]): WebGLTexture {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const data = new Uint8Array(rgba);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}

/** 1 × 1 transparent and opaque white textures for this gl. */
export function blankTextures(gl: WebGL2RenderingContext): {
  clear: WebGLTexture;
  white: WebGLTexture;
} {
  let b = blanks.get(gl);
  if (!b || !gl.isTexture(b.clear)) {
    b = { clear: pixel(gl, [0, 0, 0, 0]), white: pixel(gl, [255, 255, 255, 255]) };
    blanks.set(gl, b);
  }
  return b;
}

function bindAll(
  gl: WebGL2RenderingContext,
  units: Map<number, WebGLTexture>,
  lut3d?: WebGLTexture,
) {
  const { clear } = blankTextures(gl);
  for (let unit = 0; unit < UNIT.folder + MAX_FOLDER_MASKS; unit++) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, units.get(unit) ?? clear);
    gl.bindTexture(gl.TEXTURE_3D, unit === UNIT.lut3d ? (lut3d ?? null) : null);
  }
  gl.activeTexture(gl.TEXTURE0);
}

function target(gl: WebGL2RenderingContext, fb: WebGLFramebuffer | null, frame: Frame) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.viewport(0, 0, frame.width, frame.height);
  gl.disable(gl.BLEND);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.DEPTH_TEST);
}

export function clearTo(gl: WebGL2RenderingContext, fb: WebGLFramebuffer, frame: Frame, v: number) {
  target(gl, fb, frame);
  gl.clearColor(v, v, v, v);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function unitsOf(d: CompositeDraw): Map<number, WebGLTexture> {
  const units = new Map<number, WebGLTexture>([[UNIT.acc, d.acc]]);
  if (d.src) units.set(UNIT.src, d.src);
  if (d.mask) units.set(UNIT.mask, d.mask.texture);
  if (d.cover) units.set(UNIT.cover, d.cover);
  if (d.lut?.dims === 1) units.set(UNIT.lut1d, d.lut.texture);
  (d.folders ?? []).forEach((f, i) => units.set(UNIT.folder + i, f.texture));
  return units;
}

type Uniform = (name: string) => WebGLUniformLocation | null;

function setMask(
  gl: WebGL2RenderingContext,
  u: Uniform,
  names: [string, string, string],
  m: MaskRef,
) {
  gl.uniformMatrix3fv(u(names[0]), false, mat3(m.mat));
  gl.uniform2f(u(names[1]), m.width, m.height);
  gl.uniform1f(u(names[2]), m.edge);
}

export function drawComposite(gl: WebGL2RenderingContext, frame: Frame, d: CompositeDraw): void {
  const p = compile(gl, FULLSCREEN_VS, COMPOSITE_FS);
  target(gl, d.dst, frame);
  gl.useProgram(p);
  const u: Uniform = (name) => loc(gl, p, name);
  bindAll(gl, unitsOf(d), d.lut?.dims === 3 ? d.lut.texture : undefined);
  for (const [name, unit] of Object.entries(UNIT)) {
    if (name !== "folder") gl.uniform1i(u(`u_${name}`), unit);
  }
  gl.uniform1iv(
    u("u_folder"),
    Array.from({ length: MAX_FOLDER_MASKS }, (_, i) => UNIT.folder + i),
  );
  gl.uniform2f(u("u_outSize"), frame.width, frame.height);
  gl.uniformMatrix3fv(u("u_docFromPx"), false, mat3(frame.docFromPx));
  gl.uniform1i(u("u_kind"), d.kind);
  gl.uniform1i(u("u_mode"), d.mode);
  gl.uniform1f(u("u_opacity"), d.opacity);
  gl.uniformMatrix3fv(u("u_srcMat"), false, mat3(d.srcMat ?? [1, 0, 0, 1, 0, 0]));
  gl.uniform2fv(u("u_srcSize"), d.srcSize ?? [frame.width, frame.height]);
  gl.uniform2fv(u("u_srcOffset"), d.srcOffset ?? [0, 0]);
  gl.uniform1i(u("u_hasMask"), d.mask ? 1 : 0);
  if (d.mask) setMask(gl, u, ["u_maskMat", "u_maskSize", "u_maskEdge"], d.mask);
  const folders = d.folders ?? [];
  gl.uniform1i(u("u_folderCount"), folders.length);
  folders.forEach((f, i) =>
    setMask(gl, u, [`u_folderMat[${i}]`, `u_folderSize[${i}]`, `u_folderEdge[${i}]`], f),
  );
  gl.uniform1i(u("u_hasCover"), d.cover ? 1 : 0);
  gl.uniform1i(u("u_lutDims"), d.lut?.dims ?? 0);
  drawFullscreen(gl);
}

/** One utility pass (see util.glsl.ts) from `a` (and `b`) into `dst`. */
export function drawUtil(
  gl: WebGL2RenderingContext,
  frame: Frame,
  dst: WebGLFramebuffer | null,
  op: number,
  a: WebGLTexture,
  b?: WebGLTexture,
  present?: { background?: readonly number[]; flipY: boolean; straight: boolean },
): void {
  const p = compile(gl, FULLSCREEN_VS, UTIL_FS);
  target(gl, dst, frame);
  gl.useProgram(p);
  bindAll(
    gl,
    new Map(
      b
        ? [
            [0, a],
            [1, b],
          ]
        : [[0, a]],
    ),
  );
  gl.uniform1i(loc(gl, p, "u_a"), 0);
  gl.uniform1i(loc(gl, p, "u_b"), 1);
  gl.uniform1i(loc(gl, p, "u_op"), op);
  gl.uniform4fv(loc(gl, p, "u_background"), present?.background ?? [0, 0, 0, 0]);
  gl.uniform1i(loc(gl, p, "u_flipY"), present?.flipY ? 1 : 0);
  gl.uniform1i(loc(gl, p, "u_straight"), present?.straight ? 1 : 0);
  drawFullscreen(gl);
}
