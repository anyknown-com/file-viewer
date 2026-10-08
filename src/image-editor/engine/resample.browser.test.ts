import { expect, it } from "vitest";
import { readTexture } from "./gl/read";
import { resample } from "./resample";

function upload(gl: WebGL2RenderingContext, w: number, h: number, data: Uint8Array): WebGLTexture {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}

function context(): WebGL2RenderingContext {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) throw new Error("no WebGL2");
  return gl;
}

it("shrinks a one-pixel checkerboard 4000 → 1000 to flat gray, no moiré", () => {
  const gl = context();
  const [w, h] = [4000, 40];
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (x + y) % 2 === 0 ? 255 : 0;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  const out = resample(gl, upload(gl, w, h, data), { w, h }, { w: 1000, h: 10 });
  const px = readTexture(gl, out, { x: 0, y: 0, width: 1000, height: 10 }, 4);
  let worst = 0;
  for (let i = 0; i < px.length; i += 4) {
    worst = Math.max(worst, Math.abs(px[i] - 127.5));
    expect(px[i + 3]).toBe(255);
  }
  expect(worst).toBeLessThanOrEqual(2);
});

it("grows to twice the size", () => {
  const gl = context();
  const data = new Uint8Array(6 * 4 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([10, 200, 90, 255], i);
  const out = resample(gl, upload(gl, 6, 4, data), { w: 6, h: 4 }, { w: 12, h: 8 });
  const px = readTexture(gl, out, { x: 0, y: 0, width: 12, height: 8 }, 4);
  expect(px.length).toBe(12 * 8 * 4);
  expect([...px.subarray(px.length - 4)]).toEqual([10, 200, 90, 255]);
});

it("keeps the color of pixels next to clear ones", () => {
  const gl = context();
  const data = Uint8Array.from([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
  const out = resample(gl, upload(gl, 4, 1, data), { w: 4, h: 1 }, { w: 1, h: 1 });
  const [r, g, b, a] = readTexture(gl, out, { x: 0, y: 0, width: 1, height: 1 }, 4);
  expect([r, g, b]).toEqual([255, 0, 0]);
  expect(Math.abs(a - 128)).toBeLessThanOrEqual(1);
});
