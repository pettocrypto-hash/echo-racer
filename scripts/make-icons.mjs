// Erzeugt die App-Icons (PNG) prozedural: stilisiertes Auto mit Echo-Spur auf Neon-Hintergrund.
// Aufruf: npm run icons
import fs from 'node:fs';
import { Raster } from './png.mjs';

function draw(size, maskable) {
  const img = new Raster(size, size, [5, 3, 13, 255]);
  const s = size / 512;
  // Hintergrund-Verlauf
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = y / size;
      const r = 12 + 40 * t;
      const g = 6 + 4 * t;
      const b = 40 + 30 * (1 - t);
      const i = (y * size + x) * 4;
      img.px[i] = r;
      img.px[i + 1] = g;
      img.px[i + 2] = b;
      img.px[i + 3] = 255;
    }
  }
  const pad = maskable ? 0.18 : 0.06;
  const cx = size / 2;
  // Fluchtende Straßenlinien
  for (let k = -3; k <= 3; k++) {
    img.line(cx + k * 18 * s, 230 * s, cx + k * 120 * s, size * (1 - pad), [255, 61, 220, 120], 3 * s);
  }
  // Echo-Spuren (Cyan, versetzt)
  for (let e = 3; e >= 1; e--) {
    const a = 70 - e * 15;
    const off = e * 34 * s;
    img.line(cx - 70 * s - off, 330 * s + off * 0.2, cx + 70 * s - off, 330 * s + off * 0.2, [44, 231, 255, a], 34 * s);
  }
  // Auto (Keil)
  const carCol = [44, 231, 255, 255];
  for (let y = 300; y < 380; y++) {
    const w = 60 + (y - 300) * 1.2;
    img.line(cx - w * s, y * s, cx + w * s, y * s, carCol, 1.5 * s);
  }
  for (let y = 270; y < 305; y++) {
    const w = 30 + (y - 270) * 1.0;
    img.line(cx - w * s, y * s, cx + w * s, y * s, [12, 30, 60, 255], 1.5 * s);
  }
  // Rücklichter
  img.line(cx - 120 * s, 360 * s, cx - 70 * s, 360 * s, [255, 40, 60, 255], 12 * s);
  img.line(cx + 70 * s, 360 * s, cx + 120 * s, 360 * s, [255, 40, 60, 255], 12 * s);
  // Glühpunkt / Sonne
  img.circle(cx, 200 * s, 70 * s, [255, 61, 220, 90]);
  img.circle(cx, 200 * s, 44 * s, [255, 150, 230, 160]);
  return img.png();
}

fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/icons/icon-192.png', draw(192, false));
fs.writeFileSync('public/icons/icon-512.png', draw(512, false));
fs.writeFileSync('public/icons/icon-maskable-512.png', draw(512, true));
console.log('Icons geschrieben: public/icons/');
