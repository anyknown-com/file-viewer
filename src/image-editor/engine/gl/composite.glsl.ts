// The layer composite shader: draws one layer (or a prepared surface, or an adjustment) onto the
// accumulated result. One full-screen pass per layer; the accumulator is ping-ponged.
import { BLEND_GLSL } from "./blend.glsl";

/** Folder masks sampled directly; more than this are multiplied into the cover surface first. */
export const MAX_FOLDER_MASKS = 8;

/** Texture units, fixed per sampler so 2D and 3D samplers never share one. */
export const UNIT = { acc: 0, src: 1, mask: 2, cover: 3, lut1d: 4, lut3d: 5, folder: 6 } as const;

/** What the pass draws: `u_kind`. */
export const KIND = { layer: 0, surface: 1, lut: 2, adjusted: 3 } as const;

const folders = Array.from(
  { length: MAX_FOLDER_MASKS },
  (_, i) =>
    `  if (u_folderCount > ${i}) f *= maskAt(u_folder[${i}], u_folderMat[${i}], u_folderSize[${i}], u_folderEdge[${i}], doc);`,
).join("\n");

export const COMPOSITE_FS = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform vec2 u_outSize;
uniform mat3 u_docFromPx;      // output px (row 0 = top) → document
uniform sampler2D u_acc;       // accumulated result, premultiplied
uniform int u_kind;            // 0 layer texture, 1 prepared surface, 2 LUT adjustment, 3 adjusted surface
uniform int u_mode;            // index in BLEND_MODES
uniform float u_opacity;
uniform sampler2D u_src;       // 0: straight RGBA8 layer pixels; 1, 3: premultiplied output-space surface
uniform mat3 u_srcMat;         // 0: document → layer px
uniform vec2 u_srcSize;        // 0: layer px size; 1, 3: surface size
uniform vec2 u_srcOffset;      // 1, 3: output px → surface px offset (effects padding)
uniform int u_hasMask;
uniform sampler2D u_mask;
uniform mat3 u_maskMat;
uniform vec2 u_maskSize;
uniform float u_maskEdge;
uniform int u_folderCount;
uniform sampler2D u_folder[${MAX_FOLDER_MASKS}];
uniform mat3 u_folderMat[${MAX_FOLDER_MASKS}];
uniform vec2 u_folderSize[${MAX_FOLDER_MASKS}];
uniform float u_folderEdge[${MAX_FOLDER_MASKS}];
uniform int u_hasCover;
uniform sampler2D u_cover;     // output space; .a multiplies in (clip coverage, extra folder masks)
uniform int u_lutDims;
uniform sampler2D u_lut1d;
uniform sampler3D u_lut3d;
out vec4 o;
${BLEND_GLSL}
float maskAt(sampler2D s, mat3 m, vec2 size, float edge, vec2 doc) {
  vec2 p = (m * vec3(doc, 1.0)).xy;
  float v = texture(s, p / size).r;
  return (p.x < 0.0 || p.y < 0.0 || p.x > size.x || p.y > size.y) ? edge : v;
}
vec4 layerAt(vec2 doc) {
  vec2 p = (u_srcMat * vec3(doc, 1.0)).xy;
  vec4 c = texture(u_src, p / u_srcSize);
  if (p.x < 0.0 || p.y < 0.0 || p.x > u_srcSize.x || p.y > u_srcSize.y) return vec4(0.0);
  return vec4(c.rgb * c.a, c.a);
}
vec3 straight(vec4 c) { return c.a > 0.0 ? clamp(c.rgb / c.a, 0.0, 1.0) : vec3(0.0); }
vec4 lut(vec4 a) {
  vec3 c = straight(a);
  vec3 r;
  if (u_lutDims == 1) {
    vec3 t = (c * 255.0 + 0.5) / 256.0;
    r = vec3(textureLod(u_lut1d, vec2(t.r, 0.5), 0.0).r, textureLod(u_lut1d, vec2(t.g, 0.5), 0.0).g,
             textureLod(u_lut1d, vec2(t.b, 0.5), 0.0).b);
  } else {
    r = textureLod(u_lut3d, c * (32.0 / 33.0) + 0.5 / 33.0, 0.0).rgb;
  }
  return vec4(clamp(r, 0.0, 1.0) * a.a, a.a);
}
// W3C source-over with blending, premultiplied in and out.
vec4 over(vec4 b, vec4 s) {
  vec3 mixed = u_mode == 0 ? straight(s) : clamp(blend(u_mode, straight(b), straight(s)), 0.0, 1.0);
  return vec4((1.0 - b.a) * s.rgb + s.a * b.a * mixed + (1.0 - s.a) * b.rgb, s.a + b.a * (1.0 - s.a));
}
void main() {
  vec2 px = gl_FragCoord.xy;
  // Output-space surfaces are read texel for texel: normalized coordinates drift off the texel
  // centers when a side is not a power of two, and half-float values then change on readback.
  ivec2 ip = ivec2(px);
  vec2 doc = (u_docFromPx * vec3(px, 1.0)).xy;
  vec4 acc = texelFetch(u_acc, ip, 0);
  float f = 1.0;
${folders}
  if (u_hasCover == 1) f *= texelFetch(u_cover, ip, 0).a;
  float m = u_hasMask == 1 ? maskAt(u_mask, u_maskMat, u_maskSize, u_maskEdge, doc) : 1.0;
  vec4 surface = u_kind == 0 || u_kind == 2 ? vec4(0.0) : texelFetch(u_src, ip + ivec2(round(u_srcOffset)), 0);
  if (u_kind == 0 || u_kind == 1) {
    vec4 s = u_kind == 0 ? layerAt(doc) : surface;
    o = over(acc, s * (m * u_opacity * f));
  } else {
    vec4 adj = u_kind == 2 ? lut(acc) : surface;
    // Not Normal: blend the colors at full coverage, then keep the accumulated alpha.
    if (u_mode != 0) adj = vec4(clamp(blend(u_mode, straight(acc), straight(adj)), 0.0, 1.0) * acc.a, acc.a);
    o = mix(acc, adj, u_opacity * m * f);
  }
}
`;
