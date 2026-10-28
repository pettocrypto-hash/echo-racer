// HUD während des Rennens: Position, Runde, Zeiten, Tempo, Hack-Leiste, Mini-Karte, Touch-Steuerung.

import { HACKS, DRIFT_COLORS } from '../config.js';
import { fmtTime, clamp } from '../util.js';
import { settings } from '../platform.js';
import { H_BARRIER, H_RAMP, H_MIRROR, H_SQUEEZE, H_SHOCK, H_CLONE, SHOCK_R, SHOCK_T } from '../game/hacks.js';

const E = {};
const Q = {};
const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const HTML = `
<div class="hud-tl">
  <div class="pos"><b class="pos-n">1</b><span class="pos-of">/6</span></div>
  <div class="lap">RUNDE <b class="lap-n">1</b><span class="lap-of">/3</span></div>
  <div class="ltime">0:00.000</div>
  <div class="lbest">BESTE <span>-:--.---</span></div>
  <div class="lmedal"></div>
  <div class="ldaily"></div>
  <div class="style"><div class="st-top"><b class="st-mult">×1</b><span class="st-pts">0</span></div><i class="st-bar"><u></u></i><small class="st-label"></small></div>
  <div class="st-bank"></div>
</div>
<button class="hud-pause" aria-label="Pause"><span></span><span></span></button>
<button class="btn-look" aria-label="Zurückschauen (halten)">◀◀</button>
<canvas class="minimap"></canvas>
<div class="hud-center"><div class="big"></div><div class="big-sub"></div></div>
<div class="introcard hidden"><div class="ic-medal"><span></span></div><div class="ic-txt"><small></small><b></b></div></div>
<div class="introbadge hidden"></div>
<div class="hud-warn"></div>
<div class="toasts"></div>
<div class="speed"><b>0</b><small>KM/H</small><div class="drift-ind"><i></i><i></i><i></i></div></div>
<div class="kb-hint">← → lenken · LEERTASTE driften · E hacken · Q / 1–7 Hack wählen · ↓ bremsen · B zurückschauen · ESC Pause</div>
<div class="controls">
  <div class="wheel-zone"><div class="wheel"><div class="wheel-rim"></div><div class="wheel-spoke"></div><div class="wheel-dot"></div></div><div class="zone-hint">ZIEHEN ZUM LENKEN</div></div>
  <button class="btn btn-brake-left">BREMSE</button>
  <div class="right-pad">
    <div class="hack-wrap">
      <div class="abil"></div>
      <div class="hackbar"><i><b></b></i><i><b></b></i><i><b></b></i></div>
      <div class="hack-row">
        <button class="btn btn-cycle" aria-label="Hack wechseln">⇆</button>
        <button class="btn btn-hack"><span class="hack-ico"></span><span class="hack-name">BARRIERE</span><span class="hack-cost"></span><span class="hack-target"></span></button>
      </div>
    </div>
    <div class="drive-row">
      <button class="btn btn-brake">BREMSE</button>
      <button class="btn btn-drift">DRIFT</button>
    </div>
  </div>
</div>
<div class="desk-hack">
  <div class="abil"></div>
  <div class="hackbar"><i><b></b></i><i><b></b></i><i><b></b></i></div>
  <div class="desk-hack-name"></div>
</div>
`;

export class HUD {
  constructor(app) {
    this.app = app;
    const el = document.createElement('div');
    el.id = 'hud';
    el.className = 'hidden';
    el.innerHTML = HTML;
    document.getElementById('ui').appendChild(el);
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.posN = q('.pos-n');
    this.posOf = q('.pos-of');
    this.lapN = q('.lap-n');
    this.lapOf = q('.lap-of');
    this.lapEl = q('.lap');
    this.ltime = q('.ltime');
    this.lbest = q('.lbest span');
    this.lbestBox = q('.lbest');
    this.posBox = q('.pos');
    this.lmedal = q('.lmedal');
    this.ldaily = q('.ldaily');
    this.styleBox = q('.style');
    this.stMult = q('.st-mult');
    this.stPts = q('.st-pts');
    this.stBar = q('.st-bar u');
    this.stLabel = q('.st-label');
    this.stBank = q('.st-bank');
    this.big = q('.big');
    this.bigSub = q('.big-sub');
    this.warn = q('.hud-warn');
    this.toasts = q('.toasts');
    this.speedEl = q('.speed b');
    this.driftInd = [...el.querySelectorAll('.drift-ind i')];
    this.hackSegs = [...el.querySelectorAll('.controls .hackbar i b'), ...[]];
    this.deskSegs = [...el.querySelectorAll('.desk-hack .hackbar i b')];
    this.hackBtn = q('.btn-hack');
    this.hackIco = q('.hack-ico');
    this.hackName = q('.hack-name');
    this.hackCost = q('.hack-cost');
    this.hackTarget = q('.hack-target');
    this.deskHackName = q('.desk-hack-name');
    // Fähigkeiten-Leiste: alle Hacks mit Symbol, Kosten und Taste
    this.abil = [];
    for (const box of el.querySelectorAll('.abil')) {
      box.innerHTML = HACKS.map((H, i) => `<i data-i="${i}" title="${H.name}"><span>${H.icon}</span><small>${i + 1}</small><u>${'•'.repeat(H.cost)}</u></i>`).join('');
      this.abil.push([...box.children]);
      box.addEventListener('pointerdown', (e) => {
        const it = e.target.closest('i[data-i]');
        if (!it) return;
        e.preventDefault();
        this.app.selectHack(Number(it.dataset.i));
      });
    }
    this.minimap = q('.minimap');
    this.mctx = this.minimap.getContext('2d');
    this.wheel = q('.wheel');
    this.bigTimer = null;
    this.warnTimer = null;
    this.mapCache = null;
    this.last = {};
    this._bindControls();
    q('.hud-pause').addEventListener('click', () => this.app.togglePause());
  }

  _bindControls() {
    const input = this.app.input;
    const hold = (sel, key) => {
      for (const b of this.el.querySelectorAll(sel)) {
        const on = (e) => {
          e.preventDefault();
          try {
            b.setPointerCapture(e.pointerId);
          } catch {
            /* egal */
          }
          input.touch[key] = true;
          b.classList.add('on');
          this.app.audio.init();
        };
        const off = () => {
          input.touch[key] = false;
          b.classList.remove('on');
        };
        b.addEventListener('pointerdown', on);
        b.addEventListener('pointerup', off);
        b.addEventListener('pointercancel', off);
        b.addEventListener('lostpointercapture', off);
      }
    };
    hold('.btn-drift', 'drift');
    hold('.btn-brake', 'brake');
    hold('.btn-brake-left', 'brake');
    hold('.btn-look', 'back');
    const tap = (sel, fn) => {
      const b = this.el.querySelector(sel);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.classList.add('on');
        fn();
      });
      const off = () => b.classList.remove('on');
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    };
    tap('.btn-hack', () => input.press('hack'));
    tap('.btn-cycle', () => input.press('cycle'));

    // Touch-Lenkrad: horizontal ziehen (relativ zum Aufsetzpunkt)
    const zone = this.el.querySelector('.wheel-zone');
    let pid = null;
    let x0 = 0;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (pid != null) return;
      pid = e.pointerId;
      x0 = e.clientX;
      try {
        zone.setPointerCapture(pid);
      } catch {
        /* egal */
      }
      zone.classList.add('on');
      this.app.audio.init();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const range = 75 / settings.sens;
      let v = (e.clientX - x0) / range;
      // Aufsetzpunkt wandert mit, wenn man über den Anschlag hinauszieht
      if (v > 1.15) x0 = e.clientX - range * 1.15;
      if (v < -1.15) x0 = e.clientX + range * 1.15;
      v = clamp(v, -1, 1);
      input.touch.steer = Math.abs(v) < 0.06 ? 0 : v;
      this.wheel.style.transform = `rotate(${(v * 110).toFixed(1)}deg)`;
    });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      input.touch.steer = 0;
      zone.classList.remove('on');
      this.wheel.style.transform = '';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  show(mode) {
    this.el.classList.remove('hidden');
    this.mode = mode;
    this.mapCache = null;
    this.refreshControls();
    this.el.classList.toggle('tt', mode === 'timetrial');
    this.toasts.innerHTML = '';
    // Zwischenspeicher leeren: sonst vergleicht der Platz-Blitz mit dem Ende des letzten Rennens
    this.last = {};
    this.posBox.classList.remove('up', 'down');
    this.styleBox.classList.remove('on');
    this.stBank.className = 'st-bank';
    this.big.textContent = '';
    this.bigSub.textContent = '';
    this.warn.className = 'hud-warn';
  }

  refreshControls() {
    const c = settings.control;
    this.el.classList.toggle('ctl-touch', c === 'touch');
    this.el.classList.toggle('ctl-tilt', c === 'tilt');
    this.el.classList.toggle('ctl-keys', c === 'keys');
  }

  hide() {
    this.el.classList.add('hidden');
    this.app.input.touch.back = false;
    this.app.input.touch.steer = 0;
    this.app.input.touch.drift = false;
    this.app.input.touch.brake = false;
  }

  // tone: Countdown im Logo-Stil ('cd-r' | 'cd-b' | 'cd-y' | 'cd-g')
  bigMessage(text, ms = 1200, sub = '', tone = '') {
    this.big.textContent = text;
    this.bigSub.textContent = sub;
    this.bigSub.style.color = '';
    this.big.classList.remove('pop', 'final', 'toy', 'cd-r', 'cd-b', 'cd-y', 'cd-g');
    void this.big.offsetWidth;
    this.big.classList.add('pop');
    if (tone) this.big.classList.add('toy', tone);
    clearTimeout(this.bigTimer);
    this.bigTimer = setTimeout(() => {
      this.big.textContent = '';
      this.bigSub.textContent = '';
    }, ms);
  }

  lapBanner(lap, laps, time, best, prev) {
    const last = lap === laps;
    // Zeitvergleich zur bisher besten Runde (grün = schneller, rot = langsamer)
    let delta = '';
    if (prev != null) {
      const d = time - prev;
      delta = `  ·  ${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;
    }
    this.bigMessage(last ? 'LETZTE RUNDE' : `RUNDE ${lap}/${laps}`, 1500, `${fmtTime(time)}${delta}${best && prev != null ? '  ·  BESTZEIT' : ''}`);
    this.bigSub.style.color = prev == null ? '' : time < prev ? '#5dff8a' : '#ff7a6a';
    if (last) this.big.classList.add('final');
  }

  // Stil-Kette: Multiplikator, offene Punkte, Restzeit (0…1) und letzter Grund
  styleChain(mult, pts, frac, label) {
    const on = pts > 0;
    if (this.last.stOn !== on) {
      this.last.stOn = on;
      this.styleBox.classList.toggle('on', on);
    }
    if (!on) return;
    const m = '×' + (mult % 1 ? mult.toFixed(1) : mult);
    if (this.last.stMult !== m) {
      this.last.stMult = m;
      this.stMult.textContent = m;
      this.stMult.classList.remove('pop');
      void this.stMult.offsetWidth;
      this.stMult.classList.add('pop');
      this.styleBox.style.setProperty('--sc', mult >= 3 ? '#d36bff' : mult >= 2 ? '#ff9a2e' : mult >= 1.5 ? '#3cc8ff' : '#ffffff');
    }
    if (this.last.stPts !== pts) {
      this.last.stPts = pts;
      this.stPts.textContent = pts.toLocaleString('de-DE');
    }
    if (this.last.stLabel !== label) {
      this.last.stLabel = label;
      this.stLabel.textContent = label;
    }
    this.stBar.style.transform = `scaleX(${clamp(frac, 0, 1).toFixed(3)})`;
  }

  // Kette beendet: Punkte fliegen ins Konto (bei Treffer nur die Hälfte)
  styleBank(pts, broken) {
    this.stBank.textContent = broken ? `KETTE GERISSEN +${pts.toLocaleString('de-DE')}` : `+${pts.toLocaleString('de-DE')} STIL`;
    this.stBank.className = 'st-bank';
    void this.stBank.offsetWidth;
    this.stBank.className = 'st-bank show' + (broken ? ' broken' : '');
  }

  // Strecken-Namenskarte (unten links) + Modus-Abzeichen (unten rechts); null blendet aus
  introCard(info) {
    const card = this.el.querySelector('.introcard');
    const badge = this.el.querySelector('.introbadge');
    this.el.classList.toggle('intro', !!info);
    if (!info) {
      card.classList.add('hidden');
      badge.classList.add('hidden');
      return;
    }
    card.querySelector('.ic-medal').style.setProperty('--mc', info.color);
    card.querySelector('.ic-medal span').textContent = info.icon;
    card.querySelector('small').textContent = info.world;
    card.querySelector('b').textContent = info.name;
    badge.textContent = info.badge;
    for (const el of [card, badge]) {
      el.classList.remove('hidden', 'show');
      void el.offsetWidth;
      el.classList.add('show');
    }
  }

  warning(text, color, ms = 1500) {
    this.warn.textContent = text;
    this.warn.style.setProperty('--wc', color || '#ff3355');
    this.warn.className = 'hud-warn show';
    clearTimeout(this.warnTimer);
    this.warnTimer = setTimeout(() => (this.warn.className = 'hud-warn'), ms);
  }

  toast(text, kind = 'info') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    this.toasts.prepend(d);
    while (this.toasts.children.length > 3) this.toasts.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 1500);
    setTimeout(() => d.remove(), 1900);
  }

  update(d) {
    const L = this.last;
    const set = (k, v, fn) => {
      if (L[k] !== v) {
        L[k] = v;
        fn(v);
      }
    };
    if (d.mode === 'timetrial') {
      set('pos', 'tt', () => {
        this.posBox.dataset.r = 'x';
        this.posN.textContent = '⏱';
        this.posOf.textContent = '';
      });
    } else {
      const prev = L.rank;
      set('pos', d.rank + '/' + d.total, () => {
        this.posN.textContent = d.rank;
        // Podestplätze in Gold, Silber, Bronze (Verlauf per CSS)
        this.posBox.dataset.r = d.rank <= 3 ? d.rank : 'x';
        this.posOf.textContent = '/' + d.total;
        // Platz gewonnen/verloren: kurzer Farbblitz
        if (prev != null && prev !== d.rank) {
          this.posBox.classList.remove('up', 'down');
          void this.posBox.offsetWidth;
          this.posBox.classList.add(d.rank < prev ? 'up' : 'down');
        }
      });
      L.rank = d.rank;
    }
    set('lap', d.lap + '/' + d.laps + (d.finished ? 'f' : ''), () => {
      this.lapN.textContent = d.finished ? 'ZIEL' : d.lap;
      this.lapOf.textContent = d.finished ? '' : '/' + d.laps;
      // letzte Runde: Pille wird gold
      this.lapEl.classList.toggle('final', !d.finished && d.lap === d.laps && d.laps > 1);
    });
    this.ltime.textContent = d.lapTime != null ? fmtTime(d.lapTime) : d.finished ? '' : '0:00.000';
    const bestText = d.mode === 'timetrial' && d.record != null ? (d.best != null ? fmtTime(d.best) : '-:--.---') + ' · REKORD ' + fmtTime(d.record) : fmtTime(d.best);
    set('best', bestText, (v) => (this.lbest.textContent = v));
    set('daily', d.daily || '', (v) => (this.ldaily.textContent = v));
    const md = d.medal ? d.medal.text : '';
    set('medal', md, (v) => {
      this.lmedal.textContent = v ? 'ZIEL: ' + v : '';
      this.lmedal.style.color = d.medal ? d.medal.color : '';
    });
    set('spd', Math.round(d.speed), (v) => (this.speedEl.textContent = v));
    set('drift', d.driftLvl, (v) => {
      this.driftInd.forEach((el, i) => {
        el.style.background = v > i ? DRIFT_COLORS[v] : '';
        el.classList.toggle('on', v > i);
      });
    });
    set('boost', d.boost, (v) => this.el.classList.toggle('boosting', v));
    set('wrong', d.wrong, (v) => {
      if (v) {
        this.warn.textContent = '⟲ FALSCHE RICHTUNG';
        this.warn.style.setProperty('--wc', '#ff3355');
        this.warn.className = 'hud-warn show';
      } else if (this.warn.textContent.startsWith('⟲')) this.warn.className = 'hud-warn';
    });
    // Hack-Leiste
    const hk = Math.round(d.hack * 50) / 50;
    set('target', d.target, (v) => (this.hackTarget.textContent = v ? '→ ' + v : ''));
    set('hack', hk + ':' + d.hackType + ':' + d.hackEnabled + ':' + d.target, () => {
      const H = HACKS[d.hackType];
      for (const segs of [this.hackSegs, this.deskSegs]) {
        segs.forEach((b, i) => {
          const f = clamp(d.hack - i, 0, 1);
          b.style.transform = `scaleX(${f})`;
          b.parentElement.classList.toggle('full', f >= 1);
        });
      }
      const ok = d.hackEnabled && d.hack >= H.cost - 1e-6;
      this.hackBtn.classList.toggle('ready', ok);
      this.hackIco.textContent = H.icon;
      this.hackName.textContent = H.short;
      this.hackCost.textContent = '●'.repeat(H.cost);
      const tgt = d.target ? ` <small>→ ${escHtml(d.target)}</small>` : '';
      this.deskHackName.innerHTML = `<b>${H.icon} ${H.short}</b> <span>${'●'.repeat(H.cost)}</span>${tgt} ${ok ? '<em>BEREIT – E</em>' : ''}`;
      this.el.classList.toggle('hack-ready', ok);
      for (const row of this.abil) {
        row.forEach((it, i) => {
          it.classList.toggle('sel', i === d.hackType);
          it.classList.toggle('ok', d.hackEnabled && d.hack >= HACKS[i].cost - 1e-6);
        });
      }
    });
  }

  // --- Mini-Karte mit Autos, Echos und Hacks ---
  drawMinimap(session) {
    const cv = this.minimap;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (!W || !H) return;
    const tr = session.track;
    if (!this.mapCache || this.mapCache.track !== tr || this.mapCache.w !== W || this.mapCache.h !== H) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      const b = tr.bounds;
      const pad = 10;
      const sc = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxZ - b.minZ));
      const ox = pad + ((W - pad * 2) - (b.maxX - b.minX) * sc) / 2;
      const oz = pad + ((H - pad * 2) - (b.maxZ - b.minZ) * sc) / 2;
      // Karte gespiegelt (x nach links), damit sie zur Fahrtrichtung passt
      const X = (x) => W - (ox + (x - b.minX) * sc);
      const Y = (z) => H - (oz + (z - b.minZ) * sc);
      const bg = document.createElement('canvas');
      bg.width = cv.width;
      bg.height = cv.height;
      const g = bg.getContext('2d');
      g.scale(dpr, dpr);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      for (let k = 0; k <= tr.n; k += 3) {
        const i = k % tr.n;
        if (k === 0) g.moveTo(X(tr.px[i]), Y(tr.pz[i]));
        else g.lineTo(X(tr.px[i]), Y(tr.pz[i]));
      }
      g.closePath();
      g.strokeStyle = 'rgba(10,8,25,0.75)';
      g.lineWidth = 9;
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 4;
      g.stroke();
      const s0 = tr.posAt(0, -tr.hw[0], Q);
      const ax = X(s0.x);
      const ay = Y(s0.z);
      const s1 = tr.posAt(0, tr.hw[0], Q);
      g.strokeStyle = '#fff';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(X(s1.x), Y(s1.z));
      g.stroke();
      this.mapCache = { track: tr, w: W, h: H, bg, X, Y, sc };
    }
    const { X, Y, bg } = this.mapCache;
    const g = this.mctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(bg, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sim = session.sim;
    const t = session.renderTime;
    // Hacks
    for (const h of sim.hacks.list) {
      if (t > h.tE) continue;
      let x;
      let z;
      if (h.type === H_BARRIER || h.type === H_RAMP) {
        x = h.x;
        z = h.z;
      } else if (h.type === H_MIRROR) {
        const pad = tr.pads[h.pad];
        if (!pad) continue;
        tr.posAt(pad.s, -pad.d, Q);
        x = Q.x;
        z = Q.z;
      } else if (h.type === H_SQUEEZE) {
        tr.posAt(h.s0 + tr.wrapS(h.s1 - h.s0) / 2, 0, Q);
        x = Q.x;
        z = Q.z;
      } else if (h.type === H_SHOCK) {
        sim.hacks.shockCenter(h, t, Q);
        x = Q.x;
        z = Q.z;
      } else if (h.type === H_CLONE) {
        sim.hacks.clonePos(h, t, Q);
        x = Q.x;
        z = Q.z;
      } else continue;
      const px = X(x);
      const py = Y(z);
      g.strokeStyle = h.color;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(px - 4, py - 4);
      g.lineTo(px + 4, py + 4);
      g.moveTo(px + 4, py - 4);
      g.lineTo(px - 4, py + 4);
      g.stroke();
    }
    // Echos
    for (const e of sim.echoes) {
      if (t < e.t0) continue;
      e.sample(t, E);
      g.fillStyle = e.color;
      g.globalAlpha = e.kind === 'record' ? 0.8 : 0.55;
      g.beginPath();
      g.arc(X(E.x), Y(E.z), 3, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = e.color;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(X(E.x), Y(E.z), 4.6, 0, Math.PI * 2);
      g.stroke();
    }
    // Autos als runde Porträt-Köpfe (Ring in Fahrerfarbe); hintere zuerst, eigenes zuletzt und größer mit Goldring
    const me = session.localId;
    const pics = this.app.portraits;
    const R = Math.max(7, Math.min(11, W / 17));
    const head = (c, r, ring, lw) => {
      const x = X(c.st.x);
      const y = Y(c.st.z);
      g.save();
      g.globalAlpha = c.ghost ? 0.4 : 1;
      g.beginPath();
      g.arc(x, y, r + lw, 0, Math.PI * 2);
      g.fillStyle = 'rgba(10,8,25,0.85)';
      g.fill();
      g.beginPath();
      g.arc(x, y, r + lw * 0.55, 0, Math.PI * 2);
      g.fillStyle = ring;
      g.fill();
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = '#f2f0fa';
      g.fill();
      const p = pics && pics[(c.driver ?? 0) % pics.length];
      if (p) {
        g.clip();
        g.drawImage(p.canvas, x - r * 1.32, y - r * 1.22, r * 2.64, r * 2.64);
      }
      g.restore();
    };
    const order = sim.ranked.slice().reverse();
    for (const c of order) if (c.id !== me) head(c, R * 0.82, c.color, 2.2);
    const mc = me ? sim.byId.get(me) : null;
    if (mc) {
      head(mc, R, '#ffd23d', 3);
      // kleiner Pfeil in Fahrtrichtung am Kopf (Karte ist in x gespiegelt)
      const x = X(mc.st.x);
      const y = Y(mc.st.z);
      const a = Math.atan2(-Math.sin(mc.st.h), -Math.cos(mc.st.h));
      g.save();
      g.translate(x, y);
      g.rotate(-a + Math.PI);
      g.fillStyle = '#ffd23d';
      g.strokeStyle = 'rgba(10,8,25,0.9)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(0, -R - 7.5);
      g.lineTo(4.5, -R - 1.5);
      g.lineTo(-4.5, -R - 1.5);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }
}
