// Online-Multiplayer ohne eigenen Server: WebRTC Peer-to-Peer über PeerJS.
// Der Host registriert sich unter "echoracer-v1-<CODE>", Clients verbinden sich direkt zu ihm (Stern-Topologie).
// Pro Client zwei Datenkanäle: 'ctrl' (zuverlässig, geordnet) und 'fast' (ungeordnet, für Eingaben/Snapshots).

import Peer from 'peerjs';
import { ROOM_PREFIX, ROOM_ALPHABET, ICE_SERVERS } from '../config.js';

const CHUNK = 12000;
let msgSeq = 1;

// Entwickler-Hilfe: in der Konsole z.B. window.__netLag = 70 (ms je Richtung) und
// window.__netLoss = 0.05 (Verlust auf dem schnellen Kanal) setzen, um schlechte Netze zu simulieren.
function rawSend(conn, msg, lossy = false) {
  const lag = (typeof window !== 'undefined' && window.__netLag) || 0;
  const loss = (typeof window !== 'undefined' && window.__netLoss) || 0;
  if (lossy && loss && Math.random() < loss) return;
  if (!lag) return conn.send(msg);
  const jitter = lag * 0.15 * Math.random();
  setTimeout(() => {
    try {
      if (conn.open) conn.send(msg);
    } catch {
      /* egal */
    }
  }, lag + jitter);
}

function peerOptions() {
  const o = { debug: 1 };
  if (ICE_SERVERS) o.config = { iceServers: ICE_SERVERS };
  return o;
}

export function randomCode() {
  let s = '';
  const a = ROOM_ALPHABET;
  const buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 4; i++) s += a[buf[i] % a.length];
  return s;
}

export function normalizeCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
}

function sendBig(conn, msg) {
  if (!conn || !conn.open) return false;
  const str = JSON.stringify(msg);
  try {
    if (str.length <= CHUNK) {
      rawSend(conn, msg);
    } else {
      const id = msgSeq++;
      const n = Math.ceil(str.length / CHUNK);
      for (let i = 0; i < n; i++) rawSend(conn, { t: '_p', id, i, n, s: str.slice(i * CHUNK, (i + 1) * CHUNK) });
    }
    return true;
  } catch {
    return false;
  }
}

function reassemble(store, d) {
  if (!d || d.t !== '_p') return d;
  let e = store.get(d.id);
  if (!e) {
    e = { parts: new Array(d.n), got: 0 };
    store.set(d.id, e);
  }
  if (e.parts[d.i] == null) {
    e.parts[d.i] = d.s;
    e.got++;
  }
  if (e.got < d.n) return null;
  store.delete(d.id);
  try {
    return JSON.parse(e.parts.join(''));
  } catch {
    return null;
  }
}

function describeError(err) {
  const t = err && err.type;
  if (t === 'peer-unavailable') return 'Raum nicht gefunden. Code prüfen!';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')
    return 'Keine Verbindung zum Vermittlungsserver. Internet prüfen.';
  if (t === 'browser-incompatible') return 'Dieser Browser unterstützt kein WebRTC.';
  if (t === 'unavailable-id') return 'Raumcode bereits vergeben.';
  if (t === 'timeout') return 'Zeitüberschreitung beim Verbinden.';
  return (err && err.message) || 'Verbindungsfehler';
}

export class NetHost {
  constructor() {
    this.peer = null;
    this.code = null;
    this.clients = new Map(); // peerId -> { pid, ctrl, fast, open, lastSeen, chunks }
    this.on = { join: null, leave: null, msg: null, error: null };
    this.closed = false;
    this._hb = null;
  }

  async open() {
    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      try {
        await this._open(code);
        this.code = code;
        this._hb = setInterval(() => this._heartbeat(), 1000);
        return code;
      } catch (e) {
        lastErr = e;
        if (!e || e.type !== 'unavailable-id') break;
      }
    }
    throw new Error(describeError(lastErr));
  }

  _open(code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(ROOM_PREFIX + code, peerOptions());
      let done = false;
      const to = setTimeout(() => {
        if (done) return;
        done = true;
        peer.destroy();
        reject({ type: 'timeout' });
      }, 15000);
      peer.on('open', () => {
        if (done) return;
        done = true;
        clearTimeout(to);
        this.peer = peer;
        this._wire(peer);
        resolve();
      });
      peer.on('error', (err) => {
        if (!done) {
          done = true;
          clearTimeout(to);
          peer.destroy();
          reject(err);
        } else if (this.on.error && err.type !== 'peer-unavailable') this.on.error(describeError(err));
      });
    });
  }

  _wire(peer) {
    peer.on('connection', (conn) => {
      const pid = conn.peer;
      let cl = this.clients.get(pid);
      if (!cl) {
        cl = { pid, ctrl: null, fast: null, open: false, lastSeen: performance.now(), chunks: new Map() };
        this.clients.set(pid, cl);
      }
      const isFast = conn.label === 'fast';
      if (isFast) cl.fast = conn;
      else cl.ctrl = conn;
      conn.on('open', () => {
        cl.lastSeen = performance.now();
        if (!isFast && !cl.open) {
          cl.open = true;
          if (this.on.join) this.on.join(pid);
        }
      });
      conn.on('data', (raw) => {
        cl.lastSeen = performance.now();
        const d = reassemble(cl.chunks, raw);
        if (!d) return;
        if (d.t === 'ping') {
          try {
            rawSend(conn, { t: 'pong', c: d.c, h: performance.now() });
          } catch {
            /* egal */
          }
          return;
        }
        if (this.on.msg) this.on.msg(pid, d);
      });
      conn.on('close', () => {
        if (!isFast) this.drop(pid);
      });
      conn.on('error', () => {});
    });
    peer.on('disconnected', () => {
      // Verbindung zum Vermittlungsserver weg – bestehende Verbindungen laufen weiter
      if (!this.closed) {
        try {
          peer.reconnect();
        } catch {
          /* egal */
        }
      }
    });
  }

  _heartbeat() {
    const now = performance.now();
    for (const cl of this.clients.values()) {
      if (cl.open && now - cl.lastSeen > 8000) this.drop(cl.pid);
    }
  }

  drop(pid) {
    const cl = this.clients.get(pid);
    if (!cl) return;
    this.clients.delete(pid);
    try {
      cl.ctrl && cl.ctrl.close();
      cl.fast && cl.fast.close();
    } catch {
      /* egal */
    }
    if (cl.open && this.on.leave) this.on.leave(pid);
  }

  send(pid, msg) {
    const cl = this.clients.get(pid);
    if (cl) sendBig(cl.ctrl, msg);
  }

  sendFast(pid, msg) {
    const cl = this.clients.get(pid);
    if (!cl) return;
    if (cl.fast && cl.fast.open) {
      try {
        rawSend(cl.fast, msg, true);
      } catch {
        /* egal */
      }
    } else sendBig(cl.ctrl, msg);
  }

  broadcast(msg, except = null) {
    for (const cl of this.clients.values()) if (cl.open && cl.pid !== except) sendBig(cl.ctrl, msg);
  }

  close() {
    this.closed = true;
    clearInterval(this._hb);
    for (const pid of [...this.clients.keys()]) {
      this.send(pid, { t: 'bye' });
    }
    setTimeout(() => {
      try {
        this.peer && this.peer.destroy();
      } catch {
        /* egal */
      }
    }, 150);
  }
}

export class NetClient {
  constructor() {
    this.peer = null;
    this.ctrl = null;
    this.fast = null;
    this.on = { msg: null, close: null };
    this.chunks = new Map();
    this.closed = false;
    this.lastSeen = performance.now();
    this.offset = 0; // Host-Uhr minus eigene Uhr (ms)
    this.rtt = 0;
    this.samples = [];
    this._pingT = null;
    this._hb = null;
  }

  join(code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      this.peer = peer;
      let done = false;
      const fail = (err) => {
        if (done) return;
        done = true;
        clearTimeout(to);
        try {
          peer.destroy();
        } catch {
          /* egal */
        }
        reject(new Error(describeError(err)));
      };
      const to = setTimeout(() => fail({ type: 'timeout' }), 20000);
      peer.on('error', (err) => {
        if (!done) fail(err);
        else if (err.type !== 'peer-unavailable') this._lost('Verbindungsfehler: ' + describeError(err));
      });
      peer.on('open', () => {
        const hostId = ROOM_PREFIX + code;
        this.ctrl = peer.connect(hostId, { label: 'ctrl', reliable: true, serialization: 'json' });
        this.fast = peer.connect(hostId, { label: 'fast', reliable: false, serialization: 'json' });
        const onData = (raw) => {
          this.lastSeen = performance.now();
          const d = reassemble(this.chunks, raw);
          if (!d) return;
          if (d.t === 'pong') return this._pong(d);
          if (this.on.msg) this.on.msg(d);
        };
        this.ctrl.on('data', onData);
        this.fast.on('data', onData);
        this.fast.on('error', () => {});
        this.ctrl.on('error', (e) => fail(e));
        this.ctrl.on('close', () => this._lost('Verbindung zum Host getrennt.'));
        this.ctrl.on('open', () => {
          if (done) return;
          done = true;
          clearTimeout(to);
          this.lastSeen = performance.now();
          this._startClock();
          resolve();
        });
      });
    });
  }

  _startClock() {
    let n = 0;
    const ping = () => {
      if (this.closed) return;
      this.sendFast({ t: 'ping', c: performance.now() });
      n++;
      this._pingT = setTimeout(ping, n < 6 ? 200 : 1000);
    };
    ping();
    this._hb = setInterval(() => {
      if (performance.now() - this.lastSeen > 8000) this._lost('Host antwortet nicht mehr.');
    }, 1000);
  }

  _pong(d) {
    const now = performance.now();
    const rtt = now - d.c;
    const offset = d.h + rtt / 2 - now;
    this.samples.push({ rtt, offset });
    if (this.samples.length > 12) this.samples.shift();
    let best = this.samples[0];
    for (const s of this.samples) if (s.rtt < best.rtt) best = s;
    this.rtt = this.samples.reduce((a, s) => a + s.rtt, 0) / this.samples.length;
    if (this.samples.length === 1) this.offset = best.offset;
    else this.offset += (best.offset - this.offset) * 0.3;
  }

  hostNow() {
    return performance.now() + this.offset;
  }

  _lost(reason) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this._pingT);
    clearInterval(this._hb);
    if (this.on.close) this.on.close(reason);
    try {
      this.peer && this.peer.destroy();
    } catch {
      /* egal */
    }
  }

  send(msg) {
    sendBig(this.ctrl, msg);
  }

  sendFast(msg) {
    if (this.fast && this.fast.open) {
      try {
        rawSend(this.fast, msg, true);
        return;
      } catch {
        /* weiter mit ctrl */
      }
    }
    sendBig(this.ctrl, msg);
  }

  close() {
    if (this.closed) return;
    this.send({ t: 'bye' });
    this.closed = true;
    clearTimeout(this._pingT);
    clearInterval(this._hb);
    setTimeout(() => {
      try {
        this.peer && this.peer.destroy();
      } catch {
        /* egal */
      }
    }, 150);
  }
}
