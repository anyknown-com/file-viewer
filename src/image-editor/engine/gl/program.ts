// Shared GL helpers: 11 and 12 import these instead of writing their own.

/** `#version 300 es`: one triangle covering the viewport; `v_uv` is 0–1 across it (0 at framebuffer row 0). */
export const FULLSCREEN_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const programs = new WeakMap<WebGL2RenderingContext, Map<string, WebGLProgram>>();
const vaos = new WeakMap<WebGL2RenderingContext, WebGLVertexArrayObject>();

function shader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error("Could not create a shader.");
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? "";
    gl.deleteShader(s);
    const kind = type === gl.VERTEX_SHADER ? "Vertex" : "Fragment";
    throw new Error(`${kind} shader failed to compile: ${log}`);
  }
  return s;
}

/** Compiles and links once per gl, vertex and fragment source; throws with the info log on failure. */
export function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  let cache = programs.get(gl);
  if (!cache) {
    cache = new Map();
    programs.set(gl, cache);
  }
  const key = `${vs}\0${fs}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const v = shader(gl, gl.VERTEX_SHADER, vs);
  const f = shader(gl, gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram();
  if (!program) throw new Error("Could not create a program.");
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "";
    gl.deleteProgram(program);
    throw new Error(`Program failed to link: ${log}`);
  }
  cache.set(key, program);
  return program;
}

/** Draws FULLSCREEN_VS's triangle with an empty vertex array (one per gl). */
export function drawFullscreen(gl: WebGL2RenderingContext): void {
  let vao = vaos.get(gl);
  if (!vao) {
    vao = gl.createVertexArray();
    vaos.set(gl, vao);
  }
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}
