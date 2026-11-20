// Two fragment shaders sharing one noise + colour ramp:
//   FIELD  the mirrored "neural field" slice, with horizontal row bleed
//   BAR    the bottom bar: the same three colours flowing out from the centre

export const STOPS = [
  [0.0, [1.0, 0.35, 0.32]], // coral
  [0.28, [1.0, 0.46, 0.36]],
  [0.38, [1.0, 0.68, 0.37]],
  [0.46, [1.0, 0.84, 0.36]], // yellow, held a little longer
  [0.55, [1.0, 0.86, 0.42]],
  [0.64, [1.0, 0.6, 0.76]],
  [0.76, [1.0, 0.45, 0.84]], // pink
  [1.0, [1.0, 0.64, 0.92]],
];

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function ramp(t) {
  let c = STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const k = ss(STOPS[i - 1][0], STOPS[i][0], t);
    c = c.map((v, j) => v + (STOPS[i][1][j] - v) * k);
  }
  return c;
}
export const flatCss = () => "linear-gradient(90deg, #ff5c52 0 33.3%, #ffd657 33.3% 66.6%, #ff80db 66.6%)";
export const rampCss = () =>
  `linear-gradient(90deg, ${Array.from({ length: 21 }, (_, i) => {
    const [r, g, b] = ramp(i / 20).map((v) => Math.round(v * 255));
    return `rgb(${r},${g},${b}) ${i * 5}%`;
  }).join(",")})`;

const glslRamp = `
vec3 ramp(float t){
  vec3 c = vec3(${STOPS[0][1].join(",")});
  ${STOPS.slice(1).map((s, i) => `c = mix(c, vec3(${s[1].join(",")}), smoothstep(${STOPS[i][0].toFixed(3)}, ${s[0].toFixed(3)}, t));`).join("\n  ")}
  return c;
}`;

const COMMON = `
precision highp float;
uniform vec2 uRes;
uniform float uT;
varying vec2 vUv;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float a = .5, s = 0.; mat2 r = mat2(.8,-.6,.6,.8);
  for(int i=0;i<5;i++){ s += a*vn(p); p = r*p*2.03 + 1.7; a *= .5; }
  return s;
}
uniform float uCell;
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(.5, a.y*.75))); }
float bayer4(vec2 a){ return bayer2(.5*a)*.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(.5*a)*.25 + bayer2(a); }
// ordered dither: snap the value to a few levels, Bayer threshold per cell
float dither(float v, float levels){
  float b = bayer8(gl_FragCoord.xy/uCell);
  return floor(clamp(v, 0., 1.)*levels + b)/levels;
}
// flat: three inks, ordered-dithered where they meet
const vec3 CORAL = vec3(1., .36, .32), YELLOW = vec3(1., .84, .34), PINK = vec3(1., .5, .86);
vec3 flat3(float v){
  float pos = clamp((v - .3)*4.4, 0., 2.);          // .3 coral · .53 yellow · .75 pink
  float i = floor(pos + bayer8(gl_FragCoord.xy/uCell));
  return i < .5 ? CORAL : i < 1.5 ? YELLOW : PINK;
}
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p)-b; return length(max(d,0.)) + min(max(d.x,d.y),0.); }
${glslRamp}
`;

const VERT = `attribute vec2 aP; varying vec2 vUv; void main(){ vUv = aP*.5+.5; gl_Position = vec4(aP,0.,1.); }`;

export const FIELD = COMMON + `
uniform vec3 uW; // plane weights: axial, coronal, sagittal

float folds(vec2 q){
  vec2 w = q*vec2(4.4,5.2);
  vec2 wp = vec2(fbm(w + vec2(0., uT*.05)), fbm(w + vec2(5.2,1.3) - vec2(uT*.04, 0.)));
  return fbm(w*1.25 + wp*2.2 + vec2(0., -uT*.03));
}

// grey-matter fingers inside an ellipse, yellow halo at the rim
float cortex(vec2 q, vec2 c, vec2 r, float f){
  float depth = 1. - length((q-c)/r);
  float th = .6 - clamp(depth, 0., 1.)*.3;                 // deep = mostly pink, rim = lone fingers
  float s = smoothstep(th - .07, th + .05, f);
  float rim = smoothstep(0., .04, depth) * (1. - smoothstep(.04, .14, depth));
  return max(s, rim*.46*(.5 + .9*f)) * smoothstep(-.03, .03, depth);
}

float coronal(vec2 q, float f){
  float s = cortex(q, vec2(.40,.68), vec2(.64,.36), f);
  s *= mix(1., smoothstep(.015, .06, q.x), step(.5, q.y));          // fissure
  float by = q.y - .455;                                              // spiky band
  float spike = vn(vec2(q.x*38., uT*1.6)) * vn(vec2(q.x*9. + 3., uT*.7));
  float zone = 1. - smoothstep(.04, .075, abs(by));
  s = mix(s, .2, zone*.9*step(q.x, .98));
  s = max(s, (1. - smoothstep(0., .012, abs(by) - .06*spike)) * .47 * smoothstep(.98, .7, q.x));
  float r = length((q - vec2(0., .08))/vec2(1., 1.1));                // arch
  float arch = (1. - smoothstep(0., .035, abs(r - .30) - .035)) * smoothstep(.1, .14, q.y);
  s = max(s, arch*(.6 + .3*f));
  float d = sdBox(q - vec2(0., .17), vec2(.08, .12)) - .03;           // stem
  s = max(s, (1. - smoothstep(-.02, .02, d))*(.68 + .22*f));
  s = max(s, (1. - smoothstep(0., .03, abs(d)))*.48);
  s = max(s, (1. - smoothstep(.05, .1, q.y)) * .34 * smoothstep(.5, .75, f)); // floor
  float corner = 1. - smoothstep(.25, .6, length((q - vec2(1., 0.))*vec2(1., 1.25)) + (f - .5)*.5);
  s = mix(s, .5 + (f - .5)*.12, corner);
  return s;
}

float axial(vec2 q, float f){
  float s = cortex(q, vec2(0., .5), vec2(.88,.47), f);
  s *= smoothstep(.012, .05, q.x);
  float v = min(length((q - vec2(.15,.58))/vec2(.07,.17)), length((q - vec2(.12,.38))/vec2(.065,.09)));
  s = mix(s, .14, 1. - smoothstep(.85, 1., v));
  s = max(s, (1. - smoothstep(0., .12, abs(v - 1.05)))*.46*step(.02, 1.4 - v));
  return s;
}

float sagittal(vec2 q, float f){
  float s = cortex(q, vec2(0., .6), vec2(.94,.37), f);
  float r = length((q - vec2(0., .5))/vec2(1., .8));                  // callosum arc
  s = max(s, (1. - smoothstep(0., .03, abs(r - .36) - .025)) * step(.5, q.y) * .7);
  vec2 cq = (q - vec2(.6,.2))/vec2(.3,.16); float cr = length(cq);     // cerebellum folia
  float folia = .5 + .5*sin(cr*34. - uT*.6 + f*3.);
  s = max(s, (1. - smoothstep(.9, 1., cr)) * mix(.3, .75, folia));
  float d = sdBox(q - vec2(0., .14), vec2(.07, .14)) - .03;
  s = max(s, (1. - smoothstep(-.02, .02, d))*(.66 + .2*f));
  return s;
}

float field(vec2 q){
  float f = folds(q);
  float s = 0.;
  if (uW.x > .001) s += uW.x*axial(q, f);
  if (uW.y > .001) s += uW.y*coronal(q, f);
  if (uW.z > .001) s += uW.z*sagittal(q, f);
  return s;
}

void main(){
  vec2 uv = vUv;
  float rows = 150.;
  float row = floor(uv.y*rows);
  // row bleed: whole rows slide sideways, harder in drifting bands
  float gate = smoothstep(.45, .9, vn(vec2(row*.045, uT*.22 + 7.)));
  float jit = (vn(vec2(row*.37, uT*.9)) - .5) * .06 * gate;
  vec2 q = vec2(abs(uv.x - .5)*2. + jit, uv.y);
  float s = 0., ws = 0.;
  for (int i = 0; i < 5; i++){                                          // smear outward
    float fi = float(i); float w = exp(-fi*.55);
    s += w*field(vec2(abs(q.x - fi*.013*(1. + 2.*gate)), q.y)); ws += w;
  }
  s /= ws;
  gl_FragColor = vec4(flat3(s), 1.);
}`;

export const BAR = COMMON + `
void main(){
  vec2 uv = vUv;
  float asp = uRes.x/uRes.y;
  float row = floor(uv.y*14.);
  float jit = (vn(vec2(row*.7, uT*.8)) - .5) * .5 * smoothstep(.4, .9, vn(vec2(row*.2, uT*.3 + 3.)));
  float x = abs(uv.x - .5)*asp;                     // mirrored: flows out from the centre
  float v = 0., ws = 0.;
  for (int i = 0; i < 4; i++){
    float fi = float(i); float w = exp(-fi*.6);
    float xx = abs(x + jit - fi*.08);
    vec2 p = vec2(xx*.35, uv.y*.8);
    vec2 wp = vec2(fbm(p*1.6 + vec2(0., uT*.12)), fbm(p*1.6 + vec2(4.1, -uT*.1)));
    float phase = xx*.55 - uT*.55 + wp.x*4.2 + wp.y*1.5;
    v += w*(.5 + .5*sin(phase)); ws += w;
  }
  v /= ws;
  gl_FragColor = vec4(flat3(v), 1.);
}`;

export function shader(canvas, frag) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aP");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(prog, n);
  const uRes = u("uRes"), uT = u("uT"), uW = u("uW"), uCell = u("uCell");
  const dpr = Math.min(2, devicePixelRatio || 1);

  function fit() {
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }
  return {
    gl,
    draw(t, w) {
      fit();
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uT, t);
      gl.uniform1f(uCell, 3 * dpr); // 3 css px dither cells
      if (uW && w) gl.uniform3f(uW, w[0], w[1], w[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
}
