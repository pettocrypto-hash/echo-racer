// Prozeduraler Sound mit der Web Audio API: Motor, Drift, Effekte und kurze Musik-Loops (ohne Dateien).

import { settings } from '../platform.js';

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Musikstile: Tempo, Akkordfolge (MIDI-Grundtöne + Akkordtöne), Klangfarben
const STYLES = [
  { bpm: 122, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: 'sawtooth', lead: 'square', arp: [0, 1, 2, 1, 2, 0, 1, 2], drums: 1 },
  { bpm: 128, chords: [[50, 53, 57], [51, 55, 58], [50, 53, 57], [48, 52, 55]], bass: 'square', lead: 'triangle', arp: [0, 2, 1, 2, 0, 2, 1, 0], drums: 1 },
  { bpm: 118, chords: [[53, 57, 60], [57, 60, 64], [58, 62, 65], [48, 52, 55]], bass: 'triangle', lead: 'sine', arp: [0, 1, 2, 3, 2, 1, 0, 2], drums: 1 },
  { bpm: 134, chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], bass: 'sawtooth', lead: 'sawtooth', arp: [0, 0, 2, 1, 0, 2, 1, 2], drums: 1 },
  { bpm: 96, chords: [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]], bass: 'triangle', lead: 'sine', arp: [0, 2, 1, 3, 2, 1, 3, 2], drums: 0 },
  // 5: Lunapark – Rummel-Orgel: Dur-Kadenz, Hm-ta-ta-Bass, Akkord-Tupfer, helle Melodie
  { bpm: 140, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], bass: 'triangle', lead: 'square', arp: [2, 1, 0, 1, 2, 3, 2, 1], drums: 1, oompah: true },
];

// Figuren-Stimmen: kurze synthetische Laute je Fahrer (ohne Sprache, wie Piep-Melodien) – eigene Tonlage,
// Klangfarbe und Formant (Vokal-Färbung) je Figur. Reihenfolge wie CHARACTERS.
const VOICES = [
  { f: 330, wave: 'square', form: 1900, q: 5, step: true, k: 0.75 }, // Byte: Roboter, harte Tonstufen
  { f: 540, wave: 'sawtooth', form: 2300, q: 7, vib: 6, glide: 0.05 }, // Nyx: Katze, „Mi-au“-Gleiten
  { f: 400, wave: 'sawtooth', form: 1500, q: 3, vib: 30, vibK: 0.06, crackle: true }, // Volt: knisterndes Summen
  { f: 150, wave: 'sawtooth', form: 720, q: 5, vib: 4 }, // Rune: tiefe Ritterstimme
  { f: 640, wave: 'sine', form: 2700, q: 3, vib: 7, echo: true }, // Kiko: hell, mit Weltraum-Hall
  { f: 440, wave: 'triangle', form: 1750, q: 4, vib: 5, glide: 0.04 }, // Juno: Fliegerin, Juchzer
  { f: 290, wave: 'sine', form: 950, q: 3, bubble: true }, // Zed: Hai, blubbernd
  { f: 580, wave: 'triangle', form: 2450, q: 6, vib: 6 }, // Mira: Popstar, melodisch
];
// Tonfolgen: [Halbtöne über dem Grundton, Dauer in s]
const LINES = {
  joy: [[0, 0.08], [7, 0.08], [12, 0.2]],
  happy: [[0, 0.1], [9, 0.22]],
  hit: [[6, 0.06], [-6, 0.24]],
  win: [[0, 0.1], [4, 0.1], [7, 0.1], [12, 0.38]],
  sad: [[3, 0.2], [0, 0.18], [-5, 0.42]],
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.engine = null;
    this.drift = null;
    this.music = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.pendingMusic != null) this.startMusic(this.pendingMusic);
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.musicGain.gain.value = settings.music * 0.5;
    this.sfxGain.gain.value = settings.sfx;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  // --- Motor ---
  startEngine() {
    if (!this.ctx || this.engine) return;
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const o3 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    o3.type = 'sawtooth';
    o3.detune.value = 9;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    o1.connect(f);
    o3.connect(f);
    o2.connect(g2);
    g2.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    o1.start();
    o2.start();
    o3.start();
    // Drift-Quietschen
    const n = this._noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 6;
    const dg = ctx.createGain();
    dg.gain.value = 0;
    n.connect(bp);
    bp.connect(dg);
    dg.connect(this.sfxGain);
    n.start();
    this.engine = { o1, o2, o3, f, g, n, bp, dg };
  }

  stopEngine() {
    if (!this.engine) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0, t, 0.05);
    e.dg.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      try {
        e.o1.stop();
        e.o2.stop();
        e.o3.stop();
        e.n.stop();
      } catch {
        /* schon gestoppt */
      }
    }, 300);
    this.engine = null;
  }

  setEngine(speedRatio, throttle, boost, drifting, driftLvl, air) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    const r = Math.max(0, speedRatio) * 5;
    const gear = Math.min(4, Math.floor(r));
    const rpm = Math.min(1.25, 0.32 + (r - gear) * 0.7 + gear * 0.03) + (air ? 0.2 : 0);
    const freq = 38 + rpm * 120 + (boost ? 18 : 0);
    e.o1.frequency.setTargetAtTime(freq, t, 0.04);
    e.o3.frequency.setTargetAtTime(freq * 1.005, t, 0.04);
    e.o2.frequency.setTargetAtTime(freq * 0.5, t, 0.04);
    e.f.frequency.setTargetAtTime(260 + rpm * 1500 + throttle * 500 + (boost ? 900 : 0), t, 0.05);
    e.g.gain.setTargetAtTime(0.045 + throttle * 0.05 + (boost ? 0.03 : 0), t, 0.08);
    e.dg.gain.setTargetAtTime(drifting ? 0.05 + driftLvl * 0.018 : 0, t, 0.05);
    e.bp.frequency.setTargetAtTime(1800 + driftLvl * 500, t, 0.1);
  }

  // --- Effekte ---
  _env(node, t, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _tone(type, f0, f1, dur, vol, delay = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this._env(g, t, 0.005, vol, dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Ausruf einer Figur (who = Index in CHARACTERS, kind = joy | happy | hit | win | sad); überlagert sich nicht
  voice(who, kind, vol = 1, delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now < (this.voiceUntil || 0)) return;
    const V = VOICES[(((who | 0) % VOICES.length) + VOICES.length) % VOICES.length];
    const line = LINES[kind] || LINES.joy;
    const o = ctx.createOscillator();
    o.type = V.wave;
    // Formant (Vokal) + etwas gedämpfter Grundklang, damit die Stimme nicht dünn klingt
    const form = ctx.createBiquadFilter();
    form.type = 'bandpass';
    form.frequency.value = V.form;
    form.Q.value = V.q;
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = V.form * 1.6;
    const dry = ctx.createGain();
    dry.gain.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    o.connect(form);
    form.connect(g);
    o.connect(body);
    body.connect(dry);
    dry.connect(g);
    g.connect(this.sfxGain);
    const t0 = now + 0.02 + delay;
    let t = t0;
    const peak = 0.2 * vol * (V.k || 1);
    let first = true;
    for (const [semi, dur] of line) {
      const f = V.f * Math.pow(2, semi / 12);
      if (first || V.step) o.frequency.setValueAtTime(f, t);
      else o.frequency.setTargetAtTime(f, t, V.glide || 0.02);
      first = false;
      g.gain.setTargetAtTime(peak, t, 0.01);
      g.gain.setTargetAtTime(0.0001, t + dur * 0.75, 0.025);
      if (V.bubble) this._tone('sine', f * 1.5, f * 3, 0.05, 0.05 * vol, t - now + dur * 0.3);
      t += dur;
    }
    if (V.vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = V.vib;
      const lg = ctx.createGain();
      lg.gain.value = V.f * (V.vibK || 0.025);
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(t0);
      lfo.stop(t + 0.3);
    }
    if (V.echo) {
      // kurzer Hall (Rückkopplung), danach wieder abgebaut
      const d = ctx.createDelay(0.5);
      d.delayTime.value = 0.13;
      const fb = ctx.createGain();
      fb.gain.value = 0.35;
      g.connect(d);
      d.connect(fb);
      fb.connect(d);
      fb.connect(this.sfxGain);
      setTimeout(() => {
        d.disconnect();
        fb.disconnect();
      }, (t - now + 1.6) * 1000);
    }
    if (V.crackle) this._noise(t - t0, 0.05 * vol, 'highpass', 4000, 7000, 1, t0 - now);
    o.start(t0);
    o.stop(t + 0.3);
    this.voiceUntil = t + 0.15;
  }

  _noise(dur, vol, type, f0, f1, q = 1, delay = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this._env(g, t, 0.005, vol, dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  play(name, k = 1) {
    if (!this.ready) return;
    switch (name) {
      case 'hit':
        this._noise(0.25, 0.5 * k, 'lowpass', 1400, 300, 1);
        this._tone('sine', 120, 45, 0.25, 0.5 * k);
        break;
      case 'wall':
        this._noise(0.14, 0.28 * k, 'bandpass', 2400, 900, 1.5);
        this._tone('sine', 90, 50, 0.12, 0.25 * k);
        break;
      case 'bump':
        this._tone('sine', 140, 60, 0.15, 0.35 * k);
        this._noise(0.1, 0.15, 'lowpass', 900, 400, 1);
        break;
      case 'boost':
        this._noise(0.5, 0.25, 'bandpass', 500, 3800, 2);
        this._tone('sawtooth', 180, 520, 0.35, 0.06);
        break;
      case 'spark':
        this._tone('triangle', 660 + k * 220, 660 + k * 260, 0.12, 0.13);
        this._tone('sine', 1320 + k * 440, 1320 + k * 440, 0.08, 0.06, 0.04);
        break;
      case 'hack':
        [0, 1, 2, 3, 4, 5].forEach((i) => this._tone('square', [523, 784, 622, 932, 698, 1046][i], [523, 784, 622, 932, 698, 1046][i], 0.05, 0.06, i * 0.035));
        this._noise(0.25, 0.08, 'highpass', 3000, 6000, 1);
        break;
      case 'warn':
        [0, 1, 2].forEach((i) => {
          this._tone('square', 988, 988, 0.07, 0.07, i * 0.16);
          this._tone('square', 740, 740, 0.07, 0.07, i * 0.16 + 0.08);
        });
        break;
      case 'count':
        this._tone('square', 440, 440, 0.16, 0.12);
        break;
      case 'go':
        this._tone('square', 880, 880, 0.4, 0.14);
        this._tone('square', 1320, 1320, 0.4, 0.06);
        break;
      case 'lap':
        this._tone('sine', 660, 660, 0.15, 0.16);
        this._tone('sine', 990, 990, 0.25, 0.16, 0.12);
        break;
      case 'final':
        // Letzte Runde: kurzer Fanfaren-Stoß (zwei Akkorde)
        [392, 494, 587].forEach((f) => this._tone('square', f, f, 0.14, 0.07));
        [523, 659, 784, 1046].forEach((f) => this._tone('square', f, f, 0.45, 0.075, 0.16));
        break;
      case 'best':
        [523, 659, 784, 1046].forEach((f, i) => this._tone('triangle', f, f, 0.16, 0.14, i * 0.07));
        break;
      case 'xp':
        // kurzes Zählgeräusch beim Füllen der XP-Leiste
        this._tone('triangle', 1400 + k * 300, 1700 + k * 300, 0.05, 0.05);
        break;
      case 'levelup':
        // aufsteigendes Arpeggio + Schlussakkord mit Glitzer
        [392, 523, 659, 784].forEach((f, i) => this._tone('square', f, f, 0.1, 0.06, i * 0.075));
        [1046, 1318, 1568].forEach((f) => this._tone('triangle', f, f, 0.6, 0.09, 0.32));
        this._noise(0.5, 0.06, 'highpass', 5000, 9000, 1, 0.32);
        break;
      case 'medal':
        [784, 988, 1175, 1568].forEach((f, i) => this._tone('triangle', f, f, 0.22, 0.12, i * 0.09));
        this._tone('sine', 2093, 2093, 0.7, 0.05, 0.36);
        break;
      case 'echo':
        this._noise(0.6, 0.12, 'bandpass', 3000, 600, 4);
        this._tone('sine', 1200, 300, 0.6, 0.07);
        break;
      case 'near':
        this._noise(0.3, 0.2, 'bandpass', 900, 3200, 3);
        break;
      case 'launch':
        this._noise(0.3, 0.18, 'lowpass', 600, 2000, 1);
        break;
      case 'land':
        this._tone('sine', 100, 40, 0.22, 0.45);
        this._noise(0.18, 0.2, 'lowpass', 800, 200, 1);
        break;
      case 'trick':
        this._tone('triangle', 880, 1760, 0.2, 0.1);
        break;
      case 'drain':
        this._tone('sawtooth', 400, 90, 0.5, 0.1);
        break;
      case 'finish':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this._tone('square', f, f, 0.18, 0.08, i * 0.12));
        break;
      case 'ui':
        this._tone('sine', 1100, 1300, 0.04, 0.06);
        break;
      case 'shock':
        // tiefer Wumms + Druckwellen-Rauschen
        this._tone('sine', 160, 32, 0.55, 0.6);
        this._tone('triangle', 90, 40, 0.4, 0.25);
        this._noise(0.6, 0.35, 'lowpass', 3200, 180, 1);
        this._noise(0.35, 0.12, 'bandpass', 5000, 900, 2, 0.05);
        break;
      case 'ram':
        // aufheulender Schub + Schild-Summen
        this._noise(0.55, 0.3, 'bandpass', 300, 2600, 2);
        this._tone('sawtooth', 110, 330, 0.45, 0.1);
        this._tone('sine', 880, 1760, 0.3, 0.05, 0.08);
        break;
      case 'smash':
        // Holo-Splittern: hell und glasig
        this._noise(0.25, 0.3, 'highpass', 2500, 7000, 1);
        [1568, 2093, 2637].forEach((fr, i) => this._tone('triangle', fr, fr * 0.8, 0.18, 0.06, i * 0.03));
        this._tone('sine', 220, 70, 0.2, 0.25);
        break;
      case 'cheer':
        // Jubel der Tribüne: gefiltertes, an- und abschwellendes Rauschen
        this._noise(1.6, 0.16 * k, 'bandpass', 900, 1500, 0.7);
        this._noise(1.3, 0.1 * k, 'bandpass', 2400, 1800, 1.2, 0.15);
        break;
      default:
        break;
    }
  }

  // --- Musik (kurze Loops, mit Vorausplanung) ---
  startMusic(styleIdx) {
    if (!this.ctx) {
      this.pendingMusic = styleIdx;
      return;
    }
    if (this.music && this.music.style === styleIdx) {
      this.music.tempo = 1;
      return;
    }
    this.stopMusic();
    const st = STYLES[styleIdx % STYLES.length];
    const m = { style: styleIdx, st, step: 0, next: this.ctx.currentTime + 0.1, timer: null, tempo: 1 };
    m.timer = setInterval(() => this._schedule(m), 25);
    this.music = m;
  }

  // Tempo-Faktor der laufenden Musik (z. B. letzte Runde)
  setMusicTempo(f) {
    if (this.music) this.music.tempo = f;
  }

  stopMusic() {
    if (this.music) clearInterval(this.music.timer);
    this.music = null;
  }

  _schedule(m) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      if (ctx) m.next = ctx.currentTime + 0.1;
      return;
    }
    const st = m.st;
    const sixteenth = 60 / (st.bpm * (m.tempo || 1)) / 4;
    while (m.next < ctx.currentTime + 0.12) {
      const step = m.step % 16;
      const bar = Math.floor(m.step / 16) % st.chords.length;
      const chord = st.chords[bar];
      const t = m.next;
      if (st.drums) {
        if (step % 4 === 0) this._kick(t);
        if (step === 4 || step === 12) this._snare(t);
        if (step % 2 === 1) this._hat(t, step % 4 === 3 ? 0.07 : 0.035);
      }
      // Bass
      if (st.oompah) {
        // Hm-ta-ta: Grundton auf 1 und 3, Quinte auf 2 und 4, kurze Akkord-Tupfer auf den Achteln dazwischen
        if (step % 4 === 0) this._voice(st.bass, midi(chord[0] - 12 + (step % 8 === 4 ? 7 : 0)), t, sixteenth * 1.8, 0.12, 900);
        else if (step % 4 === 2) for (const nt of chord) this._voice('square', midi(nt), t, sixteenth * 0.7, 0.012, 1800);
      } else if (st.drums ? step % 2 === 0 : step % 8 === 0) {
        const note = chord[0] - 12 + (step % 8 === 6 ? 12 : 0);
        this._voice(st.bass, midi(note), t, st.drums ? sixteenth * 1.6 : sixteenth * 7, 0.11, 700);
      }
      // Arpeggio
      if (step % 2 === 0 || !st.drums) {
        const idx = st.arp[(step >> 1) % st.arp.length] % chord.length;
        if (st.drums || step % 2 === 0) this._voice(st.lead, midi(chord[idx] + 12), t, sixteenth * 1.2, st.drums ? 0.035 : 0.05, 2600);
      }
      // Flächen im Menü
      if (!st.drums && step === 0) for (const n of chord) this._voice('sawtooth', midi(n), t, sixteenth * 15, 0.018, 900, 0.4);
      m.step++;
      m.next += sixteenth;
    }
  }

  _voice(type, freq, t, dur, vol, cutoff, attack = 0.005) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  _kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.3);
  }

  _snare(t) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    s.start(t, Math.random());
    s.stop(t + 0.2);
  }

  _hat(t, vol) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    s.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    s.start(t, Math.random());
    s.stop(t + 0.06);
  }
}
