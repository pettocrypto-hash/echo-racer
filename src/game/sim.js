// Renn-Simulation mit festem Zeittakt. Auf dem Host/Solo autoritativ (Runden, Echos, Hacks, Kollisionen),
// auf Clients nur für die Vorhersage des eigenen Autos (authority = false).

import { DT, COUNTDOWN, ECHO_EVERY, ECHO_PHASE_DIST, CARS, HACKS, ROCKET_EARLY, ROCKET_OK } from '../config.js';
import { clamp } from '../util.js';
import { createCarState, stepCar, collideCars, neutralInput, applyBoost } from './car.js';
import { EchoRecorder, Echo, encodeEcho, decodeEcho } from './echo.js';
import { HackManager, H_RAM } from './hacks.js';
import { AIDriver } from './ai.js';

const E = {};

// Tempo-Klasse: Höchsttempo und Beschleunigung skaliert, Lenkung etwas mit (sonst kommt man in schnellen Klassen nicht um die Kurven)
const statCache = new Map();
export function classStats(base, k) {
  if (k === 1) return base;
  const key = base.id + ':' + k;
  if (!statCache.has(key)) statCache.set(key, { ...base, top: base.top * k, accel: base.accel * (0.5 + 0.5 * k), turn: base.turn * (1 + (k - 1) * 0.45), grip: base.grip * (1 + (k - 1) * 0.5) });
  return statCache.get(key);
}

export class RaceSim {
  constructor({ track, laps = 3, entrants, mode = 'race', authority = true, localId = null, speed = 1 }) {
    this.speed = speed;
    this.track = track;
    this.laps = laps;
    this.mode = mode;
    this.authority = authority;
    this.localId = localId;
    this.time = -COUNTDOWN;
    this.tick = 0;
    this.state = 'countdown';
    this.echoes = [];
    this.nextEchoId = 1;
    this.hacks = new HackManager(track);
    this.events = [];
    this.endTimer = -1;
    this.finishOrder = 0;
    this.cars = entrants.map((e, idx) => this._makeCar(e, idx));
    this.byId = new Map(this.cars.map((c) => [c.id, c]));
    this.ranked = this.cars.slice();
    this.maxEchoes = 36;
    this.shockVictims = new Map(); // Hack-ID → Anzahl getroffener Autos (für Statistik)
    this._env = { track, time: 0, carId: null, echoes: this.echoes, hacks: this.hacks, pads: track.pads, jumps: track.jumps, ghost: false, others: [], nearMem: null };
    this._pool = [];
  }

  _makeCar(e, idx) {
    const tr = this.track;
    const st = createCarState();
    const slot = tr.gridSlot(e.slot ?? idx);
    const p = tr.posAt(slot.s, slot.d, {});
    st.x = p.x;
    st.z = p.z;
    st.h = p.h;
    st.seg = p.i;
    st.s = tr.wrapS(slot.s);
    st.d = slot.d;
    st.prog = tr.wrapS(slot.s) - tr.length;
    const car = {
      id: e.id,
      idx,
      name: e.name,
      kind: e.kind, // 'local' | 'remote' | 'ai' | 'net'
      carType: e.car,
      stats: classStats(CARS[e.car] || CARS[0], this.speed),
      color: e.color,
      rival: !!e.rival,
      st,
      prev: { x: st.x, z: st.z, y: 0, h: st.h, s: st.s, d: st.d || 0 },
      input: neutralInput(),
      inputTime: null,
      ai: e.kind === 'ai' ? new AIDriver(tr, classStats(CARS[e.car] || CARS[0], this.speed), e.ai ?? 1, idx * 7919 + 13) : null,
      auto: null,
      rec: new EchoRecorder(),
      recTick: 0,
      nextLine: 0,
      lapStart: null,
      lapTimes: [],
      bestLap: null,
      finished: false,
      finishTime: null,
      rank: idx + 1,
      ghost: false,
      lastHackT: -99,
      nearMem: new Map(),
      stat: { echoHits: 0, hackHits: 0, hacks: 0, nearMiss: 0, hitsTaken: 0, ultra: 0, tricks: 0, rams: 0, shockMax: 0 },
      paint: e.paint || 'standard',
      flame: e.flame || 'standard',
      driver: e.driver ?? idx % 8,
    };
    car.ev = (type, data) => this._onCarEvent(car, type, data);
    return car;
  }

  emit(ev) {
    this.events.push(ev);
  }

  makeAI(car, level) {
    return new AIDriver(this.track, car.stats, level, car.idx * 7919 + 13);
  }

  _capEchoes() {
    if (!this.maxEchoes) return;
    while (this.echoes.length > this.maxEchoes) this.echoes.shift();
  }

  step() {
    const dt = DT;
    this.tick++;
    this.time += dt;
    const t = this.time;
    for (const c of this.cars) {
      c.prev.x = c.st.x;
      c.prev.z = c.st.z;
      c.prev.y = c.st.y;
      c.prev.h = c.st.h;
      c.prev.s = c.st.s;
      c.prev.d = c.st.d;
    }
    if (t < 0) {
      // Turbostart: erster Drift-Druck im letzten Countdown-Abschnitt zählt (Fernfahrer melden ihn per Nachricht)
      for (const c of this.cars) {
        if (c.ai || c.kind === 'net' || c.kind === 'remote') continue;
        const on = !!c.input.drift;
        if (on && !c.rsPrev && c.rsAt == null && t > ROCKET_EARLY) c.rsAt = t;
        c.rsPrev = on;
      }
      return;
    }
    if (this.state === 'countdown') {
      this.state = 'racing';
      this.emit({ type: 'go' });
      for (const c of this.cars) {
        // KI: Schwer immer, Mittel jedes zweite Auto
        if (c.ai) c.rsAt = c.ai.level >= 2 || (c.ai.level === 1 && c.idx % 2 === 0) ? -0.25 : null;
        if (c.rsAt != null) this.applyRocket(c, c.rsAt);
      }
    }
    this.hacks.prune(t);

    for (const c of this.cars) {
      if (c.kind === 'net') continue;
      let inp;
      if (c.ai) inp = c.ai.update(c, this, t, dt);
      else if (c.finished && this.authority) {
        if (!c.auto) c.auto = new AIDriver(this.track, c.stats, 1, c.idx * 31 + 7);
        inp = c.auto.update(c, this, t, dt);
        inp.hack = -1;
        // Ehrenrunde: gemütlich ausrollen
        if (c.st.spd > 24) inp.throttle = 0;
      } else inp = c.input;
      const env = this._envFor(c, t);
      stepCar(c.st, c.stats, inp, dt, env, c.ev);
      if (this.authority && inp.hack != null && inp.hack >= 0) {
        this.tryHack(c, inp.hack);
        if (c.kind !== 'ai') inp.hack = -1;
      }
      if (this.authority) {
        this._laps(c, t);
        if (c.rec.active && (this.tick - c.recTick) % ECHO_EVERY === 0) c.rec.sample(c.st, this.track.surfaceY(c.st.s, c.st.d) + c.st.y);
      }
      this._stuck(c, t, dt);
    }
    if (this.authority) this._carCollisions();
    this._echoPhase(t);
    if (this.authority) {
      this._rank();
      this._checkEnd(dt);
    }
  }

  // Turbostart auswerten: im Fenster = Boost, zu früh = kurz durchdrehen
  applyRocket(c, at) {
    if (c.rsDone) return;
    c.rsDone = true;
    if (at > ROCKET_OK) {
      applyBoost(c.st, 1.4, 1.3);
      c.ev('rocket');
    } else {
      c.st.stallT = 0.8;
      c.ev('stall');
    }
  }

  _envFor(c, t) {
    const env = this._env;
    env.carId = c.id;
    env.time = c.kind === 'remote' && c.inputTime != null ? clamp(c.inputTime, t - 0.3, t) : t;
    env.ghost = c.ghost;
    env.nearMem = this.authority && !c.ghost ? c.nearMem : null;
    // Andere Fahrzeuge + feste Echos (für Windschatten und knappe Manöver)
    const others = env.others;
    others.length = 0;
    let n = 0;
    const take = () => {
      if (n >= this._pool.length) this._pool.push({ id: '', x: 0, z: 0, vx: 0, vz: 0 });
      return this._pool[n++];
    };
    if (!c.ghost) {
      // nur Autos/Echos auf derselben Ebene (Brücke!) zählen für Windschatten und Knapp-Bonus
      const lvl = this.track.heightAt(c.st.s) + c.st.y;
      for (const o of this.cars) {
        if (o === c || o.ghost) continue;
        if (Math.abs(this.track.heightAt(o.st.s) + o.st.y - lvl) > 1.3) continue;
        const p = take();
        p.id = o.id;
        p.x = o.st.x;
        p.z = o.st.z;
        p.vx = o.st.vx;
        p.vz = o.st.vz;
        others.push(p);
      }
      for (const e of this.echoes) {
        if (env.time < e.t0 || !e.solidFor(c.id)) continue;
        e.sample(env.time, E);
        if (Math.abs(E.y - lvl) > 1.3) continue;
        const p = take();
        p.id = 'e' + e.id;
        p.x = E.x;
        p.z = E.z;
        p.vx = E.vx;
        p.vz = E.vz;
        others.push(p);
      }
    }
    return env;
  }

  _onCarEvent(c, type, data) {
    if (type === 'hit') {
      c.stat.hitsTaken++;
      const o = data && data.owner !== c.id ? this.byId.get(data.owner) : null;
      if (o && data.kind === 'echo') o.stat.echoHits++;
      else if (o && data.kind === 'ram') o.stat.rams++;
      else if (o && data.kind === 'shock' && data.hid != null) {
        const n = (this.shockVictims.get(data.hid) || 0) + 1;
        this.shockVictims.set(data.hid, n);
        o.stat.shockMax = Math.max(o.stat.shockMax, n);
      }
    } else if (type === 'miniBoost' && data >= 3) {
      c.stat.ultra++;
    } else if (type === 'trickLand') {
      c.stat.tricks++;
    } else if (type === 'hackHit' || (type === 'drain' && data && data.owner)) {
      const o = this.byId.get(data.owner);
      if (o && o !== c) o.stat.hackHits++;
    } else if (type === 'nearMiss') {
      c.stat.nearMiss++;
    }
    this.events.push({ type, id: c.id, data });
  }

  _laps(c, t) {
    const st = c.st;
    if (st.prog < c.nextLine) return;
    const L = this.track.length;
    if (c.finished) {
      // Nach dem Zieleinlauf fährt der Autopilot weiter – ohne Runden und Echos
      c.nextLine += L;
      return;
    }
    if (c.nextLine === 0) {
      c.lapStart = t;
      c.rec.start(t);
      c.recTick = this.tick;
      c.rec.sample(st, this.track.surfaceY(st.s, st.d) + st.y);
      this.emit({ type: 'lapStart', id: c.id, t });
    } else {
      const lapTime = t - c.lapStart;
      st.lap++;
      c.lapTimes.push(lapTime);
      const prev = c.bestLap;
      const isBest = prev == null || lapTime < prev;
      if (isBest) c.bestLap = lapTime;
      const rec = c.rec.finish(t, st.x, st.z);
      if (rec) this._spawnEcho(c, rec, t);
      this.emit({ type: 'lap', id: c.id, lap: st.lap, time: lapTime, best: isBest, prev, t, rec });
      if (st.lap >= this.laps && !c.finished) {
        c.finished = true;
        c.finishTime = t;
        c.ghost = true;
        c.finishPos = ++this.finishOrder;
        this.emit({ type: 'finish', id: c.id, time: t, pos: c.finishPos });
      } else {
        c.lapStart = t;
        c.rec.start(t);
        c.recTick = this.tick;
        c.rec.sample(st, this.track.surfaceY(st.s, st.d) + st.y);
      }
    }
    c.nextLine += L;
  }

  _spawnEcho(c, rec, t) {
    const enc = encodeEcho(rec.data);
    const e = new Echo({ id: this.nextEchoId++, owner: c.id, lap: c.st.lap, t0: t, dur: rec.dur, data: decodeEcho(enc), color: c.color });
    this.echoes.push(e);
    this._capEchoes();
    this.emit({ type: 'echo', echo: e, enc });
    return e;
  }

  // Echo von außen hinzufügen (Netzwerk oder Rekord-Echo im Zeitfahren)
  addEcho(spec, data) {
    if (this.echoes.some((e) => e.id === spec.id)) return null;
    const owner = this.byId.get(spec.owner);
    const e = new Echo({ ...spec, data, color: spec.color || (owner ? owner.color : '#ffffff') });
    this.echoes.push(e);
    this._capEchoes();
    this.nextEchoId = Math.max(this.nextEchoId, (typeof spec.id === 'number' ? spec.id : 0) + 1);
    return e;
  }

  _stuck(c, t, dt) {
    const st = c.st;
    if (t < 2 || st.air) return;
    if (st.spd < 2.5) st.stuckT += dt;
    else st.stuckT = 0;
    const k = st.seg >= 0 ? st.seg : 0;
    const vAlong = st.vx * this.track.tx[k] + st.vz * this.track.tz[k];
    if (vAlong < -4) st.wrongT += dt;
    else st.wrongT = Math.max(0, st.wrongT - dt);
    if (st.stuckT > 3.2 || st.wrongT > 4) this.resetCar(c);
  }

  resetCar(c) {
    const st = c.st;
    const tr = this.track;
    const hwS = tr.hw[tr.indexAt(st.s)];
    const p = tr.posAt(st.s, clamp(st.d, -hwS * 0.5, hwS * 0.5), {});
    st.x = p.x;
    st.z = p.z;
    st.h = p.h;
    st.vx = Math.sin(p.h) * 12;
    st.vz = Math.cos(p.h) * 12;
    st.yaw = 0;
    st.drift = 0;
    st.driftT = 0;
    st.driftLvl = 0;
    st.air = 0;
    st.y = 0;
    st.vy = 0;
    st.stuckT = 0;
    st.wrongT = 0;
    st.hitT = 0;
    st.seg = p.i;
    this.emit({ type: 'reset', id: c.id });
  }

  _carCollisions() {
    const cars = this.cars;
    const tr = this.track;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.ghost) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.ghost) continue;
        // verschiedene Ebenen (Brücke) berühren sich nicht
        if (Math.abs(tr.heightAt(a.st.s) + a.st.y - tr.heightAt(b.st.s) - b.st.y) > 1.3) continue;
        collideCars(a.st, a.stats, b.st, b.stats, a.ev, b.ev, a.id, b.id);
      }
    }
  }

  _echoPhase(t) {
    for (const e of this.echoes) {
      if (!e.solid || t < e.t0) continue;
      let sampled = false;
      for (const c of this.cars) {
        if (e.cleared.has(c.id)) continue;
        if (!this.authority && c.kind !== 'local') continue;
        if (!sampled) {
          e.sample(t, E);
          sampled = true;
        }
        const dx = c.st.x - E.x;
        const dz = c.st.z - E.z;
        if (dx * dx + dz * dz > ECHO_PHASE_DIST * ECHO_PHASE_DIST) e.cleared.add(c.id);
      }
    }
  }

  _rank() {
    const arr = this.ranked;
    arr.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.st.prog - a.st.prog;
    });
    for (let i = 0; i < arr.length; i++) arr[i].rank = i + 1;
  }

  _checkEnd(dt) {
    if (this.state !== 'racing') return;
    let humans = 0;
    let done = 0;
    for (const c of this.cars) {
      if (c.kind === 'ai') continue;
      humans++;
      if (c.finished) done++;
    }
    if (humans === 0) return;
    if (done > 0 && this.endTimer < 0) this.endTimer = 30;
    if (this.endTimer >= 0) this.endTimer -= dt;
    if (done === humans || (this.endTimer >= 0 && this.endTimer <= 0 && done > 0)) {
      this.state = 'finished';
      this.emit({ type: 'raceEnd' });
    }
  }

  humanLeadProg() {
    let best = null;
    for (const c of this.cars) {
      if (c.kind === 'ai' || c.finished) continue;
      if (best == null || c.st.prog > best) best = c.st.prog;
    }
    return best;
  }

  // Ziel eines Hacks: das Auto direkt vor mir; als Führender das direkt hinter mir
  hackTarget(c) {
    let ahead = null;
    let aheadGap = Infinity;
    let behind = null;
    let behindGap = Infinity;
    for (const o of this.cars) {
      if (o === c || o.finished || o.ghost) continue;
      const dp = o.st.prog - c.st.prog;
      if (dp > 0 && dp < aheadGap) {
        aheadGap = dp;
        ahead = o;
      } else if (dp <= 0 && -dp < behindGap) {
        behindGap = -dp;
        behind = o;
      }
    }
    return ahead || behind;
  }

  tryHack(c, typeIdx) {
    if (!this.authority || this.state !== 'racing' || c.finished || this.mode === 'timetrial') return null;
    const H = HACKS[typeIdx];
    if (!H || c.st.hack < H.cost - 1e-6) return null;
    if (this.time - c.lastHackT < 0.8) return null;
    let target = null;
    let h;
    if (H.self) {
      // Schockwelle / Rammstoß wirken am eigenen Auto
      h = this.hacks.createSelf(typeIdx, c.id, c.color, c.st, this.time);
      if (typeIdx === H_RAM) {
        c.st.shieldT = H.dur;
        applyBoost(c.st, 1.1, 1.5);
      }
    } else {
      target = this.hackTarget(c);
      if (!target) return null;
      h = this.hacks.create(typeIdx, c.id, c.color, target.st, target.id, this.time);
    }
    if (!h) return null;
    c.st.hack = Math.max(0, c.st.hack - H.cost);
    c.lastHackT = this.time;
    c.stat.hacks++;
    this.emit({ type: 'hack', hack: h, owner: c.id, target: target ? target.id : null });
    return h;
  }

  results() {
    const arr = this.ranked.slice();
    return arr.map((c) => ({
      id: c.id,
      name: c.name,
      car: c.carType,
      color: c.color,
      driver: c.driver,
      kind: c.kind,
      rank: c.rank,
      finished: c.finished,
      time: c.finishTime,
      best: c.bestLap,
      laps: c.st.lap,
      stat: { ...c.stat },
    }));
  }
}
