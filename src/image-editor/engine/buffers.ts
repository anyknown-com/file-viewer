// Intermediate render surfaces, reused across frames.
import { BUFFER_MAX_BYTES, BUFFER_POOL_MAX } from "../limits";
import { createTarget } from "./gl/target";

type Target = ReturnType<typeof createTarget>;
export type Borrowed = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; release(): void };
export type BufferPool = ReturnType<typeof createBufferPool>;

/**
 * Keeps at most BUFFER_POOL_MAX idle surfaces, each at most BUFFER_MAX_BYTES; a borrowed surface
 * outside those limits is freed on release instead of kept.
 */
export function createBufferPool(gl: WebGL2RenderingContext, format: "rgba16f" | "rgba8") {
  const idle: Target[] = [];
  const bytesPerPx = format === "rgba16f" ? 8 : 4;

  return {
    borrow(w: number, h: number): Borrowed {
      const index = idle.findIndex((t) => t.width === w && t.height === h);
      const target = index >= 0 ? idle.splice(index, 1)[0] : createTarget(gl, w, h, format);
      let released = false;
      return {
        texture: target.texture,
        framebuffer: target.framebuffer,
        release() {
          if (released) return;
          released = true;
          if (w * h * bytesPerPx > BUFFER_MAX_BYTES) return target.dispose();
          idle.push(target);
          if (idle.length > BUFFER_POOL_MAX) idle.shift()?.dispose();
        },
      };
    },
    dispose() {
      for (const t of idle.splice(0)) t.dispose();
    },
  };
}
