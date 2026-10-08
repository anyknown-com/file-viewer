import { floatRenderable } from "./target";

/** The editor's WebGL2 context, or null when the browser has none. */
export function createGl(canvas: HTMLCanvasElement): {
  gl: WebGL2RenderingContext;
  floatTargets: "rgba16f" | "rgba8";
  maxTexture: number;
} | null {
  const gl = canvas.getContext("webgl2", {
    premultipliedAlpha: true,
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;
  return {
    gl,
    floatTargets: floatRenderable(gl) ? "rgba16f" : "rgba8",
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
  };
}

/** Frees the context's GPU memory now instead of waiting for garbage collection. */
export function destroyGl(gl: WebGL2RenderingContext): void {
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}
