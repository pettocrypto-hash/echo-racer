// Eingabe: Tastatur, Gamepad, Touch-Lenkrad und Neigungssensor -> ein gemeinsamer Steuerzustand.

import { clamp } from '../util.js';
import { settings } from '../platform.js';

const KEYMAP = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  drift: ['Space', 'ShiftLeft', 'ShiftRight', 'KeyJ'],
};
const EDGE_KEYS = {
  hack: ['KeyE', 'Enter', 'KeyK'],
  cycle: ['KeyQ', 'Tab', 'KeyL'],
  pause: ['Escape', 'KeyP'],
  reset: ['KeyR'],
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.state = { steer: 0, throttle: 0, brake: 0, drift: 0 };
    this.edges = { hack: false, cycle: false, pause: false, reset: false, sel: null };
    this.touch = { steer: 0, brake: false, drift: false, back: false };
    this.tilt = { raw: 0, filtered: 0, available: false, listening: false, lastEvent: 0 };
    this.kbSteer = 0;
    this.padPrev = [];
    this.device = settings.control === 'keys' ? 'keyboard' : 'touch';
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      this.device = 'keyboard';
      if (!e.repeat) {
        for (const k in EDGE_KEYS) if (EDGE_KEYS[k].includes(e.code)) this.edges[k] = true;
        // Ziffern 1–7: Hack direkt wählen
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (m) this.edges.sel = Number(m[1]) - 1;
      }
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.brake = false;
      this.touch.drift = false;
      this.touch.steer = 0;
    });
    this._onOrient = (e) => this._orientation(e);
  }

  key(name) {
    return KEYMAP[name].some((k) => this.keys.has(k));
  }

  press(name) {
    this.edges[name] = true;
  }

  // Rückblick (gehalten): B/C, am Gamepad rechter Stick gedrückt oder nach hinten
  lookBack() {
    if (!this.enabled) return false;
    if (this.keys.has('KeyB') || this.keys.has('KeyC') || this.touch.back) return true;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      if ((gp.buttons[11] && gp.buttons[11].pressed) || (gp.axes[3] || 0) > 0.7) return true;
    }
    return false;
  }

  consumeEdges() {
    const e = { ...this.edges };
    this.edges.hack = this.edges.cycle = this.edges.pause = this.edges.reset = false;
    this.edges.sel = null;
    return e;
  }

  // --- Neigungssteuerung ---
  async enableTilt() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return false;
      }
    } catch {
      return false;
    }
    if (!this.tilt.listening) {
      window.addEventListener('deviceorientation', this._onOrient);
      this.tilt.listening = true;
    }
    return true;
  }

  _orientation(e) {
    if (e.beta == null || e.gamma == null) return;
    const b = (e.beta * Math.PI) / 180;
    const g = (e.gamma * Math.PI) / 180;
    let angle = 0;
    if (screen.orientation && typeof screen.orientation.angle === 'number') angle = screen.orientation.angle;
    else if (typeof window.orientation === 'number') angle = window.orientation;
    angle = ((angle % 360) + 360) % 360;
    // Richtung "oben" in Gerätekoordinaten, projiziert auf die Bildschirmebene
    const ux = -Math.cos(b) * Math.sin(g);
    const uy = Math.sin(b);
    let sx;
    let sy;
    if (angle === 90) {
      sx = -uy;
      sy = ux;
    } else if (angle === 270) {
      sx = uy;
      sy = -ux;
    } else if (angle === 180) {
      sx = -ux;
      sy = -uy;
    } else {
      sx = ux;
      sy = uy;
    }
    const phi = (Math.atan2(-sx, sy) * 180) / Math.PI;
    this.tilt.raw = phi;
    this.tilt.filtered += (phi - this.tilt.filtered) * 0.45;
    this.tilt.available = true;
    this.tilt.lastEvent = performance.now();
  }

  calibrateTilt() {
    settings.tiltCal = this.tilt.filtered;
    return settings.tiltCal;
  }

  tiltSteer() {
    let d = this.tilt.filtered - settings.tiltCal;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const range = 24 / settings.sens;
    let v = d / range;
    if (Math.abs(v) < 0.05) v = 0;
    else v = (v - Math.sign(v) * 0.05) / 0.95;
    if (settings.tiltInvert) v = -v;
    return clamp(v, -1, 1);
  }

  // --- Abfrage pro Simulationsschritt ---
  poll(dt) {
    const s = this.state;
    let steer = 0;
    let throttle = settings.autoGas ? 1 : 0;
    let brake = 0;
    let drift = 0;

    // Tastatur
    const kl = this.key('left');
    const kr = this.key('right');
    const target = (kr ? 1 : 0) - (kl ? 1 : 0);
    if (target !== 0) {
      const rate = Math.sign(target) !== Math.sign(this.kbSteer) ? 9 : 5;
      this.kbSteer = clamp(this.kbSteer + Math.sign(target - this.kbSteer) * rate * dt, -1, 1);
      if (Math.abs(target - this.kbSteer) < rate * dt) this.kbSteer = target;
    } else {
      const dec = 10 * dt;
      this.kbSteer = Math.abs(this.kbSteer) < dec ? 0 : this.kbSteer - Math.sign(this.kbSteer) * dec;
    }
    steer = this.kbSteer;
    if (this.key('up')) throttle = 1;
    if (this.key('down')) brake = 1;
    if (this.key('drift')) drift = 1;

    // Gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] || 0;
      const btn = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
      const pressed = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      if (Math.abs(ax) > 0.12) {
        steer = Math.sign(ax) * Math.pow((Math.abs(ax) - 0.12) / 0.88, 1.3);
        this.device = 'gamepad';
      }
      if (btn(7) > 0.1) throttle = Math.max(throttle, btn(7));
      if (btn(6) > 0.3 || pressed(1)) brake = 1;
      if (pressed(0) || pressed(5)) drift = 1;
      const edge = (i, name) => {
        const p = pressed(i);
        if (p && !this.padPrev[i]) {
          this.edges[name] = true;
          this.device = 'gamepad';
        }
        this.padPrev[i] = p;
      };
      edge(2, 'hack');
      edge(3, 'cycle');
      edge(4, 'cycle');
      edge(9, 'pause');
      edge(8, 'reset');
      break;
    }

    // Touch / Neigung
    if (settings.control === 'tilt' && this.tilt.available) {
      const ts = this.tiltSteer();
      if (Math.abs(ts) > Math.abs(steer)) steer = ts;
    } else if (Math.abs(this.touch.steer) > Math.abs(steer)) {
      steer = this.touch.steer;
    }
    if (this.touch.brake) brake = 1;
    if (this.touch.drift) drift = 1;

    s.steer = clamp(steer, -1, 1);
    s.throttle = brake ? 0 : throttle;
    s.brake = brake;
    s.drift = drift;
    return s;
  }
}
