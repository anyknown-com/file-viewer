// Small full-screen passes the renderer runs between layer draws: `u_op` picks one.
export const OP = { present: 0, opaque: 1, restoreAlpha: 2, multiplyAlpha: 3 } as const;

export const UTIL_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform int u_op;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform vec4 u_background;   // present: straight RGBA under the result
uniform int u_flipY;         // present: drawing to the canvas, whose row 0 is the bottom
uniform int u_straight;      // present: write straight alpha (read back as RGBA8)
out vec4 o;
void main() {
  vec2 uv = u_flipY == 1 ? vec2(v_uv.x, 1.0 - v_uv.y) : v_uv;
  vec4 a = texture(u_a, uv);
  if (u_op == 0) {
    vec4 c = a + vec4(u_background.rgb * u_background.a, u_background.a) * (1.0 - a.a);
    o = u_straight == 1 ? (c.a > 0.0 ? vec4(c.rgb / c.a, c.a) : vec4(0.0)) : c;
  } else if (u_op == 1) {
    o = vec4(a.a > 0.0 ? a.rgb / a.a : vec3(0.0), 1.0);
  } else if (u_op == 2) {
    float alpha = texture(u_b, uv).a;
    o = vec4(a.rgb * alpha, alpha);
  } else {
    o = vec4(a.a * texture(u_b, uv).a);
  }
}
`;
