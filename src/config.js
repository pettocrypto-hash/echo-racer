// Zentrale Spielkonstanten. Werte hier ändern, um das Balancing anzupassen.

export const VERSION = '1.0.0';
export const PROTOCOL = 5;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SNAP_EVERY = 3; // Host sendet Snapshots mit 20 Hz
export const ECHO_HZ = 20; // Abtastrate der Echo-Aufzeichnung
export const ECHO_EVERY = TICK_RATE / ECHO_HZ;
export const MAX_CARS = 6;
export const COUNTDOWN = 3;
export const ECHO_PHASE_DIST = 8; // Echos werden für ein Auto erst fest, wenn es einmal so weit weg war

// Sprungschanzen (fest auf der Strecke) und Turbostart
export const JUMP_LEN = 7; // Rampenlänge in m
export const JUMP_H = 1.25; // Höhe der Absprungkante
export const ROCKET_EARLY = -1.6; // ab hier zählt ein Drift-Druck im Countdown
export const ROCKET_OK = -0.6; // ab hier (bis kurz nach LOS) gibt es den Turbostart, davor = zu früh

// Online-Räume: PeerJS-ID = Präfix + 4-stelliger Code
export const ROOM_PREFIX = 'echoracer-v1-';
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// null = PeerJS-Standard (Google-STUN + öffentlicher PeerJS-TURN).
// Eigene Server so eintragen: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:…', username: '…', credential: '…' }]
export const ICE_SERVERS = null;

export const PLAYER_COLORS = ['#20e3ff', '#ff3ddc', '#ffd53d', '#6bff5c', '#ff7b2e', '#a585ff'];

// Sechs Fahrzeuge mit klar unterschiedlichen Werten.
// top: Höchstgeschwindigkeit (m/s), accel: Beschleunigung, turn: Lenkrate, grip: Seitenhaftung,
// drift: Drift-Stärke und Ladetempo, hack: Hack-Ladegeschwindigkeit, mass: Gewicht bei Zusammenstößen
export const CARS = [
  { id: 'komet', name: 'Komet', role: 'Allrounder', top: 50, accel: 21, turn: 2.0, grip: 9.5, drift: 1.0, hack: 1.0, mass: 1.0 },
  { id: 'viper', name: 'Viper', role: 'Topspeed', top: 54.5, accel: 18.5, turn: 1.85, grip: 8.6, drift: 0.88, hack: 0.85, mass: 1.0 },
  { id: 'glitch', name: 'Glitch', role: 'Hacker', top: 48.5, accel: 20.5, turn: 2.0, grip: 9.5, drift: 1.0, hack: 1.55, mass: 0.9 },
  { id: 'nova', name: 'Nova', role: 'Drift-Profi', top: 49, accel: 22, turn: 2.05, grip: 8.2, drift: 1.32, hack: 1.1, mass: 0.9 },
  { id: 'titan', name: 'Titan', role: 'Schwergewicht', top: 51, accel: 17, turn: 1.85, grip: 10.5, drift: 0.85, hack: 0.9, mass: 1.6 },
  { id: 'pixel', name: 'Pixel', role: 'Flitzer', top: 47, accel: 25.5, turn: 2.25, grip: 11, drift: 1.12, hack: 1.2, mass: 0.75 },
];

// Streckenhacks – die einzige "Waffe". Kosten in Ladungen der Hack-Leiste.
export const HACKS = [
  { id: 'barrier', name: 'Barriere', short: 'BARRIERE', cost: 1, warn: 0.85, dur: 3.2, icon: '▮', desc: 'Zieht vor dem Gegner kurz eine Holo-Wand hoch.' },
  { id: 'ramp', name: 'Rampe', short: 'RAMPE', cost: 1, warn: 0.85, dur: 4.0, icon: '◢', desc: 'Fährt vor dem Gegner eine Rampe hoch – ohne Trick harte Landung.' },
  { id: 'mirror', name: 'Boost spiegeln', short: 'SPIEGELN', cost: 1, warn: 0.6, dur: 7, icon: '⇄', desc: 'Spiegelt das nächste Boostfeld auf die andere Seite – für Gegner bremst es.' },
  { id: 'squeeze', name: 'Kurve verengen', short: 'KURVE', cost: 2, warn: 0.85, dur: 6, icon: '⟫', desc: 'Schiebt eine Holo-Wand in die Außenseite der nächsten Kurve.' },
  { id: 'shock', name: 'Schockwelle', short: 'SCHOCK', cost: 1, warn: 0.22, dur: 0.5, icon: '◎', self: true, desc: 'Druckwelle rund um dein Auto: schleudert alle Gegner in der Nähe weg und bremst sie aus.' },
  { id: 'ram', name: 'Rammstoß', short: 'RAMMEN', cost: 1, warn: 0, dur: 1.8, icon: '➤', self: true, desc: 'Schub nach vorn mit Holo-Schild: rammt Gegner von der Linie und bricht durch Echos, Klone und Barrieren.' },
  { id: 'clone', name: 'Echo-Klon', short: 'KLON', cost: 2, warn: 0.7, dur: 4.5, icon: '◈', desc: 'Setzt einen langsamen, schlingernden Holo-Klon direkt vor den Gegner – fest und schwer zu überholen.' },
];
export const HACK_MAX = 3;

export const AI_LEVELS = [
  { name: 'Leicht', speed: 0.84, margin: 0.78, look: 16, drift: 0, hackDelay: 7, noise: 0.1, rubber: 0.06, hackSmart: 0 },
  { name: 'Mittel', speed: 0.93, margin: 0.87, look: 28, drift: 0.5, hackDelay: 3.5, noise: 0.05, rubber: 0.03, hackSmart: 1 },
  { name: 'Schwer', speed: 1.0, margin: 0.95, look: 40, drift: 1, hackDelay: 1.3, noise: 0.02, rubber: 0.0, hackSmart: 2 },
];

export const AI_NAMES = ['Byte', 'Nyx', 'Volt', 'Rune', 'Kiko', 'Juno', 'Zed', 'Mira'];

// Acht eigene Fahrerfiguren (Aussehen in render/characters.js); KI-Fahrer tragen den Namen ihrer Figur
export const CHARACTERS = [
  { name: 'Byte', desc: 'Roboter mit LED-Augen' },
  { name: 'Nyx', desc: 'Katzenhelm' },
  { name: 'Volt', desc: 'Blitz-Helm' },
  { name: 'Rune', desc: 'Ritter mit Federbusch' },
  { name: 'Kiko', desc: 'Astronauten-Kind' },
  { name: 'Juno', desc: 'Fliegerin mit Brille' },
  { name: 'Zed', desc: 'Hai-Helm' },
  { name: 'Mira', desc: 'Popstar' },
];

export const DRIFT_LEVEL_TIMES = [0.75, 1.6, 2.6];
export const DRIFT_BOOST = [
  { t: 0, p: 0 },
  { t: 0.7, p: 0.8 },
  { t: 1.15, p: 1.0 },
  { t: 1.7, p: 1.25 },
];
export const DRIFT_COLORS = ['#ffffff', '#3cc8ff', '#ff9a2e', '#d36bff'];

// Boost-Flammen (Kosmetik): Farbe der Flammenkegel und der Funken beim Boost; level = ab diesem Fahrer-Level frei
export const FLAMES = [
  { id: 'standard', name: 'Feuer', color: '#ffb04a', spark: '#ff9a3a' },
  { id: 'blue', name: 'Blaues Feuer', color: '#4ab8ff', spark: '#5cd0ff', level: 3 },
  { id: 'green', name: 'Giftgrün', color: '#6dff4a', spark: '#9dff7a', level: 5 },
  { id: 'pink', name: 'Pink', color: '#ff4fd0', spark: '#ff7ae0', level: 8 },
  { id: 'gold', name: 'Gold', color: '#ffd23d', spark: '#ffe680', level: 12 },
  { id: 'rainbow', name: 'Regenbogen', color: '#ffffff', spark: '#ffffff', level: 18 },
];

// Tempo-Klassen: k skaliert Höchsttempo/Beschleunigung (siehe classStats in sim.js), xp = XP-Faktor, level = ab Fahrer-Level frei
export const CLASSES = [
  { id: 'kompakt', name: 'Kompakt', k: 0.88, xp: 0.9 },
  { id: 'sport', name: 'Sport', k: 1, xp: 1 },
  { id: 'turbo', name: 'Turbo', k: 1.12, xp: 1.15, level: 6 },
  { id: 'hyper', name: 'Hyper', k: 1.24, xp: 1.3, level: 12 },
];
