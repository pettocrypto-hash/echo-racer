// Feine Oberflächen-Details („Texturdichte") für Flächen ohne eigene UV-Textur.
// Eine kachelbare Detail-Textur (R = Höhe, GB = Höhengefälle, A = Helligkeit) wird im Shader
// in Weltkoordinaten triplanar gesampelt – auf Wunsch in zwei Maßstäben gegen sichtbare Kachelung.
// Sie hellt die Grundfarbe leicht auf bzw. dunkelt sie ab (Maserung, Körnung, Risse) und kippt
// die Normale entlang des Gefälles (feines Relief im Licht). In der Ferne mitteln die Mipmaps alles
// weg: kein Flimmern, aber aus der Nähe deutlich mehr Struktur.

import * as THREE from 'three';
import { mulberry32 } from '../util.js';

const N = 256;

// kachelbares Wertrauschen mit p Zellen pro Kachel (weich interpoliert)
function valueNoise(p, rnd) {
  const g = new Float32Array(p * p);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * p;
    const iy = Math.floor(fy);
    const ty = fy - iy;
    const sy = ty * ty * (3 - 2 * ty);
    const r0 = (iy % p) * p;
    const r1 = ((iy + 1) % p) * p;
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * p;
      const ix = Math.floor(fx);
      const tx = fx - ix;
      const sx = tx * tx * (3 - 2 * tx);
      const c0 = ix % p;
      const c1 = (ix + 1) % p;
      const a = g[r0 + c0] + (g[r0 + c1] - g[r0 + c0]) * sx;
      const b = g[r1 + c0] + (g[r1 + c1] - g[r1 + c0]) * sx;
      out[y * N + x] = a + (b - a) * sy;
    }
  }
  return out;
}

function fbm(octaves, rnd) {
  const out = new Float32Array(N * N);
  for (const [p, amp] of octaves) {
    const n = valueNoise(p, rnd);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
  }
  return out;
}

// Zellrauschen (kachelbar): Abstand zum nächsten (f1) und zweitnächsten (f2) Punkt, dazu eine Zufallszahl je Zelle.
// warp: { x, y, amp } verbiegt die Zellgrenzen (amp in Zellen)
function worley(c, rnd, jitter = 1, warp = null) {
  const px = new Float32Array(c * c);
  const py = new Float32Array(c * c);
  const pv = new Float32Array(c * c);
  for (let i = 0; i < c * c; i++) {
    px[i] = 0.5 + (rnd() - 0.5) * jitter;
    py[i] = 0.5 + (rnd() - 0.5) * jitter;
    pv[i] = rnd();
  }
  const f1 = new Float32Array(N * N);
  const f2 = new Float32Array(N * N);
  const id = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const wi = y * N + x;
      const fy = (y / N) * c + (warp ? (warp.y[wi] - 0.5) * warp.amp : 0);
      const fx = (x / N) * c + (warp ? (warp.x[wi] - 0.5) * warp.amp : 0);
      const cy = Math.floor(fy);
      const cx = Math.floor(fx);
      let d1 = 9;
      let d2 = 9;
      let best = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const gyy = cy + oy;
          const k = (((gyy % c) + c) % c) * c + (((gx % c) + c) % c);
          const dx = gx + px[k] - fx;
          const dy = gyy + py[k] - fy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = k;
          } else if (d < d2) d2 = d;
        }
      }
      const i = y * N + x;
      f1[i] = d1;
      f2[i] = d2;
      id[i] = pv[best];
    }
  }
  return { f1, f2, id };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Höhe und Helligkeit je Muster (Werte ungefähr 0..1, werden danach normiert)
const PATTERNS = {
  // Gestein: weiche Buckel, Platten mit eigenem Ton, Risse groß und klein, feines Korn
  // Gestein: weiche Buckel, gewellte Risse (nur ein Teil der Zellgrenzen reißt auf), feines Korn
  stone(rnd) {
    const base = fbm([[4, 0.5], [8, 0.26], [16, 0.13], [32, 0.07], [64, 0.04]], rnd);
    const wx = fbm([[4, 0.6], [8, 0.4]], rnd);
    const wy = fbm([[4, 0.6], [8, 0.4]], rnd);
    const big = worley(5, rnd, 0.9, { x: wx, y: wy, amp: 1.3 });
    const small = worley(13, rnd, 1, { x: wy, y: wx, amp: 2.4 });
    const mask = fbm([[3, 0.6], [6, 0.4]], rnd);
    const grain = valueNoise(128, rnd);
    const h = new Float32Array(N * N);
    const a = new Float32Array(N * N);
    for (let i = 0; i < h.length; i++) {
      const c1 = (1 - smooth(0.0, 0.06, big.f2[i] - big.f1[i])) * smooth(0.36, 0.52, mask[i]);
      const c2 = (1 - smooth(0.0, 0.045, small.f2[i] - small.f1[i])) * smooth(0.42, 0.6, 1 - mask[i]) * 0.8;
      h[i] = base[i] * 0.95 + (big.id[i] - 0.5) * 0.1 - c1 * 0.42 - c2 * 0.18 + grain[i] * 0.07;
      a[i] = base[i] * 0.85 + (big.id[i] - 0.5) * 0.22 + (small.id[i] - 0.5) * 0.08 - c1 * 0.7 - c2 * 0.32 + (grain[i] - 0.5) * 0.25;
    }
    return { h, a };
  },
  // Körnung: Sand, Kunststoff, Erde – feines Rauschen mit Sprenkeln
  grain(rnd) {
    const base = fbm([[8, 0.35], [16, 0.3], [32, 0.2], [64, 0.12], [128, 0.08]], rnd);
    const fine = valueNoise(256, rnd);
    const dots = worley(40, rnd, 1);
    const h = new Float32Array(N * N);
    const a = new Float32Array(N * N);
    for (let i = 0; i < h.length; i++) {
      const pebble = 1 - smooth(0.12, 0.3, dots.f1[i]);
      const lit = dots.id[i] > 0.86 ? pebble : 0;
      const dark = dots.id[i] < 0.1 ? pebble : 0;
      h[i] = base[i] + fine[i] * 0.18 + (lit + dark) * 0.25;
      a[i] = base[i] * 0.9 + (fine[i] - 0.5) * 0.35 + lit * 0.5 - dark * 0.55;
    }
    return { h, a };
  },
  // Laub: runde Blattbüschel mit dunklen Zwischenräumen, jedes Büschel etwas anders getönt
  leaf(rnd) {
    const cells = worley(11, rnd, 0.85);
    const tiny = worley(29, rnd, 1);
    const base = fbm([[8, 0.5], [32, 0.3], [64, 0.2]], rnd);
    const h = new Float32Array(N * N);
    const a = new Float32Array(N * N);
    for (let i = 0; i < h.length; i++) {
      const dome = 1 - smooth(0.0, 0.62, cells.f1[i]);
      const lobe = 1 - smooth(0.0, 0.5, tiny.f1[i]);
      h[i] = dome * 0.75 + lobe * 0.25 + base[i] * 0.12;
      a[i] = dome * 0.7 + lobe * 0.2 + (cells.id[i] - 0.5) * 0.5 + base[i] * 0.2 - (1 - smooth(0.0, 0.08, cells.f2[i] - cells.f1[i])) * 0.35;
    }
    return { h, a };
  },
  // Sand: Windrippel (sanfte Luv-, steile Leeseite), gewellt, dazu feines Korn
  sand(rnd) {
    const warp = fbm([[3, 0.6], [6, 0.3], [12, 0.1]], rnd);
    const fine = fbm([[32, 0.5], [64, 0.3], [128, 0.2]], rnd);
    const grain = valueNoise(256, rnd);
    const h = new Float32Array(N * N);
    const a = new Float32Array(N * N);
    const T = 11; // Rippel je Kachel
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const ph = (y / N) * T + warp[i] * 2.4;
        const f = ph - Math.floor(ph);
        const r = f < 0.72 ? f / 0.72 : (1 - f) / 0.28;
        const rip = r * r * (3 - 2 * r);
        h[i] = rip * 0.75 + fine[i] * 0.17 + grain[i] * 0.08;
        a[i] = rip * 0.3 + fine[i] * 0.38 + (grain[i] - 0.5) * 0.6;
      }
    }
    return { h, a };
  },
  // Rasen: dicht liegende Halme in allen Richtungen, jeder Halm eigener Ton, Spitze heller
  turf(rnd) {
    const base = fbm([[8, 0.6], [32, 0.4]], rnd);
    const h = new Float32Array(N * N);
    const a = new Float32Array(N * N);
    for (let i = 0; i < h.length; i++) {
      h[i] = base[i] * 0.3;
      a[i] = 0.3 + base[i] * 0.3;
    }
    for (let k = 0; k < 4200; k++) {
      const x = rnd() * N;
      const y = rnd() * N;
      const ang = rnd() * Math.PI * 2;
      const len = 6 + rnd() * 12;
      const tone = (rnd() - 0.5) * 0.8;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      for (let s = 0; s < len; s += 0.7) {
        const xi = ((Math.floor(x + dx * s) % N) + N) % N;
        const yi = ((Math.floor(y + dy * s) % N) + N) % N;
        const i = yi * N + xi;
        const t = s / len;
        h[i] = Math.max(h[i], 0.45 + t * 0.55 * (1 - t * 0.4));
        a[i] = 0.5 + tone * 0.6 + t * 0.3;
      }
    }
    return { h, a };
  },
  // Stoff (Spielteppich): feines Webmuster aus Kett- und Schussfäden, dazu leichte Fusseln
  fabric(rnd) {
    const fuzz = fbm([[16, 0.5], [64, 0.3], [256, 0.2]], rnd);
    const h = new Float32Array(N * N);
    const a = new Float32Array(N * N);
    const T = 64; // Fäden pro Kachel
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = (x / N) * T;
        const v = (y / N) * T;
        const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
        const wu = Math.sin((u % 1) * Math.PI);
        const wv = Math.sin((v % 1) * Math.PI);
        const i = y * N + x;
        const t = over ? wv * (0.6 + 0.4 * wu) : wu * (0.6 + 0.4 * wv);
        h[i] = t * 0.8 + fuzz[i] * 0.2;
        a[i] = t * 0.6 + fuzz[i] * 0.4;
      }
    }
    return { h, a };
  },
};

const cache = new Map();

// Detail-Textur: R = Höhe, G/B = Gefälle in u/v (0,5 = flach), A = Helligkeit (Mittel 0,5)
export function detailTexture(kind, aniso = 8) {
  if (cache.has(kind)) return cache.get(kind);
  const { h, a } = PATTERNS[kind](mulberry32(kind.length * 131 + kind.charCodeAt(0)));
  const norm = (arr, sd) => {
    let m = 0;
    for (const v of arr) m += v;
    m /= arr.length;
    let s = 0;
    for (const v of arr) s += (v - m) * (v - m);
    s = Math.sqrt(s / arr.length) || 1;
    for (let i = 0; i < arr.length; i++) arr[i] = Math.min(1, Math.max(0, 0.5 + ((arr[i] - m) / s) * sd));
  };
  norm(h, 0.2);
  norm(a, 0.17);
  // Gefälle (zentrale Differenzen, kachelbar), auf ±1 normiert über das 99,5-%-Quantil
  const gx = new Float32Array(N * N);
  const gy = new Float32Array(N * N);
  const mags = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      gx[i] = h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)];
      gy[i] = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
      mags[i] = Math.max(Math.abs(gx[i]), Math.abs(gy[i]));
    }
  }
  const sorted = Float32Array.from(mags).sort();
  const gmax = sorted[Math.floor(sorted.length * 0.995)] || 1;
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.round(h[i] * 255);
    data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, 0.5 + (gx[i] / gmax) * 0.5)) * 255);
    data[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, 0.5 + (gy[i] / gmax) * 0.5)) * 255);
    data[i * 4 + 3] = Math.round(a[i] * 255);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  cache.set(kind, t);
  return t;
}

const VERT_PARS = /* glsl */ `
varying vec3 vDetW;
varying vec3 vDetN;`;

const VERT = /* glsl */ `
{
  vec4 detP = vec4(transformed, 1.0);
  vec3 detN0 = vec3(normal);
  #ifdef USE_INSTANCING
    detP = instanceMatrix * detP;
    detN0 = mat3(instanceMatrix) * detN0;
  #endif
  detP = modelMatrix * detP;
  vDetW = detP.xyz;
  vDetN = mat3(modelMatrix) * detN0;
}`;

const FRAG_PARS = /* glsl */ `
uniform sampler2D uDetTex;
uniform vec4 uDet; // x: Kacheln pro Meter, y: Helligkeits-Stärke, z: Relief-Stärke, w: Faktor zweiter Maßstab
varying vec3 vDetW;
varying vec3 vDetN;
// liefert (Helligkeit, Höhengefälle in Weltachsen)
vec4 detSample(vec3 p, vec3 w) {
  #ifdef DET_PLANAR
    vec4 b = texture2D(uDetTex, p.xz);
    return vec4(b.a, b.g * 2.0 - 1.0, 0.0, b.b * 2.0 - 1.0);
  #else
    vec4 a = texture2D(uDetTex, p.zy);
    vec4 b = texture2D(uDetTex, p.xz);
    vec4 c = texture2D(uDetTex, p.xy);
    vec2 ga = a.gb * 2.0 - 1.0;
    vec2 gb = b.gb * 2.0 - 1.0;
    vec2 gc = c.gb * 2.0 - 1.0;
    return vec4(a.a * w.x + b.a * w.y + c.a * w.z, vec3(0.0, ga.y, ga.x) * w.x + vec3(gb.x, 0.0, gb.y) * w.y + vec3(gc.x, gc.y, 0.0) * w.z);
  #endif
}`;

const FRAG_COLOR = /* glsl */ `
vec3 detBl = pow(abs(normalize(vDetN)), vec3(4.0));
detBl /= detBl.x + detBl.y + detBl.z + 1e-5;
vec4 detS = detSample(vDetW * uDet.x, detBl);
#ifdef DET_TWO
  vec4 detS2 = detSample(vDetW * (uDet.x * uDet.w) + vec3(0.31, 0.17, 0.53), detBl);
  detS = vec4(mix(detS.x, detS2.x, 0.45), detS.yzw + detS2.yzw * 0.7);
#endif
diffuseColor.rgb *= 1.0 + (detS.x - 0.5) * uDet.y * 2.0;`;

const FRAG_NORMAL = /* glsl */ `
{
  vec3 detG = (viewMatrix * vec4(detS.yzw, 0.0)).xyz;
  normal = normalize(normal - (detG - dot(detG, normal) * normal) * uDet.z);
}`;

/**
 * Hängt die Detail-Schicht an ein Standard-Material (Lambert/Standard/Phong; Basic nur Helligkeit).
 * kind: 'stone' | 'grain' | 'leaf' | 'fabric'
 * size: Kachelgröße in Metern, albedo: Helligkeits-Schwankung (0..1), bump: Relief-Stärke,
 * two: zweiter, gröberer Maßstab (Faktor coarse), planar: nur von oben projizieren (Böden).
 */
export function addDetail(mat, kind, { size = 1.5, albedo = 0.2, bump = 0.25, two = true, coarse = 0.27, planar = false, aniso = 8 } = {}) {
  const tex = detailTexture(kind, aniso);
  const uDet = { value: new THREE.Vector4(1 / size, albedo, bump, coarse) };
  const prev = mat.onBeforeCompile;
  const ownKey = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey : null;
  const prevSrc = ownKey ? '' : prev.toString();
  const defs = (two ? '#define DET_TWO\n' : '') + (planar ? '#define DET_PLANAR\n' : '');
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uDetTex = { value: tex };
    sh.uniforms.uDet = uDet;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + VERT_PARS).replace('#include <project_vertex>', '#include <project_vertex>' + VERT);
    sh.fragmentShader = defs + sh.fragmentShader
      .replace('#include <common>', '#include <common>' + FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>' + FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + FRAG_NORMAL);
  };
  mat.customProgramCacheKey = () => (ownKey ? ownKey.call(mat) : prevSrc) + '|det:' + defs;
  mat.userData.detail = uDet;
  return mat;
}
