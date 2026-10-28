// Entwickler-Test: prüft die Angriffe Schockwelle, Rammstoß und Echo-Klon in festen Situationen.
// Aufruf: node scripts/attack-test.mjs
import { Track } from '../src/game/track.js';
import { TRACK_DEFS } from '../src/game/trackDefs.js';
import { RaceSim } from '../src/game/sim.js';
import { PLAYER_COLORS } from '../src/config.js';
import { H_SHOCK, H_RAM, H_CLONE } from '../src/game/hacks.js';

let failed = false;
const check = (ok, msg) => {
  console.log((ok ? '  ok   ' : '  FEHLER ') + msg);
  if (!ok) failed = true;
};

// Zwei bis drei Autos auf der Startgeraden; Fahrer A (Index 0) bekommt volle Hack-Leiste
function setup(n = 3) {
  const track = new Track(TRACK_DEFS[0]);
  const entrants = Array.from({ length: n }, (_, i) => ({ id: 'P' + i, name: 'P' + i, kind: 'human', car: i, color: PLAYER_COLORS[i], slot: i }));
  const sim = new RaceSim({ track, laps: 3, entrants });
  for (const c of sim.cars) c.kind = 'local';
  while (sim.time < 0.5) {
    for (const c of sim.cars) c.input.throttle = 1;
    sim.step();
  }
  sim.cars[0].st.hack = 3;
  return sim;
}

function place(sim, c, s, d, speed) {
  const p = sim.track.posAt(s, d, {});
  Object.assign(c.st, { x: p.x, z: p.z, h: p.h, vx: Math.sin(p.h) * speed, vz: Math.cos(p.h) * speed, spd: speed, s, d, seg: p.i, yaw: 0, drift: 0, hitT: 9 });
  c.prev.x = p.x;
  c.prev.z = p.z;
}

// alle Autos folgen ihrer Spur (einfacher Regler auf den Querabstand d)
function run(sim, sec, lane = {}) {
  const evs = [];
  const end = sim.time + sec;
  while (sim.time < end) {
    for (const c of sim.cars) {
      c.input.throttle = 1;
      const k = sim.track.indexAt(c.st.s);
      const head = Math.atan2(Math.sin(c.st.h - sim.track.head[k]), Math.cos(c.st.h - sim.track.head[k]));
      c.input.steer = Math.max(-1, Math.min(1, (c.st.d - (lane[c.id] ?? c.lane ?? 0)) * -0.35 + head * 1.5));
    }
    sim.step();
    evs.push(...sim.events);
    sim.events.length = 0;
  }
  return evs;
}

console.log('Schockwelle');
{
  const sim = setup(3);
  const [a, b, c] = sim.cars;
  place(sim, a, 100, 0, 35);
  place(sim, b, 106, -2.5, 35); // dicht dran
  place(sim, c, 160, 0, 35); // weit weg
  const h = sim.tryHack(a, H_SHOCK);
  check(!!h && a.st.hack === 2, 'ausgelöst, eine Ladung verbraucht');
  // Takt für Takt: Tempo des Opfers direkt vor/nach dem Treffer vergleichen
  const hits = [];
  let before = 0;
  let after = 0;
  const end = sim.time + 0.8;
  while (sim.time < end) {
    for (const c of sim.cars) c.input.throttle = 1;
    const v0 = Math.hypot(b.st.vx, b.st.vz);
    sim.step();
    for (const e of sim.events) {
      if (e.type === 'hit' && e.data.kind === 'shock') {
        hits.push(e);
        if (e.id === 'P1') {
          before = v0;
          after = b.st.vx * Math.sin(b.st.h) + b.st.vz * Math.cos(b.st.h);
        }
      }
    }
    sim.events.length = 0;
  }
  check(hits.some((e) => e.id === 'P1'), 'nahes Auto getroffen');
  check(!hits.some((e) => e.id === 'P2'), 'fernes Auto nicht getroffen');
  check(!hits.some((e) => e.id === 'P0'), 'Besitzer immun');
  check(hits.filter((e) => e.id === 'P1').length === 1, 'genau ein Treffer pro Welle');
  check(after < before - 3, 'Opfer verliert Vortrieb (' + before.toFixed(1) + ' → ' + after.toFixed(1) + ' m/s vorwärts)');
}

console.log('Rammstoß');
{
  const sim = setup(2);
  const [a, b] = sim.cars;
  place(sim, a, 100, 0, 30);
  place(sim, b, 109, 0.3, 24);
  const h = sim.tryHack(a, H_RAM);
  check(!!h && a.st.shieldT > 1.5, 'Schild aktiv');
  const va0 = Math.hypot(a.st.vx, a.st.vz);
  check(va0 > 30, 'Schub nach vorn');
  a.lane = 0;
  b.lane = 0.3;
  let evs = [];
  let maxOff = 0;
  let fwdAfter = null;
  let fwdBefore = 0;
  for (let i = 0; i < 72; i++) {
    const f0 = b.st.vx * Math.sin(b.st.h) + b.st.vz * Math.cos(b.st.h);
    const e = run(sim, 1 / 60);
    if (e.some((x) => x.type === 'hit' && x.id === 'P1')) {
      fwdBefore = f0;
      fwdAfter = 0;
    }
    if (fwdAfter !== null) {
      maxOff = Math.max(maxOff, Math.abs(b.st.d - 0.3));
      if (fwdAfter === 0) fwdAfter = b.st.vx * Math.sin(b.st.h) + b.st.vz * Math.cos(b.st.h);
    }
    evs = evs.concat(e);
  }
  const hit = evs.find((e) => e.type === 'hit' && e.data.kind === 'ram' && e.id === 'P1');
  check(!!hit, 'Gegner gerammt');
  check(!evs.some((e) => e.type === 'hit' && e.id === 'P0'), 'Rammer selbst nicht getroffen');
  check(maxOff > 1.5, 'Gegner zur Seite geschleudert (' + maxOff.toFixed(1) + ' m)');
  check(fwdAfter !== null && fwdAfter < fwdBefore, 'Gegner nicht nach vorn geschoben (' + fwdBefore.toFixed(1) + ' → ' + (fwdAfter ?? 0).toFixed(1) + ' m/s)');
  run(sim, 1.2);
  check(a.st.shieldT === 0, 'Schild läuft ab');
}

console.log('Rammstoß bricht durch Echo');
{
  const sim = setup(2);
  const [a] = sim.cars;
  // stehendes Echo direkt voraus (fest für A)
  const tr = sim.track;
  const p = tr.posAt(120, 0, {});
  const data = new Float32Array(40 * 4);
  for (let i = 0; i < 40; i++) data.set([p.x, p.z, 0, p.h], i * 4);
  const e = sim.addEcho({ id: 99, owner: 'P1', lap: 1, t0: sim.time, dur: 2 }, data);
  e.cleared.add('P0');
  place(sim, a, 100, 0, 30);
  sim.tryHack(a, H_RAM);
  const evs = run(sim, 1.0);
  check(evs.some((x) => x.type === 'smash' && x.id === 'P0'), 'Durchbruch-Ereignis');
  check(!evs.some((x) => x.type === 'hit' && x.id === 'P0'), 'kein Echo-Treffer mit Schild');
  check(a.st.s > 125, 'fährt durch (s=' + a.st.s.toFixed(0) + ')');
}

console.log('Echo-Klon');
{
  const sim = setup(2);
  const [a, b] = sim.cars;
  place(sim, a, 80, 0, 30);
  place(sim, b, 100, 0, 36);
  const h = sim.tryHack(a, H_CLONE);
  check(!!h && a.st.hack === 1, 'gesetzt, zwei Ladungen verbraucht');
  const P = {};
  const s0 = sim.hacks.clonePos(h, h.tA, P).s;
  check(sim.track.deltaS(b.st.s, s0) > 20, 'Klon steht vor dem Ziel (' + sim.track.deltaS(b.st.s, s0).toFixed(0) + ' m)');
  const s1 = sim.hacks.clonePos(h, h.tA + 2, P).s;
  check(Math.abs(sim.track.deltaS(s0, s1) - h.v * 2) < 0.5, 'Klon fährt mit ' + h.v + ' m/s');
  const evs = run(sim, 4);
  check(evs.some((e) => e.type === 'hit' && e.data.kind === 'clone' && e.id === 'P1'), 'Ziel prallt auf den Klon (geradeaus fahrend)');
  check(!evs.some((e) => e.type === 'hit' && e.data.kind === 'clone' && e.id === 'P0'), 'Besitzer fährt durch');
  for (const c of sim.cars) check(isFinite(c.st.x) && isFinite(c.st.z), c.id + ' ohne NaN');
}

console.log('Netz-Format');
{
  const sim = setup(2);
  const h = sim.tryHack(sim.cars[0], H_CLONE);
  const copy = JSON.parse(JSON.stringify(h));
  const sim2 = setup(2);
  sim2.hacks.add(copy);
  const A = sim.hacks.clonePos(h, h.tA + 1.3, {});
  const B = sim2.hacks.clonePos(sim2.hacks.list[0], h.tA + 1.3, {});
  check(Math.abs(A.x - B.x) < 1e-6 && Math.abs(A.z - B.z) < 1e-6, 'Klon-Bahn auf Client identisch');
}

process.exit(failed ? 1 : 0);
