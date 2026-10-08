import type { Rect } from "../api";

function texture(
  gl: WebGL2RenderingContext,
  internal: number,
  format: number,
  w: number,
  h: number,
  data?: Uint8Array,
): WebGLTexture {
  const t = gl.createTexture();
  if (!t) throw new Error("Could not create a texture.");
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data ?? null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}

export function createR8(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  data?: Uint8Array,
): WebGLTexture {
  return texture(gl, gl.R8, gl.RED, w, h, data);
}

export function createRgba(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  data?: Uint8Array,
): WebGLTexture {
  return texture(gl, gl.RGBA8, gl.RGBA, w, h, data);
}

/** Runs `draw` with `tex` as the render target, then restores the default framebuffer. */
export function withFramebuffer(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  w: number,
  h: number,
  draw: () => void,
): void {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, w, h);
  try {
    draw();
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.useProgram(null);
  }
}

/** Reads `rect` of an RGBA8 texture (also works for R8: the value is in the red channel). */
export function readRgba(gl: WebGL2RenderingContext, tex: WebGLTexture, rect: Rect): Uint8Array {
  const out = new Uint8Array(rect.width * rect.height * 4);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
  gl.readPixels(rect.x, rect.y, rect.width, rect.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
  return out;
}
