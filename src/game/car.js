// Arcade-Fahrphysik (ohne Physik-Framework). Dieselbe Funktion läuft auf dem Host (autoritativ)
// und auf Clients (Vorhersage des eigenen Autos), daher nur reine Zustandsdaten.

import { clamp, wrapAngle } from '../util.js';
import { HACK_MAX, DRIFT_LEVEL_TIMES, DRIFT_BOOST, JUMP_LEN } from '../config.js';

export const CAR_R = 1.05; // Radius der zwei Kollisionskreise
export const CAR_OFF = 1.0; // Abstand der Kreise von der Fahrzeugmitte
export const CAR_HALF_W = 1.05;
const GRAV = 24;

export function createCarState() {
  return {
    x: 0, z: 0, y: 0,
    vx: 0, vz: 0, vy: 0,
    h: 0, yaw: 0,
    air: 0, trick: 0, rampAir: 0, wob: 0,
    drift: 0, driftT: 0, driftLvl: 0,
    boostT: 0, boostP: 0,
    hack: 0,
    draftT: 0, drafting: 0,
    seg: -1, s: 0, d: 0, prog: 0, lap: 0,
    hitT: 9, brk: 0, scr: 0, onPad: 0, pd: 0, spd: 0,
    stuckT: 0, wrongT: 0,
    shieldT: 0,
    stallT: 0,
  };
}

export const STATE_KEYS = Object.keys(createCarState());

export function copyState(dst, src) {
  for (let i = 0; i < STATE_KEYS.length; i++) {
    const k = STATE_KEYS[i];
    dst[k] = src[k];
  }
  return dst;
}

export function packState(st) {
  const out = new Array(STATE_KEYS.length);
  for (let i = 0; i < STATE_KEYS.length; i++) {
    const v = st[STATE_KEYS[i]];
    out[i] = Math.round(v * 1000) / 1000;
  }
  return out;
}

export function unpackState(arr, dst) {
  for (let i = 0; i < STATE_KEYS.length; i++) dst[STATE_KEYS[i]] = arr[i];
  return dst;
}

export function neutralInput() {
  return { steer: 0, throttle: 0, brake: 0, drift: 0, hack: -1 };
}

export function applyBoost(c, time, power) {
  if (c.boostT <= 0.05) {
    const k = 3.5 * power;
    c.vx += Math.sin(c.h) * k;
    c.vz += Math.cos(c.h) * k;
  }
  c.boostP = c.boostT > 0 ? Math.max(c.boostP, power) : power;
  c.boostT = Math.max(c.boostT, time);
}

// --- Kontaktberechnung zwischen zwei Autokörpern (je zwei Kreise) ---
const CONTACT = { nx: 0, nz: 0, pen: 0 };
export function bodyContact(ax, az, ah, bx, bz, bh) {
  CONTACT.pen = 0;
  const dx0 = ax - bx;
  const dz0 = az - bz;
  if (dx0 * dx0 + dz0 * dz0 > 26) return CONTACT;
  const afx = Math.sin(ah) * CAR_OFF;
  const afz = Math.cos(ah) * CAR_OFF;
  const bfx = Math.sin(bh) * CAR_OFF;
  const bfz = Math.cos(bh) * CAR_OFF;
  const R2 = CAR_R * 2;
  for (let i = -1; i <= 1; i += 2) {
    const cx = ax + afx * i;
    const cz = az + afz * i;
    for (let j = -1; j <= 1; j += 2) {
      const ox = bx + bfx * j;
      const oz = bz + bfz * j;
      const dx = cx - ox;
      const dz = cz - oz;
      const d = Math.hypot(dx, dz);
      const pen = R2 - d;
      if (pen > CONTACT.pen) {
        CONTACT.pen = pen;
        if (d > 1e-4) {
          CONTACT.nx = dx / d;
          CONTACT.nz = dz / d;
        } else {
          CONTACT.nx = dx0 || 1;
          CONTACT.nz = dz0;
          const l = Math.hypot(CONTACT.nx, CONTACT.nz);
          CONTACT.nx /= l;
          CONTACT.nz /= l;
        }
      }
    }
  }
  return CONTACT;
}

// Treffer gegen ein unbewegliches/vorgegebenes Objekt (Echo, Barriere): Tempoverlust, aber kein Stillstand.
export function hitKinematic(c, nx, nz, pen, ovx, ovz, loss, ev, kind, owner) {
  c.x += nx * pen;
  c.z += nz * pen;
  const sp0 = Math.hypot(c.vx, c.vz);
  const rvx = c.vx - ovx;
  const rvz = c.vz - ovz;
  const vn = rvx * nx + rvz * nz;
  if (vn < 0) {
    c.vx -= 1.35 * vn * nx;
    c.vz -= 1.35 * vn * nz;
  }
  const impact = Math.max(0, -vn);
  if (impact < 2) {
    // nur leichtes Anschieben: kein Treffer, aber auch kein "knapp vorbei"
    c.hitT = Math.min(c.hitT, 0.5);
    return;
  }
  if (c.hitT > 0.3) {
    c.hitT = 0;
    // je härter der Aufprall, desto mehr Tempoverlust
    const f = 1 - (1 - loss) * (0.35 + 0.65 * Math.min(1, impact / 12));
    c.vx *= f;
    c.vz *= f;
    let sp1 = Math.hypot(c.vx, c.vz);
    const minSp = sp0 * 0.32;
    if (sp1 < minSp) {
      if (sp1 < 0.5) {
        c.vx = Math.sin(c.h) * minSp;
        c.vz = Math.cos(c.h) * minSp;
      } else {
        c.vx *= minSp / sp1;
        c.vz *= minSp / sp1;
      }
      sp1 = minSp;
    }
    // seitlicher Dreh-Impuls je nach Trefferseite
    const side = nx * -Math.cos(c.h) + nz * Math.sin(c.h);
    c.yaw += clamp(-side, -1, 1) * 1.8;
    if (c.drift) {
      c.drift = 0;
      c.driftT = 0;
      c.driftLvl = 0;
    }
    if (ev) ev('hit', { kind, owner, power: impact });
  }
}

// Seitenstoß (Schockwelle, Rammstoß): bremst um den Faktor keep und schiebt quer zur eigenen Fahrtrichtung
// weg von der Quelle (dx/dz = Richtung Quelle → Auto). Nie nach vorn – das Opfer soll keinen Vorteil haben.
export function knockSide(c, dx, dz, push, keep) {
  const rx = -Math.cos(c.h);
  const rz = Math.sin(c.h);
  let side = dx * rx + dz * rz;
  side = side >= 0 ? 1 : -1;
  c.vx = c.vx * keep + rx * side * push;
  c.vz = c.vz * keep + rz * side * push;
  c.yaw += -side * 1.7;
  c.wob = Math.max(c.wob, 0.5);
  if (c.drift) {
    c.drift = 0;
    c.driftT = 0;
    c.driftLvl = 0;
  }
  c.hitT = 0;
}

// Rammstoß-Schild: Hindernis wird durchbrochen statt getroffen (Ereignis höchstens alle 0,35 s)
export function smash(c, ev, kind, owner) {
  if (c.hitT > 0.35) {
    c.hitT = 0.2;
    if (ev) ev('smash', { kind, owner });
  }
}

const P = {};
const E = {};
const LIM = [0, 0];
const PAD = { d: 0, drain: false, mirror: false, owner: null };

export function stepCar(c, stats, inp, dt, env, ev) {
  const track = env.track;
  const t = env.time;
  const prevS = c.s;
  c.hitT += dt;
  c.scr = 0;
  if (c.boostT > 0) {
    c.boostT -= dt;
    if (c.boostT <= 0) {
      c.boostT = 0;
      c.boostP = 0;
    }
  }
  if (c.wob > 0) c.wob = Math.max(0, c.wob - dt);
  if (c.shieldT > 0) c.shieldT = Math.max(0, c.shieldT - dt);
  if (c.stallT > 0) c.stallT = Math.max(0, c.stallT - dt);
  const steer = clamp(inp.steer || 0, -1, 1);
  // Fehlstart: Räder drehen kurz durch (kein Vortrieb)
  const thr = c.stallT > 0 ? 0 : clamp(inp.throttle || 0, 0, 1);
  const brake = !!inp.brake;
  const driftBtn = !!inp.drift;

  const top = stats.top;
  let fx = Math.sin(c.h);
  let fz = Math.cos(c.h);
  let vF = c.vx * fx + c.vz * fz;
  const maxV = top * (1 + (c.boostT > 0 ? 0.3 * c.boostP : 0)) * (c.drafting ? 1.07 : 1);

  if (!c.air) {
    // --- Drift: Knopf halten + lenken; Funken-Stufen laden Mini-Boosts ---
    if (!c.drift) {
      if (driftBtn && Math.abs(steer) > 0.3 && vF > 14) {
        c.drift = steer > 0 ? 1 : -1;
        c.driftT = 0;
        c.driftLvl = 0;
        if (ev) ev('driftStart', c.drift);
      }
    } else if (!driftBtn || vF < 9) {
      if (!driftBtn && c.driftLvl > 0) {
        const b = DRIFT_BOOST[c.driftLvl];
        applyBoost(c, b.t, b.p);
        if (ev) ev('miniBoost', c.driftLvl);
      }
      c.drift = 0;
      c.driftT = 0;
      c.driftLvl = 0;
    } else {
      const tight = clamp(steer * c.drift, 0, 1);
      c.driftT += dt * stats.drift * (0.75 + 0.5 * tight);
      let lvl = 0;
      for (let i = 0; i < 3; i++) if (c.driftT >= DRIFT_LEVEL_TIMES[i]) lvl = i + 1;
      if (lvl > c.driftLvl) {
        c.driftLvl = lvl;
        c.hack = Math.min(HACK_MAX, c.hack + 0.08 * stats.hack);
        if (ev) ev('driftLvl', lvl);
      }
      c.hack = Math.min(HACK_MAX, c.hack + dt * 0.2 * stats.hack);
    }

    // --- Lenkung (Gierrate > 0 = rechts) ---
    const av = Math.abs(vF);
    const g = Math.min(1, av / 7) * (1 - 0.45 * Math.min(1, av / top));
    let target;
    if (c.drift) {
      const dir = c.drift;
      target = dir * (1.25 + 0.6 * clamp(steer * dir, -1, 1)) * stats.drift * Math.min(1, vF / 16);
    } else {
      target = steer * stats.turn * g * (vF < -0.5 ? -1 : 1);
    }
    if (c.wob > 0) target += Math.sin(c.wob * 26) * 1.6 * c.wob;
    c.yaw += (target - c.yaw) * Math.min(1, 12 * dt);
  } else {
    // Luftsteuerung (Arcade): Lenken dreht das Auto in der Luft etwas, die Flugbahn folgt teilweise
    c.yaw += (steer * stats.turn * 0.55 - c.yaw) * Math.min(1, 5 * dt);
    if (driftBtn && !c.pd && !c.trick) {
      c.trick = 1;
      if (ev) ev('trick');
    }
  }

  c.h = wrapAngle(c.h - c.yaw * dt);
  fx = Math.sin(c.h);
  fz = Math.cos(c.h);
  const rx = -fz;
  const rz = fx;
  vF = c.vx * fx + c.vz * fz;
  let vR = c.vx * rx + c.vz * rz;

  if (!c.air) {
    // Seitenhaftung: Querbewegung abbauen und größtenteils in Vortrieb umwandeln
    // nach Stößen (wob) kurz rutschig: Querbewegung wird nicht in Vortrieb umgewandelt
    const stun = c.wob > 0;
    const grip = c.drift ? 3.0 : stun ? 2.4 : stats.grip;
    const keep = c.drift ? 0.95 : stun ? 0.15 : 0.88;
    const vR2 = vR * Math.exp(-grip * dt);
    const lost = Math.abs(vR) - Math.abs(vR2);
    vF += (vF >= 0 ? 1 : -1) * lost * keep;
    vR = vR2;
    if (brake) {
      if (vF > 1) vF -= 34 * dt;
      else vF = Math.max(-12, vF - 12 * dt);
      c.brk = 1;
    } else {
      c.brk = 0;
      if (thr > 0) {
        if (vF < 0) vF += 30 * dt;
        const r = vF / maxV;
        if (r < 1) vF += stats.accel * thr * (1 - r * r) * (c.boostT > 0 ? 1.7 : 1) * dt;
      } else {
        vF -= vF * 0.6 * dt;
      }
    }
    // Steigung: bergauf langsamer, bergab schneller
    if (track.slope) {
      const kS = c.seg >= 0 ? c.seg : track.indexAt(c.s);
      vF -= 14 * track.slope[kS] * (fx * track.tx[kS] + fz * track.tz[kS]) * dt;
    }
    if (vF > maxV) vF -= (vF - maxV) * 1.6 * dt;
    vF -= vF * 0.015 * dt;
  } else {
    const vR2 = vR * Math.exp(-2.2 * dt);
    vF += (vF >= 0 ? 1 : -1) * (Math.abs(vR) - Math.abs(vR2)) * 0.9;
    vR = vR2;
    vF -= vF * 0.05 * dt;
    if (vF > maxV * 1.1) vF = maxV * 1.1;
  }
  c.vx = vF * fx + vR * rx;
  c.vz = vF * fz + vR * rz;

  // --- Höhe (Sprünge von Hack-Rampen) ---
  if (c.air) {
    c.vy -= GRAV * dt;
    c.y += c.vy * dt;
    if (c.y <= 0) {
      c.y = 0;
      c.vy = 0;
      c.air = 0;
      if (c.trick) {
        applyBoost(c, 0.6, 0.9);
        if (ev) ev('trickLand');
      } else if (c.rampAir) {
        c.vx *= 0.78;
        c.vz *= 0.78;
        c.wob = 0.55;
        if (ev) ev('hardLand');
      } else if (ev) ev('land');
      c.trick = 0;
      c.rampAir = 0;
    }
  }

  c.x += c.vx * dt;
  c.z += c.vz * dt;

  // --- Streckenposition und Rundenfortschritt ---
  track.project(c.x, c.z, c.seg, P);
  c.seg = P.i;
  let ds = P.s - prevS;
  const L = track.length;
  if (ds > L / 2) ds -= L;
  else if (ds < -L / 2) ds += L;
  c.prog += ds;
  c.s = P.s;
  c.d = P.d;

  // --- Begrenzungen (Wände + Hack "Kurve verengen") ---
  LIM[0] = -P.hw + CAR_HALF_W;
  LIM[1] = P.hw - CAR_HALF_W;
  if (env.hacks && !env.ghost) env.hacks.limits(env.carId, P.s, P.hw, t, LIM);
  if (c.d > LIM[1] || c.d < LIM[0]) wallContact(c, LIM[0], LIM[1], dt, ev);

  // --- Boostfelder ---
  let pad = 0;
  if (!c.air && env.pads) {
    for (let i = 0; i < env.pads.length; i++) {
      const pd = env.pads[i];
      const dd = track.deltaS(pd.s, c.s);
      if (dd < -pd.len / 2 || dd > pd.len / 2) continue;
      if (env.hacks) env.hacks.padState(pd, env.carId, t, PAD);
      else {
        PAD.d = pd.d;
        PAD.drain = false;
      }
      if (Math.abs(c.d - PAD.d) > pd.w + 0.7) continue;
      if (PAD.drain && !env.ghost) {
        const k = Math.exp(-2.6 * dt);
        c.vx *= k;
        c.vz *= k;
        if (c.drift) {
          c.drift = 0;
          c.driftT = 0;
          c.driftLvl = 0;
        }
        pad = 2;
        if (c.onPad !== 2 && ev) ev('drain', { owner: PAD.owner });
      } else {
        applyBoost(c, 1.0, 1.0);
        pad = 1;
        if (c.onPad !== 1 && ev) ev('pad');
      }
    }
  }
  c.onPad = pad;

  // --- Sprungschanzen: auf der Rampe hochfahren, an der Kante (oder seitlich) abheben ---
  if (env.jumps && env.jumps.length && !c.air) {
    let ramp = -1;
    let lip = false;
    for (let i = 0; i < env.jumps.length; i++) {
      const j = env.jumps[i];
      const dd = track.deltaS(j.s, c.s);
      if (Math.abs(c.d - j.d) > j.w) continue;
      if (dd >= -JUMP_LEN && dd <= 0) {
        ramp = j.h * (1 + dd / JUMP_LEN);
        break;
      }
      if (dd > 0 && dd < 4) lip = j; // gerade überfahrene Kante
    }
    if (ramp >= 0) c.y = ramp;
    else if (c.y > 0.2) {
      const fwd = c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h);
      c.air = 1;
      c.rampAir = 0;
      c.trick = 0;
      c.vy = lip ? Math.max(0, fwd) * (lip.h / JUMP_LEN) + 2.6 : 0;
      if (c.drift) {
        c.drift = 0;
        c.driftT = 0;
        c.driftLvl = 0;
      }
      if (ev && lip) ev('jump');
    } else c.y = 0;
  }

  // --- Echos und Hacks als Hindernisse ---
  if (!env.ghost) {
    const echoes = env.echoes;
    if (echoes) {
      for (let i = 0; i < echoes.length; i++) {
        const e = echoes[i];
        if (t < e.t0 || !e.solidFor(env.carId)) continue;
        e.sample(t, E);
        // Echo-Höhe ist absolut (Brücke/Hügel), das Auto rechnet relativ zur Fahrbahn
        if (Math.abs(E.y - (track.heightAt(c.s) + c.y)) > 1.3) continue;
        const C = bodyContact(c.x, c.z, c.h, E.x, E.z, E.h);
        if (C.pen <= 0) continue;
        if (c.shieldT > 0) smash(c, ev, 'echo', e.owner);
        else hitKinematic(c, C.nx, C.nz, C.pen, E.vx, E.vz, 0.74, ev, 'echo', e.owner);
      }
    }
    if (env.hacks) env.hacks.collide(c, env.carId, t, ev);
  }

  if (env.others) slipstream(c, stats, env, dt, ev);

  c.pd = driftBtn ? 1 : 0;
  c.spd = Math.hypot(c.vx, c.vz);
}

function wallContact(c, lo, hi, dt, ev) {
  const side = c.d > hi ? 1 : -1;
  const pen = side > 0 ? c.d - hi : lo - c.d;
  // große Eindringtiefe (neue Hack-Wand) sanft herausschieben
  const push = pen > 1.5 ? 26 * dt : pen;
  c.x -= P.nx * push * side;
  c.z -= P.nz * push * side;
  c.d -= push * side;
  const vn = (c.vx * P.nx + c.vz * P.nz) * side;
  if (vn > 0) {
    c.vx -= P.nx * side * vn * 1.3;
    c.vz -= P.nz * side * vn * 1.3;
    const loss = 1 - Math.min(0.3, vn * 0.02);
    c.vx *= loss;
    c.vz *= loss;
    if (vn > 5.5) {
      if (c.drift) {
        c.drift = 0;
        c.driftT = 0;
        c.driftLvl = 0;
      }
      if (c.hitT > 0.25) {
        c.hitT = 0;
        if (ev) ev('wall', vn);
      }
    }
    // Ausrichtung entlang der Wand
    const th = Math.atan2(P.tx, P.tz);
    const fwdDot = Math.sin(c.h) * P.tx + Math.cos(c.h) * P.tz;
    const target = fwdDot >= 0 ? th : th + Math.PI;
    c.h = wrapAngle(c.h + wrapAngle(target - c.h) * Math.min(0.5, vn * 0.03));
  }
  const k = 1 - 0.5 * dt;
  c.vx *= k;
  c.vz *= k;
  c.scr = 1;
}

function slipstream(c, stats, env, dt, ev) {
  const fx = Math.sin(c.h);
  const fz = Math.cos(c.h);
  const rx = -fz;
  const rz = fx;
  const sp = Math.hypot(c.vx, c.vz);
  let drafting = false;
  const others = env.others;
  const mem = env.nearMem;
  for (let i = 0; i < others.length; i++) {
    const o = others[i];
    const dx = o.x - c.x;
    const dz = o.z - c.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 900) {
      if (mem) mem.delete(o.id);
      continue;
    }
    const along = dx * fx + dz * fz;
    const lat = dx * rx + dz * rz;
    if (along > 3.5 && along < 24 && Math.abs(lat) < 2.4 && sp > 22) drafting = true;
    if (mem) {
      const prev = mem.get(o.id);
      if (
        prev !== undefined && prev > 0.3 && along <= 0.3 && Math.abs(lat) < 3.8 &&
        sp > 18 && c.hitT > 0.8 && sp - (o.vx * fx + o.vz * fz) > 1.5
      ) {
        c.hack = Math.min(HACK_MAX, c.hack + 0.4 * stats.hack);
        if (ev) ev('nearMiss', o.id);
      }
      mem.set(o.id, along);
    }
  }
  if (drafting) c.draftT += dt;
  else c.draftT = Math.max(0, c.draftT - dt * 2);
  const was = c.drafting;
  c.drafting = c.draftT > 0.35 ? 1 : 0;
  if (c.drafting) c.hack = Math.min(HACK_MAX, c.hack + 0.16 * dt * stats.hack);
  if (c.drafting && !was && ev) ev('draft');
}

// Zusammenstoß zweier Autos (nur auf dem Host): Impuls nach Masse.
// Hat genau eines der Autos den Rammstoß-Schild, wird das andere weggeschleudert.
export function collideCars(a, sa, b, sb, evA, evB, idA, idB) {
  const C = bodyContact(a.x, a.z, a.h, b.x, b.z, b.h);
  if (C.pen <= 0 || Math.abs(a.y - b.y) > 1.3) return false;
  if (a.shieldT > 0 !== b.shieldT > 0) {
    ramHit(C, a.shieldT > 0 ? b : a, a.shieldT > 0 ? a : b, a.shieldT > 0 ? -1 : 1, a.shieldT > 0 ? evB : evA, a.shieldT > 0 ? evA : evB, a.shieldT > 0 ? idA : idB, a.shieldT > 0 ? idB : idA);
    return true;
  }
  const ma = sa.mass;
  const mb = sb.mass;
  const inv = 1 / (ma + mb);
  const { nx, nz, pen } = C;
  a.x += nx * pen * mb * inv;
  a.z += nz * pen * mb * inv;
  b.x -= nx * pen * ma * inv;
  b.z -= nz * pen * ma * inv;
  const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (rv < 0) {
    const j = (-(1 + 0.45) * rv) / (1 / ma + 1 / mb);
    a.vx += (j / ma) * nx;
    a.vz += (j / ma) * nz;
    b.vx -= (j / mb) * nx;
    b.vz -= (j / mb) * nz;
    if (-rv > 3) {
      a.vx *= 0.97;
      a.vz *= 0.97;
      b.vx *= 0.97;
      b.vz *= 0.97;
      if (a.hitT > 0.25) {
        a.hitT = 0;
        if (evA) evA('bump', -rv);
      }
      if (b.hitT > 0.25) {
        b.hitT = 0;
        if (evB) evB('bump', -rv);
      }
    }
  }
  return true;
}

// Opfer eines Rammstoßes: volle Trennung, Stoß weg vom Rammer, Dreher; der Rammer behält sein Tempo.
// sg: Richtung der Kontaktnormale (sie zeigt von b nach a) zum Opfer hin
function ramHit(C, vic, ram, sg, evVic, evRam, ramId, vicId) {
  const nx = C.nx * sg;
  const nz = C.nz * sg;
  vic.x += nx * C.pen;
  vic.z += nz * C.pen;
  if (vic.hitT <= 0.3) {
    // weiterer Kontakt während des Stoßes: nur die Annäherung aufheben (kein Abprall nach vorn)
    const rvn = (vic.vx - ram.vx) * nx + (vic.vz - ram.vz) * nz;
    if (rvn < 0) {
      vic.vx -= nx * rvn;
      vic.vz -= nz * rvn;
    }
    return;
  }
  // seitlich weg vom Rammer; bei genau mittigem Treffer entscheidet die Spurlage
  let dx = vic.x - ram.x;
  let dz = vic.z - ram.z;
  const lat = dx * -Math.cos(vic.h) + dz * Math.sin(vic.h);
  if (Math.abs(lat) < 0.15) {
    const s = vic.d >= ram.d ? 1 : -1;
    dx = -Math.cos(vic.h) * s;
    dz = Math.sin(vic.h) * s;
  }
  knockSide(vic, dx, dz, 12, 0.72);
  if (evVic) {
    evVic('hit', { kind: 'ram', owner: ramId, power: 12 });
    evVic('hackHit', { owner: ramId, type: 5 });
  }
  if (evRam) evRam('ramHit', vicId);
}
