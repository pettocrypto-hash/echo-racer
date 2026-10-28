// Die fünf Strecken. Punkte: [x, z, Breite?] in Metern, in Fahrtrichtung. Der erste Punkt ist die Startlinie.
// pads: Boostfelder (u = Anteil der Runde, d = seitliche Lage -1…1)
// jumps: Sprungschanzen über die ganze Bahn (u = Lage der Absprungkante) – nur auf langen Geraden
// hills: Höhenprofil [u, Höhe in m] (Startbereich flach lassen), bridge: Brückenhöhe über der Kreuzung einer Acht

export const TRACK_DEFS = [
  {
    id: 'neon',
    name: 'Neon-Hafen',
    theme: 'neon',
    width: 15,
    feature: 'Lange Geraden – Windschatten und Echo-Ketten entscheiden.',
    music: 0,
    points: [
      [0, -40],
      [0, 60],
      [0, 150],
      [22, 205],
      [80, 228],
      [142, 205],
      [162, 148],
      [132, 100],
      [148, 50],
      [200, 28],
      [242, -18],
      [234, -88],
      [185, -128],
      [118, -118],
      [84, -158],
      [42, -198],
      [2, -172],
      [-8, -110],
    ],
    pads: [
      { u: 0.045, d: -0.5 },
      { u: 0.13, d: 0.55 },
      { u: 0.47, d: 0.0 },
      { u: 0.83, d: 0.45 },
    ],
    jumps: [{ u: 0.085 }],
    hills: [[0, 0], [0.15, 0], [0.3, 6], [0.42, 6], [0.55, 0], [0.68, -1.5], [0.8, 3], [0.9, 0]],
  },
  {
    id: 'canyon',
    name: 'Canyon-Klamm',
    theme: 'canyon',
    width: 13,
    feature: 'Zwei enge Schluchten – dort blockieren Echos gnadenlos.',
    music: 1,
    points: [
      [0, 0, 13],
      [0, 95, 13],
      [-18, 165, 11],
      [-72, 212, 8.5],
      [-142, 224, 8.5],
      [-208, 198, 8.5],
      [-250, 142, 11],
      [-256, 72, 13],
      [-226, 12, 13],
      [-242, -56, 13],
      [-216, -116, 12],
      [-160, -140, 8.5],
      [-100, -124, 8.5],
      [-48, -150, 8.5],
      [6, -186, 11],
      [66, -178, 13],
      [98, -128, 13],
      [74, -78, 13],
      [26, -66, 13],
      [2, -36, 13],
    ],
    pads: [
      { u: 0.03, d: 0.4 },
      { u: 0.36, d: -0.4 },
      { u: 0.8, d: 0.0 },
    ],
    jumps: [{ u: 0.074 }, { u: 0.202 }],
    hills: [[0, 0], [0.12, 0], [0.3, -2], [0.45, 4], [0.6, 8], [0.72, 2], [0.85, 0]],
  },
  {
    id: 'sky',
    name: 'Wolkenarena',
    theme: 'sky',
    width: 22,
    feature: 'Breite Arenen mit vielen Boostfeldern – hier dominieren Hacks.',
    music: 2,
    points: [
      [0, 0, 22],
      [0, 110, 22],
      [30, 190, 24],
      [100, 232, 30],
      [182, 216, 30],
      [236, 160, 30],
      [250, 80, 26],
      [214, 20, 22],
      [230, -52, 22],
      [290, -100, 24],
      [282, -182, 28],
      [200, -224, 30],
      [110, -204, 30],
      [58, -152, 26],
      [18, -90, 22],
    ],
    pads: [
      { u: 0.04, d: -0.55 },
      { u: 0.06, d: 0.55 },
      { u: 0.22, d: 0.0 },
      { u: 0.3, d: -0.6 },
      { u: 0.47, d: 0.5 },
      { u: 0.6, d: -0.5 },
      { u: 0.74, d: 0.6 },
      { u: 0.76, d: -0.6 },
      { u: 0.9, d: 0.0 },
    ],
    jumps: [{ u: 0.103 }, { u: 0.269 }],
    hills: [[0, 0], [0.12, 0], [0.25, 5], [0.38, 10], [0.5, 3], [0.62, 8], [0.75, 2], [0.88, 0]],
  },
  {
    id: 'lava',
    name: 'Lava-Kreuz',
    theme: 'lava',
    width: 14,
    scale: 0.92,
    feature: 'Eine Acht mit Kreuzung – dort schneiden Echos deine Linie.',
    music: 3,
    points: [
      [-185, -107],
      [-140, -110],
      [-95, -95],
      [-55, -58],
      [0, 0],
      [55, 58],
      [112, 112],
      [190, 136],
      [262, 108],
      [298, 40],
      [282, -32],
      [246, -58],
      [252, -104],
      [200, -132],
      [150, -112],
      [100, -95],
      [55, -58],
      [0, 0],
      [-55, 58],
      [-112, 112],
      [-196, 132],
      [-268, 96],
      [-300, 26],
      [-282, -50],
      [-232, -98],
    ],
    pads: [
      { u: 0.02, d: 0.0 },
      { u: 0.29, d: -0.4 },
      { u: 0.52, d: 0.45 },
      { u: 0.77, d: -0.4 },
    ],
    jumps: [{ u: 0.185 }, { u: 0.686 }],
    bridge: 7.5,
  },
];

// Fünfte Strecke wird unten angehängt (Garten)
TRACK_DEFS.push({
  id: 'garden',
  name: 'Gartenring',
  theme: 'garden',
  width: 15,
  feature: 'Spielzeugbahn durch einen Riesengarten – Schanzen, Teich und Blumen.',
  music: 2,
  points: [
    [0, -30],
    [0, 70],
    [10, 140],
    [50, 190],
    [115, 200],
    [165, 170],
    [175, 110],
    [140, 70],
    [150, 20],
    [195, -10],
    [232, -70],
    [212, -140],
    [150, -172],
    [80, -152],
    [40, -108],
    [6, -92],
  ],
  pads: [
    { u: 0.21, d: 0.5 },
    { u: 0.46, d: -0.4 },
    { u: 0.72, d: 0.35 },
  ],
  jumps: [{ u: 0.092 }],
  hills: [[0, 0], [0.14, 0], [0.3, 4], [0.4, 0], [0.55, 5], [0.68, -1.5], [0.8, 1], [0.9, 0]],
});

// Spiegelstrecken: Id mit Endung '~m' – alle Kurven seitenverkehrt, eigener Rekord.
const mirrored = new Map();
export function mirrorId(id, on) {
  return on ? id.replace(/~m$/, '') + '~m' : id;
}
export function trackDefById(id) {
  const m = typeof id === 'string' && id.endsWith('~m');
  const base = TRACK_DEFS.find((t) => t.id === (m ? id.slice(0, -2) : id)) || TRACK_DEFS[0];
  if (!m) return base;
  if (!mirrored.has(base.id)) {
    mirrored.set(base.id, { ...base, id: base.id + '~m', name: base.name + ' ⇄', mirror: true, points: base.points.map((p) => [-p[0], ...p.slice(1)]) });
  }
  return mirrored.get(base.id);
}

// Medaillenzeiten fürs Zeitfahren (beste Runde in s), gemessen mit scripts/medal-times.mjs:
// Gold = schwere KI im Allrounder, Echo-Medaille = schnellstes KI-Auto minus 1,5 %. Gespiegelt gelten dieselben Zeiten.
const MEDAL_BASE = { neon: [22.4, 20.8], canyon: [23.9, 21.6], sky: [22.7, 20.9], lava: [31.0, 28.6], garden: [20.2, 18.4] };
export const MEDALS = [
  { id: 'echo', name: 'Echo', icon: '◆', color: '#7df4ff' },
  { id: 'gold', name: 'Gold', icon: '●', color: '#ffc93d' },
  { id: 'silver', name: 'Silber', icon: '●', color: '#d8dde8' },
  { id: 'bronze', name: 'Bronze', icon: '●', color: '#d48a4a' },
];
export function medalTimes(id) {
  const [gold, ace] = MEDAL_BASE[String(id).replace(/~m$/, '')] || [25, 23];
  return { echo: ace, gold, silver: Math.round(gold * 10.7) / 10, bronze: Math.round(gold * 11.6) / 10 };
}
// Index in MEDALS (0 = Echo … 3 = Bronze) oder -1
export function medalFor(id, lapTime) {
  if (!(lapTime > 0)) return -1;
  const t = medalTimes(id);
  return MEDALS.findIndex((m) => lapTime <= t[m.id] + 1e-6);
}
