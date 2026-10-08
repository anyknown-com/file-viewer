// LUT textures for 10's composite shader: 1D = 256×1 TEXTURE_2D, 3D = 33³ TEXTURE_3D, both RGBA16F.
import { LUT3D_SIZE } from "./lut3d";

type Lut = { dims: 1 | 3; texture: WebGLTexture };

const MAX_CACHED = 32;

function upload(
  gl: WebGL2RenderingContext,
  bind: GLenum,
  query: GLenum,
  put: () => void,
): WebGLTexture {
  const previous = gl.getParameter(query) as WebGLTexture | null;
  const texture = gl.createTexture();
  gl.bindTexture(bind, texture);
  put();
  gl.texParameteri(bind, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(bind, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
    gl.texParameteri(bind, wrap, gl.CLAMP_TO_EDGE);
  }
  gl.bindTexture(bind, previous);
  return texture;
}

export function uploadLut1d(gl: WebGL2RenderingContext, data: Float32Array): WebGLTexture {
  return upload(gl, gl.TEXTURE_2D, gl.TEXTURE_BINDING_2D, () =>
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 256, 1, 0, gl.RGBA, gl.FLOAT, data),
  );
}

export function uploadLut3d(gl: WebGL2RenderingContext, data: Float32Array): WebGLTexture {
  const n = LUT3D_SIZE;
  return upload(gl, gl.TEXTURE_3D, gl.TEXTURE_BINDING_3D, () =>
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, n, n, n, 0, gl.RGBA, gl.FLOAT, data),
  );
}

// The LUT values by settings key, least recently used first. Only the values are shared: every call
// uploads a fresh texture, because 10 owns what `AdjustmentHooks.lut` returns and deletes it when
// that layer's settings change or the layer goes; a texture shared between layers or calls would be
// deleted under the others.
const values = new Map<string, Float32Array>();

export function cachedLut(
  gl: WebGL2RenderingContext,
  key: string,
  dims: 1 | 3,
  build: () => Float32Array,
): Lut {
  const cacheKey = `${dims}:${key}`;
  let data = values.get(cacheKey);
  if (data) values.delete(cacheKey);
  else data = build();
  values.set(cacheKey, data);
  if (values.size > MAX_CACHED) values.delete(values.keys().next().value as string);
  return { dims, texture: dims === 1 ? uploadLut1d(gl, data) : uploadLut3d(gl, data) };
}
