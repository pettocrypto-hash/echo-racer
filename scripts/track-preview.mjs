// Entwickler-Werkzeug: zeichnet alle Strecken als PNG und prüft Abstände.
// Aufruf: node scripts/track-preview.mjs [ausgabe.png]
import fs from 'node:fs';
import { Raster } from './png.mjs';
import { Track } from '../src/game/track.js';
import { TRACK_DEFS } from '../src/game/trackDefs.js';

const out = process.argv[2] || 'track-preview.png';
const S = 520;
const img = new Raster(S * 2, S * 2, [18, 16, 28, 255]);

TRACK_DEFS.forEach((def, idx) => {
  const t = new Track(def);
  const ox = (idx % 2) * S;
  const oy = Math.floor(idx / 2) * S;
  const b = t.bounds;
  const sc = (S - 40) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const X = (x) => ox + 20 + (x - b.minX) * sc;
  const Y = (z) => oy + S - 20 - (z - b.minZ) * sc;
  for (let k = 0; k < t.n; k++) img.circle(X(t.px[k]), Y(t.pz[k]), t.hw[k] * sc, t.crossing[k] ? [150, 60, 60, 255] : [70, 70, 90, 255]);
  for (const c of t.curves) {
    for (let s = c.s0; s < c.s1; s += 2) {
      const k = t.indexAt(s);
      img.circle(X(t.px[k]), Y(t.pz[k]), 1.6, c.sign > 0 ? [80, 200, 255, 255] : [255, 160, 60, 255]);
    }
  }
  for (let k = 0; k < t.n; k += 1) {
    const p = t.posAt(k * t.step, t.line[k], {});
    img.circle(X(p.x), Y(p.z), 0.8, [120, 255, 120, 255]);
  }
  for (const p of t.pads) {
    const q = t.posAt(p.s, p.d, {});
    img.circle(X(q.x), Y(q.z), 4, [255, 230, 40, 255]);
  }
  const a = t.posAt(0, -t.hw[0], {});
  const c = t.posAt(0, t.hw[0], {});
  img.line(X(a.x), Y(a.z), X(c.x), Y(c.z), [255, 255, 255, 255], 3);
  const ar = t.posAt(25, 0, {});
  img.circle(X(ar.x), Y(ar.z), 4, [255, 60, 220, 255]);
  for (let k = 0; k < 6; k++) {
    const g = t.gridSlot(k);
    const q = t.posAt(g.s, g.d, {});
    img.circle(X(q.x), Y(q.z), 2.5, [255, 255, 255, 255]);
  }

  // Mindestabstand zwischen nicht benachbarten Abschnitten
  let minGap = Infinity;
  let minAt = null;
  const gap = Math.round(120 / t.step);
  for (let i = 0; i < t.n; i += 2) {
    for (let j = i + gap; j < t.n; j += 2) {
      if (t.n - (j - i) < gap) continue;
      if (t.crossing[i] || t.crossing[j]) continue;
      const d = Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]) - t.hw[i] - t.hw[j];
      if (d < minGap) {
        minGap = d;
        minAt = [i, j];
      }
    }
  }
  let minR = Infinity;
  for (let k = 0; k < t.n; k++) minR = Math.min(minR, 1 / Math.max(1e-6, Math.abs(t.curv[k])));
  const crossCount = t.crossing.reduce((a2, v) => a2 + v, 0);
  console.log(
    `${def.name}: Länge ${t.length.toFixed(0)} m, Kurven ${t.curves.length}, min. Radius ${minR.toFixed(1)} m, ` +
      `Kreuzungs-Stützpunkte ${crossCount}, min. Randabstand ${minGap.toFixed(1)} m @ s=${minAt ? (minAt[0] * t.step).toFixed(0) + '/' + (minAt[1] * t.step).toFixed(0) : '-'}`
  );
});

fs.writeFileSync(out, img.png());
console.log('geschrieben:', out);
