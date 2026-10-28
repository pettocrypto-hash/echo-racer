// Entwickler-Test: Simuliert Rennen mit 6 KI-Autos auf allen Strecken (ohne Grafik).
// Aufruf: node scripts/sim-test.mjs
import { Track } from '../src/game/track.js';
import { TRACK_DEFS, trackDefById } from '../src/game/trackDefs.js';
import { RaceSim } from '../src/game/sim.js';
import { PLAYER_COLORS, CARS, HACKS } from '../src/config.js';

let failed = false;
for (const def of [...TRACK_DEFS, ...TRACK_DEFS.map((d) => trackDefById(d.id + '~m'))]) {
  const track = new Track(def);
  const entrants = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: 'ai' + i,
    name: 'KI' + i,
    kind: 'ai',
    car: i % CARS.length,
    color: PLAYER_COLORS[i],
    ai: [2, 2, 1, 1, 0, 0][i],
  }));
  const sim = new RaceSim({ track, laps: 3, entrants });
  const counts = {};
  const byHack = {};
  const byHit = {};
  let nan = false;
  let maxSpeed = 0;
  const t0 = Date.now();
  while (sim.time < 240) {
    sim.step();
    for (const c of sim.cars) {
      const s = c.st;
      if (!isFinite(s.x) || !isFinite(s.z) || !isFinite(s.vx) || !isFinite(s.h)) nan = true;
      maxSpeed = Math.max(maxSpeed, s.spd);
    }
    for (const e of sim.events) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      if (e.type === 'hack') byHack[e.hack.type] = (byHack[e.hack.type] || 0) + 1;
      if (e.type === 'hit') byHit[e.data.kind] = (byHit[e.data.kind] || 0) + 1;
    }
    sim.events.length = 0;
    if (sim.cars.every((c) => c.finished)) break;
  }
  const ms = Date.now() - t0;
  const fin = sim.cars.filter((c) => c.finished).length;
  console.log(`\n== ${def.name} (${track.length.toFixed(0)} m) – ${sim.time.toFixed(1)} s Spielzeit in ${ms} ms, max ${(maxSpeed * 3.6).toFixed(0)} km/h ${nan ? 'NaN!' : ''}`);
  for (const c of sim.ranked) {
    console.log(
      `  ${c.rank}. ${c.name} (${CARS[c.carType].name}, L${['Leicht', 'Mittel', 'Schwer'][c.ai?.level ?? 0]}) ` +
        `Runden ${c.st.lap} ${c.finished ? 'Ziel ' + c.finishTime.toFixed(2) : 'DNF'} ` +
        `beste ${c.bestLap?.toFixed(2)} laps=[${c.lapTimes.map((x) => x.toFixed(1)).join(', ')}] ` +
        `echoTreffer=${c.stat.echoHits} hacks=${c.stat.hacks} hackTreffer=${c.stat.hackHits} knapp=${c.stat.nearMiss} getroffen=${c.stat.hitsTaken}`
    );
  }
  console.log('  Ereignisse:', JSON.stringify(counts));
  console.log('  Hacks je Art:', HACKS.map((H, i) => H.short + '=' + (byHack[i] || 0)).join(' '), ' Treffer je Art:', JSON.stringify(byHit));
  console.log('  Echos:', sim.echoes.length);
  if (nan || fin < 6) failed = true;
}
process.exit(failed ? 1 : 0);
