import type { EditorApi, LayerId, Rect } from "../../api";
import { compile, drawFullscreen, FULLSCREEN_VS } from "../../engine/gl/program";
import { invert } from "../geom";
import { createR8, readRgba, withFramebuffer } from "../gl";
import { hasSelection, selectionOf, unbind } from "./mask";

const SAMPLE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_sel;
uniform ivec2 u_size;
uniform ivec2 u_origin;
uniform vec3 u_r0;
uniform vec3 u_r1;
out vec4 o;
float at(ivec2 i) {
  if (i.x < 0 || i.y < 0 || i.x >= u_size.x || i.y >= u_size.y) return 0.0;
  return texelFetch(u_sel, i, 0).r;
}
void main() {
  vec2 lp = gl_FragCoord.xy + vec2(u_origin);
  vec2 d = vec2(dot(u_r0.xy, lp) + u_r0.z, dot(u_r1.xy, lp) + u_r1.z) - 0.5;
  ivec2 i = ivec2(floor(d));
  vec2 f = fract(d);
  float v = mix(mix(at(i), at(i + ivec2(1, 0)), f.x), mix(at(i + ivec2(0, 1)), at(i + ivec2(1, 1)), f.x), f.y);
  o = vec4(v, 0.0, 0.0, 1.0);
}
`;

/** The selection sampled (bilinear) into layer pixel space over `rect`; all 255 without a selection. */
export function selectionInLayer(api: EditorApi, id: LayerId, rect: Rect): Uint8Array {
  const out = new Uint8Array(rect.width * rect.height);
  if (!hasSelection(api)) return out.fill(255);
  const s = selectionOf(api);
  const gl = api.gl;
  const m = invert(api.layerMatrix(id));
  const target = createR8(gl, rect.width, rect.height);
  const program = compile(gl, FULLSCREEN_VS, SAMPLE_FS);
  gl.disable(gl.BLEND);
  gl.disable(gl.SCISSOR_TEST);
  withFramebuffer(gl, target, rect.width, rect.height, () => {
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.texture);
    gl.uniform1i(gl.getUniformLocation(program, "u_sel"), 0);
    gl.uniform2i(gl.getUniformLocation(program, "u_size"), s.width, s.height);
    gl.uniform2i(gl.getUniformLocation(program, "u_origin"), rect.x, rect.y);
    gl.uniform3f(gl.getUniformLocation(program, "u_r0"), m[0], m[2], m[4]);
    gl.uniform3f(gl.getUniformLocation(program, "u_r1"), m[1], m[3], m[5]);
    drawFullscreen(gl);
    unbind(gl, 1);
  });
  const rgba = readRgba(gl, target, { x: 0, y: 0, width: rect.width, height: rect.height });
  gl.deleteTexture(target);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
  return out;
}
