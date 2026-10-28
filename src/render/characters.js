// Fahrerfiguren: acht eigene Spielzeug-Charaktere mit großem Kopf.
// Aufbau: root (Hüfte auf dem Sitz) > Körper, Kopf-Gruppe (Hals), zwei Arm-Gruppen (Schulter) – getrennt animierbar.
// +z = Blickrichtung, Einheiten in Metern.

import * as THREE from 'three';
import { GeoBuilder, BASIC } from './geo.js';

const R = 0.42; // Kopfradius (Cartoon-Proportionen)
const HEAD_Y = 1.24; // Kopfmitte über der Hüfte
const SHOULDER = [0.36, 0.7, 0.02];
const DARK = '#22202a';
const WHITE = '#f6f6fa';

// Material-Zuordnung [Rauheit, Metall]
// 3. Wert = Materialklasse der Feinstruktur (3 Metall gebürstet, 4 Lack mit Flakes, 6 Leder, 7 Haar)
const PBR = {
  '#c8d0e0': [0.18, 0.85, 3],
  '#b8c0cc': [0.22, 0.8, 3],
  '#c89a4a': [0.25, 0.85],
  '#ffd21f': [0.25, 0.1, 4],
  '#2f7fd8': [0.25, 0.1, 4],
  '#3b2470': [0.3, 0.1, 4],
  [DARK]: [0.35, 0.1],
  '#141418': [0.08, 0.3],
  '#7a4a2a': [0.55, 0.02, 6],
  '#ff5fb5': [0.5, 0.02, 7],
};

// Teil-Kugel-Schale (Helm), Gesichtsöffnung vorne (phi um π/2) ausgespart
function shell(b, r, color, { open = 0.82, brow = 0.95, chin = 2.25, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const back = new THREE.SphereGeometry(r, 30, 18, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, chin);
  const top = new THREE.SphereGeometry(r, 12, 10, Math.PI / 2 - open, open * 2, 0, brow);
  b.add(back, { x, y, z, sx, sy, sz, color, smooth: true });
  b.add(top, { x, y, z, sx, sy, sz, color, smooth: true });
  back.dispose();
  top.dispose();
}

// Hautfarbe des zuletzt gebauten Gesichts (für die Augenlider beim Blinzeln)
let lastFace = null;
const LID_GEO = new THREE.SphereGeometry(1, 16, 10);
// Lidschale: Halbkugel (Pol +y), wird um die Augen-Querachse gedreht – offen liegt sie hinten im Kopf
const LID_DOME = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const lidMats = new Map();

// Gesicht: große Augen mit Glanzpunkt, Brauen, Nase, Bäckchen (der Mund ist ein eigenes Mimik-Rig, siehe buildDriver)
function face(b, { skin, iris = '#2a2a3a', brow = DARK, grin = false, cool = false, lashes = false, mouthY = -0.16 } = {}) {
  lastFace = { skin, mouthY, grin };
  for (const sx of [-1, 1]) {
    b.add(BASIC.sphere, { x: sx * 0.14, y: 0.05, z: 0.355, sx: 0.105, sy: 0.14, sz: 0.07, color: WHITE, smooth: true });
    b.add(BASIC.sphere, { x: sx * 0.132, y: cool ? 0.03 : 0.04, z: 0.415, sx: 0.06, sy: cool ? 0.07 : 0.09, sz: 0.035, color: iris, smooth: true });
    b.add(BASIC.sphere, { x: sx * 0.115, y: 0.085, z: 0.445, sx: 0.022, sy: 0.022, sz: 0.015, color: '#ffffff', k: 1.3, smooth: true });
    if (!cool) b.box(sx * 0.14, 0.215, 0.375, 0.13, 0.03, 0.04, brow, 1, 0);
    b.add(BASIC.sphere, { x: sx * 0.25, y: -0.08, z: 0.315, sx: 0.07, sy: 0.042, sz: 0.03, color: '#ff9aa6', smooth: true });
    if (lashes) {
      for (let i = 0; i < 3; i++) b.box(sx * (0.19 + i * 0.012), 0.17 - i * 0.03, 0.38, 0.05, 0.016, 0.02, DARK, 1, 0);
    }
  }
  if (cool) {
    // schräge Brauen (lässiger Blick)
    for (const sx of [-1, 1]) b.add(BASIC.box, { x: sx * 0.14, y: 0.165, z: 0.385, rz: sx * 0.32, sx: 0.15, sy: 0.035, sz: 0.04, color: brow });
  }
  b.add(BASIC.sphere, { x: 0, y: -0.035, z: 0.415, sx: 0.045, sy: 0.04, sz: 0.035, color: skin, smooth: true });
}

// Mimik-Rig: Mundformen (geteilte Materialien/Geometrien), je Stimmung ist genau eine sichtbar
const MOUTH = {
  dark: new THREE.MeshStandardMaterial({ color: '#5a1f2a', roughness: 0.5 }),
  tongue: new THREE.MeshStandardMaterial({ color: '#ff7a8a', roughness: 0.5 }),
  teeth: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }),
  smile: new THREE.TorusGeometry(0.08, 0.017, 6, 16, Math.PI),
  grin: new THREE.TorusGeometry(0.1, 0.017, 6, 16, Math.PI),
  frown: new THREE.TorusGeometry(0.06, 0.016, 6, 14, Math.PI),
};
function blob(mat, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(LID_GEO, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}
function mouthRig(info) {
  const g = new THREE.Group();
  g.position.set(0, info.mouthY, 0.37);
  g.rotation.x = -0.4;
  const smile = new THREE.Mesh(info.grin ? MOUTH.grin : MOUTH.smile, MOUTH.dark);
  smile.rotation.z = Math.PI;
  // Schreck: rundes „O"
  const O = blob(MOUTH.dark, 0.045, 0.058, 0.03, 0, -0.045, -0.008);
  // Jubel: weit offenes Lachen mit Zähnen und Zunge
  const open = new THREE.Group();
  open.position.set(0, -0.04, -0.008);
  open.add(blob(MOUTH.dark, 0.085, 0.05, 0.028), blob(MOUTH.tongue, 0.05, 0.022, 0.018, 0, -0.024, 0.012), blob(MOUTH.teeth, 0.06, 0.012, 0.012, 0, 0.03, 0.016));
  // Enttäuschung: Mundwinkel nach unten
  const frown = new THREE.Mesh(MOUTH.frown, MOUTH.dark);
  frown.position.set(0, -0.07, 0);
  // Turbo: zusammengebissene Zähne
  const grit = new THREE.Group();
  grit.position.set(0, -0.04, -0.008);
  grit.add(blob(MOUTH.dark, 0.075, 0.026, 0.026), blob(MOUTH.teeth, 0.068, 0.017, 0.012, 0, 0, 0.014));
  for (const m of [O, open, frown, grit]) m.visible = false;
  g.add(smile, O, open, frown, grit);
  g.userData = { smile, O, open, frown, grit };
  return g;
}

// Kopf je Figur (Kopf-Koordinaten: Ursprung = Kopfmitte). glow = leuchtende Teile (eigenes Material)
const HEADS = [
  // 0 Byte – Roboter mit LED-Augen und Antenne
  (b, g) => {
    b.add(BASIC.box, { y: 0, sx: 0.8, sy: 0.7, sz: 0.72, color: '#c8d0e0' });
    b.add(BASIC.sphere, { y: 0.02, sx: 0.44, sy: 0.4, sz: 0.4, color: '#c8d0e0', smooth: true });
    b.box(0, 0.0, 0.36, 0.64, 0.4, 0.04, '#141418');
    for (const sx of [-1, 1]) b.add(BASIC.cyl12, { x: sx * 0.41, y: 0.0, rz: Math.PI / 2, sx: 0.1, sy: 0.08, sz: 0.1, color: DARK, smooth: true });
    b.add(BASIC.cyl12, { y: 0.48, sx: 0.025, sy: 0.24, sz: 0.025, color: DARK, smooth: true });
    for (const sx of [-1, 1]) g.box(sx * 0.15, 0.04, 0.385, 0.16, 0.09, 0.02, '#3cf2ff', 2.4);
    g.box(0, -0.1, 0.385, 0.22, 0.03, 0.02, '#3cf2ff', 1.8);
    g.add(BASIC.sphere, { y: 0.62, sx: 0.07, sy: 0.07, sz: 0.07, color: '#ff3355', k: 2.6, smooth: true });
    b.box(0, 0.02, -0.366, 0.54, 0.42, 0.02, '#9aa2b0');
    for (const [x, y] of [[-0.23, 0.18], [0.23, 0.18], [-0.23, -0.14], [0.23, -0.14]]) b.add(BASIC.cyl12, { x, y, z: -0.378, rx: Math.PI / 2, sx: 0.022, sy: 0.012, sz: 0.022, color: '#e2e6f0', smooth: true });
    for (const y of [0.09, 0.02, -0.05]) b.box(0, y, -0.378, 0.3, 0.025, 0.012, DARK);
    for (const sx of [-1, 1]) b.box(sx * 0.401, 0.2, -0.1, 0.012, 0.05, 0.3, DARK);
  },
  // 1 Nyx – Katzenohren-Helm
  (b) => {
    const skin = '#ffd9c2';
    b.add(BASIC.sphere, { sx: R, sy: R, sz: R, color: skin, smooth: true });
    shell(b, R * 1.07, '#3b2470', { open: 0.78, brow: 0.82 });
    shell(b, R * 1.088, '#ff8ab8', { open: 0.78, brow: 0.82, sx: 0.14 });
    for (const sx of [-1, 1]) {
      b.add(BASIC.cone7, { x: sx * 0.25, y: 0.42, z: -0.02, rz: -sx * 0.38, sx: 0.13, sy: 0.26, sz: 0.1, color: '#3b2470', smooth: true });
      b.add(BASIC.cone7, { x: sx * 0.245, y: 0.41, z: 0.03, rz: -sx * 0.38, sx: 0.075, sy: 0.17, sz: 0.04, color: '#ff8ab8', smooth: true });
    }
    face(b, { skin, iris: '#22c47a', lashes: true });
  },
  // 2 Volt – gelber Helm mit Blitz-Kamm
  (b) => {
    const skin = '#f2c49e';
    b.add(BASIC.sphere, { sx: R, sy: R, sz: R, color: skin, smooth: true });
    shell(b, R * 1.08, '#ffd21f', { open: 0.8, brow: 0.9 });
    for (const x of [-0.15, 0.15]) shell(b, R * 1.085, '#22202a', { open: 0.8, brow: 0.9, x, sx: 0.045 });
    // Blitz als Zickzack-Kamm längs über den Helm
    [[0.24, 0.1, -0.75], [0.0, 0.2, 0.75], [-0.24, 0.3, -0.75]].forEach(([z, y, rx]) =>
      b.add(BASIC.box, { y: R + y, z, rx, sx: 0.07, sy: 0.07, sz: 0.36, color: '#22202a' })
    );
    b.box(0, 0.24, 0.38, 0.5, 0.07, 0.06, DARK);
    face(b, { skin, iris: '#ff8a1a', grin: true });
  },
  // 3 Rune – Ritterhelm mit Sehschlitz und Federbusch
  (b) => {
    b.add(BASIC.sphere, { sx: R * 1.05, sy: R * 1.05, sz: R * 1.05, color: '#b8c0cc', smooth: true });
    b.add(BASIC.cyl24, { y: -0.16, sx: R * 1.04, sy: 0.4, sz: R * 1.04, color: '#b8c0cc', smooth: true });
    b.box(0, 0.04, 0.43, 0.56, 0.07, 0.04, '#141418');
    b.box(0, -0.1, 0.43, 0.08, 0.26, 0.04, '#141418');
    b.box(0, 0.3, 0.2, 0.06, 0.08, 0.5, '#d8dee8');
    for (let i = 0; i < 14; i++) {
      const a = 0.75 + (i / 13) * (Math.PI * 2 - 1.5);
      b.add(BASIC.sphere, { x: Math.sin(a) * R * 1.045, y: 0.0, z: Math.cos(a) * R * 1.045, sx: 0.022, sy: 0.022, sz: 0.022, color: '#8a929e', smooth: true });
    }
    for (const y of [-0.12, -0.26]) {
      const band = new THREE.TorusGeometry(R * 1.045, 0.012, 5, 30);
      b.add(band, { y, rx: Math.PI / 2, color: '#8a929e', smooth: true });
      band.dispose();
    }
    const red = '#e0262e';
    [[0.56, 0.05, 0.16], [0.6, -0.12, 0.14], [0.56, -0.28, 0.12], [0.46, -0.42, 0.1]].forEach(([y, z, s]) =>
      b.add(BASIC.sphere, { y, z, sx: s * 0.7, sy: s, sz: s * 1.5, color: red, smooth: true })
    );
  },
  // 4 Kiko – Astronauten-Kind mit Helmring und Antenne
  (b, g) => {
    const skin = '#ffe2cc';
    b.add(BASIC.sphere, { sx: R, sy: R, sz: R, color: skin, smooth: true });
    shell(b, R * 1.1, WHITE, { open: 0.92, brow: 0.78, chin: 2.4 });
    shell(b, R * 1.116, '#ff8a1f', { open: 0.92, brow: 0.78, chin: 2.4, sx: 0.11 });
    const ring = new THREE.TorusGeometry(R * 0.98, 0.06, 8, 30);
    b.add(ring, { y: -0.02, z: 0.2, rx: -0.12, sx: 0.85, sy: 0.92, color: '#ff8a1f', smooth: true });
    ring.dispose();
    b.add(BASIC.cyl12, { x: 0.18, y: 0.5, rz: -0.25, sx: 0.022, sy: 0.22, sz: 0.022, color: DARK, smooth: true });
    g.add(BASIC.sphere, { x: 0.22, y: 0.63, sx: 0.06, sy: 0.06, sz: 0.06, color: '#ffe23d', k: 2.4, smooth: true });
    face(b, { skin, iris: '#2a7fff' });
  },
  // 5 Juno – Fliegerin mit Lederkappe, Fliegerbrille und Schal
  (b) => {
    const skin = '#f3c9a8';
    b.add(BASIC.sphere, { sx: R, sy: R, sz: R, color: skin, smooth: true });
    shell(b, R * 1.06, '#7a4a2a', { open: 0.95, brow: 0.62, chin: 1.95 });
    for (const x of [-0.16, 0, 0.16]) shell(b, R * 1.07, '#5a3420', { open: 0.95, brow: 0.62, chin: 1.95, x, sx: 0.018 });
    const strap = new THREE.TorusGeometry(0.352, 0.02, 5, 32);
    b.add(strap, { y: 0.28, rx: Math.PI / 2, color: '#3a2418', smooth: true });
    strap.dispose();
    for (const sx of [-1, 1]) {
      b.add(BASIC.sphere, { x: sx * 0.4, y: -0.12, z: 0.0, sx: 0.08, sy: 0.18, sz: 0.14, color: '#7a4a2a', smooth: true });
      const gg = new THREE.TorusGeometry(0.085, 0.025, 6, 18);
      b.add(gg, { x: sx * 0.13, y: 0.28, z: 0.32, rx: -0.55, color: '#c89a4a', smooth: true });
      gg.dispose();
      b.add(BASIC.cyl12, { x: sx * 0.13, y: 0.28, z: 0.32, rx: Math.PI / 2 - 0.55, sx: 0.07, sy: 0.02, sz: 0.07, color: '#9fd8ff', smooth: true });
    }
    b.box(0, 0.25, 0.3, 0.5, 0.035, 0.04, '#5a3420');
    face(b, { skin, iris: '#6a3a1a' });
  },
  // 6 Zed – Hai-Helm mit Rückenflosse und Zahnreihe
  (b) => {
    const skin = '#d9b08c';
    b.add(BASIC.sphere, { sx: R, sy: R, sz: R, color: skin, smooth: true });
    shell(b, R * 1.08, '#2f7fd8', { open: 0.8, brow: 0.86 });
    // Flosse: dünnes Prisma auf dem Helm
    const fin = [[0.12, 0.0], [-0.34, 0.0], [-0.42, 0.42]];
    for (const sx of [-1, 1]) {
      const P0 = fin.map(([z, y]) => [sx * 0.035, R * 1.0 + y, z]);
      if (sx > 0) b.tri(P0[0], P0[1], P0[2], '#2f7fd8');
      else b.tri(P0[0], P0[2], P0[1], '#2f7fd8');
    }
    b.quad([0.035, R, 0.12], [0.035, R + 0.42, -0.42], [-0.035, R + 0.42, -0.42], [-0.035, R, 0.12], '#2f7fd8');
    // Zähne am oberen Rand der Öffnung
    for (let i = -3; i <= 3; i++) b.add(BASIC.cone5, { x: i * 0.075, y: 0.25, z: 0.39 - Math.abs(i) * 0.012, rx: Math.PI, sx: 0.035, sy: 0.07, sz: 0.03, color: WHITE });
    for (const sx of [-1, 1]) {
      for (const z of [-0.04, -0.11, -0.18]) {
        const y = -0.06;
        const rr = R * 1.08;
        const x = sx * Math.sqrt(Math.max(0, rr * rr - y * y - z * z));
        b.add(BASIC.box, { x: x * 1.004, y, z, ry: Math.atan2(-z, x), sx: 0.012, sy: 0.14, sz: 0.022, color: '#163e6e' });
      }
    }
    face(b, { skin, iris: '#1a1a2a', cool: true, grin: true });
  },
  // 7 Mira – Popstar mit Haarknoten, Stern-Spange und Headset
  (b) => {
    const skin = '#ffe2d0';
    const hair = '#ff5fb5';
    b.add(BASIC.sphere, { sx: R, sy: R, sz: R, color: skin, smooth: true });
    shell(b, R * 1.06, hair, { open: 0.9, brow: 0.7, chin: 2.0 });
    for (const sx of [-1, 1]) b.add(BASIC.sphere, { x: sx * 0.3, y: 0.38, z: -0.06, sx: 0.17, sy: 0.17, sz: 0.17, color: hair, smooth: true });
    for (const sx of [-1, 1]) {
      const tie = new THREE.TorusGeometry(0.112, 0.024, 6, 18);
      b.add(tie, { x: sx * 0.3 - sx * 0.079, y: 0.38 - 0.101, z: -0.06 + 0.016, rx: 1.418, ry: -sx * 0.656, color: '#9a3aff', smooth: true });
      tie.dispose();
    }
    b.add(BASIC.sphere, { y: 0.28, z: 0.24, sx: 0.3, sy: 0.12, sz: 0.16, color: hair, smooth: true });
    // Stern aus zwei Dreiecken auf dem rechten Knoten
    const sxp = 0.33;
    const cy = 0.42;
    const cz = 0.12;
    const st = (a) => [sxp, cy + Math.cos(a) * 0.09, cz + Math.sin(a) * 0.09];
    for (const o of [0, Math.PI / 3]) {
      const t0 = st(o + Math.PI / 2);
      const t1 = st(o + Math.PI / 2 + (2 * Math.PI) / 3);
      const t2 = st(o + Math.PI / 2 + (4 * Math.PI) / 3);
      b.tri(t0, t1, t2, '#ffd23d', 1.4);
      b.tri(t0, t2, t1, '#ffd23d', 1.4);
    }
    const mic = new THREE.TorusGeometry(0.3, 0.012, 4, 14, 1.2);
    b.add(mic, { x: 0.4, y: -0.12, z: 0.12, ry: -Math.PI / 2, rz: 0.4, color: DARK, smooth: true });
    mic.dispose();
    b.add(BASIC.sphere, { x: 0.2, y: -0.24, z: 0.33, sx: 0.035, sy: 0.035, sz: 0.035, color: DARK, smooth: true });
    face(b, { skin, iris: '#9a3aff', lashes: true });
  },
];

// Anzug je Figur: [Anzugfarbe, Akzent (Brust-Emblem), Handschuhe]
const SUITS = [
  ['#4a5268', '#3cf2ff', '#c8d0e0'],
  ['#5a2a8a', '#22c47a', DARK],
  ['#ff9a1f', '#22202a', WHITE],
  ['#8a1f2a', WHITE, '#b8c0cc'],
  ['#eef2f8', '#ff8a1f', '#ff8a1f'],
  ['#4a6a3a', '#e8303a', '#7a4a2a'],
  ['#1f3f7a', WHITE, DARK],
  ['#ff8ad0', '#ffd23d', WHITE],
];

const cache = new Map();

function pbrBuilder(extra = null) {
  const b = new GeoBuilder(false, true);
  b.pbrMap = extra ? { ...PBR, ...extra } : PBR;
  b.pbrDefault = [0.45, 0.05];
  return b;
}

// Geometrien einer Figur (gecacht): Körper, Kopf, Kopf-Leuchtteile, Arm (Länge L, zeigt entlang +z)
function charGeometry(idx, armLen) {
  const key = idx + ':' + armLen.toFixed(2);
  if (cache.has(key)) return cache.get(key);
  const [suit, accent, glove] = SUITS[idx % SUITS.length];
  // Anzug aus Stoff (matter), Handschuhe aus Leder – Metall-Handschuhe behalten ihren Glanz
  const suitMat = { [suit]: [0.62, 0.0, 5] };
  const armMat = PBR[glove] && PBR[glove][2] ? suitMat : { ...suitMat, [glove]: [0.5, 0.04, 6] };
  const body = pbrBuilder(suitMat);
  body.add(BASIC.sphere, { y: 0.4, sx: 0.36, sy: 0.44, sz: 0.3, color: suit, smooth: true });
  body.add(BASIC.cyl24, { y: 0.5, z: 0.288, rx: Math.PI / 2, sx: 0.11, sy: 0.03, sz: 0.11, color: WHITE, smooth: true });
  body.add(BASIC.cyl24, { y: 0.5, z: 0.302, rx: Math.PI / 2, sx: 0.07, sy: 0.03, sz: 0.07, color: accent, smooth: true });
  body.add(BASIC.cyl24, { y: 0.86, sx: 0.12, sy: 0.14, sz: 0.12, color: suit, smooth: true });
  const collar = new THREE.TorusGeometry(0.125, 0.032, 6, 18);
  body.add(collar, { y: 0.8, rx: Math.PI / 2, color: accent, smooth: true });
  collar.dispose();
  for (const sx of [-1, 1]) body.add(BASIC.sphere, { x: sx * 0.25, y: 0.745, z: -0.01, sx: 0.13, sy: 0.065, sz: 0.15, color: accent, smooth: true });
  // Hosenträger-Gurte über die Schultern (folgen der Rumpf-Ellipse bei x = ±0,15), mit Metall-Versteller
  const ay = 0.44 * 0.909;
  const az = 0.3 * 0.909;
  for (const sx of [-1, 1]) {
    const p0 = -0.5;
    const p1 = 2.45;
    const steps = 10;
    const da = (p1 - p0) / steps;
    for (let k = 0; k < steps; k++) {
      const a = p0 + (k + 0.5) * da;
      const ty = ay * Math.cos(a);
      const tz = -az * Math.sin(a);
      body.add(BASIC.box, { x: sx * 0.15, y: 0.4 + (ay + 0.012) * Math.sin(a), z: (az + 0.012) * Math.cos(a), rx: Math.atan2(tz, ty), sx: 0.07, sy: Math.hypot(ty, tz) * da + 0.012, sz: 0.018, color: accent });
    }
    const a = 0.35;
    body.add(BASIC.box, { x: sx * 0.15, y: 0.4 + (ay + 0.026) * Math.sin(a), z: (az + 0.026) * Math.cos(a), rx: Math.atan2(-az * Math.sin(a), ay * Math.cos(a)), sx: 0.085, sy: 0.05, sz: 0.02, color: '#c8d0e0' });
  }
  body.add(BASIC.cyl24, { y: 0.13, sx: 0.3, sy: 0.07, sz: 0.25, color: DARK, smooth: true });
  body.add(BASIC.box, { y: 0.13, z: 0.252, sx: 0.09, sy: 0.06, sz: 0.02, color: '#c8d0e0' });
  // Oberschenkel nach vorne (im Cockpit sichtbar)
  for (const sx of [-1, 1]) body.add(BASIC.cyl12, { x: sx * 0.16, y: 0.08, z: 0.28, rx: Math.PI / 2 - 0.15, sx: 0.12, sy: 0.55, sz: 0.12, color: suit, smooth: true });
  const head = pbrBuilder();
  const glow = new GeoBuilder();
  lastFace = null;
  HEADS[idx % HEADS.length](head, glow);
  const faceInfo = lastFace;
  const arm = pbrBuilder(armMat);
  arm.add(BASIC.sphere, { sx: 0.12, sy: 0.12, sz: 0.12, color: suit, smooth: true });
  arm.add(BASIC.cyl12, { z: armLen / 2, rx: Math.PI / 2, sx: 0.075, sy: armLen, sz: 0.075, color: suit, smooth: true });
  arm.add(BASIC.sphere, { z: armLen, sx: 0.1, sy: 0.09, sz: 0.11, color: glove, smooth: true });
  const cuff = new THREE.TorusGeometry(0.083, 0.022, 6, 16);
  arm.add(cuff, { z: armLen - 0.085, color: accent, smooth: true });
  cuff.dispose();
  const res = { body: body.build(), head: head.build(), glow: glow.count ? glow.build() : null, arm: arm.build(), face: faceInfo };
  cache.set(key, res);
  return res;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

// Figur für ein Fahrzeug bauen. seat = Hüftposition im Auto, hands = Lenkradposition (y, z) im Auto.
export function buildDriver(idx, mat, glowMat, seat, steer, shadows = true) {
  const root = new THREE.Group();
  root.position.set(0, seat.y, seat.z);
  // Hände am Lenkrad: Arm-Richtung und -Länge aus Schulter → Hand
  const handRel = new THREE.Vector3(0.19, steer.y - seat.y, steer.z - seat.z);
  const shoulder = new THREE.Vector3(...SHOULDER);
  const dir = handRel.clone().sub(shoulder);
  const armLen = Math.max(0.35, Math.min(0.85, dir.length()));
  const G = charGeometry(idx, Math.round(armLen * 20) / 20);
  const body = new THREE.Mesh(G.body, mat);
  const headGroup = new THREE.Group();
  headGroup.position.set(0, HEAD_Y, 0.02);
  const head = new THREE.Mesh(G.head, mat);
  headGroup.add(head);
  if (G.glow) headGroup.add(new THREE.Mesh(G.glow, glowMat));
  root.add(body, headGroup);
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * SHOULDER[0], SHOULDER[1], SHOULDER[2]);
    _v.set(sx * handRel.x, handRel.y, handRel.z).sub(pivot.position).normalize();
    pivot.quaternion.setFromUnitVectors(Z, _v);
    pivot.userData.base = pivot.quaternion.clone();
    pivot.add(new THREE.Mesh(G.arm, mat));
    root.add(pivot);
    arms.push(pivot);
  }
  // Augenlider: Ober- und Unterlid als hautfarbene Schalen etwas größer als das Auge (Material je Hautfarbe geteilt).
  // Gruppe trägt die Augenform (Skalierung), die Schalen drehen sich darin – so bleiben sie dicht am Auge.
  const lids = [];
  if (G.face) {
    let lm = lidMats.get(G.face.skin);
    if (!lm) {
      lm = new THREE.MeshStandardMaterial({ color: G.face.skin, roughness: 0.55 });
      lidMats.set(G.face.skin, lm);
    }
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.14, 0.05, 0.355);
      eye.scale.set(0.113, 0.15, 0.1);
      const up = new THREE.Mesh(LID_DOME, lm);
      up.rotation.x = -Math.PI / 2;
      const low = new THREE.Mesh(LID_DOME, lm);
      low.rotation.set(Math.PI / 2, 0, Math.PI);
      up.visible = false;
      low.visible = false;
      eye.add(up, low);
      headGroup.add(eye);
      lids.push({ up, low });
    }
  }
  const mouth = G.face ? mouthRig(G.face) : null;
  if (mouth) headGroup.add(mouth);
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = shadows;
  });
  return { root, head: headGroup, arms, body, lids, mouth };
}

// Für Hologramm-Echos: Figur in Fahrhaltung als eine Geometrie (nur Position/Farbe/Normale/pbr)
export function driverStaticGeometry(idx, seat, steer) {
  const tmp = new THREE.MeshBasicMaterial();
  const d = buildDriver(idx, tmp, tmp, seat, steer, false);
  d.root.updateMatrixWorld(true);
  const parts = [];
  d.root.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.pbr) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    parts.push(g);
  });
  tmp.dispose();
  return parts;
}

// Pose-Ziel für den Jubel: Arme nach oben
export function cheerQuat(sx, t, out) {
  _v.set(sx * 0.45, 1, 0.15 + Math.sin(t * 9 + sx) * 0.25).normalize();
  return out.setFromUnitVectors(Z, _v);
}

export const _tmpQ = _q;

// Blinzeln: alle 2–5 s schließen sich die Lider für ~0,14 s (Lid wächst von der Augenmitte aus zu).
// Dazu die Grund-Deckung der Stimmung (v.lidK): Oberlid tiefer (v.lidOff > 0) oder lachende Unterlider (< 0)
export function blink(d, v, dt) {
  if (!d.lids || !d.lids.length) return;
  if (v.blinkT == null) v.blinkT = 1 + Math.random() * 3;
  v.blinkT -= dt;
  let k = 0;
  if (v.blinkT < 0) {
    const ph = -v.blinkT / 0.14;
    if (ph >= 1) v.blinkT = 2 + Math.random() * 3 + (Math.random() < 0.2 ? -1.8 : 0);
    else k = Math.sin(ph * Math.PI);
  }
  if (v.mood === 'shock') k = 0;
  const up = Math.max(k, v.lidUp || 0);
  const low = v.lidLow || 0;
  for (const l of d.lids) {
    l.up.visible = up > 0.01;
    l.up.rotation.x = -Math.PI / 2 + up * Math.PI;
    l.low.visible = low > 0.01;
    l.low.rotation.x = Math.PI / 2 - low * Math.PI;
  }
}

// Stimmung → Lider [oben, unten] und Mund: neutral, grit (Turbo), joy (Jubel), sad (Enttäuschung), shock (Treffer)
const MOODS = { neutral: [0, 0], grit: [0.36, 0.14], joy: [0.1, 0.4], sad: [0.44, 0], shock: [0, 0] };
export function driverMood(d, v, mood, dt) {
  const [ku, kl] = MOODS[mood] || MOODS.neutral;
  const f = 1 - Math.exp(-14 * dt);
  v.mood = mood;
  v.lidUp = (v.lidUp || 0) + (ku - (v.lidUp || 0)) * f;
  v.lidLow = (v.lidLow || 0) + (kl - (v.lidLow || 0)) * f;
  const m = d.mouth;
  if (!m) return;
  const u = m.userData;
  u.smile.visible = mood === 'neutral';
  u.O.visible = mood === 'shock';
  u.open.visible = mood === 'joy';
  u.frown.visible = mood === 'sad';
  u.grit.visible = mood === 'grit';
}

// Zappeln bei Treffern: Arme hoch und auseinander, schnelles Wackeln
export function flailQuat(sx, t, out) {
  _v.set(sx * (0.8 + Math.sin(t * 23 + sx) * 0.3), 0.75 + Math.sin(t * 17 + sx * 2) * 0.35, 0.3).normalize();
  return out.setFromUnitVectors(Z, _v);
}
