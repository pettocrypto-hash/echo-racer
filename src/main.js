// ECHO RACER – Einstiegspunkt: App-Zustand, Menüfluss, Online-Lobby, Hauptschleife.

import './styles.css';
import { Renderer } from './render/renderer.js';
import { Showroom } from './render/showroom.js';
import { Input } from './input/input.js';
import { AudioEngine } from './audio/audio.js';
import { HUD } from './ui/hud.js';
import { UI } from './ui/ui.js';
import { RaceSession } from './session.js';
import { NetHost, NetClient, normalizeCode } from './net/net.js';
import { TRACK_DEFS, trackDefById, mirrorId, medalFor, medalTimes } from './game/trackDefs.js';
import { CARS, HACKS, PLAYER_COLORS, MAX_CARS, PROTOCOL, COUNTDOWN, CHARACTERS, FLAMES, CLASSES } from './config.js';
import { settings, saveSettings, enterFullscreen, wakeLock, isTouch, shareLink } from './platform.js';
import { clamp } from './util.js';
import { driverPortraits } from './render/portraits.js';
import { PAINTS, recordRace, recordGP, paintUnlocked, raceXP, addXP, checkDaily, dailyChallenge, checkAchievements, recordStyle, medalAwarded, awardMedal, flameUnlocked, updateMissions, classUnlocked, gpStars } from './progress.js';

function fatal(msg) {
  const d = document.createElement('div');
  d.className = 'fatal';
  d.innerHTML = `<h2>ECHO RACER</h2><p>${msg}</p>`;
  document.body.appendChild(d);
}

const AI_CARS = [1, 3, 4, 5, 2, 0];
const AI_PAINTS = ['stripes', 'matte', 'standard', 'candy', 'standard', 'sunset'];
const GP_POINTS = [10, 8, 6, 5, 4, 3];
// eigene Lackierung (nur freigeschaltete) bzw. eine gültige aus dem Netz
const myPaint = () => (paintUnlocked(settings.paint) ? settings.paint : 'standard');
const myFlame = () => (flameUnlocked(settings.flame) ? settings.flame : 'standard');
const myClass = () => (classUnlocked(settings.speedClass) ? settings.speedClass : 1);
const netFlame = (f) => (FLAMES.some((x) => x.id === f) ? f : 'standard');
const AI_FLAMES = ['standard', 'blue', 'standard', 'green', 'standard', 'pink'];
const netPaint = (p) => (PAINTS.some((x) => x.id === p) ? p : 'standard');
const netDriver = (d) => clamp(d | 0, 0, CHARACTERS.length - 1);
// Namenskarte fürs Strecken-Intro: Welt-Medaille (Symbol + Farbe), Weltname, Streckenname, Modus-Abzeichen
const WORLDS = {
  neon: { world: 'NEON-WELT', icon: '⚡', color: '#2ce7ff' },
  canyon: { world: 'WÜSTEN-WELT', icon: '🌵', color: '#ffb340' },
  sky: { world: 'HIMMELS-WELT', icon: '☁️', color: '#ff5fb0' },
  lava: { world: 'VULKAN-WELT', icon: '🌋', color: '#ff6a1a' },
  garden: { world: 'GARTEN-WELT', icon: '🌻', color: '#6bd84a' },
};
function introInfo(opts, gp) {
  const def = trackDefById(opts.trackId);
  const W = WORLDS[def.theme] || WORLDS.neon;
  let badge = 'SOLO';
  if (opts.daily) badge = 'TAGES-CHALLENGE';
  else if (opts.mode === 'timetrial') badge = 'ZEITFAHREN';
  else if (gp) badge = `GRAND PRIX · ${gp.idx + 1}/${TRACK_DEFS.length}`;
  else {
    const ai = opts.entrants.find((e) => e.kind === 'ai');
    if (ai) badge = 'SOLO · ' + ['LEICHT', 'MITTEL', 'SCHWER'][ai.ai ?? 1];
  }
  if (opts.cls != null && opts.cls !== 1 && opts.mode !== 'timetrial') badge += ' · ' + CLASSES[opts.cls].name.toUpperCase();
  return { ...W, name: def.name, badge };
}
// Figuren für die KI: alle, die kein Mensch fährt, in fester Reihenfolge
const aiDrivers = (taken) => CHARACTERS.map((_, i) => i).filter((i) => !taken.includes(i));

class App {
  constructor() {
    this.canvas = document.getElementById('gl');
    try {
      this.renderer = new Renderer(this.canvas);
    } catch (e) {
      fatal('Dieses Gerät/dieser Browser unterstützt kein WebGL2. Bitte einen aktuellen Browser verwenden.');
      throw e;
    }
    this.renderer.dprCap = settings.dprCap;
    this.applyQualitySettings(true);
    // Porträts der Fahrerfiguren einmal rendern (Minikarte, Ergebnis, Fahrerauswahl)
    try {
      this.portraits = driverPortraits(this.renderer.gl);
    } catch (e) {
      console.warn('Porträts nicht verfügbar', e);
      this.portraits = null;
    }
    this.input = new Input();
    this.audio = new AudioEngine();
    this.hud = new HUD(this);
    this.ui = new UI(this);
    this.session = null;
    this.demo = null;
    this.demoIdx = Math.floor(Math.random() * TRACK_DEFS.length);
    this.showroom = null;
    this.online = null;
    this.lastRace = null;
    this.paused = false;
    this.fpsEl = document.getElementById('fps');
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.applySettings('showFps');

    const unlock = () => {
      this.audio.init();
      if (!this.session) this.audio.startMusic(4);
      // iOS: Neigungssensor braucht eine Freigabe aus einer Nutzer-Geste
      if (settings.control === 'tilt' && !this.input.tilt.listening) this.input.enableTilt();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    // Fokus von Buttons lösen, damit Leertaste/Enter (Drift/Hack) sie nicht erneut auslösen
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (b) b.blur();
    });
    window.addEventListener('resize', () => this.renderer.resize());
    if (screen.orientation && screen.orientation.addEventListener) {
      screen.orientation.addEventListener('change', () => setTimeout(() => this.renderer.resize(), 200));
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.session && this.session.role === 'solo' && !this.paused && this.ui.current !== 'results') this.togglePause(true);
        this.audio.suspend();
      } else {
        this.audio.resume();
      }
    });
    if (settings.control === 'tilt') this.input.enableTilt();

    this.startDemo();
    const params = new URLSearchParams(location.search);
    const room = params.get('room');
    if (room) {
      history.replaceState(null, '', location.pathname);
      this.ui.show('online', { code: normalizeCode(room), status: 'Raumcode aus dem Link übernommen – Name eingeben und BEITRETEN tippen.' });
    } else {
      this.ui.show('title');
    }

    this.lastT = performance.now();
    this.rafSamples = [];
    this.skip = 1;
    this.frameNo = 0;
    this._frame = (t) => this.frame(t);
    requestAnimationFrame(this._frame);
  }

  // ---------------- Hauptschleife ----------------
  frame(now) {
    requestAnimationFrame(this._frame);
    // Bildschirme mit 120 Hz+: nur jedes zweite Bild rendern (stabile 60 FPS, schont Akku)
    if (this.rafSamples.length < 40) {
      if (this.lastRaf) this.rafSamples.push(now - this.lastRaf);
      this.lastRaf = now;
      if (this.rafSamples.length === 40) {
        const s = this.rafSamples.slice().sort((a, b) => a - b);
        if (s[20] < 10) this.skip = 2;
      }
    }
    this.frameNo++;
    if (this.skip > 1 && this.frameNo % this.skip !== 0) return;
    const ms = now - this.lastT;
    this.lastT = now;
    const dt = clamp(ms / 1000, 0.0005, 0.1);
    if (this.session) this.session.frame(dt, now);
    else if (this.ui.current === 'garage' && this.showroom) this.showroom.frame(dt);
    else if (this.demo) this._demoFrame(dt, now);
    this.renderer.measure(ms);
    if (settings.showFps) {
      this.fpsAcc += ms;
      this.fpsN++;
      if (this.fpsAcc > 500) {
        const r = this.renderer;
        this.fpsEl.textContent = `${Math.round((1000 * this.fpsN) / this.fpsAcc)} FPS · ${r.width}×${r.height} · ${r.qualityName} · ${(r.adaptive.scale * 100).toFixed(0)}%`;
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
    }
  }

  // ---------------- Menü-Hintergrund ----------------
  startDemo() {
    if (this.demo) return;
    const def = TRACK_DEFS[this.demoIdx % TRACK_DEFS.length];
    const entrants = [0, 1, 2, 3, 4, 5].map((k) => ({ id: 'D' + k, name: CHARACTERS[(k + this.demoIdx) % 8].name, driver: (k + this.demoIdx) % 8, car: k, color: PLAYER_COLORS[k], kind: 'ai', ai: 2 - (k % 2), slot: k }));
    const demo = new RaceSession(this, { role: 'demo', trackId: def.id, laps: 99, entrants });
    // vorlaufen lassen, damit das Feld schon verteilt ist
    for (let i = 0; i < 60 * 9; i++) demo.sim.step();
    demo.sim.events = [];
    demo.goAt = performance.now() - demo.sim.time * 1000;
    this.demo = demo;
    this.demoAge = 0;
  }

  stopDemo() {
    if (!this.demo) return;
    this.demo.dispose();
    this.demo = null;
  }

  _demoFrame(dt, now) {
    this.demoAge += dt;
    if (this.demoAge > 75) {
      this.stopDemo();
      this.demoIdx++;
      this.startDemo();
    }
    this.demo.frame(dt, now);
  }

  onScreen(name) {
    if (name === 'garage') {
      if (!this.showroom) this.showroom = new Showroom(this.renderer);
    }
    if (!this.session && name && name !== 'garage') this.audio.startMusic(4);
  }

  showroomCar(i, paint, driver) {
    if (!this.showroom) this.showroom = new Showroom(this.renderer);
    let color = PLAYER_COLORS[0];
    if (this.online && this.online.myId) {
      const me = this.online.players.find((p) => p.id === this.online.myId);
      if (me) color = me.color;
    }
    this.showroom.setCar(i, color, paint || myPaint(), driver ?? settings.driver);
  }

  // ---------------- Einstellungen ----------------
  applyQualitySettings(initial = false) {
    const r = this.renderer;
    if (settings.quality === 'auto') {
      r.autoQuality = true;
      // Handys starten auf "Mittel" (Akku/Wärme); PCs auf "Hoch" und dürfen bis "Ultra" (Supersampling) hochregeln
      r.maxTier = isTouch ? 'mid' : 'ultra';
      if (initial) {
        r.setQuality(isTouch ? 'mid' : 'high');
        if (!isTouch) {
          r.adaptive.scale = Math.min(1.25, r.adaptive.max);
          r.resize();
        }
      }
    } else {
      r.autoQuality = false;
      r.setQuality(settings.quality);
    }
  }

  applySettings(key) {
    if (key === 'quality') this.applyQualitySettings();
    else if (key === 'dprCap') {
      this.renderer.dprCap = settings.dprCap;
      this.renderer.resize();
    } else if (key === 'music' || key === 'sfx') this.audio.applyVolumes();
    else if (key === 'control') {
      this.hud.refreshControls();
      if (settings.control === 'tilt') this.input.enableTilt();
    } else if (key === 'showFps') this.fpsEl.classList.toggle('hidden', !settings.showFps);
  }

  cycleHack() {
    settings.hackType = (settings.hackType + 1) % HACKS.length;
    saveSettings();
    this.audio.play('ui');
  }

  selectHack(i) {
    if (i < 0 || i >= HACKS.length || i === settings.hackType) return;
    settings.hackType = i;
    saveSettings();
    this.audio.play('ui');
  }

  onCarChanged() {
    const L = this.online;
    if (!L) return;
    if (L.role === 'client') L.net.send({ t: 'cfg', car: settings.car, name: settings.name, paint: myPaint(), flame: myFlame(), driver: settings.driver });
    else {
      const me = L.players.find((p) => p.id === L.myId);
      if (me) {
        me.car = settings.car;
        me.driver = settings.driver;
        me.paint = myPaint();
        me.flame = myFlame();
      }
      this._broadcastLobby();
    }
  }

  // ---------------- Rennen ----------------
  startSolo({ trackId, laps, opponents, difficulty, car = settings.car, daily = null }) {
    const entrants = [];
    const cars = AI_CARS.filter((c) => c !== car).concat([car]);
    for (let k = 0; k < opponents; k++) {
      const dr = aiDrivers([settings.driver])[k];
      entrants.push({ id: 'A' + k, name: CHARACTERS[dr].name, driver: dr, car: cars[k % cars.length], color: PLAYER_COLORS[k + 1], kind: 'ai', ai: difficulty, slot: k, paint: AI_PAINTS[k], flame: AI_FLAMES[k], rival: k === 0 && opponents >= 2 });
    }
    entrants.push({ id: 'ME', name: settings.name || 'Du', driver: settings.driver, car, color: PLAYER_COLORS[0], kind: 'human', slot: opponents, paint: myPaint(), flame: myFlame() });
    this.gp = null;
    const cls = daily ? 1 : myClass();
    this._beginRace({ role: 'solo', mode: 'race', trackId, laps, entrants, localId: 'ME', daily, cls, speed: CLASSES[cls].k });
  }

  // ---------------- Grand Prix: 4 Rennen, Punkte, Gesamtwertung ----------------
  startGP({ difficulty }) {
    const cars = AI_CARS.filter((c) => c !== settings.car).concat([settings.car]);
    const roster = [];
    const free = aiDrivers([settings.driver]);
    for (let k = 0; k < 5; k++) roster.push({ id: 'A' + k, name: CHARACTERS[free[k]].name, driver: free[k], car: cars[k % cars.length], color: PLAYER_COLORS[k + 1], kind: 'ai', ai: difficulty, paint: AI_PAINTS[k], flame: AI_FLAMES[k], rival: k === 0 });
    roster.push({ id: 'ME', name: settings.name || 'Du', driver: settings.driver, car: settings.car, color: PLAYER_COLORS[0], kind: 'human', paint: myPaint(), flame: myFlame() });
    const cls = myClass();
    this.gp = { difficulty, laps: 3, idx: 0, roster, points: Object.fromEntries(roster.map((e) => [e.id, 0])), counted: -1, cls };
    this._gpRace();
  }

  _gpRace() {
    const gp = this.gp;
    const def = TRACK_DEFS[gp.idx];
    // Startaufstellung: umgekehrte Gesamtwertung (der Führende startet hinten), im ersten Rennen du ganz hinten
    const order = gp.roster.slice().sort((a, b) => gp.points[b.id] - gp.points[a.id] || (a.id === 'ME') - (b.id === 'ME'));
    const entrants = order.reverse().map((e, slot) => ({ ...e, slot }));
    if (gp.idx === 0) {
      entrants.sort((a, b) => (a.id === 'ME') - (b.id === 'ME'));
      entrants.forEach((e, i) => (e.slot = i));
    }
    this._beginRace({ role: 'solo', mode: 'race', trackId: def.id, laps: gp.laps, entrants, localId: 'ME', cls: gp.cls, speed: CLASSES[gp.cls].k });
    this.hud.toast(`GRAND PRIX · RENNEN ${gp.idx + 1}/${TRACK_DEFS.length} · ${def.name.toUpperCase()}`, 'info');
  }

  nextGP() {
    if (!this.gp) return;
    if (this.gp.idx >= TRACK_DEFS.length - 1) {
      this.gp = null;
      this.quitRace();
      return;
    }
    this.gp.idx++;
    this._gpRace();
  }

  // Punkte des gerade beendeten GP-Rennens verbuchen → Daten für die Ergebnisanzeige
  _gpScore(res) {
    const gp = this.gp;
    const gained = {};
    if (gp.counted !== gp.idx) {
      gp.counted = gp.idx;
      for (const r of res) {
        gained[r.id] = GP_POINTS[r.rank - 1] || 0;
        gp.points[r.id] = (gp.points[r.id] || 0) + gained[r.id];
      }
      gp.lastGained = gained;
    }
    const standings = gp.roster.map((e) => ({ id: e.id, name: e.name, color: e.color, car: e.car, pts: gp.points[e.id], got: gp.lastGained[e.id] || 0 }));
    standings.sort((a, b) => b.pts - a.pts || b.got - a.got);
    const final = gp.idx === TRACK_DEFS.length - 1;
    const place = standings.findIndex((s) => s.id === 'ME') + 1;
    return { idx: gp.idx, total: TRACK_DEFS.length, standings, final, place, next: final ? null : TRACK_DEFS[gp.idx + 1].name };
  }

  startTimeTrial({ trackId, laps, car = settings.car, daily = null }) {
    const entrants = [{ id: 'ME', name: settings.name || 'Du', driver: settings.driver, car, color: PLAYER_COLORS[0], kind: 'human', slot: 0, paint: myPaint() }];
    this.gp = null;
    this._beginRace({ role: 'solo', mode: 'timetrial', trackId, laps, entrants, localId: 'ME', daily });
  }

  // Tages-Challenge: feste Strecke, festes Auto, festes Ziel
  startDaily() {
    const ch = dailyChallenge();
    if (ch.mode === 'timetrial') this.startTimeTrial({ trackId: ch.trackId, laps: ch.laps, car: ch.car, daily: ch });
    else this.startSolo({ trackId: ch.trackId, laps: ch.laps, opponents: ch.opponents, difficulty: ch.diff, car: ch.car, daily: ch });
  }

  _beginRace(opts) {
    this.lastRace = opts;
    this._endSession();
    this.stopDemo();
    this.paused = false;
    this.ui.hideAll();
    this.session = new RaceSession(this, opts);
    this.renderer.adaptive.warmup(2);
    this.input.consumeEdges(); // in Menüs gedrückte Tasten verwerfen
    this.hud.show(opts.mode);
    if (this.session.introDur) this.hud.introCard(introInfo(opts, this.gp));
    this.ui.setPauseMode(opts.role !== 'solo', !!this.gp);
    this.audio.init();
    this.audio.startMusic(trackDefById(opts.trackId).music);
    wakeLock.acquire();
    if (isTouch) enterFullscreen();
  }

  _endSession() {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
    this.hud.hide();
    this.paused = false;
  }

  // Fortschritt eines beendeten Rennens verbuchen – direkt bei Rennende (nicht erst mit dem Ergebnis-Bildschirm),
  // damit ein schneller Neustart oder Abbruch in den 1,4 s davor nichts verliert. Nur einmal pro Rennen.
  recordResults(session, res) {
    if (session.recorded || !session.localId || session.role === 'demo') return;
    session.recorded = true;
    let fresh = [];
    let xp = null;
    let medal = null;
    let daily = null;
    const row = res.find((r) => r.id === session.localId);
    fresh = recordRace({ row, trackId: session.trackId, trackLength: session.track.length, mode: session.mode, total: res.length, photoWin: !!session.photoWin });
    // Zeitfahren: Medaille der Strecken-Bestzeit gegen die schon belohnte Medaille, dazu die Medaille dieser Fahrt
    if (session.mode === 'timetrial') {
      const prev = medalAwarded(session.trackId);
      const now = medalFor(session.trackId, session.record?.time);
      medal = { idx: now, prev, best: session.record?.time, run: medalFor(session.trackId, row?.best), lap: row?.best, times: medalTimes(session.trackId) };
      awardMedal(session.trackId, now);
    }
    const style = session.style ? session.style.total : 0;
    const items = raceXP({ row, mode: session.mode, total: res.length, newRecord: !!session.newRecord, medal: medal ? medal.idx : -1, prevMedal: medal ? medal.prev : -1, style });
    recordStyle(style);
    const rival = res.find((r) => session.sim.byId.get(r.id)?.rival);
    const rivalBeaten = rival && row && row.finished && session.mode === 'race' && (!rival.finished || row.rank < rival.rank);
    if (rivalBeaten) items.push([`Rivale ${rival.name} geschlagen`, 50]);
    if (session.daily) {
      daily = { ch: session.daily, done: checkDaily(session.daily, { row, lapBest: row?.best }) };
      if (daily.done) items.push([`Tages-Challenge · Serie ${daily.done.streak}`, daily.done.xp]);
    }
    const mis = updateMissions({ row, mode: session.mode, total: res.length, trackId: session.trackId, trackLength: session.track.length, style, rivalBeaten: !!rivalBeaten, runMedal: medal ? medal.run : -1 });
    items.push(...mis.xp);
    const C = CLASSES[session.cls ?? 1];
    if (C && C.xp !== 1 && session.mode === 'race') {
      const base = items.reduce((a, [, v]) => a + v, 0);
      items.push([`Klasse ${C.name} ×${String(C.xp).replace('.', ',')}`, Math.round(base * (C.xp - 1))]);
    }
    const total = items.reduce((a, [, v]) => a + v, 0);
    xp = { items, total, ...addXP(total) };
    fresh = fresh.concat(checkAchievements());
    session.resultData = { fresh, xp, medal, daily, missions: mis.moved };
  }

  showResults(session, res) {
    if (session !== this.session) return;
    this.paused = false;
    this.recordResults(session, res);
    const R = session.resultData || { fresh: [], xp: null, medal: null, daily: null };
    let fresh = R.fresh;
    const { xp, medal, daily, missions } = R;
    let gp = null;
    if (this.gp && session.role === 'solo' && session.mode === 'race') {
      gp = this._gpScore(res);
      if (gp.final && !this.gp.done) {
        this.gp.done = true;
        const me = gp.standings.find((r) => r.id === 'ME');
        gp.stars = gpStars(gp.place, me ? me.pts : 0, GP_POINTS[0] * TRACK_DEFS.length);
        fresh = fresh.concat(recordGP(gp.place, gp.stars, `${this.gp.difficulty}-${this.gp.cls ?? 1}`));
        this.gp.stars = gp.stars;
      } else if (gp.final) gp.stars = this.gp.stars || 0;
    }
    this.ui.showResults(res, {
      timetrial: session.mode === 'timetrial',
      localId: session.localId,
      canRestart: session.role === 'solo' && !gp,
      online: session.role === 'host' || session.role === 'client',
      fresh,
      gp,
      xp,
      medal,
      daily,
      missions,
    });
  }

  togglePause(force) {
    if (!this.session || this.ui.current === 'results' || this.ui.current === 'message') return;
    const want = force ?? !this.paused;
    if (want === this.paused) return;
    this.paused = want;
    if (want) {
      this.session.pause();
      this.audio.stopEngine();
      this.ui.settingsBack = 'pause';
      this.ui.show('pause');
    } else {
      this.session.resume();
      this.ui.hideAll();
      this.hud.refreshControls();
    }
  }

  restartRace() {
    const L = this.lastRace;
    if (!L || L.role !== 'solo') return;
    // Tages-Challenge von gestern (Rennen lief über Mitternacht)? → die heutige starten
    if (L.daily && L.daily.key !== dailyChallenge().key) {
      this.startDaily();
      return;
    }
    this._beginRace({ ...L, noIntro: true });
  }

  quitRace() {
    this.gp = null;
    if (this.online) this.leaveOnline();
    this._endSession();
    wakeLock.release();
    this.startDemo();
    this.ui.show('title');
  }

  backToLobby() {
    const L = this.online;
    if (!L) return this.quitRace();
    this._endSession();
    this.startDemo();
    if (L.role === 'host') {
      L.racing = false;
      L.net.broadcast({ t: 'toLobby' });
      this._broadcastLobby();
    }
    this.ui.show('lobby');
    this.ui.renderLobby(L);
  }

  // ---------------- Online: Host ----------------
  async hostRoom() {
    this.ui.setOnlineStatus('Raum wird erstellt …', true);
    const net = new NetHost();
    let code;
    try {
      code = await net.open();
    } catch (e) {
      this.ui.setOnlineStatus(e.message || 'Raum konnte nicht erstellt werden.');
      return;
    }
    this.online = {
      role: 'host',
      net,
      code,
      myId: 'H',
      hostId: 'H',
      link: `${location.origin}${location.pathname}?room=${code}`,
      players: [{ id: 'H', name: settings.name || 'Host', car: settings.car, color: PLAYER_COLORS[0], ready: true, paint: myPaint(), flame: myFlame(), driver: settings.driver }],
      settings: { track: 'vote', laps: settings.laps, ai: 0, diff: settings.difficulty, mirror: settings.mirror ? 1 : 0 },
      peers: new Map(),
      racing: false,
      loaded: new Set(),
      nextId: 0,
    };
    net.on.msg = (pid, m) => this._hostMsg(pid, m);
    net.on.leave = (pid) => this._hostLeave(pid);
    net.on.error = (txt) => console.warn('[Netz]', txt);
    this.ui.setOnlineStatus('');
    this.ui.show('lobby');
    this.ui.renderLobby(this.online);
  }

  _broadcastLobby() {
    const L = this.online;
    if (!L || L.role !== 'host') return;
    L.net.broadcast({ t: 'lobby', players: L.players, settings: L.settings, racing: L.racing });
    if (this.ui.current === 'lobby') this.ui.renderLobby(L);
  }

  _hostMsg(pid, m) {
    const L = this.online;
    if (!L) return;
    const net = L.net;
    const pidPlayer = () => L.players.find((p) => p.id === L.peers.get(pid));
    switch (m.t) {
      case 'hello': {
        if (m.v !== PROTOCOL) {
          net.send(pid, { t: 'kick', reason: 'Unterschiedliche Spielversion – bitte beide die Seite neu laden.' });
          setTimeout(() => net.drop(pid), 400);
          return;
        }
        if (L.players.length >= MAX_CARS) {
          net.send(pid, { t: 'kick', reason: 'Der Raum ist voll (6 Fahrer).' });
          setTimeout(() => net.drop(pid), 400);
          return;
        }
        const id = 'P' + ++L.nextId;
        const used = new Set(L.players.map((p) => p.color));
        const color = PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[L.players.length % PLAYER_COLORS.length];
        const name = String(m.name || '').trim().slice(0, 12) || 'Fahrer ' + L.nextId;
        L.players.push({ id, name, car: clamp(m.car | 0, 0, CARS.length - 1), color, ready: false, paint: netPaint(m.paint), flame: netFlame(m.flame), driver: netDriver(m.driver) });
        L.peers.set(pid, id);
        net.send(pid, { t: 'welcome', id, code: L.code, hostId: L.hostId });
        this._broadcastLobby();
        if (this.session) this.hud.toast(`${name} ist im Raum`, 'info');
        break;
      }
      case 'cfg': {
        const p = pidPlayer();
        if (!p) return;
        if (m.name != null) p.name = String(m.name).trim().slice(0, 12) || p.name;
        if (m.car != null) p.car = clamp(m.car | 0, 0, CARS.length - 1);
        if (m.driver != null) p.driver = netDriver(m.driver);
        if (m.paint != null) p.paint = netPaint(m.paint);
        if (m.flame != null) p.flame = netFlame(m.flame);
        if (m.ready != null) p.ready = !!m.ready;
        if (m.vote !== undefined) p.vote = TRACK_DEFS.some((d) => d.id === m.vote) ? m.vote : null;
        this._broadcastLobby();
        break;
      }
      case 'loaded': {
        const id = L.peers.get(pid);
        if (id) L.loaded.add(id);
        this._maybeGo();
        break;
      }
      case 'bye':
        net.drop(pid);
        break;
      default:
        if (this.session && this.session.role === 'host') this.session.onRemoteMsg(pid, m);
    }
  }

  _hostLeave(pid) {
    const L = this.online;
    if (!L) return;
    const id = L.peers.get(pid);
    L.peers.delete(pid);
    const p = L.players.find((x) => x.id === id);
    L.players = L.players.filter((x) => x.id !== id);
    if (this.session && this.session.role === 'host') this.session.removeRemote(pid);
    else if (p) this.hud.toast(`${p.name} hat den Raum verlassen`, 'info');
    this._broadcastLobby();
    this._maybeGo();
  }

  lobbySetting(key, v) {
    const L = this.online;
    if (!L || L.role !== 'host' || L.racing) return;
    if (key === 'lobbyTrack') L.settings.track = v;
    else if (key === 'lobbyLaps') L.settings.laps = +v;
    else if (key === 'lobbyAi') L.settings.ai = +v;
    else if (key === 'lobbyDiff') L.settings.diff = +v;
    else if (key === 'lobbyMirror') L.settings.mirror = +v ? 1 : 0;
    this._broadcastLobby();
  }

  // Stimme für die nächste Strecke (Host direkt, Client über den Host; lokal sofort anzeigen)
  lobbyVote(trackId) {
    const L = this.online;
    if (!L || L.racing || L.rolling) return;
    const me = L.players.find((p) => p.id === L.myId);
    if (!me) return;
    me.vote = me.vote === trackId ? null : trackId;
    if (L.role === 'host') this._broadcastLobby();
    else {
      L.net.send({ t: 'cfg', vote: me.vote });
      this.ui.renderLobby(L);
    }
  }

  lobbyPrimary() {
    const L = this.online;
    if (!L) return;
    if (L.role === 'host') this._hostStart();
    else {
      const me = L.players.find((p) => p.id === L.myId);
      L.net.send({ t: 'cfg', ready: !(me && me.ready), car: settings.car, name: settings.name, paint: myPaint(), flame: myFlame(), driver: settings.driver });
      // Rennstart kommt später per Netz (keine Nutzer-Geste) – Vollbild daher jetzt anfordern
      if (isTouch) enterFullscreen();
    }
  }

  // Start durch den Host: bei Abstimmung erst das Strecken-Roulette (jede Stimme ein Los, ohne Stimmen alle Strecken)
  _hostStart() {
    const L = this.online;
    if (L.racing || L.rolling) return;
    if (L.settings.track !== 'vote') return this._hostLaunch(L.settings.track);
    let tickets = L.players.filter((p) => p.vote).map((p) => ({ track: p.vote, color: p.color }));
    if (!tickets.length) tickets = TRACK_DEFS.map((d) => ({ track: d.id, color: '#ffffff' }));
    const win = Math.floor(Math.random() * tickets.length);
    const dur = tickets.length > 1 ? 3.2 : 1.6;
    L.rolling = true;
    L.net.broadcast({ t: 'roulette', tickets, win, dur });
    this.ui.roulette(tickets, win, dur);
    this._broadcastLobby();
    setTimeout(() => {
      L.rolling = false;
      if (this.online === L && !L.racing) this._hostLaunch(tickets[win].track);
    }, dur * 1000 + 900);
  }

  _hostLaunch(trackId) {
    const L = this.online;
    if (L.racing) return;
    const st = L.settings;
    for (const p of L.players) p.vote = null;
    const humans = L.players;
    const aiCount = Math.min(st.ai, MAX_CARS - humans.length);
    const used = new Set(humans.map((p) => p.color));
    const free = PLAYER_COLORS.filter((c) => !used.has(c));
    const entrants = [];
    let slot = 0;
    const aiDr = aiDrivers(humans.map((p) => p.driver ?? 4));
    for (let k = 0; k < aiCount; k++) {
      const dr = aiDr[k % aiDr.length];
      entrants.push({ id: 'A' + k, name: CHARACTERS[dr].name, driver: dr, car: AI_CARS[k % AI_CARS.length], color: free[k] || PLAYER_COLORS[k], kind: 'ai', ai: st.diff, slot: slot++, paint: AI_PAINTS[k], flame: AI_FLAMES[k] });
    }
    for (const p of humans) entrants.push({ id: p.id, name: p.name, driver: netDriver(p.driver ?? 4), car: p.car, color: p.color, kind: 'human', slot: slot++, paint: netPaint(p.paint), flame: netFlame(p.flame) });
    L.racing = true;
    L.went = false;
    L.loaded = new Set([L.myId]);
    const race = { trackId: mirrorId(trackId, st.mirror), laps: st.laps, mode: 'race', entrants };
    L.net.broadcast({ t: 'start', race });
    this._beginRace({ role: 'host', ...race, localId: L.myId, net: L.net });
    for (const [pid, id] of L.peers) this.session.addRemote(pid, id);
    this._broadcastLobby();
    clearTimeout(L.goTimer);
    L.goTimer = setTimeout(() => this._go(), 9000);
    this._maybeGo();
  }

  _maybeGo() {
    const L = this.online;
    if (!L || L.role !== 'host' || !L.racing || L.went) return;
    for (const id of L.peers.values()) if (!L.loaded.has(id)) return;
    this._go();
  }

  _go() {
    const L = this.online;
    if (!L || L.went || !this.session) return;
    L.went = true;
    clearTimeout(L.goTimer);
    // kurzer Vorlauf, damit die Nachricht vor Beginn des Countdowns überall ankommt
    const goAt = performance.now() + COUNTDOWN * 1000 + 600;
    this.session.setGoAt(goAt);
    L.net.broadcast({ t: 'go', goAt });
  }

  shareRoom() {
    const L = this.online;
    if (!L) return;
    shareLink(L.link, `ECHO RACER – Raum ${L.code}`).then((r) => {
      const info = this.ui.screens.lobby.querySelector('.net-info');
      if (r === 'copied') info.textContent = 'Link kopiert!';
      else if (r === 'failed') info.textContent = L.link;
    });
  }

  // ---------------- Online: Client ----------------
  async joinRoom(raw) {
    const code = normalizeCode(raw);
    if (code.length !== 4) {
      this.ui.setOnlineStatus('Bitte den 4-stelligen Raumcode eingeben.');
      return;
    }
    this.ui.setOnlineStatus(`Verbinde mit Raum ${code} …`, true);
    const net = new NetClient();
    try {
      await net.join(code);
    } catch (e) {
      this.ui.setOnlineStatus(e.message || 'Verbindung fehlgeschlagen.');
      return;
    }
    this.online = {
      role: 'client',
      net,
      code,
      myId: null,
      hostId: 'H',
      link: `${location.origin}${location.pathname}?room=${code}`,
      players: [],
      settings: { track: 'neon', laps: 4, ai: 0, diff: 1 },
      racing: false,
      rtt: 0,
    };
    net.on.msg = (m) => this._clientMsg(m);
    net.on.close = (reason) => this._clientLost(reason);
    net.send({ t: 'hello', name: settings.name || 'Fahrer', car: settings.car, paint: myPaint(), flame: myFlame(), driver: settings.driver, v: PROTOCOL });
    this.ui.setOnlineStatus('Verbunden – warte auf Antwort des Hosts …', true);
  }

  _clientMsg(m) {
    const L = this.online;
    if (!L) return;
    switch (m.t) {
      case 'welcome':
        L.myId = m.id;
        L.hostId = m.hostId;
        this.ui.setOnlineStatus('');
        if (!this.session) {
          this.ui.show('lobby');
          this.ui.renderLobby(L);
        }
        break;
      case 'lobby':
        L.players = m.players;
        L.settings = m.settings;
        L.racing = m.racing;
        L.rtt = L.net.rtt;
        if (this.ui.current === 'lobby') this.ui.renderLobby(L);
        break;
      case 'kick':
        L.net.close();
        this.online = null;
        this.ui.show('online', { status: m.reason });
        break;
      case 'start':
        if (m.race.entrants.some((e) => e.id === L.myId)) {
          this._beginRace({ role: 'client', ...m.race, localId: L.myId, net: L.net });
          L.net.send({ t: 'loaded' });
        }
        break;
      case 'go':
        if (this.session) this.session.setGoAt(m.goAt);
        break;
      case 'roulette':
        if (Array.isArray(m.tickets) && m.tickets.length) this.ui.roulette(m.tickets, m.win | 0, +m.dur || 2);
        break;
      case 'toLobby':
        L.racing = false;
        if (this.session) {
          this._endSession();
          this.startDemo();
        }
        this.ui.show('lobby');
        this.ui.renderLobby(L);
        break;
      case 'bye':
        this._clientLost('Der Host hat den Raum geschlossen.');
        break;
      default:
        if (this.session && this.session.role === 'client') this.session.onHostMsg(m);
    }
  }

  _clientLost(reason) {
    if (!this.online) return;
    this.online = null;
    const wasRacing = !!this.session;
    this._endSession();
    if (wasRacing) this.startDemo();
    this.ui.message('Verbindung beendet', reason, () => this.ui.show('online'));
  }

  leaveOnline() {
    const L = this.online;
    if (!L) return;
    this.online = null;
    try {
      L.net.close();
    } catch {
      /* egal */
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
