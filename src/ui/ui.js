// Menüs und Overlays (DOM). Alle Texte auf Deutsch.

import qrcode from 'qrcode-generator';
import { CARS, HACKS, PLAYER_COLORS, AI_LEVELS, MAX_CARS, CHARACTERS, FLAMES, CLASSES } from '../config.js';
import { TRACK_DEFS, mirrorId, medalFor, medalTimes, MEDALS } from '../game/trackDefs.js';
import { settings, saveSettings, loadRecord, isTouch } from '../platform.js';
import { fmtTime } from '../util.js';
import { getTrack } from '../session.js';
import { PAINTS, ACHIEVEMENTS, progress, achProgress, paintUnlocked, paintUnlockHint, levelInfo, dailyChallenge, dailyDoneToday, currentStreak, medalCount, todayKey, flameUnlocked, nextReward, missionsToday, missionText, missionCount, classUnlocked, gpCup } from '../progress.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const STAT_DEFS = [
  ['Tempo', (c) => (c.top - 44) / 12],
  ['Beschleunigung', (c) => (c.accel - 15) / 12],
  ['Handling', (c) => (c.turn - 1.7) / 0.6 * 0.6 + (c.grip - 8) / 3.5 * 0.4],
  ['Drift', (c) => (c.drift - 0.75) / 0.65],
  ['Hack-Laden', (c) => (c.hack - 0.7) / 0.9],
  ['Gewicht', (c) => (c.mass - 0.6) / 1.1],
];

function seg(key, options, cur) {
  return `<div class="seg" data-key="${key}">${options
    .map(([v, label]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${label}</button>`)
    .join('')}</div>`;
}

function trackThumb(def, w = 120, h = 80, color = '#fff') {
  const tr = getTrack(def.id);
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = w * dpr;
  c.height = h * dpr;
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const b = tr.bounds;
  const sc = Math.min((w - 12) / (b.maxX - b.minX), (h - 12) / (b.maxZ - b.minZ));
  const ox = (w - (b.maxX - b.minX) * sc) / 2;
  const oy = (h - (b.maxZ - b.minZ) * sc) / 2;
  g.beginPath();
  for (let k = 0; k <= tr.n; k += 4) {
    const i = k % tr.n;
    const x = w - (ox + (tr.px[i] - b.minX) * sc);
    const y = h - (oy + (tr.pz[i] - b.minZ) * sc);
    if (k === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 6;
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = 2.5;
  g.stroke();
  return c;
}

// Hinweis auf die nächste Level-Belohnung (Lack oder Boost-Flamme)
function nextRewardHint(level) {
  const r = nextReward(level);
  return r ? ` · bei Level ${r.level}: ${r.name}` : '';
}

// Freigeschaltete, aber noch nicht angesehene Boost-Flammen
function unseenFlames() {
  const seen = Array.isArray(settings.seenFlames) ? settings.seenFlames : [];
  return FLAMES.filter((f) => f.level && flameUnlocked(f.id) && !seen.includes(f.id));
}

// Freigeschaltete, aber noch nicht in der Garage angesehene Lacke
function unseenPaints() {
  const seen = Array.isArray(settings.seenPaints) ? settings.seenPaints : [];
  return PAINTS.filter((p) => p.id !== 'standard' && p.id !== 'matte' && paintUnlocked(p.id) && !seen.includes(p.id));
}

function medalIcon(idx, cls = '') {
  const m = MEDALS[idx];
  return m ? `<i class="md md-${m.id} ${cls}" title="${m.name}-Medaille">${m.icon}</i>` : '';
}

const THEME_COLORS = { neon: '#2ce7ff', canyon: '#ffb340', sky: '#ff5fb0', lava: '#ff6a1a', garden: '#6bd84a', park: '#b48cff' };

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.screens = {};
    this.current = null;
    this.back = null;
    this._build();
  }

  _screen(name, html, cls = 'screen') {
    const s = document.createElement('section');
    s.className = cls + ' scr-' + name + ' hidden';
    s.innerHTML = html;
    this.root.appendChild(s);
    this.screens[name] = s;
    return s;
  }

  show(name, data) {
    if (name !== 'results') clearTimeout(this._xpT);
    for (const k in this.screens) this.screens[k].classList.add('hidden');
    this.current = name;
    if (!name) return;
    const s = this.screens[name];
    s.classList.remove('hidden');
    const fn = this['_show_' + name];
    if (fn) fn.call(this, s, data);
    this.app.onScreen(name);
  }

  hideAll() {
    this.show(null);
  }

  click() {
    this.app.audio.init();
    this.app.audio.play('ui');
  }

  _build() {
    const app = this.app;
    // ---------- Titel ----------
    const t = this._screen(
      'title',
      `<div class="title-wrap">
        <div class="title-left">
          <div class="logo"><span class="l1">ECHO</span><span class="l2">RACER</span><span class="l3">Deine Runden werden zu Hindernissen.<br>Hack die Strecke.</span></div>
          <div class="profile"><b class="lv"></b><div class="xpbar"><i></i></div><small class="xptxt"></small></div>
          <button class="daily"><span class="dhead">TAGES-CHALLENGE<em class="streak"></em></span><b class="dtrack"></b><small class="dtext"></small><span class="dgo"></span></button>
          <div class="missions"></div>
        </div>
        <nav class="menu">
          <button data-go="solo" class="mbtn primary">SOLO-RENNEN</button>
          <button data-go="gp" class="mbtn gp-btn">🏆 GRAND PRIX</button>
          <button data-go="tt" class="mbtn">ZEITFAHREN</button>
          <button data-go="online" class="mbtn">ONLINE MIT FREUNDEN</button>
          <button data-go="garage" class="mbtn">GARAGE</button>
          <div class="row">
            <button data-go="stats" class="mbtn small">ERFOLGE</button>
            <button data-go="settings" class="mbtn small">EINSTELLUNGEN</button>
            <button data-go="help" class="mbtn small">SO GEHT'S</button>
          </div>
        </nav>
      </div>
      <div class="ver">v1.0 · Querformat · ${isTouch ? 'Touch' : 'Tastatur/Gamepad'}</div>`
    );
    t.querySelectorAll('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        this.click();
        const go = b.dataset.go;
        if (go === 'garage') this.show('garage', { back: 'title' });
        else if (go === 'stats') this.show('stats');
        else {
          if (go === 'settings') this.settingsBack = 'title';
          this.show(go);
        }
      })
    );
    t.querySelector('.daily').addEventListener('click', () => {
      this.click();
      app.startDaily();
    });

    // ---------- Solo ----------
    const s = this._screen(
      'solo',
      `<header><button class="back">‹</button><h2>SOLO-RENNEN</h2></header>
      <div class="cols">
        <div class="tracks"></div>
        <div class="opts">
          <div class="opt"><span>Runden</span>${seg('laps', [[3, '3'], [4, '4'], [5, '5'], [7, '7']], settings.laps)}</div>
          <div class="opt"><span>Gegner</span>${seg('opponents', [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], settings.opponents)}</div>
          <div class="opt"><span>KI</span>${seg('difficulty', AI_LEVELS.map((l, i) => [i, l.name]), settings.difficulty)}</div>
          <div class="opt"><span>Klasse</span>${seg('speedClass', CLASSES.map((c, i) => [i, c.name]), settings.speedClass)}</div>
          <div class="opt"><span>Richtung</span>${seg('mirror', [[0, 'Normal'], [1, 'Gespiegelt']], settings.mirror)}</div>
          <div class="opt carpick"><span>Auto</span><b class="carname"></b><button class="mbtn small change">ÄNDERN</button></div>
          <button class="mbtn primary go">START</button>
        </div>
      </div>`
    );
    this._bindBack(s, 'title');
    this._bindSegs(s);
    s.querySelector('.change').addEventListener('click', () => {
      this.click();
      this.show('garage', { back: 'solo' });
    });
    s.querySelector('.go').addEventListener('click', () => {
      this.click();
      app.startSolo({ trackId: mirrorId(settings.track, settings.mirror), laps: settings.laps, opponents: settings.opponents, difficulty: settings.difficulty });
    });

    // ---------- Grand Prix ----------
    const gpS = this._screen(
      'gp',
      `<header><button class="back">‹</button><h2>GRAND PRIX</h2></header>
      <div class="cols">
        <div class="gp-tracks"></div>
        <div class="opts">
          <p class="note">${TRACK_DEFS.length} Rennen, alle Welten, 3 Runden je Rennen. Punkte: 10 · 8 · 6 · 5 · 4 · 3. Der Führende der Gesamtwertung startet hinten. Gewinne die Meisterschaft für den goldenen Lack!</p>
          <div class="opt"><span>KI</span>${seg('gpDiff', AI_LEVELS.map((l, i) => [i, l.name]), settings.gpDiff)}</div>
          <div class="opt"><span>Klasse</span>${seg('speedClass', CLASSES.map((c, i) => [i, c.name]), settings.speedClass)}</div>
          <div class="opt carpick"><span>Auto</span><b class="carname"></b><button class="mbtn small change">ÄNDERN</button></div>
          <div class="opt"><span>Titel</span><b class="gp-wins"></b></div>
          <div class="opt"><span>Pokale</span><div class="gp-cups"></div></div>
          <button class="mbtn primary go">MEISTERSCHAFT STARTEN</button>
        </div>
      </div>`
    );
    this._bindBack(gpS, 'title');
    this._bindSegs(gpS);
    gpS.querySelector('.change').addEventListener('click', () => {
      this.click();
      this.show('garage', { back: 'gp' });
    });
    gpS.querySelector('.go').addEventListener('click', () => {
      this.click();
      app.startGP({ difficulty: settings.gpDiff });
    });

    this._screen(
      'stats',
      `<header><button class="back">‹</button><h2>ERFOLGE & STATISTIK</h2></header>
      <div class="stats-wrap">
        <div class="ach-grid"></div>
        <div class="totals"></div>
      </div>`
    );
    this._bindBack(this.screens.stats, 'title');

    // ---------- Zeitfahren ----------
    const tt = this._screen(
      'tt',
      `<header><button class="back">‹</button><h2>ZEITFAHREN</h2></header>
      <div class="cols">
        <div class="tracks"></div>
        <div class="opts">
          <p class="note">Fahre gegen deine eigenen Echos – jede Runde wird zum Hindernis für die nächste. Deine Bestzeit kommt als goldener Rekord-Geist wieder.</p>
          <div class="opt"><span>Runden</span>${seg('ttLaps', [[3, '3'], [5, '5'], [7, '7']], settings.ttLaps)}</div>
          <div class="opt"><span>Richtung</span>${seg('mirror', [[0, 'Normal'], [1, 'Gespiegelt']], settings.mirror)}</div>
          <div class="opt"><span>Rekord</span><b class="record">–</b></div>
          <div class="opt"><span>Medaillen</span><div class="medal-row"></div></div>
          <div class="opt carpick"><span>Auto</span><b class="carname"></b><button class="mbtn small change">ÄNDERN</button></div>
          <button class="mbtn primary go">START</button>
        </div>
      </div>`
    );
    this._bindBack(tt, 'title');
    this._bindSegs(tt);
    tt.querySelector('.change').addEventListener('click', () => {
      this.click();
      this.show('garage', { back: 'tt' });
    });
    tt.querySelector('.go').addEventListener('click', () => {
      this.click();
      app.startTimeTrial({ trackId: mirrorId(settings.track, settings.mirror), laps: settings.ttLaps });
    });

    // ---------- Online ----------
    const on = this._screen(
      'online',
      `<header><button class="back">‹</button><h2>ONLINE MIT FREUNDEN</h2></header>
      <div class="cols">
        <div class="panel">
          <h3>Dein Name</h3>
          <input class="name" maxlength="12" placeholder="Name" autocomplete="nickname">
          <button class="mbtn primary host">RAUM ERSTELLEN</button>
          <p class="small-note">Du bist Host. Bis zu 6 Fahrer, freie Plätze füllt auf Wunsch die KI.</p>
        </div>
        <div class="panel">
          <h3>Raum beitreten</h3>
          <input class="code" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off" spellcheck="false">
          <button class="mbtn join">BEITRETEN</button>
          <p class="small-note">4-stelligen Code vom Host eingeben oder den geteilten Link / QR-Code öffnen.</p>
        </div>
      </div>
      <p class="status"></p>`
    );
    this._bindBack(on, 'title', () => app.leaveOnline());
    const nameIn = on.querySelector('.name');
    nameIn.addEventListener('change', () => {
      settings.name = nameIn.value.trim().slice(0, 12);
      saveSettings();
    });
    on.querySelector('.host').addEventListener('click', () => {
      this.click();
      settings.name = nameIn.value.trim().slice(0, 12);
      saveSettings();
      app.hostRoom();
    });
    const codeIn = on.querySelector('.code');
    codeIn.addEventListener('input', () => (codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)));
    const doJoin = () => {
      this.click();
      settings.name = nameIn.value.trim().slice(0, 12);
      saveSettings();
      app.joinRoom(codeIn.value);
    };
    on.querySelector('.join').addEventListener('click', doJoin);
    codeIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doJoin();
    });

    // ---------- Lobby ----------
    const lb = this._screen(
      'lobby',
      `<header><button class="back">‹</button><h2>RAUM <b class="code-inline"></b></h2><span class="net-info"></span><button class="mbtn primary lgo"></button></header>
      <div class="cols lobby-cols">
        <div class="panel invite">
          <div class="code-big"></div>
          <div class="qr"></div>
          <button class="mbtn small share">LINK TEILEN</button>
        </div>
        <div class="panel players"><h3>FAHRER <span class="pcount"></span></h3><ul></ul></div>
        <div class="panel lset">
          <div class="host-only">
            <div class="opt"><span>Strecke</span><div class="seg tracks-seg" data-key="lobbyTrack"><button data-v="vote">🎲 Abstimmung</button>${TRACK_DEFS.map((d) => `<button data-v="${d.id}">${d.name}</button>`).join('')}</div></div>
            <div class="opt"><span>Runden</span><div class="seg" data-key="lobbyLaps">${[3, 4, 5, 7].map((n) => `<button data-v="${n}">${n}</button>`).join('')}</div></div>
            <div class="opt"><span>KI-Fahrer</span><div class="seg" data-key="lobbyAi">${[0, 1, 2, 3, 4, 5].map((n) => `<button data-v="${n}">${n}</button>`).join('')}</div></div>
            <div class="opt"><span>KI-Stärke</span><div class="seg" data-key="lobbyDiff">${AI_LEVELS.map((l, i) => `<button data-v="${i}">${l.name}</button>`).join('')}</div></div>
            <div class="opt"><span>Richtung</span><div class="seg" data-key="lobbyMirror"><button data-v="0">Normal</button><button data-v="1">Gespiegelt</button></div></div>
          </div>
          <div class="client-only"><p class="lobby-info"></p></div>
          <div class="vote"><span class="vote-h">ABSTIMMUNG · deine Stimme</span><div class="vote-grid"></div></div>
          <div class="opt carpick"><span>Dein Auto</span><b class="carname"></b><button class="mbtn small change">ÄNDERN</button></div>
        </div>
      </div>`
    );
    this._bindBack(lb, 'online', () => app.leaveOnline());
    lb.querySelector('.change').addEventListener('click', () => {
      this.click();
      this.show('garage', { back: 'lobby' });
    });
    lb.querySelector('.share').addEventListener('click', () => {
      this.click();
      app.shareRoom();
    });
    lb.querySelector('.lgo').addEventListener('click', () => {
      this.click();
      app.lobbyPrimary();
    });
    const vg = lb.querySelector('.vote-grid');
    vg.addEventListener('click', (e) => {
      const b = e.target.closest('.vcard');
      if (!b) return;
      this.click();
      app.lobbyVote(b.dataset.v);
    });
    lb.querySelectorAll('.lset .seg').forEach((sg) =>
      sg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.click();
        app.lobbySetting(sg.dataset.key, b.dataset.v);
      })
    );

    // ---------- Garage ----------
    const gr = this._screen(
      'garage',
      `<header><button class="back">‹</button><h2>GARAGE</h2></header>
      <div class="garage">
        <div class="car-list">${CARS.map((c, i) => `<button data-i="${i}"><b>${c.name}</b><small>${c.role}</small></button>`).join('')}</div>
        <div class="car-stage"></div>
        <div class="car-info">
          <h2 class="cname"></h2><p class="crole"></p>
          <div class="stats">${STAT_DEFS.map(([n]) => `<div class="stat"><span>${n}</span><i><b></b></i></div>`).join('')}</div>
          <div class="drivers"><span>Fahrer</span><div class="drv-row">${CHARACTERS.map((c, i) => `<button data-d="${i}" title="${c.desc}">${app.portraits ? `<img src="${app.portraits[i].url}" alt="">` : ''}<small>${c.name}</small></button>`).join('')}</div></div>
          <div class="paints"><span>Lack</span><div class="paint-row">${PAINTS.map((p) => `<button data-p="${p.id}" title="${p.name}"><i class="sw sw-${p.id}"></i><small>${p.name}</small></button>`).join('')}</div><p class="paint-hint"></p></div>
          <div class="flames"><span>Boost-Flamme</span><div class="flame-row">${FLAMES.map((f) => `<button data-f="${f.id}" title="${f.name}"><i class="fl fl-${f.id}"></i><small>${f.name}</small></button>`).join('')}</div></div>
          <button class="mbtn primary pick">AUSWÄHLEN</button>
        </div>
      </div>`
    );
    gr.querySelector('.back').addEventListener('click', () => {
      this.click();
      this.show(this.garageBack || 'title');
    });
    gr.querySelectorAll('.car-list button').forEach((b) =>
      b.addEventListener('click', () => {
        this.click();
        this._garageSelect(+b.dataset.i);
      })
    );
    gr.querySelectorAll('.drv-row button').forEach((b) =>
      b.addEventListener('click', () => {
        this.click();
        this.garageDriverSel = +b.dataset.d;
        gr.querySelectorAll('.drv-row button').forEach((x) => x.classList.toggle('on', x === b));
        this.app.showroomCar(this.garageSel, this.garagePaintSel, this.garageDriverSel);
      })
    );
    gr.querySelectorAll('.paint-row button').forEach((b) =>
      b.addEventListener('click', () => {
        this.click();
        this._garagePaint(b.dataset.p);
      })
    );
    gr.querySelectorAll('.flame-row button').forEach((b) =>
      b.addEventListener('click', () => {
        this.click();
        this._garageFlame(b.dataset.f, true);
      })
    );
    gr.querySelector('.pick').addEventListener('click', () => {
      this.click();
      settings.car = this.garageSel;
      settings.driver = this.garageDriverSel ?? settings.driver;
      if (paintUnlocked(this.garagePaintSel)) settings.paint = this.garagePaintSel;
      saveSettings();
      app.onCarChanged();
      this.show(this.garageBack || 'title');
    });

    // ---------- Einstellungen ----------
    const st = this._screen(
      'settings',
      `<header><button class="back">‹</button><h2>EINSTELLUNGEN</h2></header>
      <div class="settings-grid">
        <div class="set wide"><span>Steuerung</span>${seg('control', [['touch', 'Touch-Lenkrad'], ['tilt', 'Neigung'], ['keys', 'Tastatur / Gamepad']], settings.control)}</div>
        <div class="set"><span>Lenk-Empfindlichkeit</span><input type="range" min="0.5" max="2" step="0.05" data-set="sens"><output></output></div>
        <div class="set"><span>Neigung</span><button class="mbtn small calib">KALIBRIEREN</button><label class="chk"><input type="checkbox" data-set="tiltInvert"> umkehren</label></div>
        <div class="set"><span>Auto-Gas</span><label class="chk"><input type="checkbox" data-set="autoGas"> automatisch Gas geben</label></div>
        <div class="set"><span>Lenkhilfe</span><label class="chk"><input type="checkbox" data-set="assist"> hält von der Bande fern</label></div>
        <div class="set"><span>Vibration</span><label class="chk"><input type="checkbox" data-set="vibration"> an</label></div>
        <div class="set wide"><span>Grafik</span>${seg('quality', [['auto', 'Auto'], ['ultra', 'Ultra (HD)'], ['high', 'Hoch'], ['mid', 'Mittel'], ['low', 'Niedrig']], settings.quality)}</div>
        <div class="set"><span>Max. Auflösung</span><input type="range" min="1" max="2.5" step="0.25" data-set="dprCap"><output></output></div>
        <div class="set"><span>FPS-Anzeige</span><label class="chk"><input type="checkbox" data-set="showFps"> anzeigen</label></div>
        <div class="set"><span>Musik</span><input type="range" min="0" max="1" step="0.05" data-set="music"><output></output></div>
        <div class="set"><span>Effekte</span><input type="range" min="0" max="1" step="0.05" data-set="sfx"><output></output></div>
      </div>
      <p class="status tilt-status"></p>`
    );
    st.querySelector('.back').addEventListener('click', () => {
      this.click();
      saveSettings();
      this.show(this.settingsBack || 'title');
    });
    this._bindSegs(st);
    st.querySelectorAll('[data-set]').forEach((inp) => {
      const k = inp.dataset.set;
      const out = inp.parentElement.querySelector('output');
      const fmt = () => {
        if (out) out.textContent = k === 'dprCap' ? inp.value + '×' : k === 'sens' ? (+inp.value).toFixed(2) : Math.round(inp.value * 100) + '%';
      };
      inp.addEventListener('input', () => {
        settings[k] = inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value);
        fmt();
        app.applySettings(k);
      });
      this['_fmt_' + k] = fmt;
    });
    st.querySelector('.calib').addEventListener('click', async () => {
      this.click();
      const ok = await app.input.enableTilt();
      const status = st.querySelector('.tilt-status');
      if (!ok) {
        status.textContent = 'Neigungssensor nicht verfügbar oder nicht erlaubt.';
        return;
      }
      status.textContent = 'Gerät neutral halten …';
      setTimeout(() => {
        if (!app.input.tilt.available) {
          status.textContent = 'Keine Sensordaten empfangen (Gerät ohne Sensor?).';
          return;
        }
        app.input.calibrateTilt();
        saveSettings();
        status.textContent = 'Kalibriert! Nullstellung gespeichert.';
      }, 700);
    });

    // ---------- Anleitung ----------
    this._screen(
      'help',
      `<header><button class="back">‹</button><h2>SO GEHT'S</h2></header>
      <div class="help">
        <div class="hcol">
          <h3>Echos</h3>
          <p>Jede abgeschlossene Runde hinterlässt ein leuchtendes <b>Echo-Auto</b>, das deine Linie dieser Runde exakt nachfährt – in Endlosschleife. Echos sind für <b>alle</b> feste Hindernisse (Treffer = Tempoverlust), auch für dich selbst. Frisch gesetzte Echos werden erst fest, sobald man einmal Abstand zu ihnen hatte.</p>
          <h3>Streckenhacks</h3>
          <p>Driften, Windschatten (auch hinter Echos!) und knappe Überholmanöver laden die <b>Hack-Leiste</b> (3 Ladungen). Streckenhacks treffen den Fahrer direkt vor dir (als Führender: hinter dir), Schockwelle und Rammstoß wirken direkt an deinem Auto:</p>
          <ul>${HACKS.map((h) => `<li><b>${h.icon} ${h.name}</b> (${h.cost}●): ${h.desc}</li>`).join('')}</ul>
          <p>Hacks erscheinen erst als flackerndes Hologramm – wer aufpasst, weicht aus. Eigene Hacks sind für dich durchlässig.</p>
          <h3>Fortschritt</h3>
          <ul>
            <li><b>Stil-Kette:</b> Drifts, Tricks, Windschatten, knappe Manöver und Überholen kurz hintereinander erhöhen den Multiplikator bis ×4. Ein Treffer lässt die Kette reißen.</li>
            <li><b>Fahrer-Level:</b> Jedes Rennen bringt XP – höhere Level schalten neue Lacke frei.</li>
            <li><b>Medaillen:</b> Im Zeitfahren gibt es Bronze, Silber, Gold und die schwere Echo-Medaille.</li>
            <li><b>Tages-Challenge:</b> Jeden Tag eine neue Aufgabe – mehrere Tage in Folge geben Bonus-XP.</li>
          </ul>
        </div>
        <div class="hcol">
          <h3>Fahren</h3>
          <ul>
            <li><b>Gas</b> gibt das Auto automatisch (abschaltbar).</li>
            <li><b>Turbostart:</b> <b>Drift</b> genau beim „LOS“ drücken – zu früh dreht das Kart kurz durch.</li>
            <li><b>Drift</b> halten + lenken: Hüpfer, dann Funken blau → orange → lila. Loslassen = Mini-Boost.</li>
            <li><b>Boostfelder</b> geben Schub. Gespiegelte (rote) Felder bremsen.</li>
            <li><b>Sprungschanzen</b> (gelb) und Hack-Rampen: in der Luft <b>Drift</b> tippen = Trick, Landung mit Boost. In der Luft lässt sich leicht lenken.</li>
            <li>In der <b>Garage</b> wählst du Kart, Fahrerfigur und Lack.</li>
          </ul>
          <h3>Steuerung</h3>
          <ul>
            <li><b>Handy:</b> Touch-Lenkrad links (ziehen) oder Neigung, rechts DRIFT, HACK, BREMSE; Hack wählen mit ⇆ oder in der Symbolleiste; ◀◀ oben halten = zurückschauen.</li>
            <li><b>Tastatur:</b> ←/→ bzw. A/D lenken, ↑ Gas (bei Auto-Gas aus), ↓ bremsen/rückwärts, Leertaste driften, E hacken, Q oder 1–7 Hack wählen, R zurücksetzen, B zurückschauen, ESC Pause.</li>
            <li><b>Gamepad:</b> Stick lenken, RT Gas, LT/B bremsen, A/RB driften, X hacken, Y/LB wechseln, Start Pause.</li>
          </ul>
        </div>
      </div>`
    );
    this._bindBack(this.screens.help, 'title');

    // ---------- Pause ----------
    const pz = this._screen(
      'pause',
      `<div class="ov-box">
        <h2 class="ptitle">PAUSE</h2>
        <button class="mbtn primary resume">WEITER</button>
        <button class="mbtn restart">NEUSTART</button>
        <button class="mbtn reset">AUTO ZURÜCKSETZEN</button>
        <button class="mbtn settings">EINSTELLUNGEN</button>
        <button class="mbtn quit">RENNEN VERLASSEN</button>
      </div>`,
      'overlay'
    );
    pz.querySelector('.resume').addEventListener('click', () => {
      this.click();
      app.togglePause(false);
    });
    pz.querySelector('.restart').addEventListener('click', () => {
      this.click();
      app.restartRace();
    });
    pz.querySelector('.reset').addEventListener('click', () => {
      this.click();
      app.togglePause(false);
      app.session && app.session.requestReset();
    });
    pz.querySelector('.settings').addEventListener('click', () => {
      this.click();
      this.settingsBack = 'pause';
      this.show('settings');
    });
    pz.querySelector('.quit').addEventListener('click', () => {
      this.click();
      app.quitRace();
    });

    // ---------- Ergebnis ----------
    const rs = this._screen(
      'results',
      `<div class="ov-box wide">
        <h2 class="rtitle">ERGEBNIS</h2>
        <div class="trophy hidden"></div>
        <div class="rtable"></div>
        <div class="gptable"></div>
        <div class="medalbox hidden"></div>
        <div class="dailybox hidden"></div>
        <div class="missions res-missions hidden"></div>
        <div class="xpbox hidden"></div>
        <div class="fresh"></div>
        <div class="rbtns">
          <button class="mbtn primary gpnext hidden">NÄCHSTES RENNEN</button>
          <button class="mbtn primary again">NOCHMAL</button>
          <button class="mbtn lobby">ZUR LOBBY</button>
          <button class="mbtn menu">MENÜ</button>
        </div>
      </div>`,
      'overlay'
    );
    rs.querySelector('.again').addEventListener('click', () => {
      this.click();
      app.restartRace();
    });
    rs.querySelector('.gpnext').addEventListener('click', () => {
      this.click();
      app.nextGP();
    });
    rs.querySelector('.lobby').addEventListener('click', () => {
      this.click();
      app.backToLobby();
    });
    rs.querySelector('.menu').addEventListener('click', () => {
      this.click();
      app.quitRace();
    });

    // ---------- Hinweis-Overlay (Fehler, Warten) ----------
    const msg = this._screen('message', `<div class="ov-box"><h2 class="mtitle"></h2><p class="mtext"></p><button class="mbtn primary mok">OK</button></div>`, 'overlay');
    msg.querySelector('.mok').addEventListener('click', () => {
      this.click();
      const fn = this.msgDone;
      this.msgDone = null;
      if (fn) fn();
    });
  }

  _bindBack(s, target, extra) {
    s.querySelector('.back').addEventListener('click', () => {
      this.click();
      if (extra) extra();
      this.show(target);
    });
  }

  _bindSegs(s) {
    s.querySelectorAll('.seg[data-key]').forEach((sg) => {
      if (sg.closest('.lset')) return;
      sg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.click();
        const k = sg.dataset.key;
        const raw = b.dataset.v;
        if (k === 'speedClass' && !classUnlocked(+raw)) {
          this.app.hud.toast(`🔒 Klasse ${CLASSES[+raw].name} ab Fahrer-Level ${CLASSES[+raw].level}`, 'info');
          return;
        }
        settings[k] = isNaN(+raw) ? raw : +raw;
        sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        saveSettings();
        this.app.applySettings(k);
        if (k === 'ttLaps' || k === 'laps' || k === 'mirror') this._refreshRecord();
        if (k === 'speedClass' && this.screens.gp) this._renderCups(this.screens.gp);
      });
    });
  }

  _trackCards(container, onPick) {
    container.innerHTML = '';
    for (const def of TRACK_DEFS) {
      const b = document.createElement('button');
      b.className = 'tcard' + (settings.track === def.id ? ' on' : '');
      b.dataset.id = def.id;
      b.style.setProperty('--tc', THEME_COLORS[def.theme]);
      b.appendChild(trackThumb(def, 104, 64, THEME_COLORS[def.theme]));
      const info = document.createElement('div');
      info.innerHTML = `<b>${def.name}</b><small>${def.feature}</small>`;
      b.appendChild(info);
      b.addEventListener('click', () => {
        this.click();
        settings.track = def.id;
        saveSettings();
        container.querySelectorAll('.tcard').forEach((x) => x.classList.toggle('on', x === b));
        if (onPick) onPick(def);
      });
      container.appendChild(b);
    }
  }

  _carName() {
    const c = CARS[settings.car] || CARS[0];
    const d = CHARACTERS[settings.driver] || CHARACTERS[0];
    return `${d.name} · ${c.name} <small>${c.role}</small>`;
  }

  // Umschalter (Runden, Richtung …) nach den aktuellen Einstellungen markieren – Solo und Zeitfahren teilen sich z. B. "mirror"
  _syncSegs(s) {
    s.querySelectorAll('.seg[data-key]').forEach((sg) => {
      let v = settings[sg.dataset.key];
      if (v === undefined) return;
      const cls = sg.dataset.key === 'speedClass';
      if (cls && !classUnlocked(v)) v = 1;
      sg.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', String(b.dataset.v) === String(v));
        if (cls) b.classList.toggle('locked', !classUnlocked(+b.dataset.v));
      });
    });
  }

  _show_solo(s) {
    this._syncSegs(s);
    this._trackCards(s.querySelector('.tracks'));
    s.querySelector('.carname').innerHTML = this._carName();
  }

  _show_tt(s) {
    this._syncSegs(s);
    this._trackCards(s.querySelector('.tracks'), () => this._refreshRecord());
    s.querySelector('.carname').innerHTML = this._carName();
    this._refreshRecord();
  }

  _refreshRecord() {
    const s = this.screens.tt;
    const id = mirrorId(settings.track, settings.mirror);
    const r = loadRecord(id);
    const got = medalFor(id, r?.time);
    s.querySelector('.record').innerHTML = r ? `${medalIcon(got)} ${fmtTime(r.time)} <small>(${esc((CARS[r.car] || CARS[0]).name)})</small>` : 'noch keiner';
    const t = medalTimes(id);
    s.querySelector('.medal-row').innerHTML = MEDALS.slice()
      .reverse()
      .map((m, k) => {
        const idx = MEDALS.length - 1 - k;
        return `<span class="mt ${got >= 0 && got <= idx ? 'got' : ''}">${medalIcon(idx)}<b>${t[m.id].toFixed(1)}</b></span>`;
      })
      .join('');
    // Medaille je Strecke auf den Karten (in der gewählten Richtung)
    s.querySelectorAll('.tcard').forEach((b) => {
      let tag = b.querySelector('.tmedal');
      if (!tag) {
        tag = document.createElement('span');
        tag.className = 'tmedal';
        b.appendChild(tag);
      }
      const tid = mirrorId(b.dataset.id, settings.mirror);
      tag.innerHTML = medalIcon(medalFor(tid, loadRecord(tid)?.time));
    });
  }

  _show_title(s) {
    s.querySelector('[data-go="garage"]').classList.toggle('has-new', unseenPaints().length + unseenFlames().length > 0);
    this._renderMissions(s.querySelector('.missions'));
    const L = levelInfo(progress.xp);
    s.querySelector('.lv').textContent = 'LV ' + L.level;
    s.querySelector('.xpbar i').style.width = (L.max ? 100 : Math.round((L.cur / L.need) * 100)) + '%';
    s.querySelector('.xptxt').textContent = L.max ? 'Höchstes Level!' : `${L.cur} / ${L.need} XP`;
    const ch = dailyChallenge();
    const done = dailyDoneToday();
    const streak = currentStreak();
    const d = s.querySelector('.daily');
    d.classList.toggle('done', done);
    s.querySelector('.streak').textContent = streak ? ` · 🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'}` : '';
    s.querySelector('.dtrack').textContent = `${ch.trackName} · ${CARS[ch.car].name}`;
    s.querySelector('.dtext').textContent = ch.text;
    if (done) {
      const now = new Date();
      const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const h = Math.floor((mid - now) / 3600000);
      const m = Math.floor(((mid - now) % 3600000) / 60000);
      s.querySelector('.dgo').textContent = `✓ GESCHAFFT · neue in ${h} h ${m} min`;
    } else s.querySelector('.dgo').textContent = `LOS › +${200 + Math.min(streak, 6) * 25} XP`;
  }

  _show_online(s, data) {
    s.querySelector('.name').value = settings.name || '';
    if (data && data.code) s.querySelector('.code').value = data.code;
    this.setOnlineStatus(data && data.status ? data.status : '');
  }

  setOnlineStatus(text, busy = false) {
    const s = this.screens.online;
    s.querySelector('.status').textContent = text;
    s.querySelectorAll('.mbtn').forEach((b) => (b.disabled = busy));
  }

  _show_garage(s, data) {
    if (data && data.back) this.garageBack = data.back;
    this.garagePaintSel = paintUnlocked(settings.paint) ? settings.paint : 'standard';
    this.garageDriverSel = settings.driver;
    s.querySelectorAll('.drv-row button').forEach((x) => x.classList.toggle('on', +x.dataset.d === settings.driver));
    this._garageSelect(settings.car);
    this._garageFlame(flameUnlocked(settings.flame) ? settings.flame : 'standard', false);
  }

  // Boost-Flamme wählen: freie sofort übernehmen, gesperrte mit Hinweis auf das nötige Level
  _garageFlame(id, picked) {
    const s = this.screens.garage;
    const F = FLAMES.find((f) => f.id === id) || FLAMES[0];
    const ok = flameUnlocked(F.id);
    if (ok) {
      settings.flame = F.id;
      if (F.level && !(settings.seenFlames || []).includes(F.id)) settings.seenFlames = [...(settings.seenFlames || []), F.id];
      saveSettings();
    }
    const fresh = unseenFlames().map((f) => f.id);
    s.querySelectorAll('.flame-row button').forEach((b) => {
      b.classList.toggle('on', b.dataset.f === (ok ? F.id : settings.flame));
      b.classList.toggle('locked', !flameUnlocked(b.dataset.f));
      b.classList.toggle('new', fresh.includes(b.dataset.f));
    });
    if (picked) {
      s.querySelector('.paint-hint').innerHTML = ok
        ? `<b>${esc(F.name)}</b> – Farbe deiner Boost-Flammen und Funken`
        : `🔒 <b>${esc(F.name)}</b> – Erreiche Fahrer-Level ${F.level} (jetzt: ${levelInfo(progress.xp).level}).`;
    }
  }

  // Tagesaufträge (Startbildschirm und Ergebnis): Text, Balken, Zähler; moved = in diesem Rennen vorangekommen
  _renderMissions(box, moved = null) {
    if (!box) return;
    const M = missionsToday();
    const done = M.list.filter((m) => m.done).length;
    box.innerHTML =
      `<span class="mhead">AUFTRÄGE HEUTE <em>${done}/${M.list.length}${M.bonus ? ' · Bonus erhalten' : ' · alle 3 = +150 XP'}</em></span>` +
      M.list
        .map((m) => {
          const pct = Math.round((Math.min(m.cur, m.n) / m.n) * 100);
          const mv = moved && moved.includes(m);
          return `<div class="mrow ${m.done ? 'done' : ''} ${mv ? 'moved' : ''}"><small>${m.done ? '✓ ' : ''}${esc(missionText(m))}</small><i class="mbar"><u style="width:${pct}%"></u></i><b>${missionCount(m)}</b><em>+${m.xp}</em></div>`;
        })
        .join('');
  }

  // Lackierung wählen (gesperrte als Vorschau mit Hinweis, wie man sie bekommt)
  _garagePaint(id) {
    this.garagePaintSel = id;
    const s = this.screens.garage;
    // angesehener Lack verliert die NEU-Markierung
    if (paintUnlocked(id) && !(settings.seenPaints || []).includes(id)) {
      settings.seenPaints = [...(settings.seenPaints || []), id];
      saveSettings();
    }
    const fresh = unseenPaints().map((p) => p.id);
    s.querySelectorAll('.paint-row button').forEach((b) => {
      b.classList.toggle('on', b.dataset.p === id);
      b.classList.toggle('locked', !paintUnlocked(b.dataset.p));
      b.classList.toggle('new', fresh.includes(b.dataset.p));
    });
    const P = PAINTS.find((p) => p.id === id);
    const ok = paintUnlocked(id);
    s.querySelector('.paint-hint').innerHTML = ok ? `<b>${esc(P.name)}</b> – ${esc(P.desc)}` : `🔒 <b>${esc(P.name)}</b> – ${esc(paintUnlockHint(id))}`;
    s.querySelector('.pick').textContent = ok ? 'AUSWÄHLEN' : 'NUR AUTO WÄHLEN';
    this.app.showroomCar(this.garageSel, id, this.garageDriverSel);
  }

  _garageSelect(i) {
    this.garageSel = i;
    const s = this.screens.garage;
    const c = CARS[i];
    s.querySelectorAll('.car-list button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
    s.querySelector('.cname').textContent = c.name;
    s.querySelector('.crole').textContent = c.role;
    s.querySelectorAll('.stat i b').forEach((b, k) => {
      const v = Math.max(0.06, Math.min(1, STAT_DEFS[k][1](c)));
      b.style.width = Math.round(v * 100) + '%';
    });
    this._garagePaint(this.garagePaintSel || 'standard');
  }

  _show_gp(s) {
    this._syncSegs(s);
    const box = s.querySelector('.gp-tracks');
    box.innerHTML = '';
    TRACK_DEFS.forEach((def, i) => {
      const d = document.createElement('div');
      d.className = 'tcard gp-card';
      d.style.setProperty('--tc', THEME_COLORS[def.theme]);
      d.appendChild(trackThumb(def, 104, 64, THEME_COLORS[def.theme]));
      const info = document.createElement('div');
      info.innerHTML = `<b>${i + 1}. ${esc(def.name)}</b><small>${esc(def.feature)}</small>`;
      d.appendChild(info);
      box.appendChild(d);
    });
    s.querySelector('.carname').innerHTML = this._carName();
    s.querySelector('.gp-wins').textContent = progress.gpWins ? `${progress.gpWins}× Champion` : 'noch keiner';
    this._renderCups(s);
  }

  // Pokal-Sammlung der gewählten Klasse: je Schwierigkeit bester Platz + Sterne
  _renderCups(s) {
    const cls = classUnlocked(settings.speedClass) ? settings.speedClass : 1;
    s.querySelector('.gp-cups').innerHTML = AI_LEVELS.map((l, d) => {
      const c = gpCup(`${d}-${cls}`);
      const icon = c ? ['🏆', '🥈', '🥉'][c.place - 1] || '·' : '·';
      const st = c ? [0, 1, 2].map((i) => `<i class="${i < c.stars ? 'on' : ''}">★</i>`).join('') : '<i>★</i><i>★</i><i>★</i>';
      return `<span class="gcup ${c ? 'got' : ''}"><b>${icon}</b><small>${l.name}</small><em>${st}</em></span>`;
    }).join('');
  }

  _show_stats(s) {
    s.querySelector('.ach-grid').innerHTML = ACHIEVEMENTS.map((a) => {
      const p = achProgress(a);
      const pct = Math.round((p.cur / p.max) * 100);
      const paint = a.paint ? PAINTS.find((x) => x.id === a.paint) : null;
      return `<div class="ach ${p.done ? 'done' : ''}">
        <div class="ach-ico">${p.done ? '★' : '☆'}</div>
        <div class="ach-txt"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>
          <i class="bar"><u style="width:${pct}%"></u></i>
          <em>${p.done ? 'Geschafft' : `${p.cur} / ${p.max}`}${paint ? ` · Belohnung: <span class="sw sw-${paint.id}"></span> ${esc(paint.name)}-Lack` : ''}</em>
        </div>
      </div>`;
    }).join('');
    const P = progress;
    const L = levelInfo(P.xp);
    const rows = [
      ['Fahrer-Level', `${L.level} (${P.xp} XP)`],
      ['Tages-Challenges', `${P.dailyCount} (beste Serie ${P.streakBest})`],
      ['Bester Stil-Wert', (P.styleBest || 0).toLocaleString('de-DE')],
      ['Medaillen Gold / Echo', `${medalCount(1)} / ${medalCount(0)} von ${TRACK_DEFS.length}`],
      ['Rennen', P.races],
      ['Siege', P.wins],
      ['Podestplätze', P.podiums],
      ['Grand-Prix-Titel', P.gpWins],
      ['Gefahrene Strecke', P.km.toFixed(1) + ' km'],
      ['Ultra-Boosts', P.ultra],
      ['Tricks', P.tricks],
      ['Hacks gesetzt', P.hacks],
      ['Hack-Treffer', P.hackHits],
      ['Echo-Treffer', P.echoHits],
      ['Gerammt', P.rams],
      ['Knapp vorbei', P.nearMiss],
    ];
    const done = ACHIEVEMENTS.filter((a) => P.ach[a.id]).length;
    s.querySelector('.totals').innerHTML = `<h3>STATISTIK</h3><div class="ach-sum">${done} / ${ACHIEVEMENTS.length} Erfolge</div><table>${rows
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join('')}</table>`;
  }

  _show_settings(s) {
    s.querySelectorAll('[data-set]').forEach((inp) => {
      const k = inp.dataset.set;
      if (inp.type === 'checkbox') inp.checked = !!settings[k];
      else inp.value = settings[k];
      const f = this['_fmt_' + k];
      if (f) f();
    });
    s.querySelectorAll('.seg[data-key]').forEach((sg) => {
      const k = sg.dataset.key;
      sg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(settings[k])));
    });
    s.querySelector('.tilt-status').textContent = '';
  }

  // Strecken-Roulette: Lose (Strecke + Farbe des Wählers) laufen durch, werden langsamer und bleiben beim Gewinner stehen
  roulette(tickets, win, dur) {
    clearTimeout(this._rouT);
    let box = document.getElementById('roulette');
    if (!box) {
      box = document.createElement('div');
      box.id = 'roulette';
      document.getElementById('ui').appendChild(box);
    }
    const name = (id) => (TRACK_DEFS.find((d) => d.id === id) || TRACK_DEFS[0]).name;
    box.innerHTML = `<div class="rbox"><h3>STRECKE WIRD GELOST</h3><div class="rlots">${tickets
      .map((t) => `<span class="rchip"><i style="background:${esc(t.color)}"></i>${esc(name(t.track))}</span>`)
      .join('')}</div><div class="rwin"></div></div>`;
    box.className = 'show';
    const chips = [...box.querySelectorAll('.rchip')];
    const n = chips.length;
    // Schritte so wählen, dass nach ≥ 2 Runden genau der Gewinner getroffen wird; Abstände wachsen quadratisch
    const steps = Math.max(n * 2 + win, n === 1 ? 4 : 0);
    const T = dur * 1000;
    let k = 0;
    const tick = () => {
      chips.forEach((c, i) => c.classList.toggle('on', i === k % n));
      this.app.audio.play('ui', 0.5);
      if (k >= steps) {
        chips[win].classList.add('win');
        this.app.audio.play('medal');
        box.querySelector('.rwin').innerHTML = `<b>${esc(name(tickets[win].track))}</b>`;
        setTimeout(() => (box.className = ''), 1500);
        return;
      }
      k++;
      const f = k / steps;
      this._rouT = setTimeout(tick, Math.max(40, (T / steps) * (0.35 + 1.6 * f * f)));
    };
    tick();
  }

  // ---------- Lobby ----------
  renderLobby(L) {
    const s = this.screens.lobby;
    const isHost = L.role === 'host';
    s.classList.toggle('is-host', isHost);
    s.querySelector('.code-inline').textContent = L.code;
    s.querySelector('.code-big').textContent = L.code;
    s.querySelector('.net-info').textContent = isHost ? 'Du bist Host' : L.rtt ? `Ping ${Math.round(L.rtt)} ms` : '';
    if (this._qrFor !== L.link) {
      this._qrFor = L.link;
      const qr = qrcode(0, 'M');
      qr.addData(L.link);
      qr.make();
      s.querySelector('.qr').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
    }
    const ul = s.querySelector('.players ul');
    ul.innerHTML = L.players
      .map(
        (p) =>
          `<li><i style="background:${esc(p.color)}"></i><b>${esc(p.name)}</b><small>${esc((CHARACTERS[p.driver] || CHARACTERS[4]).name)} · ${esc((CARS[p.car] || CARS[0]).name)}</small>${
            p.id === L.hostId ? '<em class="tag">HOST</em>' : p.ready ? '<em class="tag ok">BEREIT</em>' : '<em class="tag">…</em>'
          }${p.id === L.myId ? '<em class="tag me">DU</em>' : ''}</li>`
      )
      .join('');
    const aiN = Math.min(L.settings.ai, MAX_CARS - L.players.length);
    if (aiN > 0) ul.innerHTML += `<li class="ai"><i></i><b>+ ${aiN} KI-Fahrer</b><small>${AI_LEVELS[L.settings.diff].name}</small></li>`;
    s.querySelector('.pcount').textContent = `${L.players.length}/${MAX_CARS}`;
    const set = (key, v) => s.querySelectorAll(`.seg[data-key="${key}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
    set('lobbyTrack', L.settings.track);
    set('lobbyLaps', L.settings.laps);
    set('lobbyAi', L.settings.ai);
    set('lobbyDiff', L.settings.diff);
    set('lobbyMirror', L.settings.mirror ? 1 : 0);
    const def = TRACK_DEFS.find((d) => d.id === L.settings.track);
    const voting = L.settings.track === 'vote';
    const vote = s.querySelector('.vote');
    vote.classList.toggle('hidden', !voting);
    // Stimmkarten beim ersten Mal bauen: Umriss der Strecke, Name, Punkte in den Farben der Wähler
    const vg = vote.querySelector('.vote-grid');
    if (voting && !vg.children.length) {
      TRACK_DEFS.forEach((td) => {
        const b = document.createElement('button');
        b.className = 'vcard';
        b.dataset.v = td.id;
        b.style.setProperty('--tc', THEME_COLORS[td.theme]);
        b.appendChild(trackThumb(td, 64, 40, THEME_COLORS[td.theme]));
        const t = document.createElement('span');
        t.innerHTML = `<b>${esc(td.name)}</b><span class="dots"></span>`;
        b.appendChild(t);
        vg.appendChild(b);
      });
    }
    if (voting) {
      const mine = L.players.find((p) => p.id === L.myId);
      vote.querySelectorAll('.vcard').forEach((b) => {
        const voters = L.players.filter((p) => p.vote === b.dataset.v);
        b.classList.toggle('on', !!mine && mine.vote === b.dataset.v);
        b.querySelector('.dots').innerHTML = voters.map((p) => `<i style="background:${esc(p.color)}"></i>`).join('');
      });
    }
    s.querySelector('.lobby-info').innerHTML = `Strecke: <b>${voting ? '🎲 Abstimmung' : esc(def ? def.name : '')}${L.settings.mirror ? ' ⇄' : ''}</b><br>Runden: <b>${L.settings.laps}</b> · KI: <b>${aiN}</b> (${AI_LEVELS[L.settings.diff].name})<br><small>${L.racing ? 'Rennen läuft – du fährst im nächsten mit.' : 'Warte auf den Start durch den Host …'}</small>`;
    s.querySelector('.carname').innerHTML = this._carName();
    const me = L.players.find((p) => p.id === L.myId);
    const btn = s.querySelector('.lgo');
    if (isHost) {
      btn.textContent = L.racing ? 'RENNEN LÄUFT …' : L.rolling ? 'STRECKE WIRD GELOST …' : 'RENNEN STARTEN';
      btn.disabled = !!(L.racing || L.rolling);
    } else {
      btn.textContent = me && me.ready ? 'BEREIT ✓' : 'BEREIT?';
      btn.disabled = false;
      btn.classList.toggle('primary', !(me && me.ready));
    }
  }

  // ---------- Ergebnis ----------
  showResults(res, opts) {
    const s = this.screens.results;
    s.querySelector('.rtitle').textContent = opts.timetrial ? 'ZEITFAHREN' : 'ERGEBNIS';
    // Rangliste als Zeilen: Platz, Porträt, Name (+ Auto), Zeit, beste Runde – Sieger gold, eigene Zeile hervorgehoben
    const pics = this.app.portraits;
    const rows = res
      .map((r, i) => {
        const time = r.finished ? fmtTime(r.time) : '–';
        const pic = pics && r.driver != null ? `<img class="rp" src="${pics[r.driver % pics.length].url}" alt="">` : `<i class="rp" style="background:${esc(r.color)}"></i>`;
        const cls = [r.id === opts.localId ? 'me' : '', !opts.timetrial && r.rank === 1 ? 'gold' : ''].join(' ');
        return `<div class="rrow ${cls}" style="--rc:${esc(r.color)};animation-delay:${(i * 0.07).toFixed(2)}s"><b class="rk">${opts.timetrial ? '⏱' : r.rank}</b>${pic}<span class="rn">${esc(r.name)}<small>${esc((CARS[r.car] || CARS[0]).name)}</small></span><span class="rt">${time}</span><span class="rb"><small>BESTE</small>${fmtTime(r.best)}</span></div>`;
      })
      .join('');
    s.querySelector('.rtable').innerHTML = `<div class="rlist">${rows}</div>`;
    s.querySelector('.again').classList.toggle('hidden', !opts.canRestart);
    s.querySelector('.lobby').classList.toggle('hidden', !opts.online);
    // Grand Prix: Gesamtwertung, nach dem letzten Rennen Pokal
    const gp = opts.gp;
    const gpt = s.querySelector('.gptable');
    const trophy = s.querySelector('.trophy');
    const next = s.querySelector('.gpnext');
    if (gp) {
      s.querySelector('.rtitle').textContent = gp.final ? 'GRAND PRIX – ENDWERTUNG' : `GRAND PRIX · RENNEN ${gp.idx + 1}/${gp.total}`;
      gpt.innerHTML = `<h3>GESAMTWERTUNG</h3><table><tbody>${gp.standings
        .map((r, i) => `<tr class="${r.id === opts.localId ? 'me' : ''}"><td class="rk">${i + 1}.</td><td><i style="background:${esc(r.color)}"></i>${esc(r.name)}</td><td class="pts">${r.pts}</td><td class="got">+${r.got}</td></tr>`)
        .join('')}</tbody></table>`;
      next.classList.remove('hidden');
      next.textContent = gp.final ? 'FERTIG' : `NÄCHSTES RENNEN: ${gp.next.toUpperCase()}`;
      s.querySelector('.menu').classList.toggle('hidden', gp.final);
      if (gp.final) {
        const medal = ['🏆', '🥈', '🥉'][gp.place - 1];
        const stars = gp.stars || 0;
        const starRow = medal ? `<span class="gstars">${[0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${0.4 + i * 0.25}s">★</i>`).join('')}</span>` : '';
        trophy.innerHTML = medal ? `<span class="cup">${medal}</span><b>${gp.place === 1 ? 'GRAND-PRIX-CHAMPION!' : `${gp.place}. PLATZ IN DER MEISTERSCHAFT`}</b>${starRow}` : `<b>${gp.place}. Platz in der Meisterschaft</b>`;
        trophy.className = 'trophy p' + gp.place;
      } else trophy.className = 'trophy hidden';
    } else {
      gpt.innerHTML = '';
      next.classList.add('hidden');
      s.querySelector('.menu').classList.remove('hidden');
      trophy.className = 'trophy hidden';
    }
    this._resultMedal(s.querySelector('.medalbox'), opts.medal);
    this._resultDaily(s.querySelector('.dailybox'), opts.daily);
    this._resultXP(s.querySelector('.xpbox'), opts.xp);
    const mb = s.querySelector('.res-missions');
    mb.classList.toggle('hidden', !opts.xp);
    if (opts.xp) this._renderMissions(mb, opts.missions || []);
    // neu freigeschaltete Erfolge
    const fresh = opts.fresh || [];
    s.querySelector('.fresh').innerHTML = fresh
      .map((a) => {
        const paint = a.paint ? PAINTS.find((x) => x.id === a.paint) : null;
        return `<div class="fresh-item"><span>★ ERFOLG</span><b>${esc(a.name)}</b>${paint ? `<em><i class="sw sw-${paint.id}"></i> ${esc(paint.name)}-Lack freigeschaltet – in der Garage wählen!</em>` : ''}</div>`;
      })
      .join('');
    this.show('results');
    if (fresh.length) this.app.audio.play('best');
  }

  // Zeitfahren: erreichte Medaille + Abstand zur nächsten
  _resultMedal(box, M) {
    box.classList.toggle('hidden', !M);
    if (!M) return;
    const fresh = M.idx >= 0 && (M.prev < 0 || M.idx < M.prev);
    const nextIdx = M.idx < 0 ? MEDALS.length - 1 : M.idx - 1;
    const next = MEDALS[nextIdx];
    const need = next && M.best ? M.best - M.times[next.id] : null;
    const head =
      M.idx >= 0
        ? `<div class="mbig">${medalIcon(M.idx, 'big')}<b>${MEDALS[M.idx].name.toUpperCase()}-MEDAILLE${fresh ? ' <em>NEU!</em>' : ''}</b></div>`
        : `<div class="mbig"><b>Noch keine Medaille</b></div>`;
    const tail = next
      ? `<small>Nächste: ${medalIcon(nextIdx)} ${next.name} unter ${M.times[next.id].toFixed(2)} s${need != null && need > 0 ? ` – dir fehlen <b>${need.toFixed(2)} s</b>` : ''}</small>`
      : '<small>Alle Medaillen geholt – du bist schneller als die Echos!</small>';
    // Medaille oben = Strecken-Bestzeit; dazu, was diese Fahrt allein gebracht hat
    const run =
      M.lap != null
        ? `<small>Diese Fahrt: beste Runde ${M.lap.toFixed(2)} s · ${M.run >= 0 ? `${medalIcon(M.run)} ${MEDALS[M.run].name}` : 'keine Medaille'}</small>`
        : '';
    box.innerHTML = head + tail + run;
    box.classList.toggle('fresh-medal', fresh);
    if (fresh) setTimeout(() => this.app.audio.play('medal'), 350);
  }

  _resultDaily(box, D) {
    box.classList.toggle('hidden', !D);
    if (!D) return;
    box.classList.toggle('ok', !!D.done);
    if (D.done) box.innerHTML = `<b>✓ TAGES-CHALLENGE GESCHAFFT!</b><small>🔥 Serie: ${D.done.streak} ${D.done.streak === 1 ? 'Tag' : 'Tage'} · morgen wartet die nächste</small>`;
    else if (D.ch.key !== todayKey()) box.innerHTML = `<b>Diese Tages-Challenge ist abgelaufen</b><small>Es ist ein neuer Tag – NOCHMAL startet die heutige Aufgabe.</small>`;
    else if (dailyDoneToday()) box.innerHTML = `<b>Tages-Challenge heute schon geschafft</b><small>Morgen gibt es eine neue Aufgabe.</small>`;
    else box.innerHTML = `<b>✗ Tages-Challenge noch nicht geschafft</b><small>${esc(D.ch.text)} – mit NOCHMAL direkt neu versuchen!</small>`;
  }

  // XP-Abrechnung mit laufender Leiste (füllt sich, bei Level-Up Blitz + neuer Lack)
  _resultXP(box, X) {
    clearTimeout(this._xpT);
    box.classList.toggle('hidden', !X);
    if (!X) return;
    box.innerHTML = `<div class="xp-items">${X.items.map(([l, v]) => `<span>${esc(l)} <b>+${v}</b></span>`).join('')}</div>
      <div class="xp-line"><b class="lv">LV ${X.before.level}</b><div class="xpbar"><i></i></div><span class="xpsum">+${X.total} XP</span></div>
      <small class="xp-next">${X.after.max ? 'Höchstes Level erreicht!' : `noch ${X.after.need - X.after.cur} XP bis Level ${X.after.level + 1}${nextRewardHint(X.after.level)}`}</small>
      <div class="lvup hidden"></div>`;
    const bar = box.querySelector('.xpbar i');
    const lv = box.querySelector('.lv');
    const pct = (L) => (L.max ? 100 : (L.cur / L.need) * 100);
    const set = (w, anim) => {
      bar.style.transition = anim ? 'width 0.75s cubic-bezier(.3,.7,.3,1)' : 'none';
      bar.style.width = w + '%';
    };
    set(pct(X.before), false);
    const steps = [];
    for (const l of X.levelUps) steps.push(l);
    let i = 0;
    const tickSound = () => this.app.audio.play('xp', Math.random());
    const run = () => {
      if (i < steps.length) {
        set(100, true);
        tickSound();
        this._xpT = setTimeout(() => {
          lv.textContent = 'LV ' + steps[i];
          lv.classList.remove('flash');
          void lv.offsetWidth;
          lv.classList.add('flash');
          this.app.audio.play('levelup');
          set(0, false);
          i++;
          this._xpT = setTimeout(run, 120);
        }, 800);
      } else {
        set(pct(X.after), true);
        if (X.total > 0) tickSound();
        if (X.levelUps.length) {
          const up = box.querySelector('.lvup');
          up.classList.remove('hidden');
          up.innerHTML = `<b>LEVEL ${X.after.level}!</b>${X.paints
            .map((p) => `<em><i class="sw sw-${p.id}"></i> Neuer Lack: ${esc(p.name)} – in der Garage wählen!</em>`)
            .join('')}${(X.flames || []).map((f) => `<em><i class="fl fl-${f.id}"></i> Neue Boost-Flamme: ${esc(f.name)} – in der Garage wählen!</em>`).join('')}`;
        }
      }
    };
    this._xpT = setTimeout(run, 500);
  }

  message(title, text, done, okLabel = 'OK') {
    const s = this.screens.message;
    s.querySelector('.mtitle').textContent = title;
    s.querySelector('.mtext').textContent = text;
    s.querySelector('.mok').textContent = okLabel;
    s.querySelector('.mok').classList.toggle('hidden', okLabel == null);
    this.msgDone = done;
    this.show('message');
  }

  setPauseMode(online, gp = false) {
    const s = this.screens.pause;
    s.querySelector('.ptitle').textContent = online ? 'MENÜ – Rennen läuft weiter' : gp ? 'PAUSE – GRAND PRIX' : 'PAUSE';
    s.querySelector('.restart').classList.toggle('hidden', online || gp);
    s.querySelector('.quit').textContent = gp ? 'GRAND PRIX ABBRECHEN' : 'RENNEN VERLASSEN';
  }
}
