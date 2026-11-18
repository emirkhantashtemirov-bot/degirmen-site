// Superhero - 3D-тело героя. Своя модель, собранная кодом: каждая мышца из пучков волокон.
// API: createBody(el, {onPick}) -> {paint(map), select(code), flash(code), view(side), dispose()}
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MUSCLES = ['neck','chest_up','chest','delt_f','delt_m','delt_r','biceps','triceps','forearm','abs','obliques','serratus','traps','midback','lats','lowback','glutes','glute_med','quads','adductors','hams','calves','tibialis'];

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RAD = Math.PI / 180;

// ---------- каркас: сечения торса (y, полуширина, полуглубина, сдвиг по z) ----------
const TP = [
  [0.84, 0.148, 0.100, 0.000], [0.90, 0.158, 0.106, 0.000], [0.96, 0.152, 0.101, 0.000],
  [1.02, 0.134, 0.093, 0.002], [1.08, 0.134, 0.094, 0.004], [1.15, 0.146, 0.103, 0.006],
  [1.22, 0.160, 0.112, 0.006], [1.29, 0.170, 0.118, 0.004], [1.35, 0.172, 0.116, 0.000],
  [1.40, 0.165, 0.104, -0.004], [1.445, 0.140, 0.084, -0.008], [1.48, 0.080, 0.066, -0.010], [1.51, 0.056, 0.056, -0.010]
];
function prof(y) {
  if (y <= TP[0][0]) return TP[0];
  for (let i = 1; i < TP.length; i++) if (y <= TP[i][0]) {
    const a = TP[i - 1], b = TP[i], k = (y - a[0]) / (b[0] - a[0]);
    return [y, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
  }
  return TP[TP.length - 1];
}
// точка на поверхности торса: угол 0 - спереди, 90 - бок, 180 - спина
function tor(y, ang, lift = 0) {
  const [, a, b, zc] = prof(y), th = ang * RAD;
  const n = V(Math.sin(th) / a, 0, Math.cos(th) / b).normalize();
  return { p: V(a * Math.sin(th), y, zc + b * Math.cos(th)).addScaledVector(n, lift), n };
}
// кости конечностей (правая сторона, левая - зеркало)
const B = {
  uarm: { a: V(0.198, 1.415, -0.004), b: V(0.262, 1.13, -0.012), r0: 0.05, r1: 0.037 },
  farm: { a: V(0.262, 1.13, -0.012), b: V(0.302, 0.9, 0.024), r0: 0.04, r1: 0.026 },
  thigh: { a: V(0.088, 0.93, 0.0), b: V(0.104, 0.505, 0.012), r0: 0.084, r1: 0.054 },
  shin: { a: V(0.104, 0.505, 0.012), b: V(0.114, 0.085, -0.012), r0: 0.052, r1: 0.031 }
};
for (const k in B) {
  const b = B[k]; b.D = b.b.clone().sub(b.a).normalize();
  b.F = V(0, 0, 1).addScaledVector(b.D, -b.D.z).normalize();
  b.L = b.F.clone().cross(b.D).normalize(); // наружу (+x)
}
function limb(k, t, ang, lift = 0) {
  const b = B[k], th = ang * RAD, r = b.r0 + (b.r1 - b.r0) * t;
  const n = b.F.clone().multiplyScalar(Math.cos(th)).addScaledVector(b.L, Math.sin(th)).normalize();
  return { p: b.a.clone().lerp(b.b, t).addScaledVector(n, r + lift), n };
}
const pt = (x, y, z, nx, ny, nz) => ({ p: V(x, y, z), n: V(nx, ny, nz).normalize() });

// ---------- пути пучков ----------
const TS = (y0, a0, y1, a1, l0 = 0, l1 = 0) => t => tor(y0 + (y1 - y0) * t, a0 + (a1 - a0) * t, l0 + (l1 - l0) * t);
const LS = (k, t0, a0, t1, a1, l = 0) => t => limb(k, t0 + (t1 - t0) * t, a0 + (a1 - a0) * t, l);
const MX = (A, Bp, bulge = 0.02) => t => {
  const n = A.n.clone().lerp(Bp.n, t).normalize();
  return { p: A.p.clone().lerp(Bp.p, t).addScaledVector(n, bulge * Math.sin(Math.PI * t)), n };
};

// веретено мышцы вдоль пути: w - полуширина, d - полутолщина
function spindle(path, w, d, o = {}) {
  const seg = o.seg || 26, rad = o.rad || 14, peak = o.peak ?? 0.5, pw = o.pw ?? 0.75, tend = o.tend ?? 0.14;
  const pos = [], nor = [], uv = [], idx = [];
  const e = 0.004;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, P = path(t);
    const T = path(Math.min(1, t + e)).p.sub(path(Math.max(0, t - e)).p).normalize();
    let S = T.clone().cross(P.n).normalize();
    const N = S.clone().cross(T).normalize();
    if (N.dot(P.n) < 0) { N.negate(); S.negate(); }
    const s = t < peak ? 0.5 * t / peak : 0.5 + 0.5 * (t - peak) / (1 - peak);
    const pr = Math.max(tend, Math.pow(Math.sin(Math.PI * s), pw));
    const c = P.p.clone().addScaledVector(N, d * pr * 0.2);
    for (let j = 0; j <= rad; j++) {
      const th = (j / rad) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      const k = sn < 0 ? 0.35 : 1;
      pos.push(...c.clone().addScaledVector(S, w * pr * cs).addScaledVector(N, d * pr * sn * k).toArray());
      nor.push(...S.clone().multiplyScalar(cs / w).addScaledVector(N, sn / (d * k)).normalize().toArray());
      uv.push(j / rad, t);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// пластина мышцы на поверхности: F(u,v) -> {p,n}, u - вдоль волокон, v - поперёк
function patch(F, H, o = {}) {
  const nu = o.nu || 22, nv = o.nv || 16, eu = o.eu ?? 0.6, ev = o.ev ?? 0.6, pk = o.pk ?? 0.5, base = o.base ?? 0.0015;
  const pos = [], uv = [], idx = [];
  const bump = (x, e, p) => { const s = x < p ? 0.5 * x / p : 0.5 + 0.5 * (x - p) / (1 - p); return Math.pow(Math.max(0, Math.sin(Math.PI * s)), e); };
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = i / nu, v = j / nv, P = F(u, v);
    const h = H * bump(u, eu, pk) * bump(v, ev, o.pv ?? 0.5) + base;
    pos.push(...P.p.addScaledVector(P.n, h).toArray()); uv.push(v * (o.rep || 1), u);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const bl = (c, u, v) => [0, 1].map(k => (1 - u) * (1 - v) * c[0][k] + u * (1 - v) * c[1][k] + (1 - u) * v * c[2][k] + u * v * c[3][k]);
// торс: углы [y, угол] в порядке (u0v0, u1v0, u0v1, u1v1)
const TQ = c => (u, v) => { const [y, a] = bl(c, u, v); return tor(y, a); };
// конечность: [t, угол]
const LQ = (k, t0, t1, a0, a1) => (u, v) => limb(k, t0 + (t1 - t0) * u, a0 + (a1 - a0) * v);
// свободная пластина между четырьмя точками {p, n}
const PQ = c => (u, v) => {
  const w = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
  const p = V(0, 0, 0), n = V(0, 0, 0);
  c.forEach((q, i) => { p.addScaledVector(q.p, w[i]); n.addScaledVector(q.n, w[i]); });
  return { p, n: n.normalize() };
};

function anatomy() {
  const M = {};
  const P = (m, F, H, o) => (M[m] = M[m] || []).push(patch(F, H, o));
  // грудь
  P('chest', TQ([[1.395, 2], [1.375, 62], [1.19, 3], [1.3, 76]]), 0.032, { eu: 0.45, ev: 0.55, pv: 0.55, rep: 3 });
  P('chest_up', TQ([[1.447, 3], [1.442, 50], [1.395, 2], [1.375, 62]]), 0.018, { eu: 0.5, ev: 0.7, rep: 2 });
  // пресс: кубики по 2 в ряд (правая колонка, левая - зеркало)
  [[1.225, 1.17], [1.158, 1.104], [1.092, 1.04], [1.028, 0.935]].forEach(([y0, y1]) =>
    P('abs', TQ([[y0, 3], [y1, 3], [y0, 27], [y1, 27]]), 0.016, { eu: 0.3, ev: 0.3, nu: 12, nv: 10 }));
  P('obliques', TQ([[1.23, 96], [0.97, 100], [1.19, 33], [0.95, 30]]), 0.016, { eu: 0.6, ev: 0.6, rep: 2 });
  [[1.31, 1.29], [1.275, 1.255], [1.24, 1.22]].forEach(([y0, y1]) =>
    P('serratus', TQ([[y0, 60], [y0 + 0.03, 88], [y1 - 0.02, 62], [y1 + 0.01, 90]]), 0.009, { eu: 0.5, ev: 0.6, nu: 10, nv: 8 }));
  // спина
  P('traps', PQ([pt(0.012, 1.615, -0.04, 0.1, 0.4, -1), pt(0.185, 1.478, -0.005, 0.2, 1, 0), pt(0.012, 1.47, -0.088, 0, 0.3, -1), pt(0.152, 1.452, -0.062, 0.25, 0.7, -0.75)]), 0.024, { eu: 0.5, ev: 0.5, pk: 0.4, rep: 2 });
  P('midback', TQ([[1.45, 179], [1.44, 136], [1.19, 179], [1.33, 150]]), 0.016, { eu: 0.6, ev: 0.6, rep: 2 });
  P('lats', TQ([[1.3, 177], [1.335, 103], [0.99, 168], [1.24, 94]]), 0.022, { eu: 0.5, ev: 0.6, pk: 0.62, rep: 3 });
  P('lowback', TQ([[1.25, 164], [0.95, 164], [1.25, 179], [0.95, 179]]), 0.022, { eu: 0.5, ev: 0.5, pk: 0.62, nv: 10 });
  P('glutes', TQ([[1.005, 178], [0.8, 178], [0.99, 118], [0.82, 128]]), 0.055, { eu: 0.6, ev: 0.6, pk: 0.55, rep: 2 });
  P('glute_med', TQ([[1.02, 92], [0.92, 98], [1.02, 124], [0.93, 122]]), 0.02, { eu: 0.6, ev: 0.6 });
  // плечо: три головки дельты
  P('delt_f', LQ('uarm', -0.1, 0.52, -58, 30), 0.032, { pk: 0.35, eu: 0.6, ev: 0.6 });
  P('delt_m', LQ('uarm', -0.14, 0.52, 30, 118), 0.036, { pk: 0.35, eu: 0.6, ev: 0.6 });
  P('delt_r', LQ('uarm', -0.1, 0.5, 118, 205), 0.03, { pk: 0.35, eu: 0.6, ev: 0.6 });
  // руки
  P('biceps', LQ('uarm', 0.16, 0.93, -58, 62), 0.032, { pk: 0.58, eu: 0.8, ev: 0.75 });
  P('triceps', LQ('uarm', 0.1, 0.9, 110, 262), 0.03, { pk: 0.4, eu: 0.75, ev: 0.7, rep: 2 });
  P('forearm', LQ('farm', -0.05, 0.86, -130, 42), 0.02, { pk: 0.25, eu: 0.6, ev: 0.6, rep: 2 });
  P('forearm', LQ('farm', -0.05, 0.86, 30, 200), 0.022, { pk: 0.25, eu: 0.6, ev: 0.6, rep: 2 });
  // ноги
  P('quads', LQ('thigh', 0.03, 0.93, -18, 42), 0.032, { pk: 0.5, eu: 0.75, ev: 0.7 });
  P('quads', LQ('thigh', 0.06, 0.9, 42, 108), 0.034, { pk: 0.45, eu: 0.75, ev: 0.7 });
  P('quads', LQ('thigh', 0.45, 0.97, -78, -18), 0.032, { pk: 0.72, eu: 0.75, ev: 0.7 });
  P('adductors', LQ('thigh', -0.02, 0.62, -140, -78), 0.026, { pk: 0.3, eu: 0.75, ev: 0.7, rep: 2 });
  P('hams', LQ('thigh', 0.12, 0.93, 112, 182), 0.03, { pk: 0.5, eu: 0.75, ev: 0.7 });
  P('hams', LQ('thigh', 0.12, 0.93, 182, 226), 0.028, { pk: 0.5, eu: 0.75, ev: 0.7 });
  P('calves', LQ('shin', 0.02, 0.6, 108, 182), 0.034, { pk: 0.35, eu: 0.75, ev: 0.7 });
  P('calves', LQ('shin', 0.02, 0.62, 182, 262), 0.036, { pk: 0.35, eu: 0.75, ev: 0.7 });
  P('tibialis', LQ('shin', 0.05, 0.84, -28, 96), 0.016, { pk: 0.35, eu: 0.75, ev: 0.7 });
  // шея: грудино-ключично-сосцевидная
  (M.neck = M.neck || []).push(spindle(MX(pt(0.05, 1.59, -0.012, 0.9, 0, 0.3), pt(0.017, 1.468, 0.066, 0.25, 0.1, 1), 0.004), 0.015, 0.016, { pw: 0.5, tend: 0.3 }));
  return M;
}

// ---------- кожа-основа (тёмная) ----------
function loftTorso() {
  const seg = 40, pos = [], idx = [];
  const ys = []; for (let y = 0.84; y <= 1.515; y += 0.015) ys.push(y);
  ys.forEach(y => { for (let j = 0; j <= seg; j++) pos.push(...tor(y, (j / seg) * 360, -0.004).p.toArray()); });
  for (let i = 0; i < ys.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function tube(a, b, r0, r1, seg = 24) {
  const g = new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), seg, 6, false);
  g.translate(0, a.distanceTo(b) / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
  return g;
}
function blob(c, sx, sy, sz, seg = 24) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  g.scale(sx, sy, sz); g.translate(c.x, c.y, c.z); return g;
}
function skinGeoms() {
  const L = [], R = [];
  L.push(loftTorso());
  L.push(tube(V(0, 1.47, -0.01), V(0, 1.62, -0.012), 0.056, 0.05));      // шея
  L.push(blob(V(0, 1.7, 0.004), 0.088, 0.112, 0.1, 32));                   // голова
  L.push(blob(V(0, 1.635, 0.03), 0.06, 0.04, 0.06));                       // челюсть
  L.push(blob(V(0, 0.87, 0.0), 0.15, 0.07, 0.1));                          // таз низ
  const sh = [[B.uarm, 0.997], [B.farm, 1], [B.thigh, 1], [B.shin, 1]];
  sh.forEach(([b, k]) => R.push(tube(b.a, b.b, b.r0 * 0.93 * k, b.r1 * 0.93)));
  R.push(blob(B.uarm.a.clone().add(V(-0.006, 0.004, 0)), 0.05, 0.052, 0.05));        // плечевой сустав
  R.push(blob(B.uarm.b, 0.034, 0.036, 0.034));                                         // локоть
  R.push(blob(B.thigh.b, 0.049, 0.05, 0.05));                                          // колено
  R.push(blob(V(0.307, 0.84, 0.03), 0.024, 0.062, 0.042));                             // кисть
  R.push(blob(V(0.116, 0.07, -0.006), 0.03, 0.035, 0.032));                            // лодыжка
  R.push(blob(V(0.12, 0.03, 0.045), 0.042, 0.03, 0.11));                               // стопа
  R.push(blob(V(0.09, 0.89, 0.0), 0.085, 0.09, 0.09));                                 // верх бедра
  R.push(tube(V(0.02, 1.445, 0.06), V(0.17, 1.46, 0.0), 0.012, 0.012, 10));            // ключица
  const clean = a => a.map(g => { g.deleteAttribute('uv'); return g; });
  return { center: mergeGeometries(clean(L)), side: mergeGeometries(clean(R)) };
}

// ---------- текстура волокон (карта нормалей) ----------
function fiberMap() {
  const W = 128, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), h = new Float32Array(W);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < W; i++) h[i] = 0.5 + 0.5 * Math.sin(i * 0.9 + rnd() * 2) * (0.6 + rnd() * 0.4);
  const img = x.createImageData(W, H);
  for (let yy = 0; yy < H; yy++) for (let i = 0; i < W; i++) {
    const wob = Math.sin(yy * 0.05 + i * 0.3) * 0.15;
    const dx = (h[(i + 1) % W] - h[(i - 1 + W) % W]) * 1.6 + wob;
    const o = (yy * W + i) * 4;
    img.data[o] = 128 + Math.max(-127, Math.min(127, dx * 90));
    img.data[o + 1] = 128; img.data[o + 2] = 255; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return t;
}

// свечение по краю (френель) - для высоких уровней и выбора
function glowMat() {
  return new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(1, 0.6, 0.2) }, k: { value: 0 }, t: { value: 0 }, wave: { value: 0 }, scan: { value: -1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 w = modelMatrix * vec4(position + normal*0.004, 1.0); vY = w.y; vec4 mv = viewMatrix * w; vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 col; uniform float k; uniform float t; uniform float wave; uniform float scan; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float band = wave * pow(max(0.0, sin(vY*9.0 - t*3.2)), 6.0);
        float sc = scan > -0.5 ? smoothstep(0.09, 0.0, abs(vY - scan)) * 1.6 : 0.0;
        float a = (f*1.6 + 0.12 + band*1.4) * k + sc;
        gl_FragColor = vec4(col * a, 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
  });
}

// ---------- сцена ----------
export function createBody(el, opt = {}) {
  const W = () => el.clientWidth || 300, H = () => el.clientHeight || 400;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(W(), H());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, W() / H(), 0.1, 20);
  cam.position.set(0, 1.0, 4.1);
  const ctl = new OrbitControls(cam, renderer.domElement);
  ctl.target.set(0, 0.9, 0); ctl.enablePan = false; ctl.enableDamping = true; ctl.dampingFactor = 0.08;
  ctl.minDistance = 1.4; ctl.maxDistance = 4.6; ctl.minPolarAngle = 1.05; ctl.maxPolarAngle = 1.95;
  ctl.rotateSpeed = 0.7; ctl.autoRotate = opt.autoRotate !== false; ctl.autoRotateSpeed = 0.8;

  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x12141c, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, 3, 3); scene.add(key);
  const rim1 = new THREE.DirectionalLight(0x5b8cff, 2.6); rim1.position.set(-3, 2, -2.5); scene.add(rim1);
  const rim2 = new THREE.DirectionalLight(0xb15cff, 1.8); rim2.position.set(3, 1.2, -2.5); scene.add(rim2);
  const fill = new THREE.DirectionalLight(0xffd7a8, 0.5); fill.position.set(0, -1, 2); scene.add(fill);

  // подиум
  const pc = document.createElement('canvas'); pc.width = pc.height = 256;
  const px = pc.getContext('2d'), gr = px.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, 'rgba(120,150,255,0.55)'); gr.addColorStop(0.55, 'rgba(90,110,255,0.18)'); gr.addColorStop(0.9, 'rgba(160,90,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  px.fillStyle = gr; px.fillRect(0, 0, 256, 256);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.002; scene.add(disc);

  const hero = new THREE.Group(); scene.add(hero);
  const skinMat = new THREE.MeshPhysicalMaterial({ color: 0x161b27, roughness: 0.7, metalness: 0.1, clearcoat: 0.1, sheen: 0.6, sheenColor: new THREE.Color(0x3a4a7a) });
  const sk = skinGeoms();
  hero.add(new THREE.Mesh(sk.center, skinMat));
  const sR = new THREE.Mesh(sk.side, skinMat), sL = sR.clone(); sL.scale.x = -1; hero.add(sR, sL);

  const fiber = fiberMap();
  const mats = {}, glows = {}, meshes = [];
  const geo = anatomy();
  for (const m of MUSCLES) {
    if (!geo[m]) continue;
    const g = mergeGeometries(geo[m]);
    mats[m] = new THREE.MeshPhysicalMaterial({ color: 0x6b7286, emissive: 0x000000, roughness: 0.42, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.35, normalMap: fiber, normalScale: new THREE.Vector2(0.7, 0.7), side: THREE.DoubleSide });
    glows[m] = glowMat();
    for (const sx of [1, -1]) {
      const mesh = new THREE.Mesh(g, mats[m]); mesh.scale.x = sx; mesh.userData.m = m;
      const gl = new THREE.Mesh(g, glows[m]); gl.scale.x = sx; gl.visible = false; gl.renderOrder = 2;
      hero.add(mesh, gl); meshes.push(mesh); mesh.userData.glow = gl;
    }
  }

  // нажатие на мышцу
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  const cv = renderer.domElement;
  cv.style.touchAction = 'none';
  const onDown = e => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; ctl.autoRotate = false; clearTimeout(S.idle); };
  const onUp = e => {
    S.idle = setTimeout(() => { ctl.autoRotate = opt.autoRotate !== false; }, 6000);
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || Date.now() - down.t > 600) return;
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) { api.select(hit.object.userData.m); opt.onPick && opt.onPick(hit.object.userData.m); }
    else { api.select(null); opt.onPick && opt.onPick(null); }
  };
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointerup', onUp);

  const S = { sel: null, flash: {}, glow: {}, raf: 0, vis: true, idle: 0, tc: {}, te: {}, pulse: {}, wave: {}, t0: performance.now() };
  const clock = new THREE.Clock();
  function frame() {
    S.raf = requestAnimationFrame(frame);
    if (!S.vis) return;
    const t = clock.getElapsedTime(), since = (performance.now() - S.t0) / 1000;
    // появление: камера подъезжает, по телу снизу вверх проходит луч сканера
    if (since < 1.6) { const e = 1 - Math.pow(1 - Math.min(1, since / 1.4), 3); const d = 6.2 - 2.1 * e; const dir = cam.position.clone().sub(ctl.target).normalize(); cam.position.copy(ctl.target).addScaledVector(dir, d); }
    const scan = since < 2.2 ? -0.1 + since * 1.0 : -1;
    ctl.update();
    for (const m in mats) {
      // плавный переход цвета при смене режима
      if (S.tc[m]) { mats[m].color.lerp(S.tc[m], 0.09); mats[m].emissive.lerp(S.te[m], 0.09); }
      const p = S.pulse[m];
      if (p) { const ph = (Math.sin(t * p.f * Math.PI * 2 + m.length * 0.7) + 1) / 2, sh = p.beat ? Math.pow(ph, 6) : ph; mats[m].emissiveIntensity = 1 + p.a * sh; }
      else mats[m].emissiveIntensity = 1 + 0.25 * (Math.sin(t * 1.1 + m.length) + 1) / 2;
      let k = S.glow[m] || 0;
      if (p && p.g) k = Math.max(k, p.g * (p.beat ? Math.pow((Math.sin(t * p.f * Math.PI * 2 + m.length * 0.7) + 1) / 2, 6) : (Math.sin(t * p.f * Math.PI * 2 + m.length * 0.7) + 1) / 2));
      if (S.sel === m) k = Math.max(k, 0.55 + 0.35 * Math.sin(t * 5));
      const f = S.flash[m]; if (f) { const a = (performance.now() - f) / 1400; if (a > 1) delete S.flash[m]; else k = Math.max(k, 1.6 * (1 - a)); }
      if (k > 0 && S.glow[m] >= 0.7) k *= 0.85 + 0.15 * Math.sin(t * 2.4 + m.length);
      const g = glows[m].uniforms; g.k.value = k; g.t.value = t; g.wave.value = S.wave[m] || 0; g.scan.value = scan;
    }
    for (const ms of meshes) { const g = glows[ms.userData.m].uniforms; ms.userData.glow.visible = g.k.value > 0.01 || g.scan.value > -0.5; }
    disc.material.opacity = 0.85 + 0.15 * Math.sin(t * 1.5);
    hero.position.y = 0.006 * Math.sin(t * 1.3); // лёгкое «дыхание»
    renderer.render(scene, cam);
  }
  frame();
  // пауза, когда не видно (экономия батареи)
  const io = new IntersectionObserver(es => { S.vis = es[0].isIntersecting && !document.hidden; }, { threshold: 0.01 });
  io.observe(el);
  const onVis = () => { S.vis = !document.hidden; };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); });
  ro.observe(el);

  const api = {
    // map: {code: {color:'#hex', glow:0..1, glowColor:'#hex'}}
    // map: {code: {color, emit, glow, glowColor, pulse:{f:Гц, a:сила, g:свечение, beat:удар сердца}, wave:0..1}}
    paint(map) {
      const first = !Object.keys(S.tc).length;
      for (const m in mats) {
        const o = map[m] || {}, c = new THREE.Color(o.color || '#5d6478');
        S.tc[m] = c; S.te[m] = c.clone().multiplyScalar(o.emit ?? 0.12);
        if (first) { mats[m].color.copy(c); mats[m].emissive.copy(S.te[m]); }
        S.glow[m] = o.glow || 0; S.pulse[m] = o.pulse || null; S.wave[m] = o.wave || 0;
        glows[m].uniforms.col.value.set(o.glowColor || o.color || '#ffffff');
      }
    },
    select(m) { S.sel = m; },
    flash(m) { S.flash[m] = performance.now(); },
    view(side) {
      ctl.autoRotate = false; clearTimeout(S.idle);
      const d = cam.position.distanceTo(ctl.target), a = side === 'back' ? Math.PI : 0;
      const from = Math.atan2(cam.position.x - ctl.target.x, cam.position.z - ctl.target.z);
      let delta = a - from; while (delta > Math.PI) delta -= 2 * Math.PI; while (delta < -Math.PI) delta += 2 * Math.PI;
      const t0 = performance.now(), y = cam.position.y;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 600), e = 1 - Math.pow(1 - k, 3), an = from + delta * e;
        cam.position.set(ctl.target.x + Math.sin(an) * d, y, ctl.target.z + Math.cos(an) * d);
        if (k < 1) requestAnimationFrame(step);
      };
      step();
      S.idle = setTimeout(() => { ctl.autoRotate = opt.autoRotate !== false; }, 8000);
    },
    spin(on) { ctl.autoRotate = on; },
    shot() { renderer.render(scene, cam); return renderer.domElement.toDataURL('image/png'); },
    dispose() {
      cancelAnimationFrame(S.raf); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis);
      renderer.dispose(); el.removeChild(cv);
    }
  };
  return api;
}
