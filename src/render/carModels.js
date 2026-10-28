// Sechs Spielzeug-Karts (eigene Entwürfe): offene Cockpits mit Fahrerfigur, knalliger Metallic-Lack,
// Chrom-Motoren, große Räder, Flammen und Rennstreifen. +z = vorne.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder, BASIC } from './geo.js';
import { glowTexture, numberTexture, seatDecalTexture, stickerAtlas, stickerUV } from './textures.js';
import { buildDriver, driverStaticGeometry } from './characters.js';
import { detailTexture } from './detail.js';

const D = '#17161f'; // dunkle Anbauteile / Carbon
const G = '#0b1630'; // Glas
const W = '#0f0f12'; // Reifen
const CHROME = '#e2e6f0';
const DRIM = '#2a2a34';
const ACC = '#f6f6fa'; // Rennstreifen
const RED = '#e0182c';
const FL1 = '#ffe14a';
const FL2 = '#ff7a1a';
const HEAD = '#fff6e0';
const LETTER = '#c9c9d0'; // Reifenbeschriftung
const TAIL = '#ff1a2a';

// ---------- Bauteile ----------
// Block mit Neigung: vorne/hinten eigene Unter-/Oberkante, oben schmaler (wt) und eingerückt (insF/insR)
function slab(b, o, color) {
  const { wb, wt = wb, zf, zr, yfb, yrb = yfb, yft, yrt = yft, insF = 0, insR = 0, x = 0 } = o;
  b.hexa(
    [
      [x - wb, yrb, zr],
      [x + wb, yrb, zr],
      [x + wb, yfb, zf],
      [x - wb, yfb, zf],
      [x - wt, yrt, zr + insR],
      [x + wt, yrt, zr + insR],
      [x + wt, yft, zf - insF],
      [x - wt, yft, zf - insF],
    ],
    color
  );
}

// Wie slab, aber mit abgeschrägten Oberkanten (Fase) – fängt Glanzlichter ein wie ein echtes Druckguss-Modell
function bslab(b, o, color, bev = 0.07) {
  const { wb, wt = wb, zf, zr, yfb, yrb = yfb, yft, yrt = yft, insF = 0, insR = 0, x = 0 } = o;
  slab(b, { ...o, yrb, yft: yft - bev, yrt: yrt - bev }, color);
  slab(b, { x, wb: wt, wt: Math.max(0.02, wt - bev), zf: zf - insF, zr: zr + insR, yfb: yft - bev, yrb: yrt - bev, yft, yrt, insF: bev, insR: bev }, color);
}


// Chromring hinter runden Scheinwerfern
function headRing(b, x, y, z, r) {
  for (const sx of [-1, 1]) b.add(BASIC.cyl24, { x: sx * x, y, z, rx: Math.PI / 2, sx: r, sy: 0.05, sz: r, color: CHROME, smooth: true });
}


// Zwei Rennstreifen auf einer (schrägen) Oberseite von (z0,y0) hinten nach (z1,y1) vorne
function stripes(b, gap, w, z0, y0, z1, y1, color = ACC) {
  for (const sx of [-1, 1]) {
    const x = sx * gap;
    b.quad([x - w, y0 + 0.01, z0], [x - w, y1 + 0.01, z1], [x + w, y1 + 0.01, z1], [x + w, y0 + 0.01, z0], color);
  }
}

// Aufkleber auf beiden Seitenflächen (x = ±xAbs): Polygon in (z, y), Fächer ab Punkt "o"
function sideDecal(b, xAbs, o, pts, color) {
  for (const sx of [-1, 1]) {
    const x = sx * xAbs;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      let A = [x, o[1], o[0]];
      let B = [x, p[1], p[0]];
      let C = [x, q[1], q[0]];
      // Normale muss nach außen (sx) zeigen
      const nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      if (nx * sx < 0) [B, C] = [C, B];
      b.tri(A, B, C, color);
    }
  }
}

// Flammen (zwei Lagen) ab Vorderkante z0 nach hinten, Höhe y0..y0+h, Länge len
const FLAME = [
  [0, 0.0],
  [-0.55, 0.06],
  [-0.32, 0.24],
  [-1.0, 0.36],
  [-0.42, 0.48],
  [-0.82, 0.64],
  [-0.3, 0.72],
  [-0.62, 0.92],
  [0, 1.0],
];
function flames(b, xAbs, z0, y0, len, h) {
  const map = (s, k) => FLAME.map(([z, y]) => [z0 + z * len * s, y0 + (0.5 + (y - 0.5) * k) * h]);
  sideDecal(b, xAbs + 0.004, [z0 - 0.08 * len, y0 + 0.5 * h], map(1, 1), FL2);
  sideDecal(b, xAbs + 0.009, [z0 - 0.08 * len, y0 + 0.5 * h], map(0.68, 0.62), FL1);
}

// Kompressor-Motor mit Ansaugtrichtern, der aus der Haube ragt
function blower(b, y, z, s = 1) {
  b.box(0, y + 0.08 * s, z, 0.62 * s, 0.16 * s, 0.72 * s, CHROME);
  b.box(0, y + 0.27 * s, z, 0.5 * s, 0.22 * s, 0.58 * s, D);
  b.box(0, y + 0.4 * s, z, 0.54 * s, 0.05 * s, 0.6 * s, CHROME);
  for (const dx of [-0.13, 0.13]) {
    for (const dz of [-0.15, 0.15]) {
      b.add(BASIC.cyl12, { x: dx * s, y: y + 0.53 * s, z: z + dz * s, sx: 0.075 * s, sy: 0.22 * s, sz: 0.075 * s, color: CHROME, smooth: true });
    }
  }
}

function sidePipes(b, x, y, z0, z1) {
  for (const sx of [-1, 1]) {
    b.add(BASIC.cyl24, { x: sx * x, y, z: (z0 + z1) / 2, rx: Math.PI / 2, sx: 0.075, sy: z1 - z0, sz: 0.075, color: CHROME, smooth: true });
    for (let i = 0; i < 3; i++) {
      b.add(BASIC.cyl12, { x: sx * (x - 0.04), y: y + 0.13, z: z1 - 0.12 - i * 0.2, sx: 0.045, sy: 0.24, sz: 0.045, color: CHROME, smooth: true });
    }
  }
}

function wing(b, y, z, span, depth, color, strut = D, strutX = 0.5) {
  b.box(0, y, z, span, 0.07, depth, color);
  for (const sx of [-1, 1]) {
    b.box(sx * strutX, y - 0.26, z + 0.02, 0.07, 0.5, depth * 0.45, strut);
    b.box(sx * (span / 2), y + 0.06, z, 0.05, 0.32, depth + 0.1, strut);
  }
}


// ---------- Kart-Bauteile ----------
// Sitzschale mit Lehne + Lenksäule mit Lenkrad (zum Fahrer geneigt)
function kartCore(b, seat, steer, seatColor = D) {
  const { y: sy, z: sz } = seat;
  b.box(0, sy - 0.08, sz + 0.08, 0.8, 0.12, 0.72, seatColor);
  slab(b, { wb: 0.44, wt: 0.42, zf: sz - 0.3, zr: sz - 0.5, yfb: sy - 0.12, yrb: sy - 0.12, yft: sy + 0.66, yrt: sy + 0.7, insR: 0.12 }, seatColor);
  for (const sx of [-1, 1]) b.box(sx * 0.43, sy + 0.14, sz - 0.1, 0.1, 0.44, 0.62, seatColor);
  // Lenksäule von schräg unten vorne zum Lenkrad
  const len = 0.62;
  b.add(BASIC.cyl12, { y: steer.y - 0.22, z: steer.z + 0.22, rx: -Math.PI / 4, sx: 0.035, sy: len, sz: 0.035, color: D, smooth: true });
  const ring = new THREE.TorusGeometry(0.2, 0.034, 8, 26);
  b.add(ring, { y: steer.y, z: steer.z, rx: Math.PI / 4, color: D, smooth: true });
  ring.dispose();
  b.add(BASIC.cyl12, { y: steer.y, z: steer.z, rx: Math.PI / 4 + Math.PI / 2, sx: 0.06, sy: 0.05, sz: 0.06, color: CHROME, smooth: true });
  for (const sx of [-1, 1]) b.add(BASIC.box, { x: sx * 0.1, y: steer.y, z: steer.z, rx: Math.PI / 4, sx: 0.2, sy: 0.025, sz: 0.03, color: D });
}

// Runder Radbogen aus Segmenten über einem Rad + Halter zum Rumpf (tubX = Außenkante des Rumpfs)
function fender(b, P, x, z, r, w, tubX) {
  const R = r + 0.14;
  const n = 7;
  const a0 = 0.3;
  const a1 = Math.PI - 0.3;
  const seg = 2 * R * Math.sin((a1 - a0) / n / 2) + 0.03;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const a = a0 + ((i + 0.5) * (a1 - a0)) / n;
      b.add(BASIC.box, { x: sx * x, y: r + Math.sin(a) * R, z: z + Math.cos(a) * R, rx: Math.PI / 2 - a, sx: w + 0.14, sy: 0.08, sz: seg, color: P });
    }
    const xi = x - (w + 0.14) / 2;
    if (xi > tubX) b.box(sx * (xi + tubX) / 2, r + R * 0.8, z, xi - tubX + 0.04, 0.08, 0.36, D);
  }
}

// ---------- Baupläne: Karosserie (b), Leuchtteile (l), Rückgabe = Räder, Sitz, Lenkrad, Licht-Positionen ----------
const BUILDERS = [
  // 0 Komet – Retro-Flitzer: runde Bugverkleidung, Seitenkästen mit Sidepipes, Kompressor hinter dem Fahrer
  (b, l, P) => {
    const seat = { y: 0.52, z: -0.4 };
    const steer = { y: 1.0, z: 0.28 };
    b.box(0, 0.3, -0.05, 1.3, 0.14, 3.5, D);
    bslab(b, { wb: 0.7, wt: 0.5, zf: 2.05, zr: 0.25, yfb: 0.26, yrb: 0.32, yft: 0.56, yrt: 0.9, insF: 0.28 }, P, 0.06);
    stripes(b, 0.13, 0.055, 0.35, 0.89, 1.65, 0.575);
    for (const sx of [-1, 1]) bslab(b, { x: sx * 0.74, wb: 0.26, wt: 0.22, zf: 0.45, zr: -0.62, yfb: 0.26, yft: 0.7, insF: 0.18, insR: 0.05 }, P, 0.05);
    sidePipes(b, 1.06, 0.3, -0.55, 0.6);
    b.box(0, 0.3, 2.12, 1.5, 0.1, 0.12, CHROME);
    b.box(0, 0.62, -1.38, 0.95, 0.5, 0.72, D);
    blower(b, 0.87, -1.38, 0.85);
    b.box(0, 0.36, -1.85, 1.6, 0.12, 0.12, CHROME);
    for (const sx of [-1, 1]) b.add(BASIC.cyl12, { x: sx * 0.3, y: 0.5, z: -1.86, rx: Math.PI / 2, sx: 0.08, sy: 0.3, sz: 0.08, color: CHROME, smooth: true });
    kartCore(b, seat, steer);
    headRing(b, 0.38, 0.38, 1.95, 0.13);
    for (const sx of [-1, 1]) l.add(BASIC.cyl24, { x: sx * 0.38, y: 0.38, z: 1.97, rx: Math.PI / 2, sx: 0.1, sy: 0.04, sz: 0.1, color: HEAD, k: 5 });
    for (const sx of [-1, 1]) l.box(sx * 0.3, 0.72, -1.75, 0.26, 0.08, 0.04, TAIL, 4);
    return {
      f: { r: 0.4, w: 0.34, x: 0.95, z: 1.38 },
      r: { r: 0.5, w: 0.52, x: 1.0, z: -1.2 },
      rim: 'chrome', spokes: 5, redline: true,
      head: { x: 0.38, y: 0.38, z: 2.05 }, tail: { y: 0.72, z: -1.78, w: 1.0 },
      decal: { x: 0.995, y: 0.5, z: -0.32, r: 0.15 },
      stickers: [{ side: [0.7, 0.303, 0.5, 0.728], y: 0.5, z: 0.75, w: 0.34, h: 0.085, id: 'volt' }],
      seat, steer, exhaust: [[-0.3, 0.5, -2.0], [0.3, 0.5, -2.0]],
    };
  },
  // 1 Viper – flacher Pfeil: spitze Nase, Frontflügel, Haifischflosse, Düse und Heckflügel
  (b, l, P) => {
    const seat = { y: 0.48, z: -0.35 };
    const steer = { y: 0.95, z: 0.3 };
    b.box(0, 0.28, 0, 1.2, 0.12, 3.6, D);
    slab(b, { wb: 0.5, wt: 0.3, zf: 2.4, zr: 0.2, yfb: 0.22, yrb: 0.26, yft: 0.34, yrt: 0.82, insF: 0.55 }, P);
    stripes(b, 0.1, 0.045, 0.32, 0.79, 1.75, 0.37);
    b.box(0, 0.2, 2.2, 2.0, 0.06, 0.42, P);
    for (const sx of [-1, 1]) b.box(sx * 1.0, 0.3, 2.2, 0.05, 0.26, 0.5, D);
    for (const sx of [-1, 1]) {
      slab(b, { x: sx * 0.68, wb: 0.28, wt: 0.2, zf: 0.55, zr: -0.72, yfb: 0.24, yft: 0.6, insF: 0.35 }, P);
      b.box(sx * 0.68, 0.36, 0.5, 0.36, 0.16, 0.05, D);
    }
    slab(b, { wb: 0.5, wt: 0.38, zf: -0.7, zr: -2.0, yfb: 0.3, yft: 0.62, yrt: 0.6 }, P);
    slab(b, { wb: 0.04, wt: 0.02, zf: -0.8, zr: -1.95, yfb: 0.6, yrb: 0.6, yft: 0.95, yrt: 1.42, insF: 0.5 }, P);
    wing(b, 1.38, -1.9, 2.0, 0.48, P, D, 0.48);
    b.add(BASIC.cyl24, { y: 0.5, z: -2.08, rx: Math.PI / 2, sx: 0.24, sy: 0.3, sz: 0.24, color: CHROME, smooth: true });
    kartCore(b, seat, steer);
    l.add(BASIC.cyl24, { y: 0.5, z: -2.22, rx: Math.PI / 2, sx: 0.17, sy: 0.03, sz: 0.17, color: '#ff9a40', k: 2.2 });
    for (const sx of [-1, 1]) l.box(sx * 0.36, 0.3, 2.12, 0.22, 0.04, 0.05, HEAD, 6);
    l.box(0, 0.62, -2.01, 0.9, 0.05, 0.05, TAIL, 4);
    return {
      f: { r: 0.38, w: 0.36, x: 0.97, z: 1.48 },
      r: { r: 0.47, w: 0.5, x: 1.0, z: -1.32 },
      rim: 'chrome', spokes: 8, redline: false,
      head: { x: 0.36, y: 0.3, z: 2.15 }, tail: { y: 0.62, z: -2.02, w: 0.9 },
      decal: { x: 0.96, y: 0.42, z: -0.15, r: 0.15 },
      stickers: [
        { side: [0.96, 0.24, 0.88, 0.6], y: 0.42, z: -0.52, w: 0.32, h: 0.08, id: 'rune' },
        { side: [1.025, 0, 1.025, 1], y: 0.3, z: 2.2, w: 0.4, h: 0.1, id: 'zed' },
        { top: [-2.14, 1.415, -1.66, 1.415], z: -1.9, w: 1.88, h: 0.235, id: 'zed', banner: true },
      ],
      seat, steer, exhaust: [[0, 0.5, -2.3]],
    };
  },
  // 2 Glitch – kantiges Cyber-Kart mit LED-Streifen, Holo-Bildschirm und Antennenschüssel
  (b, l, P, pc) => {
    const seat = { y: 0.6, z: -0.35 };
    const steer = { y: 1.06, z: 0.3 };
    slab(b, { wb: 0.72, wt: 0.56, zf: 1.95, zr: -1.75, yfb: 0.26, yft: 0.56, yrt: 0.6, insF: 0.35, insR: 0.25 }, P);
    slab(b, { wb: 0.56, wt: 0.34, zf: 1.75, zr: 0.3, yfb: 0.56, yrb: 0.6, yft: 0.66, yrt: 1.0, insF: 0.45 }, P);
    for (const sx of [-1, 1]) slab(b, { x: sx * 0.45, wb: 0.04, wt: 0.03, zf: -1.0, zr: -1.75, yfb: 0.58, yft: 1.0, yrt: 1.35, insF: 0.4 }, P);
    b.add(BASIC.cyl12, { y: 1.15, z: -1.5, sx: 0.03, sy: 1.1, sz: 0.03, color: D, smooth: true });
    b.add(BASIC.cyl24, { y: 1.72, z: -1.5, rx: -0.6, sx: 0.28, sy: 0.05, sz: 0.28, color: D, smooth: true });
    kartCore(b, seat, steer);
    l.add(BASIC.sphere, { y: 1.78, z: -1.45, sx: 0.06, sy: 0.06, sz: 0.06, color: pc, k: 3 });
    b.box(0, 1.05, 0.46, 0.06, 0.14, 0.04, D);
    l.box(0, 1.24, 0.46, 0.5, 0.28, 0.02, pc, 1.4);
    for (const sx of [-1, 1]) l.box(sx * 0.73, 0.42, 0.1, 0.03, 0.06, 3.0, pc, 3);
    l.box(0, 0.44, 1.96, 1.0, 0.06, 0.04, HEAD, 5);
    l.box(0, 0.44, -1.77, 1.1, 0.06, 0.04, TAIL, 4);
    return {
      f: { r: 0.42, w: 0.4, x: 0.98, z: 1.38 },
      r: { r: 0.44, w: 0.44, x: 0.99, z: -1.32 },
      rim: 'dark', spokes: 4, redline: false,
      head: { x: 0.4, y: 0.44, z: 1.98 }, tail: { y: 0.44, z: -1.8, w: 1.1 },
      decal: { x: 0.47, y: 0.92, z: -1.32, r: 0.12 },
      stickers: [{ top: [0.3, 1.0, 1.3, 0.66], z: 0.95, w: 0.52, h: 0.13, id: 'byte', front: true }],
      seat, steer, exhaust: [[-0.35, 0.4, -1.85], [0.35, 0.4, -1.85]],
    };
  },
  // 3 Nova – Drift-Buggy mit Kotflügeln, Überrollbügel und GT-Flügel
  (b, l, P) => {
    const seat = { y: 0.5, z: -0.35 };
    const steer = { y: 0.98, z: 0.3 };
    const wr = 0.4;
    bslab(b, { wb: 0.66, wt: 0.6, zf: 1.62, zr: -1.5, yfb: 0.24, yft: 0.62, insF: 0.28 }, P, 0.05);
    slab(b, { wb: 0.5, wt: 0.46, zf: 1.55, zr: 0.6, yfb: 0.6, yft: 0.64, insF: 0.1 }, D);
    for (const z of [1.3, -1.3]) fender(b, P, 1.0, z, wr, 0.46, 0.64);
    b.box(0, 0.32, 1.72, 1.7, 0.1, 0.1, D);
    b.box(0, 0.24, 1.6, 1.2, 0.04, 0.5, CHROME);
    for (const sx of [-1, 1]) b.add(BASIC.cyl12, { x: sx * 0.42, y: 1.08, z: -0.88, sx: 0.045, sy: 1.0, sz: 0.045, color: CHROME, smooth: true });
    b.add(BASIC.cyl12, { y: 1.58, z: -0.88, rz: Math.PI / 2, sx: 0.045, sy: 0.88, sz: 0.045, color: CHROME, smooth: true });
    wing(b, 1.13, -1.42, 1.9, 0.46, D, D, 0.45);
    b.add(BASIC.cyl24, { x: 0.45, y: 0.4, z: -1.58, rx: Math.PI / 2, sx: 0.1, sy: 0.3, sz: 0.1, color: CHROME, smooth: true });
    sideDecal(b, 0.665, [0.2, 0.42], [[1.2, 0.3], [0.9, 0.3], [-0.9, 0.56], [-0.6, 0.56]], ACC);
    kartCore(b, seat, steer);
    for (const sx of [-1, 1]) l.box(sx * 0.4, 0.48, 1.6, 0.28, 0.1, 0.05, HEAD, 5);
    for (const sx of [-1, 1]) l.box(sx * 0.4, 0.5, -1.52, 0.28, 0.08, 0.04, TAIL, 4);
    return {
      f: { r: wr, w: 0.46, x: 1.0, z: 1.3 },
      r: { r: wr, w: 0.46, x: 1.0, z: -1.3 },
      rim: 'dark', spokes: 6, redline: false, camber: 0.12,
      head: { x: 0.4, y: 0.48, z: 1.64 }, tail: { y: 0.5, z: -1.55, w: 1.1 },
      decal: { x: 0.672, y: 0.4, z: -0.25, r: 0.14 },
      stickers: [
        { side: [0.66, 0.24, 0.6, 0.57], y: 0.52, z: 0.45, w: 0.3, h: 0.07, id: 'nyx' },
        { side: [0.66, 0.24, 0.6, 0.57], y: 0.33, z: -0.62, w: 0.28, h: 0.07, id: 'echofm' },
        { top: [-1.65, 1.165, -1.19, 1.165], z: -1.42, w: 1.78, h: 0.2225, id: 'nyx', banner: true },
      ],
      seat, steer, exhaust: [[0.45, 0.4, -1.75]],
    };
  },
  // 4 Titan – Monster-Kart: Stollenreifen, hoher Rahmen, Rammschutz, Überrollbügel mit Lichtbalken, Flammen
  (b, l, P) => {
    const seat = { y: 1.2, z: -0.4 };
    const steer = { y: 1.66, z: 0.25 };
    const wr = 0.72;
    b.box(0, 0.95, 0, 1.25, 0.22, 3.4, D);
    for (const sx of [-1, 1]) for (const z of [1.38, -1.38]) b.add(BASIC.cyl12, { x: sx * 0.66, y: 1.0, z, rz: sx * 0.4, sx: 0.07, sy: 0.7, sz: 0.07, color: CHROME, smooth: true });
    bslab(b, { wb: 0.8, wt: 0.74, zf: 1.65, zr: -1.6, yfb: 1.0, yft: 1.38, insF: 0.25 }, P, 0.07);
    for (const z of [1.38, -1.38]) fender(b, P, 1.12, z, wr, 0.62, 0.8);
    for (const sx of [-1, 1]) b.box(sx * 0.5, 1.15, 1.78, 0.08, 0.08, 0.25, CHROME);
    b.box(0, 1.05, 1.88, 1.7, 0.09, 0.09, CHROME);
    b.box(0, 1.3, 1.88, 1.7, 0.09, 0.09, CHROME);
    for (const x of [-0.7, 0, 0.7]) b.box(x, 1.17, 1.88, 0.09, 0.32, 0.09, CHROME);
    for (const sx of [-1, 1]) b.add(BASIC.cyl12, { x: sx * 0.56, y: 1.95, z: -0.98, sx: 0.05, sy: 1.2, sz: 0.05, color: CHROME, smooth: true });
    b.add(BASIC.cyl12, { y: 2.55, z: -0.98, rz: Math.PI / 2, sx: 0.05, sy: 1.16, sz: 0.05, color: CHROME, smooth: true });
    flames(b, 0.8, 1.6, 1.06, 2.2, 0.3);
    kartCore(b, seat, steer);
    l.box(0, 2.64, -0.98, 1.0, 0.1, 0.14, HEAD, 4);
    for (const sx of [-1, 1]) l.box(sx * 0.48, 1.22, 1.66, 0.3, 0.14, 0.05, HEAD, 5);
    for (const sx of [-1, 1]) l.box(sx * 0.5, 1.2, -1.62, 0.28, 0.16, 0.04, TAIL, 4);
    return {
      f: { r: wr, w: 0.62, x: 1.12, z: 1.38 },
      r: { r: wr, w: 0.62, x: 1.12, z: -1.38 },
      rim: 'dark', spokes: 5, treads: true,
      head: { x: 0.48, y: 1.22, z: 1.7 }, tail: { y: 1.2, z: -1.65, w: 1.3 },
      decal: { x: 0.81, y: 1.2, z: 0.0, r: 0.16 },
      stickers: [{ top: [-1.0, 1.38, 1.33, 1.38], z: 0.85, w: 0.8, h: 0.2, id: 'rune', front: true }],
      seat, steer, exhaust: [[-0.4, 1.0, -1.9], [0.4, 1.0, -1.9]], camY: 0.55, labelY: 3.9,
    };
  },
  // 5 Pixel – Dragster: lange Nase mit Mini-Vorderrädern, Motor vor dem Fahrer, Riesen-Slicks, hoher Flügel
  (b, l, P) => {
    const seat = { y: 0.52, z: -0.45 };
    const steer = { y: 0.98, z: 0.15 };
    slab(b, { wb: 0.26, wt: 0.18, zf: 2.45, zr: 0.35, yfb: 0.24, yrb: 0.3, yft: 0.38, yrt: 0.6, insF: 0.12 }, P);
    b.box(0, 0.26, 1.88, 1.1, 0.06, 0.08, D);
    b.box(0, 0.62, 0.75, 0.62, 0.45, 0.7, D);
    blower(b, 0.85, 0.75, 0.8);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        b.add(BASIC.cyl12, { x: sx * 0.42, y: 0.66, z: 0.5 + i * 0.16, rz: sx * 0.9, sx: 0.04, sy: 0.36, sz: 0.04, color: CHROME, smooth: true });
      }
    }
    slab(b, { wb: 0.42, wt: 0.36, zf: 0.3, zr: -1.0, yfb: 0.26, yft: 0.72, insF: 0.1 }, P);
    b.box(0, 0.45, -1.4, 0.7, 0.3, 0.9, D);
    for (const sx of [-1, 1]) b.add(BASIC.cyl12, { x: sx * 0.25, y: 0.3, z: -2.1, rx: Math.PI / 2, sx: 0.03, sy: 0.8, sz: 0.03, color: CHROME, smooth: true });
    wing(b, 1.6, -1.55, 1.3, 0.42, P, D, 0.32);
    flames(b, 0.26, 2.3, 0.26, 1.5, 0.12);
    kartCore(b, seat, steer);
    for (const sx of [-1, 1]) l.box(sx * 0.14, 0.33, 2.42, 0.12, 0.06, 0.05, HEAD, 5);
    for (const sx of [-1, 1]) l.box(sx * 0.25, 0.5, -1.86, 0.2, 0.08, 0.04, TAIL, 4);
    return {
      f: { r: 0.26, w: 0.16, x: 0.6, z: 1.88 },
      r: { r: 0.6, w: 0.6, x: 0.92, z: -1.15 },
      rim: 'chrome', spokes: 10, redline: true,
      head: { x: 0.14, y: 0.33, z: 2.45 }, tail: { y: 0.5, z: -1.88, w: 0.7 },
      // Startnummer vor dem Sitz (weiter hinten verdeckt sie die Seitenwange der Sitzschale)
      decal: { x: 0.4, y: 0.48, z: 0.03, r: 0.13 },
      stickers: [
        { side: [0.675, 0, 0.675, 1], y: 1.66, z: -1.55, w: 0.44, h: 0.11, id: 'pops' },
        { top: [-1.76, 1.635, -1.34, 1.635], z: -1.55, w: 1.18, h: 0.1475, id: 'pops', banner: true },
      ],
      seat, steer, exhaust: [[-0.42, 0.75, 0.35], [0.42, 0.75, 0.35]],
    };
  },
];

// ---------- Räder ----------
const wheelCache = new Map();

function wheelGeometry(ws, opt) {
  const key = [ws.r, ws.w, opt.rim, opt.spokes, !!opt.redline, !!opt.treads].join(':');
  if (wheelCache.has(key)) return wheelCache.get(key);
  const b = new GeoBuilder(false, true);
  b.pbrMap = { [W]: [0.88, 0, 2], [CHROME]: [0.1, 1.0], [DRIM]: [0.35, 0.6, 3], [RED]: [0.5, 0] };
  const { r, w } = ws;
  const rimCol = opt.rim === 'dark' ? DRIM : CHROME;
  // Lauffläche + zwei runde Reifenschultern (Torus)
  const t = Math.min(w * 0.28, r * 0.22);
  b.add(BASIC.cyl24, { rz: Math.PI / 2, sx: r, sy: Math.max(0.02, w - 2 * t), sz: r, color: W, smooth: true });
  const shoulder = new THREE.TorusGeometry(r - t, t, 8, 28);
  for (const sx of [-1, 1]) b.add(shoulder, { x: sx * (w / 2 - t), ry: Math.PI / 2, color: W, smooth: true });
  shoulder.dispose();
  if (!opt.treads) {
    // Straßenprofil: zwei versetzte Reihen flacher Stollen mit Mittelrille (sichtbar von hinten und in Kurven)
    const nT = Math.max(16, Math.round((Math.PI * 2 * r) / 0.12));
    const bw = Math.max(0.06, (w - 2 * t) * 0.46 + t * 0.4);
    const bl = ((Math.PI * 2 * r) / nT) * 0.62;
    for (let i = 0; i < nT; i++) {
      for (const side of [-1, 1]) {
        const a = ((i + (side > 0 ? 0.5 : 0)) / nT) * Math.PI * 2;
        b.add(BASIC.box, { x: side * (bw / 2 + 0.014), y: Math.cos(a) * r, z: Math.sin(a) * r, rx: a, sx: bw, sy: 0.028, sz: bl, color: W });
      }
    }
  }
  if (opt.treads) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      b.add(BASIC.box, { y: Math.cos(a) * r, z: Math.sin(a) * r, rx: a, sx: w * 0.9, sy: 0.12, sz: 0.15, color: W });
    }
  }
  const nSp = opt.spokes || 5;
  const lip = new THREE.TorusGeometry(r * 0.64, 0.028, 5, 28);
  const red = opt.redline ? new THREE.TorusGeometry(r * 0.8, 0.016, 5, 32) : null;
  for (const sx of [-1, 1]) {
    const xo = sx * (w / 2 - t * 0.6);
    b.add(BASIC.cyl24, { x: xo, rz: Math.PI / 2, sx: r * 0.66, sy: 0.03, sz: r * 0.66, color: rimCol, smooth: true });
    b.add(lip, { x: xo + sx * 0.02, ry: Math.PI / 2, color: CHROME, smooth: true });
    b.add(BASIC.cyl24, { x: xo + sx * 0.035, rz: Math.PI / 2, sx: r * 0.17, sy: 0.06, sz: r * 0.17, color: CHROME, smooth: true });
    for (let i = 0; i < nSp; i++) {
      const a = (i / nSp) * Math.PI * 2;
      const len = r * 0.46;
      const d = r * 0.15 + len / 2;
      b.add(BASIC.box, { x: xo + sx * 0.022, y: Math.cos(a) * d, z: Math.sin(a) * d, rx: a, sx: 0.028, sy: len, sz: Math.max(0.05, r * 0.15), color: CHROME });
    }
    if (red) b.add(red, { x: sx * (w / 2 - 0.004), ry: Math.PI / 2, color: RED, smooth: true });
    // Radmuttern um die Nabe
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      b.add(BASIC.cyl12, { x: xo + sx * 0.05, y: Math.cos(a) * r * 0.105, z: Math.sin(a) * r * 0.105, rz: Math.PI / 2, sx: 0.017, sy: 0.034, sz: 0.017, color: DRIM, smooth: true });
    }
    // Flankenbeschriftung: zwei Bögen kleiner heller „Buchstaben" auf der Reifenschulter
    const rl = r - t;
    const LW = [0.018, 0.022, 0.012, 0.02, 0.016, 0.024, 0.014, 0.02];
    for (const a0 of [0.4, Math.PI + 0.4]) {
      let a = a0;
      for (const lw of LW) {
        a += (lw / 2 + 0.006) / rl;
        b.add(BASIC.box, { x: sx * (w / 2 + 0.002), y: Math.cos(a) * rl, z: Math.sin(a) * rl, rx: a, sx: 0.006, sy: Math.min(0.03, t * 0.36), sz: lw, color: LETTER });
        a += (lw / 2 + 0.006) / rl;
      }
    }
  }
  lip.dispose();
  if (red) red.dispose();
  const g = b.build();
  wheelCache.set(key, g);
  return g;
}

// Einfaches Rad für Hologramm-Echos (bis zu 36 gleichzeitig – wenig Dreiecke)
function echoWheelGeometry(ws) {
  // gleiche Attribute wie die Karosserie (inkl. pbr), sonst scheitert das Zusammenfügen
  const b = new GeoBuilder(false, true);
  b.add(BASIC.cyl12, { rz: Math.PI / 2, sx: ws.r, sy: ws.w, sz: ws.r, smooth: true });
  return b.build();
}

const cache = new Map();

export function carGeometry(type, color) {
  const key = type + ':' + color;
  if (cache.has(key)) return cache.get(key);
  const body = new GeoBuilder(false, true);
  // Material je Farbe: [Rauheit, Metall] – Lack hochglänzend metallic (Spielzeugauto-Look)
  body.pbrMap = {
    [color]: [0.16, 0.62],
    [D]: [0.45, 0.3, 1],
    [G]: [0.04, 0.55],
    [CHROME]: [0.08, 1.0],
    [ACC]: [0.25, 0.15],
    [FL1]: [0.25, 0.2],
    [FL2]: [0.25, 0.2],
  };
  const lights = new GeoBuilder();
  const spec = (BUILDERS[type] || BUILDERS[0])(body, lights, color, color);
  const bodyGeo = body.build();
  // aPaint = 1 für alle Lackflächen (erkannt am Material-Eintrag der Lackfarbe) → Lack-Effekte nur dort
  const pb = bodyGeo.attributes.pbr.array;
  const paint = new Float32Array(pb.length / 2);
  const r0 = Math.fround(0.16);
  const m0 = Math.fround(0.62);
  for (let i = 0; i < paint.length; i++) paint[i] = pb[i * 2] === r0 && pb[i * 2 + 1] === m0 ? 1 : 0;
  bodyGeo.setAttribute('aPaint', new THREE.BufferAttribute(paint, 1));
  const res = {
    body: bodyGeo,
    lights: lights.build(),
    spec,
    wheelF: wheelGeometry(spec.f, spec),
    wheelR: wheelGeometry(spec.r, spec),
  };
  cache.set(key, res);
  return res;
}

function wheelLayout(s) {
  return [
    [-1, s.f, true],
    [1, s.f, true],
    [-1, s.r, false],
    [1, s.r, false],
  ];
}

// Neutrale Silhouette (Karosserie + Räder + Fahrerfigur) für Hologramm-Echos
const echoCache = new Map();
export function echoGeometry(type, driver = 0) {
  const key = type + ':' + driver;
  if (echoCache.has(key)) return echoCache.get(key);
  const g = carGeometry(type, '#ffffff');
  const parts = [g.body.clone()];
  parts[0].deleteAttribute('aPaint');
  parts.push(...driverStaticGeometry(driver, g.spec.seat, g.spec.steer));
  for (const [sx, ws, front] of wheelLayout(g.spec)) {
    const wg = echoWheelGeometry(ws);
    wg.translate(sx * ws.x, ws.r, ws.z);
    parts.push(wg);
  }
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  echoCache.set(key, merged);
  return merged;
}

// Lackierungen: Rauheit/Metall der Lackflächen + Farbeffekt (nach den Normalen, vor der Beleuchtung)
const FINISH = {
  standard: { r: 0.16, m: 0.62, fx: '' },
  matte: { r: 0.6, m: 0.08, fx: '' },
  chrome: { r: 0.05, m: 1.0, fx: 'diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(1.0), 0.4), vPaint);' },
  gold: { r: 0.12, m: 1.0, fx: 'diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(1.0, 0.7, 0.24), diffuseColor.rgb, 0.12), vPaint);' },
  pearl: {
    r: 0.2,
    m: 0.45,
    fx: `float frP = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 1.4);
      vec3 irid = 0.5 + 0.5 * cos(6.2831 * (frP * 0.9 + vec3(0.0, 0.33, 0.67)));
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, irid, 0.15 + 0.55 * frP), vPaint);`,
  },
  holo: {
    r: 0.16,
    m: 0.55,
    fx: `float frH = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 1.2);
      float band = vObj.z * 1.4 + vObj.y * 1.8 - uTime * 0.9 + frH * 1.6;
      vec3 rb = 0.5 + 0.5 * cos(6.2831 * (band + vec3(0.0, 0.33, 0.67)));
      diffuseColor.rgb = mix(diffuseColor.rgb, rb, 0.8 * vPaint);
      totalEmissiveRadiance += rb * vPaint * (0.12 + 0.18 * frH);`,
  },
  carbon: {
    r: 0.3,
    m: 0.35,
    fx: `vec2 cw = vec2(vObj.x + vObj.y, vObj.z - vObj.y) * 7.0;
      float a1 = step(0.5, fract(cw.x));
      float a2 = step(0.5, fract(cw.y));
      float weave = mix(a1, 1.0 - a1, a2);
      vec3 cb = mix(vec3(0.02, 0.022, 0.026), vec3(0.07, 0.075, 0.085), weave) + diffuseColor.rgb * 0.05;
      diffuseColor.rgb = mix(diffuseColor.rgb, cb, vPaint);`,
  },
  // Zwei weiße Längsstreifen über Haube, Cockpit und Heck (Kanten per fwidth geglättet, bleiben scharf)
  stripes: {
    r: 0.14,
    m: 0.6,
    fx: `float sxS = abs(vObj.x);
      float aaS = fwidth(sxS) * 0.8 + 1e-4;
      float stS = smoothstep(0.1 - aaS, 0.1 + aaS, sxS) * (1.0 - smoothstep(0.3 - aaS, 0.3 + aaS, sxS));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.94, 0.96), stS * vPaint);`,
  },
  // Candy: satter, dunkler Grundton unter dickem Klarlack, zur Kante hin heller
  candy: {
    r: 0.06,
    m: 0.78,
    fx: `float frC = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
      vec3 cc = diffuseColor.rgb;
      vec3 deep = cc * cc * cc * 0.9 + cc * 0.08;
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(deep, min(cc * 1.3, vec3(1.0)), frC * 0.85), vPaint);`,
  },
  // Abendrot: Verlauf Gelb-Orange (vorn) → Pink → Violett (hinten)
  sunset: {
    r: 0.2,
    m: 0.38,
    fx: `float tS = clamp(vObj.z * 0.48 + 0.45 + vObj.y * 0.06, 0.0, 1.0);
      vec3 sun = mix(vec3(0.3, 0.06, 0.55), vec3(0.95, 0.12, 0.36), smoothstep(0.0, 0.55, tS));
      sun = mix(sun, vec3(1.0, 0.46, 0.06), smoothstep(0.5, 1.0, tS));
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(sun, diffuseColor.rgb, 0.1), vPaint);`,
  },
  // Neonkante: fast schwarzer Lack, an den Silhouettenkanten leuchtet die Fahrerfarbe
  neon: {
    r: 0.3,
    m: 0.2,
    fx: `float frN = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 4.0);
      vec3 cn = diffuseColor.rgb;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.012, 0.018), vPaint);
      totalEmissiveRadiance += cn * vPaint * smoothstep(0.08, 0.5, frN) * 1.8;`,
  },
  // Galaxie: Nachthimmel-Verlauf mit funkelnden Sternen (in der Ferne ausgeblendet → kein Flimmern)
  galaxy: {
    r: 0.24,
    m: 0.3,
    fx: `vec3 gp = vObj * 6.5;
      vec3 gid = floor(gp);
      vec3 gf = fract(gp) - 0.5;
      float gh = fract(sin(dot(gid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float neb = 0.5 + 0.5 * sin(vObj.x * 2.3 + vObj.z * 1.7) * sin(vObj.y * 3.1 - vObj.z * 1.1);
      float neb2 = 0.5 + 0.5 * sin(vObj.z * 3.7 - vObj.x * 1.3 + 1.7);
      vec3 sky = mix(vec3(0.025, 0.015, 0.1), vec3(0.3, 0.07, 0.48), neb);
      sky = mix(sky, vec3(0.08, 0.36, 0.6), neb2 * neb2 * 0.55) + diffuseColor.rgb * 0.06;
      float far = 1.0 - smoothstep(0.16, 0.5, length(fwidth(gp)));
      float star = step(0.66, gh) * smoothstep(0.24, 0.05, length(gf - (gh - 0.83) * 0.5)) * far;
      float tw = 0.6 + 0.4 * sin(uTime * 3.0 + gh * 60.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, sky, vPaint);
      totalEmissiveRadiance += (sky * 0.12 + vec3(1.0, 0.95, 0.88) * star * tw * 2.4) * vPaint;`,
  },
};

// Lackmaterial: Standard-PBR mit Rauheit/Metall aus dem Vertex-Attribut "pbr", Lackflächen je nach Lackierung
// Feinstruktur je Materialklasse (Attribut aMat, Lackflächen über aPaint): triplanar in Objektkoordinaten,
// damit das Muster am Teil haftet. Webmuster (Carbon, Stoff) oder Körnung (Gummi, Metall, Lack, Leder, Haar).
const MAT_PARS = /* glsl */ `
uniform sampler2D uDetG;
uniform sampler2D uDetF;
uniform mat3 normalMatrix;
varying float vMat;
varying vec3 vObjN;
vec4 matTri(sampler2D t, vec3 p, vec3 w) {
  vec4 a = texture2D(t, p.zy);
  vec4 b = texture2D(t, p.xz);
  vec4 c = texture2D(t, p.xy);
  vec2 ga = a.gb * 2.0 - 1.0;
  vec2 gb = b.gb * 2.0 - 1.0;
  vec2 gc = c.gb * 2.0 - 1.0;
  return vec4(a.a * w.x + b.a * w.y + c.a * w.z, vec3(0.0, ga.y, ga.x) * w.x + vec3(gb.x, 0.0, gb.y) * w.y + vec3(gc.x, gc.y, 0.0) * w.z);
}`;

const MAT_COLOR = /* glsl */ `
float mCls = floor(vMat + 0.5);
if (mCls < 0.5 && vPaint > 0.5) mCls = 4.0;
// x: Kacheln je Meter, y: Helligkeit, z: Relief, w: Rauheits-Schwankung
vec4 mP = vec4(0.0);
vec3 mSt = vec3(1.0);
float mFab = 0.0;
if (mCls == 1.0) { mP = vec4(0.9, 0.42, 0.2, 0.3); mFab = 1.0; }        // Carbon
else if (mCls == 2.0) { mP = vec4(2.2, 0.12, 0.35, 0.0); }             // Gummi
else if (mCls == 3.0) { mP = vec4(3.3, 0.055, 0.06, 0.12); mSt = vec3(1.0, 0.08, 1.0); } // gebürstet
else if (mCls == 4.0) { mP = vec4(8.0, 0.04, 0.07, 0.0); }             // Lack mit Flakes
else if (mCls == 5.0) { mP = vec4(1.6, 0.13, 0.24, 0.1); mFab = 1.0; }  // Stoff
else if (mCls == 6.0) { mP = vec4(2.8, 0.14, 0.3, 0.06); }             // Leder
else if (mCls == 7.0) { mP = vec4(4.0, 0.25, 0.25, 0.1); mSt = vec3(1.0, 0.15, 1.0); } // Haar
vec3 mBl = pow(abs(normalize(vObjN)), vec3(4.0));
mBl /= mBl.x + mBl.y + mBl.z + 1e-5;
vec4 mS = mix(matTri(uDetG, vObj * mP.x * mSt, mBl), matTri(uDetF, vObj * mP.x, mBl), mFab);
mS.yzw *= mSt;
diffuseColor.rgb *= 1.0 + (mS.x - 0.5) * mP.y * 2.0;
// Schmutz an Unterkante von Lack und Carbon, Staub auf der Lauffläche der Reifen
float mGrime = (1.0 - smoothstep(0.15, 0.5, vObj.y)) * step(0.5, max(vPaint, 1.0 - abs(mCls - 1.0)));
diffuseColor.rgb *= 1.0 - mGrime * (0.1 + 0.12 * mS.x);
if (mCls == 2.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.13, 0.1), (1.0 - smoothstep(0.3, 0.7, abs(normalize(vObjN).x))) * 0.28);`;

const MAT_NORMAL = /* glsl */ `
{
  vec3 mGV = normalMatrix * mS.yzw;
  normal = normalize(normal - (mGV - dot(mGV, normal) * normal) * mP.z);
}`;

export function makePaintMaterial(envK = 1, finish = 'standard') {
  const F = FINISH[finish] || FINISH.standard;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3, envMapIntensity: envK });
  const uTime = { value: 0 };
  m.userData.uTime = finish === 'holo' || finish === 'galaxy' ? uTime : null;
  const texG = detailTexture('grain');
  const texF = detailTexture('fabric');
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uDetG = { value: texG };
    sh.uniforms.uDetF = { value: texF };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 pbr;\nattribute float aPaint;\nattribute float aMat;\nvarying vec2 vPbr;\nvarying float vPaint;\nvarying float vMat;\nvarying vec3 vObj;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvPbr = pbr;\n\tvPaint = aPaint;\n\tvMat = aMat;\n\tvObj = position;\n\tvObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vPbr;\nvarying float vPaint;\nvarying vec3 vObj;' + MAT_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>' + MAT_COLOR)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = clamp(mix(vPbr.x, ${F.r.toFixed(3)}, vPaint) + (mS.x - 0.5) * mP.w * 2.0, 0.03, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = mix(vPbr.y, ${F.m.toFixed(3)}, vPaint);`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + MAT_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + F.fx);
  };
  m.customProgramCacheKey = () => 'echo-racer-paint-' + finish;
  return m;
}

// ---------- Scheinwerfer-Lichtkegel ----------
let beamGeo = null;
let beamMat = null;
let poolGeo = null;
const BEAM_LEN = 15;

function beamParts() {
  if (!beamGeo) {
    beamGeo = new THREE.ConeGeometry(2.3, BEAM_LEN, 18, 1, true);
    beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#fff1d6') }, uK: { value: 0.07 } },
      vertexShader: /* glsl */ `
        varying float vT;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vT = position.y / ${BEAM_LEN.toFixed(1)} + 0.5;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uK;
        varying float vT;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
          // clamp: pow() mit minimal negativer Basis ergäbe NaN (wird vom Bloom zu Flecken verschmiert)
          gl_FragColor = vec4(uColor * pow(clamp(vT, 0.0, 1.0), 1.7) * f * uK, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    poolGeo = new THREE.PlaneGeometry(4.6, 13);
  }
  return { beamGeo, beamMat, poolGeo };
}

// Komplettes Auto: root (Position/Richtung) > tilt (Neigung/Sprung) > Karosserie, Lichter, Räder
// Sponsor-Aufkleber als Quads mit Atlas-UVs (stickerAtlas). Seitenaufkleber: { side: [xb, yb, xt, yt] } = Seitenfläche
// von (xb, yb) unten nach (xt, yt) oben, auf beiden Seiten, Schrift von außen lesbar (links nach hinten, rechts nach
// vorn). Flache Aufkleber: { top: [z0, y0, z1, y1] } = Oberseite längs z (Haube, Heckflügel), von hinten lesbar
// (front: true = von vorn lesbar).
// Jeder Aufkleber ist ein Streifen aus 8 Feldern; seine Punkte werden per Strahl auf die Karosserie gelegt
// (folgt auch verdrehten Flächen). Ergebnis je Kart-Typ zwischengespeichert.
const stickerCache = new Map();
const SRAY = new THREE.Raycaster();
const SV = new THREE.Vector3();
const SD = new THREE.Vector3();
function stickerGeometry(type, list, bodyGeo) {
  let D0 = stickerCache.get(type);
  if (!D0) {
    D0 = stickerArrays(list, bodyGeo);
    stickerCache.set(type, D0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(D0.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(D0.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(D0.uv, 2));
  g.setIndex(D0.idx);
  return g;
}

function stickerArrays(list, bodyGeo) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const body = new THREE.Mesh(bodyGeo);
  const NU = 8;
  const OFF = 0.004;
  const quad = (c, u, v, n, w, h, R) => {
    const base = pos.length / 3;
    for (let i = 0; i <= NU; i++) {
      const a = i / NU - 0.5;
      for (const b of [-0.5, 0.5]) {
        const p = [0, 1, 2].map((k) => c[k] + u[k] * a * w + v[k] * b * h);
        // Punkt auf die Karosserie legen: Strahl von knapp außerhalb entgegen der Normale
        SRAY.set(SV.set(p[0] + n[0] * 0.06, p[1] + n[1] * 0.06, p[2] + n[2] * 0.06), SD.set(-n[0], -n[1], -n[2]));
        SRAY.far = 0.14;
        const hit = SRAY.intersectObject(body, false)[0];
        if (hit) for (let k = 0; k < 3; k++) p[k] = hit.point.getComponent(k) + n[k] * OFF;
        else for (let k = 0; k < 3; k++) p[k] += n[k] * OFF;
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
        uv.push(R[0] + (R[2] - R[0]) * (a + 0.5), b < 0 ? R[1] : R[3]);
      }
    }
    for (let i = 0; i < NU; i++) {
      const q = base + i * 2;
      idx.push(q, q + 2, q + 3, q, q + 3, q + 1);
    }
  };
  for (const s of list) {
    const R = stickerUV(s.id, s.banner);
    if (s.side) {
      const [xb, yb, xt, yt] = s.side;
      const x = xb + ((xt - xb) * (s.y - yb)) / (yt - yb);
      const l = Math.hypot(xt - xb, yt - yb);
      const vx = (xt - xb) / l;
      const vy = (yt - yb) / l;
      quad([x, s.y, s.z], [0, 0, -1], [vx, vy, 0], [vy, -vx, 0], s.w, s.h, R);
      quad([-x, s.y, s.z], [0, 0, 1], [-vx, vy, 0], [-vy, -vx, 0], s.w, s.h, R);
    } else {
      const [z0, y0, z1, y1] = s.top;
      const y = y0 + ((y1 - y0) * (s.z - z0)) / (z1 - z0);
      const l = Math.hypot(z1 - z0, y1 - y0);
      const vz = (z1 - z0) / l;
      const vy = (y1 - y0) / l;
      // Flügel-Banner von hinten lesbar (Verfolgerkamera), Haubenaufkleber (front) von vorn
      if (s.front) quad([s.x || 0, y, s.z], [1, 0, 0], [0, -vy, -vz], [0, vz, -vy], s.w, s.h, R);
      else quad([s.x || 0, y, s.z], [-1, 0, 0], [0, vy, vz], [0, vz, -vy], s.w, s.h, R);
    }
  }
  return { pos, nor, uv, idx };
}

export function buildCar(type, color, { envK = 1, beams = false, shadows = true, number = null, finish = 'standard', driver = 0 } = {}) {
  const geo = carGeometry(type, color);
  const s = geo.spec;
  const bodyMat = makePaintMaterial(envK, finish);
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const body = new THREE.Mesh(geo.body, bodyMat);
  body.castShadow = shadows;
  const lights = new THREE.Mesh(geo.lights, lightMat);
  tilt.add(body, lights);
  const wheels = [];
  for (const [sx, ws, front] of wheelLayout(s)) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * ws.x, ws.r, ws.z);
    if (s.camber) pivot.rotation.z = sx * s.camber;
    const m = new THREE.Mesh(front ? geo.wheelF : geo.wheelR, bodyMat);
    m.castShadow = shadows;
    pivot.add(m);
    tilt.add(pivot);
    wheels.push({ pivot, mesh: m, front, r: ws.r });
  }
  // Fahrerfigur im offenen Cockpit (teilt das Lackmaterial: eigene Teile haben kein aPaint)
  const drv = buildDriver(driver, bodyMat, lightMat, s.seat, s.steer, shadows);
  tilt.add(drv.root);
  // Startnummer auf beiden Seiten
  let numMat = null;
  let numGeo = null;
  if (number != null && s.decal) {
    numMat = new THREE.MeshStandardMaterial({
      map: numberTexture(number),
      transparent: true,
      roughness: 0.3,
      metalness: 0,
      envMapIntensity: envK * 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    numGeo = new THREE.CircleGeometry(s.decal.r, 24);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(numGeo, numMat);
      m.position.set(sx * (s.decal.x + 0.012), s.decal.y, s.decal.z);
      m.rotation.y = (sx * Math.PI) / 2;
      tilt.add(m);
    }
  }
  // Bremslicht-Glühen
  const brakeMat = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: new THREE.Color('#ff2030').multiplyScalar(0.9),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0,
  });
  const brake = new THREE.Mesh(new THREE.PlaneGeometry(s.tail.w + 0.7, 0.75), brakeMat);
  brake.position.set(0, s.tail.y, s.tail.z - 0.08);
  brake.rotation.y = Math.PI;
  tilt.add(brake);
  // Aufkleber hinten auf der Sitzlehne (Startnummer mit Stern) – aus der Verfolgerkamera gut sichtbar
  let seatMat = null;
  let seatGeo = null;
  if (number != null) {
    seatMat = new THREE.MeshStandardMaterial({ map: seatDecalTexture(number), transparent: true, roughness: 0.35, metalness: 0, envMapIntensity: envK * 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    seatGeo = new THREE.PlaneGeometry(0.46, 0.46);
    seatGeo.rotateY(Math.PI);
    seatGeo.rotateX(Math.atan2(0.12, 0.82));
    const m = new THREE.Mesh(seatGeo, seatMat);
    m.position.set(0, s.seat.y + 0.33, s.seat.z - 0.444);
    tilt.add(m);
  }
  // Sponsor-Aufkleber (Seiten, Haube, Heckflügel)
  let stickers = null;
  let stickerMat = null;
  if (s.stickers && s.stickers.length) {
    stickerMat = new THREE.MeshStandardMaterial({ map: stickerAtlas(), alphaTest: 0.5, roughness: 0.32, metalness: 0, envMapIntensity: envK * 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    stickers = new THREE.Mesh(stickerGeometry(type, s.stickers, geo.body), stickerMat);
    tilt.add(stickers);
  }
  const extra = { brake, brakeMat, numMat, numGeo, seatMat, seatGeo, stickers, stickerMat };
  if (beams) {
    const { beamGeo: bg, beamMat: bm, poolGeo: pg } = beamParts();
    for (const sx of [-1, 1]) {
      const beam = new THREE.Mesh(bg, bm);
      beam.rotation.x = -Math.PI / 2;
      beam.position.set(sx * s.head.x, s.head.y, s.head.z + BEAM_LEN / 2);
      tilt.add(beam);
    }
    const poolMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: new THREE.Color('#fff0d0').multiplyScalar(0.28),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pool = new THREE.Mesh(pg, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.06, s.head.z + 7.5);
    root.add(pool);
    extra.pool = pool;
    extra.poolMat = poolMat;
  }
  return { root, tilt, body, lights, bodyMat, lightMat, wheels, spec: s, driver: drv, ...extra };
}

export function disposeCar(car) {
  car.bodyMat.dispose();
  car.lightMat.dispose();
  car.brakeMat.dispose();
  car.brake.geometry.dispose();
  if (car.poolMat) car.poolMat.dispose();
  if (car.numMat) car.numMat.dispose();
  if (car.numGeo) car.numGeo.dispose();
  if (car.seatMat) car.seatMat.dispose();
  if (car.seatGeo) car.seatGeo.dispose();
  if (car.stickers) car.stickers.geometry.dispose();
  if (car.stickerMat) car.stickerMat.dispose();
}
