const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) { const e = document.getElementById('err'); e.textContent = 'WebGL2 is not available in this browser.'; e.hidden = false; throw 0; }

const vs = `#version 300 es
in vec2 pos;
void main(){ gl_Position = vec4(pos, 0.0, 1.0); }`;

// fragment shader with the iteration line filled in from the formula
const fragSource = expr => `#version 300 es
precision highp float;
out vec4 color;
#define PI 3.14159265359
uniform vec2 res;
uniform vec2 centre;
uniform float scroll;
uniform int maxloop;
uniform vec3 phase;
uniform vec2 jitter;

vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x - a.y*b.y, a.y*b.x + a.x*b.y); }
vec2 cln(vec2 a){ return vec2(0.5*log(dot(a,a)), atan(a.y, a.x)); }
vec2 cexp(vec2 a){ float s = exp(a.x); return vec2(s*cos(a.y), s*sin(a.y)); }
vec2 cpow(vec2 a, vec2 b){
  if (dot(a,a) == 0.0) return vec2(0.0);
  return cexp(cmul(b, cln(a)));
}
vec2 inv(vec2 a) {
  float d = dot(a, a);
  if (d == 0.0) return vec2(0.0);
  return vec2(a.x, -a.y) / d;
}
vec2 csin(vec2 a) { return vec2(sin(a.x)*cosh(a.y),  cos(a.x)*sinh(a.y)); }
vec2 ccos(vec2 a) { return vec2(cos(a.x)*cosh(a.y), -sin(a.x)*sinh(a.y)); }
vec2 cpowi(vec2 a, int n) {
  vec2 r = a;
  for (int i = 0; i < n - 1; i++) r = cmul(r, a);
  return r;
}

vec3 shade(vec2 z0, float pxin){
  const float r2 = 200.0;
  const float p = 2.0;
  vec2 z = z0, saved = z0;
  int i = 0, period = 0, check = 1;
  float eps = 1e-4*pxin*pxin;
  while (dot(z,z) <= r2 && i <= maxloop) {
    z = ${expr};
    i++;

    vec2 d = z - saved;
    if (dot(d, d) < eps) { i = maxloop; break; }   // orbit came back: it's inside
    if (++period == check) { saved = z; period = 0; check *= 2; }
  }
  if (i >= maxloop) return vec3(0.0);

  float nu = log(log(float(i) * log2(0.5*log(dot(z,z))) / log(p)));
  nu /= log(log(float(maxloop) * log(0.5*log(r2)) / log(p)));   // one more log for both to colour z^z
  return 0.5 + 0.5*cos(2.0*PI*(nu*1.5+phase)); //grad=1.5
}

void main(){
  float m = min(res.x, res.y);
  vec2 uv = (2.0*gl_FragCoord.xy - res) / m;   // [-1,1] on the short side
  float px = 2.0 / (m * scroll);                // one pixel in plane units
  color = vec4(shade(uv/scroll + centre + jitter*px, px), 1.0);
}`;

function sh(type, src){
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s); gl.deleteShader(s);
    throw new Error(log);
  }
  return s;
}

const vShader = sh(gl.VERTEX_SHADER, vs);

// build a program for a GLSL expression; throws with the compile log on failure
function buildProgram(expr){
  const f = sh(gl.FRAGMENT_SHADER, fragSource(expr));
  const p = gl.createProgram();
  gl.attachShader(p, vShader);
  gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, 'pos');   // same slot for every program
  gl.linkProgram(p);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p); gl.deleteProgram(p);
    throw new Error(log);
  }
  return p;
}

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

let prog = null;
let u = {};   // uniform locations for the current program

function useProgram(p){
  if (prog) gl.deleteProgram(prog);
  prog = p;
  gl.useProgram(prog);
  for (const n of ['res', 'centre', 'scroll', 'maxloop', 'phase', 'jitter'])
    u[n] = gl.getUniformLocation(prog, n);
}

const MAX_FRAMES = 16;
let frame = 0;

// low-discrepancy sequence: spreads the jitter evenly across the pixel
function halton(i, b){ let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

const state = { x: 0, y: 0, scroll: 1, iter: 200, phase: [0.1, 0.2, 0.3] };

let queued = false;

function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  request();
}

//main draw loop
function draw(){
  queued = false;
  if (!prog) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(u.res, canvas.width, canvas.height);
  gl.uniform2f(u.centre, state.x, state.y);
  gl.uniform1f(u.scroll, state.scroll);
  gl.uniform1i(u.maxloop, state.iter);
  gl.uniform3fv(u.phase, state.phase);
  gl.uniform2f(u.jitter, halton(frame + 1, 2) - 0.5, halton(frame + 1, 3) - 0.5);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
  gl.blendColor(0, 0, 0, 1 / (frame + 1));     // running average: new frame weighted 1/(n+1)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  updateReadout();
  document.getElementById('zm').textContent = state.scroll < 1000 ? state.scroll.toFixed(2) + '×' : state.scroll.toExponential(2) + '×';
  zoomSlider.value = Math.log10(state.scroll);
  frame++;
  if (frame < MAX_FRAMES) { queued = true; requestAnimationFrame(draw); }
}
function request(){
  frame = 0;
  if (!queued) { queued = true; requestAnimationFrame(draw); }
}

// ---- formula input ----
const formulaInput = document.getElementById('formula');
const formulaErr = document.getElementById('ferr');
const fxLabel = document.getElementById('fx');

function showFormulaError(msg){
  formulaErr.textContent = msg;
  formulaErr.hidden = !msg;
  formulaInput.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

// returns true if the formula was applied; on failure the last good one stays on screen
function applyFormula(text){
  let compiled;
  try {
    compiled = compileFormula(text);
  } catch (err) {
    showFormulaError(err instanceof FormulaError ? err.message : `Couldn't read the formula: ${err.message}`);
    return false;
  }
  if (!compiled.vars.has('z'))
    console.warn('Formula does not use z, so every step gives the same value.');
  try {
    useProgram(buildProgram(compiled.glsl));
  } catch (err) {
    showFormulaError(`The formula turned into shader code that didn't compile: ${err.message.trim()}`);
    console.error(compiled.glsl);
    return false;
  }
  showFormulaError('');
  fxLabel.textContent = 'z ↦ ' + text.trim();
  request();
  return true;
}

let formulaTimer;
formulaInput.addEventListener('input', () => {
  clearTimeout(formulaTimer);
  formulaTimer = setTimeout(() => applyFormula(formulaInput.value), 300);   // wait for a pause in typing
});
formulaInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { clearTimeout(formulaTimer); applyFormula(formulaInput.value); }
});

let mouse = null;   // [clientX, clientY] while a mouse is over the canvas, else null

const reIn = document.getElementById('re');
const imIn = document.getElementById('im');

function updateReadout(){
  const [re, im] = mouse ? toPlane(mouse[0], mouse[1]) : [state.x, state.y];
  if (document.activeElement !== reIn) reIn.value = re.toFixed(6);   // don't overwrite while typing
  if (document.activeElement !== imIn) imIn.value = im.toFixed(6);
}


//set x and y
for (const [input, key] of [[reIn, 'x'], [imIn, 'y']]) {
  let original = '';
  input.addEventListener('focus', () => { original = input.value; input.select(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  input.blur();                                   // apply
    if (e.key === 'Escape') { input.value = original; input.blur(); }       // cancel
  });
  input.addEventListener('change', () => {
    if (input.value === original) return;          // unchanged: don't snap to the rounded value
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) { state[key] = v; request(); }
  });
  input.addEventListener('blur', updateReadout);   // put the live value back (or undo bad input)
}

// screen px -> plane coords
function toPlane(cx, cy){
  const m = Math.min(innerWidth, innerHeight);
  const ux = (2*cx - innerWidth) / m, uy = -(2*cy - innerHeight) / m;
  return [ux / state.scroll + state.x, uy / state.scroll + state.y];
}
function zoomAt(cx, cy, factor){
  const [wx, wy] = toPlane(cx, cy);
  state.scroll = Math.min(Math.max(state.scroll * factor, 0.05), 1e6);
  const [nx, ny] = toPlane(cx, cy);
  state.x += wx - nx; state.y += wy - ny;
  request();
}

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

// pointer pan + pinch
const pts = new Map();
let pinch = 0;
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); canvas.classList.add('drag'); });
canvas.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  const prev = pts.get(e.pointerId);
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 1) {
    const m = Math.min(innerWidth, innerHeight);
    state.x -= 2 * (e.clientX - prev[0]) / m / state.scroll;
    state.y += 2 * (e.clientY - prev[1]) / m / state.scroll;
    request();
  } else if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a[0]-b[0], a[1]-b[1]);
    if (pinch) zoomAt((a[0]+b[0])/2, (a[1]+b[1])/2, d / pinch);
    pinch = d;
  }
});
function up(e){ pts.delete(e.pointerId); pinch = 0; if (!pts.size) canvas.classList.remove('drag'); }
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);

canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;     // touch and pen keep the centre readout
  mouse = [e.clientX, e.clientY];
  updateReadout();                            // hovering alone needs no redraw
});
canvas.addEventListener('pointerleave', e => {
  if (e.pointerType === 'mouse') { mouse = null; updateReadout(); }
});
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') { mouse = null; updateReadout(); }   // laptop with a touchscreen
});

// keyboard (same step as the original: 0.06 / scroll)
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const s = 0.06 / state.scroll;
  switch (e.key) {
    case 'ArrowLeft':  state.x -= s; break;
    case 'ArrowRight': state.x += s; break;
    case 'ArrowUp':    state.y += s; break;
    case 'ArrowDown':  state.y -= s; break;
    case '+': case '=': zoomAt(innerWidth/2, innerHeight/2, 1.1); return;
    case '-':           zoomAt(innerWidth/2, innerHeight/2, 1/1.1); return;
    case 's': case 'S': snapshot(); return;
    default: return;
  }
  e.preventDefault(); request();
});

// iteration slider
const iter = document.getElementById('iter');
iter.addEventListener('input', () => { state.iter = +iter.value; document.getElementById('iv').textContent = iter.value; request(); });
document.getElementById('reset').onclick = () => { Object.assign(state, { x: 0, y: 0, scroll: 1 }); request(); };

const zoomSlider = document.getElementById('zoom');
zoomSlider.addEventListener('input', () => {
  const target = Math.pow(10, +zoomSlider.value);
  zoomAt(innerWidth / 2, innerHeight / 2, target / state.scroll);   // zoom about the screen centre
});

// rgb input
const phaseInput = document.getElementById('phase');
phaseInput.addEventListener('input', e => {
  const hex = e.target.value;                       // "#rrggbb"
  state.phase = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  request();
});

function snapshot(){
  // preserveDrawingBuffer keeps the latest frame, so read it as it is
  document.getElementById('shotImg').src = canvas.toDataURL('image/png');
  document.getElementById('shot').hidden = false;
}
document.getElementById('snap').onclick = snapshot;
document.getElementById('closeShot').onclick = () => { document.getElementById('shot').hidden = true; };

addEventListener('resize', resize);
if (!applyFormula(formulaInput.value)) applyFormula('z^2 + c');   // fall back if the starting text is bad
resize();
