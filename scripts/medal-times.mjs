// Entwickler-Werkzeug: misst die beste Runde einer schweren KI im Zeitfahren je Strecke und Auto
// (Grundlage für die Medaillenzeiten in trackDefs.js). Aufruf: node scripts/medal-times.mjs
import { Track } from '../src/game/track.js';
import { TRACK_DEFS, trackDefById } from '../src/game/trackDefs.js';
import { RaceSim } from '../src/game/sim.js';
import { CARS } from '../src/config.js';

for (const def of [...TRACK_DEFS, ...TRACK_DEFS.map((d) => trackDefById(d.id + '~m'))]) {
  const track = new Track(def);
  const bests = [];
  for (let car = 0; car < CARS.length; car++) {
    const sim = new RaceSim({ track, laps: 4, mode: 'timetrial', entrants: [{ id: 'ai', name: 'KI', kind: 'ai', car, color: '#fff', ai: 2 }] });
    while (sim.time < 300 && !sim.cars[0].finished) {
      sim.step();
      sim.events.length = 0;
    }
    bests.push(sim.cars[0].bestLap);
  }
  console.log(def.id.padEnd(10), bests.map((b) => b?.toFixed(2)).join(' '), ' min', Math.min(...bests).toFixed(2));
}
