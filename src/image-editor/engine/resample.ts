// Image size: a texture redrawn at another size. Shrinking halves with LINEAR (a 2 × 2 box) until
// less than twice the target is left, then one LINEAR pass to the target; growing is one LINEAR pass.
import { compile, drawFullscreen, FULLSCREEN_VS } from "./gl/program";
import { createTarget } from "./gl/target";

const RESAMPLE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform bool u_premultiply;
uniform bool u_straighten;
out vec4 o_color;
void main() {
  vec4 c = texture(u_src, v_uv);
  if (u_premultiply) c.rgb *= c.a;
  if (u_straighten) c.rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
  o_color = c;
}
`;

type Size = { w: number; h: number };

/** The sizes to draw through, last one `to`. */
function steps(from: Size, to: Size): Size[] {
  const out: Size[] = [];
  let { w, h } = from;
  while (w >= 2 * to.w || h >= 2 * to.h) {
    w = w >= 2 * to.w ? Math.ceil(w / 2) : w;
    h = h >= 2 * to.h ? Math.ceil(h / 2) : h;
    out.push({ w, h });
  }
  out.push(to);
  return out;
}

/**
 * `src` (straight alpha RGBA8, or R8 read back from the red channel) at `to`: a new RGBA8 texture,
 * straight alpha, that the caller deletes. Sampling is premultiplied so clear pixels do not bleed.
 */
export function resample(
  gl: WebGL2RenderingContext,
  src: WebGLTexture,
  from: Size,
  to: Size,
): WebGLTexture {
  const program = compile(gl, FULLSCREEN_VS, RESAMPLE_FS);
  const sampler = gl.createSampler();
  gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, "u_src"), 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindSampler(0, sampler);
  gl.disable(gl.BLEND);
  const list = steps(from, to);
  let current = src;
  let previous: ReturnType<typeof createTarget> | null = null;
  list.forEach((size, i) => {
    const last = i === list.length - 1;
    const target = createTarget(gl, size.w, size.h, last ? "rgba8" : "rgba16f");
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, size.w, size.h);
    gl.bindTexture(gl.TEXTURE_2D, current);
    gl.uniform1i(gl.getUniformLocation(program, "u_premultiply"), i === 0 ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program, "u_straighten"), last ? 1 : 0);
    drawFullscreen(gl);
    previous?.dispose();
    previous = target;
    current = target.texture;
  });
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindSampler(0, null);
  gl.deleteSampler(sampler);
  const result = previous as ReturnType<typeof createTarget> | null;
  if (result) gl.deleteFramebuffer(result.framebuffer);
  return current;
}
