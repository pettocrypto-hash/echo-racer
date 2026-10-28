// Prozedurale Texturen (Canvas) – keine externen Bilddateien nötig.

import * as THREE from 'three';
import { mulberry32 } from '../util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, { repeat = false, srgb = true, aniso = 8, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = aniso;
  if (nearest) t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// Spielzeug-Rennbahn: glänzendes Plastik mit Spurrillen, Mittelrippe, Randstreifen und Steckverbindung.
// Kachel = 8 m Bahnstück (v), u = quer über die Bahn (≈ 1,75× gröber als v – runde Formen in x gestaucht).
// 1024 px: feine Kunststoff-Körnung, Reifenabrieb, Kratzer, Steckverbindung mit Laschen und Schrauben,
// eingeprägte Sterne. Passende Normal-Map aus demselben Höhenbild: toyTrackNormal().
const TS = 1024;
const AX = 0.57; // Breite/Länge eines Pixels: runde Formen in x um diesen Faktor stauchen

// gemeinsamer Bauplan: zeichnet Farbe (mode 'color') oder Höhe (mode 'height', Grauwerte um 128)
function drawTrack(g, toy, mode) {
  const H = mode === 'height';
  const S = TS;
  const rnd = mulberry32(3);
  const ell = (x, y, ry) => {
    g.beginPath();
    g.ellipse(x, y, ry * AX, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  // Grund
  g.fillStyle = H ? 'rgb(128,128,128)' : toy.track;
  g.fillRect(0, 0, S, S);
  if (!H) {
    // Wölbung (Mitte heller, Ränder dunkler)
    const shade = g.createLinearGradient(0, 0, S, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.16)');
    shade.addColorStop(0.18, 'rgba(0,0,0,0)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    shade.addColorStop(0.82, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.16)');
    g.fillStyle = shade;
    g.fillRect(0, 0, S, S);
    // weiche Flecken (Spritzguss-Schlieren), kachelbar gezeichnet
    for (let i = 0; i < 46; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = 40 + rnd() * 120;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      for (const oy of [-S, 0, S]) g.fillRect(x - r, y - r + oy, r * 2, r * 2);
    }
    // Reifenabrieb: feine dunkle Spuren längs der Fahrtrichtung, Stärke schwankt periodisch (kachelbar)
    for (let i = 0; i < 70; i++) {
      let x = rnd() * S;
      if (Math.abs(x - S * 0.25) < 30 || Math.abs(x - S * 0.75) < 30 || Math.abs(x - S * 0.5) < 14 || x < 56 || x > S - 56) continue;
      const w = 1 + rnd() * 3;
      const a = 0.035 + rnd() * 0.06;
      const ph = rnd() * Math.PI * 2;
      const k = 1 + Math.floor(rnd() * 3);
      for (let y = 0; y < S; y += 8) {
        const f = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * k + ph);
        g.fillStyle = `rgba(20,16,14,${(a * f).toFixed(3)})`;
        g.fillRect(x, y, w, 8);
        x += Math.sin((y / S) * Math.PI * 2 * k + ph * 2) * 0.35;
      }
    }
  }
  // Kratzer: kurz, meist in Fahrtrichtung, helle Kante mit dunkler Rille daneben
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const len = 6 + rnd() * 46;
    const a = (rnd() - 0.5) * 0.9;
    const dx = Math.sin(a) * len * AX;
    const dy = Math.cos(a) * len;
    g.lineWidth = 1;
    g.strokeStyle = H ? 'rgba(100,100,100,0.35)' : `rgba(255,255,255,${(0.05 + rnd() * 0.09).toFixed(3)})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + dx, y + dy);
    g.stroke();
    if (!H) {
      g.strokeStyle = 'rgba(0,0,0,0.05)';
      g.beginPath();
      g.moveTo(x + 1, y);
      g.lineTo(x + 1 + dx, y + dy);
      g.stroke();
    }
  }
  // Spurrillen: weiches Profil, Licht- und Schattenkante
  for (const u of [0.25, 0.75]) {
    const x = u * S;
    if (H) {
      const gr = g.createLinearGradient(x - 24, 0, x + 24, 0);
      gr.addColorStop(0, 'rgb(128,128,128)');
      gr.addColorStop(0.16, 'rgb(84,84,84)');
      gr.addColorStop(0.5, 'rgb(56,56,56)');
      gr.addColorStop(0.84, 'rgb(84,84,84)');
      gr.addColorStop(1, 'rgb(128,128,128)');
      g.fillStyle = gr;
      g.fillRect(x - 24, 0, 48, S);
    } else {
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.fillRect(x - 20, 0, 40, S);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(x - 20, 0, 6, S);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(x + 18, 0, 5, S);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x - 3, 0, 6, S);
    }
  }
  // Mittelrippe
  if (H) {
    const gr = g.createLinearGradient(S / 2 - 10, 0, S / 2 + 10, 0);
    gr.addColorStop(0, 'rgb(128,128,128)');
    gr.addColorStop(0.5, 'rgb(176,176,176)');
    gr.addColorStop(1, 'rgb(128,128,128)');
    g.fillStyle = gr;
    g.fillRect(S / 2 - 10, 0, 20, S);
  } else {
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(S / 2 - 8, 0, 16, S);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(S / 2 + 8, 0, 4, S);
  }
  // Randstreifen (leicht erhaben)
  g.fillStyle = H ? 'rgb(150,150,150)' : toy.stripe;
  g.globalAlpha = H ? 1 : 0.9;
  g.fillRect(24, 0, 24, S);
  g.fillRect(S - 48, 0, 24, S);
  g.globalAlpha = 1;
  // eingeprägte Sterne in den Außenspuren (Fahrbahnmitte des Bahnstücks)
  const star = (cx, cy, r) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = k % 2 ? r * 0.45 : r;
      g.lineTo(cx + Math.cos(a) * rr * AX, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  };
  for (const u of [0.135, 0.865]) {
    g.fillStyle = H ? 'rgb(150,150,150)' : 'rgba(255,255,255,0.1)';
    star(u * S, S * 0.55, 34);
  }
  // Steckverbindung zwischen zwei Bahnstücken: Fuge, Laschen, Schrauben
  if (H) {
    g.fillStyle = 'rgb(30,30,30)';
    g.fillRect(0, 0, S, 8);
    g.fillStyle = 'rgb(110,110,110)';
    g.fillRect(0, 8, S, 6);
  } else {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 0, S, 9);
    g.fillStyle = 'rgba(255,255,255,0.32)';
    g.fillRect(0, 9, S, 5);
  }
  for (const x of [160, S - 160, S * 0.375, S * 0.625]) {
    const wide = x === 160 || x === S - 160;
    const lw = wide ? 88 : 56;
    g.fillStyle = H ? 'rgb(146,146,146)' : 'rgba(0,0,0,0.26)';
    g.fillRect(x - lw / 2, 0, lw, 44);
    g.fillStyle = H ? 'rgb(128,128,128)' : 'rgba(255,255,255,0.18)';
    g.fillRect(x - lw / 2, 44, lw, 3);
    for (const dx of wide ? [-22, 22] : [0]) {
      g.fillStyle = H ? 'rgb(200,200,200)' : 'rgba(40,40,44,0.7)';
      ell(x + dx, 22, 9);
      g.fillStyle = H ? 'rgb(120,120,120)' : 'rgba(255,255,255,0.45)';
      g.fillRect(x + dx - 4, 20, 8, 3);
    }
  }
}

// Pixel-Körnung (Spritzguss-Oberfläche) direkt in die Bilddaten
function grainPixels(g, amount, seed) {
  const img = g.getImageData(0, 0, TS, TS);
  const d = img.data;
  const rnd = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() + rnd() - 1) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
}

export function toyTrackTexture(toy) {
  return cached('toytrack:' + toy.track + toy.stripe, () => {
    const c = canvas(TS, TS);
    const g = c.getContext('2d');
    drawTrack(g, toy, 'color');
    grainPixels(g, 11, 5);
    return finish(c, { repeat: true, aniso: 16 });
  });
}

// Normal-Map der Bahn (Rillen, Rippe, Fuge, Laschen, Schrauben, Sterne, Kratzer, feine Körnung)
export function toyTrackNormal() {
  return cached('toytrackNormal', () => {
    const c = canvas(TS, TS);
    const g = c.getContext('2d');
    drawTrack(g, { track: '#808080', stripe: '#969696' }, 'height');
    const src = g.getImageData(0, 0, TS, TS).data;
    const img = g.createImageData(TS, TS);
    const d = img.data;
    const h = (x, y) => src[(((y + TS) % TS) * TS + ((x + TS) % TS)) * 4] / 255;
    const k = 6;
    for (let y = 0; y < TS; y++) {
      for (let x = 0; x < TS; x++) {
        // Bild-y zeigt nach unten = v nimmt ab (flipY) → Vorzeichen der y-Komponente gedreht
        const nx = -(h(x + 1, y) - h(x - 1, y)) * k;
        const ny = (h(x, y + 1) - h(x, y - 1)) * k;
        const l = Math.hypot(nx, ny, 1);
        const i = (y * TS + x) * 4;
        d[i] = Math.round((nx / l * 0.5 + 0.5) * 255);
        d[i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
        d[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return finish(c, { repeat: true, srgb: false, aniso: 16 });
  });
}

// Seitenleiste (Innen- und Außenwand): u = 8 m längs (Fuge passend zu den Bahnstößen), v = Höhe (oben = Bildzeile 0).
// Zwei gespritzte Rippen, Fuge mit Lichtkante, Schrauben alle 2 m. Farbe weiß-basiert (wird mit der Leistenfarbe multipliziert).
const RW_ = 1024;
const RH_ = 128;
function drawRail(g, mode) {
  const H = mode === 'height';
  g.fillStyle = H ? 'rgb(128,128,128)' : '#ffffff';
  g.fillRect(0, 0, RW_, RH_);
  if (!H) {
    const v = g.createLinearGradient(0, 0, 0, RH_);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.1)');
    g.fillStyle = v;
    g.fillRect(0, 0, RW_, RH_);
  }
  // obere Kante (abgerundet)
  g.fillStyle = H ? 'rgb(150,150,150)' : 'rgba(255,255,255,0.4)';
  g.fillRect(0, 0, RW_, 5);
  g.fillStyle = H ? 'rgb(110,110,110)' : 'rgba(0,0,0,0.08)';
  g.fillRect(0, 5, RW_, 3);
  // Rippen
  for (const y of [0.3 * RH_, 0.64 * RH_]) {
    if (H) {
      const gr = g.createLinearGradient(0, y - 6, 0, y + 6);
      gr.addColorStop(0, 'rgb(128,128,128)');
      gr.addColorStop(0.5, 'rgb(184,184,184)');
      gr.addColorStop(1, 'rgb(128,128,128)');
      g.fillStyle = gr;
      g.fillRect(0, y - 6, RW_, 12);
    } else {
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillRect(0, y - 5, RW_, 4);
      g.fillStyle = 'rgba(0,0,0,0.13)';
      g.fillRect(0, y + 1, RW_, 4);
    }
  }
  // Fuge am Bahnstoß
  g.fillStyle = H ? 'rgb(30,30,30)' : 'rgba(0,0,0,0.4)';
  g.fillRect(0, 0, 5, RH_);
  g.fillStyle = H ? 'rgb(140,140,140)' : 'rgba(255,255,255,0.4)';
  g.fillRect(5, 0, 3, RH_);
  // Schrauben alle 2 m (runde Köpfe, Pixel längs gröber als quer)
  for (let x = 128; x < RW_; x += 256) {
    const y = 0.47 * RH_;
    g.fillStyle = H ? 'rgb(205,205,205)' : 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(x, y, 6.5, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = H ? 'rgb(170,170,170)' : 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(x - 1, y - 2, 4, 5.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = H ? 'rgb(120,120,120)' : 'rgba(0,0,0,0.35)';
    g.fillRect(x - 4, y - 1, 8, 2);
  }
}

export function railTexture() {
  return cached('rail', () => {
    const c = canvas(RW_, RH_);
    const g = c.getContext('2d');
    drawRail(g, 'color');
    const img = g.getImageData(0, 0, RW_, RH_);
    const rnd = mulberry32(31);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rnd() + rnd() - 1) * 6;
      for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, img.data[i + k] + n));
    }
    g.putImageData(img, 0, 0);
    return finish(c, { repeat: true, aniso: 16 });
  });
}

export function railNormal() {
  return cached('railNormal', () => {
    const c = canvas(RW_, RH_);
    const g = c.getContext('2d');
    drawRail(g, 'height');
    const src = g.getImageData(0, 0, RW_, RH_).data;
    const img = g.createImageData(RW_, RH_);
    const h = (x, y) => src[(Math.min(RH_ - 1, Math.max(0, y)) * RW_ + ((x + RW_) % RW_)) * 4] / 255;
    const k = 5;
    for (let y = 0; y < RH_; y++) {
      for (let x = 0; x < RW_; x++) {
        const nx = -(h(x + 1, y) - h(x - 1, y)) * k;
        const ny = (h(x, y + 1) - h(x, y - 1)) * k;
        const l = Math.hypot(nx, ny, 1);
        const i = (y * RW_ + x) * 4;
        img.data[i] = Math.round((nx / l * 0.5 + 0.5) * 255);
        img.data[i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
        img.data[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return finish(c, { repeat: true, srgb: false, aniso: 16 });
  });
}

// Rauheit für Plastik (Grünkanal): glatt mit leichter Streuung
export function plasticRoughTexture() {
  return cached('plasticRough', () => {
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(92,92,92)';
    g.fillRect(0, 0, 128, 128);
    const rnd = mulberry32(8);
    for (let i = 0; i < 700; i++) {
      const v = 70 + Math.floor(rnd() * 60);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(rnd() * 128, rnd() * 128, 2, 2);
    }
    return finish(c, { repeat: true, srgb: false });
  });
}

// Spielteppich mit aufgedruckten Straßen (Neon-Welt-Boden)
export function playmatTexture() {
  return cached('playmat', () => {
    const c = canvas(512, 512);
    const g = c.getContext('2d');
    g.fillStyle = '#17123a';
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#231c52';
    g.fillRect(0, 0, 256, 256);
    g.fillRect(256, 256, 256, 256);
    const road = (x, y, w, h) => {
      g.fillStyle = '#2f2a5a';
      g.fillRect(x, y, w, h);
    };
    road(0, 108, 512, 40);
    road(0, 364, 512, 40);
    road(108, 0, 40, 512);
    road(364, 0, 40, 512);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 512; k += 24) {
      g.fillRect(k, 127, 12, 2);
      g.fillRect(k, 383, 12, 2);
      g.fillRect(127, k, 2, 12);
      g.fillRect(383, k, 2, 12);
    }
    // Zebrastreifen
    for (let k = 0; k < 6; k++) {
      g.fillRect(150 + k * 6, 110, 3, 36);
      g.fillRect(406 + k * 6, 366, 3, 36);
    }
    g.strokeStyle = 'rgba(155,107,255,0.6)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 510, 510);
    return finish(c, { repeat: true });
  });
}

// Pfeile für Boostfelder (werden additiv gezeichnet)
export function padTexture() {
  return cached('pad', () => {
    const c = canvas(128, 256);
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 256);
    const grd = g.createLinearGradient(0, 0, 128, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0.04)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    grd.addColorStop(1, 'rgba(255,255,255,0.04)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 2; k++) {
      const y = 40 + k * 128;
      g.beginPath();
      g.moveTo(16, y + 50);
      g.lineTo(64, y);
      g.lineTo(112, y + 50);
      g.lineTo(112, y + 76);
      g.lineTo(64, y + 26);
      g.lineTo(16, y + 76);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 6;
    g.strokeRect(3, -10, 122, 276);
    return finish(c, { repeat: true });
  });
}

export function checkerTexture() {
  return cached('checker', () => {
    const c = canvas(128, 32);
    const g = c.getContext('2d');
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 16; x++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#fafafa';
        g.fillRect(x * 8, y * 8, 8, 8);
      }
    }
    return finish(c, { nearest: true });
  });
}

// Weicher runder Lichtfleck (Unterbodenlicht, Partikel, Sonne)
export function glowTexture() {
  return cached('glow', () => {
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return finish(c, { srgb: false });
  });
}

export function shadowTexture() {
  return cached('shadow', () => {
    const c = canvas(64, 128);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 64, 4, 32, 64, 62);
    grd.addColorStop(0, 'rgba(0,0,0,0.75)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.save();
    g.scale(1, 1);
    g.fillRect(0, 0, 64, 128);
    g.restore();
    return finish(c, { srgb: false });
  });
}

// Fenster für Hochhäuser (als Leuchttextur)
export function windowTexture() {
  return cached('windows', () => {
    const c = canvas(256, 512);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 512);
    const rnd = mulberry32(42);
    const cols = ['#ff4fd8', '#33e0ff', '#ffd36b', '#ffffff', '#9a7bff'];
    for (let y = 8; y < 512; y += 24) {
      for (let x = 8; x < 256; x += 20) {
        if (rnd() < 0.42) {
          g.fillStyle = cols[Math.floor(rnd() * cols.length)];
          g.globalAlpha = 0.35 + rnd() * 0.65;
          g.fillRect(x, y, 12, 14);
          // Fensterkreuz
          g.globalAlpha = 0.5;
          g.fillStyle = '#000';
          g.fillRect(x + 5, y, 2, 14);
          g.fillRect(x, y + 6, 12, 2);
        }
      }
    }
    g.globalAlpha = 1;
    return finish(c, { repeat: true, aniso: 16 });
  });
}

// weicher Fleck, kachelbar gezeichnet (Verlauf wandert über translate mit)
function wrapBlob(g, S, x, y, r, inner) {
  for (const ox of [-S, 0, S]) {
    for (const oy of [-S, 0, S]) {
      if (x + ox + r < 0 || x + ox - r > S || y + oy + r < 0 || y + oy - r > S) continue;
      g.save();
      g.translate(ox, oy);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, inner);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.restore();
    }
  }
}

// Pixel-Rauschen (Helligkeit) über eine ganze Leinwand
function noisePixels(g, S, amount, seed) {
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  const rnd = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() + rnd() - 1) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
}

// Pflaster für den Lunapark (9,6 m je Kachel): Rechtecksteine im Läuferverband, warme Grau- und Sandtöne,
// vereinzelt rötliche Steine, dunkle Fugen, hell/dunkel abgesetzte Kanten (wirkt erhaben), feines Korn
export function pavingTexture() {
  return cached('paving', () => {
    const S = 1024;
    const PW = 128;
    const PH = 64;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    const rnd = mulberry32(91);
    g.fillStyle = '#4c4248';
    g.fillRect(0, 0, S, S);
    const cols = ['#9a8e92', '#a69a96', '#8e8488', '#b0a49c', '#988c8e', '#a2968e'];
    // Stein an x und (über den Rand) bei x ± S zeichnen – nahtlos kachelbar
    const stone = (x, y, col) => {
      for (const ox of [-S, 0, S]) {
        const X = x + ox;
        if (X + PW < 0 || X > S) continue;
        g.fillStyle = col;
        g.fillRect(X + 3, y + 3, PW - 6, PH - 6);
        g.fillStyle = 'rgba(255,255,255,0.13)';
        g.fillRect(X + 3, y + 3, PW - 6, 3);
        g.fillRect(X + 3, y + 3, 3, PH - 6);
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.fillRect(X + 3, y + PH - 6, PW - 6, 3);
        g.fillRect(X + PW - 6, y + 3, 3, PH - 6);
      }
    };
    for (let row = 0; row < S / PH; row++) {
      const off = (row % 2) * (PW / 2);
      for (let i = -1; i <= S / PW; i++) {
        let col = cols[Math.floor(rnd() * cols.length)];
        if (rnd() < 0.07) col = rnd() < 0.5 ? '#b0766a' : '#a8826a';
        stone(i * PW + off, row * PH, col);
      }
    }
    // Flecken und Abrieb
    for (let i = 0; i < 70; i++) wrapBlob(g, S, rnd() * S, rnd() * S, 20 + rnd() * 70, rnd() < 0.5 ? 'rgba(255,240,220,0.05)' : 'rgba(30,20,30,0.06)');
    noisePixels(g, S, 16, 5);
    return finish(c, { repeat: true, aniso: 16 });
  });
}

// Rasen (34 m je Kachel): Mähstreifen, Flecken, dichte Halme, Kleeinseln, Gänseblümchen und Löwenzahn
export function grassTexture() {
  return cached('grass', () => {
    const S = 1024;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    const rnd = mulberry32(77);
    g.fillStyle = '#5aa83a';
    g.fillRect(0, 0, S, S);
    // Mähstreifen
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,40,0,0.06)';
      g.fillRect(0, (i * S) / 4, S, S / 4);
    }
    // Flecken
    for (let i = 0; i < 120; i++) {
      const l = rnd() < 0.5;
      wrapBlob(g, S, rnd() * S, rnd() * S, 20 + rnd() * 90, l ? 'rgba(140,210,90,0.22)' : 'rgba(30,90,30,0.2)');
    }
    // Halme
    for (let i = 0; i < 70000; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const k = rnd();
      g.fillStyle = k < 0.45 ? 'rgba(40,110,30,0.5)' : k < 0.9 ? 'rgba(150,220,100,0.42)' : 'rgba(200,240,140,0.5)';
      g.fillRect(x, y, 1, 2 + rnd() * 5);
    }
    // Kleeinseln: dreiblättrige Tupfen, etwas dunkler
    for (let i = 0; i < 70; i++) {
      const cx = rnd() * S;
      const cy = rnd() * S;
      for (let k = 0; k < 14; k++) {
        const x = cx + (rnd() - 0.5) * 34;
        const y = cy + (rnd() - 0.5) * 34;
        g.fillStyle = 'rgba(46,120,40,0.6)';
        for (let p = 0; p < 3; p++) {
          const a = (p / 3) * Math.PI * 2 + k;
          g.beginPath();
          g.arc((x + Math.cos(a) * 2.2 + S) % S, (y + Math.sin(a) * 2.2 + S) % S, 1.9, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // Gänseblümchen und Löwenzahn
    for (let i = 0; i < 160; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const dand = rnd() < 0.2;
      g.fillStyle = dand ? 'rgba(255,214,40,0.95)' : 'rgba(255,255,255,0.92)';
      for (let p = 0; p < (dand ? 8 : 6); p++) {
        const a = (p / (dand ? 8 : 6)) * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, 1.5, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = dand ? '#e8a010' : '#ffd23d';
      g.beginPath();
      g.arc(x, y, 1.3, 0, Math.PI * 2);
      g.fill();
    }
    noisePixels(g, S, 9, 78);
    return finish(c, { repeat: true, aniso: 16 });
  });
}

// Startnummer für die Türen (weißer Kreis, schwarze Zahl)
export function numberTexture(n) {
  return cached('num:' + n, () => {
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#16141e';
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(64, 64, 54, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.font = 'italic 900 78px system-ui, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 64, 70);
    return finish(c);
  });
}

// Aufkleber für die Rückseite der Sitzlehne: Stern, große Startnummer, „ECHO" (weiß auf transparentem Grund)
export function seatDecalTexture(n) {
  return cached('seat:' + n, () => {
    const S = 256;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowBlur = 0;
    g.shadowOffsetX = 3;
    g.shadowOffsetY = 3;
    g.fillStyle = '#ffffff';
    // Stern
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const r = k % 2 ? 15 : 34;
      g.lineTo(S / 2 + Math.cos(a) * r, 48 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    // Startnummer mit Tempo-Strichen
    g.font = 'italic 900 118px system-ui, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), S / 2 + 4, 150);
    for (const [y, w] of [[128, 34], [150, 46], [172, 28]]) {
      g.fillRect(20, y - 4, w, 8);
      g.fillRect(S - 20 - w, y - 4, w, 8);
    }
    g.font = '900 34px system-ui, "Segoe UI", sans-serif';
    g.fillText('E C H O', S / 2, 228);
    return finish(c);
  });
}

// Kurven-Pfeiltafel (weiße Pfeile auf Rot)
export function chevronTexture() {
  return cached('chevron', () => {
    const c = canvas(512, 256);
    const g = c.getContext('2d');
    g.scale(2, 2);
    g.fillStyle = '#e8202e';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 3; k++) {
      const x = 40 + k * 70;
      g.beginPath();
      g.moveTo(x, 20);
      g.lineTo(x + 40, 64);
      g.lineTo(x, 108);
      g.lineTo(x + 22, 108);
      g.lineTo(x + 62, 64);
      g.lineTo(x + 22, 20);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 250, 122);
    return finish(c, { aniso: 16 });
  });
}

// Spruchband (Tribüne): Schriftzug passend skaliert, Kanten in Textfarbe; wiederholbar (u > 1 = Kacheln)
export function bannerTexture(text, fg, bg) {
  return cached('banner:' + text + fg + bg, () => {
    const c = canvas(2048, 128);
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 2048, 128);
    g.fillStyle = fg;
    g.fillRect(0, 0, 2048, 7);
    g.fillRect(0, 121, 2048, 7);
    let size = 76;
    g.font = `italic 900 ${size}px system-ui, "Segoe UI", sans-serif`;
    const w = g.measureText(text).width;
    if (w > 1900) {
      size = Math.floor((size * 1900) / w);
      g.font = `italic 900 ${size}px system-ui, "Segoe UI", sans-serif`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 1024, 68);
    return finish(c, { aniso: 16, repeat: true });
  });
}

export function gridTexture(lineColor) {
  return cached('grid:' + lineColor, () => {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = lineColor;
    g.lineWidth = 3;
    g.globalAlpha = 0.9;
    g.strokeRect(0, 0, 256, 256);
    g.globalAlpha = 0.35;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(128, 0);
    g.lineTo(128, 256);
    g.moveTo(0, 128);
    g.lineTo(256, 128);
    g.stroke();
    return finish(c, { repeat: true });
  });
}

// kachelbares Wertrauschen als Funktion (u, v in Kachel-Einheiten, Periode 1)
function tileNoise(P, rnd) {
  const g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (u, v) => {
    const fx = (u - Math.floor(u)) * P;
    const fy = (v - Math.floor(v)) * P;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const x0 = ix % P;
    const x1 = (ix + 1) % P;
    const y0 = (iy % P) * P;
    const y1 = ((iy + 1) % P) * P;
    const a = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * sx;
    const b = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * sx;
    return a + (b - a) * sy;
  };
}

// Lava-Kruste (50 m je Kachel): Basaltplatten mit glühenden Rissen, gewellt und teils unterbrochen.
// glow = Leuchtkarte (gelb-orangener Kern, roter Hof), crust = Farbe der Platten (an den Rissen angeglüht)
export function lavaTextures(base, S = 1024) {
  return cached('lava:' + base + S, () => {
    const rnd = mulberry32(5);
    const cells = (C, jit) => {
      const p = new Float32Array(C * C * 3);
      for (let i = 0; i < C * C; i++) {
        p[i * 3] = 0.5 + (rnd() - 0.5) * jit;
        p[i * 3 + 1] = 0.5 + (rnd() - 0.5) * jit;
        p[i * 3 + 2] = rnd();
      }
      return p;
    };
    const CB = 6;
    const CS = 15;
    const big = cells(CB, 0.9);
    const small = cells(CS, 1);
    let eId = 0;
    // Abstand zur nächsten Zellgrenze (f2 − f1), dazu Zufallswert der Zelle in eId
    const edge = (P, C, fx, fy) => {
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);
      let d1 = 9;
      let d2 = 9;
      let id = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const gy = cy + oy;
          const k = ((((gy % C) + C) % C) * C + (((gx % C) + C) % C)) * 3;
          const dx = gx + P[k] - fx;
          const dy = gy + P[k + 1] - fy;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = P[k + 2];
          } else if (d < d2) d2 = d;
        }
      }
      eId = id;
      return Math.sqrt(d2) - Math.sqrt(d1);
    };
    const wx = tileNoise(5, rnd);
    const wy = tileNoise(5, rnd);
    const wid = tileNoise(9, rnd);
    const brk = tileNoise(7, rnd);
    const mott = tileNoise(48, rnd);
    const glowC = canvas(S, S);
    const crustC = canvas(S, S);
    const gG = glowC.getContext('2d');
    const gC = crustC.getContext('2d');
    const glow = gG.createImageData(S, S);
    const crust = gC.createImageData(S, S);
    const bc = new THREE.Color(base);
    const br = Math.round(Math.pow(bc.r, 1 / 2.2) * 255);
    const bg = Math.round(Math.pow(bc.g, 1 / 2.2) * 255);
    const bb = Math.round(Math.pow(bc.b, 1 / 2.2) * 255);
    const nrnd = mulberry32(51);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const du = (wx(u, v) - 0.5) * 0.09;
        const dv = (wy(u, v) - 0.5) * 0.09;
        const e1 = edge(big, CB, (u + du) * CB, (v + dv) * CB);
        const plate = eId;
        const e2 = edge(small, CS, (u + du * 1.6) * CS, (v + dv * 1.6) * CS);
        const w1 = 0.022 + wid(u, v) * 0.05;
        const core1 = Math.exp(-((e1 / w1) ** 2));
        const halo1 = Math.exp(-((e1 / (w1 * 4.5)) ** 2));
        const on2 = Math.min(1, Math.max(0, (brk(u, v) - 0.45) * 5));
        const core2 = Math.exp(-((e2 / 0.035) ** 2)) * on2 * 0.75;
        const halo2 = Math.exp(-((e2 / 0.12) ** 2)) * on2 * 0.35;
        const core = Math.max(core1, core2);
        const halo = Math.max(halo1 * 0.45, halo2 * 0.8);
        const i = (y * S + x) * 4;
        glow.data[i] = Math.min(255, (core + halo * 0.85) * 255);
        glow.data[i + 1] = Math.min(255, (core * 0.72 + halo * 0.16) * 255);
        glow.data[i + 2] = Math.min(255, (core * 0.3 + halo * 0.03) * 255);
        glow.data[i + 3] = 255;
        // Kruste: Platten leicht unterschiedlich, feine Sprenkel, an den Rissen dunkel-rötlich angeglüht
        const k = 1.7 * (0.8 + plate * 0.4 + (mott(u, v) - 0.5) * 0.35 + (nrnd() - 0.5) * 0.18);
        const heat = Math.min(1, halo * 1.3);
        crust.data[i] = Math.min(255, br * k * (1 - heat * 0.3) + heat * 120);
        crust.data[i + 1] = Math.min(255, bg * k * (1 - heat * 0.5) + heat * 26);
        crust.data[i + 2] = Math.min(255, bb * k * (1 - heat * 0.6) + heat * 10);
        crust.data[i + 3] = 255;
      }
    }
    gG.putImageData(glow, 0, 0);
    gC.putImageData(crust, 0, 0);
    return { glow: finish(glowC, { repeat: true, aniso: 16 }), crust: finish(crustC, { repeat: true, aniso: 16 }) };
  });
}

// Wüstensand (40 m je Kachel): helle/dunkle Mulden, wellige Windstreifen, Kiesel und kleine Steine
export function sandTexture(base) {
  return cached('sand:' + base, () => {
    const S = 1024;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    const rnd = mulberry32(9);
    for (let i = 0; i < 46; i++) {
      const l = rnd() < 0.5;
      wrapBlob(g, S, rnd() * S, rnd() * S, 60 + rnd() * 200, l ? 'rgba(255,240,210,0.1)' : 'rgba(120,60,20,0.09)');
    }
    // Windwellen: kurze, gebogene Bögen (helle Kämme mit Schatten dahinter), kachelbar versetzt gezeichnet
    for (let i = 0; i < 260; i++) {
      const x0 = rnd() * S;
      const y0 = rnd() * S;
      const len = 40 + rnd() * 160;
      const bend = (rnd() - 0.5) * 30;
      const a = 0.04 + rnd() * 0.06;
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          if (x0 + ox + len < 0 || x0 + ox > S || y0 + oy + 40 < 0 || y0 + oy - 40 > S) continue;
          for (const [dy, colr] of [[0, `rgba(255,244,220,${a.toFixed(3)})`], [2.5, `rgba(120,62,24,${(a * 0.9).toFixed(3)})`]]) {
            g.strokeStyle = colr;
            g.lineWidth = 1.6;
            g.beginPath();
            g.moveTo(x0 + ox, y0 + oy + dy);
            g.quadraticCurveTo(x0 + ox + len / 2, y0 + oy + dy + bend, x0 + ox + len, y0 + oy + dy);
            g.stroke();
          }
        }
      }
    }
    // Kiesel: kleine Punkte mit Lichtkante
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = 0.8 + rnd() * 1.8;
      const dark = rnd() < 0.6;
      g.fillStyle = dark ? 'rgba(110,62,30,0.45)' : 'rgba(255,246,226,0.5)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // kleine Steine mit Schatten
    for (let i = 0; i < 70; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = 1.6 + rnd() * 2.2;
      g.fillStyle = 'rgba(80,40,15,0.35)';
      g.beginPath();
      g.ellipse(x + r * 0.4, y + r * 0.35, r, r * 0.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ['#b8835a', '#a89a8c', '#c9a07a', '#8f7a6a', '#d8c0a0', '#9a5a40'][Math.floor(rnd() * 6)];
      g.beginPath();
      g.ellipse(x, y, r, r * 0.8, rnd() * 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.beginPath();
      g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      g.fill();
    }
    noisePixels(g, S, 8, 10);
    return finish(c, { repeat: true, aniso: 16 });
  });
}

// Schriftzug für das Startportal
export function textTexture(text, color, bg = 'rgba(0,0,0,0)', w = 512, h = 64) {
  return cached('text:' + text + color + bg, () => {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.font = `italic 900 ${Math.floor(h * 0.72)}px system-ui, "Segoe UI", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 2);
    return finish(c);
  });
}

export function nameTexture(text, color, rival = false) {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  g.font = '700 30px system-ui, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (rival) text = '⚔ ' + text;
  const w = Math.min(240, g.measureText(text).width + 28);
  // Rivale: rotes Schild mit goldenem Rand
  g.fillStyle = rival ? 'rgba(150,12,36,0.85)' : 'rgba(8,6,20,0.62)';
  const x0 = 128 - w / 2;
  g.beginPath();
  g.roundRect ? g.roundRect(x0, 10, w, 44, 22) : g.rect(x0, 10, w, 44);
  g.fill();
  if (rival) {
    g.strokeStyle = '#ffd23d';
    g.lineWidth = 3;
    g.stroke();
  }
  g.fillStyle = color;
  g.fillRect(x0 + 14, 26, 10, 12);
  g.fillStyle = '#fff';
  g.fillText(text, 128 + 8, 33);
  return finish(c);
}

// Atlas mit 8 Neon-Werbetafeln (2 Spalten × 4 Zeilen)
export function billboardAtlas() {
  return cached('billboards', () => {
    const c = canvas(1024, 1024);
    const g = c.getContext('2d');
    g.scale(2, 2);
    const words = [
      ['ECHO', '#2ce7ff', '#ff3dd0'],
      ['HACK', '#ff3dd0', '#ffd23d'],
      ['DRIFT', '#ffd23d', '#ff3dd0'],
      ['NEON', '#9b6bff', '#2ce7ff'],
      ['BOOST', '#6bff5c', '#2ce7ff'],
      ['GLITCH', '#ff4f6a', '#9b6bff'],
      ['RACER', '#2ce7ff', '#ffd23d'],
      ['24/7', '#ff9a2e', '#ff3dd0'],
    ];
    words.forEach(([text, c1, c2], i) => {
      const x = (i % 2) * 256;
      const y = Math.floor(i / 2) * 128;
      const grd = g.createLinearGradient(x, y, x + 256, y + 128);
      grd.addColorStop(0, '#120a28');
      grd.addColorStop(1, '#05030c');
      g.fillStyle = grd;
      g.fillRect(x, y, 256, 128);
      g.strokeStyle = c2;
      g.lineWidth = 5;
      g.shadowColor = c2;
      g.shadowBlur = 12;
      g.strokeRect(x + 10, y + 10, 236, 108);
      g.font = 'italic 900 64px system-ui, "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = c1;
      g.shadowBlur = 18;
      g.fillStyle = c1;
      g.fillText(text, x + 128, y + 68);
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText(text, x + 128, y + 68);
      g.globalAlpha = 0.25;
      for (let k = 0; k < 128; k += 4) {
        g.fillStyle = '#000';
        g.fillRect(x, y + k, 256, 1.5);
      }
      g.globalAlpha = 1;
    });
    return finish(c);
  });
}

export function setAnisotropy(tex, value) {
  if (tex && tex.anisotropy !== value) {
    tex.anisotropy = value;
    tex.needsUpdate = true;
  }
  return tex;
}

// Aufgemalter Kurvenpfeil für die Fahrbahn (weiß, biegt nach rechts ab; für Linkskurven u spiegeln)
export function roadArrowTexture() {
  return cached('roadArrow', () => {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    const path = () => {
      g.beginPath();
      g.moveTo(96, 256);
      g.lineTo(96, 150);
      g.quadraticCurveTo(96, 84, 168, 84);
    };
    // dunkler Rand, dann weiße Farbe (wirkt wie aufgesprüht)
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 50;
    path();
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.moveTo(160, 22);
    g.lineTo(252, 84);
    g.lineTo(160, 146);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 40;
    path();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.moveTo(166, 32);
    g.lineTo(240, 84);
    g.lineTo(166, 136);
    g.closePath();
    g.fill();
    return finish(c, { aniso: 16 });
  });
}

// Werbebanden: 17 erfundene Sponsoren (eigene Marken, teils nach den Fahrern benannt). Atlas mit 2 Spalten à
// 1024 × 128 px – Seitenverhältnis 8:1 wie die Tafeln. Reihenfolge = SPONSOR_IDS (Feld i: Spalte i % 2, Zeile i >> 1)
export const SPONSOR_IDS = ['volt', 'kiko', 'byte', 'zed', 'mira', 'nyx', 'rune', 'juno', 'echofm', 'toffee', 'glitch', 'pops', 'oase', 'lavalino', 'wolke', 'zwerg', 'zucker'];
export const SPONSOR_ROWS = Math.ceil(SPONSOR_IDS.length / 2);

const SP_FONT = (weight, px, italic = true, family = 'system-ui, "Segoe UI", Arial, sans-serif') => `${italic ? 'italic ' : ''}${weight} ${px}px ${family}`;

// Schriftzug, der höchstens maxW breit wird; liefert die tatsächliche Breite
function spText(g, text, x, y, px, maxW, fill, { stroke = null, lw = 0, weight = 900, italic = true, family, align = 'left', shadow = null, glow = null } = {}) {
  g.font = SP_FONT(weight, px, italic, family);
  let w = g.measureText(text).width;
  if (w > maxW) {
    px = Math.floor((px * maxW) / w);
    g.font = SP_FONT(weight, px, italic, family);
    w = g.measureText(text).width;
  }
  g.textAlign = align;
  g.textBaseline = 'middle';
  if (shadow) {
    g.fillStyle = shadow;
    g.fillText(text, x + 4, y + 5);
  }
  if (stroke) {
    g.lineJoin = 'round';
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.strokeText(text, x, y);
  }
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = 16;
  }
  g.fillStyle = fill;
  g.fillText(text, x, y);
  g.shadowBlur = 0;
  return w;
}

function spRound(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

// Grund: Fläche (Farbe oder Verlauf), feiner Rahmen, leichter Glanz oben (bedrucktes Kunststoffschild)
function spPlate(g, W, H, bg, frame, bg2 = null) {
  if (bg2) {
    const lg = g.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, bg);
    lg.addColorStop(1, bg2);
    g.fillStyle = lg;
  } else g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const gl = g.createLinearGradient(0, 0, 0, H);
  gl.addColorStop(0, 'rgba(255,255,255,0.16)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0.03)');
  gl.addColorStop(1, 'rgba(0,0,0,0.10)');
  g.fillStyle = gl;
  g.fillRect(0, 0, W, H);
  if (frame) {
    g.strokeStyle = frame;
    g.lineWidth = 5;
    spRound(g, 7, 7, W - 14, H - 14, 14);
    g.stroke();
  }
}

// schräge Streifen am rechten Rand (Renn-Look)
function spStripes(g, W, H, x0, cols, w = 26) {
  g.save();
  g.beginPath();
  g.rect(x0, 12, W - x0 - 12, H - 24);
  g.clip();
  for (let i = 0, x = x0 - H; x < W; i++, x += w) {
    g.fillStyle = cols[i % cols.length];
    g.beginPath();
    g.moveTo(x, H);
    g.lineTo(x + H, 0);
    g.lineTo(x + H + w * 0.55, 0);
    g.lineTo(x + w * 0.55, H);
    g.closePath();
    g.fill();
  }
  g.restore();
}

const SPONSOR_DRAW = {
  volt(g, W, H) {
    spPlate(g, W, H, '#141414', 'rgba(255,210,61,0.9)');
    g.fillStyle = '#ffd23d';
    g.beginPath();
    g.arc(86, 64, 44, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#141414';
    g.beginPath();
    g.moveTo(96, 26);
    g.lineTo(66, 70);
    g.lineTo(86, 70);
    g.lineTo(74, 104);
    g.lineTo(108, 56);
    g.lineTo(88, 56);
    g.closePath();
    g.fill();
    const w = spText(g, 'VOLT', 152, 66, 90, 330, '#ffd23d');
    spText(g, 'BATTERIEN MIT WUMMS', 152 + w + 28, 68, 34, 560, '#ffffff', { weight: 800 });
    spStripes(g, W, H, 900, ['#ffd23d', '#141414']);
  },
  kiko(g, W, H) {
    spPlate(g, W, H, '#ff9a2e', 'rgba(255,255,255,0.95)', '#ff7a1f');
    g.fillStyle = '#e2a24f';
    g.beginPath();
    g.arc(86, 64, 44, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b8742c';
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = '#5a3518';
    for (const [x, y, r] of [[70, 46, 7], [100, 50, 6], [82, 70, 8], [108, 78, 6], [64, 84, 6], [94, 96, 5]]) {
      g.beginPath();
      g.ellipse(x, y, r, r * 0.8, 0.6, 0, Math.PI * 2);
      g.fill();
    }
    const w = spText(g, 'KIKO', 152, 64, 92, 320, '#ffffff', { stroke: '#7a4310', lw: 12 });
    spText(g, 'KNUSPER-KEKSE', 152 + w + 30, 68, 40, 540, '#5a3518', { weight: 900 });
  },
  byte(g, W, H) {
    spPlate(g, W, H, '#06180e', 'rgba(107,255,92,0.75)');
    g.fillStyle = 'rgba(107,255,92,0.07)';
    for (let x = 16; x < W - 16; x += 16) for (let y = 16; y < H - 16; y += 16) if ((x * 7 + y * 13) % 5 === 0) g.fillRect(x, y, 12, 12);
    const P = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
    g.fillStyle = '#ff4f6a';
    P.forEach((row, j) => [...row].forEach((ch, i) => ch === '1' && g.fillRect(52 + i * 11, 33 + j * 11, 10, 10)));
    g.fillStyle = '#6bff5c';
    g.fillRect(52, 101, 76, 6);
    const w = spText(g, 'BYTE BITS', 152, 66, 82, 520, '#6bff5c', { weight: 'bold', italic: false, family: '"Courier New", Consolas, monospace', glow: 'rgba(107,255,92,0.7)' });
    spText(g, 'PIXEL-CHIPS', 152 + w + 32, 68, 34, 300, '#d8ffd0', { weight: 'bold', italic: false, family: '"Courier New", Consolas, monospace' });
  },
  zed(g, W, H) {
    spPlate(g, W, H, '#ffffff', null);
    g.fillStyle = '#e8202e';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(190, 0);
    g.lineTo(150, H);
    g.lineTo(0, H);
    g.closePath();
    g.fill();
    // Zündkerze: Isolator mit Rippen, Sechskant, Gewinde, Masseelektrode, Funke
    g.fillStyle = '#ffffff';
    spRound(g, 70, 12, 28, 48, 9);
    g.fill();
    g.fillStyle = '#d8d8e0';
    for (let y = 22; y < 54; y += 9) g.fillRect(72, y, 24, 3);
    g.fillStyle = '#9da0ac';
    g.fillRect(62, 58, 44, 16);
    g.fillStyle = '#6e717c';
    g.fillRect(74, 58, 3, 16);
    g.fillRect(91, 58, 3, 16);
    g.fillStyle = '#c3c6d0';
    g.fillRect(72, 74, 24, 22);
    g.fillStyle = '#8a8d98';
    for (let y = 78; y < 96; y += 5) g.fillRect(72, y, 24, 2);
    g.fillStyle = '#c3c6d0';
    g.fillRect(82, 96, 4, 8);
    g.fillRect(92, 96, 4, 14);
    g.fillRect(84, 106, 12, 4);
    g.fillStyle = '#ffd23d';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 4 : 13;
      g.lineTo(66 + Math.cos(a) * r, 108 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    const w = spText(g, 'ZED', 204, 64, 96, 260, '#e8202e');
    spText(g, 'ZÜNDKERZEN', 204 + w + 30, 68, 40, 440, '#1d1d24', { weight: 900 });
    spStripes(g, W, H, 880, ['#e8202e', '#ffffff', '#1d1d24', '#ffffff']);
    g.strokeStyle = '#e8202e';
    g.lineWidth = 5;
    spRound(g, 7, 7, W - 14, H - 14, 14);
    g.stroke();
  },
  mira(g, W, H) {
    spPlate(g, W, H, '#2f7df6', 'rgba(255,255,255,0.95)', '#5aa7ff');
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(86, 20);
    g.bezierCurveTo(112, 54, 122, 70, 122, 82);
    g.arc(86, 82, 36, 0, Math.PI);
    g.bezierCurveTo(50, 70, 60, 54, 86, 20);
    g.fill();
    g.fillStyle = '#9fd0ff';
    g.beginPath();
    g.ellipse(74, 84, 7, 12, -0.3, 0, Math.PI * 2);
    g.fill();
    const w = spText(g, 'MIRA', 152, 64, 92, 330, '#ffffff', { shadow: 'rgba(10,40,120,0.35)' });
    spText(g, 'FRISCHE MILCH', 152 + w + 30, 68, 40, 520, '#ffffff', { weight: 800 });
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y, r] of [[930, 40, 16], [968, 76, 22], [900, 92, 12]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  },
  nyx(g, W, H) {
    spPlate(g, W, H, '#1a0836', 'rgba(255,95,208,0.85)', '#3a1170');
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const x = 150 + ((i * 197) % 860);
      const y = 16 + ((i * 53) % 96);
      g.globalAlpha = 0.25 + ((i * 7) % 5) / 8;
      g.fillRect(x, y, 3, 3);
    }
    g.globalAlpha = 1;
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.arc(108, 50, 37, 0, Math.PI * 2);
    g.clip('evenodd');
    g.fillStyle = '#ffd23d';
    g.shadowColor = 'rgba(255,210,61,0.7)';
    g.shadowBlur = 14;
    g.beginPath();
    g.arc(86, 64, 42, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = '#ffffff';
    for (const [x, y, r] of [[116, 92, 3], [128, 70, 2], [104, 104, 2]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const w = spText(g, 'NYX', 152, 64, 96, 300, '#ff5fd0', { glow: '#ff5fd0' });
    spText(g, 'NACHT-COLA', 152 + w + 30, 68, 42, 480, '#ffffff', { weight: 900 });
  },
  rune(g, W, H) {
    spPlate(g, W, H, '#1b1b20', 'rgba(255,255,255,0.6)');
    g.fillStyle = '#0d0d10';
    g.beginPath();
    g.arc(86, 64, 46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3a3a44';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.save();
      g.translate(86 + Math.cos(a) * 40, 64 + Math.sin(a) * 40);
      g.rotate(a);
      g.fillRect(-4, -6, 8, 12);
      g.restore();
    }
    g.fillStyle = '#c9ccd6';
    g.beginPath();
    g.arc(86, 64, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#6a6e7a';
    g.beginPath();
    g.arc(86, 64, 8, 0, Math.PI * 2);
    g.fill();
    const w = spText(g, 'RUNE', 152, 64, 92, 320, '#ffffff');
    spText(g, 'REIFEN · GRIP FÜR JEDE KURVE', 152 + w + 30, 68, 30, 880 - (152 + w + 30) - 16, '#c4c6d0', { weight: 800 });
    // Zielflaggen-Karos rechts
    for (let x = 0; x < 6; x++) for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? '#ffffff' : '#1b1b20';
      g.fillRect(900 + x * 18, 28 + y * 18, 18, 18);
    }
  },
  juno(g, W, H) {
    spPlate(g, W, H, '#eefbff', 'rgba(11,61,122,0.9)');
    g.fillStyle = '#2ce7ff';
    g.fillRect(12, H - 30, W - 24, 10);
    g.fillStyle = '#0b3d7a';
    g.beginPath();
    g.arc(86, 64, 44, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(54, 74 - i * 2);
      g.quadraticCurveTo(90, 66 - i * 12, 122, 40 + i * 4);
      g.quadraticCurveTo(96, 72 - i * 8, 58, 82 - i * 2);
      g.closePath();
      g.globalAlpha = 1 - i * 0.18;
      g.fill();
    }
    g.globalAlpha = 1;
    const w = spText(g, 'JUNO JETS', 152, 62, 84, 480, '#0b3d7a');
    spText(g, 'FLIEG MIT!', 152 + w + 30, 66, 38, 300, '#1e88e5', { weight: 900 });
  },
  echofm(g, W, H) {
    spPlate(g, W, H, '#ff3dd0', 'rgba(255,255,255,0.9)', '#7a2cff');
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.arc(86, 64, 46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    [14, 30, 52, 70, 46, 26, 12].forEach((h, i) => {
      spRound(g, 52 + i * 10, 64 - h / 2, 7, h, 3);
      g.fill();
    });
    const w = spText(g, 'ECHO FM', 152, 64, 88, 440, '#ffffff', { shadow: 'rgba(40,0,80,0.35)' });
    spText(g, 'RADIO 24/7', 152 + w + 30, 68, 40, 360, '#2ce7ff', { weight: 900 });
  },
  toffee(g, W, H) {
    spPlate(g, W, H, '#ffe14d', 'rgba(194,24,91,0.9)');
    spStripes(g, W, H, 860, ['#ff8ac8', '#ffffff']);
    g.fillStyle = '#ff4f9e';
    g.beginPath();
    g.ellipse(86, 64, 30, 22, 0, 0, Math.PI * 2);
    g.fill();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(86 + s * 26, 64);
      g.lineTo(86 + s * 50, 42);
      g.lineTo(86 + s * 46, 64);
      g.lineTo(86 + s * 50, 86);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(78, 56, 12, 6, -0.4, 0, Math.PI * 2);
    g.fill();
    const w = spText(g, 'TURBO-TOFFEE', 152, 64, 80, 520, '#c2185b');
    spText(g, 'SAHNEBONBONS', 152 + w + 26, 68, 30, 860 - (152 + w + 26) - 14, '#7a0f3a', { weight: 900 });
  },
  glitch(g, W, H) {
    spPlate(g, W, H, '#ff3dd0', 'rgba(255,255,255,0.9)');
    g.fillStyle = '#ffc2f0';
    g.beginPath();
    g.arc(86, 64, 42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.ellipse(72, 48, 12, 7, -0.6, 0, Math.PI * 2);
    g.fill();
    spText(g, 'GLITCH GUM', 148, 64, 84, 500, 'rgba(44,231,255,0.9)');
    spText(g, 'GLITCH GUM', 156, 64, 84, 500, 'rgba(255,40,80,0.85)');
    const w = spText(g, 'GLITCH GUM', 152, 64, 84, 500, '#ffffff');
    spText(g, 'KAUGUMMI', 152 + w + 30, 68, 40, 890 - (152 + w + 30) - 16, '#3a0a3a', { weight: 900 });
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(930, 30, 60, 6);
    g.fillRect(900, 60, 90, 6);
    g.fillRect(950, 90, 40, 6);
  },
  pops(g, W, H) {
    spPlate(g, W, H, '#2ce7ff', 'rgba(42,16,96,0.9)');
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 18; i++) {
      g.beginPath();
      g.arc(170 + ((i * 263) % 840), 20 + ((i * 41) % 90), 4 + (i % 3), 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#d9b07a';
    spRound(g, 80, 74, 12, 40, 5);
    g.fill();
    const lg = g.createLinearGradient(0, 18, 0, 84);
    lg.addColorStop(0, '#ff4f9e');
    lg.addColorStop(0.5, '#ffd23d');
    lg.addColorStop(1, '#ff7a1f');
    g.fillStyle = lg;
    spRound(g, 60, 18, 52, 66, 24);
    g.fill();
    const w = spText(g, 'PIXEL POPS', 152, 64, 84, 500, '#2a1060');
    spText(g, 'EIS AM STIEL', 152 + w + 30, 68, 38, 320, '#2a1060', { weight: 800 });
  },
  oase(g, W, H) {
    spPlate(g, W, H, '#14a898', 'rgba(255,243,196,0.95)', '#1cc7b4');
    g.fillStyle = '#ffd23d';
    g.beginPath();
    g.arc(92, 58, 34, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2b4a1e';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(80, 112);
    g.quadraticCurveTo(84, 80, 96, 50);
    g.stroke();
    g.fillStyle = '#2b6a2a';
    for (const a of [-2.6, -1.9, -1.2, -0.5, 0.2]) {
      g.beginPath();
      g.ellipse(96 + Math.cos(a) * 20, 50 + Math.sin(a) * 12, 24, 7, a, 0, Math.PI * 2);
      g.fill();
    }
    const w = spText(g, 'OASE', 152, 64, 92, 300, '#ffffff', { shadow: 'rgba(0,60,50,0.35)' });
    spText(g, 'KÜHLE LIMONADE', 152 + w + 30, 68, 40, 480, '#fff3c4', { weight: 900 });
  },
  lavalino(g, W, H) {
    spPlate(g, W, H, '#2a0d08', 'rgba(255,106,26,0.9)', '#4a1206');
    const fl = (s, c) => {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(86, 64 - 46 * s);
      g.bezierCurveTo(86 + 34 * s, 64 - 6 * s, 86 + 30 * s, 64 + 40 * s, 86, 64 + 42 * s);
      g.bezierCurveTo(86 - 30 * s, 64 + 40 * s, 86 - 36 * s, 64 + 4 * s, 86 - 12 * s, 64 - 20 * s);
      g.bezierCurveTo(86 - 10 * s, 64 - 4 * s, 86 - 2 * s, 64 - 2 * s, 86, 64 - 46 * s);
      g.fill();
    };
    fl(1, '#ff6a1a');
    fl(0.62, '#ffd23d');
    const w = spText(g, 'LAVALINO', 152, 64, 86, 460, '#ff7a1a', { glow: '#ff5a10' });
    spText(g, 'GLÜH-LIMO', 152 + w + 30, 68, 40, 320, '#ffd23d', { weight: 900 });
  },
  wolke(g, W, H) {
    spPlate(g, W, H, '#8fd3ff', 'rgba(45,111,179,0.85)', '#cbeeff');
    g.fillStyle = '#ffffff';
    for (const [x, y, r] of [[64, 72, 22], [86, 58, 28], [112, 70, 22], [88, 80, 22]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const w = spText(g, 'WOLKE 7', 152, 64, 90, 400, '#ffffff', { stroke: '#2d7dd2', lw: 12 });
    spText(g, 'LUFTMATRATZEN', 152 + w + 30, 68, 38, 460, '#2d6fb3', { weight: 900 });
  },
  zwerg(g, W, H) {
    spPlate(g, W, H, '#2f8f3a', 'rgba(255,210,61,0.9)', '#3aa848');
    g.fillStyle = '#ffe0c4';
    g.beginPath();
    g.arc(86, 72, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(66, 76);
    g.quadraticCurveTo(86, 124, 106, 76);
    g.closePath();
    g.fill();
    g.fillStyle = '#e8202e';
    g.beginPath();
    g.moveTo(62, 64);
    g.lineTo(110, 64);
    g.lineTo(90, 14);
    g.closePath();
    g.fill();
    const w = spText(g, 'GARTENZWERG', 152, 64, 80, 520, '#ffd23d', { shadow: 'rgba(0,40,0,0.35)' });
    spText(g, 'ALLES FÜR DEN GARTEN', 152 + w + 26, 68, 28, 300, '#ffffff', { weight: 800 });
  },
  zucker(g, W, H) {
    spPlate(g, W, H, '#ffb8e0', 'rgba(255,255,255,0.95)', '#ff8ccf');
    // Zuckerwatte: rosa Wolke auf gestreifter Papiertüte
    g.save();
    g.beginPath();
    g.moveTo(74, 70);
    g.lineTo(98, 70);
    g.lineTo(86, 118);
    g.closePath();
    g.clip();
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : '#2ca8ff';
      g.fillRect(70 + i * 5, 66, 5, 56);
    }
    g.restore();
    for (const [x, y, r, c] of [[72, 52, 20, '#ff7ac8'], [100, 50, 19, '#ff8fd4'], [86, 34, 21, '#ffa6dc'], [86, 60, 20, '#ff9ad6'], [70, 36, 13, '#ffc2e6'], [104, 32, 12, '#ffc2e6']]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const w = spText(g, 'ZUCKERWOLKE', 152, 64, 80, 520, '#ffffff', { stroke: '#c2185b', lw: 10 });
    spText(g, 'ZUCKERWATTE', 152 + w + 28, 68, 36, 300, '#7a1a5a', { weight: 900 });
  },
};

export function sponsorAtlas() {
  return cached('sponsors', () => {
    const W = 1024;
    const H = 128;
    const c = canvas(2 * W, SPONSOR_ROWS * H);
    const g = c.getContext('2d');
    SPONSOR_IDS.forEach((id, i) => {
      g.save();
      g.translate((i % 2) * W, (i >> 1) * H);
      g.beginPath();
      g.rect(0, 0, W, H);
      g.clip();
      SPONSOR_DRAW[id](g, W, H);
      g.restore();
    });
    return finish(c, { aniso: 16 });
  });
}

// Kart-Aufkleber: oben 4 × 4 kompakte Sticker (512 × 128, gestanzter weißer Folienrand, transparent außen),
// unten 2 × 4 Flügel-Banner (1024 × 128, Gestaltung wie die Werbebanden). Ein Atlas für alle Karts.
export const STICKER_IDS = ['volt', 'rune', 'zed', 'nyx', 'echofm', 'byte', 'pops', 'kiko', 'juno', 'glitch', 'toffee', 'mira', 'racer', 'turbo', 'hack', 'star'];
export const BANNER_IDS = ['zed', 'nyx', 'pops', 'volt', 'rune', 'echofm', 'byte', 'juno'];

const STICKER_LOOK = {
  volt: { bg: '#141414', fg: '#ffd23d', text: 'VOLT', icon: 'bolt' },
  rune: { bg: '#1b1b20', fg: '#ffffff', text: 'RUNE REIFEN' },
  zed: { bg: '#ffffff', fg: '#e8202e', text: 'ZED', icon: 'spark', ring: '#e8202e' },
  nyx: { bg: '#2a0f4f', bg2: '#4a1a8a', fg: '#ff5fd0', text: 'NYX COLA' },
  echofm: { bg: '#ff3dd0', bg2: '#7a2cff', fg: '#ffffff', text: 'ECHO FM' },
  byte: { bg: '#06180e', fg: '#6bff5c', text: 'BYTE BITS', mono: true },
  pops: { bg: '#2ce7ff', fg: '#2a1060', text: 'PIXEL POPS' },
  kiko: { bg: '#ff8a1f', fg: '#ffffff', text: 'KIKO', stroke: '#7a4310' },
  juno: { bg: '#eefbff', fg: '#0b3d7a', text: 'JUNO JETS' },
  glitch: { bg: '#ff3dd0', fg: '#ffffff', text: 'GLITCH GUM', split: true },
  toffee: { bg: '#ffe14d', fg: '#c2185b', text: 'TURBO-TOFFEE' },
  mira: { bg: '#2f7df6', bg2: '#5aa7ff', fg: '#ffffff', text: 'MIRA MILCH' },
  racer: { bg: '#0b0b12', fg: '#2ce7ff', text: '★ ECHO RACER', glow: '#2ce7ff' },
  turbo: { bg: '#e8202e', fg: '#ffffff', text: 'TURBO', icon: 'chev' },
  hack: { bg: '#141414', fg: '#6bff5c', text: '</HACK>', mono: true },
  star: { bg: '#ffd23d', fg: '#141414', text: '★ ★ ★' },
};

function drawSticker(g, W, H, L) {
  // gestanzter Folienrand
  g.fillStyle = '#ffffff';
  spRound(g, 3, 3, W - 6, H - 6, 30);
  g.fill();
  if (L.bg2) {
    const lg = g.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, L.bg);
    lg.addColorStop(1, L.bg2);
    g.fillStyle = lg;
  } else g.fillStyle = L.bg;
  spRound(g, 12, 12, W - 24, H - 24, 22);
  g.fill();
  const gl = g.createLinearGradient(0, 12, 0, H - 12);
  gl.addColorStop(0, 'rgba(255,255,255,0.18)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  spRound(g, 12, 12, W - 24, H - 24, 22);
  g.fill();
  if (L.ring) {
    g.strokeStyle = L.ring;
    g.lineWidth = 5;
    spRound(g, 18, 18, W - 36, H - 36, 18);
    g.stroke();
  }
  let x = W / 2;
  let maxW = W - 70;
  if (L.icon) {
    // Symbol links, Schrift rechts davon zentriert
    const cx = 74;
    g.fillStyle = L.fg;
    g.beginPath();
    if (L.icon === 'bolt') {
      g.moveTo(cx + 8, 30);
      g.lineTo(cx - 16, 68);
      g.lineTo(cx, 68);
      g.lineTo(cx - 8, 98);
      g.lineTo(cx + 18, 56);
      g.lineTo(cx + 2, 56);
    } else if (L.icon === 'spark') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? 9 : 30;
        g.lineTo(cx + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
    } else if (L.icon === 'chev') {
      for (const dx of [-14, 8]) {
        g.moveTo(cx + dx - 10, 36);
        g.lineTo(cx + dx + 12, 64);
        g.lineTo(cx + dx - 10, 92);
        g.lineTo(cx + dx - 2, 92);
        g.lineTo(cx + dx + 20, 64);
        g.lineTo(cx + dx - 2, 36);
      }
    }
    g.closePath();
    g.fill();
    x = (W + 120) / 2;
    maxW = W - 170;
  }
  const opt = { align: 'center', weight: 900 };
  if (L.mono) Object.assign(opt, { weight: 'bold', italic: false, family: '"Courier New", Consolas, monospace' });
  if (L.stroke) Object.assign(opt, { stroke: L.stroke, lw: 10 });
  if (L.glow) opt.glow = L.glow;
  if (L.split) {
    spText(g, L.text, x - 4, 66, 70, maxW, 'rgba(44,231,255,0.9)', opt);
    spText(g, L.text, x + 4, 66, 70, maxW, 'rgba(255,40,80,0.85)', opt);
  }
  spText(g, L.text, x, 66, 70, maxW, L.fg, opt);
}

export function stickerAtlas() {
  return cached('stickers', () => {
    const c = canvas(2048, 1024);
    const g = c.getContext('2d');
    STICKER_IDS.forEach((id, i) => {
      g.save();
      g.translate((i % 4) * 512, (i >> 2) * 128);
      g.beginPath();
      g.rect(0, 0, 512, 128);
      g.clip();
      drawSticker(g, 512, 128, STICKER_LOOK[id]);
      g.restore();
    });
    BANNER_IDS.forEach((id, i) => {
      g.save();
      g.translate((i % 2) * 1024, 512 + (i >> 1) * 128);
      g.beginPath();
      g.rect(0, 0, 1024, 128);
      g.clip();
      SPONSOR_DRAW[id](g, 1024, 128);
      g.restore();
    });
    return finish(c, { aniso: 16 });
  });
}

// UV-Rechteck [u0, v0, u1, v1] eines Stickers bzw. Flügel-Banners im Aufkleber-Atlas (v nach oben, flipY)
export function stickerUV(id, banner = false) {
  if (banner) {
    const i = Math.max(0, BANNER_IDS.indexOf(id));
    const u0 = (i % 2) * 0.5;
    const r = 4 + (i >> 1);
    return [u0 + 0.002, 1 - (r + 1) / 8 + 0.004, u0 + 0.498, 1 - r / 8 - 0.004];
  }
  const i = Math.max(0, STICKER_IDS.indexOf(id));
  const u0 = (i % 4) * 0.25;
  const r = i >> 2;
  return [u0 + 0.001, 1 - (r + 1) / 8 + 0.002, u0 + 0.249, 1 - r / 8 - 0.002];
}
