const colorFieldStates = new WeakMap<HTMLCanvasElement, { time: number; reversed: boolean }>();

/** Match the current background field analytically, without reading pixels from the GPU. */
export function sampleRecapAccent(canvas: HTMLCanvasElement | null, x: number, y: number): string {
  const state = canvas ? colorFieldStates.get(canvas) : undefined;
  if (!state) return '#fff';
  const time = state.time;
  if (state.reversed) x = 1 - x;
  const pinkX = .025 + .035 * Math.sin(time / 13);
  const pinkY = -.025 + .045 * Math.sin(time / 17);
  const tealX = 1.025 + .035 * Math.sin(time / 19);
  const tealY = 1.03 + .04 * Math.cos(time / 21);
  const pink = Math.exp(-(((x - pinkX) / .46) ** 2 + ((y - pinkY) / .66) ** 2) * 2) * (.83 + .12 * Math.sin(time * Math.PI * 2 / 16));
  const teal = Math.exp(-(((x - tealX) / .66) ** 2 + ((y - tealY) / .92) ** 2) * 1.7) * (.87 + .1 * Math.sin(time * Math.PI * 2 / 20 - 2.2));
  const influence = Math.max(pink, teal);
  const mix = Math.max(0, Math.min(1, (influence - .04) / .35));
  const blend = mix * mix * (3 - 2 * mix);
  if (!blend) return '#fff';
  const total = pink + teal;
  const accent = [237 * pink / total, (229 * teal) / total, (255 * pink + 208 * teal) / total];
  return `rgb(${accent.map(channel => Math.round(255 + (channel - 255) * blend)).join(', ')})`;
}

/** Render soft color in one pass, dithering only at the final color conversion. */
export function createRecapColorField(canvas: HTMLCanvasElement, reversed = false): ((width: number, height: number, time: number) => void) | null {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  function shader(type: number, source: string): WebGLShader | null {
    const result = gl!.createShader(type);
    if (!result) return null;
    gl!.shaderSource(result, source);
    gl!.compileShader(result);
    if (!gl!.getShaderParameter(result, gl!.COMPILE_STATUS)) { gl!.deleteShader(result); return null; }
    return result;
  }
  const vertex = shader(gl.VERTEX_SHADER, 'attribute vec2 position; void main() { gl_Position = vec4(position, 0., 1.); }');
  const fragment = shader(gl.FRAGMENT_SHADER, `
    precision highp float;
    uniform vec2 resolution;
    uniform float time;
    uniform float reverseColors;
    float random(vec2 point) { return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y) / resolution;
      if (reverseColors > .5) uv.x = 1. - uv.x;
      float pinkPhase = time * 6.2831853 / 16.;
      float tealPhase = time * 6.2831853 / 20. - 2.2;
      vec2 pinkCenter = vec2(.025 + .035 * sin(time / 13.), -.025 + .045 * sin(time / 17.));
      vec2 tealCenter = vec2(1.025 + .035 * sin(time / 19.), 1.03 + .04 * cos(time / 21.));
      vec2 pinkOffset = (uv - pinkCenter) / vec2(.46, .66);
      vec2 tealOffset = (uv - tealCenter) / vec2(.66, .92);
      float pink = exp(-dot(pinkOffset, pinkOffset) * 2.) * (.83 + .12 * sin(pinkPhase));
      float teal = exp(-dot(tealOffset, tealOffset) * 1.7) * (.87 + .1 * sin(tealPhase));
      vec3 color = vec3(41.) / 255.;
      vec3 pinkColor = vec3(.135, -.012, .145);
      vec3 tealColor = vec3(-.035, .145, .125);
      color += pinkColor * pink;
      color += tealColor * teal;
      // Less than one RGB code value: smooth quantization without a grain overlay.
      float dither = (random(gl_FragCoord.xy) - .5) / 255.;
      gl_FragColor = vec4(clamp(color + dither, 0., 1.), 1.);
    }
  `);
  if (!vertex || !fragment) { if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment); return null; }
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return null; }
  const buffer = gl.createBuffer();
  if (!buffer) { gl.deleteProgram(program); return null; }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const resolution = gl.getUniformLocation(program, 'resolution');
  const time = gl.getUniformLocation(program, 'time');
  const reverseColors = gl.getUniformLocation(program, 'reverseColors');
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    canvas.parentElement?.classList.remove('has-smooth-color');
    colorFieldStates.delete(canvas);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    const restored = createRecapColorField(canvas, reversed);
    if (restored) { draw = restored; canvas.parentElement?.classList.add('has-smooth-color'); }
  });
  const state = { time: 0, reversed };
  colorFieldStates.set(canvas, state);
  let draw = (width: number, height: number, elapsed: number) => {
    if (gl.isContextLost()) { colorFieldStates.delete(canvas); return; }
    state.time = elapsed;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    gl.uniform2f(resolution, width, height);
    gl.uniform1f(time, elapsed);
    gl.uniform1f(reverseColors, reversed ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  return (width, height, elapsed) => draw(width, height, elapsed);
}
