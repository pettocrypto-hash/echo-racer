// RaceView: verbindet Simulation und 3D-Szene – Autos, Echos, Hacks, Boostfelder, Kamera, Effekte.

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { buildCar, disposeCar, echoGeometry } from './carModels.js';
import { cheerQuat, blink, driverMood, flailQuat } from './characters.js';
import { makeHoloMaterial, Trail, Particles, Ambient, SpeedLines, SkidMarks, Confetti } from './fx.js';
import { glowTexture, shadowTexture, nameTexture, textTexture } from './textures.js';
import { DRIFT_COLORS, FLAMES } from '../config.js';
import { H_BARRIER, H_RAMP, H_MIRROR, H_SQUEEZE, H_SHOCK, H_RAM, H_CLONE, SHOCK_R, SHOCK_T } from '../game/hacks.js';
import { clamp, damp, lerp, lerpAngle, wrapAngle } from '../util.js';

const E = {};
const Q = {};
const CPOS = {};
const Q_TMP = new THREE.Quaternion();
const SPOS = {};
const SPROJ = {};
const TILT = { pitch: 0, roll: 0 };
const EPROJ = {};
const WHITE = new THREE.Color(1, 1, 1);
const SIDES = [-1, 1];
// Gänge der Verbrenner-Karts (Nova fährt elektrisch, Pixel stufenlos – keine Fehlzündungen)
const BACKFIRE_GEARS = { komet: 5, viper: 6, glitch: 5, titan: 4 };
const BF = new THREE.Vector3();

const RAINBOW = new THREE.Color();
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const PADQ = { d: 0, drain: false, mirror: false, owner: null };
const TRAIL_N = 16;
const TRAIL_STEP = 0.032;
const SHOTS = ['chase', 'side', 'trackside', 'front', 'aerial', 'wheel', 'trackside', 'chase'];
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class RaceView {
  constructor(renderer, sim, opts = {}) {
    this.renderer = renderer;
    this.sim = sim;
    this.track = sim.track;
    this.localId = opts.localId ?? null;
    this.followId = opts.followId ?? opts.localId ?? sim.cars[0].id;
    this.mode = opts.mode ?? 'race';
    this.scene = new THREE.Scene();
    this.world = buildWorld(this.track, this.track.def.theme, { renderer, quality: renderer.q });
    this.theme = this.world.theme;
    this.scene.add(this.world.root);
    this.scene.fog = this.world.fog;
    this.scene.environment = this.world.envMap;
    this.scene.environmentIntensity = this.theme.env.intensity;
    this.camera = new THREE.PerspectiveCamera(70, renderer.aspect, 0.3, 3200);
    this.particles = new Particles(1800);
    this.scene.add(this.particles.points);
    this.skids = new SkidMarks(900);
    this.scene.add(this.skids.mesh);
    // Reifenrauch / Staub (normal gemischt)
    this.smoke = new Particles(700, true);
    this.scene.add(this.smoke.points);
    this.smokeCol = this.world.themeId === 'canyon' ? '#e2c49c' : this.world.themeId === 'lava' ? '#6a5a58' : '#e8e8f0';
    this.world.setParticles(this.particles);
    this.ambient = new Ambient(this.theme.ambient, renderer.q.details);
    this.scene.add(this.ambient.object);
    // Speed-Streifen hängen an der Kamera (Kamera dafür in die Szene)
    this.speedLines = new SpeedLines(renderer.q.details > 0.5 ? 46 : 28);
    this.camera.add(this.speedLines.mesh);
    this.scene.add(this.camera);
    this.rainK = this.theme.ambient === 'rain' ? renderer.q.details : 0;
    this.confetti = new Confetti(renderer.q.details > 0.5 ? 600 : 300);
    this.scene.add(this.confetti.mesh);
    this.splashQ = {};
    this.drone = this._buildDrone();
    this.scene.add(this.drone.group);
    this.chroma = 0;
    this.slowmo = 0;
    this.pending = [];
    this.beams = !!this.theme.beams && renderer.q.details > 0.3;
    this.carVis = new Map();
    for (const c of sim.cars) this.carVis.set(c.id, this._makeCarVis(c));
    this.echoVis = new Map();
    this.hackVis = new Map();
    this.cam = { x: 0, y: 5, z: 0, yaw: 0, fov: 70, shake: 0, init: false, intro: opts.intro ?? true };
    this.demo = { shot: 0, t: 0, dur: 6, fixed: null, sideSign: 1 };
    this.time = 0;
    this.glitch = 0;
    this.flash = 0;
    this.flashColor = new THREE.Color(1, 1, 1);
    this.fovKick = 0;
    this.trailPts = Array.from({ length: TRAIL_N }, () => ({ x: 0, y: 0, z: 0, h: 0 }));
    this.driftCols = DRIFT_COLORS.map((c) => new THREE.Color(c));
    this.grade = {
      shadow: new THREE.Color(this.theme.grade.shadow),
      high: new THREE.Color(this.theme.grade.high),
    };
    // Qualitätswechsel (adaptiv) → Schattenauflösung anpassen
    this.offQuality = renderer.onQuality((q) => this.world.setShadowSize(q.shadow));
  }

  _makeCarVis(c) {
    const car = buildCar(c.carType, c.color, { envK: this.theme.carEnv, beams: this.beams, shadows: true, number: c.idx + 1, finish: c.paint, driver: c.driver });
    const group = car.root;
    const tilt = car.tilt;
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: new THREE.Color(c.color).multiplyScalar(1.4),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    // Unterboden-Leuchten und Schatten liegen auf der Fahrbahn: eigene Gruppe, die nur deren Neigung übernimmt
    const ground = new THREE.Group();
    group.add(ground);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 5.4), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.07;
    ground.add(glow);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 5.2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.045;
    ground.add(shadow);
    // Boost-Flamme in der gewählten Farbe (Regenbogen wechselt im Update die Farbe)
    const F = FLAMES.find((x) => x.id === c.flame) || FLAMES[0];
    const flameMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(F.color).multiplyScalar(1.8),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flameGeo = new THREE.ConeGeometry(0.26, 1.7, 8, 1, true);
    const flames = [];
    const ex = car.spec.exhaust || [[-0.42, car.spec.tail.y - 0.1, car.spec.tail.z], [0.42, car.spec.tail.y - 0.1, car.spec.tail.z]];
    for (const [fx0, fy0, fz0] of ex) {
      const f = new THREE.Mesh(flameGeo, flameMat);
      f.rotation.x = -Math.PI / 2;
      f.position.set(fx0, fy0, fz0 - 0.85);
      f.visible = false;
      tilt.add(f);
      flames.push(f);
    }
    let label = null;
    if (this.mode !== 'demo' && c.id !== this.localId) {
      label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(c.name, c.color, c.rival), transparent: true, depthWrite: false }));
      label.scale.set(4.4, 1.1, 1);
      label.position.y = car.spec.labelY || 3.35;
      group.add(label);
    }
    this.scene.add(group);
    return { car, group, tilt, ground, glow, glowMat, shadow, flames, flameMat, flameGeo, flameId: F.id, spark: F.spark, exhaust: ex, label, trickSpin: 0, ghostSet: false, bob: Math.random() * 10, cheerT: 0, lean: 0, look: 0 };
  }

  _makeEchoVis(e) {
    const owner = this.sim.byId.get(e.owner);
    const local = this.localId ? this.sim.byId.get(this.localId) : null;
    const type = owner ? owner.carType : local ? local.carType : 0;
    const mat = makeHoloMaterial(e.color, e.kind === 'record' ? { rim: 1.6, base: 0.1, scan: 0.6 } : { rim: 2.4, base: 0.16 });
    const drv = owner ? owner.driver : local ? local.driver : 0;
    const mesh = new THREE.Mesh(echoGeometry(type, drv), mat);
    mesh.frustumCulled = false;
    const trail = new Trail(e.color, TRAIL_N, 0.42);
    this.scene.add(mesh, trail.mesh);
    return { echo: e, mesh, mat, trail };
  }

  _makeHackVis(h) {
    if (h.type === H_SHOCK) return this._makeShockVis(h);
    if (h.type === H_CLONE) return this._makeCloneVis(h);
    if (h.type === H_RAM) return null; // Schild hängt am Auto (siehe update)
    const tr = this.track;
    const mat = makeHoloMaterial(h.color, { rim: 2.8, base: 0.5 });
    let mesh = null;
    let height = 2.2;
    if (h.type === H_BARRIER) {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(h.w * 2, 2.2, 0.9), mat);
      const by = tr.surfaceY(h.s, h.d ?? 0);
      const bk = tr.bankAt(h.s);
      mesh.position.set(h.x, by + 1.1, h.z);
      mat.uniforms.uBottom.value = by - Math.abs(bk) * h.w;
      mesh.rotation.set(0, h.hd, -Math.atan(bk), 'YXZ');
    } else if (h.type === H_RAMP) {
      mesh = new THREE.Mesh(wedgeGeometry(h.w * 2, 7.2, 1.5), mat);
      const by = tr.surfaceY(h.s, h.d ?? 0);
      const bk = tr.bankAt(h.s);
      mesh.position.set(h.x, by, h.z);
      mat.uniforms.uBottom.value = by - 0.5 - Math.abs(bk) * h.w;
      mesh.rotation.set(-Math.atan(tr.slopeAt(h.s)), h.hd, -Math.atan(bk), 'YXZ');
      height = 1.5;
    } else if (h.type === H_MIRROR) {
      const pad = tr.pads[h.pad];
      if (pad) {
        const p = tr.posAt(pad.s, -pad.d, Q);
        mesh = new THREE.Mesh(new THREE.BoxGeometry(pad.w * 2 + 0.4, 0.35, pad.len + 0.4), mat);
        mesh.position.set(p.x, p.y + 0.17, p.z);
        mat.uniforms.uBottom.value = p.y - 0.5 - Math.abs(p.bank) * pad.w;
        mesh.rotation.set(-Math.atan(tr.slopeAt(pad.s)), p.h, -Math.atan(p.bank), 'YXZ');
        mat.uniforms.uBase.value = 0.08;
        mat.uniforms.uRim.value = 1.1;
        height = 0.35;
      }
    } else if (h.type === H_SQUEEZE) {
      mesh = new THREE.Mesh(squeezeGeometry(tr, h), mat);
      mat.uniforms.uBottom.value = 0; // Bodenhöhe steckt je Ecke in aBase
      height = 1.9;
    }
    if (!mesh) return null;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.particles.burst(mesh.position.x, (h.s != null ? tr.heightAt(h.s) : h.s0 != null ? tr.heightAt(h.s0) : mesh.position.y) + 1, mesh.position.z, 26, 9, 0.7, 0.5, h.color, 3, 4);
    return { hack: h, mesh, mat, height };
  }

  // Schockwelle: Leuchtring am Boden + flache Holo-Kuppel, die sich ausbreitet
  _makeShockVis(h) {
    const group = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(h.color).multiplyScalar(1.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 72), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    const domeMat = makeHoloMaterial(h.color, { rim: 2.6, base: 0.04, scan: 0.4 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    group.add(ring, dome);
    group.traverse((o) => (o.frustumCulled = false));
    this.scene.add(group);
    const self = this;
    const hacks = this.sim.hacks;
    let seg = -1;
    return {
      hack: h,
      update(t) {
        const C0 = hacks.shockCenter(h, Math.min(t, h.tE), SPOS);
        const pj = self.track.project(C0.x, C0.z, seg, SPROJ);
        seg = pj.i;
        // auf der Fahrbahn (mit Querneigung), solange das Zentrum auf derselben Ebene bleibt (Brücke)
        const onLvl = h.y == null || Math.abs(self.track.heightAt(pj.s) - h.y) < 2.5;
        const bk = onLvl ? self.track.bankAt(pj.s) : 0;
        group.position.set(C0.x, onLvl ? self.track.surfaceY(pj.s, pj.d) : h.y, C0.z);
        group.rotation.set(onLvl ? -Math.atan(self.track.slopeAt(pj.s)) : 0, Math.atan2(pj.tx, pj.tz), -Math.atan(bk), 'YXZ');
        let r;
        let a;
        if (t < h.tA) {
          // Aufladen: Ring zieht sich zusammen
          const k = clamp((t - h.t0) / Math.max(0.05, h.tA - h.t0), 0, 1);
          r = lerp(4.5, 0.6, k);
          a = 0.4 + 0.6 * k;
          dome.visible = false;
        } else {
          const k = clamp((t - h.tA) / SHOCK_T, 0, 1);
          r = Math.max(0.6, SHOCK_R * easeOut(k));
          a = 1 - clamp((t - h.tA - SHOCK_T * 0.5) / 0.45, 0, 1);
          dome.visible = true;
        }
        ring.scale.setScalar(r);
        ringMat.opacity = a;
        dome.scale.set(r, r * 0.42, r);
        domeMat.uniforms.uAlpha.value = a * 0.9;
        domeMat.uniforms.uTime.value = self.time;
        domeMat.uniforms.uGlitch.value = 0.15;
      },
      dispose() {
        self.scene.remove(group);
        ring.geometry.dispose();
        ringMat.dispose();
        dome.geometry.dispose();
        domeMat.dispose();
      },
    };
  }

  // Echo-Klon: Holo-Kopie des Hacker-Autos mit Lichtspur, fährt schlingernd vor dem Ziel her
  _makeCloneVis(h) {
    const owner = this.sim.byId.get(h.owner);
    const mat = makeHoloMaterial(h.color, { rim: 2.8, base: 0.22 });
    const mesh = new THREE.Mesh(echoGeometry(owner ? owner.carType : 0, owner ? owner.driver : 0), mat);
    mesh.frustumCulled = false;
    const trail = new Trail(h.color, TRAIL_N, 0.5);
    this.scene.add(mesh, trail.mesh);
    const self = this;
    const hacks = this.sim.hacks;
    return {
      hack: h,
      update(t) {
        const P = hacks.clonePos(h, t, CPOS);
        const cy = self.track.surfaceY(P.s, P.d);
        mesh.position.set(P.x, cy, P.z);
        mat.uniforms.uBottom.value = cy - 0.4;
        self._surfaceTilt(P.s, P.h, TILT);
        mesh.rotation.set(TILT.pitch, P.h, TILT.roll, 'YXZ');
        const u = mat.uniforms;
        u.uTime.value = self.time;
        if (t < h.tA) {
          const k = clamp((t - h.t0) / Math.max(0.05, h.tA - h.t0), 0, 1);
          u.uRise.value = 2.2 * k;
          u.uAlpha.value = 0.5 + 0.4 * Math.abs(Math.sin(self.time * 22));
          u.uGlitch.value = 0.8;
        } else if (t < h.tE) {
          u.uRise.value = 10;
          u.uAlpha.value = 1;
          u.uGlitch.value = Math.sin(self.time * 9 + h.id) > 0.9 ? 0.6 : 0.05;
        } else {
          const k = clamp((t - h.tE) / 0.6, 0, 1);
          u.uRise.value = 2.2 * (1 - k);
          u.uAlpha.value = 1 - k;
          u.uGlitch.value = 1;
        }
        for (let i = 0; i < TRAIL_N; i++) {
          hacks.clonePos(h, Math.max(h.tA, t - i * TRAIL_STEP), CPOS);
          const q = self.trailPts[i];
          q.x = CPOS.x;
          q.y = self.track.surfaceY(CPOS.s, CPOS.d);
          q.z = CPOS.z;
          q.h = CPOS.h;
        }
        trail.set(self.trailPts);
        trail.mat.uniforms.uAlpha.value = t < h.tA ? 0 : u.uAlpha.value * 0.8;
      },
      dispose() {
        self.scene.remove(mesh, trail.mesh);
        mat.dispose();
        trail.dispose();
      },
    };
  }

  // Ereignisse aus der Simulation (für Effekte)
  onEvent(ev) {
    const P = this.particles;
    const c = ev.id != null ? this.sim.byId.get(ev.id) : null;
    const v = c ? this.carVis.get(c.id) : null;
    const isMe = c && c.id === this.followId && this.mode !== 'demo';
    const pos = v ? v.group.position : null;
    switch (ev.type) {
      case 'hit':
      case 'bump': {
        const kind = ev.type === 'hit' && ev.data ? ev.data.kind : null;
        const ownerVis = ev.data && ev.data.owner ? this.carVis.get(ev.data.owner) : null;
        if (ownerVis && ev.data.owner !== ev.id) ownerVis.cheerT = 1.4;
        const big = kind === 'shock' || kind === 'ram';
        const oc = ev.data && ev.data.owner ? this.sim.byId.get(ev.data.owner)?.color : null;
        if (pos) {
          P.burst(pos.x, pos.y + 0.8, pos.z, big ? 34 : 18, big ? 14 : 10, 0.5, 0.35, '#ffe9a0', 3);
          if (big && oc) P.burst(pos.x, pos.y + 1, pos.z, 26, 9, 0.7, 0.5, oc, 3, 3);
        }
        if (isMe) {
          this.cam.shake = Math.max(this.cam.shake, big ? 0.85 : ev.type === 'hit' ? 0.55 : 0.3);
          if (kind === 'echo' || kind === 'clone' || big) {
            this.flash = big ? 0.45 : 0.25;
            this.flashColor.set(oc || '#ffffff');
          }
          if (big) this.glitch = Math.max(this.glitch, 0.45);
          if (kind) this.chroma = Math.max(this.chroma, big ? 1 : 0.6);
        }
        break;
      }
      case 'finish': {
        if (!pos) break;
        // Feuerwerk über der Ziellinie, Konfetti am Auto, Tribüne jubelt
        const P0 = this.track.posAt(0, 0, Q);
        const mine = c.id === this.followId && this.mode !== 'demo';
        const n = mine ? 9 : 2;
        const grp = v.group;
        for (let i = 0; i < n; i++) {
          const col = ['#ff3b47', '#ffd23d', '#2f7dff', '#3ccf4e', '#ffffff'][(i + c.idx) % 5];
          const ang = Math.random() * Math.PI * 2;
          const rr = 11 + Math.random() * 8;
          this._later(0.25 + i * 0.33, () => {
            // eigenes Auto: Raketen rund um das (ausrollende) Auto, sonst über der Ziellinie
            const bx = mine ? grp.position.x + Math.sin(ang) * rr : P0.x + (Math.random() - 0.5) * 24;
            const bz = mine ? grp.position.z + Math.cos(ang) * rr : P0.z + (Math.random() - 0.5) * 24;
            const by = mine ? grp.position.y + 6 + Math.random() * 5 : 16 + Math.random() * 10;
            P.burst(bx, by, bz, 70, 12, 1.4, 0.55, col, 3.2, 3);
            P.burst(bx, by, bz, 22, 5, 1.7, 0.4, '#ffffff', 3, 2);
          });
        }
        if (mine) {
          for (const col of ['#ff3b47', '#ffd23d', '#2f7dff', '#3ccf4e']) P.burst(pos.x, pos.y + 2.5, pos.z, 24, 9, 1.6, 0.35, col, 2.2, 3);
          this.confetti.burst(pos.x, pos.y + 2, pos.z, 110, 0, 1, 0, 11, 0.6);
          this.world.cheer(1);
        } else this.world.cheer(0.5);
        break;
      }
      case 'go':
        this.world.cheer(0.8);
        // Konfetti-Kanonen links und rechts am Startbogen
        for (const side of SIDES) {
          const q = this.track.posAt(1, side * (this.track.hw[0] + 0.6), {});
          this.confetti.burst(q.x, q.y + 1.4, q.z, 70, -q.nx * side * 0.45, 1, -q.nz * side * 0.45, 13, 0.35);
        }
        break;
      case 'lap':
        if (c && !c.finished) this.world.cheer(0.4);
        break;
      case 'smash':
        if (pos) {
          P.burst(pos.x, pos.y + 1.0, pos.z, 40, 13, 0.6, 0.45, c.color, 3.2, 2);
          P.burst(pos.x, pos.y + 0.8, pos.z, 16, 8, 0.4, 0.3, '#ffffff', 3, 4);
        }
        if (isMe) {
          this.cam.shake = Math.max(this.cam.shake, 0.3);
          this.fovKick = Math.max(this.fovKick, 4);
        }
        break;
      case 'wall':
        if (pos) P.burst(pos.x, pos.y + 0.6, pos.z, 10, 7, 0.4, 0.3, '#ffd080', 3);
        if (isMe) this.cam.shake = Math.max(this.cam.shake, 0.25);
        break;
      case 'miniBoost':
        if (pos) P.burst(pos.x, pos.y + 0.6, pos.z, 16, 6, 0.5, 0.45, DRIFT_COLORS[ev.data] || '#fff', 3, 2);
        if (isMe) this.fovKick = 6 + (ev.data || 0) * 2;
        break;
      case 'pad':
        if (isMe) this.fovKick = Math.max(this.fovKick, 5);
        break;
      case 'launch':
      case 'jump':
        if (pos) P.burst(pos.x, pos.y + 0.3, pos.z, 14, 5, 0.6, 0.6, '#c8b8ff', 1.6, 3);
        break;
      case 'driftStart':
        if (v) v.hopT = 0.24;
        break;
      case 'rocket':
        if (pos) P.burst(pos.x, pos.y + 0.6, pos.z, 26, 8, 0.5, 0.45, '#ffb04a', 3, 2);
        if (isMe) this.fovKick = Math.max(this.fovKick, 8);
        break;
      case 'stall':
        if (pos) P.burst(pos.x, pos.y + 0.3, pos.z, 30, 4, 0.9, 0.7, '#9a9aa8', 1.2, 2);
        break;
      case 'land':
        this._land(v, pos, 0.07);
        break;
      case 'hardLand':
        if (pos) P.burst(pos.x, pos.y + 0.2, pos.z, 20, 6, 0.6, 0.7, '#bba8a0', 1.2, 4);
        if (isMe) this.cam.shake = Math.max(this.cam.shake, 0.6);
        this._land(v, pos, 0.14);
        break;
      case 'trickLand':
        if (pos) P.burst(pos.x, pos.y + 0.8, pos.z, 22, 8, 0.6, 0.45, '#fff4a0', 3, 2);
        if (isMe) this.fovKick = 6;
        this._land(v, pos, 0.09);
        break;
      case 'reset':
        if (pos) P.burst(pos.x, pos.y + 1, pos.z, 30, 7, 0.8, 0.5, c.color, 3, 1);
        break;
      case 'echo': {
        const e = ev.echo;
        if (e) {
          e.sample(e.t0, E);
          P.burst(E.x, E.y + 1, E.z, 36, 10, 0.9, 0.55, e.color, 3, 2);
        }
        break;
      }
      case 'hack': {
        const h = ev.hack;
        if (!h) break;
        if (h.type === H_SHOCK) {
          // Partikelring startet beim Auslösen (nach der Aufladung) und fliegt mit dem Feld mit
          const C0 = this.sim.hacks.shockCenter(h, h.tA, SPOS);
          const cx = C0.x;
          const cz = C0.z;
          const vx = h.vx;
          const vz = h.vz;
          const cy = h.y ?? 0;
          this._later(h.tA - h.t0, () => {
            for (let i = 0; i < 90; i++) {
              const a = (i / 90) * Math.PI * 2;
              const s = (SHOCK_R / SHOCK_T) * (0.85 + Math.random() * 0.3) * 0.9;
              P.emit(cx, cy + 0.6, cz, vx + Math.cos(a) * s, 0.5 + Math.random() * 1.5, vz + Math.sin(a) * s, 0.4, 0.55, h.color, 3, 0, 0.6);
            }
            P.burst(cx, cy + 0.8, cz, 30, 8, 0.5, 0.45, '#ffffff', 3, 4);
          });
          const me = this.carVis.get(this.followId);
          if (me) {
            const dd = Math.hypot(me.group.position.x - h.x, me.group.position.z - h.z);
            if (dd < SHOCK_R + 10) this.cam.shake = Math.max(this.cam.shake, h.owner === this.followId ? 0.4 : 0.6);
          }
        } else if (h.type === H_RAM) {
          const rv = this.carVis.get(h.owner);
          if (rv) P.burst(rv.group.position.x, rv.group.position.y + 0.8, rv.group.position.z, 34, 10, 0.5, 0.5, h.color, 3, 2);
          if (h.owner === this.followId) this.fovKick = Math.max(this.fovKick, 9);
        }
        // nur kurzer Bildfehler, wenn man selbst getroffen wird (eigene Hacks bleiben scharf)
        if (this.mode !== 'demo' && h.target === this.followId) this.glitch = 0.55;
        this._dataStream(h);
        break;
      }
      default:
        break;
    }
  }

  // Fahrerfigur: in die Kurve lehnen und schauen, beim Boost nach hinten, bei Treffern Kopfschütteln,
  // Jubel (Arme hoch) nach eigenen Treffern, bei Tricks in der Luft und nach dem Zieleinlauf
  _animateDriver(v, c, st, dt) {
    const d = v.car.driver;
    if (!d) return;
    const steerN = st.drift ? st.drift * 0.9 : clamp(st.yaw / 1.6, -1, 1);
    v.lean = damp(v.lean, steerN, 8, dt);
    v.look = damp(v.look, steerN, 5, dt);
    const seatY = v.car.spec.seat.y;
    d.root.rotation.z = v.lean * 0.2;
    d.root.rotation.x = damp(d.root.rotation.x, st.boostT > 0 ? -0.14 : st.brk ? 0.1 : 0, 6, dt);
    d.root.position.y = seatY + Math.abs(Math.sin(v.bob * 1.3)) * 0.02 * Math.min(1, st.spd / 25);
    // Seitenblick: fährt ein anderes Kart dicht neben oder hinter einem, dreht sich der Kopf zu ihm
    let watch = 0;
    let best = 81;
    for (const o of this.sim.cars) {
      if (o === c || o.ghost || o.finished) continue;
      const dx = o.st.x - st.x;
      const dz = o.st.z - st.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= best) continue;
      const rel = wrapAngle(Math.atan2(dx, dz) - st.h);
      if (Math.abs(rel) < 0.6) continue;
      best = d2;
      watch = clamp(rel, -1.35, 1.35);
    }
    if (this.lookBack && c.id === this.followId) watch = 1.5;
    v.watch = damp(v.watch || 0, watch, 6, dt);
    d.head.rotation.y = clamp(-v.look * 0.42 + v.watch * 0.85, -1.4, 1.4);
    const shake = st.hitT < 0.6 ? (1 - st.hitT / 0.6) : 0;
    d.head.rotation.z = Math.sin(this.time * 38) * 0.28 * shake - v.lean * 0.08;
    v.cheerT = Math.max(0, v.cheerT - dt);
    // Mimik und Körpersprache: Jubel (Podest, Tricks, Überholen), Enttäuschung im Ziel ab Platz 4,
    // Schreck mit zappelnden Armen bei Treffern, zusammengebissene Zähne beim Turbo
    const sad = c.finished && c.rank > 3;
    const cheering = !sad && (v.cheerT > 0 || (st.air && st.trick) || c.finished);
    const flail = !c.finished && st.hitT < 0.7;
    const mood = sad ? 'sad' : cheering ? 'joy' : flail || st.hitT < 0.9 ? 'shock' : st.boostT > 0 ? 'grit' : 'neutral';
    driverMood(d, v, mood, dt);
    const k = 1 - Math.exp(-12 * dt);
    d.arms.forEach((arm, i) => {
      const sx = i === 0 ? -1 : 1;
      const target = flail ? flailQuat(sx, this.time + i, Q_TMP) : cheering ? cheerQuat(sx, this.time + i, Q_TMP) : arm.userData.base;
      arm.quaternion.slerp(target, flail ? 1 - Math.exp(-20 * dt) : k);
    });
    blink(d, v, dt);
    if (cheering) d.head.rotation.x = Math.sin(this.time * 9) * 0.12;
    else d.head.rotation.x = damp(d.head.rotation.x, sad ? 0.38 : 0, sad ? 3 : 8, dt);
  }

  // Fehlzündung: kurzer Flammenstoß + Rauchwölkchen aus jedem Auspuff (nur in Kameranähe)
  _backfire(v) {
    const cam = this.camera.position;
    const gp = v.group.position;
    if (Math.abs(cam.x - gp.x) + Math.abs(cam.z - gp.z) > 70) return;
    const P = this.particles;
    const h = v.group.rotation.y;
    const bx = -Math.sin(h);
    const bz = -Math.cos(h);
    v.group.updateMatrixWorld(true);
    for (const [ex, ey, ez] of v.exhaust) {
      const p = v.tilt.localToWorld(BF.set(ex, ey, ez - 0.15));
      for (let i = 0; i < 6; i++) {
        const s = 4 + Math.random() * 4;
        P.emit(p.x, p.y, p.z, bx * s + (Math.random() - 0.5) * 1.6, 0.3 + Math.random() * 1.2, bz * s + (Math.random() - 0.5) * 1.6, 0.08 + Math.random() * 0.08, 0.36, i < 2 ? '#fff2b0' : '#ff7a1a', 3, 0, 5);
      }
      this.smoke.emit(p.x + bx * 0.5, p.y + 0.1, p.z + bz * 0.5, bx * 1.4, 0.6, bz * 1.4, 0.35, 0.28, '#4a4650', 1, -0.6, 2.4);
    }
    v.popT = this.time;
  }

  // Landung: Stauchung je nach Aufprall-Tempo, Staubkranz um die Räder
  _land(v, pos, k) {
    if (!v) return;
    const hit = clamp(-(v.airVy || -8) / 12, 0.45, 1.3);
    v.landT = 0;
    v.landK = k * hit;
    v.airVy = 0;
    if (!pos) return;
    const n = Math.round(5 + hit * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const s = 2.2 + Math.random() * 1.6 * hit;
      this.smoke.emit(pos.x + Math.cos(a) * 1.1, pos.y + 0.25, pos.z + Math.sin(a) * 1.1, Math.cos(a) * s, 0.5 + Math.random() * 0.6, Math.sin(a) * s, 0.4 + Math.random() * 0.25, 0.42, this.smokeCol, 1, -0.3, 2.6);
    }
  }

  // Regen: kleine Spritzer auf der Bahn vor der Kamera (scharfe Mini-Funken, kein Weichzeichner)
  _rainSplashes(dt) {
    if (!this.rainK) return;
    const fc = this.sim.byId.get(this.followId);
    if (!fc) return;
    const tr = this.track;
    const n = Math.min(6, Math.floor(dt * 70 * this.rainK + Math.random()));
    for (let i = 0; i < n; i++) {
      const s = fc.st.s + 3 + Math.random() * 34;
      const k = tr.indexAt(s);
      const p = tr.posAt(s, (Math.random() * 2 - 1) * tr.hw[k] * 0.95, this.splashQ);
      for (let j = 0; j < 4; j++) {
        const a = Math.random() * Math.PI * 2;
        this.particles.emit(p.x, p.y + 0.04, p.z, Math.cos(a) * 1.6, 2.2 + Math.random() * 1.4, Math.sin(a) * 1.6, 0.18 + Math.random() * 0.08, 0.34, '#d8ecff', 1.1, 14, 0);
      }
    }
  }

  // Kamera-Drohne: fliegt vor dem Führenden her und filmt das Feld (Rotoren drehen, rotes Aufnahmelicht blinkt)
  _buildDrone() {
    const group = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x2a2a34, roughness: 0.35, metalness: 0.4 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xf2f2f6, roughness: 0.3 });
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 1.1), body);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.8), accent);
    shell.position.y = 0.22;
    group.add(core, shell);
    const cam = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), body);
    cam.position.set(0, -0.28, 0.42);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), new THREE.MeshBasicMaterial({ color: 0x40d0ff }));
    lens.position.set(0, -0.28, 0.645);
    group.add(cam, lens);
    const rec = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a3a }));
    rec.position.set(0.3, 0.2, 0.5);
    group.add(rec);
    const rotors = [];
    const armG = new THREE.BoxGeometry(1.5, 0.08, 0.12);
    const bladeG = new THREE.BoxGeometry(1.1, 0.02, 0.12);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const arm = new THREE.Mesh(armG, body);
      arm.position.set(sx * 0.55, 0.05, sz * 0.5);
      arm.rotation.y = Math.atan2(sz, -sx);
      group.add(arm);
      const hub = new THREE.Group();
      hub.position.set(sx * 1.05, 0.2, sz * 0.95);
      const blade = new THREE.Mesh(bladeG, accent);
      hub.add(blade);
      group.add(hub);
      rotors.push(hub);
    }
    group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    group.visible = false;
    return { group, rotors, rec, pos: new THREE.Vector3(), init: false };
  }

  // Neigung der Fahrbahn bei s für ein Objekt mit Blickrichtung heading (Hang + Steilkurve):
  // pitch < 0 = Nase hoch (bergauf), roll < 0 = rechte Seite höher – passend zu rotation.x / rotation.z
  _surfaceTilt(s, heading, out) {
    const tr = this.track;
    const k = tr.indexAt(s);
    const sl = tr.slope[k];
    const bk = tr.bankAt(s);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    // Gefälle in Blickrichtung und nach rechts (rechts = (-fz, fx); die Streckennormale n zeigt nach rechts)
    const gF = sl * (fx * tr.tx[k] + fz * tr.tz[k]) + bk * (fx * tr.nx[k] + fz * tr.nz[k]);
    const gR = sl * (fx * tr.tz[k] - fz * tr.tx[k]) + bk * (fx * tr.nz[k] - fz * tr.nx[k]);
    out.pitch = -Math.atan(gF);
    out.roll = -Math.atan(gR);
    return out;
  }

  _updateDrone(dt, renderTime) {
    const D = this.drone;
    const lead = this.sim.ranked[0];
    if (!lead) return;
    const st = lead.st;
    const fx = Math.sin(st.h);
    const fz = Math.cos(st.h);
    const gy = this.track.surfaceY(st.s, st.d || 0) + (st.y || 0);
    // vor dem Führenden, leicht seitlich und erhöht; vor dem Start über der Startlinie
    const ahead = renderTime < 0 ? 16 : 13 + Math.min(10, st.spd * 0.18);
    const tx = st.x + fx * ahead - fz * 4.5;
    const tz = st.z + fz * ahead + fx * 4.5;
    const ty = gy + 5.2 + Math.sin(this.time * 1.7) * 0.25;
    if (!D.init) {
      D.pos.set(tx, ty, tz);
      D.init = true;
    }
    const k = 1 - Math.exp(-2.6 * dt);
    D.pos.x += (tx - D.pos.x) * k;
    D.pos.y += (ty - D.pos.y) * k;
    D.pos.z += (tz - D.pos.z) * k;
    D.group.visible = true;
    D.group.position.copy(D.pos);
    // waagrecht bleiben, nur zum Kart drehen; beim Rückwärtsfliegen leicht nach hinten geneigt
    const yaw = Math.atan2(st.x - D.pos.x, st.z - D.pos.z);
    D.group.rotation.set(-0.1 - Math.min(0.18, st.spd * 0.004), yaw, Math.sin(this.time * 1.3) * 0.05, 'YXZ');
    for (const r of D.rotors) r.rotation.y += dt * 55;
    D.rec.visible = Math.sin(this.time * 6) > -0.2;
  }

  // Strecken-Intro: 1) Überblick von oben (langsamer Schwenk), 2) Flug die Strecke entlang, 3) auf das Startfeld zu
  _introCamera(k, dt) {
    const tr = this.track;
    const L = tr.length;
    const cam = this.camera;
    const Q0 = this._iq || (this._iq = {});
    const Q1 = this._iq2 || (this._iq2 = {});
    const shot = k < 0.33 ? 0 : k < 0.66 ? 1 : 2;
    const u = shot === 0 ? k / 0.33 : shot === 1 ? (k - 0.33) / 0.33 : (k - 0.66) / 0.34;
    const e = u * u * (3 - 2 * u);
    if (shot === 0) {
      const b = tr.bounds;
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const R = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.62;
      const a = 0.6 + e * 0.55;
      cam.position.set(cx + Math.cos(a) * R, 70 - e * 12, cz + Math.sin(a) * R);
      cam.lookAt(cx, 0, cz);
      this.cam.fov = 52;
    } else if (shot === 1) {
      const m = this.world.landmarks && this.world.landmarks[0];
      if (m && m.kind === 'view') {
        // Wahrzeichen in der Ferne (Vulkan): vom nächsten Streckenpunkt aus, Blick schwenkt langsam nach oben
        const p = tr.posAt(m.s, 0, Q0);
        cam.position.set(p.x, p.y + 5 + e * 2, p.z);
        cam.lookAt(m.x, lerp(p.y + 10, m.y, 0.35 + e * 0.4), m.z);
        this.cam.fov = 50;
      } else if (m) {
        // Kreisfahrt um das Wahrzeichen der Welt (Riesenrad, Felsbogen, Insel, Gießkanne, Hochhaus), Kamera auf der Streckenseite
        const a = m.a0 + (e - 0.5) * 1.1;
        cam.position.set(m.x + Math.cos(a) * m.r, m.y + m.r * 0.22, m.z + Math.sin(a) * m.r);
        cam.lookAt(m.x, m.y, m.z);
        this.cam.fov = 52;
      } else {
        const s = L * 0.4 + e * 70;
        const p = tr.posAt(s, 0, Q0);
        const q = tr.posAt(s + 34, 0, Q1);
        cam.position.set(p.x + p.nx * 5, p.y + 6.5, p.z + p.nz * 5);
        cam.lookAt(q.x, q.y + 1, q.z);
        this.cam.fov = 58;
      }
    } else {
      // von hinten über das Startfeld auf den Startbogen zu (Schriftzug lesbar)
      const p = tr.posAt(-52 + e * 16, 2.5, Q0);
      const q = tr.posAt(10, 0, Q1);
      cam.position.set(p.x, p.y + 5.5 - e * 1.8, p.z);
      cam.lookAt(q.x, q.y + 2.2, q.z);
      this.cam.fov = 54;
    }
    this._applyFov(this.cam.fov);
    // Verfolgerkamera danach sauber übernehmen (kein Nachziehen aus der Intro-Position)
    this.cam.init = false;
  }

  // Siegerehrung: Podest (Gold Mitte, Silber links, Bronze rechts) kurz hinter der Ziellinie, die besten drei obendrauf
  startCeremony(ids) {
    if (this.cer || this.mode === 'demo') return;
    const tr = this.track;
    const p = tr.posAt(7, 0, {});
    const group = new THREE.Group();
    const H = [1.6, 1.05, 0.7];
    const OFF = [0, -3.5, 3.5];
    const TOP = ['#ffd23d', '#d8dde8', '#d48a4a'];
    const base = new THREE.MeshStandardMaterial({ color: 0xf4f4fa, roughness: 0.35 });
    const geo = new THREE.BoxGeometry(3.2, 1, 3.2);
    const plateGeo = new THREE.BoxGeometry(3.4, 0.16, 3.4);
    const numGeo = new THREE.PlaneGeometry(1.6, 1.6);
    const spots = [];
    const disp = [geo, plateGeo, numGeo, base];
    for (let i = 0; i < 3; i++) {
      const x = p.x + p.nx * OFF[i];
      const z = p.z + p.nz * OFF[i];
      const blk = new THREE.Mesh(geo, base);
      blk.scale.y = H[i];
      blk.position.set(x, p.y + H[i] / 2, z);
      blk.rotation.y = p.h;
      const tm = new THREE.MeshStandardMaterial({ color: TOP[i], roughness: 0.28, metalness: 0.35, emissive: TOP[i], emissiveIntensity: 0.28 });
      const plate = new THREE.Mesh(plateGeo, tm);
      plate.position.set(x, p.y + H[i] + 0.06, z);
      plate.rotation.y = p.h;
      const nm = new THREE.MeshBasicMaterial({ map: textTexture(String(i + 1), TOP[i], 'rgba(0,0,0,0)', 128, 128), transparent: true });
      const num = new THREE.Mesh(numGeo, nm);
      // Zahl auf der Vorderseite (zur Kamera, also gegen die Fahrtrichtung)
      num.position.set(x - p.tx * 1.62, p.y + H[i] / 2, z - p.tz * 1.62);
      num.rotation.y = p.h + Math.PI;
      for (const m of [blk, plate]) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
      group.add(blk, plate, num);
      disp.push(tm, nm);
      spots.push({ x, y: p.y + H[i] + 0.14, z });
    }
    this.scene.add(group);
    // Karts schauen zur Kamera (gegen die Fahrtrichtung); Kamera steht vor der Ziellinie
    this.cer = { t: 0, group, spots, ids, base: new THREE.Vector3(p.x, p.y, p.z), h: p.h + Math.PI, tx: -p.tx, tz: -p.tz, nx: p.nx, nz: p.nz, burstT: 0, disp };
  }

  _cerPlace(c, v) {
    const i = this.cer.ids.indexOf(c.id);
    if (i < 0) {
      v.group.visible = false;
      return;
    }
    const S = this.cer.spots[i];
    v.group.visible = true;
    v.group.position.set(S.x, S.y, S.z);
    v.group.rotation.y = this.cer.h;
    v.tilt.position.y = 0;
    v.tilt.rotation.set(0, 0, 0);
    v.cheerT = 1;
    if (v.label) v.label.visible = false;
    for (const f of v.flames) f.visible = false;
  }

  _cerUpdate(dt) {
    const C = this.cer;
    C.t += dt;
    C.burstT -= dt;
    if (C.burstT <= 0) {
      C.burstT = 0.22 + Math.random() * 0.2;
      const cols = ['#ff3b47', '#ffd23d', '#2f7dff', '#3ccf4e', '#ffffff'];
      const S = C.spots[Math.floor(Math.random() * 3)];
      this.particles.burst(S.x + (Math.random() - 0.5) * 3, S.y + 4 + Math.random() * 2, S.z + (Math.random() - 0.5) * 3, 22, 7, 1.6, 0.34, cols[Math.floor(Math.random() * cols.length)], 2.4, 4);
      this.confetti.burst(S.x + (Math.random() - 0.5) * 4, S.y + 7, S.z + (Math.random() - 0.5) * 4, 26, 0, 0.3, 0, 4, 0.9);
    }
  }

  // Effekt nach einer Verzögerung in Spielzeit auslösen (läuft mit Pause und Zeitlupe mit)
  _later(delay, fn) {
    this.pending.push({ at: this.time + Math.max(0, delay), fn });
  }

  // Datenstrahl: Partikel fliegen vom Hacker zum Ort des Hacks
  _dataStream(h) {
    const ov = this.carVis.get(h.owner);
    if (!ov) return;
    let tx;
    let ty = 0;
    let tz;
    if (h.type === H_BARRIER || h.type === H_RAMP) {
      const p = this.track.posAt(h.s, h.d ?? 0, Q);
      tx = p.x;
      tz = p.z;
      ty = p.y;
    } else if (h.type === H_CLONE) {
      const p = this.sim.hacks.clonePos(h, h.tA, CPOS);
      tx = p.x;
      tz = p.z;
      ty = p.y;
    } else if (h.type === H_MIRROR) {
      const pad = this.track.pads[h.pad];
      if (!pad) return;
      const p = this.track.posAt(pad.s, -pad.d, Q);
      tx = p.x;
      tz = p.z;
      ty = p.y;
    } else if (h.type === H_SQUEEZE) {
      const p = this.track.posAt(h.s0 + 12, 0, Q);
      tx = p.x;
      tz = p.z;
      ty = p.y;
    } else return;
    const sx = ov.group.position.x;
    const sz = ov.group.position.z;
    const dist = Math.hypot(tx - sx, tz - sz);
    const T = clamp(dist / 90, 0.25, 0.9);
    const P = this.particles;
    for (let i = 0; i < 46; i++) {
      const lag = (i / 46) * 0.35;
      const tt = T * (1 - lag * 0.5);
      // Bogen: Startgeschwindigkeit nach oben, Schwerkraft holt die Partikel am Ziel wieder herunter
      const g = 14;
      const sy = ov.group.position.y + 1.2;
      const vy = (g * tt) / 2 + (ty + 0.6 - sy) / tt;
      P.emit(
        sx + (Math.random() - 0.5) * 0.8, sy + (Math.random() - 0.5) * 0.4, sz + (Math.random() - 0.5) * 0.8,
        (tx - sx) / tt + (Math.random() - 0.5) * 2, vy, (tz - sz) / tt + (Math.random() - 0.5) * 2,
        tt, 0.28 + Math.random() * 0.14, h.color, 3.4, g, 0
      );
    }
  }

  update(dt, alpha, renderTime) {
    this.time += dt;
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.time);
      if (due.length) {
        this.pending = this.pending.filter((p) => p.at > this.time);
        for (const p of due) p.fn();
      }
    }
    const sim = this.sim;
    const P = this.particles;

    // --- Autos ---
    for (const c of sim.cars) {
      const v = this.carVis.get(c.id);
      if (!v) continue;
      const st = c.st;
      const pv = c.prev;
      const x = lerp(pv.x, st.x, alpha) + (c.visOffX || 0);
      const z = lerp(pv.z, st.z, alpha) + (c.visOffZ || 0);
      const y = lerp(pv.y, st.y, alpha);
      const h = lerpAngle(pv.h, st.h, alpha);
      // Fahrbahnhöhe (mit Querneigung) zwischen den Simulationsschritten interpolieren (kein Treppeneffekt am Hang)
      const gyC = pv.s == null ? this.track.surfaceY(st.s, st.d) : lerp(this.track.surfaceY(pv.s, pv.d ?? st.d), this.track.surfaceY(st.s, st.d), alpha);
      const hv = h + st.drift * 0.12;
      v.group.position.set(x, gyC, z);
      v.group.rotation.y = hv;
      // Neigung der Fahrbahn unter dem Kart (Hang + Steilkurve): Kart, Leuchten und Schatten liegen auf
      this._surfaceTilt(st.s, hv, TILT);
      v.ground.rotation.set(TILT.pitch, 0, TILT.roll);
      v.bob += dt * (6 + st.spd * 0.2);
      // Drift-Hüpfer: kurzer Hopser beim Driftbeginn
      v.hopT = Math.max(0, (v.hopT || 0) - dt);
      const hop = v.hopT > 0 ? Math.sin(Math.PI * (1 - v.hopT / 0.24)) * 0.32 : 0;
      v.tilt.position.y = y + hop + Math.sin(v.bob) * 0.015 * Math.min(1, st.spd / 20);
      let roll = clamp(-st.yaw * st.spd * 0.0045, -0.13, 0.13) + TILT.roll;
      let pitch = (st.brk ? 0.035 : st.boostT > 0 ? -0.04 : 0) + TILT.pitch;
      if (st.air) pitch = clamp(-st.vy * 0.025, -0.25, 0.25);
      if (st.trick && st.air) v.trickSpin += dt * 15;
      else v.trickSpin = damp(v.trickSpin, Math.round(v.trickSpin / (Math.PI * 2)) * Math.PI * 2, 12, dt);
      if (st.wob > 0) roll += Math.sin(this.time * 38) * 0.12 * st.wob;
      v.tilt.rotation.set(pitch, 0, roll + v.trickSpin);
      if (st.air) v.airVy = st.vy;
      // Landung: Kart federt ein (gedämpfte Stauchung, Reifen und Karosserie geben nach) und schwingt aus
      if (v.landT != null) {
        v.landT += dt;
        const T = v.landT;
        const sq = v.landK * Math.exp(-T * 7) * Math.cos(T * 24);
        v.tilt.scale.set(1 + sq * 0.45, 1 - sq, 1 + sq * 0.45);
        if (T > 0.7) {
          v.landT = null;
          v.tilt.scale.set(1, 1, 1);
        }
      }
      v.shadow.scale.setScalar(1 / (1 + y * 0.25));
      v.shadow.material.opacity = 0.55 / (1 + y * 0.4);
      if (this.cer) this._cerPlace(c, v);

      // Räder: drehen mit der Fahrt, Vorderräder lenken (im Drift: Gegenlenken)
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      const fwdSpeed = st.vx * fx + st.vz * fz;
      const steerVis = st.drift ? st.drift * 0.38 : -clamp(st.yaw / 1.6, -1, 1) * 0.42;
      for (const w of v.car.wheels) {
        w.mesh.rotation.x += (fwdSpeed / w.r) * dt;
        if (w.front) w.pivot.rotation.y = damp(w.pivot.rotation.y, steerVis, 14, dt);
      }
      v.car.brakeMat.opacity = damp(v.car.brakeMat.opacity, st.brk ? 1 : 0, 18, dt);
      if (v.car.bodyMat.userData.uTime) v.car.bodyMat.userData.uTime.value = this.time;
      this._animateDriver(v, c, st, dt);

      if (c.ghost && !v.ghostSet && !(c.id === this.followId && this.mode !== 'demo')) {
        v.ghostSet = true;
        for (const m of [v.car.bodyMat, v.car.lightMat]) {
          m.transparent = true;
          m.opacity = 0.35;
          m.depthWrite = false;
        }
        v.car.body.castShadow = false;
        for (const w of v.car.wheels) w.mesh.castShadow = false;
        if (v.car.stickers) v.car.stickers.visible = false;
      }

      // Rammstoß-Schild: Holo-Blase um das Auto, vorne Funken
      if (st.shieldT > 0) {
        if (!v.shield) {
          const sm = makeHoloMaterial(c.color, { rim: 3.2, base: 0.1, scan: 0.7 });
          v.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), sm);
          v.shield.scale.set(1.8, 1.6, 2.9);
          v.shield.position.y = (v.car.spec.seat ? v.car.spec.seat.y : 0.5) + 0.55;
          v.shield.frustumCulled = false;
          v.tilt.add(v.shield);
          v.shieldMat = sm;
          v.shieldK = 0;
        }
        v.shield.visible = true;
        v.shieldK = Math.min(1, v.shieldK + dt * 8);
        const su = v.shieldMat.uniforms;
        su.uAlpha.value = v.shieldK * Math.min(1, st.shieldT * 3) * (0.75 + 0.25 * Math.sin(this.time * 31));
        su.uTime.value = this.time;
        su.uGlitch.value = st.shieldT < 0.35 ? 0.6 : 0.05;
        v.shield.scale.set(1.8, 1.6, 2.9 + Math.sin(this.time * 18) * 0.06);
        if (Math.random() < 0.7) {
          P.emit(x + fx * 2.9 + (Math.random() - 0.5) * 1.6, gyC + 0.5 + Math.random() * 0.8, z + fz * 2.9 + (Math.random() - 0.5) * 1.6, st.vx * 0.6 + (Math.random() - 0.5) * 6, 1 + Math.random() * 2, st.vz * 0.6 + (Math.random() - 0.5) * 6, 0.25, 0.32, c.color, 3, 0, 2);
        }
      } else if (v.shield && v.shield.visible) {
        v.shield.visible = false;
        v.shieldK = 0;
      }

      const boosting = st.boostT > 0;
      for (const f of v.flames) {
        f.visible = boosting;
        if (boosting) f.scale.set(1, 0.7 + Math.random() * 0.6 * (0.7 + st.boostP * 0.4), 1);
      }
      if (boosting && v.flameId === 'rainbow') v.flameMat.color.setHSL((this.time * 0.9 + v.bob) % 1, 1, 0.55).multiplyScalar(1.8);
      // Unterboden-Leuchten: nachts kräftig, bei Tageslicht nur ein Hauch (sonst wirkt es wie ein Unschärfe-Fleck)
      v.glowMat.opacity = ((c.ghost ? 0.3 : 0.75) + (boosting ? 0.25 : 0) + Math.sin(this.time * 3 + v.bob) * 0.05) * (this.theme.beams ? 1 : 0.35);

      // Partikel
      const rx = -fz;
      const rz = fx;
      // Reifenspuren der Hinterräder beim Driften, harten Bremsen und Durchdrehen
      const skidding = !st.air && ((st.drift && st.spd > 10) || (st.brk && st.spd > 14) || st.stallT > 0);
      if (skidding) {
        const ws = v.car.spec.r;
        if (!v.skid) v.skid = [null, null];
        // Gefälle der Fahrbahn (Hang + Querneigung) – Spuren liegen auf, auch in Steilkurven
        const tr = this.track;
        const kG = tr.indexAt(st.s);
        const bkG = tr.bankAt(st.s);
        const gX = tr.slope[kG] * tr.tx[kG] + bkG * tr.nx[kG];
        const gZ = tr.slope[kG] * tr.tz[kG] + bkG * tr.nz[kG];
        for (let wi = 0; wi < 2; wi++) {
          const side = SIDES[wi];
          const wx = x + fx * ws.z + rx * side * ws.x;
          const wz = z + fz * ws.z + rz * side * ws.x;
          const prev = v.skid[wi];
          if (!prev) v.skid[wi] = { x: wx, z: wz };
          else if (Math.hypot(wx - prev.x, wz - prev.z) > 0.7) {
            const yB = tr.surfaceY(st.s, st.d + (wx - x) * tr.nx[kG] + (wz - z) * tr.nz[kG]) + 0.03;
            this.skids.add(prev.x, prev.z, wx, wz, yB - gX * (wx - prev.x) - gZ * (wz - prev.z), ws.w * 0.8, gX, gZ);
            prev.x = wx;
            prev.z = wz;
          }
        }
      } else if (v.skid) v.skid = null;
      // Countdown: Motoren werden hochgedreht – kleine Abgaswölkchen aus dem Auspuff
      if (renderTime < 0.4 && renderTime > -3.2 && !st.air && Math.random() < 0.09) {
        this.smoke.emit(x - fx * 1.7 + rx * (Math.random() - 0.5) * 0.8, gyC + 0.55, z - fz * 1.7 + rz * (Math.random() - 0.5) * 0.8, -fx * 1.6, 0.9, -fz * 1.6, 0.55, 0.32, '#9a98a8', 1, -0.6, 1.6);
      }
      // Reifenrauch beim Driften und Durchdrehen
      if (((st.drift && st.spd > 10) || st.stallT > 0) && !st.air && Math.random() < 0.32) {
        for (const side of SIDES) {
          const bx = x - fx * 1.3 + rx * side * 0.95;
          const bz = z - fz * 1.3 + rz * side * 0.95;
          this.smoke.emit(bx, gyC + 0.3, bz, -fx * 2 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.8, -fz * 2 + (Math.random() - 0.5) * 1.5, 0.45 + Math.random() * 0.3, 0.55, this.smokeCol, 1, -0.8, 2.2);
        }
      }
      // Fehlzündung beim Hochschalten (gleiche Gangstufen wie der Motorklang) und beim Gaswegnehmen in voller Fahrt
      const G = BACKFIRE_GEARS[c.stats.id];
      if (G && !c.ghost) {
        const gear = Math.min(G - 1, Math.floor(Math.max(0, st.spd / c.stats.top) * G));
        const thr = c.input ? c.input.throttle ?? 1 : 1;
        if (!st.air && ((v.gear != null && gear > v.gear) || (v.thr > 0.5 && thr < 0.2 && st.spd > 22))) this._backfire(v);
        v.gear = gear;
        v.thr = thr;
      }
      // Regen: Gischt hinter den Hinterrädern – Sprühnebel + feine Tropfen, mit dem Tempo stärker (nur in Kameranähe)
      if (this.rainK && !c.ghost && !st.air && st.spd > 12 && Math.random() < Math.min(1, (st.spd - 12) / 16) * this.rainK) {
        const cam = this.camera.position;
        if (Math.abs(cam.x - x) + Math.abs(cam.z - z) < 70) {
          // die Gischt wird vom Fahrtwind mitgezogen: ~¾ des Kart-Tempos, bleibt so als kurze Fahne hinter den Rädern
          const vxC = st.vx * 0.8;
          const vzC = st.vz * 0.8;
          for (const side of SIDES) {
            const bx = x - fx * 1.3 + rx * side * 0.92;
            const bz = z - fz * 1.3 + rz * side * 0.92;
            this.smoke.emit(bx, gyC + 0.3, bz, vxC + rx * side * 1.3 + (Math.random() - 0.5) * 1.4, 0.8 + Math.random() * 1.2, vzC + rz * side * 1.3 + (Math.random() - 0.5) * 1.4, 0.14 + Math.random() * 0.1, 0.3, '#9fb3d6', 0.8, -0.3, 1.5);
            if (Math.random() < 0.8) P.emit(bx, gyC + 0.2, bz, vxC + rx * side * 2.2 + (Math.random() - 0.5) * 2, 2 + Math.random() * 2.2, vzC + rz * side * 2.2 + (Math.random() - 0.5) * 2, 0.22 + Math.random() * 0.12, 0.12, '#d8ecff', 1.1, 14, 1);
          }
        }
      }
      if (st.drift && !st.air && st.spd > 8) {
        const lvl = st.driftLvl;
        const colr = this.driftCols[lvl];
        const nE = lvl > 0 ? 2 : 1;
        for (let k = 0; k < nE; k++) {
          for (const side of SIDES) {
            const bx = x - fx * 1.45 + rx * side * 0.95;
            const bz = z - fz * 1.45 + rz * side * 0.95;
            const out = -st.drift * side > 0 ? 1 : 0.4;
            P.emit(
              bx, gyC + 0.15, bz,
              -fx * 3 + rx * side * 3 * out + (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2.5, -fz * 3 + rz * side * 3 * out + (Math.random() - 0.5) * 2,
              0.25 + Math.random() * 0.2, lvl > 0 ? 0.3 : 0.26, colr, lvl > 0 ? 3.5 : 0.7, 8, 2
            );
          }
        }
      }
      if (st.scr && st.spd > 10) {
        const side = st.d > 0 ? 1 : -1;
        P.emit(x + rx * side * 1.05, gyC + 0.4, z + rz * side * 1.05, -st.vx * 0.2 + (Math.random() - 0.5) * 4, 2 + Math.random() * 3, -st.vz * 0.2 + (Math.random() - 0.5) * 4, 0.35, 0.28, '#ffd27a', 3.5, 14, 1);
      }
      if (boosting && Math.random() < 0.6) {
        const sc = v.flameId === 'rainbow' ? RAINBOW.setHSL(Math.random(), 1, 0.6) : v.spark;
        P.emit(x - fx * 2.9, gyC + 0.5 + y, z - fz * 2.9, -fx * 6 + (Math.random() - 0.5) * 2, Math.random() * 1.5, -fz * 6 + (Math.random() - 0.5) * 2, 0.22, 0.3, sc, 1.6, 0, 3);
      }
      if (st.onPad === 2 && Math.random() < 0.5) {
        P.emit(x + (Math.random() - 0.5) * 2, gyC + 0.3, z + (Math.random() - 0.5) * 3, 0, 3, 0, 0.4, 0.4, '#ff2040', 3, 0, 1);
      }

      if (v.label) {
        const cam = this.camera.position;
        const dd = Math.hypot(cam.x - x, cam.z - z);
        v.label.visible = dd < 140 && dd > 3.5 && !c.ghost && !this.cer;
        v.label.position.y = 3.1 + y;
        // aus der Nähe kleiner, damit das Schild nicht das Bild füllt
        const k = clamp(dd / 30, 0.3, 1);
        v.label.scale.set(4.4 * k, 1.1 * k, 1);
        v.label.material.opacity = clamp((dd - 3.5) / 5, 0, 1);
      }
    }

    // --- Echos ---
    for (const e of sim.echoes) if (!this.echoVis.has(e.id)) this.echoVis.set(e.id, this._makeEchoVis(e));
    for (const [id, v] of this.echoVis) {
      const e = v.echo;
      if (!sim.echoes.includes(e)) {
        this.scene.remove(v.mesh, v.trail.mesh);
        v.mat.dispose();
        v.trail.dispose();
        this.echoVis.delete(id);
        continue;
      }
      if (renderTime < e.t0 || this.cer) {
        v.mesh.visible = false;
        v.trail.mesh.visible = false;
        continue;
      }
      v.mesh.visible = true;
      v.trail.mesh.visible = true;
      e.sample(renderTime, E);
      v.mesh.position.set(E.x, E.y, E.z);
      this.track.project(E.x, E.z, v.seg ?? -1, EPROJ);
      v.seg = EPROJ.i;
      this._surfaceTilt(EPROJ.s, E.h, TILT);
      v.mesh.rotation.set(TILT.pitch, E.h, TILT.roll, 'YXZ');
      const age = renderTime - e.t0;
      const solidForMe = e.kind === 'record' ? false : this.localId ? e.solidFor(this.localId) : true;
      let a = Math.min(1, age / 0.8);
      if (!solidForMe) a *= e.kind === 'record' ? 0.7 : 0.38 + 0.12 * Math.sin(this.time * 18);
      v.mat.uniforms.uAlpha.value = a;
      v.mat.uniforms.uTime.value = this.time;
      v.mat.uniforms.uGlitch.value = age < 0.8 ? 1 - age / 0.8 : Math.sin(this.time * 3.1 + id) > 0.985 ? 0.6 : 0;
      for (let i = 0; i < TRAIL_N; i++) e.sample(Math.max(e.t0, renderTime - i * TRAIL_STEP), this.trailPts[i]);
      v.trail.set(this.trailPts);
      v.trail.mat.uniforms.uAlpha.value = a * 0.75;
    }

    // --- Hacks ---
    const live = new Set();
    for (const h of sim.hacks.list) {
      live.add(h.id);
      if (!this.hackVis.has(h.id)) {
        const hv = this._makeHackVis(h);
        if (hv) this.hackVis.set(h.id, hv);
      }
    }
    for (const [id, v] of this.hackVis) {
      const h = v.hack;
      if (!live.has(id)) {
        if (v.dispose) v.dispose();
        else {
          this.scene.remove(v.mesh);
          v.mesh.geometry.dispose();
          v.mat.dispose();
        }
        this.hackVis.delete(id);
        continue;
      }
      if (v.update) {
        v.update(renderTime);
        continue;
      }
      const u = v.mat.uniforms;
      u.uTime.value = this.time;
      const t = renderTime;
      if (t < h.tA) {
        const k = clamp((t - h.t0) / Math.max(0.05, h.tA - h.t0), 0, 1);
        u.uRise.value = v.height * k;
        u.uAlpha.value = 0.45 + 0.35 * Math.abs(Math.sin(this.time * 24));
        u.uGlitch.value = 0.7;
      } else if (t < h.tE) {
        u.uRise.value = 10;
        u.uAlpha.value = 1;
        u.uGlitch.value = Math.sin(this.time * 7 + id) > 0.97 ? 0.5 : 0.02;
      } else {
        const k = clamp((t - h.tE) / 0.6, 0, 1);
        u.uRise.value = v.height * (1 - k);
        u.uAlpha.value = 1 - k;
        u.uGlitch.value = 1;
      }
    }

    // --- Boostfelder (gespiegelt / bremsend) ---
    for (const m of this.world.pads) {
      const pad = m.userData.pad;
      sim.hacks.padState(pad, this.localId ?? '-', renderTime, PADQ);
      const p = this.track.posAt(pad.s, PADQ.d, Q);
      m.position.set(p.x, p.y + 0.05, p.z);
      if (PADQ.mirror) {
        const ownerCol = this.sim.byId.get(PADQ.owner)?.color || '#ffffff';
        m.material.color.set(PADQ.drain ? '#ff1e3c' : ownerCol).multiplyScalar(2.6 + Math.sin(this.time * 20) * 0.6);
      } else {
        m.material.color.copy(m.userData.baseColor);
      }
    }

    this._updateCamera(dt, renderTime);
    const focusVis = this.carVis.get(this.followId);
    this.world.update(this.time, this.camera, this.cer ? this.cer.base : focusVis ? focusVis.group.position : null);
    if (this.cer) this._cerUpdate(dt);
    // Startampel: je Countdown-Sekunde ein rotes Paar mehr, beim Start grün
    this.world.setStartLights(renderTime < -3 ? 0 : renderTime < 0 ? Math.min(3, Math.floor(renderTime + 4)) : renderTime < 2.5 ? 'go' : 0);

    const r = this.renderer;
    const scale = r.height / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    this._rainSplashes(dt);
    this.confetti.update(dt);
    this._updateDrone(dt, renderTime);
    P.update(dt, scale);
    this.smoke.update(dt, scale);
    this.skids.update(this.time);
    this.ambient.update(this.time, this.camera.position, scale);

    // Bildschirmeffekte + Farbstimmung der Welt
    const fc = sim.byId.get(this.followId);
    const fst = fc ? fc.st : null;
    const top = fc ? fc.stats.top : 50;
    const spdN = fst ? clamp((fst.spd - top * 0.55) / (top * 0.6), 0, 1) : 0;
    const demo = this.mode === 'demo';
    // alles scharf: keine Geschwindigkeits-Unschärfe (Tempo zeigen Sichtfeld und Speed-Streifen)
    r.fx.speed = 0;
    this.glitch = Math.max(0, this.glitch - dt * 3.5);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    r.fx.glitch = this.glitch;
    r.fx.flash = this.flash * 0.35;
    r.fx.flashColor.copy(this.flashColor);
    r.fx.time = this.time;
    const th = this.theme;
    r.fx.bloom = th.bloom;
    r.fx.bloomThreshold = th.bloomThreshold;
    r.fx.exposure = th.exposure;
    r.fx.sat = th.grade.sat;
    r.fx.contrast = th.grade.contrast;
    r.fx.shadowTint.copy(this.grade.shadow);
    r.fx.highTint.copy(this.grade.high);
    r.fx.vignette = demo ? 0.25 : 0.16;
    r.fx.sharpen = 0.5;
    // Treffer-Farbsaum + Zeitlupe (Fotofinish): entsättigt, Ränder dunkler
    this.chroma = Math.max(0, this.chroma - dt * 3.2);
    const sm = clamp(this.slowmo, 0, 1);
    r.fx.chroma = this.chroma * 0.45 + sm * 0.2;
    r.fx.sat *= 1 - sm * 0.55;
    r.fx.vignette += sm * 0.4;
    // Speed-Streifen: beim Boost und bei Höchsttempo
    const lineK = demo || !fst || fc.finished ? 0 : clamp((fst.boostT > 0 ? 0.45 : 0) + Math.max(0, spdN - 0.9) * 0.6 + (fst.drafting ? 0.12 : 0) + (fst.shieldT > 0 ? 0.3 : 0), 0, 0.6);
    this.lineK = damp(this.lineK || 0, lineK, 6, dt);
    this.speedLines.update(this.time, fst ? Math.max(20, fst.spd) : 40, this.lineK * 0.85, fst && fst.shieldT > 0 ? this.carVis.get(this.followId)?.glowMat.color || WHITE : WHITE);
  }

  _updateCamera(dt, renderTime) {
    if (this.mode === 'demo') {
      this._demoCamera(dt);
      return;
    }
    if (this.introK != null) {
      this._introCamera(this.introK, dt);
      return;
    }
    if (this.cer) {
      // Siegerehrung: Kamera vor dem Podest, schwenkt langsam hin und her
      const C = this.cer;
      const a = Math.sin(C.t * 0.45) * 0.42;
      const dx = C.tx * Math.cos(a) - C.nx * Math.sin(a);
      const dz = C.tz * Math.cos(a) - C.nz * Math.sin(a);
      const dist = 13 - Math.min(1, C.t / 3) * 2.5;
      this.camera.position.set(C.base.x + dx * dist, C.base.y + 3.6, C.base.z + dz * dist);
      this.camera.lookAt(C.base.x, C.base.y + 2.0, C.base.z);
      this.cam.fov = damp(this.cam.fov, 46, 3, dt);
      this._applyFov(this.cam.fov);
      return;
    }
    const cam = this.cam;
    const c = this.sim.byId.get(this.followId) || this.sim.cars[0];
    const v = this.carVis.get(c.id);
    const pos = v.group.position;
    const st = c.st;
    const spd = st.spd;
    if (c.finished && c.finishTime != null && renderTime > c.finishTime + 0.4) {
      // Ehrenrunde: Kamera schwenkt aus der Verfolgerposition in einen Kreis um das Auto (relativ zum Auto)
      if (cam.fin == null) {
        cam.fin = 0;
        cam.offX = cam.x - pos.x;
        cam.offZ = cam.z - pos.z;
        cam.offY = cam.y - pos.y;
        cam.finA = Math.atan2(cam.offX, cam.offZ);
      }
      cam.fin = Math.min(1, cam.fin + dt * 0.7);
      const k = easeInOut(cam.fin);
      const a = cam.finA + (renderTime - c.finishTime - 0.4) * 0.35;
      cam.x = pos.x + lerp(cam.offX, Math.sin(a) * 8.5, k);
      cam.z = pos.z + lerp(cam.offZ, Math.cos(a) * 8.5, k);
      cam.y = pos.y + lerp(cam.offY, 2.9, k);
      this.camera.position.set(cam.x, cam.y, cam.z);
      this.camera.lookAt(pos.x, pos.y + 1.3, pos.z);
      cam.fov = damp(cam.fov, 50, 3, dt);
      this._applyFov(cam.fov);
      return;
    }
    const top = c.stats.top;
    const velYaw = spd > 4 ? Math.atan2(st.vx, st.vz) : st.h;
    const targetYaw = lerpAngle(st.h, velYaw, 0.55);
    const camY = v.car.spec.camY || 0;
    const dist = 6.3 + spd * 0.03;
    const height = 2.95 + spd * 0.01 + camY;
    const lookAhead = 5;
    if (!cam.init) {
      cam.yaw = targetYaw;
      cam.x = pos.x - Math.sin(cam.yaw) * dist;
      cam.z = pos.z - Math.cos(cam.yaw) * dist;
      cam.y = height;
      cam.init = true;
    }
    cam.yaw = lerpAngle(cam.yaw, targetYaw, 1 - Math.exp(-dt * 5));
    let tx = pos.x - Math.sin(cam.yaw) * dist;
    let tz = pos.z - Math.cos(cam.yaw) * dist;
    let ty = pos.y + v.tilt.position.y * 0.7 + height;

    // Kamerafahrt während des Countdowns
    if (cam.intro && renderTime < 0) {
      const k = easeInOut(clamp((renderTime + 3) / 3, 0, 1));
      const ang = cam.yaw + Math.PI * 0.85 * (1 - k);
      const rr = lerp(13, dist, k);
      tx = pos.x - Math.sin(ang) * rr;
      tz = pos.z - Math.cos(ang) * rr;
      ty = lerp(pos.y + 5.5, ty, k);
      cam.x = tx;
      cam.z = tz;
      cam.y = ty;
    } else if (this.lookBack) {
      // Rückblick: Kamera springt vor das Auto und schaut nach hinten
      cam.x = pos.x + Math.sin(cam.yaw) * (dist * 0.85);
      cam.z = pos.z + Math.cos(cam.yaw) * (dist * 0.85);
      cam.y = ty - 0.4;
      cam.back = true;
    } else {
      if (cam.back) {
        // beim Loslassen ohne Schwenk zurück hinter das Auto
        cam.x = tx;
        cam.z = tz;
        cam.y = ty;
        cam.back = false;
      }
      cam.x = damp(cam.x, tx, 14, dt);
      cam.z = damp(cam.z, tz, 14, dt);
      cam.y = damp(cam.y, ty, 8, dt);
    }
    cam.y = Math.max(cam.y, pos.y + 0.8);

    cam.shake = Math.max(0, cam.shake - dt * 2.2);
    const sh = cam.shake * cam.shake * 0.6;
    this.camera.position.set(cam.x + (Math.random() - 0.5) * sh, cam.y + (Math.random() - 0.5) * sh, cam.z + (Math.random() - 0.5) * sh);
    const look = cam.back ? -lookAhead * 2 : lookAhead;
    const lx = pos.x + Math.sin(cam.yaw) * look;
    const lz = pos.z + Math.cos(cam.yaw) * look;
    const ly = pos.y + v.tilt.position.y * 0.6 + 1.5 + camY * 0.6;
    this.camera.lookAt(lx, ly, lz);
    // Steilkurven: Kamera neigt sich halb mit der Fahrbahn (Horizont kippt leicht – mehr Tempogefühl)
    {
      const kC = this.track.indexAt(st.s);
      const gC = this.track.bankAt(st.s) * (Math.sin(cam.yaw) * this.track.nz[kC] - Math.cos(cam.yaw) * this.track.nx[kC]);
      cam.roll = damp(cam.roll || 0, st.air ? cam.roll || 0 : Math.atan(gC) * 0.5, 4, dt);
      this.camera.rotateZ(cam.roll);
    }

    this.fovKick = Math.max(0, this.fovKick - dt * 9);
    const aspect = this.renderer.aspect;
    let fov = 60 + clamp(spd / top, 0, 1.4) * 12 + (st.boostT > 0 ? 5 : 0) + this.fovKick;
    // horizontales Sichtfeld begrenzen (sonst wirkt alles auf 20:9-Handys winzig)
    const maxH = (2 * Math.atan(Math.tan(((50 + (fov - 60) * 0.5) * Math.PI) / 180) / aspect) * 180) / Math.PI;
    fov = Math.min(fov, maxH);
    if (aspect < 1) fov += 18 * (1 - aspect);
    cam.fov = damp(cam.fov, fov, 6, dt);
    this._applyFov(cam.fov);
  }

  _applyFov(fov) {
    this.camera.fov = fov;
    this.camera.aspect = this.renderer.aspect;
    this.camera.updateProjectionMatrix();
  }

  // Menü-Hintergrund: wechselnde Einstellungen wie bei einer TV-Übertragung, harte Schnitte mit Glitch
  _demoCamera(dt) {
    const D = this.demo;
    D.t += dt;
    if (D.t > D.dur || !this.cam.init) {
      if (this.cam.init) {
        D.shot = (D.shot + 1) % SHOTS.length;
        this.glitch = 0.35;
        if (D.shot % 2 === 0) {
          const ids = this.sim.cars.filter((c) => !c.ghost).map((c) => c.id);
          this.followId = ids[Math.floor(Math.random() * ids.length)] || this.followId;
        }
      }
      D.t = 0;
      D.dur = 5 + Math.random() * 2.5;
      D.sideSign = Math.random() < 0.5 ? -1 : 1;
      D.fixed = null;
      this.cam.init = true;
    }
    const c = this.sim.byId.get(this.followId) || this.sim.cars[0];
    const v = this.carVis.get(c.id);
    const pos = v.group.position;
    const h = v.group.rotation.y;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = -fz;
    const rz = fx;
    const y0 = pos.y + v.tilt.position.y;
    const shot = SHOTS[D.shot];
    let cx;
    let cy;
    let cz;
    let lx = pos.x;
    let ly = y0 + 0.9;
    let lz = pos.z;
    let fov = 50;
    if (shot === 'chase') {
      cx = pos.x - fx * 7.5 + rx * 1.4 * D.sideSign;
      cz = pos.z - fz * 7.5 + rz * 1.4 * D.sideSign;
      cy = y0 + 1.7;
      lx += fx * 4;
      lz += fz * 4;
      fov = 55;
    } else if (shot === 'side') {
      const slide = -2 + D.t * 0.6;
      cx = pos.x + rx * 7 * D.sideSign + fx * slide;
      cz = pos.z + rz * 7 * D.sideSign + fz * slide;
      cy = y0 + 1.2;
      fov = 42;
    } else if (shot === 'front') {
      cx = pos.x + fx * 8 + rx * 1.0 * D.sideSign;
      cz = pos.z + fz * 8 + rz * 1.0 * D.sideSign;
      cy = y0 + 1.6;
      fov = 50;
    } else if (shot === 'aerial') {
      const a = h + D.t * 0.3 + D.sideSign;
      cx = pos.x + Math.sin(a) * 26;
      cz = pos.z + Math.cos(a) * 26;
      cy = y0 + 15;
      fov = 50;
    } else if (shot === 'wheel') {
      cx = pos.x + rx * 1.9 * D.sideSign + fx * 3.2;
      cz = pos.z + rz * 1.9 * D.sideSign + fz * 3.2;
      cy = y0 + 0.45;
      lx -= fx * 2;
      lz -= fz * 2;
      ly = y0 + 0.6;
      fov = 62;
    } else {
      // Feste Kamera am Streckenrand, das Feld rauscht vorbei
      if (!D.fixed) {
        const tr = this.track;
        const s = c.st.s + 55 + c.st.spd * 0.6;
        const k = tr.indexAt(s);
        // auf der Bahnleiste: dort steht nie Kulisse und kein Auto kommt hin
        const p = tr.posAt(s, D.sideSign * (tr.hw[k] + 0.25), {});
        D.fixed = { x: p.x, y: p.y + 2.4, z: p.z };
      }
      cx = D.fixed.x;
      cy = D.fixed.y;
      cz = D.fixed.z;
      fov = 38;
    }
    const cam = this.cam;
    if (D.t < dt * 1.5 || shot === 'trackside') {
      cam.x = cx;
      cam.y = cy;
      cam.z = cz;
    } else {
      cam.x = damp(cam.x, cx, 10, dt);
      cam.y = damp(cam.y, cy, 10, dt);
      cam.z = damp(cam.z, cz, 10, dt);
    }
    this.camera.position.set(cam.x, Math.max(0.3, cam.y), cam.z);
    this.camera.lookAt(lx, ly, lz);
    cam.fov = fov;
    this._applyFov(fov);
  }

  setFollow(id) {
    this.followId = id;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.offQuality();
    this.speedLines.dispose();
    for (const v of this.carVis.values()) {
      disposeCar(v.car);
      if (v.shield) {
        v.shield.geometry.dispose();
        v.shieldMat.dispose();
      }
      v.glowMat.dispose();
      v.glow.geometry.dispose();
      v.shadow.geometry.dispose();
      v.shadow.material.dispose();
      v.flameMat.dispose();
      v.flameGeo.dispose();
      if (v.label) {
        v.label.material.map.dispose();
        v.label.material.dispose();
      }
    }
    for (const v of this.echoVis.values()) {
      v.mat.dispose();
      v.trail.dispose();
    }
    for (const v of this.hackVis.values()) {
      if (v.dispose) {
        v.dispose();
        continue;
      }
      v.mesh.geometry.dispose();
      v.mat.dispose();
    }
    this.particles.dispose();
    this.smoke.dispose();
    this.skids.dispose();
    this.ambient.dispose();
    if (this.cer) for (const d of this.cer.disp) d.dispose();
    this.confetti.dispose();
    this.drone.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    this.world.dispose();
  }
}

function wedgeGeometry(w, len, hgt) {
  const hw = w / 2;
  const hl = len / 2;
  // Rampe steigt von hinten (z=-hl, Höhe 0) nach vorne (z=+hl, Höhe hgt)
  const v = [
    [-hw, 0, -hl], [hw, 0, -hl], [hw, 0, hl], [-hw, 0, hl],
    [-hw, hgt, hl], [hw, hgt, hl],
  ];
  const tris = [
    [0, 4, 3], [0, 1, 5], [0, 5, 4],
    [3, 4, 5], [3, 5, 2],
    [1, 2, 5],
    [0, 3, 4],
  ];
  const pos = [];
  for (const t of tris) for (const i of t) pos.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function squeezeGeometry(tr, h) {
  const len = tr.wrapS(h.s1 - h.s0);
  const pos = [];
  const base = [];
  const pts = [];
  for (let ds = 0; ds <= len + 0.01; ds += 2) {
    const s = h.s0 + Math.min(ds, len);
    const k = tr.indexAt(s);
    const hwS = tr.hw[k];
    const taper = Math.max(0, Math.min(1, ds / 12, (len - ds) / 12));
    pts.push(tr.posAt(s, h.side * (hwS - 0.8 * hwS * taper), {}));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y + 1.9, b.z);
    pos.push(a.x, a.y, a.z, b.x, b.y + 1.9, b.z, a.x, a.y + 1.9, a.z);
    base.push(a.y, b.y, b.y, a.y, b.y, a.y);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 1));
  g.computeVertexNormals();
  return g;
}
