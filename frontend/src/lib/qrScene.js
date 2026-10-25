import * as THREE from "three";
import QRCode from "qrcode";
import { buildDish } from "./dishes.js";
import { dishInfo, inkHex, PAPER } from "./dishKind.js";

const LOOP = 13, SPIN = 3.5, FORM = 6.5, HOLD = 10;
const EXTENT = 2.6; // width of the QR modules, in scene units
const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const cubic = (v) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Burger/pizza/etc. to cubes to QR: each cube starts on the dish's real surface and lands on one QR module. */
function dissolveShader(uniforms, burn) {
  return (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("void main() {", "varying vec3 vWP;\nvoid main() {")
      .replace("#include <project_vertex>", `#include <project_vertex>
#ifdef USE_INSTANCING
  vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", `uniform float uProg; uniform vec3 uAxis; uniform float uMin; uniform float uRange;
varying vec3 vWP;
float hsh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hsh(i), hsh(i + vec3(1,0,0)), f.x), mix(hsh(i + vec3(0,1,0)), hsh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hsh(i + vec3(0,0,1)), hsh(i + vec3(1,0,1)), f.x), mix(hsh(i + vec3(0,1,1)), hsh(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main() {`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
  float dT = (1.0 - (dot(vWP, uAxis) - uMin) / uRange) * 0.42 + vnoise(vWP * 7.0) * 0.16;
  if (dT < uProg) discard;`);
    if (burn) {
      sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(1.0, 0.42, 0.08) * smoothstep(uProg + 0.05, uProg, dT) * step(0.001, uProg) * 2.4;`);
    }
  };
}

function studioEnv(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: 0x0b0907, side: THREE.BackSide })));
  const panel = (w, h, color, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(6, 4, new THREE.Color(9, 9, 8.4), [0, 5.6, 0]);
  panel(3, 5, new THREE.Color(7, 3.6, 1.4), [5.6, 1, 1]);
  panel(3, 4, new THREE.Color(1.4, 2.4, 4.2), [-5.6, 0.5, 2]);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s).texture;
  pm.dispose();
  return tex;
}

function triangles(group) {
  const tris = [];
  group.traverse((m) => {
    if (!m.isMesh || m.userData.skipSample || m.isInstancedMesh) return;
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
      const area = e1.subVectors(b, a).cross(e2.subVectors(c, a)).length() / 2;
      if (area > 1e-9) tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), area, tint: m.userData.tint });
    }
  });
  return tris;
}

function samplePoints(group, count, rnd) {
  const tris = triangles(group), cum = new Float64Array(tris.length);
  let total = 0;
  tris.forEach((t, i) => { total += t.area; cum[i] = total; });
  const out = [];
  for (let k = 0; k < count; k++) {
    const target = rnd() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid + 1; else hi = mid; }
    const t = tris[lo];
    let u = rnd(), v = rnd();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    out.push({
      x: t.a.x + (t.b.x - t.a.x) * u + (t.c.x - t.a.x) * v,
      y: t.a.y + (t.b.y - t.a.y) * u + (t.c.y - t.a.y) * v,
      z: t.a.z + (t.b.z - t.a.z) * u + (t.c.z - t.a.z) * v,
      tint: t.tint,
    });
  }
  return out;
}

/**
 * Mounts the animation in `host`. Returns { play, pause, replay, seek, setHold, dispose }.
 * Throws if WebGL is unavailable, so the caller can show the flat QR instead.
 */
export function createQrScene(host, { text, dish, reduced, onPhase, onTime, onPlaying }) {
  const info = dishInfo(dish);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0a0a0a, 1);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = studioEnv(renderer);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);

  const key = new THREE.DirectionalLight(0xfff0d8, 1.9);
  key.position.set(3, 5.5, 2.5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 14 });
  scene.add(key, new THREE.DirectionalLight(0xff7a2a, 1.4).translateX(-3).translateY(2).translateZ(-3), new THREE.HemisphereLight(0x8899aa, 0x221a14, 0.3));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.4 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.003; ground.receiveShadow = true;
  scene.add(ground);

  // ---- the dish ----
  const { group, axis } = buildDish(info.kind, dish || text);
  scene.add(group);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group), centre = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  let aMin = Infinity, aMax = -Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const v = x * axis.x + y * axis.y + z * axis.z; aMin = Math.min(aMin, v); aMax = Math.max(aMax, v);
  }
  const U = { uProg: { value: 0 }, uAxis: { value: axis }, uMin: { value: aMin }, uRange: { value: aMax - aMin } };
  const patch = dissolveShader(U, true), patchDepth = dissolveShader(U, false);
  const disposables = [];
  group.traverse((m) => {
    if (!m.isMesh) return;
    m.material.onBeforeCompile = patch;
    m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.customDepthMaterial.onBeforeCompile = patchDepth;
    disposables.push(m.geometry, m.material, m.customDepthMaterial);
  });

  // ---- the QR ----
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, bits = qr.modules.data, N = n * n;
  const cell = EXTENT / n;
  const inkColor = lin(inkHex(info.color)), paperColor = lin(PAPER);
  const plateSize = (n + 6) * cell;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(plateSize, 0.05, plateSize), new THREE.MeshStandardMaterial({ color: lin(0xefe3ca), roughness: 0.7, transparent: true, opacity: 0 }));
  plate.position.y = -0.025; plate.visible = false; plate.receiveShadow = true;
  scene.add(plate);

  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pts = samplePoints(group, N, rnd);
  pts.sort((p, q) => p.z - q.z);
  const ordered = [];
  for (let r = 0; r < n; r++) ordered.push(...pts.slice(r * n, (r + 1) * n).sort((p, q) => p.x - q.x));

  const startP = new Float32Array(N * 3), endP = new Float32Array(N * 3), c0 = new Float32Array(N * 3), c1 = new Float32Array(N * 3);
  const delay = new Float32Array(N), arc = new Float32Array(N), turns = new Float32Array(N), spinAxis = new Float32Array(N * 3), endH = new Float32Array(N);
  const food = new THREE.Color();
  ordered.forEach((p, i) => {
    const r = Math.floor(i / n), c = i % n, dark = bits[i] === 1;
    startP.set([p.x, p.y, p.z], i * 3);
    endH[i] = dark ? cell * 0.95 : cell * 0.12;
    endP.set([(c - (n - 1) / 2) * cell, endH[i] / 2, (r - (n - 1) / 2) * cell], i * 3);
    const yn = ((p.x * axis.x + p.y * axis.y + p.z * axis.z) - aMin) / (aMax - aMin);
    delay[i] = ((1 - yn) * 0.42 + rnd() * 0.16) / 1.16;
    arc[i] = 0.9 + rnd() * 1.1;
    turns[i] = 1 + Math.floor(rnd() * 3);
    const ax = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    spinAxis.set([ax.x, ax.y, ax.z], i * 3);
    food.copy(lin(p.tint)).multiplyScalar(0.85 + rnd() * 0.3);
    c0.set([food.r, food.g, food.b], i * 3);
    const end = dark ? inkColor : paperColor;
    c1.set([end.r, end.g, end.b], i * 3);
  });

  const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, envMapIntensity: 0.3 }), N);
  cubes.frustumCulled = false;
  cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  scene.add(cubes);

  // ---- per-frame state ----
  const dummy = new THREE.Object3D(), q = new THREE.Quaternion(), ax = new THREE.Vector3(), col = new THREE.Color();
  const heroDir = new THREE.Vector3(0.75, 0.55, 1).normalize();
  const up0 = new THREE.Vector3(0, 1, 0), up1 = new THREE.Vector3(0, 0, -1), look = new THREE.Vector3(), up = new THREE.Vector3();
  const heroTarget = new THREE.Vector3(centre.x, centre.y * 0.9, centre.z), qrTarget = new THREE.Vector3(0, 0, 0);
  const state = { t: reduced ? 8 : 0, playing: !reduced, hold: true, dirty: true, visible: true, aspect: 1, phase: "" };

  const fit = (r) => (r / Math.tan((camera.fov * Math.PI) / 360)) / Math.min(1, state.aspect) * 1.08;

  function frame(t) {
    const spin = t < SPIN ? cubic(t / SPIN) : 0;
    const p = t < SPIN ? 0 : t < FORM ? (t - SPIN) / (FORM - SPIN) : t < HOLD ? 1 : 1 - (t - HOLD) / (LOOP - HOLD);
    group.rotation.y = spin * Math.PI * 2;
    U.uProg.value = p * 1.16;
    plate.material.opacity = smooth(0.55, 0.95, p);
    plate.visible = plate.material.opacity > 0.01;
    ground.visible = !plate.visible || plate.material.opacity < 0.9;

    for (let i = 0; i < N; i++) {
      const u = clamp01((p - delay[i]) / 0.5);
      if (u <= 0) { dummy.scale.setScalar(0); dummy.position.set(0, 0, 0); dummy.updateMatrix(); cubes.setMatrixAt(i, dummy.matrix); continue; }
      const e = cubic(u), k = i * 3;
      dummy.position.set(
        startP[k] + (endP[k] - startP[k]) * e,
        startP[k + 1] + (endP[k + 1] - startP[k + 1]) * e + Math.sin(Math.PI * e) * arc[i],
        startP[k + 2] + (endP[k + 2] - startP[k + 2]) * e,
      );
      ax.set(spinAxis[k], spinAxis[k + 1], spinAxis[k + 2]);
      dummy.quaternion.copy(q.setFromAxisAngle(ax, (1 - e) * turns[i] * Math.PI * 2));
      const small = cell * 0.9;
      dummy.scale.set(small + (cell - small) * e, small + (endH[i] - small) * e, small + (cell - small) * e);
      dummy.updateMatrix();
      cubes.setMatrixAt(i, dummy.matrix);
      cubes.setColorAt(i, col.setRGB(c0[k] + (c1[k] - c0[k]) * e, c0[k + 1] + (c1[k + 1] - c0[k + 1]) * e, c0[k + 2] + (c1[k + 2] - c0[k + 2]) * e));
    }
    cubes.instanceMatrix.needsUpdate = true;
    cubes.instanceColor.needsUpdate = true;

    const cam = cubic(p);
    renderer.toneMappingExposure = 1 - 0.6 * cam; // darker light on the QR so the dish-coloured modules stay dark
    const heroDist = fit(radius * 0.95), topDist = fit(plateSize / 2 * 1.05);
    look.lerpVectors(heroTarget, qrTarget, cam);
    camera.position.copy(look).addScaledVector(heroDir, heroDist * (1 - cam)).add(up.set(0, topDist * cam, 0.0001));
    up.lerpVectors(up0, up1, cam).normalize();
    camera.up.copy(up);
    camera.lookAt(look);

    const phase = t < SPIN ? info.label : t < FORM ? "Assembling" : t < HOLD ? "QR ready · scan it" : "Rebuilding";
    if (phase !== state.phase) { state.phase = phase; onPhase?.(phase); }
    onTime?.(t);
    renderer.render(scene, camera);
  }

  let last = performance.now(), raf = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!state.visible) return;
    if (state.playing) {
      const was = state.t;
      state.t += dt;
      if (state.hold && was < FORM && state.t >= FORM) { state.t = FORM; state.playing = false; onPlaying?.(false); }
      if (state.t >= LOOP) state.t -= LOOP;
      state.dirty = true;
    }
    if (state.dirty) { state.dirty = false; frame(state.t); }
  }

  const size = () => {
    const w = host.clientWidth || 240, h = host.clientHeight || 240;
    renderer.setSize(w, h, false);
    state.aspect = w / h; camera.aspect = state.aspect; camera.updateProjectionMatrix(); state.dirty = true;
  };
  const ro = new ResizeObserver(size); ro.observe(host); size();
  const io = new IntersectionObserver(([en]) => { state.visible = en.isIntersecting; if (en.isIntersecting) { last = performance.now(); state.dirty = true; } });
  io.observe(host);
  raf = requestAnimationFrame(tick);

  return {
    play() { if (state.hold && state.t >= FORM && state.t < HOLD) state.t = HOLD; state.playing = true; onPlaying?.(true); },
    pause() { state.playing = false; onPlaying?.(false); },
    replay() { state.t = 0; state.playing = true; state.dirty = true; onPlaying?.(true); },
    seek(t) { state.t = clamp01(t / LOOP) * LOOP; state.dirty = true; },
    setHold(v) { state.hold = v; },
    duration: LOOP,
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      disposables.forEach((d) => d.dispose());
      [cubes, plate, ground].forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
      scene.environment?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
