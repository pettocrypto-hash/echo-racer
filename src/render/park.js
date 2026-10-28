// Lunapark-Kulisse (sechste Welt): Riesenrad, Karussell, Kettenkarussell, Freifallturm, Achterbahn mit Zug,
// Zirkuszelt über der Gegengeraden (die Bahn fährt hindurch), Buden mit Markisen, Lichterketten über der Bahn,
// Bäume, Rasenflächen und Feuerwerk am Abendhimmel. Alles prozedural; die Lage der Fahrgeschäfte ist relativ zur
// Strecke angegeben (Anteil der Runde + seitlicher Abstand) und passt daher auch zur gespiegelten Strecke.

import * as THREE from 'three';
import { GeoBuilder, BASIC } from './geo.js';
import { crowdMaterial, BODY_COLS, SKIN } from './trackside.js';

const RH = 0.7; // Leistenhöhe (wie in world.js)
const RW = 0.5;
const BULBS = ['#ffd27a', '#ff7ad0', '#7ae8ff', '#fff4d6', '#ffb347'];
const AWNINGS = [['#e8323c', '#fff4ea'], ['#8a52ff', '#ffe9a8'], ['#ff8a1f', '#fff4ea'], ['#1fa2ff', '#fff4ea'], ['#ff4f9e', '#fff4ea'], ['#2fb36a', '#fff4ea']];
const FIREWORK = ['#ff5fd0', '#ffd23d', '#2ce7ff', '#7dff5a', '#ff7a1f', '#ffffff', '#a585ff'];

const _y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _fw = new THREE.Vector3();

// Balken von a nach c (Mittelpunkte der Enden), Querschnitt w × d
function beam(b, a, c, w, color, k = 1, d = w) {
  _d.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = _d.length();
  if (len < 1e-4) return;
  _q.setFromUnitVectors(_y, _d.multiplyScalar(1 / len));
  _e.setFromQuaternion(_q, 'XYZ');
  b.add(BASIC.box, { x: (a[0] + c[0]) / 2, y: (a[1] + c[1]) / 2, z: (a[2] + c[2]) / 2, rx: _e.x, ry: _e.y, rz: _e.z, sx: w, sy: len, sz: d, color, k });
}

const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true });

// Lauflichter: Glühbirnen leuchten in Wellen nacheinander auf (Attribut aPhase je Birne)
function chaseMaterial(uTime) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;\nvarying float vChase;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvChase = 0.4 + 0.6 * smoothstep(0.25, 0.6, fract(aPhase - uTime * 0.8));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vChase;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vChase;');
  };
  m.customProgramCacheKey = () => 'echo-racer-chase';
  return m;
}
class Bulbs {
  constructor() {
    this.b = new GeoBuilder();
    this.ph = [];
  }
  add(geo, opts, phase = 0) {
    const n0 = this.b.count;
    this.b.add(geo, opts);
    for (let i = n0; i < this.b.count; i++) this.ph.push(phase);
  }
  build() {
    const g = this.b.build();
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.ph, 1));
    return g;
  }
}

export function buildPark({ track, grid, rnd, gy, det, glow, solid, meshes, updates, blocked, blink, n, landmarks = [], sfx = null }) {
  const L = track.length;
  const uChase = { value: 0 };
  const chase = chaseMaterial(uChase);
  updates.push((t) => (uChase.value = t));
  const mir = track.def.mirror ? -1 : 1;
  const taken = [];
  const free = (x, z, r) => !blocked(x, z, r) && !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r);
  const take = (x, z, r) => taken.push({ x, z, r });
  // Punkt neben der Strecke: u = Anteil der Runde, d = seitlicher Abstand (Vorzeichen gilt für die ungespiegelte Strecke)
  const beside = (u, d) => track.posAt(u * L, d * mir, {});
  const add = (geo, mat, parent = null) => {
    const m = new THREE.Mesh(geo, mat);
    if (parent) parent.add(m);
    return m;
  };
  // eigene Gruppe in der Szene (meshes nimmt auch Gruppen; world.js entsorgt Geometrie/Material der Kinder)
  const group = (x, y, z, ry = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    meshes.push(g);
    return g;
  };
  const lawn = (x, z, r) => solid.add(BASIC.cyl24, { x, y: gy + 0.04, z, sx: r, sy: 0.08, sz: r, color: '#3f8f3c', smooth: true });
  // Fahrgeschäfte als Knoten für Wege und Warteschlangen; wartende Besucher (stehen) und Spaziergänger (laufen)
  const hubs = [];
  const waiting = [];
  const walkers = [];

  // ---------- Riesenrad am Infield der Startgeraden, Radebene parallel zur Bahn ----------
  {
    const p = beside(0.06, -46);
    hubs.push({ x: p.x, z: p.z, r: 16 });
    const R = 20;
    const H = R + 4.5;
    landmarks.push({ x: p.x, y: gy + H, z: p.z, r: 48 });
    const head = p.h; // Rad dreht um die lokale z-Achse; lokale x-Achse = Fahrtrichtung der Bahn
    take(p.x, p.z, 16);
    lawn(p.x, p.z, 17);
    const frame = new GeoBuilder();
    // A-Böcke auf beiden Seiten der Radebene
    for (const sz of [-3.2, 3.2]) {
      for (const sx of [-12, 12]) beam(frame, [sx, 0, sz * 1.5], [0, H, sz], 0.7, '#f2eefc');
      beam(frame, [-7, H * 0.42, sz * 1.2], [7, H * 0.42, sz * 1.2], 0.5, '#f2eefc');
    }
    frame.add(BASIC.box, { x: 0, y: 0.5, z: 0, sx: 30, sy: 1, sz: 13, color: '#8a7e86' });
    frame.add(BASIC.cyl24, { x: 0, y: H, z: 0, rx: Math.PI / 2, sx: 1.2, sy: 7.4, sz: 1.2, color: '#d8d2e6', smooth: true });
    // Kasse + Einstieg
    frame.add(BASIC.box, { x: 0, y: 1.6, z: 8.5, sx: 6, sy: 2.2, sz: 3.5, color: '#8a52ff' });
    frame.add(BASIC.box, { x: 0, y: 3.0, z: 8.5, sx: 6.6, sy: 0.4, sz: 4.1, color: '#ffc93d' });
    const fg = group(p.x, gy, p.z, head - Math.PI / 2);
    add(frame.build(), lambert(), fg);
    // drehendes Rad: Felgen, Speichen, Querstreben; Lichter auf der Felge
    const wheel = new GeoBuilder();
    const wl = new Bulbs();
    const SEG = 32;
    for (const z of [-1.4, 1.4]) {
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2;
        const a1 = ((i + 1) / SEG) * Math.PI * 2;
        beam(wheel, [Math.cos(a0) * R, Math.sin(a0) * R, z], [Math.cos(a1) * R, Math.sin(a1) * R, z], 0.45, '#ff4f9e');
        beam(wheel, [Math.cos(a0) * R * 0.62, Math.sin(a0) * R * 0.62, z], [Math.cos(a1) * R * 0.62, Math.sin(a1) * R * 0.62, z], 0.3, '#ffffff');
        if (i % 2 === 0) beam(wheel, [0, 0, z], [Math.cos(a0) * R, Math.sin(a0) * R, z], 0.22, '#ffffff');
        wl.add(BASIC.box, { x: Math.cos(a0) * R, y: Math.sin(a0) * R, z: z * 1.25, sx: 0.32, sy: 0.32, sz: 0.32, color: BULBS[i % BULBS.length], k: 3.2 }, (i / SEG) * 4);
        wl.add(BASIC.box, { x: Math.cos(a0 + Math.PI / SEG) * R * 0.62, y: Math.sin(a0 + Math.PI / SEG) * R * 0.62, z: z * 1.25, sx: 0.24, sy: 0.24, sz: 0.24, color: BULBS[(i + 2) % BULBS.length], k: 2.6 }, 1 - (i / SEG) * 4);
      }
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      beam(wheel, [Math.cos(a) * R, Math.sin(a) * R, -1.6], [Math.cos(a) * R, Math.sin(a) * R, 1.6], 0.3, '#ffffff');
    }
    // Stern in der Nabe
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = i % 2 ? 1.2 : 3;
      wl.add(BASIC.box, { x: Math.cos(a) * r, y: Math.sin(a) * r, z: 1.9, sx: 0.5, sy: 0.5, sz: 0.2, color: '#ffd23d', k: 3 }, i % 2 ? 0 : 0.5);
    }
    const hub = new THREE.Group();
    hub.position.set(0, H, 0);
    fg.add(hub);
    add(wheel.build(), lambert(), hub);
    add(wl.build(), chase, hub);
    // Gondeln hängen immer senkrecht: eigene Instanzen, Lage je Bild berechnet
    const gb = new GeoBuilder();
    gb.add(BASIC.box, { x: 0, y: -2.2, z: 0, sx: 2.2, sy: 1.4, sz: 2.0, color: '#ffffff' });
    gb.add(BASIC.box, { x: 0, y: -1.0, z: 0, sx: 2.5, sy: 0.25, sz: 2.3, color: '#ffffff' });
    gb.add(BASIC.box, { x: 0, y: -0.5, z: 0, sx: 0.12, sy: 1.0, sz: 0.12, color: '#d8d2e6' });
    const gondGeo = gb.build();
    const NG = 16;
    const gondMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const gond = new THREE.InstancedMesh(gondGeo, gondMat, NG);
    const GC = ['#ff4f9e', '#ffd23d', '#2ce7ff', '#8a52ff', '#ff7a1f', '#7dff5a'];
    const tmpC = new THREE.Color();
    for (let i = 0; i < NG; i++) gond.setColorAt(i, tmpC.set(GC[i % GC.length]));
    gond.frustumCulled = false;
    fg.add(gond);
    const M = new THREE.Matrix4();
    const P = new THREE.Vector3();
    const I = new THREE.Quaternion();
    const S1 = new THREE.Vector3(1, 1, 1);
    updates.push((t) => {
      const th = t * 0.05;
      hub.rotation.z = th;
      for (let i = 0; i < NG; i++) {
        const a = th + (i / NG) * Math.PI * 2;
        P.set(Math.cos(a) * R, H + Math.sin(a) * R, 0);
        M.compose(P, I, S1);
        gond.setMatrixAt(i, M);
      }
      gond.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------- Karussell mit Pferden in der Tasche der S-Kurve ----------
  {
    const p = beside(0.53, 44);
    hubs.push({ x: p.x, z: p.z, r: 13 });
    take(p.x, p.z, 13);
    lawn(p.x, p.z, 14);
    const base = new GeoBuilder();
    base.add(BASIC.cyl24, { x: 0, y: 0.45, z: 0, sx: 10, sy: 0.9, sz: 10, color: '#ffe9a8', smooth: true });
    base.add(BASIC.cyl24, { x: 0, y: 0.95, z: 0, sx: 9.4, sy: 0.12, sz: 9.4, color: '#b0766a', smooth: true });
    const g0 = group(p.x, gy, p.z);
    add(base.build(), lambert(), g0);
    const spin = new THREE.Group();
    g0.add(spin);
    const top = new GeoBuilder();
    const tl = new Bulbs();
    top.add(BASIC.cyl24, { x: 0, y: 4.2, z: 0, sx: 1.4, sy: 6.6, sz: 1.4, color: '#ffd23d', smooth: true });
    // gestreiftes Kegeldach mit Zierkante
    const SEG = 24;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const c = i % 2 ? '#e8323c' : '#fff4ea';
      const A = [Math.cos(a0) * 10.4, 7.6, Math.sin(a0) * 10.4];
      const B = [Math.cos(a1) * 10.4, 7.6, Math.sin(a1) * 10.4];
      top.tri([0, 11.2, 0], B, A, c);
      top.tri([0, 7.6, 0], A, B, '#5a2a52');
      top.quad([B[0], 6.8, B[2]], [A[0], 6.8, A[2]], A, B, i % 2 ? '#ffd23d' : '#8a52ff');
      tl.add(BASIC.box, { x: A[0] * 1.01, y: 6.9, z: A[2] * 1.01, sx: 0.3, sy: 0.3, sz: 0.3, color: BULBS[i % BULBS.length], k: 3 }, (i / SEG) * 3);
    }
    top.add(BASIC.sphere, { x: 0, y: 11.5, z: 0, sx: 0.6, sy: 0.6, sz: 0.6, color: '#ffd23d', smooth: true });
    const NH = 12;
    for (let i = 0; i < NH; i++) {
      const a = (i / NH) * Math.PI * 2;
      top.add(BASIC.cyl8, { x: Math.cos(a) * 7.2, y: 3.9, z: Math.sin(a) * 7.2, sx: 0.09, sy: 5.8, sz: 0.09, color: '#ffd23d' });
    }
    add(top.build(), lambert(), spin);
    add(tl.build(), chase, spin);
    // Pferde: Rumpf, Hals, Kopf, Beine, Sattel – Instanzen wippen auf und ab
    const hb = new GeoBuilder();
    hb.add(BASIC.sphere, { x: 0, y: 0, z: 0, sx: 0.55, sy: 0.5, sz: 1.15, color: '#ffffff', smooth: true });
    beam(hb, [0, 0.2, 0.75], [0, 0.95, 1.05], 0.38, '#ffffff');
    hb.add(BASIC.box, { x: 0, y: 1.0, z: 1.35, sx: 0.36, sy: 0.38, sz: 0.75, color: '#ffffff' });
    hb.add(BASIC.box, { x: 0, y: 1.15, z: 0.85, sx: 0.12, sy: 0.6, sz: 0.5, color: '#ffd23d' });
    for (const [lx, lz, f] of [[-0.3, 0.6, 1], [0.3, 0.6, 1], [-0.3, -0.6, -1], [0.3, -0.6, -1]]) beam(hb, [lx, -0.2, lz], [lx, -1.05, lz + f * 0.35], 0.16, '#ffffff');
    hb.add(BASIC.box, { x: 0, y: 0.48, z: -0.05, sx: 0.62, sy: 0.12, sz: 0.7, color: '#e8323c' });
    beam(hb, [0, 0.2, -1.0], [0, -0.6, -1.45], 0.18, '#d8c4a0');
    const horses = new THREE.InstancedMesh(hb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), NH);
    const HC = ['#ffffff', '#ffd8ee', '#d8f2ff', '#fff2c4'];
    for (let i = 0; i < NH; i++) horses.setColorAt(i, new THREE.Color(HC[i % HC.length]));
    horses.frustumCulled = false;
    spin.add(horses);
    const M = new THREE.Matrix4();
    const P = new THREE.Vector3();
    const Q = new THREE.Quaternion();
    const S1 = new THREE.Vector3(1, 1, 1);
    updates.push((t) => {
      spin.rotation.y = t * 0.45;
      for (let i = 0; i < NH; i++) {
        const a = (i / NH) * Math.PI * 2;
        P.set(Math.cos(a) * 7.2, 3.0 + Math.sin(t * 2.2 + i * 1.3) * 0.45, Math.sin(a) * 7.2);
        // Pferde schauen in Drehrichtung
        Q.setFromAxisAngle(_y, -a + Math.PI);
        M.compose(P, Q, S1);
        horses.setMatrixAt(i, M);
      }
      horses.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------- Kettenkarussell außen an der Haarnadel ----------
  {
    const p = beside(0.38, 40);
    hubs.push({ x: p.x, z: p.z, r: 11 });
    take(p.x, p.z, 12);
    lawn(p.x, p.z, 12);
    solid.add(BASIC.cyl12, { x: p.x, y: gy + 7.5, z: p.z, sx: 0.8, sy: 15, sz: 0.8, color: '#f2eefc', smooth: true });
    solid.add(BASIC.cyl24, { x: p.x, y: gy + 0.3, z: p.z, sx: 6, sy: 0.6, sz: 6, color: '#ffe9a8', smooth: true });
    const g0 = group(p.x, gy + 15, p.z);
    const top = new GeoBuilder();
    const tl = new Bulbs();
    const SEG = 20;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const A = [Math.cos(a0) * 6, 0, Math.sin(a0) * 6];
      const B = [Math.cos(a1) * 6, 0, Math.sin(a1) * 6];
      top.tri([0, 2.6, 0], B, A, i % 2 ? '#1fa2ff' : '#fff4ea');
      top.tri([0, -0.2, 0], A, B, '#2a3a5a');
      top.quad([B[0], -0.6, B[2]], [A[0], -0.6, A[2]], A, B, '#ffd23d');
      tl.add(BASIC.box, { x: A[0] * 1.02, y: -0.4, z: A[2] * 1.02, sx: 0.28, sy: 0.28, sz: 0.28, color: BULBS[i % BULBS.length], k: 3 }, (i / SEG) * 2);
    }
    // Ketten + Sitze, im Flug um 35° nach außen geneigt
    const NS = 16;
    for (let i = 0; i < NS; i++) {
      const a = (i / NS) * Math.PI * 2;
      const ox = Math.cos(a);
      const oz = Math.sin(a);
      const r0 = 5.2;
      const len = 6.5;
      const tilt = 0.6;
      const tip = [ox * (r0 + Math.sin(tilt) * len), -0.4 - Math.cos(tilt) * len, oz * (r0 + Math.sin(tilt) * len)];
      beam(top, [ox * r0, -0.4, oz * r0], tip, 0.06, '#c8c8d4');
      top.add(BASIC.box, { x: tip[0], y: tip[1] - 0.3, z: tip[2], ry: -a, sx: 0.7, sy: 0.25, sz: 0.8, color: AWNINGS[i % AWNINGS.length][0] });
    }
    add(top.build(), lambert(), g0);
    add(tl.build(), chase, g0);
    updates.push((t) => (g0.rotation.y = -t * 0.9));
  }

  // ---------- Freifallturm außen an der Ostkurve: Sitzring fährt langsam hoch und fällt ----------
  {
    const p = beside(0.7, 34);
    const H = 48;
    hubs.push({ x: p.x, z: p.z, r: 7 });
    take(p.x, p.z, 8);
    lawn(p.x, p.z, 9);
    solid.add(BASIC.box, { x: p.x, y: gy + H / 2, z: p.z, sx: 2.6, sy: H, sz: 2.6, color: '#2a2440' });
    for (let y = 4; y < H; y += 4) solid.add(BASIC.box, { x: p.x, y: gy + y, z: p.z, sx: 2.9, sy: 0.25, sz: 2.9, color: '#ff4f9e' });
    solid.add(BASIC.cyl12, { x: p.x, y: gy + H + 1.2, z: p.z, sx: 2.2, sy: 2.4, sz: 2.2, color: '#ffd23d', smooth: true });
    for (let i = 0; i < 4; i++) blink(p.x + (i % 2 ? 1.6 : -1.6), gy + H + 2.6, p.z + (i < 2 ? 1.6 : -1.6), 0.45, '#ff2a3a');
    for (let y = 6; y < H; y += 3) glow.add(BASIC.box, { x: p.x, y: gy + y, z: p.z, sx: 2.7, sy: 0.18, sz: 2.7, color: '#ffd27a', k: 2.2 });
    const rb = new GeoBuilder();
    rb.add(BASIC.cyl24, { x: 0, y: 0, z: 0, sx: 3.6, sy: 1.2, sz: 3.6, color: '#8a52ff', smooth: true });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rb.add(BASIC.box, { x: Math.cos(a) * 4.1, y: -0.2, z: Math.sin(a) * 4.1, ry: -a, sx: 0.9, sy: 1.0, sz: 0.7, color: i % 2 ? '#ffd23d' : '#ff4f9e' });
    }
    const ring = group(p.x, gy + 3, p.z);
    add(rb.build(), lambert(), ring);
    updates.push((t) => {
      const c = t % 14;
      let k;
      if (c < 8) k = 0.5 - 0.5 * Math.cos((Math.PI * c) / 8); // langsam hoch
      else if (c < 10) k = 1; // oben warten
      else if (c < 11.1) k = 1 - ((c - 10) / 1.1) ** 2; // freier Fall
      else k = 0;
      ring.position.y = gy + 3 + k * (H - 6);
    });
  }

  // ---------- Achterbahn im unteren Infield mit fahrendem Zug ----------
  {
    const c = beside(0.62, -62);
    const ax = Math.sin(c.h);
    const az = Math.cos(c.h);
    const RX = 40;
    const RZ = 22;
    take(c.x, c.z, 42);
    const NP = 180;
    const pts = [];
    for (let i = 0; i < NP; i++) {
      const u = i / NP;
      const a = u * Math.PI * 2;
      const lx = Math.cos(a) * RX;
      const lz = Math.sin(a) * RZ * (1 + 0.25 * Math.sin(a * 2));
      // hoher Lifthügel, steile Abfahrt, zwei kleinere Kamelbuckel
      const y = gy + 13 + 9.5 * Math.sin(a) + 4 * Math.sin(3 * a + 1);
      // lokale Ellipse in Fahrtrichtung der nahen Bahn ausrichten
      pts.push(new THREE.Vector3(c.x + ax * lx - az * lz, Math.max(gy + 1.6, y), c.z + az * lx + ax * lz));
    }
    // Länge entlang des Pfads
    const cum = [0];
    for (let i = 1; i <= NP; i++) cum.push(cum[i - 1] + pts[i % NP].distanceTo(pts[i - 1]));
    const total = cum[NP];
    const cb = new GeoBuilder();
    const side = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const rail = (i, s) => {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % NP];
      tmp.subVectors(p1, p0).normalize();
      side.set(-tmp.z, 0, tmp.x).normalize().multiplyScalar(s);
      return [p0.x + side.x, p0.y, p0.z + side.z];
    };
    for (let i = 0; i < NP; i++) {
      const j = (i + 1) % NP;
      for (const s of [-0.62, 0.62]) beam(cb, rail(i, s), rail(j, s), 0.2, '#e8323c');
      if (i % 2 === 0) beam(cb, rail(i, -0.7), rail(i, 0.7), 0.16, '#5a2a52', 1, 0.16);
      if (i % 5 === 0) {
        const p0 = pts[i];
        beam(cb, [p0.x, gy, p0.z], [p0.x, p0.y - 0.15, p0.z], 0.34, '#f2eefc');
        if (p0.y - gy > 8) beam(cb, [p0.x - 1.6, gy, p0.z - 1.6], [p0.x, p0.y * 0.5 + gy * 0.5, p0.z], 0.16, '#f2eefc');
        glow.add(BASIC.box, { x: p0.x, y: p0.y - 0.35, z: p0.z, sx: 0.25, sy: 0.25, sz: 0.25, color: BULBS[i % BULBS.length], k: 2.6 });
      }
    }
    const cm = add(cb.build(), lambert());
    meshes.push(cm);
    // Station
    {
      const p0 = pts[Math.round(NP * 0.75)];
      solid.add(BASIC.box, { x: p0.x, y: gy + 1, z: p0.z, sx: 6, sy: 2, sz: 6, color: '#8a52ff' });
      hubs.push({ x: p0.x, z: p0.z, r: 5 });
    }
    // Zug: 4 Wagen; Tempo nach Höhe (unten schnell, oben langsam), Lage am Pfad entlang
    const wb = new GeoBuilder();
    wb.add(BASIC.box, { x: 0, y: 0.45, z: 0, sx: 1.5, sy: 0.7, sz: 2.2, color: '#ffffff' });
    wb.add(BASIC.box, { x: 0, y: 1.0, z: -0.75, sx: 1.4, sy: 0.6, sz: 0.25, color: '#2a2440' });
    wb.add(BASIC.box, { x: 0, y: 0.15, z: 0, sx: 1.6, sy: 0.2, sz: 2.3, color: '#2a2440' });
    const NW = 4;
    const cars = new THREE.InstancedMesh(wb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), NW);
    const WC = ['#ffd23d', '#2ce7ff', '#ff4f9e', '#7dff5a'];
    for (let i = 0; i < NW; i++) cars.setColorAt(i, new THREE.Color(WC[i]));
    cars.frustumCulled = false;
    meshes.push(cars);
    let yMax = -Infinity;
    for (const q of pts) yMax = Math.max(yMax, q.y);
    const at = (s, out) => {
      s = ((s % total) + total) % total;
      let i = 0;
      let lo = 0;
      let hi = NP;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= s) lo = mid;
        else hi = mid;
      }
      i = lo;
      const f = (s - cum[i]) / Math.max(1e-4, cum[i + 1] - cum[i]);
      return out.lerpVectors(pts[i], pts[(i + 1) % NP], f);
    };
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const S1 = new THREE.Vector3(1, 1, 1);
    const Z = new THREE.Vector3(0, 0, 1);
    let s = 0;
    let last = null;
    updates.push((t) => {
      const dt = last == null ? 0 : Math.min(0.1, Math.max(0, t - last));
      last = t;
      at(s, A);
      s += Math.max(5, Math.sqrt(Math.max(0, 2 * 9.8 * (yMax + 1.5 - A.y)))) * dt;
      for (let k = 0; k < NW; k++) {
        at(s - k * 2.5, A);
        at(s - k * 2.5 + 1.0, B);
        B.sub(A).normalize();
        Q.setFromUnitVectors(Z, B);
        A.y += 0.15;
        M.compose(A, Q, S1);
        cars.setMatrixAt(k, M);
      }
      cars.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------- Zirkuszelt über der Gegengeraden: die Bahn fährt hindurch ----------
  if (track.def.tent != null) {
    const sC = track.def.tent * L;
    const c = track.posAt(sC, 0, {});
    const R = 22;
    const yT = c.y; // Bahnhöhe in der Zeltmitte (flach)
    const wallTop = yT + 9;
    const door = yT + 6.2; // Oberkante der Durchfahrt
    const apex = yT + 24;
    const tx = c.tx;
    const tz = c.tz;
    const half = Math.asin(Math.min(0.95, (track.hw[track.indexAt(sC)] + RW + 2.2) / R));
    const aIn = Math.atan2(-tz, -tx);
    const aOut = Math.atan2(tz, tx);
    const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const inDoor = (a) => angDist(a, aIn) < half || angDist(a, aOut) < half;
    take(c.x, c.z, R + 2);
    hubs.push({ x: c.x, z: c.z, r: R + 1 });
    const tb = new GeoBuilder();
    const tl = new Bulbs();
    const SEG = 64;
    const P = (a, r, y) => [c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r];
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const col = Math.floor(i / 2) % 2 ? '#e8323c' : '#fff4ea';
      const inner = Math.floor(i / 2) % 2 ? '#7a1a24' : '#8a7e86';
      const y0 = inDoor(am) ? door : gy;
      // Wand außen (nach außen gewendet) + innen (nach innen gewendet)
      tb.quad(P(a1, R, y0), P(a0, R, y0), P(a0, R, wallTop), P(a1, R, wallTop), col);
      tb.quad(P(a0, R - 0.05, y0), P(a1, R - 0.05, y0), P(a1, R - 0.05, wallTop), P(a0, R - 0.05, wallTop), inner);
      // Zackenkante (Volant) unter dem Dachrand
      tb.tri(P(a0, R + 0.6, wallTop), P(am, R + 0.6, wallTop - 1.1), P(a1, R + 0.6, wallTop), i % 2 ? '#ffd23d' : '#8a52ff');
      tb.tri(P(a1, R + 0.6, wallTop), P(am, R + 0.6, wallTop - 1.1), P(a0, R + 0.6, wallTop), i % 2 ? '#ffd23d' : '#8a52ff');
      // Kegeldach außen + innen
      tb.tri(P(a1, R + 0.6, wallTop), P(a0, R + 0.6, wallTop), [c.x, apex, c.z], col);
      tb.tri(P(a0, R + 0.4, wallTop - 0.05), P(a1, R + 0.4, wallTop - 0.05), [c.x, apex - 0.1, c.z], inner);
      // Sturz über den Durchfahrten mit Glühbirnen
      if (inDoor(am)) {
        tb.quad(P(a1, R - 0.06, door - 0.4), P(a0, R - 0.06, door - 0.4), P(a0, R - 0.06, door), P(a1, R - 0.06, door), '#ffd23d');
        tb.quad(P(a0, R + 0.01, door - 0.4), P(a1, R + 0.01, door - 0.4), P(a1, R + 0.01, door), P(a0, R + 0.01, door), '#ffd23d');
        tl.add(BASIC.box, { x: c.x + Math.cos(am) * (R + 0.15), y: door - 0.2, z: c.z + Math.sin(am) * (R + 0.15), sx: 0.26, sy: 0.26, sz: 0.26, color: BULBS[i % BULBS.length], k: 3.2 }, i * 0.25);
      }
      // Lichterketten von der Spitze zum Wandrand (innen)
      if (i % 4 === 0) {
        const q0 = [c.x, apex - 1.5, c.z];
        const q1 = P(a0, R - 0.6, wallTop - 0.3);
        for (let k = 1; k < 12; k++) {
          const f = k / 12;
          tl.add(BASIC.box, { x: q0[0] + (q1[0] - q0[0]) * f, y: q0[1] + (q1[1] - q0[1]) * f - Math.sin(f * Math.PI) * 1.2, z: q0[2] + (q1[2] - q0[2]) * f, sx: 0.22, sy: 0.22, sz: 0.22, color: BULBS[(k + i) % BULBS.length], k: 3 }, f * 1.5);
        }
      }
    }
    // Fahne auf der Spitze
    beam(tb, [c.x, apex - 0.5, c.z], [c.x, apex + 3.2, c.z], 0.14, '#d8d2e6');
    tb.tri([c.x, apex + 3.1, c.z], [c.x + 1.8, apex + 2.6, c.z], [c.x, apex + 2.1, c.z], '#ff4f9e');
    tb.tri([c.x, apex + 3.1, c.z], [c.x, apex + 2.1, c.z], [c.x + 1.8, apex + 2.6, c.z], '#ff4f9e');
    // Manege am Boden unter der Bahn, Zuschauerränge an der Innenwand, zwei Zeltmasten neben der Bahn
    tb.add(BASIC.cyl24, { x: c.x, y: gy + 0.1, z: c.z, sx: 10, sy: 0.2, sz: 10, color: '#d8b070', smooth: true });
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      tb.add(BASIC.box, { x: c.x + Math.cos(a) * 10.2, y: gy + 0.4, z: c.z + Math.sin(a) * 10.2, ry: -a, sx: 0.5, sy: 0.6, sz: 2.1, color: i % 2 ? '#e8323c' : '#fff4ea' });
    }
    for (let i = 0; i < 48; i++) {
      const am = ((i + 0.5) / 48) * Math.PI * 2;
      if (inDoor(am) || angDist(am, aIn) < half + 0.12 || angDist(am, aOut) < half + 0.12) continue;
      for (let row = 0; row < 3; row++) {
        const r = R - 1.6 - row * 1.5;
        tb.add(BASIC.box, { x: c.x + Math.cos(am) * r, y: gy + 0.6 + row * 1.1, z: c.z + Math.sin(am) * r, ry: -am, sx: 1.3, sy: 1.2 + row * 2.2, sz: 3.0, color: row % 2 ? '#5a2a52' : '#7a3a6a' });
      }
    }
    for (const sd of [-1, 1]) {
      const m = track.posAt(sC, sd * (track.hw[track.indexAt(sC)] + RW + 3.2), {});
      beam(tb, [m.x, gy, m.z], [m.x, apex - 3, m.z], 0.55, '#d8d2e6');
      tl.add(BASIC.box, { x: m.x, y: yT + 8, z: m.z, sx: 0.8, sy: 0.5, sz: 0.8, color: '#fff4d6', k: 3.5 }, 0.3);
    }
    const tent = add(tb.build(), lambert());
    tent.castShadow = true;
    tent.receiveShadow = true;
    meshes.push(tent);
    const tentLights = add(tl.build(), chase);
    meshes.push(tentLights);
  }

  // ---------- Wege zwischen den Fahrgeschäften: Laternen, Bänke, Blumenbeete, Warteschlangen ----------
  {
    const PW = 4; // Wegbreite
    const pairs = new Set();
    const segs = [];
    hubs.forEach((a, i) => {
      const near = hubs.map((b, j) => ({ j, d: Math.hypot(b.x - a.x, b.z - a.z) })).filter((o) => o.j !== i).sort((u, v) => u.d - v.d);
      for (const o of near.slice(0, 2)) pairs.add(i < o.j ? i + ',' + o.j : o.j + ',' + i);
    });
    for (const key of pairs) {
      const [i, j] = key.split(',').map(Number);
      const a = hubs[i];
      const b = hubs[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < a.r + b.r + 8 || len > 260) continue;
      const ux = dx / len;
      const uz = dz / len;
      const s0 = a.r + 1;
      const s1 = len - b.r - 1;
      // nicht durch andere Fahrgeschäfte
      let clear = true;
      for (let s = s0; s <= s1 && clear; s += 3) {
        const x = a.x + ux * s;
        const z = a.z + uz * s;
        if (hubs.some((h, k) => k !== i && k !== j && Math.hypot(h.x - x, h.z - z) < h.r + PW)) clear = false;
      }
      if (!clear) continue;
      segs.push({ ax: a.x + ux * s0, az: a.z + uz * s0, bx: a.x + ux * s1, bz: a.z + uz * s1, ux, uz, len: s1 - s0 });
    }
    for (const g of segs) {
      const nx = -g.uz * (PW / 2);
      const nz = g.ux * (PW / 2);
      const Y = gy + 0.03;
      solid.quad([g.ax + nx, Y, g.az + nz], [g.bx + nx, Y, g.bz + nz], [g.bx - nx, Y, g.bz - nz], [g.ax - nx, Y, g.az - nz], '#d9c3a0');
      solid.quad([g.ax - nx, Y, g.az - nz], [g.bx - nx, Y, g.bz - nz], [g.bx + nx, Y, g.bz + nz], [g.ax + nx, Y, g.az + nz], '#d9c3a0');
      // Wegkante
      for (const e of [-1, 1]) {
        beam(solid, [g.ax + nx * e * 1.05, gy + 0.08, g.az + nz * e * 1.05], [g.bx + nx * e * 1.05, gy + 0.08, g.bz + nz * e * 1.05], 0.2, '#a8927a');
      }
      for (let s = 2; s < g.len; s += 3) take(g.ax + g.ux * s, g.az + g.uz * s, 2.4);
      // Laternen (abwechselnd links/rechts), Bänke, Mülleimer
      let side = 1;
      for (let s = 6; s < g.len - 4; s += 15, side = -side) {
        const x = g.ax + g.ux * s - g.uz * side * 2.7;
        const z = g.az + g.uz * s + g.ux * side * 2.7;
        if (blocked(x, z, 0.5)) continue;
        solid.add(BASIC.cyl8, { x, y: gy + 2.1, z, sx: 0.09, sy: 4.2, sz: 0.09, color: '#2a2440' });
        solid.add(BASIC.cone7, { x, y: gy + 4.55, z, sx: 0.42, sy: 0.35, sz: 0.42, color: '#2a2440' });
        glow.add(BASIC.sphere, { x, y: gy + 4.2, z, sx: 0.3, sy: 0.36, sz: 0.3, color: '#ffe2a8', k: 3.2, smooth: true });
        if (s + 7 < g.len - 4) {
          const bx = g.ax + g.ux * (s + 7) - g.uz * side * 2.6;
          const bz = g.az + g.uz * (s + 7) + g.ux * side * 2.6;
          const ry = Math.atan2(g.ux, g.uz);
          solid.box(bx, gy + 0.45, bz, 1.8, 0.1, 0.5, '#b98d63', 1, ry);
          solid.box(bx - g.uz * side * 0.25, gy + 0.75, bz + g.ux * side * 0.25, 1.8, 0.45, 0.08, '#b98d63', 1, ry);
          for (const e of [-0.75, 0.75]) solid.box(bx + g.ux * e, gy + 0.22, bz + g.uz * e, 0.08, 0.45, 0.45, '#2a2440', 1, ry);
        }
      }
      // Spaziergänger auf diesem Weg
      const nw = Math.max(1, Math.round((g.len / 22) * Math.min(1, det)));
      for (let i = 0; i < nw; i++) walkers.push({ g, s: rnd() * g.len, v: (0.9 + rnd() * 0.7) * (rnd() < 0.5 ? -1 : 1), off: (rnd() - 0.5) * 2.4, ph: rnd() * 10, sc: 0.85 + rnd() * 0.3 });
    }
    // Blumenbeete und Warteschlangen an den Fahrgeschäften (Richtung: zum nächsten Weg)
    const FLOWERS = ['#ff5fa8', '#ffd23d', '#ffffff', '#ff4a4a', '#c8a8ff'];
    hubs.forEach((h, i) => {
      const g = segs.find((q) => Math.hypot(q.ax - h.x, q.az - h.z) < h.r + 3 || Math.hypot(q.bx - h.x, q.bz - h.z) < h.r + 3);
      let ux;
      let uz;
      if (g) {
        const fromA = Math.hypot(g.ax - h.x, g.az - h.z) < h.r + 3;
        ux = fromA ? g.ux : -g.ux;
        uz = fromA ? g.uz : -g.uz;
      } else {
        const a = rnd() * Math.PI * 2;
        ux = Math.cos(a);
        uz = Math.sin(a);
      }
      // Beet neben dem Weganfang
      const bx = h.x + ux * (h.r + 3) - uz * 4.4;
      const bz = h.z + uz * (h.r + 3) + ux * 4.4;
      if (!blocked(bx, bz, 1.8)) {
        solid.add(BASIC.cyl24, { x: bx, y: gy + 0.2, z: bz, sx: 1.7, sy: 0.4, sz: 1.7, color: '#a8927a', smooth: true });
        solid.add(BASIC.cyl24, { x: bx, y: gy + 0.42, z: bz, sx: 1.5, sy: 0.06, sz: 1.5, color: '#5a3a2a', smooth: true });
        for (let k = 0; k < 14; k++) {
          const a = rnd() * Math.PI * 2;
          const r = Math.sqrt(rnd()) * 1.25;
          solid.add(BASIC.sphere, { x: bx + Math.cos(a) * r, y: gy + 0.62, z: bz + Math.sin(a) * r, sx: 0.16, sy: 0.16, sz: 0.16, color: FLOWERS[k % FLOWERS.length] });
        }
      }
      // Warteschlange: Reihe am Weg, mit Absperrband-Pfosten
      if (i === hubs.length - 1) return; // Zelt: keine Schlange
      const q0 = h.r + 1.2;
      for (let k = 0; k < 7; k++) {
        const x = h.x + ux * (q0 + k * 0.9) + uz * 1.2;
        const z = h.z + uz * (q0 + k * 0.9) - ux * 1.2;
        if (rnd() < 0.85) waiting.push([x, z, 0.85 + rnd() * 0.3]);
        if (k % 2 === 0) solid.add(BASIC.cyl8, { x: x + uz * 0.7, y: gy + 0.45, z: z - ux * 0.7, sx: 0.06, sy: 0.9, sz: 0.06, color: '#d8c070' });
      }
      beam(solid, [h.x + ux * q0 + uz * 1.9, gy + 0.85, h.z + uz * q0 - ux * 1.9], [h.x + ux * (q0 + 6) + uz * 1.9, gy + 0.85, h.z + uz * (q0 + 6) - ux * 1.9], 0.05, '#e8323c');
    });
  }

  // ---------- Lichterketten quer über die Bahn ----------
  {
    const busy = (s) =>
      track.pads.some((pd) => Math.abs(track.deltaS(pd.s - pd.len / 2, s)) < 8) ||
      track.jumps.some((j) => Math.abs(track.deltaS(j.s, s)) < 45) ||
      (track.def.tent != null && Math.abs(track.deltaS(track.def.tent * L, s)) < 38) ||
      s > L - 70 ||
      s < 25;
    const Q = {};
    for (let s = 30; s < L; s += det > 0.8 ? 38 : 60) {
      if (busy(s)) continue;
      const k = track.indexAt(s);
      if (track.crossing[k]) continue;
      const hw = track.hw[k] + RW * 0.5;
      const a = track.posAt(s, -hw, {});
      const b = track.posAt(s, hw, Q);
      if (!free(a.x, a.z, 0.8) || !free(b.x, b.z, 0.8)) continue;
      const top = RH + 8.2;
      for (const p of [a, b]) {
        solid.add(BASIC.cyl8, { x: p.x, y: p.y + RH + top / 2 - RH / 2, z: p.z, sx: 0.14, sy: top - RH, sz: 0.14, color: '#2a2440' });
        solid.add(BASIC.sphere, { x: p.x, y: p.y + top + 0.1, z: p.z, sx: 0.25, sy: 0.25, sz: 0.25, color: '#ffd23d', smooth: true });
      }
      const NB = 22;
      let prev = null;
      for (let i = 0; i <= NB; i++) {
        const f = i / NB;
        const pt = [a.x + (b.x - a.x) * f, a.y + top + (b.y - a.y) * f - Math.sin(f * Math.PI) * 1.6, a.z + (b.z - a.z) * f];
        if (prev) beam(solid, prev, pt, 0.04, '#2a2440');
        if (i > 0 && i < NB) glow.add(BASIC.box, { x: pt[0], y: pt[1] - 0.18, z: pt[2], sx: 0.24, sy: 0.3, sz: 0.24, color: BULBS[(i + Math.floor(s)) % BULBS.length], k: 3.2 });
        prev = pt;
      }
    }
  }

  // ---------- Buden mit gestreiften Markisen, zur Bahn gedreht ----------
  {
    let placed = 0;
    for (let tries = 0; tries < 1500 && placed < n(22); tries++) {
      const s = rnd() * L;
      const k = track.indexAt(s);
      const sd = rnd() < 0.5 ? -1 : 1;
      const p = track.posAt(s, sd * (track.hw[k] + 11 + rnd() * 10), {});
      const dd = grid.dist(p.x, p.z);
      if (dd < 9 || !free(p.x, p.z, 4.5)) continue;
      take(p.x, p.z, 4.5);
      placed++;
      // Vorderseite zur Bahn
      const ry = Math.atan2(-p.nx * sd, -p.nz * sd);
      const [c1, c2] = AWNINGS[Math.floor(rnd() * AWNINGS.length)];
      const cs = Math.cos(ry);
      const sn = Math.sin(ry);
      const W = (lx, ly, lz) => [p.x + lx * cs + lz * sn, gy + ly, p.z - lx * sn + lz * cs];
      solid.box(p.x - sn * 0.3, gy + 1.5, p.z - cs * 0.3, 4.2, 3.0, 3.2, '#fff4ea', 1, ry);
      solid.box(p.x + sn * 1.45, gy + 0.6, p.z + cs * 1.45, 4.2, 1.2, 0.4, c1, 1, ry);
      // Markise: Streifen, schräg nach vorn
      for (let i = 0; i < 8; i++) {
        const x0 = -2.3 + i * 0.575;
        const x1 = x0 + 0.575;
        const col = i % 2 ? c2 : c1;
        solid.quad(W(x0, 3.4, 1.2), W(x1, 3.4, 1.2), W(x1, 2.7, 2.6), W(x0, 2.7, 2.6), col);
        solid.quad(W(x1, 3.4, 1.2), W(x0, 3.4, 1.2), W(x0, 2.7, 2.6), W(x1, 2.7, 2.6), col);
        solid.tri(W(x0, 2.7, 2.6), W(x1, 2.7, 2.6), W((x0 + x1) / 2, 2.35, 2.62), col);
        glow.add(BASIC.box, { x: W((x0 + x1) / 2, 2.3, 2.64)[0], y: gy + 2.3, z: W((x0 + x1) / 2, 2.3, 2.64)[2], sx: 0.18, sy: 0.18, sz: 0.18, color: BULBS[i % BULBS.length], k: 3 });
      }
      // Schild auf dem Dach
      solid.box(p.x - sn * 0.2, gy + 3.9, p.z - cs * 0.2, 3.0, 0.9, 0.2, c1, 1, ry);
      glow.add(BASIC.box, { x: W(0, 3.9, -0.05)[0], y: gy + 3.9, z: W(0, 3.9, -0.05)[2], ry, sx: 2.4, sy: 0.35, sz: 0.25, color: '#fff4d6', k: 2.2 });
      // Kundschaft vor der Theke
      for (let i = 0; i < 2; i++) if (rnd() < 0.7) {
        const q = W(-0.9 + i * 1.6 + (rnd() - 0.5) * 0.4, 0, 2.9 + rnd() * 0.5);
        waiting.push([q[0], q[2], 0.85 + rnd() * 0.3]);
      }
      // Ware: bunte Kugeln (Zuckerwatte, Ballons, Bonbons) auf der Theke
      for (let i = 0; i < 4; i++) {
        const q = W(-1.4 + i * 0.95, 1.45, 1.4);
        solid.add(BASIC.sphere, { x: q[0], y: q[1], z: q[2], sx: 0.32, sy: 0.32, sz: 0.32, color: ['#ffb8e0', '#9fe8ff', '#ffe08a', '#c8a8ff'][i], smooth: true });
      }
    }
  }

  // ---------- Bäume, Hecken und Rasen ----------
  {
    let placed = 0;
    const leaf = ['#3f8f3c', '#4fa046', '#2f7a36', '#5aab4a'];
    for (let tries = 0; tries < 3000 && placed < n(70); tries++) {
      const b = track.bounds;
      const x = b.minX - 120 + rnd() * (b.maxX - b.minX + 240);
      const z = b.minZ - 120 + rnd() * (b.maxZ - b.minZ + 240);
      const dd = grid.dist(x, z);
      if (dd < 12 || !free(x, z, 3.5)) continue;
      take(x, z, 3.5);
      placed++;
      const s = 0.8 + rnd() * 0.7;
      lawn(x, z, 4.5 * s);
      solid.add(BASIC.cyl8, { x, y: gy + 2.2 * s, z, sx: 0.4 * s, sy: 4.4 * s, sz: 0.4 * s, color: '#6a4a3a' });
      const c = leaf[Math.floor(rnd() * leaf.length)];
      solid.add(BASIC.ico1, { x, y: gy + 5.4 * s, z, sx: 2.8 * s, sy: 2.6 * s, sz: 2.8 * s, ry: rnd() * 6, color: c });
      solid.add(BASIC.ico1, { x: x + 1.2 * s, y: gy + 6.6 * s, z: z - 0.6 * s, sx: 1.9 * s, sy: 1.8 * s, sz: 1.9 * s, ry: rnd() * 6, color: c });
      // manche Bäume mit Lichterkette um die Krone
      if (rnd() < 0.35) for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        glow.add(BASIC.box, { x: x + Math.cos(a) * 2.7 * s, y: gy + (4.6 + (i % 3) * 0.6) * s, z: z + Math.sin(a) * 2.7 * s, sx: 0.2, sy: 0.2, sz: 0.2, color: '#ffd27a', k: 3 });
      }
    }
  }

  // ---------- Besucher: Wartende hüpfen ungeduldig (Tribünen-Shader), Spaziergänger laufen auf den Wegen ----------
  {
    const bodyGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.82, 10).translate(0, 0.41, 0);
    const headGeo = new THREE.SphereGeometry(0.22, 12, 8).translate(0, 1.05, 0);
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const V = new THREE.Vector3();
    const S = new THREE.Vector3();
    const C = new THREE.Color();
    if (waiting.length) {
      const uTime = { value: 0 };
      const mat = crowdMaterial(uTime, { value: 0 });
      const bodies = new THREE.InstancedMesh(bodyGeo, mat, waiting.length);
      const heads = new THREE.InstancedMesh(headGeo, mat, waiting.length);
      waiting.forEach(([x, z, s], i) => {
        M.compose(V.set(x, gy + 0.03, z), Q, S.setScalar(s));
        bodies.setMatrixAt(i, M);
        heads.setMatrixAt(i, M);
        bodies.setColorAt(i, C.set(BODY_COLS[Math.floor(rnd() * BODY_COLS.length)]));
        heads.setColorAt(i, C.set(SKIN[Math.floor(rnd() * SKIN.length)]));
      });
      bodies.frustumCulled = false;
      heads.frustumCulled = false;
      meshes.push(bodies, heads);
      updates.push((t) => (uTime.value = t));
    }
    if (walkers.length) {
      const mat = new THREE.MeshLambertMaterial();
      const bodies = new THREE.InstancedMesh(bodyGeo.clone(), mat, walkers.length);
      const heads = new THREE.InstancedMesh(headGeo.clone(), mat, walkers.length);
      walkers.forEach((w, i) => {
        bodies.setColorAt(i, C.set(BODY_COLS[Math.floor(rnd() * BODY_COLS.length)]));
        heads.setColorAt(i, C.set(SKIN[Math.floor(rnd() * SKIN.length)]));
      });
      bodies.frustumCulled = false;
      heads.frustumCulled = false;
      meshes.push(bodies, heads);
      let last = null;
      updates.push((t) => {
        const dt = last == null ? 0 : Math.min(0.1, Math.max(0, t - last));
        last = t;
        walkers.forEach((w, i) => {
          w.s += w.v * dt;
          // am Wegende umdrehen
          if (w.s < 0 || w.s > w.g.len) {
            w.v = -w.v;
            w.s = Math.max(0, Math.min(w.g.len, w.s));
          }
          const g = w.g;
          const x = g.ax + g.ux * w.s - g.uz * w.off;
          const z = g.az + g.uz * w.s + g.ux * w.off;
          const bob = Math.abs(Math.sin(t * 7 + w.ph)) * 0.08;
          M.compose(V.set(x, gy + 0.03 + bob, z), Q, S.setScalar(w.sc));
          bodies.setMatrixAt(i, M);
          heads.setMatrixAt(i, M);
        });
        bodies.instanceMatrix.needsUpdate = true;
        heads.instanceMatrix.needsUpdate = true;
      });
    }
  }

  // ---------- Feuerwerk am Abendhimmel ----------
  {
    let next = 2;
    updates.push((t, camera, focus, P) => {
      if (!P || !focus || t < next) return;
      next = t + 1.6 + Math.random() * 2.8;
      // vor der Kamera, weit weg und hoch
      if (camera) camera.getWorldDirection(_fw);
      else _fw.set(0, 0, 1);
      const fl = Math.hypot(_fw.x, _fw.z) || 1;
      const fx = _fw.x / fl;
      const fz = _fw.z / fl;
      const dist = 110 + Math.random() * 90;
      const x = focus.x + fx * dist + (Math.random() - 0.5) * 120;
      const z = focus.z + fz * dist + (Math.random() - 0.5) * 120;
      const y = gy + 55 + Math.random() * 35;
      const col = FIREWORK[Math.floor(Math.random() * FIREWORK.length)];
      P.burst(x, y, z, 90, 26, 1.6, 2.2, col, 3.6, 4);
      // Knall mit Schall-Laufzeit (343 m/s), leiser in der Ferne
      if (sfx && camera) {
        const dd = camera.position.distanceTo(_fw.set(x, y, z));
        sfx('firework', Math.min(1, 140 / dd), dd / 343);
      }
      if (Math.random() < 0.5) P.burst(x, y, z, 40, 13, 1.3, 1.6, FIREWORK[Math.floor(Math.random() * FIREWORK.length)], 3.6, 4);
    });
  }
}
