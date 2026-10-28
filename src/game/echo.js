// Echos: Jede abgeschlossene Runde wird als Positionsliste aufgezeichnet und danach
// in einer Endlosschleife exakt nachgefahren – als festes Hindernis für alle.

import { ECHO_HZ } from '../config.js';
import { bytesToB64, b64ToBytes, lerpAngle, wrapAngle } from '../util.js';

export class EchoRecorder {
  constructor() {
    this.buf = [];
    this.active = false;
    this.t0 = 0;
  }

  start(t) {
    this.buf.length = 0;
    this.active = true;
    this.t0 = t;
  }

  // y = absolute Höhe (Fahrbahn + Flughöhe)
  sample(c, y = c.y) {
    this.buf.push(c.x, c.z, y, c.h);
  }

  // Beendet die Aufzeichnung. endX/endZ = Position beim Überqueren der Ziellinie.
  finish(t, endX, endZ) {
    this.active = false;
    const n = this.buf.length / 4;
    const dur = t - this.t0;
    if (n < 20 || dur < 4) return null;
    const data = new Float32Array(this.buf);
    // Naht schließen: das Ende läuft weich in den Anfang der nächsten Schleife über
    const dx = data[0] - endX;
    const dz = data[1] - endZ;
    const ramp = Math.min(1.5, dur * 0.25);
    for (let i = 0; i < n; i++) {
      const ti = i / ECHO_HZ;
      const w = (ti - (dur - ramp)) / ramp;
      if (w <= 0) continue;
      data[i * 4] += dx * Math.min(1, w);
      data[i * 4 + 1] += dz * Math.min(1, w);
    }
    return { dur, data };
  }
}

// Echo-Daten zeitlich strecken/stauchen (gleiche Linie, anderes Tempo): neue Abtastpunkte im ECHO_HZ-Raster.
// dur = bisherige Rundendauer, target = neue Dauer. Für den Medaillen-Geist im Zeitfahren.
export function stretchEcho(data, dur, target) {
  const n = data.length / 4;
  const k = target / dur;
  const m = Math.max(2, Math.floor(((n - 1) / ECHO_HZ) * k * ECHO_HZ) + 1);
  const out = new Float32Array(m * 4);
  for (let j = 0; j < m; j++) {
    const f = Math.min(n - 1, j / k);
    const i = Math.min(n - 2, Math.floor(f));
    const u = f - i;
    const a = i * 4;
    const b = a + 4;
    out[j * 4] = data[a] + (data[b] - data[a]) * u;
    out[j * 4 + 1] = data[a + 1] + (data[b + 1] - data[a + 1]) * u;
    out[j * 4 + 2] = data[a + 2] + (data[b + 2] - data[a + 2]) * u;
    out[j * 4 + 3] = lerpAngle(data[a + 3], data[b + 3], u);
  }
  return out;
}

const I16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));

// Kompakt: 4 × Int16 pro Abtastpunkt (x/z auf 10 cm, Höhe auf 1 cm, Richtung auf 0,1 mrad)
export function encodeEcho(data) {
  const n = data.length / 4;
  const q = new Int16Array(n * 4);
  for (let i = 0; i < n; i++) {
    q[i * 4] = I16(data[i * 4] * 10);
    q[i * 4 + 1] = I16(data[i * 4 + 1] * 10);
    q[i * 4 + 2] = I16(data[i * 4 + 2] * 100);
    q[i * 4 + 3] = I16(wrapAngle(data[i * 4 + 3]) * 10000);
  }
  return bytesToB64(new Uint8Array(q.buffer));
}

export function decodeEcho(b64) {
  const bytes = b64ToBytes(b64);
  const q = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i += 4) {
    out[i] = q[i] / 10;
    out[i + 1] = q[i + 1] / 10;
    out[i + 2] = q[i + 2] / 100;
    out[i + 3] = q[i + 3] / 10000;
  }
  return out;
}

export class Echo {
  constructor({ id, owner, lap, t0, dur, data, color, solid = true, kind = 'lap' }) {
    this.id = id;
    this.owner = owner;
    this.lap = lap;
    this.t0 = t0;
    this.dur = dur;
    this.data = data;
    this.n = data.length / 4;
    this.color = color;
    this.solid = solid;
    this.kind = kind;
    this.cleared = new Set(); // Autos, für die das Echo bereits fest ist
    this.aiSeg = -1;
    this.tail = (this.n - 1) / ECHO_HZ;
  }

  solidFor(carId) {
    return this.solid && this.cleared.has(carId);
  }

  sample(t, out) {
    let tau = (t - this.t0) % this.dur;
    if (tau < 0) tau += this.dur;
    const n = this.n;
    const d = this.data;
    let i;
    let j;
    let u;
    let span;
    if (tau >= this.tail) {
      i = n - 1;
      j = 0;
      span = Math.max(1e-3, this.dur - this.tail);
      u = Math.min(1, (tau - this.tail) / span);
    } else {
      const f = tau * ECHO_HZ;
      i = Math.floor(f);
      j = i + 1;
      u = f - i;
      span = 1 / ECHO_HZ;
    }
    const a = i * 4;
    const b = j * 4;
    out.x = d[a] + (d[b] - d[a]) * u;
    out.z = d[a + 1] + (d[b + 1] - d[a + 1]) * u;
    out.y = d[a + 2] + (d[b + 2] - d[a + 2]) * u;
    out.h = lerpAngle(d[a + 3], d[b + 3], u);
    out.vx = (d[b] - d[a]) / span;
    out.vz = (d[b + 1] - d[a + 1]) / span;
    return out;
  }

  toNet() {
    return { id: this.id, owner: this.owner, lap: this.lap, t0: this.t0, dur: this.dur, kind: this.kind, solid: this.solid };
  }
}
