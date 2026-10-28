// Strecke als geschlossene Spline-Mittellinie mit Breite.
// Wird gleichmäßig (ca. 1 m) abgetastet; alle Abfragen laufen über diese Stützpunkte.

import { clamp, lerp, smoothstep, wrapAngle } from '../util.js';
import { JUMP_H } from '../config.js';

function crPoint(p0, p1, p2, p3, t) {
  // Zentripetale Catmull-Rom-Spline (keine Schleifen/Spitzen)
  const d01 = Math.max(1e-3, Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])));
  const d12 = Math.max(1e-3, Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])));
  const d23 = Math.max(1e-3, Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1])));
  const t0 = 0;
  const t1 = d01;
  const t2 = t1 + d12;
  const t3 = t2 + d23;
  const tt = t1 + (t2 - t1) * t;
  const out = [0, 0];
  for (let k = 0; k < 2; k++) {
    const A1 = ((t1 - tt) * p0[k] + (tt - t0) * p1[k]) / (t1 - t0);
    const A2 = ((t2 - tt) * p1[k] + (tt - t1) * p2[k]) / (t2 - t1);
    const A3 = ((t3 - tt) * p2[k] + (tt - t2) * p3[k]) / (t3 - t2);
    const B1 = ((t2 - tt) * A1 + (tt - t0) * A2) / (t2 - t0);
    const B2 = ((t3 - tt) * A2 + (tt - t1) * A3) / (t3 - t1);
    out[k] = ((t2 - tt) * B1 + (tt - t1) * B2) / (t2 - t1);
  }
  return out;
}

function smoothCircular(arr, r) {
  const n = arr.length;
  const out = new Float32Array(n);
  if (r < 1) {
    out.set(arr);
    return out;
  }
  let acc = 0;
  for (let j = -r; j <= r; j++) acc += arr[(j + n) % n];
  const w = 2 * r + 1;
  for (let i = 0; i < n; i++) {
    out[i] = acc / w;
    acc += arr[(i + r + 1) % n] - arr[(i - r + n) % n];
  }
  return out;
}

// Alle Strecken etwas breiter als in den Bauplänen: +25 % der Breite, mindestens 2,2 m, höchstens 3,5 m
// (schmale Abschnitte gewinnen relativ am meisten, die ohnehin breite Wolkenarena am wenigsten)
const widen = (w) => w + clamp(w * 0.25, 2.2, 3.5);

export class Track {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    const sc = def.scale || 1;
    const P = def.points.map((p) => [p[0] * sc, p[1] * sc, widen(p[2] ?? def.width)]);
    const n = P.length;

    // 1) Dichte Spline-Polylinie
    const dx = [];
    const dz = [];
    const dw = [];
    const SUB = 48;
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n];
      const p1 = P[i];
      const p2 = P[(i + 1) % n];
      const p3 = P[(i + 2) % n];
      for (let k = 0; k < SUB; k++) {
        const t = k / SUB;
        const q = crPoint(p0, p1, p2, p3, t);
        dx.push(q[0]);
        dz.push(q[1]);
        dw.push(lerp(p1[2], p2[2], smoothstep(t)));
      }
    }
    const m = dx.length;
    const cum = new Float64Array(m + 1);
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      cum[i + 1] = cum[i] + Math.hypot(dx[j] - dx[i], dz[j] - dz[i]);
    }
    const total = cum[m];

    // 2) Gleichmäßig neu abtasten
    const N = Math.max(64, Math.round(total));
    const step = total / N;
    this.length = total;
    this.n = N;
    this.step = step;
    const px = (this.px = new Float32Array(N));
    const pz = (this.pz = new Float32Array(N));
    const hw = (this.hw = new Float32Array(N));
    let seg = 0;
    for (let k = 0; k < N; k++) {
      const s = k * step;
      while (seg < m - 1 && cum[seg + 1] < s) seg++;
      const f = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      const j = (seg + 1) % m;
      px[k] = lerp(dx[seg], dx[j], f);
      pz[k] = lerp(dz[seg], dz[j], f);
      hw[k] = lerp(dw[seg], dw[j], f) * 0.5;
    }

    // 3) Tangenten, Normalen (rechts), Richtung, Krümmung
    const tx = (this.tx = new Float32Array(N));
    const tz = (this.tz = new Float32Array(N));
    const nx = (this.nx = new Float32Array(N));
    const nz = (this.nz = new Float32Array(N));
    const head = (this.head = new Float32Array(N));
    for (let k = 0; k < N; k++) {
      const a = (k - 1 + N) % N;
      const b = (k + 1) % N;
      let ux = px[b] - px[a];
      let uz = pz[b] - pz[a];
      const l = Math.hypot(ux, uz) || 1;
      ux /= l;
      uz /= l;
      tx[k] = ux;
      tz[k] = uz;
      nx[k] = -uz;
      nz[k] = ux;
      head[k] = Math.atan2(ux, uz);
    }
    const curvRaw = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const a = (k - 2 + N) % N;
      const b = (k + 2) % N;
      curvRaw[k] = wrapAngle(head[b] - head[a]) / (4 * step);
    }
    // Krümmung > 0 = Linkskurve, < 0 = Rechtskurve
    this.curv = smoothCircular(curvRaw, Math.round(5 / step));
    this.curvWide = smoothCircular(curvRaw, Math.round(16 / step));

    this.curves = this._findCurves();
    this.crossing = this._findCrossings();
    this.line = this._racingLine();
    this._heights(def);

    // Boostfelder: u = Anteil der Runde, d = seitliche Lage (-1 links … 1 rechts)
    this.pads = (def.pads || []).map((p, i) => {
      const s = p.u * total;
      const k = Math.floor(s / step) % N;
      const halfW = p.w || 2.6;
      return { i, s, len: p.len || 9, w: halfW, d: clamp(p.d, -1, 1) * Math.max(0, hw[k] - halfW - 0.6) };
    });

    this.jumps = this._findJumps(def);

    // Begrenzungsrahmen
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let k = 0; k < N; k++) {
      minX = Math.min(minX, px[k] - hw[k]);
      maxX = Math.max(maxX, px[k] + hw[k]);
      minZ = Math.min(minZ, pz[k] - hw[k]);
      maxZ = Math.max(maxZ, pz[k] + hw[k]);
    }
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  _findCurves() {
    const N = this.n;
    const c = this.curvWide;
    const thr = 1 / 95;
    const sign = (k) => (Math.abs(c[k]) > thr ? Math.sign(c[k]) : 0);
    // Startpunkt außerhalb einer Kurve suchen
    let start = 0;
    while (start < N && sign(start) !== 0) start++;
    if (start >= N) return [];
    const out = [];
    let k = 0;
    while (k < N) {
      const i = (start + k) % N;
      const sg = sign(i);
      if (sg === 0) {
        k++;
        continue;
      }
      let len = 0;
      let peak = 0;
      const i0 = i;
      while (k < N && sign((start + k) % N) === sg) {
        peak = Math.max(peak, Math.abs(c[(start + k) % N]));
        len++;
        k++;
      }
      if (len * this.step >= 12) {
        const s0 = i0 * this.step;
        out.push({ s0, s1: s0 + len * this.step, len: len * this.step, sign: sg, peak });
      }
    }
    return out;
  }

  // Sprungschanzen: auf langen Geraden (genug Anlauf und Landefläche), nicht am Start, nicht an Boostfeldern
  _findJumps(def) {
    const N = this.n;
    const step = this.step;
    const L = this.length;
    const mk = (s, i) => {
      const k = this.indexAt(s);
      return { i, s, d: 0, w: Math.max(2, this.hw[k] - 0.25), h: JUMP_H };
    };
    if (def.jumps) return def.jumps.map((j, i) => mk(j.u * L, i));
    const c = this.curvWide;
    const straight = (k) => Math.abs(c[k]) < 1 / 240 && !this.crossing[k];
    let start = 0;
    while (start < N && straight(start)) start++;
    const runs = [];
    for (let k = 0; k < N; ) {
      const i = (start + k) % N;
      if (!straight(i)) {
        k++;
        continue;
      }
      const i0 = i;
      let len = 0;
      while (k < N && straight((start + k) % N)) {
        len++;
        k++;
      }
      runs.push({ s0: i0 * step, len: len * step });
    }
    runs.sort((a, b) => b.len - a.len);
    const out = [];
    const far = (s, s2, d) => Math.abs(this.deltaS(s, s2)) > d;
    for (const r of runs) {
      if (r.len < 105 || out.length >= 2) continue;
      const s = this.wrapS(r.s0 + 40);
      if (!far(s, 0, 50) || !far(s, -25, 50)) continue;
      if (this.pads.some((p) => !far(s, p.s, 32))) continue;
      if (out.some((j) => !far(s, j.s, 150))) continue;
      out.push(mk(s, out.length));
    }
    return out;
  }

  _findCrossings() {
    // Stellen, an denen sich die Strecke selbst kreuzt (z.B. Acht) – dort keine sichtbaren Wände.
    const N = this.n;
    const cell = 30;
    const grid = new Map();
    for (let k = 0; k < N; k += 2) {
      const key = Math.floor(this.px[k] / cell) + ',' + Math.floor(this.pz[k] / cell);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(k);
    }
    const cross = new Uint8Array(N);
    const minGap = Math.round(80 / this.step);
    for (let k = 0; k < N; k++) {
      const cx = Math.floor(this.px[k] / cell);
      const cz = Math.floor(this.pz[k] / cell);
      for (let gx = -1; gx <= 1 && !cross[k]; gx++) {
        for (let gz = -1; gz <= 1 && !cross[k]; gz++) {
          const list = grid.get(cx + gx + ',' + (cz + gz));
          if (!list) continue;
          for (const j of list) {
            let gap = Math.abs(j - k);
            gap = Math.min(gap, N - gap);
            if (gap < minGap) continue;
            const r = this.hw[k] + this.hw[j] + 4;
            const ddx = this.px[j] - this.px[k];
            const ddz = this.pz[j] - this.pz[k];
            if (ddx * ddx + ddz * ddz < r * r) {
              cross[k] = 1;
              break;
            }
          }
        }
      }
    }
    // etwas ausweiten
    const out = new Uint8Array(N);
    const r = Math.round(3 / this.step);
    for (let k = 0; k < N; k++) {
      if (!cross[k]) continue;
      for (let j = -r; j <= r; j++) out[(k + j + N) % N] = 1;
    }
    return out;
  }

  _racingLine() {
    // Einfache Ideallinie: in Kurven zur Innenseite, weich überblendet.
    const N = this.n;
    const raw = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const v = -clamp(this.curvWide[k] * 55, -1, 1);
      raw[k] = v * Math.max(0, this.hw[k] - 2.4);
    }
    let line = smoothCircular(raw, Math.round(22 / this.step));
    line = smoothCircular(line, Math.round(10 / this.step));
    for (let k = 0; k < N; k++) {
      const lim = Math.max(0, this.hw[k] - 2.2);
      line[k] = clamp(line[k], -lim, lim);
    }
    return line;
  }

  wrapS(s) {
    const L = this.length;
    s %= L;
    return s < 0 ? s + L : s;
  }

  // Höhenprofil: Stützwerte hills = [[u, h], …] (weich, zirkulär), optional Brücke über die Kreuzung einer Acht.
  // hy = Fahrbahnhöhe je Stützpunkt, slope = Steigung dH/ds. Physik rechnet y relativ zur Fahrbahn.
  _heights(def) {
    const N = this.n;
    const L = this.length;
    const hy = (this.hy = new Float32Array(N));
    const keys = (def.hills || []).map(([u, h]) => [u * L, h]).sort((a, b) => a[0] - b[0]);
    if (keys.length) {
      for (let k = 0; k < N; k++) {
        const s = k * this.step;
        let i = keys.length - 1;
        for (let q = 0; q < keys.length; q++) if (keys[q][0] <= s) i = q;
        const a = keys[i];
        const b = keys[(i + 1) % keys.length];
        let span = b[0] - a[0];
        let ds = s - a[0];
        if (span <= 0) span += L;
        if (ds < 0) ds += L;
        const t = Math.min(1, ds / span);
        hy[k] = a[1] + (b[1] - a[1]) * (0.5 - 0.5 * Math.cos(Math.PI * t));
      }
    }
    this.bridged = false;
    if (def.bridge) {
      // zweiter Durchgang der Kreuzung wird zur Brücke (Mitte des zweiten Kreuzungs-Laufs)
      const runs = [];
      for (let k = 0; k < N; k++) if (this.crossing[k] && !this.crossing[(k - 1 + N) % N]) runs.push(k);
      const mids = runs.map((k0) => {
        let k = k0;
        while (this.crossing[(k + 1) % N] && k - k0 < N) k++;
        return ((k0 + k) / 2) % N;
      });
      if (mids.length >= 2) {
        const mid = mids[1] * this.step;
        const R = 115;
        for (let k = 0; k < N; k++) {
          const d = Math.abs(this.deltaS(mid, k * this.step));
          if (d < R) hy[k] += def.bridge * (0.5 + 0.5 * Math.cos((Math.PI * d) / R));
        }
        this.bridged = true;
      }
    }
    const sl = (this.slope = new Float32Array(N));
    for (let k = 0; k < N; k++) sl[k] = (hy[(k + 1) % N] - hy[(k - 1 + N) % N]) / (2 * this.step);
  }

  heightAt(s) {
    const f = this.wrapS(s) / this.step;
    const i = Math.floor(f) % this.n;
    return lerp(this.hy[i], this.hy[(i + 1) % this.n], f - Math.floor(f));
  }

  slopeAt(s) {
    return this.slope[this.indexAt(s)];
  }

  // Vorzeichenbehafteter kürzester Abstand von a nach b entlang der Strecke
  deltaS(a, b) {
    const L = this.length;
    let d = (b - a) % L;
    if (d > L / 2) d -= L;
    else if (d < -L / 2) d += L;
    return d;
  }

  indexAt(s) {
    return Math.floor(this.wrapS(s) / this.step) % this.n;
  }

  // Weltposition für Streckenkoordinaten (s entlang, d seitlich; d > 0 = rechts)
  posAt(s, d, out) {
    const N = this.n;
    s = this.wrapS(s);
    const f = s / this.step;
    const i = Math.floor(f) % N;
    const j = (i + 1) % N;
    const t = f - Math.floor(f);
    let nnx = lerp(this.nx[i], this.nx[j], t);
    let nnz = lerp(this.nz[i], this.nz[j], t);
    const l = Math.hypot(nnx, nnz) || 1;
    nnx /= l;
    nnz /= l;
    out.x = lerp(this.px[i], this.px[j], t) + nnx * d;
    out.z = lerp(this.pz[i], this.pz[j], t) + nnz * d;
    out.nx = nnx;
    out.nz = nnz;
    out.tx = nnz;
    out.tz = -nnx;
    out.h = Math.atan2(out.tx, out.tz);
    out.hw = lerp(this.hw[i], this.hw[j], t);
    out.y = lerp(this.hy[i], this.hy[j], t);
    out.i = i;
    return out;
  }

  // Nächster Punkt auf der Mittellinie. hint = letzter bekannter Index (lokale Suche), -1 = global
  project(x, z, hint, out) {
    const N = this.n;
    const px = this.px;
    const pz = this.pz;
    let best = 0;
    let bd = Infinity;
    if (hint < 0 || hint >= N) {
      for (let k = 0; k < N; k++) {
        const ex = px[k] - x;
        const ez = pz[k] - z;
        const d2 = ex * ex + ez * ez;
        if (d2 < bd) {
          bd = d2;
          best = k;
        }
      }
    } else {
      const W = 20;
      let center = hint;
      for (let iter = 0; iter < 12; iter++) {
        let bj = 0;
        bd = Infinity;
        for (let j = -W; j <= W; j++) {
          let k = center + j;
          if (k < 0) k += N;
          else if (k >= N) k -= N;
          const ex = px[k] - x;
          const ez = pz[k] - z;
          const d2 = ex * ex + ez * ez;
          if (d2 < bd) {
            bd = d2;
            best = k;
            bj = j;
          }
        }
        if (Math.abs(bj) < W) break;
        center = best;
      }
    }
    // Verfeinern auf den angrenzenden Segmenten
    const a = (best - 1 + N) % N;
    const b = (best + 1) % N;
    let i0 = best;
    let i1 = b;
    let t = 0;
    let qd = Infinity;
    for (let pass = 0; pass < 2; pass++) {
      const i = pass === 0 ? a : best;
      const j = pass === 0 ? best : b;
      const ex = px[j] - px[i];
      const ez = pz[j] - pz[i];
      const L2 = ex * ex + ez * ez || 1;
      let tt = ((x - px[i]) * ex + (z - pz[i]) * ez) / L2;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      const qx = px[i] + ex * tt - x;
      const qz = pz[i] + ez * tt - z;
      const d2 = qx * qx + qz * qz;
      if (d2 < qd) {
        qd = d2;
        i0 = i;
        i1 = j;
        t = tt;
      }
    }
    let nnx = lerp(this.nx[i0], this.nx[i1], t);
    let nnz = lerp(this.nz[i0], this.nz[i1], t);
    const l = Math.hypot(nnx, nnz) || 1;
    nnx /= l;
    nnz /= l;
    const cx = lerp(px[i0], px[i1], t);
    const cz = lerp(pz[i0], pz[i1], t);
    out.i = best;
    out.s = this.wrapS((i0 + t) * this.step);
    out.d = (x - cx) * nnx + (z - cz) * nnz;
    out.hw = lerp(this.hw[i0], this.hw[i1], t);
    out.nx = nnx;
    out.nz = nnz;
    out.tx = nnz;
    out.tz = -nnx;
    return out;
  }

  // Nächste Kurve, deren Beginn mindestens minAhead vor s liegt
  nextCurve(s, minAhead = 20) {
    let best = null;
    let bestDist = Infinity;
    for (const c of this.curves) {
      let dist = this.wrapS(c.s0 - s);
      if (dist < minAhead) dist += this.length;
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return best ? { curve: best, dist: bestDist } : null;
  }

  nextPad(s, minAhead = 15) {
    let best = null;
    let bestDist = Infinity;
    for (const p of this.pads) {
      let dist = this.wrapS(p.s - s);
      if (dist < minAhead) dist += this.length;
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    return best ? { pad: best, dist: bestDist } : null;
  }

  // Startaufstellung: zwei versetzte Reihen hinter der Linie
  gridSlot(k) {
    const row = Math.floor(k / 2);
    const side = k % 2 === 0 ? -1 : 1;
    const s = this.length - 9 - row * 8 - (k % 2) * 3.5;
    const hwS = this.hw[this.indexAt(s)];
    return { s, d: side * Math.min(hwS * 0.42, 4.2) };
  }
}
