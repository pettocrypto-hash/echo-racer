// Eine laufende Rennsitzung. Rollen:
//  solo   – lokale, autoritative Simulation (mit KI oder Zeitfahren)
//  host   – wie solo, plus Netzwerk: Eingaben der Clients anwenden, Snapshots/Ereignisse senden
//  client – Vorhersage des eigenen Autos + Abgleich mit Host-Snapshots, fremde Autos extrapoliert
//  demo   – KI-Rennen als Menü-Hintergrund

import { DT, SNAP_EVERY, COUNTDOWN, HACKS } from './config.js';
import { Track } from './game/track.js';
import { trackDefById, medalFor, medalTimes, MEDALS } from './game/trackDefs.js';
import { RaceSim } from './game/sim.js';
import { packState, unpackState, stepCar, assistSteer } from './game/car.js';
import { decodeEcho, encodeEcho, stretchEcho } from './game/echo.js';
import { H_SHOCK, H_RAM, SHOCK_R } from './game/hacks.js';
import { RaceView } from './render/view.js';
import { clamp, lerp, lerpAngle, wrapAngle, round2, round3, fmtTime } from './util.js';
import { settings, vibrate, loadRecord, saveRecord } from './platform.js';

const STYLE_T = 4; // Sekunden, bis eine Stil-Kette ohne neue Aktion endet
const INTRO = 4.8; // Sekunden Kamerafahrt über die Strecke vor dem Countdown (nur Solo)
const trackCache = new Map();
export function getTrack(id) {
  const def = trackDefById(id);
  if (!trackCache.has(def.id)) trackCache.set(def.id, new Track(def));
  return trackCache.get(def.id);
}

function flagsOf(c) {
  const s = c.st;
  let f = 0;
  if (s.drift) f |= 1;
  if (s.drift > 0) f |= 2;
  if (s.boostT > 0) f |= 4;
  if (s.air) f |= 8;
  if (c.finished) f |= 16;
  if (s.trick) f |= 32;
  if (s.drafting) f |= 64;
  if (s.brk) f |= 128;
  if (c.ghost) f |= 256;
  if (s.scr) f |= 512;
  f |= (s.onPad & 3) << 10;
  if (s.hitT < 0.12) f |= 4096;
  if (s.wob > 0) f |= 8192;
  if (s.shieldT > 0) f |= 16384;
  return f;
}

function hackToNet(h) {
  const o = { id: h.id, type: h.type, owner: h.owner, color: h.color, target: h.target, t0: h.t0, tA: h.tA, tE: h.tE };
  if (h.s != null) Object.assign(o, { s: round3(h.s), d: round3(h.d) });
  if (h.w != null) o.w = round3(h.w);
  if (h.pad != null) o.pad = h.pad;
  if (h.s0 != null) Object.assign(o, { s0: round3(h.s0), s1: round3(h.s1), side: h.side });
  if (h.type === H_SHOCK) Object.assign(o, { x: h.x, z: h.z, vx: h.vx, vz: h.vz, y: h.y });
  if (h.v != null) Object.assign(o, { v: h.v, amp: h.amp });
  return o;
}

export class RaceSession {
  constructor(app, opts) {
    this.app = app;
    this.role = opts.role;
    this.mode = opts.mode || 'race';
    this.track = getTrack(opts.trackId);
    this.trackId = this.track.id;
    this.laps = opts.laps;
    this.localId = opts.localId ?? null;
    this.net = opts.net || null;
    this.onEnd = opts.onEnd || null;
    const ents = opts.entrants.map((e) => {
      let kind = e.kind;
      if (this.role === 'client') kind = e.id === this.localId ? 'local' : 'net';
      else if (this.role === 'host' && e.kind === 'human') kind = e.id === this.localId ? 'local' : 'remote';
      else if (e.kind === 'human') kind = 'local';
      return { ...e, kind };
    });
    this.sim = new RaceSim({ track: this.track, laps: this.laps, entrants: ents, mode: this.mode, authority: this.role !== 'client', localId: this.localId, speed: opts.speed || 1 });
    if (this.role === 'demo') this.sim.maxEchoes = 10;
    this.localCar = this.localId ? this.sim.byId.get(this.localId) : null;
    this.view = new RaceView(app.renderer, this.sim, {
      localId: this.localId,
      followId: this.localId || this.sim.cars[0].id,
      mode: this.role === 'demo' ? 'demo' : 'race',
    });
    // Atmosphäre: Umgebungsgeräusche der Welt und Töne aus der Kulisse (Feuerwerk) – nicht im Menü-Hintergrund
    if (this.role !== 'demo') {
      app.audio.startAmbience(this.track.def.theme);
      this.view.world.setSfx((name, k, delay) => app.audio.play(name, k, delay));
    }
    // Solo: erst Strecken-Intro (Kamerafahrt + Namenskarte), dann Countdown; Tippen/Taste überspringt
    this.introDur = this.role === 'solo' && !opts.noIntro ? INTRO : 0;
    this.introEnd = this.introDur ? performance.now() + this.introDur * 1000 : 0;
    this.goAt = opts.goAt ?? (this.role === 'solo' || this.role === 'demo' ? performance.now() + (this.introDur + COUNTDOWN) * 1000 + 400 : Infinity);
    if (this.introDur) {
      this._skipIntro = () => (this.skipIntro = true);
      setTimeout(() => {
        if (!this.introEnd) return;
        window.addEventListener('pointerdown', this._skipIntro, { once: true });
        window.addEventListener('keydown', this._skipIntro, { once: true });
      }, 250);
    }
    this.paused = false;
    this.pausedAt = 0;
    this.ended = false;
    this.renderTime = -COUNTDOWN;
    this.lastCount = 99;
    this.pendingHack = -1;
    this.results = null;
    // Netzwerk
    this.remotes = new Map(); // host: peerId -> { id, queue, lastQueued, ack }
    this.history = []; // client: Eingabe-Historie
    this.seq = 0;
    this.lastSnapTick = -1;
    this.lastResetReq = -9;
    this.record = this.mode === 'timetrial' ? loadRecord(this.trackId) : null;
    this.startRecordTime = this.record ? this.record.time : null;
    // Medaillen-Geist: fährt die Zielzeit der nächsten noch fehlenden Medaille vor (nur Zeitfahren)
    this.medalGhost = this.mode === 'timetrial' ? this._makeMedalGhost() : null;
    this.newRecord = false;
    this.daily = opts.daily || null;
    this.cls = opts.cls ?? 1;
    // Stil-Kette: Aktionen in schneller Folge erhöhen den Multiplikator, ein Treffer lässt sie reißen
    this.style = { pend: 0, n: 0, t: 0, mult: 1, total: 0, label: '', best: 0 };
    this.rankHeld = null;
    this.rankCand = null;
    this.rankCandT = 0;
    this.bestEchoEnc = null;
    this.hitStop = 0; // Sekunden eingefrorene Zeit (nur Solo)
    this.slowmo = 0; // Sekunden Zeitlupe (nur Solo)
  }

  setGoAt(goAt) {
    this.goAt = goAt;
  }

  raceTime(now) {
    if (!isFinite(this.goAt)) return -COUNTDOWN;
    const base = this.role === 'client' && this.net ? now + this.net.offset : now;
    return Math.max(-COUNTDOWN, (base - this.goAt) / 1000);
  }

  pause() {
    if (this.paused || (this.role !== 'solo')) return;
    this.paused = true;
    this.pausedAt = performance.now();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (isFinite(this.goAt)) this.goAt += performance.now() - this.pausedAt;
  }

  requestHack(type) {
    if (!this.localCar || this.mode === 'timetrial') return;
    if (this.role === 'client') this.net.send({ t: 'hackReq', type });
    else this.pendingHack = type;
  }

  requestReset() {
    if (!this.localCar || this.localCar.finished) return;
    const now = this.sim.time;
    if (now - this.lastResetReq < 2.5 || now < 0) return;
    this.lastResetReq = now;
    if (this.role === 'client') this.net.send({ t: 'reset' });
    this.sim.resetCar(this.localCar);
  }

  // --- Hauptschleife pro Bild ---
  frame(dt, now) {
    const sim = this.sim;
    if (this.introEnd) {
      if (this.skipIntro || now >= this.introEnd) {
        // Intro vorbei (oder übersprungen): Countdown beginnt sofort
        if (now < this.introEnd) this.goAt -= this.introEnd - now;
        this.introEnd = 0;
        this.view.introK = null;
        this.app.hud.introCard(null);
        window.removeEventListener('pointerdown', this._skipIntro);
        window.removeEventListener('keydown', this._skipIntro);
      } else this.view.introK = 1 - (this.introEnd - now) / (this.introDur * 1000);
    }
    if (this.localCar && this.role !== 'demo') {
      const e = this.app.input.consumeEdges();
      if (e.pause) this.app.togglePause();
      if (!this.paused) {
        if (e.cycle) this.app.cycleHack();
        if (e.sel != null) this.app.selectHack(e.sel);
        if (e.hack) this.requestHack(settings.hackType);
        if (e.reset) this.requestReset();
      }
    }
    if (this.paused) {
      this.view.update(0, 1, this.renderTime);
      this.view.render();
      return;
    }
    // Trefferstopp / Zeitlupe: im Solo-Rennen läuft die Rennuhr langsamer bzw. steht kurz
    if (this.role === 'solo') {
      if (this.hitStop > 0) {
        const d = Math.min(dt, this.hitStop);
        this.hitStop -= d;
        this.goAt += d * 1000;
      } else if (this.slowmo > 0) {
        this.slowmo -= dt;
        this.goAt += dt * 1000 * 0.72;
      }
    }
    this.view.slowmo = this.role === 'solo' ? clamp(this.slowmo / 0.4, 0, 1) : 0;
    const target = this.raceTime(now);
    let steps = 0;
    while (sim.time + DT <= target + 1e-6 && steps < 8) {
      this._tick();
      steps++;
    }
    if (target - sim.time > 0.25) {
      if (this.role === 'client') {
        while (sim.time + DT <= target - 0.05) sim.time += DT;
      } else {
        this.goAt += (target - sim.time) * 1000;
        if (this.role === 'host') this.net.broadcast({ t: 'clock', goAt: this.goAt });
      }
    }
    const alpha = clamp((target - sim.time) / DT, 0, 1);
    this.renderTime = sim.time - DT + alpha * DT;
    if (this.role === 'client') this._updateRemotes(dt, sim.time);
    if (this.localCar) {
      const k = Math.exp(-dt * 9);
      this.localCar.visOffX = (this.localCar.visOffX || 0) * k;
      this.localCar.visOffZ = (this.localCar.visOffZ || 0) * k;
    }
    this._drainEvents();
    this.view.lookBack = !!this.localCar && this.role !== 'demo' && this.app.input.lookBack();
    this.view.update(dt, alpha, this.renderTime);
    this.view.render();
    if (this.role !== 'demo') this._hud(dt);
  }

  _tick() {
    const sim = this.sim;
    const lc = this.localCar;
    if (lc && lc.kind === 'local') {
      const inp = this.app.input.poll(DT);
      // Lenkhilfe wirkt auf die Eingabe selbst – online landet so derselbe Wert beim Host
      if (settings.assist) inp.steer = assistSteer(lc.st, sim.track, inp.steer, !!lc.st.drift);
      lc.input.steer = inp.steer;
      lc.input.throttle = inp.throttle;
      lc.input.brake = inp.brake;
      lc.input.drift = inp.drift;
      if (this.pendingHack >= 0 && sim.time >= 0) {
        lc.input.hack = this.pendingHack;
        this.pendingHack = -1;
      }
      if (this.role === 'client' && sim.time + DT >= 0) {
        this.seq++;
        this.history.push({ seq: this.seq, t: round3(sim.time + DT), steer: inp.steer, throttle: inp.throttle, brake: inp.brake, drift: inp.drift });
        if (this.history.length > 240) this.history.shift();
      }
    }
    if (this.role === 'host') this._applyRemoteInputs();
    sim.step();
    if (this.role === 'client' && lc && lc.rsAt != null && !this.rsSent) {
      this.rsSent = true;
      this.net.send({ t: 'rs', at: round3(lc.rsAt) });
    }
    if (this.role === 'host' && sim.tick % SNAP_EVERY === 0) this._sendSnapshots();
    if (this.role === 'client' && sim.tick % 2 === 0 && this.history.length) this._sendInputs();
  }

  // ---------------- Host ----------------
  addRemote(peerId, carId) {
    this.remotes.set(peerId, { id: carId, queue: [], lastQueued: 0, ack: 0 });
  }

  removeRemote(peerId) {
    const r = this.remotes.get(peerId);
    if (!r) return;
    this.remotes.delete(peerId);
    const c = this.sim.byId.get(r.id);
    if (c && !c.finished) {
      // verlassener Spieler wird von der KI übernommen
      c.kind = 'ai';
      c.ai = this.sim.makeAI(c, 1);
      this.app.hud.toast(`${c.name} hat das Rennen verlassen – KI übernimmt`, 'info');
    }
  }

  onRemoteMsg(peerId, m) {
    const r = this.remotes.get(peerId);
    if (!r) return;
    const c = this.sim.byId.get(r.id);
    if (!c) return;
    if (m.t === 'in') {
      for (const row of m.i) {
        if (row[0] <= r.lastQueued) continue;
        r.queue.push(row);
        r.lastQueued = row[0];
      }
      r.queue.sort((a, b) => a[0] - b[0]);
    } else if (m.t === 'hackReq') {
      this.sim.tryHack(c, m.type | 0);
    } else if (m.t === 'reset') {
      if (!c.finished) this.sim.resetCar(c);
    } else if (m.t === 'rs') {
      // Turbostart des Clients (kommt die Meldung erst nach LOS an, gleich anwenden)
      const at = clamp(+m.at || 0, -1.6, 0.3);
      if (this.sim.state === 'countdown') c.rsAt = at;
      else if (this.sim.time < 0.6) this.sim.applyRocket(c, at);
    }
  }

  _applyRemoteInputs() {
    for (const r of this.remotes.values()) {
      const c = this.sim.byId.get(r.id);
      if (!c || c.kind !== 'remote') continue;
      if (r.queue.length > 5) r.queue.splice(0, r.queue.length - 2);
      const row = r.queue.shift();
      if (row) {
        c.input.steer = row[2];
        c.input.throttle = row[3];
        c.input.brake = row[4];
        c.input.drift = row[5];
        c.inputTime = row[1];
        r.ack = row[0];
      } else if (c.inputTime != null) {
        c.inputTime += DT;
      }
    }
  }

  _sendSnapshots() {
    const sim = this.sim;
    const cars = sim.cars.map((c) => {
      const s = c.st;
      return [c.idx, round2(s.x), round2(s.z), round2(s.y), round3(s.h), round2(s.vx), round2(s.vz), round3(s.yaw), flagsOf(c), s.driftLvl, s.lap, round2(s.prog), c.rank, round2(s.vy)];
    });
    for (const [pid, r] of this.remotes) {
      const c = sim.byId.get(r.id);
      if (!c) continue;
      this.net.sendFast(pid, { t: 's', k: sim.tick, tm: round3(sim.time), c: cars, me: [r.ack, ...packState(c.st)] });
    }
  }

  _netEvent(ev) {
    const net = this.net;
    switch (ev.type) {
      case 'echo':
        net.broadcast({ t: 'echo', e: ev.echo.toNet(), d: ev.enc });
        break;
      case 'hack':
        net.broadcast({ t: 'hack', h: hackToNet(ev.hack) });
        break;
      case 'lap':
        net.broadcast({ t: 'lap', id: ev.id, lap: ev.lap, time: round3(ev.time), best: ev.best, at: round3(ev.t) });
        break;
      case 'lapStart':
        net.broadcast({ t: 'lapStart', id: ev.id, at: round3(ev.t) });
        break;
      case 'finish':
        net.broadcast({ t: 'finish', id: ev.id, time: round3(ev.time), pos: ev.pos });
        break;
      case 'raceEnd':
        net.broadcast({ t: 'results', r: this.sim.results() });
        break;
      case 'hit':
        if (ev.data && ev.data.kind !== 'barrier') net.broadcast({ t: 'fx', type: 'hit', kind: ev.data.kind, id: ev.id, owner: ev.data.owner });
        break;
      case 'smash':
        net.broadcast({ t: 'fx', type: 'smash', kind: ev.data.kind, id: ev.id });
        break;
      case 'hackHit':
      case 'drain':
        if (ev.data && ev.data.owner) net.broadcast({ t: 'fx', type: 'hackHit', id: ev.id, owner: ev.data.owner });
        break;
      case 'nearMiss':
        net.broadcast({ t: 'fx', type: 'nearMiss', id: ev.id });
        break;
      default:
        break;
    }
  }

  // ---------------- Client ----------------
  _sendInputs() {
    const h = this.history;
    const rows = [];
    for (let i = Math.max(0, h.length - 6); i < h.length; i++) {
      const e = h[i];
      rows.push([e.seq, e.t, round2(e.steer), round2(e.throttle), e.brake ? 1 : 0, e.drift ? 1 : 0]);
    }
    this.net.sendFast({ t: 'in', i: rows });
  }

  onHostMsg(m) {
    const sim = this.sim;
    switch (m.t) {
      case 's':
        this._onSnapshot(m);
        break;
      case 'echo': {
        const e = sim.addEcho(m.e, decodeEcho(m.d));
        if (e) this._event({ type: 'echo', echo: e, id: e.owner });
        break;
      }
      case 'hack':
        sim.hacks.add(m.h);
        this._event({ type: 'hack', hack: m.h, owner: m.h.owner, target: m.h.target });
        break;
      case 'lapStart': {
        const c = sim.byId.get(m.id);
        if (c) c.lapStart = m.at;
        break;
      }
      case 'lap': {
        const c = sim.byId.get(m.id);
        const prev = c ? c.bestLap : null;
        if (c) {
          c.lapTimes.push(m.time);
          if (c.bestLap == null || m.time < c.bestLap) c.bestLap = m.time;
          c.lapStart = m.at;
        }
        this._event({ type: 'lap', id: m.id, lap: m.lap, time: m.time, best: m.best, prev });
        break;
      }
      case 'finish': {
        const c = sim.byId.get(m.id);
        if (c) {
          c.finished = true;
          c.finishTime = m.time;
          c.ghost = true;
          if (c === this.localCar) c.kind = 'net';
        }
        this._event({ type: 'finish', id: m.id, time: m.time, pos: m.pos });
        break;
      }
      case 'fx':
        // Treffer am eigenen Auto erzeugt die Vorhersage selbst – außer Rammstöße (Autokollisionen rechnet nur der Host)
        if (m.type === 'hit' && (m.kind === 'ram' || m.id !== this.localId)) this._event({ type: 'hit', id: m.id, data: { kind: m.kind, owner: m.owner }, remote: true });
        else if (m.type === 'smash' && m.id !== this.localId) this._event({ type: 'smash', id: m.id, data: { kind: m.kind } });
        else if (m.type === 'nearMiss' && m.id === this.localId) this._event({ type: 'nearMiss', id: m.id });
        else if (m.type === 'hackHit' && m.owner === this.localId && m.id !== this.localId) this._event({ type: 'hackHit', id: m.id, data: { owner: m.owner } });
        break;
      case 'results':
        this.results = m.r;
        this._event({ type: 'raceEnd' });
        break;
      case 'clock':
        this.goAt = m.goAt;
        break;
      default:
        break;
    }
  }

  _onSnapshot(m) {
    if (m.k <= this.lastSnapTick) return;
    this.lastSnapTick = m.k;
    const sim = this.sim;
    for (const row of m.c) {
      const c = sim.cars[row[0]];
      if (!c) continue;
      c.rank = row[12];
      if (c === this.localCar && c.kind === 'local') continue;
      const buf = c.netBuf || (c.netBuf = []);
      buf.push({ t: m.tm, x: row[1], z: row[2], y: row[3], h: row[4], vx: row[5], vz: row[6], yaw: row[7], f: row[8], dl: row[9], lap: row[10], prog: row[11], vy: row[13] });
      if (buf.length > 20) buf.shift();
      c.st.lap = row[10];
      c.st.prog = row[11];
      if (row[8] & 16) c.finished = true;
      c.ghost = !!(row[8] & 256);
    }
    const lc = this.localCar;
    if (m.me && lc && lc.kind === 'local') this._reconcile(m.me[0], m.me.slice(1));
  }

  _reconcile(ack, packed) {
    const c = this.localCar;
    const st = c.st;
    const ox = st.x;
    const oz = st.z;
    const oh = st.h;
    unpackState(packed, st);
    while (this.history.length && this.history[0].seq <= ack) this.history.shift();
    const sim = this.sim;
    for (const h of this.history) {
      const env = sim._envFor(c, h.t);
      env.nearMem = null;
      stepCar(st, c.stats, h, DT, env, null);
    }
    const ex = ox - st.x;
    const ez = oz - st.z;
    if (ex * ex + ez * ez > 100) {
      c.visOffX = 0;
      c.visOffZ = 0;
    } else {
      c.visOffX = (c.visOffX || 0) + ex;
      c.visOffZ = (c.visOffZ || 0) + ez;
    }
    c.prev.x -= ex;
    c.prev.z -= ez;
    const eh = wrapAngle(oh - st.h);
    c.prev.h -= eh;
  }

  _updateRemotes(dt, simTime) {
    for (const c of this.sim.cars) {
      if (c.kind !== 'net') continue;
      const buf = c.netBuf;
      if (!buf || !buf.length) continue;
      const last = buf[buf.length - 1];
      const src = last;
      // Dead Reckoning: vom letzten Snapshot mit Gierrate (Kreisbogen) auf "jetzt" vorausrechnen
      extrapolate(last, clamp(simTime - last.t, 0, 0.35), EX);
      const st = c.st;
      if (!c.netInit) {
        c.netInit = true;
        c.blendT = 1;
        c.shownX = EX.x;
        c.shownZ = EX.z;
        c.shownH = EX.h;
        c.shownVx = EX.vx;
        c.shownVz = EX.vz;
      }
      if (c.lastSrc !== last) {
        // Neuer Snapshot: von der bisher gezeigten Bewegung weich auf die neue Bahn überblenden
        // (Projective Velocity Blending – keine Sprünge in Position oder Geschwindigkeit)
        c.lastSrc = last;
        const ddx = c.shownX - EX.x;
        const ddz = c.shownZ - EX.z;
        if (ddx * ddx + ddz * ddz > 144) {
          c.shownX = EX.x;
          c.shownZ = EX.z;
          c.shownH = EX.h;
          c.blendT = 1;
        } else {
          c.blendT = 0;
          c.p0x = c.shownX;
          c.p0z = c.shownZ;
          c.v0x = c.shownVx;
          c.v0z = c.shownVz;
          c.h0 = c.shownH;
          c.yaw0 = st.yaw || 0;
        }
      }
      let x = EX.x;
      let z = EX.z;
      let h = EX.h;
      if (c.blendT < BLEND) {
        c.blendT = Math.min(BLEND, c.blendT + dt);
        const u = c.blendT / BLEND;
        const vbx = lerp(c.v0x, EX.vx, u);
        const vbz = lerp(c.v0z, EX.vz, u);
        const ox = c.p0x + vbx * c.blendT;
        const oz = c.p0z + vbz * c.blendT;
        x = lerp(ox, EX.x, u);
        z = lerp(oz, EX.z, u);
        h = lerpAngle(c.h0 - c.yaw0 * c.blendT, EX.h, u);
      }
      const y = last.y > 0 || last.vy > 0 ? Math.max(0, last.y + last.vy * EX.dt - 12 * EX.dt * EX.dt) : 0;
      if (dt > 0) {
        c.shownVx = (x - c.shownX) / dt;
        c.shownVz = (z - c.shownZ) / dt;
        if (c.shownVx * c.shownVx + c.shownVz * c.shownVz > 10000) {
          c.shownVx = EX.vx;
          c.shownVz = EX.vz;
        }
      }
      st.x = x;
      st.z = z;
      st.h = h;
      st.y = y;
      c.shownX = x;
      c.shownZ = z;
      c.shownH = h;
      st.vx = src.vx;
      st.vz = src.vz;
      st.vy = src.vy;
      st.spd = Math.hypot(src.vx, src.vz);
      st.yaw = src.yaw;
      const f = src.f;
      st.drift = f & 1 ? (f & 2 ? 1 : -1) : 0;
      st.driftLvl = src.dl;
      st.boostT = f & 4 ? 1 : 0;
      st.boostP = 1;
      st.air = f & 8 ? 1 : 0;
      st.trick = f & 32 ? 1 : 0;
      st.drafting = f & 64 ? 1 : 0;
      st.brk = f & 128 ? 1 : 0;
      st.scr = f & 512 ? 1 : 0;
      st.onPad = (f >> 10) & 3;
      st.wob = f & 8192 ? 0.3 : 0;
      st.shieldT = f & 16384 ? 1 : 0;
      if (f & 4096 && st.hitT > 0.3) {
        st.hitT = 0;
        this.view.onEvent({ type: 'bump', id: c.id });
      } else st.hitT += dt;
      const tr = this.track;
      tr.project(st.x, st.z, st.seg, PROJ);
      st.seg = PROJ.i;
      st.s = PROJ.s;
      st.d = PROJ.d;
      c.prev.x = st.x;
      c.prev.z = st.z;
      c.prev.y = st.y;
      c.prev.h = st.h;
      c.prev.s = st.s;
      c.prev.d = st.d;
    }
  }

  // ---------------- Ereignisse → Effekte, Sound, Haptik, HUD ----------------
  _drainEvents() {
    const evs = this.sim.events;
    if (!evs.length) return;
    this.sim.events = [];
    for (const ev of evs) {
      if (this.role === 'host') this._netEvent(ev);
      this._event(ev);
    }
  }

  // Stil-Punkte für eine Aktion des eigenen Autos (Basiswert × Ketten-Multiplikator)
  _style(label, base) {
    const c = this.localCar;
    if (!c || c.finished || this.role === 'demo' || this.sim.time < -0.5) return;
    const S = this.style;
    S.n++;
    S.mult = Math.min(4, 1 + Math.floor((S.n - 1) / 3) * 0.5);
    S.pend += Math.round(base * S.mult);
    S.t = STYLE_T;
    S.label = label;
  }

  _styleBank(broken) {
    const S = this.style;
    if (!S.n) return;
    const gain = broken ? Math.round(S.pend * 0.5) : S.pend;
    S.total += gain;
    S.best = Math.max(S.best, S.n);
    if (gain > 0) this.app.hud.styleBank(gain, broken);
    if (!broken && S.n >= 6) this.app.audio.play('best');
    S.pend = 0;
    S.n = 0;
    S.t = 0;
    S.mult = 1;
  }

  // Zuschauer in der Nähe jubeln (Tricks, Sprünge, Ultra-Boosts, knappe Manöver) – zählt für „Publikumsliebling“
  _crowd(k = 1) {
    const c = this.localCar;
    if (!c || this.role === 'demo' || c.finished) return;
    const t = this.sim.time;
    if (t - (this.crowdT ?? -9) < 1.5) return;
    if (!this.view.world.cheerNear(c.st.x, c.st.z, k)) return;
    this.crowdT = t;
    c.stat.crowd = (c.stat.crowd || 0) + 1;
    this.app.audio.play('cheer', 0.5);
  }

  // Ausruf der Figur eines Autos (Stimme je Fahrer)
  _say(id, kind, vol = 1, delay = 0) {
    const c = this.sim.byId.get(id);
    if (c) this.app.audio.voice(c.driver ?? 0, kind, vol, delay);
  }

  _event(ev) {
    this.view.onEvent(ev);
    if (this.role === 'demo') return;
    const app = this.app;
    const hud = app.hud;
    const au = app.audio;
    const me = this.localId;
    const isMe = ev.id != null && ev.id === me;
    const name = (id) => this.sim.byId.get(id)?.name || '?';
    switch (ev.type) {
      case 'go':
        au.play('go');
        au.play('cheer', 0.8);
        hud.bigMessage('LOS!', 700);
        vibrate(80);
        break;
      case 'driftLvl':
        if (isMe) {
          au.play('spark', ev.data);
          vibrate(12 + ev.data * 8);
        }
        break;
      case 'miniBoost':
        if (isMe) {
          this._style(['DRIFT', 'DRIFT', 'SUPER-DRIFT', 'ULTRA-DRIFT'][ev.data] || 'DRIFT', [30, 40, 80, 160][ev.data] || 40);
          au.play('boost');
          vibrate(25);
          if (ev.data >= 3) {
            hud.toast('ULTRA-BOOST!', 'boost');
            this._say(me, 'joy', 0.9);
          }
          if (ev.data >= 2) this._crowd(0.8);
        }
        break;
      case 'pad':
        if (isMe) {
          au.play('boost');
          this._style('BOOSTFELD', 25);
        }
        break;
      case 'hit': {
        const kind = ev.data && ev.data.kind;
        if (isMe && !ev.remote && kind && kind !== 'barrier') this.hitStop = Math.max(this.hitStop, kind === 'shock' || kind === 'ram' ? 0.09 : 0.06);
        if (isMe) {
          this._styleBank(true);
          au.play(kind === 'shock' || kind === 'ram' ? 'shock' : 'hit');
          this._say(me, 'hit');
          vibrate(kind === 'shock' || kind === 'ram' ? [70, 30, 70] : [45, 30, 45]);
          if (kind === 'echo') {
            hud.toast(ev.data.owner === me ? 'DEIN EIGENES ECHO!' : `ECHO VON ${name(ev.data.owner).toUpperCase()}`, 'hit');
          } else if (kind === 'barrier') hud.toast('BARRIERE!', 'hit');
          else if (kind === 'shock') hud.toast(`SCHOCKWELLE VON ${name(ev.data.owner).toUpperCase()}`, 'hit');
          else if (kind === 'ram') hud.toast(`GERAMMT VON ${name(ev.data.owner).toUpperCase()}`, 'hit');
          else if (kind === 'clone') hud.toast('KLON GERAMMT!', 'hit');
        } else if (ev.data && ev.data.owner === me && kind !== 'barrier') {
          const what = { echo: 'DEIN ECHO TRIFFT', shock: 'SCHOCKWELLE TRIFFT', ram: 'GERAMMT:', clone: 'DEIN KLON BLOCKT' }[kind] || 'TREFFER:';
          hud.toast(`${what} ${name(ev.id).toUpperCase()}`, 'good');
          au.play('spark', 2);
          // getroffener Gegner ärgert sich hörbar
          if (Math.random() < 0.7) this._say(ev.id, 'hit', 0.55);
          if (kind === 'echo') this._style('ECHO-TREFFER', 80);
        }
        break;
      }
      case 'smash':
        if (isMe) {
          this._style('DURCHBRUCH', 100);
          au.play('smash');
          this._say(me, 'joy', 0.9, 0.1);
          this._crowd(1);
          vibrate(20);
          hud.toast('DURCHBRUCH!', 'boost');
        }
        break;
      case 'wall':
        if (isMe) {
          au.play('wall', clamp((ev.data || 6) / 14, 0.4, 1.2));
          vibrate(18);
        }
        break;
      case 'bump':
        if (isMe) {
          au.play('bump');
          vibrate(25);
        }
        break;
      case 'nearMiss':
        if (isMe) {
          this._style('KNAPP VORBEI', 90);
          au.play('near');
          this._crowd(0.7);
          hud.toast('KNAPP! +HACK', 'good');
          vibrate(15);
        }
        break;
      case 'draft':
        if (isMe) {
          hud.toast('WINDSCHATTEN', 'info');
          this._style('WINDSCHATTEN', 50);
        }
        break;
      case 'launch':
        if (isMe) {
          au.play('launch');
          hud.toast('DRIFT DRÜCKEN = TRICK!', 'info');
        }
        break;
      case 'trick':
        if (isMe) au.play('trick');
        break;
      case 'rocket':
        if (isMe) {
          this._style('TURBOSTART', 120);
          au.play('boost');
          this._say(me, 'joy', 0.9, 0.05);
          vibrate(40);
          hud.toast('TURBOSTART!', 'boost');
        }
        break;
      case 'stall':
        if (isMe) {
          au.play('drain');
          hud.toast('ZU FRÜH – DURCHDREHEN!', 'hit');
        }
        break;
      case 'jump':
        if (isMe) {
          au.play('launch');
          this._crowd(0.9);
          if (!this.jumpHint) {
            this.jumpHint = true;
            hud.toast('IN DER LUFT: DRIFT = TRICK!', 'info');
          }
        }
        break;
      case 'trickLand':
        if (isMe) {
          this._style('TRICK', 120);
          au.play('boost');
          hud.toast('TRICK-LANDUNG!', 'boost');
          this._say(me, 'joy', 0.85);
          this._crowd(1);
        }
        break;
      case 'hardLand':
        if (isMe) {
          this._styleBank(true);
          au.play('land');
          this._say(me, 'hit', 0.8);
          vibrate(60);
          hud.toast('HARTE LANDUNG', 'hit');
        }
        break;
      case 'drain':
        if (isMe) {
          au.play('drain');
          hud.toast('GESPIEGELT – FELD BREMST!', 'hit');
          vibrate([30, 20, 30]);
        } else if (ev.data && ev.data.owner === me) this._style('HACK-TREFFER', 120);
        break;
      case 'hackHit':
        // jeder Treffer eines eigenen Hacks (Barriere, Rampe, Kurve, Schock, Rammen, Klon) zählt für die Stil-Kette
        if (!isMe && ev.data && ev.data.owner === me) this._style('HACK-TREFFER', 120);
        break;
      case 'reset':
        if (isMe) hud.toast('ZURÜCKGESETZT', 'info');
        break;
      case 'lap':
        if (isMe) {
          const final = ev.lap >= this.laps;
          if (!final) {
            au.play(ev.lap + 1 === this.laps ? 'final' : ev.best && ev.lap > 1 ? 'best' : 'lap');
            hud.lapBanner(ev.lap + 1, this.laps, ev.time, ev.best && ev.lap > 1, ev.prev);
            // Letzte Runde: Musik zieht das Tempo an
            if (ev.lap + 1 === this.laps) au.setMusicTempo(1.12);
          }
          if (this.mode === 'timetrial' && ev.rec) this._timeTrialLap(ev);
        }
        break;
      case 'echo':
        if (ev.echo && ev.echo.owner === me) {
          au.play('echo');
          hud.toast('ECHO GESETZT', 'echo');
        }
        break;
      case 'lapStart':
        if (isMe && this.mode === 'timetrial' && this.record && this.record.enc) {
          const data = decodeEcho(this.record.enc);
          this.sim.addEcho({ id: 'rec', owner: 'record', lap: 0, t0: ev.t, dur: this.record.dur, kind: 'record', solid: false, color: '#ff5fd0' }, data);
          hud.toast('REKORD-GEIST: ' + fmtTime(this.record.time), 'echo');
        }
        if (isMe && this.mode === 'timetrial' && this.medalGhost) {
          const g = this.medalGhost;
          if (this.sim.addEcho({ id: 'medal', owner: 'medal', lap: 0, t0: ev.t, dur: g.dur, kind: 'record', solid: false, color: g.medal.color }, g.data)) {
            hud.toast(`${g.medal.icon} ${g.medal.name.toUpperCase()}-GEIST: ${fmtTime(g.time)}`, 'echo');
          }
        }
        break;
      case 'hack': {
        const h = ev.hack;
        const H = HACKS[h.type];
        const lc = this.localCar;
        if (h.owner === me) {
          au.play(h.type === H_SHOCK ? 'shock' : h.type === H_RAM ? 'ram' : 'hack');
          vibrate(25);
          hud.toast(h.target != null ? `${H.short} → ${name(h.target).toUpperCase()}` : `${H.short}!`, 'hack');
        } else if (h.type === H_SHOCK && lc && !lc.finished && Math.hypot(lc.st.x - h.x, lc.st.z - h.z) < SHOCK_R + 8) {
          au.play('warn');
          hud.warning('⚠ SCHOCKWELLE!', h.color, 900);
        } else if (h.type === H_RAM && lc && !lc.finished && this._near(h.owner, 32)) {
          au.play('warn');
          hud.warning(`⚠ ${name(h.owner).toUpperCase()} RAMMT!`, h.color, 1100);
        } else if (h.target === me) {
          au.play('warn');
          vibrate([60, 40, 60]);
          hud.warning(`⚠ ${H.short} VORAUS!`, h.color, 1600);
        } else {
          hud.toast(`${name(h.owner)}: ${H.name}`, 'dim');
        }
        break;
      }
      case 'finish':
        if (isMe) {
          this._styleBank(false);
          au.play('finish');
          vibrate([80, 60, 80, 60, 160]);
          const c = this.sim.byId.get(me);
          if (this.mode === 'timetrial') hud.bigMessage('ZIEL!', 2200, `Beste Runde ${fmtTime(c.bestLap)}`);
          else hud.bigMessage(`ZIEL! PLATZ ${c.rank}`, 2600, fmtTime(ev.time));
          if (this.mode !== 'timetrial') this._say(me, c.rank === 1 ? 'win' : c.rank <= 3 ? 'happy' : 'sad', 1, 0.45);
          au.play('cheer', 1.2);
          this._photoFinish(ev);
        }
        break;
      case 'raceEnd':
        if (!this.ended) {
          this.ended = true;
          const res = this.results || this.sim.results();
          this.results = res;
          if (this.role !== 'demo') this.app.recordResults(this, res);
          // Solo-Rennen gegen KI: erst Siegerehrung auf dem Podest (Tippen/Taste überspringt), dann Ergebnis
          const ceremony = this.role === 'solo' && this.mode === 'race' && res.length > 2;
          let shown = false;
          const show = () => {
            if (shown) return;
            shown = true;
            window.removeEventListener('pointerdown', show);
            window.removeEventListener('keydown', show);
            this.app.showResults(this, res);
          };
          if (ceremony) {
            setTimeout(() => {
              if (this.app.session !== this) return;
              this.view.startCeremony(res.slice(0, 3).map((r) => r.id));
              this.app.hud.el.classList.add('hidden');
              this.app.audio.play('cheer', 1.4);
              this.app.audio.play('finish');
              this._say(res[0].id, 'win', 1, 0.6);
              setTimeout(() => {
                window.addEventListener('pointerdown', show);
                window.addEventListener('keydown', show);
              }, 700);
            }, 1200);
            setTimeout(show, 5600);
          } else setTimeout(show, 1400);
        }
        break;
      default:
        break;
    }
  }

  // Fotofinish: anderes Auto innerhalb von 0,45 s vor oder hinter mir → Zeitlupe + Einblendung
  _photoFinish(ev) {
    const me = this.localCar;
    if (!me || this.mode === 'timetrial') return;
    const v = Math.max(10, me.st.spd);
    let close = false;
    for (const o of this.sim.cars) {
      if (o === me) continue;
      if (o.finished && o.finishTime != null && Math.abs(o.finishTime - ev.time) < 0.45) close = true;
      else if (!o.finished && me.st.prog - o.st.prog >= 0 && (me.st.prog - o.st.prog) / v < 0.45) close = true;
    }
    if (!close) return;
    this.photoWin = me.rank === 1;
    if (this.role === 'solo') this.slowmo = 1.8;
    this.app.hud.bigMessage('FOTOFINISH!', 2200, `PLATZ ${me.rank} · ${fmtTime(ev.time)}`);
  }

  // Ist ein anderes Auto in der Nähe des eigenen?
  _near(id, dist) {
    const o = this.sim.byId.get(id);
    const lc = this.localCar;
    if (!o || !lc) return false;
    return Math.hypot(o.st.x - lc.st.x, o.st.z - lc.st.z) < dist;
  }

  _timeTrialLap(ev) {
    const enc = encodeEcho(ev.rec.data);
    const rec = this.record;
    if (!rec || ev.time < rec.time) {
      this.record = { time: ev.time, dur: ev.rec.dur, enc, car: this.localCar.carType, date: Date.now() };
      saveRecord(this.trackId, this.record);
      this.newRecord = true;
      this.app.hud.toast('NEUER STRECKENREKORD!', 'boost');
      this.app.audio.play('best');
    }
  }

  _hud(dt) {
    const hud = this.app.hud;
    const c = this.localCar;
    if (!c) return;
    const st = c.st;
    const t = this.renderTime;
    // Countdown (nicht während des Strecken-Intros)
    if (t < 0 && !this.introEnd) {
      const n = Math.ceil(-t);
      if (n !== this.lastCount && n <= 3) {
        this.lastCount = n;
        hud.bigMessage(String(n), 900, n === 1 ? 'DRIFT BEIM LOS = TURBOSTART' : '');
        if (n === 3) {
          if (this.daily) hud.toast('★ ' + this.daily.text.toUpperCase(), 'boost');
          const rv = this.sim.cars.find((o) => o.rival);
          if (rv) hud.toast(`⚔ DEIN RIVALE: ${rv.name.toUpperCase()}`, 'hit');
        }
        this.app.audio.play('count');
        vibrate(30);
      }
    }
    // Überholt? Ein Platz zählt erst, wenn er 1 s gehalten wurde – Seite-an-Seite-Duelle bringen keine Endlos-Punkte
    if (this.mode !== 'timetrial' && t > 1 && !c.finished) {
      if (this.rankCand !== c.rank) {
        this.rankCand = c.rank;
        this.rankCandT = t;
      } else if (t - this.rankCandT >= 1 && this.rankHeld !== c.rank) {
        if (this.rankHeld != null && c.rank < this.rankHeld) {
          this._style('ÜBERHOLT', 70 * (this.rankHeld - c.rank));
          this.app.audio.play('spark', 1);
          if (t - (this.passVoiceT ?? -9) > 4) {
            this.passVoiceT = t;
            this._say(c.id, 'happy', 0.7);
          }
        } else if (this.rankHeld != null && c.rank > this.rankHeld && t - (this.passVoiceT ?? -9) > 4) {
          // wer gerade vorbeigezogen ist, neckt – nur wenn er noch nah ist
          const by = this.sim.cars.find((o) => o.rank === c.rank - 1);
          if (by && Math.hypot(by.st.x - c.st.x, by.st.z - c.st.z) < 30) {
            this.passVoiceT = t;
            this._say(by.id, 'joy', 0.55);
          }
        }
        this.rankHeld = c.rank;
      }
    }
    // Rivale überholt / Rivale zieht vorbei (ebenfalls erst nach 1 s stabiler Reihenfolge)
    const rv = this.rivalCar === undefined ? (this.rivalCar = this.sim.cars.find((o) => o.rival) || null) : this.rivalCar;
    if (rv && t > 1 && !c.finished && !rv.finished) {
      const ahead = c.rank < rv.rank;
      if (this.rivalCand !== ahead) {
        this.rivalCand = ahead;
        this.rivalCandT = t;
      } else if (t - this.rivalCandT >= 1 && this.rivalAhead !== ahead) {
        if (this.rivalAhead != null) {
          if (ahead) {
            hud.toast(`⚔ ${rv.name.toUpperCase()} ÜBERHOLT!`, 'good');
            this._style('RIVALE ÜBERHOLT', 120);
          } else hud.toast(`⚔ ${rv.name.toUpperCase()} ZIEHT VORBEI`, 'hit');
        }
        this.rivalAhead = ahead;
      }
    }
    const S = this.style;
    if (S.n) {
      if (!this.paused) S.t -= dt;
      if (S.t <= 0 || c.finished) this._styleBank(false);
    }
    hud.styleChain(S.mult, S.pend, S.t / STYLE_T, S.label);
    const cur = c.lapStart != null && !c.finished ? Math.max(0, t - c.lapStart) : null;
    let target = null;
    if (this.mode !== 'timetrial' && !c.finished && (this.sim.tick & 7) === 0) {
      const tg = this.sim.hackTarget(c);
      this.hackTargetName = tg ? tg.name : null;
    }
    if (this.mode !== 'timetrial' && !c.finished) target = this.hackTargetName || null;
    hud.update({
      rank: c.rank,
      total: this.sim.cars.length,
      lap: Math.min(this.laps, st.lap + 1),
      laps: this.laps,
      lapTime: cur,
      best: c.bestLap,
      speed: st.spd * 3.6,
      hack: st.hack,
      hackType: settings.hackType,
      hackEnabled: this.mode !== 'timetrial' && t >= 0 && !c.finished,
      driftLvl: st.drift ? st.driftLvl : -1,
      boost: st.boostT > 0,
      wrong: st.wrongT > 1.2,
      drafting: st.drafting,
      finished: c.finished,
      mode: this.mode,
      record: this.record ? this.record.time : null,
      target,
      medal: this.mode === 'timetrial' ? this._medalGoal(c) : null,
      daily: this.daily ? this._dailyLine(c) : null,
    });
    hud.drawMinimap(this);
    // Motor-Sound
    const au = this.app.audio;
    if (this.ended) au.stopEngine();
    else if (t > -COUNTDOWN) {
      au.startEngine();
      au.setEngine(st.spd / c.stats.top, c.input.throttle || 0, st.boostT > 0, !!st.drift, st.driftLvl, !!st.air);
    }
  }

  // Tages-Challenge: Fortschritt live im HUD
  _dailyLine(c) {
    const ch = this.daily;
    const st = c.stat;
    switch (ch.kind) {
      case 'win':
        return `★ CHALLENGE: PLATZ 1 · JETZT ${c.rank}.`;
      case 'podium':
        return `★ CHALLENGE: PODEST · JETZT ${c.rank}.`;
      case 'tricks':
        return `★ CHALLENGE: TRICKS ${Math.min(st.tricks, ch.n)}/${ch.n}`;
      case 'ultra':
        return `★ CHALLENGE: ULTRA-BOOSTS ${Math.min(st.ultra, ch.n)}/${ch.n}`;
      case 'hacks':
        return `★ CHALLENGE: HACK-TREFFER ${Math.min(st.hackHits, ch.n)}/${ch.n}`;
      case 'clean':
        return st.hitsTaken ? '★ CHALLENGE: GETROFFEN – NEUSTART?' : '★ CHALLENGE: NOCH KEIN TREFFER';
      default:
        return '★ CHALLENGE: SILBER-MEDAILLE';
    }
  }

  // Zeitfahren: nächste noch nicht erreichte Medaille (für die HUD-Zeile)
  // Medaillen-Geist bauen: die schwere KI fährt die Strecke kurz ohne Grafik (wenige ms); ihre beste fliegende Runde
  // wird auf die Zielzeit der nächsten fehlenden Medaille gestreckt – gleiche Linie, genau das Medaillen-Tempo
  _makeMedalGhost() {
    const got = medalFor(this.trackId, this.record ? this.record.time : Infinity);
    if (got === 0) return null; // alle Medaillen: nur noch der eigene Rekord-Geist
    const medal = MEDALS[got < 0 ? MEDALS.length - 1 : got - 1];
    const target = medalTimes(this.trackId)[medal.id];
    const sim = new RaceSim({ track: this.track, laps: 3, mode: 'timetrial', entrants: [{ id: 'G', name: 'Geist', kind: 'ai', car: 0, color: '#ffffff', ai: 2 }] });
    let lap = null;
    while (sim.time < 200 && !sim.cars[0].finished) {
      sim.step();
      for (const ev of sim.events) if (ev.type === 'lap' && ev.rec && ev.lap >= 2 && (!lap || ev.time < lap.time)) lap = ev;
      sim.events.length = 0;
    }
    if (!lap) return null;
    return { medal, time: target, dur: target, data: stretchEcho(lap.rec.data, lap.rec.dur, target) };
  }

  _medalGoal(c) {
    const best = Math.min(this.record ? this.record.time : Infinity, c.bestLap ?? Infinity);
    const got = medalFor(this.trackId, best);
    if (got === 0) return { text: '◆ ALLE MEDAILLEN', color: MEDALS[0].color };
    const next = MEDALS[got < 0 ? MEDALS.length - 1 : got - 1];
    return { text: `${next.icon} ${next.name.toUpperCase()} ${medalTimes(this.trackId)[next.id].toFixed(2)}`, color: next.color };
  }

  dispose() {
    if (this._skipIntro) {
      window.removeEventListener('pointerdown', this._skipIntro);
      window.removeEventListener('keydown', this._skipIntro);
    }
    this.app.audio.stopEngine();
    if (this.role !== 'demo') this.app.audio.stopAmbience();
    this.view.dispose();
  }
}

const PROJ = {};
const BLEND = 0.15;
const EX = { x: 0, z: 0, h: 0, vx: 0, vz: 0, dt: 0 };

// Vorausberechnung auf einem Kreisbogen (Gierrate konstant)
function extrapolate(s, dtx, out) {
  const ang = -s.yaw * dtx;
  const cs = Math.cos(ang * 0.5);
  const sn = Math.sin(ang * 0.5);
  out.x = s.x + (s.vx * cs + s.vz * sn) * dtx;
  out.z = s.z + (-s.vx * sn + s.vz * cs) * dtx;
  out.h = s.h + ang;
  const cf = Math.cos(ang);
  const sf = Math.sin(ang);
  out.vx = s.vx * cf + s.vz * sf;
  out.vz = -s.vx * sf + s.vz * cf;
  out.dt = dtx;
  return out;
}
