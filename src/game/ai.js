// KI-Fahrer: Pure-Pursuit auf einer Ideallinie, Tempo-Profil aus der Krümmung,
// weicht Autos/Echos/Hacks aus, driftet in langen Kurven und setzt Hacks.

import { AI_LEVELS, HACKS, BANK_GRIP, BANK_MAX } from '../config.js';
import { clamp, noise1 } from '../util.js';
import { H_BARRIER, H_RAMP, H_MIRROR, H_SQUEEZE, H_SHOCK, H_RAM, H_CLONE, SHOCK_R } from './hacks.js';

const TMP = {};
const TMP2 = {};
const E = {};
const CL = {};
const LIM = [0, 0];

export class AIDriver {
  constructor(track, stats, level, seed) {
    this.track = track;
    this.stats = stats;
    this.level = clamp(level | 0, 0, 2);
    this.L = AI_LEVELS[this.level];
    this.seed = seed;
    this.prof = this._speedProfile();
    this.avoid = 0;
    this.avoidT = 0;
    this.revT = 0;
    this.stuckT = 0;
    this.hackT = 2.5 + (seed % 5);
    this.driftCurve = null;
    this.driftDir = 0;
    this.input = { steer: 0, throttle: 0, brake: 0, drift: 0, hack: -1 };
  }

  _speedProfile() {
    const tr = this.track;
    const N = tr.n;
    const st = this.stats;
    const m = this.L.margin;
    const v = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const kap = Math.abs(tr.curv[k]) * 0.8 + 1e-4;
      // Steilkurven: mehr Lenkwirkung bei Tempo → höhere Kurvengeschwindigkeit
      const turn = st.turn * m * (1 + BANK_GRIP * Math.min(1, Math.abs(tr.bank[k]) / BANK_MAX));
      const vmax = turn / (kap + (0.45 * turn) / st.top);
      v[k] = Math.min(st.top * 1.05, vmax);
    }
    const dec = 21;
    for (let pass = 0; pass < 2; pass++) {
      for (let k = N - 1; k >= 0; k--) {
        const nxt = v[(k + 1) % N];
        const lim = Math.sqrt(nxt * nxt + 2 * dec * tr.step);
        if (v[k] > lim) v[k] = lim;
      }
    }
    return v;
  }

  update(car, sim, t, dt) {
    const c = car.st;
    const tr = this.track;
    const inp = this.input;
    inp.hack = -1;
    if (t < 0) {
      inp.steer = 0;
      inp.throttle = 0;
      inp.brake = 0;
      inp.drift = 0;
      return inp;
    }
    const spd = c.spd;

    // Feststecken: kurz zurücksetzen
    if (spd < 3 && t > 1.5 && !c.air) this.stuckT += dt;
    else this.stuckT = 0;
    if (this.stuckT > 1.0 && this.revT <= 0) {
      this.revT = 0.9;
      this.stuckT = 0;
    }

    const look = 8 + spd * 0.45;
    const kA = tr.indexAt(c.s + look);
    const dPlan = tr.line[kA];
    this._avoidance(car, sim, t, dt, dPlan);
    let dT = this.avoidT > 0 ? this.avoid : dPlan;

    // Boostfelder anfahren (Mittel/Schwer)
    if (this.level > 0 && this.avoidT <= 0) {
      const np = tr.nextPad(c.s, 4);
      if (np && np.dist < 45) {
        const st = sim.hacks.padState(np.pad, car.id, t, TMP2);
        if (!st.drain && Math.abs(st.d - dPlan) < 6) dT = st.d;
        else if (st.drain && Math.abs(st.d - dT) < np.pad.w + 2.4) dT = st.d + (dT >= st.d ? 1 : -1) * (np.pad.w + 2.6);
      }
    }

    const hwA = tr.hw[kA];
    LIM[0] = -hwA + 1.8;
    LIM[1] = hwA - 1.8;
    sim.hacks.limits(car.id, c.s + look, hwA, t + 0.5, LIM);
    dT = clamp(dT, LIM[0], Math.max(LIM[0], LIM[1]));
    tr.posAt(c.s + look, dT, TMP);

    // Pure Pursuit
    const fx = Math.sin(c.h);
    const fz = Math.cos(c.h);
    const ex = TMP.x - c.x;
    const ez = TMP.z - c.z;
    const lz = ex * fx + ez * fz;
    const lx = ex * -fz + ez * fx;
    const dist = Math.hypot(lx, lz) || 1;
    const alpha = Math.atan2(lx, lz);
    const wDes = ((2 * Math.sin(alpha)) / dist) * Math.max(spd, 6);
    const g = Math.min(1, spd / 7) * (1 - 0.45 * Math.min(1, spd / this.stats.top));
    let steer = wDes / (this.stats.turn * Math.max(0.25, g));
    // in Steilkurven lenkt das Kart stärker ein (siehe stepCar) – Lenkeinschlag entsprechend kleiner
    const bk = tr.bank[c.seg >= 0 ? c.seg : tr.indexAt(c.s)];
    if (bk * wDes < 0) steer /= 1 + BANK_GRIP * Math.min(1, Math.abs(bk) / BANK_MAX) * Math.min(1, spd / this.stats.top);
    steer += noise1(t * 0.8, this.seed) * this.L.noise;
    steer = clamp(steer, -1, 1);

    if (this.revT > 0) {
      this.revT -= dt;
      inp.steer = -steer;
      inp.throttle = 0;
      inp.brake = 1;
      inp.drift = 0;
      return inp;
    }

    // Tempo
    let rubber = 1;
    if (this.L.rubber > 0) {
      const lead = sim.humanLeadProg();
      if (lead != null) rubber = 1 + clamp((lead - c.prog) / 300, -1, 1) * this.L.rubber;
    }
    let vt = Infinity;
    const win = Math.max(12, spd * 0.9);
    for (let s2 = 0; s2 <= win; s2 += 4) vt = Math.min(vt, this.prof[tr.indexAt(c.s + s2)]);
    vt *= this.L.speed * rubber;
    if (c.drift) vt *= 1.08;
    let thr = 1;
    let brk = 0;
    if (spd > vt + 1.5) {
      thr = 0;
      if (spd > vt + 5) brk = 1;
    }

    // Drift in langen Kurven
    let drift = 0;
    if (c.air) {
      drift = this.level > 0 && !c.trick ? (c.pd ? 0 : 1) : 0;
      this.driftCurve = null;
    } else if (this.L.drift > 0) {
      if (!this.driftCurve) {
        for (const cv of tr.curves) {
          const into = tr.deltaS(cv.s0, c.s);
          if (into > -14 && into < cv.len - 25 && cv.len > 40 && cv.peak > 1 / 85 && spd > 22) {
            const ok = this.L.drift >= 1 || Math.round(cv.s0 / 10) % 2 === 0;
            if (ok) {
              this.driftCurve = cv;
              this.driftDir = -cv.sign;
            }
            break;
          }
        }
      }
      if (this.driftCurve) {
        const cv = this.driftCurve;
        const into = tr.deltaS(cv.s0, c.s);
        const maxLvl = this.L.drift >= 1 ? 3 : 2;
        drift = 1;
        if (into > cv.len - 10 || into < -20 || (c.driftLvl >= maxLvl && into > cv.len * 0.55) || spd < 15 || c.hitT < 0.05) {
          drift = 0;
          this.driftCurve = null;
        } else if (!c.drift) {
          steer = this.driftDir * Math.max(0.55, Math.abs(steer));
          brk = 0;
        }
      }
    }

    // Hacks
    this.hackT -= dt;
    // Schwere KI spart in manchen Phasen auf zwei Ladungen (für Klon / Kurve verengen)
    const save = this.L.hackSmart >= 2 && (Math.floor(t / 15) + this.seed) % 3 !== 0;
    if (this.hackT <= 0 && c.hack >= (save ? 2 : 1) && sim.state === 'racing' && !car.finished) {
      this.hackT = this.L.hackDelay * (0.6 + ((this.seed + Math.floor(t)) % 7) / 10);
      const tgt = sim.hackTarget(car);
      const tac = this.L.hackSmart >= 1 ? this._tactical(car, sim, t) : -1;
      if (tac >= 0) inp.hack = tac;
      else if (tgt && Math.abs(tgt.st.prog - c.prog) < 160) {
        let type = (Math.floor(t * 0.37) + this.seed) % 2 === 0 ? H_BARRIER : H_RAMP;
        if (this.L.hackSmart >= 1) {
          const nc = tr.nextCurve(tgt.st.s, 15);
          const np = tr.nextPad(tgt.st.s, 12);
          // Klon auch defensiv: als Führender vor den Verfolger setzen
          const gap = Math.abs(tgt.st.prog - c.prog);
          if (this.L.hackSmart >= 2 && c.hack >= HACKS[H_CLONE].cost && gap > 15 && gap < 90 && (Math.floor(t) + this.seed) % 2 === 0) type = H_CLONE;
          else if (this.L.hackSmart >= 2 && c.hack >= HACKS[H_SQUEEZE].cost && nc && nc.dist < 110) type = H_SQUEEZE;
          else if (np && np.dist < 90 && Math.floor(t) % 3 === 0) type = H_MIRROR;
        }
        inp.hack = type;
      }
    }

    inp.steer = steer;
    inp.throttle = thr;
    inp.brake = brk;
    inp.drift = drift;
    return inp;
  }

  // Lage-abhängige Hacks: Schockwelle bei Gegnern dicht dran, Rammstoß bei Gegner/Echo direkt voraus
  _tactical(car, sim, t) {
    const c = car.st;
    const fx = Math.sin(c.h);
    const fz = Math.cos(c.h);
    let close = 0;
    let ahead = false;
    const tr = sim.track;
    const lvl = tr.heightAt(c.s) + c.y;
    for (const o of sim.cars) {
      if (o === car || o.ghost || o.finished) continue;
      if (Math.abs(tr.heightAt(o.st.s) + o.st.y - lvl) > 2) continue; // andere Ebene (Brücke)
      const dx = o.st.x - c.x;
      const dz = o.st.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < SHOCK_R * 0.6) close++;
      const along = dx * fx + dz * fz;
      const lat = Math.abs(dx * fz - dz * fx);
      if (along > 3 && along < 16 && lat < 2.2) ahead = true;
    }
    if (!ahead) {
      for (const e of sim.echoes) {
        if (t < e.t0 || !e.solidFor(car.id)) continue;
        e.sample(t, E);
        if (Math.abs(E.y - lvl) > 2) continue;
        const dx = E.x - c.x;
        const dz = E.z - c.z;
        const along = dx * fx + dz * fz;
        if (along > 4 && along < 18 && Math.abs(dx * fz - dz * fx) < 2.2) {
          ahead = true;
          break;
        }
      }
    }
    if (close >= (this.L.hackSmart >= 2 ? 1 : 2)) return H_SHOCK;
    if (ahead && c.spd > 18) return H_RAM;
    return -1;
  }

  _avoidance(car, sim, t, dt, dPlan) {
    const c = car.st;
    const tr = this.track;
    const range = this.L.look;
    let nearest = Infinity;
    let choice = dPlan;
    const myV = c.spd;
    const self = this;

    function check(os, od, halfW, ov) {
      const ds = tr.deltaS(c.s, os);
      if (ds < 1.5 || ds > range) return;
      if (ov > 3 && myV - ov < 0.3 && ds > 9) return;
      const myD = c.d + (dPlan - c.d) * Math.min(1, ds / 30);
      if (Math.abs(myD - od) > halfW + 2.3) return;
      if (ds >= nearest) return;
      nearest = ds;
      const hwS = tr.hw[tr.indexAt(os)];
      const left = od - halfW - 2.6;
      const right = od + halfW + 2.6;
      const canL = left > -hwS + 1.5;
      const canR = right < hwS - 1.5;
      if (canL && canR) choice = Math.abs(left - c.d) < Math.abs(right - c.d) ? left : right;
      else if (canL) choice = left;
      else if (canR) choice = right;
      else choice = c.d >= od ? hwS - 1.5 : -hwS + 1.5;
    }

    for (const o of sim.cars) {
      if (o === car || o.ghost) continue;
      check(o.st.s, o.st.d, 1.1, o.st.spd);
    }
    for (const e of sim.echoes) {
      if (t < e.t0 || !e.solidFor(car.id)) continue;
      e.sample(t, E);
      const ddx = E.x - c.x;
      const ddz = E.z - c.z;
      if (ddx * ddx + ddz * ddz > (range + 10) * (range + 10)) continue;
      if (Math.abs(E.y - tr.surfaceY(c.s, c.d) - c.y) > 2) continue;
      // Suchhinweis veraltet, wenn das Echo inzwischen weit gefahren ist → globale Suche
      const far = e.aiX == null || (E.x - e.aiX) ** 2 + (E.z - e.aiZ) ** 2 > 200 * 200;
      tr.project(E.x, E.z, far ? -1 : e.aiSeg, TMP2);
      e.aiSeg = TMP2.i;
      e.aiX = E.x;
      e.aiZ = E.z;
      check(TMP2.s, TMP2.d, 1.1, Math.hypot(E.vx, E.vz));
    }
    for (const h of sim.hacks.list) {
      if (h.owner === car.id || t > h.tE) continue;
      if (h.type === H_BARRIER) check(h.s, h.d, h.w, 0);
      else if (h.type === H_RAMP && self.level > 0) check(h.s, h.d, h.w, 0);
      else if (h.type === H_CLONE && t > h.t0) {
        sim.hacks.clonePos(h, t, CL);
        check(CL.s, CL.d, 1.1, h.v);
      }
    }
    if (nearest < Infinity) {
      this.avoid = choice;
      this.avoidT = 0.5;
    } else {
      this.avoidT -= dt;
    }
  }
}
