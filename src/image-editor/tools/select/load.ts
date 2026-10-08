import type { EditorApi, LayerId, PixelTarget } from "../../api";
import { layerPixelSize, targetMatrix } from "../geom";
import { createR8, createRgba } from "../gl";
import { COMBINE_GLSL, type MaskOp, opIndex, renderSelection } from "./mask";

const LOAD_FS = `#version 300 es
precision highp float;
uniform sampler2D u_sel;
uniform sampler2D u_layer;
uniform ivec2 u_size;
uniform int u_mask;
uniform int u_op;
uniform vec3 u_r0;
uniform vec3 u_r1;
out vec4 o;
${COMBINE_GLSL}
float at(ivec2 i) {
  if (i.x < 0 || i.y < 0 || i.x >= u_size.x || i.y >= u_size.y) return 0.0;
  vec4 t = texelFetch(u_layer, i, 0);
  return u_mask == 1 ? t.r : t.a;
}
void main() {
  float a = texelFetch(u_sel, ivec2(gl_FragCoord.xy), 0).r;
  vec2 p = vec2(dot(u_r0.xy, gl_FragCoord.xy) + u_r0.z, dot(u_r1.xy, gl_FragCoord.xy) + u_r1.z) - 0.5;
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  float v = mix(mix(at(i), at(i + ivec2(1, 0)), f.x), mix(at(i + ivec2(0, 1)), at(i + ivec2(1, 1)), f.x), f.y);
  o = vec4(combine(a, v, u_op), 0.0, 0.0, 1.0);
}
`;

/** Merges a layer's alpha (or a mask's value), mapped into document space, into the selection. */
export function loadLayerAlpha(api: EditorApi, id: LayerId, target: PixelTarget, op: MaskOp): void {
  const size = layerPixelSize(api, id, target);
  const px = api.readRegion(id, target, { x: 0, y: 0, ...size });
  const gl = api.gl;
  const tex =
    target === "mask"
      ? createR8(gl, size.width, size.height, px)
      : createRgba(gl, size.width, size.height, px);
  const m = targetMatrix(api, id, target);
  renderSelection(api, LOAD_FS, (g, program) => {
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, tex);
    g.uniform1i(g.getUniformLocation(program, "u_layer"), 1);
    g.uniform2i(g.getUniformLocation(program, "u_size"), size.width, size.height);
    g.uniform1i(g.getUniformLocation(program, "u_mask"), target === "mask" ? 1 : 0);
    g.uniform1i(g.getUniformLocation(program, "u_op"), opIndex(op));
    g.uniform3f(g.getUniformLocation(program, "u_r0"), m[0], m[2], m[4]);
    g.uniform3f(g.getUniformLocation(program, "u_r1"), m[1], m[3], m[5]);
  });
  gl.deleteTexture(tex);
}
