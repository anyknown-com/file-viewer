// A texture with a framebuffer to draw into. 11 and 12 import this instead of writing their own.

/** RGBA16F when EXT_color_buffer_float or EXT_color_buffer_half_float makes it renderable. */
export function floatRenderable(gl: WebGL2RenderingContext): boolean {
  return (
    gl.getExtension("EXT_color_buffer_float") !== null ||
    gl.getExtension("EXT_color_buffer_half_float") !== null
  );
}

function internalFormat(gl: WebGL2RenderingContext, format: "rgba16f" | "rgba8" | "r8"): number {
  if (format === "r8") return gl.R8;
  if (format === "rgba16f" && floatRenderable(gl)) return gl.RGBA16F;
  return gl.RGBA8;
}

/** "rgba16f" falls back to RGBA8 without a float color buffer extension; LINEAR, CLAMP_TO_EDGE. */
export function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  format: "rgba16f" | "rgba8" | "r8",
): {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
  dispose(): void;
} {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat(gl, format), width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return {
    texture,
    framebuffer,
    width,
    height,
    dispose() {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    },
  };
}
