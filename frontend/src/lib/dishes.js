import * as THREE from "three";

// Procedural 3D dishes. Each builder returns a Group whose meshes carry userData.tint (the colour a cube
// sampled from that part starts with). Bottom of every dish sits at y = 0.

const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

function rngFrom(text) {
  let a = 2166136261;
  for (const ch of String(text)) a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}

const speckle = (g, w, h, n, colors, r0, r1, rnd) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, r0 + rnd() * (r1 - r0), 0, 6.283);
    g.fill();
  }
};

const mat = (tint, o = {}) => new THREE.MeshStandardMaterial({ color: o.map ? 0xffffff : lin(tint), roughness: 0.7, side: THREE.DoubleSide, ...o });
const phys = (tint, o = {}) => new THREE.MeshPhysicalMaterial({ color: o.map ? 0xffffff : lin(tint), roughness: 0.4, side: THREE.DoubleSide, ...o });

function add(group, geo, material, tint, pos) {
  const m = new THREE.Mesh(geo, material);
  m.userData.tint = tint;
  m.castShadow = m.receiveShadow = true;
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  group.add(m);
  return m;
}

const lathe = (pts, seg = 72) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const bumpNoise = (rnd) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = "#808080"; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 900, ["#606060", "#a0a0a0", "#707070"], 0.6, 2.2, rnd);
});

function burger(rnd) {
  const group = new THREE.Group();
  const bunBottom = canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#7a4a1d"); gr.addColorStop(0.45, "#c98a43"); gr.addColorStop(0.8, "#ead2a0"); gr.addColorStop(1, "#f3e3bd");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  add(group, lathe([[0, 0], [0.85, 0], [1.02, 0.05], [1.1, 0.17], [1.08, 0.29], [1.0, 0.34], [0.5, 0.34], [0, 0.34]]),
    mat(0xd9a45c, { map: bunBottom, bumpMap: bumpNoise(rnd), bumpScale: 0.1 }), 0xd9a45c);

  const pattyTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#3a2216"; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 700, ["#2a160d", "#4b2e1d", "#1a0e08", "#5a3a26"], 1, 4, rnd);
    g.strokeStyle = "rgba(10,5,3,.6)"; g.lineWidth = 6;
    for (let i = -h; i < w + h; i += 46) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
  });
  const pg = new THREE.CylinderGeometry(1.05, 1.05, 0.28, 64, 4);
  const pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), z = pp.getZ(i), r = Math.hypot(x, z);
    if (r > 0.85) {
      const a = Math.atan2(z, x), k = 1 + 0.05 * Math.sin(a * 7 + 1) + 0.03 * Math.sin(a * 17) + 0.02 * Math.sin(a * 31 + 2);
      pp.setX(i, x * k); pp.setZ(i, z * k); pp.setY(i, pp.getY(i) + 0.015 * Math.sin(a * 11));
    }
  }
  pg.computeVertexNormals();
  add(group, pg, mat(0x4a2c1b, { map: pattyTex, bumpMap: pattyTex, bumpScale: 1.2, roughness: 0.8 }), 0x4a2c1b, [0, 0.48, 0]);

  const cg = new THREE.PlaneGeometry(2.3, 2.3, 40, 40);
  const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const r = Math.hypot(cp.getX(i), cp.getY(i));
    if (r > 0.98) cp.setZ(i, -Math.pow(r - 0.98, 1.8) * 0.85 - 0.02 * Math.sin(cp.getX(i) * 9));
  }
  cg.computeVertexNormals(); cg.rotateX(-Math.PI / 2);
  add(group, cg, phys(0xf2a81d, { clearcoat: 0.3, roughness: 0.45 }), 0xf2a81d, [0, 0.64, 0]);

  const tomato = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#c92c20"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#e5604a"; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, w * 0.45, 0, 6.283); g.stroke();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.283;
      g.fillStyle = "#f08a6a"; g.beginPath(); g.ellipse(w / 2 + Math.cos(a) * 62, h / 2 + Math.sin(a) * 62, 34, 22, a, 0, 6.283); g.fill();
      g.fillStyle = "#f6dc8a";
      for (let s = 0; s < 4; s++) { g.beginPath(); g.arc(w / 2 + Math.cos(a) * (50 + s * 9), h / 2 + Math.sin(a) * (50 + s * 9), 3, 0, 6.283); g.fill(); }
    }
  });
  [[0.1, 0.67, 0.05], [-0.12, 0.7, -0.1], [0.02, 0.73, -0.02]].forEach(([x, y, z]) =>
    add(group, new THREE.CylinderGeometry(0.78, 0.78, 0.045, 48), phys(0xd63a2a, { map: tomato, clearcoat: 0.8, roughness: 0.3 }), 0xd63a2a, [x, y, z]));

  const leaf = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    gr.addColorStop(0, "#9bd36b"); gr.addColorStop(1, "#4e9a2e");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(220,255,180,.6)"; g.lineWidth = 3;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * w * 0.5, h / 2 + Math.sin(a) * h * 0.5); g.stroke(); }
  });
  const lg = new THREE.RingGeometry(0.15, 1.3, 96, 6);
  const lp = lg.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i), y = lp.getY(i), r = Math.hypot(x, y), a = Math.atan2(y, x), w = Math.pow((r - 0.15) / 1.15, 2);
    lp.setZ(i, (Math.sin(a * 14 + r * 3) * 0.06 + Math.sin(a * 23) * 0.035) * w);
  }
  lg.computeVertexNormals(); lg.rotateX(-Math.PI / 2);
  add(group, lg, mat(0x6db33f, { map: leaf }), 0x6db33f, [0, 0.78, 0]);

  const sheen = canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#d9993f"); gr.addColorStop(0.6, "#bf7a28"); gr.addColorStop(1, "#8f5217");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const dome = add(group, lathe([[0, 0], [1.1, 0], [1.15, 0.08], [1.1, 0.3], [0.9, 0.6], [0.55, 0.82], [0.2, 0.93], [0, 0.95]]),
    phys(0xbf7a28, { map: sheen, clearcoat: 0.35, clearcoatRoughness: 0.4, roughness: 0.55, bumpMap: bumpNoise(rnd), bumpScale: 0.08 }), 0xbf7a28, [0, 0.82, 0]);

  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), seeds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat(0xf1deb0, { roughness: 0.5 }), 95);
  const d = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3();
  let k = 0;
  while (k < 95) {
    const r = Math.sqrt(rnd()) * 0.92, a = rnd() * 6.283;
    ray.set(new THREE.Vector3(Math.cos(a) * r, 3, Math.sin(a) * r), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(dome)[0];
    if (!hit) continue;
    nrm.copy(hit.face.normal).transformDirection(dome.matrixWorld);
    if (nrm.y < 0) nrm.negate();
    d.position.copy(hit.point).addScaledVector(nrm, 0.012);
    d.quaternion.setFromUnitVectors(up, nrm).multiply(new THREE.Quaternion().setFromAxisAngle(up, rnd() * 6.283));
    d.scale.set(0.05, 0.022, 0.03);
    d.updateMatrix(); seeds.setMatrixAt(k++, d.matrix);
  }
  seeds.castShadow = true; seeds.userData.skipSample = true;
  group.add(seeds);
  return { group, axis: new THREE.Vector3(0, 1, 0) };
}

function pizza(rnd) {
  const group = new THREE.Group();
  const top = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#c8381c"; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 160, ["#f6d27a", "#f2c04f", "#fbe3a0"], 14, 40, rnd);
    speckle(g, w, h, 90, ["#d94a22", "#b02d14"], 6, 16, rnd);
  });
  add(group, new THREE.CylinderGeometry(1.5, 1.5, 0.1, 72), mat(0xe8b04a, { map: top }), 0xe8b04a, [0, 0.05, 0]);
  const crust = new THREE.TorusGeometry(1.42, 0.13, 16, 72); crust.rotateX(Math.PI / 2);
  add(group, crust, mat(0xd9a05b, { bumpMap: bumpNoise(rnd), bumpScale: 0.2, roughness: 0.85 }), 0xd9a05b, [0, 0.1, 0]);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 1.12;
    add(group, new THREE.CylinderGeometry(0.17, 0.17, 0.035, 24), mat(0xa3261b, { roughness: 0.5 }), 0xa3261b, [Math.cos(a) * r, 0.13, Math.sin(a) * r]);
  }
  for (let i = 0; i < 7; i++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 1.1;
    const m = add(group, new THREE.SphereGeometry(1, 10, 8), mat(0x3f8a2e), 0x3f8a2e, [Math.cos(a) * r, 0.15, Math.sin(a) * r]);
    m.scale.set(0.16, 0.02, 0.1); m.rotation.y = rnd() * 6.283;
  }
  return { group, axis: new THREE.Vector3(0.5, 0.4, 0.75).normalize() };
}

function bowl(group, inner) {
  add(group, lathe([[0, 0], [0.5, 0], [0.9, 0.12], [1.3, 0.55], [1.36, 0.62], [1.3, 0.62], [0.86, 0.2], [0, 0.1]], 64),
    phys(inner, { clearcoat: 0.6, roughness: 0.35 }), inner);
}

function rice(rnd) {
  const group = new THREE.Group();
  bowl(group, 0xb87333);
  const grains = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#f1d58a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      g.save(); g.translate(rnd() * w, rnd() * h); g.rotate(rnd() * 6.283);
      g.fillStyle = ["#fff0c2", "#e9a73a", "#f7c25a", "#d9822b", "#fbe6a6"][Math.floor(rnd() * 5)];
      g.fillRect(-6, -1.5, 12, 3); g.restore();
    }
  });
  const mound = add(group, new THREE.SphereGeometry(1.12, 40, 20, 0, 6.283, 0, 1.5708), mat(0xe3a93b, { map: grains, bumpMap: grains, bumpScale: 0.25 }), 0xe3a93b, [0, 0.5, 0]);
  mound.scale.y = 0.75;
  for (let i = 0; i < 6; i++) {
    const a = rnd() * 6.283, r = 0.2 + rnd() * 0.7;
    add(group, new THREE.DodecahedronGeometry(0.17), mat(0x7a3d1f, { roughness: 0.6 }), 0x7a3d1f, [Math.cos(a) * r, 0.85 - r * 0.35, Math.sin(a) * r]);
  }
  for (let i = 0; i < 14; i++) {
    const a = rnd() * 6.283, r = rnd() * 0.85;
    const m = add(group, new THREE.BoxGeometry(0.12, 0.015, 0.07), mat(rnd() > 0.4 ? 0x3f8a2e : 0xb8601a), 0x3f8a2e, [Math.cos(a) * r, 0.88 - r * 0.4, Math.sin(a) * r]);
    m.rotation.y = rnd() * 6.283;
  }
  return { group, axis: new THREE.Vector3(0.1, 1, 0.1).normalize() };
}

function noodles(rnd) {
  const group = new THREE.Group();
  bowl(group, 0xc4332a);
  for (let t = 0; t < 14; t++) {
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const a = rnd() * 6.283, r = rnd() * 1.0;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0.4 + Math.sqrt(1 - Math.min(1, r * r * 0.7)) * 0.55 * rnd() + rnd() * 0.15, Math.sin(a) * r));
    }
    add(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5), 60, 0.045, 6), mat(0xe7b24d, { roughness: 0.5 }), 0xe7b24d);
  }
  add(group, new THREE.SphereGeometry(0.3, 20, 12), mat(0xfaf5e8, { roughness: 0.4 }), 0xfaf5e8, [0.45, 0.95, 0.2]).scale.y = 0.55;
  add(group, new THREE.SphereGeometry(0.15, 16, 10), mat(0xf2a516, { roughness: 0.3 }), 0xf2a516, [0.45, 1.03, 0.2]).scale.y = 0.7;
  for (let i = 0; i < 12; i++) {
    const a = rnd() * 6.283, r = rnd() * 0.8;
    add(group, new THREE.BoxGeometry(0.1, 0.03, 0.04), mat(0x4a9a2e), 0x4a9a2e, [Math.cos(a) * r, 1.0, Math.sin(a) * r]).rotation.y = rnd() * 3;
  }
  return { group, axis: new THREE.Vector3(0.1, 1, 0.1).normalize() };
}

function roll(rnd) {
  const group = new THREE.Group();
  const wrap = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = "#e6c690"; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 90, ["#b98543", "#c99a58", "#9a6a30"], 2, 7, rnd);
  });
  const fill = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#e8d9b0"; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 60, ["#4a9a2e", "#d4531c", "#f2a516", "#c8381c", "#f4efe0"], 6, 16, rnd);
  });
  const holder = new THREE.Group();
  add(holder, new THREE.CylinderGeometry(0.46, 0.46, 2.0, 40, 1, true), mat(0xe0b878, { map: wrap, roughness: 0.8 }), 0xe0b878);
  const inner = add(holder, new THREE.CylinderGeometry(0.4, 0.4, 2.14, 32), mat(0xd9a05b, { map: fill }), 0xd9a05b);
  inner.rotation.y = 0.3;
  holder.rotation.z = Math.PI / 2 - 0.3;
  holder.position.y = 0.5;
  group.add(holder);
  return { group, axis: new THREE.Vector3(0.8, 0.6, 0.2).normalize() };
}

function cake(rnd) {
  const group = new THREE.Group();
  add(group, new THREE.CylinderGeometry(1.1, 1.1, 0.35, 56), mat(0x6b3e26, { bumpMap: bumpNoise(rnd), bumpScale: 0.15 }), 0x6b3e26, [0, 0.175, 0]);
  add(group, new THREE.CylinderGeometry(1.12, 1.12, 0.1, 56), mat(0xf4e6cf, { roughness: 0.4 }), 0xf4e6cf, [0, 0.4, 0]);
  add(group, new THREE.CylinderGeometry(1.1, 1.1, 0.35, 56), mat(0x6b3e26, { bumpMap: bumpNoise(rnd), bumpScale: 0.15 }), 0x6b3e26, [0, 0.625, 0]);
  add(group, new THREE.CylinderGeometry(1.13, 1.1, 0.06, 56), phys(0x2e1710, { clearcoat: 0.9, roughness: 0.25 }), 0x2e1710, [0, 0.83, 0]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283;
    add(group, new THREE.SphereGeometry(0.1, 14, 10), mat(0xf4e6cf, { roughness: 0.4 }), 0xf4e6cf, [Math.cos(a) * 0.95, 0.9, Math.sin(a) * 0.95]);
  }
  [[0, 0], [0.4, 0.25], [-0.35, 0.3]].forEach(([x, z]) =>
    add(group, new THREE.SphereGeometry(0.15, 18, 12), phys(0xb31b2a, { clearcoat: 1, roughness: 0.2 }), 0xb31b2a, [x, 0.98, z]));
  return { group, axis: new THREE.Vector3(0, 1, 0) };
}

function curry(rnd) {
  const group = new THREE.Group();
  bowl(group, 0xf2eee4);
  const gravy = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#c2531a"; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 300, ["#d9701f", "#a3400f", "#e28a35"], 3, 14, rnd);
  });
  add(group, new THREE.CylinderGeometry(1.2, 1.2, 0.08, 56), phys(0xc2531a, { map: gravy, clearcoat: 0.5, roughness: 0.35 }), 0xc2531a, [0, 0.52, 0]);
  for (let i = 0; i < 6; i++) {
    const a = rnd() * 6.283, r = 0.15 + rnd() * 0.7;
    const m = add(group, new THREE.BoxGeometry(0.3, 0.26, 0.3), mat(0xf3e2b8, { roughness: 0.55 }), 0xf3e2b8, [Math.cos(a) * r, 0.6, Math.sin(a) * r]);
    m.rotation.set(rnd(), rnd() * 3, rnd());
  }
  const swirl = new THREE.TorusGeometry(0.4, 0.05, 10, 40); swirl.rotateX(Math.PI / 2);
  add(group, swirl, mat(0xfff6e4, { roughness: 0.3 }), 0xfff6e4, [0.1, 0.58, -0.05]);
  for (let i = 0; i < 16; i++) {
    const a = rnd() * 6.283, r = rnd() * 0.95;
    add(group, new THREE.BoxGeometry(0.09, 0.02, 0.05), mat(0x4a9a2e), 0x4a9a2e, [Math.cos(a) * r, 0.62, Math.sin(a) * r]).rotation.y = rnd() * 3;
  }
  return { group, axis: new THREE.Vector3(0.1, 1, 0.1).normalize() };
}

const BUILDERS = { burger, pizza, rice, noodles, roll, cake, curry };

export function buildDish(kind, seed) {
  return (BUILDERS[kind] || curry)(rngFrom(seed || kind));
}
