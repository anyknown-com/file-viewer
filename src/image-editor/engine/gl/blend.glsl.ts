// The 24 blend modes as GLSL: `vec3 blend(int mode, vec3 cb, vec3 cs)` on straight 0–1 colors, `mode`
// the index in BLEND_MODES (src/image-editor/api.ts). Same formulas as engine/blend-ref.ts. Sources:
// W3C Compositing and Blending Level 1 (§10, with SetLum / SetSat for Hue, Saturation, Color and
// Luminosity); Soft Light is Photoshop's; Linear Burn, Linear Dodge (Add), Vivid Light, Linear Light,
// Pin Light, Hard Mix, Subtract and Divide are Photoshop's commonly published formulas.
export const BLEND_GLSL = `
float bDodge(float b, float s) { // W3C color-dodge
  if (b <= 0.0) return 0.0;
  if (s >= 1.0) return 1.0;
  return min(1.0, b / (1.0 - s));
}
float bBurn(float b, float s) { // W3C color-burn
  if (b >= 1.0) return 1.0;
  if (s <= 0.0) return 0.0;
  return 1.0 - min(1.0, (1.0 - b) / s);
}
float bHard(float b, float s) { // W3C hard-light
  return s <= 0.5 ? b * 2.0 * s : b + (2.0 * s - 1.0) - b * (2.0 * s - 1.0);
}
float bSep(int m, float b, float s) {
  if (m == 1) return min(b, s);                       // Darken (W3C)
  if (m == 2) return b * s;                           // Multiply (W3C)
  if (m == 3) return bBurn(b, s);                     // Color Burn (W3C)
  if (m == 4) return max(0.0, b + s - 1.0);           // Linear Burn (Photoshop)
  if (m == 5) return max(b, s);                       // Lighten (W3C)
  if (m == 6) return b + s - b * s;                   // Screen (W3C)
  if (m == 7) return bDodge(b, s);                    // Color Dodge (W3C)
  if (m == 8) return min(1.0, b + s);                 // Linear Dodge (Add) (Photoshop)
  if (m == 9) return bHard(s, b);                     // Overlay (W3C)
  if (m == 10) return s <= 0.5                        // Soft Light (Photoshop)
    ? 2.0 * b * s + b * b * (1.0 - 2.0 * s)
    : 2.0 * b * (1.0 - s) + sqrt(b) * (2.0 * s - 1.0);
  if (m == 11) return bHard(b, s);                    // Hard Light (W3C)
  if (m == 12) return s <= 0.5 ? bBurn(b, 2.0 * s) : bDodge(b, 2.0 * s - 1.0); // Vivid Light (Photoshop)
  if (m == 13) return clamp(b + 2.0 * s - 1.0, 0.0, 1.0);                     // Linear Light (Photoshop)
  if (m == 14) return s <= 0.5 ? min(b, 2.0 * s) : max(b, 2.0 * s - 1.0);     // Pin Light (Photoshop)
  if (m == 15) return b + s >= 1.0 ? 1.0 : 0.0;       // Hard Mix (Photoshop)
  if (m == 16) return abs(b - s);                     // Difference (W3C)
  if (m == 17) return b + s - 2.0 * b * s;            // Exclusion (W3C)
  if (m == 18) return max(0.0, b - s);                // Subtract (Photoshop)
  if (m == 19) return s <= 0.0 ? (b <= 0.0 ? 0.0 : 1.0) : min(1.0, b / s); // Divide (Photoshop)
  return s;                                           // Normal
}
// W3C non-separable helpers.
float bLum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
vec3 bClip(vec3 c) {
  float l = bLum(c);
  float n = min(c.r, min(c.g, c.b));
  float x = max(c.r, max(c.g, c.b));
  if (n < 0.0) c = l + (c - l) * l / (l - n);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / (x - l);
  return c;
}
vec3 bSetLum(vec3 c, float l) { return bClip(c + (l - bLum(c))); }
float bSat(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
vec3 bSetSat(vec3 c, float s) {
  float n = min(c.r, min(c.g, c.b));
  float x = max(c.r, max(c.g, c.b));
  return x > n ? (c - n) * s / (x - n) : vec3(0.0);
}
vec3 blend(int mode, vec3 cb, vec3 cs) {
  if (mode == 20) return bSetLum(bSetSat(cs, bSat(cb)), bLum(cb)); // Hue (W3C)
  if (mode == 21) return bSetLum(bSetSat(cb, bSat(cs)), bLum(cb)); // Saturation (W3C)
  if (mode == 22) return bSetLum(cs, bLum(cb));                    // Color (W3C)
  if (mode == 23) return bSetLum(cb, bLum(cs));                    // Luminosity (W3C)
  return vec3(bSep(mode, cb.r, cs.r), bSep(mode, cb.g, cs.g), bSep(mode, cb.b, cs.b));
}
`;
