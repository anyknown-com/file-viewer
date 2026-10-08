import type { Rect } from "../../api";

/** Reads `rect` of a texture (rows top first): RGBA8 bytes, or the red channel alone. */
export function readTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  rect: Rect,
  channels: 1 | 4,
): Uint8Array {
  const { x, y, width, height } = rect;
  const rgba = new Uint8Array(width * height * 4);
  if (width > 0 && height > 0) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
  }
  if (channels === 4) return rgba;
  const red = new Uint8Array(width * height);
  for (let i = 0; i < red.length; i++) red[i] = rgba[i * 4];
  return red;
}
