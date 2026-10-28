// Spielfortschritt: Gesamtstatistik, Erfolge und freischaltbare Lacke (lokal im Browser gespeichert).

import { TRACK_DEFS, medalFor, mirrorId } from './game/trackDefs.js';
import { loadRecord } from './platform.js';
import { CARS, AI_LEVELS, FLAMES, CLASSES } from './config.js';

const KEY = 'echo-racer:progress';

// Lackierungen: Grundlack und Matt sind immer frei, der Rest kommt über Erfolge
export const PAINTS = [
  { id: 'standard', name: 'Metallic', desc: 'Klassischer Druckguss-Glanzlack' },
  { id: 'matte', name: 'Matt', desc: 'Seidenmatt, edel und ruhig' },
  { id: 'chrome', name: 'Chrom', desc: 'Spiegelglanz – wie frisch aus der Packung' },
  { id: 'pearl', name: 'Perlmutt', desc: 'Schimmert je nach Blickwinkel in Regenbogenfarben' },
  { id: 'holo', name: 'Holo', desc: 'Lebendiges Hologramm mit wandernden Farbbändern' },
  { id: 'carbon', name: 'Carbon', desc: 'Sichtcarbon mit Webmuster und farbigen Akzenten' },
  { id: 'gold', name: 'Gold', desc: 'Nur für Champions' },
  { id: 'stripes', name: 'Rennstreifen', desc: 'Zwei weiße Streifen über die ganze Länge', level: 2 },
  { id: 'candy', name: 'Candy', desc: 'Tiefer Bonbonglanz unter dickem Klarlack', level: 4 },
  { id: 'sunset', name: 'Abendrot', desc: 'Farbverlauf von vorn nach hinten in Abendrot', level: 7 },
  { id: 'neon', name: 'Neonkante', desc: 'Dunkler Lack, die Kanten leuchten in deiner Farbe', level: 10 },
  { id: 'galaxy', name: 'Galaxie', desc: 'Nachthimmel mit funkelnden Sternen', level: 15 },
];

const DEFAULT = {
  races: 0,
  wins: 0,
  podiums: 0,
  gpWins: 0,
  gpPodiums: 0,
  km: 0,
  ultra: 0,
  tricks: 0,
  hacks: 0,
  hackHits: 0,
  echoHits: 0,
  rams: 0,
  nearMiss: 0,
  shockMax: 0,
  cleanFinish: 0,
  photoWins: 0,
  mirrorWins: 0,
  xp: 0,
  styleBest: 0,
  dailyDone: '',
  dailyCount: 0,
  streak: 0,
  streakBest: 0,
  tracks: {},
  trackWins: {}, // Siege je Strecke (Spiegelstrecke zählt zur Grundstrecke)
  kartStats: {}, // je Kart (Index in CARS): r = beendete Rennen, w = Siege
  crowd: 0, // Zuschauer zum Jubeln gebracht
  ach: {},
  medals: {}, // je Strecke die schon mit XP belohnte Medaille (Index in MEDALS)
  missions: null, // Tagesaufträge { key, list, bonus }
  gpCups: {}, // beste GP-Ergebnisse je "Schwierigkeit-Klasse": { place, stars }
};

// Erfolge: Bedingung über den Fortschritt (p), Fortschrittsanzeige [aktuell, Ziel], optional ein Lack als Belohnung
export const ACHIEVEMENTS = [
  { id: 'firstWin', name: 'Erster Sieg', desc: 'Gewinne ein Rennen gegen KI oder Freunde.', goal: (p) => [p.wins, 1], paint: 'chrome' },
  { id: 'drift', name: 'Drift-König', desc: 'Lade 25 Ultra-Boosts (lila Funken).', goal: (p) => [p.ultra, 25], paint: 'pearl' },
  { id: 'hacker', name: 'Hacker', desc: 'Triff Gegner 30-mal mit deinen Hacks.', goal: (p) => [p.hackHits, 30], paint: 'holo' },
  { id: 'clean', name: 'Fehlerfrei', desc: 'Komm ohne einen einzigen Treffer ins Ziel.', goal: (p) => [p.cleanFinish, 1], paint: 'carbon' },
  { id: 'champ', name: 'Grand-Prix-Champion', desc: 'Gewinne eine Grand-Prix-Meisterschaft.', goal: (p) => [p.gpWins, 1], paint: 'gold' },
  { id: 'echo', name: 'Echo-Meister', desc: 'Deine Echos treffen Gegner 20-mal.', goal: (p) => [p.echoHits, 20] },
  { id: 'ram', name: 'Rammbock', desc: 'Ramme 10 Gegner mit dem Rammstoß.', goal: (p) => [p.rams, 10] },
  { id: 'shock', name: 'Erdbeben', desc: 'Erwische 3 Autos mit einer einzigen Schockwelle.', goal: (p) => [p.shockMax, 3] },
  { id: 'tricks', name: 'Trickser', desc: 'Lande 15 Tricks nach Rampen.', goal: (p) => [p.tricks, 15] },
  { id: 'photo', name: 'Haaresbreite', desc: 'Gewinne ein Fotofinish.', goal: (p) => [p.photoWins, 1] },
  { id: 'world', name: 'Weltenbummler', desc: 'Fahre auf allen Strecken.', goal: (p) => [TRACK_DEFS.filter((d) => p.tracks[d.id] || p.tracks[d.id + '~m']).length, TRACK_DEFS.length] },
  { id: 'mirror', name: 'Spiegelwelt', desc: 'Gewinne ein Rennen auf einer gespiegelten Strecke.', goal: (p) => [p.mirrorWins, 1] },
  { id: 'records', name: 'Rekordjäger', desc: 'Stelle auf jeder Strecke einen Zeitfahr-Rekord auf.', goal: () => [TRACK_DEFS.filter((d) => loadRecord(d.id)).length, TRACK_DEFS.length] },
  { id: 'mirrorRec', name: 'Seitenverkehrt', desc: 'Stelle auf jeder gespiegelten Strecke einen Zeitfahr-Rekord auf.', goal: () => [TRACK_DEFS.filter((d) => loadRecord(d.id + '~m')).length, TRACK_DEFS.length] },
  { id: 'goldAll', name: 'Goldrausch', desc: 'Hol dir im Zeitfahren auf jeder Strecke mindestens Gold.', goal: () => [medalCount(1), TRACK_DEFS.length] },
  { id: 'echoMedal', name: 'Echo-Ass', desc: 'Schlage auf einer Strecke die Echo-Medaillenzeit.', goal: () => [Math.min(1, medalCount(0)), 1] },
  { id: 'daily', name: 'Stammgast', desc: 'Schaffe 7 Tages-Challenges in Folge.', goal: (p) => [p.streakBest, 7] },
  { id: 'level', name: 'Profi', desc: 'Erreiche Fahrer-Level 20.', goal: (p) => [levelInfo(p.xp).level, 20] },
  { id: 'style', name: 'Stilikone', desc: 'Sammle 5.000 Stil-Punkte in einem einzigen Rennen.', goal: (p) => [Math.min(p.styleBest, 5000), 5000] },
  { id: 'stars3', name: 'Drei Sterne', desc: 'Gewinne einen Grand Prix auf „Schwer" mit drei Sternen.', goal: (p) => [Object.entries(p.gpCups || {}).some(([k, v]) => k.startsWith('2-') && v.stars >= 3) ? 1 : 0, 1] },
  { id: 'marathon', name: 'Marathon', desc: 'Fahre insgesamt 100 km.', goal: (p) => [Math.floor(p.km), 100] },
  { id: 'parkWin', name: 'Manege frei', desc: 'Gewinne ein Rennen im Lunapark.', goal: (p) => [Math.min(1, (p.trackWins || {}).park || 0), 1] },
  { id: 'crowd', name: 'Publikumsliebling', desc: 'Bring Zuschauer 25-mal mit Tricks, Sprüngen, Ultra-Boosts oder knappen Manövern zum Jubeln.', goal: (p) => [Math.min(p.crowd || 0, 25), 25] },
  { id: 'allWins', name: 'Weltmeister', desc: 'Gewinne auf jeder Strecke mindestens ein Rennen.', goal: (p) => [TRACK_DEFS.filter((d) => (p.trackWins || {})[d.id]).length, TRACK_DEFS.length] },
];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { ...DEFAULT, ...p, tracks: { ...(p.tracks || {}) }, trackWins: { ...(p.trackWins || {}) }, kartStats: { ...(p.kartStats || {}) }, ach: { ...(p.ach || {}) }, medals: { ...(p.medals || {}) } };
    }
  } catch {
    /* privater Modus o.ä. */
  }
  return { ...DEFAULT, tracks: {}, trackWins: {}, kartStats: {}, ach: {}, medals: {} };
}

export const progress = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* egal */
  }
}

export function achProgress(a) {
  const [cur, max] = a.goal(progress);
  return { cur: Math.min(cur, max), max, done: !!progress.ach[a.id] };
}

// Anzahl Strecken (normal oder gespiegelt), auf denen mindestens Medaille maxIdx erreicht ist (0 = Echo, 1 = Gold …)
export function medalCount(maxIdx) {
  return TRACK_DEFS.filter((d) =>
    [d.id, d.id + '~m'].some((id) => {
      const m = medalFor(id, loadRecord(id)?.time);
      return m >= 0 && m <= maxIdx;
    })
  ).length;
}

// Schon mit XP belohnte Medaille einer Strecke (-1 = keine). Getrennt vom Rekord gespeichert,
// damit ein Neustart nach einer Rekordrunde die Medaille nicht „verschluckt“.
export function medalAwarded(id) {
  const v = progress.medals[id];
  return v == null ? -1 : v;
}

export function awardMedal(id, idx) {
  if (idx < 0) return;
  const prev = medalAwarded(id);
  if (prev < 0 || idx < prev) {
    progress.medals[id] = idx;
    save();
  }
}

// ---------- Fahrer-Level ----------
export const MAX_LEVEL = 50;
export function levelNeed(level) {
  return 120 + 45 * (level - 1);
}
export function levelInfo(xp) {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp || 0));
  while (level < MAX_LEVEL && rest >= levelNeed(level)) {
    rest -= levelNeed(level);
    level++;
  }
  const max = level >= MAX_LEVEL;
  return { level, cur: max ? levelNeed(level) : rest, need: levelNeed(level), max };
}

// Erfahrungspunkte für ein Rennen (Liste der Posten [Text, XP] für die Ergebnisanzeige)
export function raceXP({ row, mode, total, newRecord, medal, prevMedal, style = 0 }) {
  const items = [];
  if (!row) return items;
  const st = row.stat || {};
  const add = (label, v) => v > 0 && items.push([label, Math.round(v)]);
  if (row.finished) add(mode === 'timetrial' ? 'Zeitfahren beendet' : 'Rennen beendet', 40 + (row.laps || 0) * 5);
  if (mode !== 'timetrial' && total > 1 && row.finished) add(`Platz ${row.rank}`, [110, 75, 55, 35, 25, 15][row.rank - 1] || 0);
  add('Ultra-Boosts', (st.ultra || 0) * 5);
  add('Tricks', (st.tricks || 0) * 4);
  add('Hack-Treffer', (st.hackHits || 0) * 6);
  add('Echo-Treffer', (st.echoHits || 0) * 5);
  add('Knapp vorbei', (st.nearMiss || 0) * 3);
  add('Gerammt', (st.rams || 0) * 5);
  if (row.finished && mode !== 'timetrial' && total > 1 && (st.hitsTaken || 0) === 0) add('Fehlerfrei', 30);
  if (style > 0) add(`Stil ${style.toLocaleString('de-DE')}${style > progress.styleBest ? ' (Bestwert!)' : ''}`, style / 25);
  if (newRecord) add('Neuer Rekord', 40);
  if (medal >= 0 && (prevMedal < 0 || medal < prevMedal)) add(`${['Echo', 'Gold', 'Silber', 'Bronze'][medal]}-Medaille`, [200, 120, 70, 40][medal]);
  return items;
}

// Bester Stil-Wert eines Rennens
export function recordStyle(pts) {
  if (!(pts > progress.styleBest)) return false;
  progress.styleBest = Math.round(pts);
  save();
  return true;
}

// XP gutschreiben; Rückgabe: { before, after, levelUps: [neue Level], paints: [freigeschaltete Lacke] }
export function addXP(amount) {
  const before = levelInfo(progress.xp);
  progress.xp += Math.max(0, Math.round(amount));
  const after = levelInfo(progress.xp);
  const levelUps = [];
  for (let l = before.level + 1; l <= after.level; l++) levelUps.push(l);
  const paints = PAINTS.filter((p) => p.level && p.level > before.level && p.level <= after.level);
  const flames = FLAMES.filter((f) => f.level && f.level > before.level && f.level <= after.level);
  save();
  return { before, after, levelUps, paints, flames };
}

export function classUnlocked(i) {
  const C = CLASSES[i];
  return !!C && (!C.level || levelInfo(progress.xp).level >= C.level);
}

export function flameUnlocked(id) {
  const F = FLAMES.find((f) => f.id === id);
  return !!F && (!F.level || levelInfo(progress.xp).level >= F.level);
}

// Nächste Level-Belohnung (Lack oder Flamme) oberhalb des aktuellen Levels
export function nextReward(level) {
  const all = [
    ...PAINTS.filter((p) => p.level).map((p) => ({ level: p.level, name: p.name + '-Lack' })),
    ...FLAMES.filter((f) => f.level).map((f) => ({ level: f.level, name: 'Flamme „' + f.name + '“' })),
    ...CLASSES.filter((c) => c.level).map((c) => ({ level: c.level, name: 'Klasse ' + c.name })),
  ];
  return all.filter((r) => r.level > level).sort((a, b) => a.level - b.level)[0] || null;
}

// ---------- Tagesaufträge: drei Ziele, die über alle Rennen des Tages zählen ----------
const MISSION_POOL = [
  { kind: 'races', n: 3, xp: 100 },
  { kind: 'wins', n: 2, xp: 180 },
  { kind: 'podium', n: 3, xp: 140 },
  { kind: 'tricks', n: 12, xp: 120 },
  { kind: 'ultra', n: 8, xp: 140 },
  { kind: 'hackHits', n: 10, xp: 130 },
  { kind: 'echoHits', n: 6, xp: 120 },
  { kind: 'nearMiss', n: 8, xp: 110 },
  { kind: 'style', n: 8000, xp: 150 },
  { kind: 'km', n: 12, xp: 110 },
  { kind: 'track', n: 2, xp: 130 },
  { kind: 'rival', n: 2, xp: 160 },
  { kind: 'medal', n: 1, xp: 150 },
];

export function missionsToday() {
  const key = dayKey();
  if (!progress.missions || progress.missions.key !== key) {
    const r = rng('echo-missions:' + key);
    const pool = MISSION_POOL.slice();
    const list = [];
    while (list.length < 3 && pool.length) {
      const m = pool.splice(Math.floor(r() * pool.length), 1)[0];
      const item = { kind: m.kind, n: m.n, xp: m.xp, cur: 0, done: false };
      if (m.kind === 'track') item.track = TRACK_DEFS[Math.floor(r() * TRACK_DEFS.length)].id;
      list.push(item);
    }
    progress.missions = { key, list, bonus: false };
    save();
  }
  return progress.missions;
}

export function missionText(m) {
  const T = TRACK_DEFS.find((d) => d.id === m.track);
  switch (m.kind) {
    case 'races': return `Fahre ${m.n} Rennen ins Ziel`;
    case 'wins': return `Gewinne ${m.n} Rennen`;
    case 'podium': return `Fahre ${m.n}-mal aufs Podest`;
    case 'tricks': return `Lande ${m.n} Tricks`;
    case 'ultra': return `Lade ${m.n} Ultra-Boosts`;
    case 'hackHits': return `Triff Gegner ${m.n}-mal mit Hacks`;
    case 'echoHits': return `Deine Echos treffen ${m.n}-mal`;
    case 'nearMiss': return `Schaffe ${m.n} knappe Manöver`;
    case 'style': return `Sammle ${m.n.toLocaleString('de-DE')} Stil-Punkte`;
    case 'km': return `Fahre ${m.n} km`;
    case 'track': return `Fahre ${m.n} Rennen auf ${T ? T.name : 'einer Strecke'}`;
    case 'rival': return `Schlage ${m.n}-mal deinen Rivalen`;
    default: return 'Hol im Zeitfahren eine Medaille';
  }
}

// Fortschrittsanzeige "4/12" (Stil und km mit eigener Formatierung)
export function missionCount(m) {
  const f = (v) => (m.kind === 'km' ? v.toFixed(1) : Math.floor(v).toLocaleString('de-DE'));
  return `${f(Math.min(m.cur, m.n))} / ${f(m.n)}`;
}

// Ergebnis eines Rennens auf die Aufträge anrechnen; Rückgabe: XP-Posten neu erledigter Aufträge + Liste der Fortschritte
export function updateMissions({ row, mode, total, trackId, trackLength, style, rivalBeaten, runMedal }) {
  const M = missionsToday();
  const xp = [];
  const moved = [];
  if (!row) return { xp, moved };
  const st = row.stat || {};
  const race = mode !== 'timetrial' && total > 1 && row.finished;
  for (const m of M.list) {
    if (m.done) continue;
    let add = 0;
    switch (m.kind) {
      case 'races': add = row.finished ? 1 : 0; break;
      case 'wins': add = race && row.rank === 1 ? 1 : 0; break;
      case 'podium': add = race && row.rank <= 3 ? 1 : 0; break;
      case 'tricks': add = st.tricks || 0; break;
      case 'ultra': add = st.ultra || 0; break;
      case 'hackHits': add = st.hackHits || 0; break;
      case 'echoHits': add = st.echoHits || 0; break;
      case 'nearMiss': add = st.nearMiss || 0; break;
      case 'style': add = style || 0; break;
      case 'km': add = ((row.laps || 0) * trackLength) / 1000; break;
      case 'track': add = row.finished && String(trackId).replace(/~m$/, '') === m.track ? 1 : 0; break;
      case 'rival': add = rivalBeaten ? 1 : 0; break;
      default: add = mode === 'timetrial' && runMedal >= 0 ? 1 : 0;
    }
    if (add <= 0) continue;
    m.cur = Math.min(m.n, m.cur + add);
    moved.push(m);
    if (m.cur >= m.n) {
      m.done = true;
      xp.push([`Auftrag: ${missionText(m)}`, m.xp]);
    }
  }
  if (!M.bonus && M.list.every((m) => m.done)) {
    M.bonus = true;
    xp.push(['Alle Aufträge erledigt', 150]);
  }
  save();
  return { xp, moved };
}

// ---------- Tages-Challenge ----------
function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function yesterdayKey() {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return dayKey(y);
}
// Vortag zu einem Schlüssel "JJJJ-MM-TT"
function prevDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}
export function todayKey() {
  return dayKey();
}
function rng(seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Aufgabe des Tages: feste Strecke, Richtung, Auto und Ziel (für alle Spieler am selben Tag gleich)
export function dailyChallenge(date = new Date()) {
  const key = dayKey(date);
  const r = rng('echo-daily:' + key);
  const def = TRACK_DEFS[Math.floor(r() * TRACK_DEFS.length)];
  const mirror = r() < 0.35;
  const car = Math.floor(r() * CARS.length);
  const kinds = ['win', 'win', 'podium', 'medal', 'tricks', 'ultra', 'hacks', 'clean'];
  let kind = kinds[Math.floor(r() * kinds.length)];
  const diff = r() < 0.4 ? 2 : 1;
  // Trick-Ziel nur so hoch, wie es Schanzen gibt (3 Runden × Schanzen je Runde)
  const jumps = (def.jumps || []).length;
  if (kind === 'tricks' && !jumps) kind = 'ultra';
  const nTricks = Math.min(4, jumps * 3);
  const base = { key, trackId: mirrorId(def.id, mirror), trackName: def.name + (mirror ? ' ⇄' : ''), car, kind, diff, laps: 3, opponents: 5, mode: 'race' };
  const lvl = AI_LEVELS[diff].name;
  switch (kind) {
    case 'win':
      return { ...base, text: `Gewinne gegen 5 KI-Fahrer (${lvl}).` };
    case 'podium':
      return { ...base, diff: 2, text: `Fahre gegen 5 schwere KI-Fahrer aufs Podest.` };
    case 'medal':
      return { ...base, mode: 'timetrial', text: `Hol dir im Zeitfahren mindestens die Silber-Medaille.` };
    case 'tricks':
      return { ...base, n: nTricks, text: `Lande in einem Rennen ${nTricks} Tricks und komm ins Ziel (${lvl}).` };
    case 'ultra':
      return { ...base, n: 4, text: `Lade in einem Rennen 4 Ultra-Boosts und komm ins Ziel (${lvl}).` };
    case 'hacks':
      return { ...base, n: 3, text: `Triff Gegner in einem Rennen 3-mal mit Hacks (${lvl}).` };
    default:
      return { ...base, text: `Komm ohne einen einzigen Treffer ins Ziel (${lvl}).` };
  }
}

export function dailyDoneToday() {
  return progress.dailyDone === dayKey();
}

// Laufende Serie (verfällt, wenn gestern keine Challenge geschafft wurde)
export function currentStreak() {
  return progress.dailyDone === dayKey() || progress.dailyDone === yesterdayKey() ? progress.streak : 0;
}

// Ergebnis eines Challenge-Rennens prüfen; Rückgabe: null (nicht geschafft) oder { xp, streak }
export function checkDaily(ch, { row, lapBest }) {
  if (!row || !ch) return null;
  // Challenge von heute oder (über Mitternacht gefahren) von gestern – und für diesen Tag noch nicht geschafft
  if (ch.key !== dayKey() && ch.key !== yesterdayKey()) return null;
  if (progress.dailyDone && progress.dailyDone >= ch.key) return null;
  const st = row.stat || {};
  let ok;
  if (ch.kind === 'win') ok = row.finished && row.rank === 1;
  else if (ch.kind === 'podium') ok = row.finished && row.rank <= 3;
  else if (ch.kind === 'medal') {
    const m = medalFor(ch.trackId, lapBest);
    ok = m >= 0 && m <= 2;
  } else if (ch.kind === 'tricks') ok = row.finished && (st.tricks || 0) >= ch.n;
  else if (ch.kind === 'ultra') ok = row.finished && (st.ultra || 0) >= ch.n;
  else if (ch.kind === 'hacks') ok = (st.hackHits || 0) >= ch.n;
  else ok = row.finished && (st.hitsTaken || 0) === 0;
  if (!ok) return null;
  progress.streak = progress.dailyDone === prevDayKey(ch.key) ? progress.streak + 1 : 1;
  progress.streakBest = Math.max(progress.streakBest, progress.streak);
  progress.dailyDone = ch.key;
  progress.dailyCount++;
  save();
  return { xp: 200 + Math.min(progress.streak - 1, 6) * 25, streak: progress.streak };
}

export function paintUnlocked(id) {
  if (id === 'standard' || id === 'matte') return true;
  const P = PAINTS.find((x) => x.id === id);
  if (P && P.level) return levelInfo(progress.xp).level >= P.level;
  const a = ACHIEVEMENTS.find((x) => x.paint === id);
  return !!(a && progress.ach[a.id]);
}

export function paintUnlockHint(id) {
  const P = PAINTS.find((x) => x.id === id);
  if (P && P.level) return `Erreiche Fahrer-Level ${P.level} (jetzt: ${levelInfo(progress.xp).level}).`;
  const a = ACHIEVEMENTS.find((x) => x.paint === id);
  return a ? `Erfolg „${a.name}“: ${a.desc}` : '';
}

// Neu erreichte Erfolge eintragen; Rückgabe: Liste der neu freigeschalteten
export function checkAchievements() {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (progress.ach[a.id]) continue;
    const [cur, max] = a.goal(progress);
    if (cur >= max) {
      progress.ach[a.id] = Date.now();
      fresh.push(a);
    }
  }
  if (fresh.length) save();
  return fresh;
}

// Ergebnis eines Rennens für den eigenen Fahrer verbuchen
export function recordRace({ row, trackId, trackLength, mode, total, photoWin }) {
  if (!row) return [];
  const st = row.stat || {};
  progress.races++;
  progress.tracks[trackId] = (progress.tracks[trackId] || 0) + 1;
  progress.km += ((row.laps || 0) * trackLength) / 1000;
  progress.ultra += st.ultra || 0;
  progress.tricks += st.tricks || 0;
  progress.hacks += st.hacks || 0;
  progress.hackHits += st.hackHits || 0;
  progress.echoHits += st.echoHits || 0;
  progress.rams += st.rams || 0;
  progress.nearMiss += st.nearMiss || 0;
  progress.shockMax = Math.max(progress.shockMax, st.shockMax || 0);
  progress.crowd = (progress.crowd || 0) + (st.crowd || 0);
  if (mode !== 'timetrial' && total > 1 && row.finished) {
    if (row.rank === 1) {
      progress.wins++;
      const base = trackId.replace(/~m$/, '');
      if (!progress.trackWins) progress.trackWins = {};
      progress.trackWins[base] = (progress.trackWins[base] || 0) + 1;
    }
    if (row.car != null) {
      if (!progress.kartStats) progress.kartStats = {};
      const ks = (progress.kartStats[row.car] = progress.kartStats[row.car] || { r: 0, w: 0 });
      ks.r++;
      if (row.rank === 1) ks.w++;
    }
    if (row.rank <= 3) progress.podiums++;
    if (row.rank === 1 && photoWin) progress.photoWins++;
    if (row.rank === 1 && trackId.endsWith('~m')) progress.mirrorWins++;
  }
  if (row.finished && (st.hitsTaken || 0) === 0 && mode !== 'timetrial') progress.cleanFinish++;
  save();
  return checkAchievements();
}

// Grand-Prix-Ende verbuchen; key = "Schwierigkeit-Klasse", stars = 0–3 (siehe gpStars)
export function recordGP(place, stars = 0, key = null) {
  if (place === 1) progress.gpWins++;
  if (place <= 3) progress.gpPodiums++;
  if (key) {
    const cups = progress.gpCups || (progress.gpCups = {});
    const old = cups[key];
    if (!old || place < old.place || (place === old.place && stars > old.stars)) cups[key] = { place, stars: Math.max(stars, old && old.place === place ? old.stars : 0) };
  }
  save();
  return checkAchievements();
}

// Sterne für eine Meisterschaft: nur auf dem Podest; Sieger bekommt mehr Sterne bei vielen Punkten
export function gpStars(place, pts, maxPts) {
  if (place > 3) return 0;
  const r = pts / maxPts;
  if (place === 1) return 1 + (r >= 0.8 ? 1 : 0) + (r >= 0.92 ? 1 : 0);
  return r >= 0.76 ? 2 : 1;
}

export function gpCup(key) {
  return (progress.gpCups || {})[key] || null;
}
