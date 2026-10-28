// Streckenhacks: Barriere, Rampe, Boostfeld spiegeln, Kurve verengen, Schockwelle, Rammstoß, Echo-Klon.
// Werden vom Host vor dem Ziel (bzw. am eigenen Auto) platziert, haben eine sichtbare Warnphase
// und wirken nicht auf den Besitzer. Alles ist eine reine Funktion der Zeit → Vorhersage auf Clients passt.

import { HACKS, DT } from '../config.js';
import { clamp } from '../util.js';
import { CAR_R, CAR_OFF, hitKinematic, bodyContact, smash, knockSide } from './car.js';

export const H_BARRIER = 0;
export const H_RAMP = 1;
export const H_MIRROR = 2;
export const H_SQUEEZE = 3;
export const H_SHOCK = 4;
export const H_RAM = 5;
export const H_CLONE = 6;

export const SHOCK_R = 15; // Reichweite der Schockwelle
export const SHOCK_T = 0.35; // Ausbreitungsdauer
const CLONE_WEAVE = 1.7; // Schlingerfrequenz des Klons

const BAR_R = 0.5; // halbe Dicke der Barriere
const Q = {};
const CP = {};
const SC = {};

export class HackManager {
  constructor(track) {
    this.track = track;
    this.list = [];
    this.nextId = 1;
  }

  // Autoritativ: Hack relativ zum Zielauto platzieren
  create(typeIdx, owner, color, target, targetId, t) {
    const H = HACKS[typeIdx];
    if (!H) return null;
    const tr = this.track;
    const v = Math.max(20, target.spd);
    const h = { id: this.nextId++, type: typeIdx, owner, color, target: targetId, t0: t, tA: t + H.warn, tE: t + H.warn + H.dur };
    if (typeIdx === H_BARRIER || typeIdx === H_RAMP) {
      const ahead = clamp(v * 1.35, 32, 78);
      h.s = tr.wrapS(target.s + ahead);
      const hwS = tr.hw[tr.indexAt(h.s)];
      h.w = typeIdx === H_BARRIER ? hwS * 0.5 : hwS * 0.55;
      h.d = clamp(target.d, -hwS + h.w + 0.3, hwS - h.w - 0.3);
    } else if (typeIdx === H_MIRROR) {
      const np = tr.nextPad(target.s, 12);
      if (!np) return null;
      h.pad = np.pad.i;
      h.tE = h.tA + clamp(np.dist / v + 3.5, 5, 12);
    } else if (typeIdx === H_SQUEEZE) {
      const nc = tr.nextCurve(target.s, 15);
      if (!nc) return null;
      h.s0 = tr.wrapS(nc.curve.s0 - 12);
      h.s1 = tr.wrapS(nc.curve.s1 + 6);
      h.side = nc.curve.sign; // Außenseite: Linkskurve -> rechts (+)
      h.tE = h.tA + clamp((nc.dist + nc.curve.len) / v + 2.5, 5, 12);
    } else if (typeIdx === H_CLONE) {
      // langsamer Klon in der Spur des Gegners, der beim Näherkommen schlingert
      const ahead = clamp(v * 1.15, 26, 58);
      h.s = Math.round(tr.wrapS(target.s + ahead) * 1000) / 1000;
      const hwS = tr.hw[tr.indexAt(h.s)];
      h.d = Math.round(clamp(target.d, -hwS + 2.2, hwS - 2.2) * 1000) / 1000;
      h.v = Math.round(clamp(v * 0.5, 12, 24) * 100) / 100;
      h.amp = Math.round(Math.min(1.9, hwS * 0.3) * 100) / 100;
    }
    h.t0 = Math.round(h.t0 * 1000) / 1000;
    h.tA = Math.round(h.tA * 1000) / 1000;
    h.tE = Math.round(h.tE * 1000) / 1000;
    this.add(h);
    return h;
  }

  // Hacks am eigenen Auto (Schockwelle, Rammstoß): kein Ziel nötig
  createSelf(typeIdx, owner, color, st, t) {
    const H = HACKS[typeIdx];
    const r = (x) => Math.round(x * 1000) / 1000;
    const h = { id: this.nextId++, type: typeIdx, owner, color, target: null, t0: r(t), tA: r(t + H.warn), tE: r(t + H.warn + H.dur) };
    if (typeIdx === H_SHOCK) {
      // Zentrum wandert mit dem Tempo des Auslösers weiter – so erreicht die Welle auch das mitfahrende Feld
      const q = (x) => Math.round(x * 100) / 100;
      h.x = q(st.x);
      h.z = q(st.z);
      h.vx = q(st.vx);
      h.vz = q(st.vz);
      // Höhe der Fahrbahn beim Auslösen (Brücke/Hügel: andere Ebenen bleiben verschont)
      h.y = q(this.track.heightAt(st.s));
    }
    this.add(h);
    return h;
  }

  // Zentrum der Schockwelle zur Zeit t
  shockCenter(h, t, out) {
    const u = Math.max(0, t - h.t0);
    out.x = h.x + h.vx * u;
    out.z = h.z + h.vz * u;
    return out;
  }

  // Position des Echo-Klons zur Zeit t (inkl. Spur-Koordinaten s/d für KI und Karte)
  clonePos(h, t, out) {
    const tr = this.track;
    const u = clamp(t - h.tA, 0, h.tE - h.tA);
    const s = tr.wrapS(h.s + h.v * u);
    const hwS = tr.hw[tr.indexAt(s)];
    const lim = Math.max(0, hwS - 1.4);
    const d = clamp(h.d + Math.sin(u * CLONE_WEAVE) * h.amp, -lim, lim);
    const p = tr.posAt(s, d, Q);
    const dd = t > h.tA ? Math.cos(u * CLONE_WEAVE) * CLONE_WEAVE * h.amp : 0;
    out.vx = p.tx * h.v + p.nx * dd;
    out.vz = p.tz * h.v + p.nz * dd;
    out.x = p.x;
    out.z = p.z;
    out.h = Math.atan2(out.vx, out.vz);
    out.s = s;
    out.d = d;
    out.y = p.y;
    return out;
  }

  add(h) {
    if (this.list.some((o) => o.id === h.id)) return;
    if (h.type === H_BARRIER || h.type === H_RAMP) {
      const p = this.track.posAt(h.s, h.d, Q);
      h.x = p.x;
      h.z = p.z;
      h.hd = p.h;
      h.y = p.y;
      h.x1 = p.x - p.nx * h.w;
      h.z1 = p.z - p.nz * h.w;
      h.x2 = p.x + p.nx * h.w;
      h.z2 = p.z + p.nz * h.w;
    }
    this.list.push(h);
    this.nextId = Math.max(this.nextId, h.id + 1);
  }

  prune(t) {
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const h = this.list[i];
      if (t < h.tE + 1.2) this.list[w++] = h;
    }
    this.list.length = w;
  }

  // Seitliche Begrenzung durch "Kurve verengen"
  limits(carId, s, hw, t, lim) {
    for (let i = 0; i < this.list.length; i++) {
      const h = this.list[i];
      if (h.type !== H_SQUEEZE || h.owner === carId || t < h.tA || t >= h.tE) continue;
      const len = this.track.wrapS(h.s1 - h.s0);
      const ds = this.track.wrapS(s - h.s0);
      if (ds > len) continue;
      const taper = Math.max(0, Math.min(1, ds / 12, (len - ds) / 12));
      const block = 0.8 * hw * taper;
      if (h.side > 0) lim[1] = Math.min(lim[1], hw - 1.05 - block);
      else lim[0] = Math.max(lim[0], -hw + 1.05 + block);
    }
  }

  // Zustand eines Boostfelds (gespiegelt? bremst für dieses Auto?)
  padState(pad, carId, t, out) {
    out.d = pad.d;
    out.drain = false;
    out.mirror = false;
    out.owner = null;
    for (let i = 0; i < this.list.length; i++) {
      const h = this.list[i];
      if (h.type !== H_MIRROR || h.pad !== pad.i || t < h.tA || t >= h.tE) continue;
      out.d = -pad.d;
      out.mirror = true;
      out.owner = h.owner;
      out.drain = h.owner !== carId;
    }
    return out;
  }

  collide(c, carId, t, ev) {
    const tr = this.track;
    // absolute Höhe des Autos über Grund (für Kreuzungen auf zwei Ebenen)
    const lvl = tr.heightAt(c.s) + c.y;
    for (let i = 0; i < this.list.length; i++) {
      const h = this.list[i];
      if (h.owner === carId || t < h.tA || t >= h.tE) continue;
      if (h.type === H_SHOCK) {
        // Der Ring trifft jedes Auto genau in dem Takt, in dem er es überstreicht (zustandslos → Replay-sicher)
        if (Math.abs(lvl - (h.y ?? lvl - c.y)) > 2.5) continue;
        const r1 = SHOCK_R * clamp((t - h.tA) / SHOCK_T, 0, 1);
        const r0 = SHOCK_R * clamp((t - DT - h.tA) / SHOCK_T, 0, 1);
        const C0 = this.shockCenter(h, t, SC);
        const dx = c.x - C0.x;
        const dz = c.z - C0.z;
        const dist = Math.hypot(dx, dz);
        if (dist > r1 || dist <= r0 || r0 >= SHOCK_R) continue;
        if (c.shieldT > 0) {
          smash(c, ev, 'shock', h.owner);
          continue;
        }
        const k = 1 - dist / SHOCK_R;
        knockSide(c, dx, dz, 6 + 8 * k, 0.78 - 0.12 * k);
        if (ev) {
          ev('hit', { kind: 'shock', owner: h.owner, power: 6 + 8 * k, hid: h.id });
          ev('hackHit', { owner: h.owner, type: h.type });
        }
      } else if (h.type === H_CLONE) {
        const P = this.clonePos(h, t, CP);
        if (Math.abs(lvl - P.y) > 1.5) continue;
        const ddx = c.x - P.x;
        const ddz = c.z - P.z;
        if (ddx * ddx + ddz * ddz > 30) continue;
        const C = bodyContact(c.x, c.z, c.h, P.x, P.z, P.h);
        if (C.pen <= 0) continue;
        if (c.shieldT > 0) {
          smash(c, ev, 'clone', h.owner);
          continue;
        }
        const before = c.hitT;
        hitKinematic(c, C.nx, C.nz, C.pen, P.vx, P.vz, 0.68, ev, 'clone', h.owner);
        if (before > 0.3 && c.hitT === 0 && ev) ev('hackHit', { owner: h.owner, type: h.type });
      } else if (h.type === H_BARRIER) {
        if (Math.abs(lvl - h.y) > 2.0) continue;
        const ddx = c.x - h.x;
        const ddz = c.z - h.z;
        const lim = h.w + 4;
        if (ddx * ddx + ddz * ddz > lim * lim) continue;
        let best = 0;
        let bnx = 0;
        let bnz = 0;
        const fx = Math.sin(c.h) * CAR_OFF;
        const fz = Math.cos(c.h) * CAR_OFF;
        const ex = h.x2 - h.x1;
        const ez = h.z2 - h.z1;
        const L2 = ex * ex + ez * ez || 1;
        for (let k = -1; k <= 1; k += 2) {
          const cx = c.x + fx * k;
          const cz = c.z + fz * k;
          let u = ((cx - h.x1) * ex + (cz - h.z1) * ez) / L2;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const qx = cx - (h.x1 + ex * u);
          const qz = cz - (h.z1 + ez * u);
          const d = Math.hypot(qx, qz);
          const pen = CAR_R + BAR_R - d;
          if (pen > best) {
            best = pen;
            if (d > 1e-4) {
              bnx = qx / d;
              bnz = qz / d;
            } else {
              bnx = -Math.sin(c.h);
              bnz = -Math.cos(c.h);
            }
          }
        }
        if (best > 0 && c.shieldT > 0) smash(c, ev, 'barrier', h.owner);
        else if (best > 0) {
          const before = c.hitT;
          hitKinematic(c, bnx, bnz, best, 0, 0, 0.6, ev, 'barrier', h.owner);
          // nur echte Treffer zählen (hitKinematic setzt hitT dann auf 0)
          if (before > 0.3 && c.hitT === 0 && ev) ev('hackHit', { owner: h.owner, type: h.type });
        }
      } else if (h.type === H_RAMP) {
        if (c.air) continue;
        const ds = tr.deltaS(h.s, c.s);
        if (ds < -3.6 || ds > 1.5) continue;
        if (Math.abs(c.d - h.d) > h.w + 0.4) continue;
        const vAlong = c.vx * Math.sin(h.hd) + c.vz * Math.cos(h.hd);
        if (vAlong < 6) continue;
        c.air = 1;
        c.rampAir = 1;
        c.trick = 0;
        c.vy = 7 + c.spd * 0.06;
        c.y = 0.05;
        if (c.drift) {
          c.drift = 0;
          c.driftT = 0;
          c.driftLvl = 0;
        }
        if (ev) {
          ev('launch');
          ev('hackHit', { owner: h.owner, type: h.type });
        }
      }
    }
  }
}
