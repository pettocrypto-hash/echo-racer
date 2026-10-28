// Baut die statische 3D-Welt einer Strecke im Spielzeug-Stil: aufgeständerte Plastik-Rennbahn mit Leisten,
// Steckverbindungen und Pfeilern, Riesen-Loopings, Booster-Tore, Himmel, Licht (inkl. Schatten und
// Umgebungs-Map für Spiegelungen) und die themenspezifische Kulisse.

import * as THREE from 'three';
import { THEMES } from './themes.js';
import { GeoBuilder, BASIC } from './geo.js';
import {
  toyTrackTexture, toyTrackNormal, railTexture, railNormal, plasticRoughTexture, padTexture, checkerTexture, windowTexture, playmatTexture,
  lavaTextures, sandTexture, textTexture, billboardAtlas, setAnisotropy, grassTexture, roadArrowTexture, pavingTexture,
} from './textures.js';
import { mulberry32 } from '../util.js';
import { buildChevrons, buildGrandstand, buildBannerPoles, buildBalloons, buildSponsorBoards, buildSpectators, buildBlimp } from './trackside.js';
import { JUMP_LEN } from '../config.js';
import { addDetail } from './detail.js';
import { buildPark } from './park.js';

// Detail-Schicht je nach Qualitätsstufe: aus bei „niedrig", ein Maßstab bei „mittel", sonst zwei
const DQ = { det: 1, aniso: 8 };
function D(mat, kind, opts = {}) {
  if (DQ.det < 0.5) return mat;
  return addDetail(mat, kind, { ...opts, two: (opts.two ?? true) && DQ.det >= 1, aniso: DQ.aniso });
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uFloor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uMid, uTop, pow(clamp(h * 1.5, 0.0, 1.0), 0.75));
  col = mix(uHorizon, col, smoothstep(-0.02, 0.24, h));
  if (h < -0.02) col = mix(uHorizon, uFloor, clamp((-h - 0.02) * 5.0, 0.0, 1.0));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  float disc = smoothstep(cos(uSunSize), cos(uSunSize * 0.92), s);
  col += uSunColor * (disc * 3.5 + pow(s, 10.0) * 0.45);
  // Sterne (nur Nachtwelten): Zellraster auf der Himmelskugel, je Zelle selten ein Stern, funkelt leicht
  if (uStars > 0.0 && h > 0.04) {
    vec3 p = d * 260.0;
    vec3 cell = floor(p);
    vec3 f = fract(p) - 0.5;
    float r = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    float r2 = fract(r * 97.31);
    float aa = fwidth(p.x) + fwidth(p.y);
    float star = step(0.989, r) * (1.0 - smoothstep(0.16, 0.16 + aa, length(f - (r2 - 0.5) * 0.4))) * (0.35 + 0.9 * r2);
    float tw = 0.65 + 0.35 * sin(uTime * (2.0 + r2 * 3.0) + r * 80.0);
    col += vec3(0.9, 0.93, 1.0) * star * tw * uStars * smoothstep(0.04, 0.3, h) * (1.0 - disc) * 1.6;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const T = 0.45; // Dicke der Bahn
const RH = 0.7; // Höhe der Seitenleiste
const RW = 0.5; // Breite der Seitenleiste

function col(hex, k = 1) {
  return new THREE.Color(hex).multiplyScalar(k);
}

function makeSkyMaterial(th, floor) {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uTop: { value: col(th.sky.top) },
      uMid: { value: col(th.sky.mid) },
      uHorizon: { value: col(th.sky.horizon) },
      uFloor: { value: floor },
      uSunDir: { value: new THREE.Vector3(...th.sky.sun).normalize() },
      uSunColor: { value: col(th.sky.sunColor, th.sky.sunK ?? 1) },
      uSunSize: { value: th.sky.sunSize },
      uStars: { value: th.sky.stars || 0 },
      uTime: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
  });
}

// Umgebungs-Map (PMREM) aus Himmel + Leuchtflächen: liefert die Spiegelungen auf Lack und Plastik
function buildEnvMap(renderer, th) {
  const scene = new THREE.Scene();
  const disp = [];
  const skyM = makeSkyMaterial(th, col(th.env.floor, th.env.floorK || 1));
  // Sonne in den Spiegelungen gedämpft, sonst blendet sie als grelle Fläche auf glänzendem Plastik
  skyM.uniforms.uSunColor.value.multiplyScalar(0.3);
  const sph = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), skyM);
  scene.add(sph);
  disp.push(sph.geometry, skyM);
  for (const p of th.env.panels) {
    const m = new THREE.MeshBasicMaterial({ color: col(p.color, p.k), side: THREE.DoubleSide });
    const g = new THREE.PlaneGeometry(p.w, p.h);
    const mesh = new THREE.Mesh(g, m);
    const az = (p.az * Math.PI) / 180;
    const el = (p.el * Math.PI) / 180;
    mesh.position.set(Math.sin(az) * Math.cos(el) * 60, Math.sin(el) * 60, Math.cos(az) * Math.cos(el) * 60);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
    disp.push(g, m);
  }
  const pm = new THREE.PMREMGenerator(renderer.gl);
  const rt = pm.fromScene(scene, 0.035, 0.1, 300, { size: 256 });
  pm.dispose();
  for (const d of disp) d.dispose();
  return rt;
}

export function buildWorld(track, themeId, { renderer = null, quality = null } = {}) {
  const th = THEMES[themeId] || THEMES.neon;
  const toy = th.toy;
  const gy = toy.groundY;
  const det = quality ? quality.details : 1;
  DQ.det = det;
  DQ.aniso = renderer ? Math.min(16, renderer.maxAniso || 8) : 8;
  const root = new THREE.Group();
  const disposables = [];
  const updaters = [];
  const N = track.n;
  const { hw } = track;
  const rnd = mulberry32(track.id.length * 977 + N);
  const grid = buildDistanceGrid(track);
  // Kreuzung einer Acht ohne Brücke: dort keine Leisten; mit Brücke (zwei Ebenen) überall Leisten
  const skip = track.bridged ? () => false : (k) => track.crossing[k] || track.crossing[(k + 1) % N];
  const keep = (...xs) => {
    for (const x of xs) disposables.push(x);
  };

  // --- Himmel ---
  const skyMat = makeSkyMaterial(th, col(th.fog.color));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  root.add(sky);
  keep(sky.geometry, skyMat);

  const envRT = renderer ? buildEnvMap(renderer, th) : null;
  if (envRT) keep(envRT);

  // --- Licht (Sonne/Mond mit Schatten, der der Kamera folgt) ---
  const hemi = new THREE.HemisphereLight(col(th.hemi.sky), col(th.hemi.ground), th.hemi.intensity * 1.7);
  root.add(hemi);
  const dir = new THREE.DirectionalLight(col(th.dir.color), th.dir.intensity * 2.1);
  const dirVec = new THREE.Vector3(...th.dir.pos).normalize();
  if (dirVec.y < 0.35) {
    dirVec.y = 0.35;
    dirVec.normalize();
  }
  dir.position.copy(dirVec).multiplyScalar(100);
  // Achsen der Schattenkamera (wie lookAt mit up = +y): zum Einrasten des Ausschnitts im Lichtraum
  const LX = new THREE.Vector3(0, 1, 0).cross(dirVec).normalize();
  const LY = dirVec.clone().cross(LX).normalize();
  const sc = dir.shadow.camera;
  sc.left = -34;
  sc.right = 34;
  sc.top = 34;
  sc.bottom = -34;
  sc.near = 1;
  sc.far = 260;
  dir.shadow.bias = -0.0005;
  dir.shadow.normalBias = 0.04;
  dir.shadow.radius = 3;
  dir.shadow.intensity = th.dir.shadow ?? 0.75;
  root.add(dir, dir.target);
  const setShadowSize = (size) => {
    if (!size) {
      dir.castShadow = false;
      return;
    }
    dir.castShadow = true;
    if (dir.shadow.mapSize.x !== size) {
      dir.shadow.mapSize.set(size, size);
      if (dir.shadow.map) {
        dir.shadow.map.dispose();
        dir.shadow.map = null;
      }
    }
  };
  setShadowSize(quality ? quality.shadow : 1024);

  const fog = new THREE.Fog(col(th.fog.color), th.fog.near, th.fog.far);

  // --- Spielzeug-Rennbahn ---
  const aniso = renderer ? Math.min(16, renderer.maxAniso || 8) : 8;
  const trackTex = setAnisotropy(toyTrackTexture(toy), aniso);
  const rough = plasticRoughTexture();
  rough.repeat.set(1, 0.5);
  // Rauheit ≈ 0,5 (Karte ~0,36 × 1,4): seidiger Kunststoff – Sonnen-Glanz bleibt sichtbar, überstrahlt aber nicht die Bahn
  const trackNrm = setAnisotropy(toyTrackNormal(), aniso);
  const trackMat = D(
    new THREE.MeshStandardMaterial({ map: trackTex, normalMap: trackNrm, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: rough, roughness: 1.4, metalness: 0, envMapIntensity: toy.envK }),
    'grain',
    { size: 1.0, albedo: 0.1, bump: 0.05, coarse: 0.18 }
  );
  const road = new THREE.Mesh(ribbon(track, (i) => -hw[i], (i) => hw[i], 0, 8), trackMat);
  road.receiveShadow = true;
  root.add(road);
  keep(road.geometry, trackMat);

  const slabMat = D(new THREE.MeshStandardMaterial({ color: col(toy.track, 0.55), roughness: 0.55, envMapIntensity: 0.5 }), 'grain', { size: 0.8, albedo: 0.08, bump: 0.06 });
  const under = new THREE.Mesh(ribbon(track, (i) => hw[i] + RW, (i) => -(hw[i] + RW), -T, 8), slabMat);
  root.add(under);
  keep(under.geometry, slabMat);

  const railMat = D(new THREE.MeshStandardMaterial({ color: col(toy.rail), roughness: 0.35, metalness: 0, envMapIntensity: toy.envK, side: THREE.DoubleSide }), 'grain', { size: 0.7, albedo: 0.05, bump: 0.04 });
  // Wände der Leiste mit Rippen, Fugen und Schrauben (Textur + Relief), Oberseite glatt
  const railWallMat = D(
    new THREE.MeshStandardMaterial({ color: col(toy.rail), map: setAnisotropy(railTexture(), aniso), normalMap: setAnisotropy(railNormal(), aniso), roughness: 0.35, metalness: 0, envMapIntensity: toy.envK, side: THREE.DoubleSide }),
    'grain',
    { size: 0.7, albedo: 0.05, bump: 0.04 }
  );
  const accentMat = toy.railGlow
    ? new THREE.MeshBasicMaterial({ color: col(toy.railGlow, th.glowIntensity * 0.7) })
    : new THREE.MeshStandardMaterial({ color: col(toy.railTop || toy.track), roughness: 0.35, envMapIntensity: toy.envK });
  keep(railMat, railWallMat, accentMat);
  for (const side of [-1, 1]) {
    const inner = wallRibbon(track, (i) => side * (hw[i] + 0.02), 0, RH, skip, false);
    const top = ribbon(track, (i) => side * (hw[i] + 0.02), (i) => side * (hw[i] + RW), RH, 8, skip);
    const outer = wallRibbon(track, (i) => side * (hw[i] + RW), -T, RH, skip, true);
    const stripe = ribbon(track, (i) => side * (hw[i] + 0.16), (i) => side * (hw[i] + 0.36), RH + 0.012, 8, skip);
    for (const g of [inner, top, outer]) {
      const m = new THREE.Mesh(g, g === top ? railMat : railWallMat);
      m.receiveShadow = true;
      root.add(m);
      keep(g);
    }
    root.add(new THREE.Mesh(stripe, accentMat));
    keep(stripe);
  }

  // Steckverbinder an den Leisten (alle 8 m), Pfeiler bis zum Boden
  const parts = new GeoBuilder();
  const railDark = '#' + col(toy.rail, 0.72).getHexString();
  const Q = {};
  for (let s = 0; s < track.length - 1; s += 8) {
    const k = track.indexAt(s);
    if (track.crossing[k] && !track.bridged) continue;
    for (const side of [-1, 1]) {
      const p = track.posAt(s, side * (hw[k] + RW + 0.05), Q);
      parts.add(BASIC.box, { x: p.x, y: p.y + (RH - T) / 2, z: p.z, ry: p.h, sx: 0.14, sy: RH + T + 0.06, sz: 0.55, color: railDark });
    }
  }
  if (toy.pylon && gy > -40) {
    const spacing = det < 0.5 ? 26 : 18;
    for (let s = 6; s < track.length - 4; s += spacing) {
      const k = track.indexAt(s);
      if (track.crossing[k]) continue;
      const p = track.posAt(s, 0, Q);
      parts.add(BASIC.box, { x: p.x, y: p.y - T - 0.22, z: p.z, ry: p.h, rz: -Math.atan(p.bank), sx: 2 * (hw[k] + RW) * 0.82, sy: 0.44, sz: 1.1, color: toy.pylon });
      const offs = hw[k] > 9 ? [-hw[k] * 0.55, hw[k] * 0.55] : [0];
      for (const o of offs) {
        const q = track.posAt(s, o, {});
        const h = q.y - T - gy;
        parts.add(BASIC.cyl8, { x: q.x, y: gy + h / 2, z: q.z, sx: 0.5, sy: h, sz: 0.5, color: toy.pylon });
        parts.add(BASIC.box, { x: q.x, y: gy + 0.15, z: q.z, ry: p.h, sx: 2.2, sy: 0.3, sz: 2.2, color: railDark });
      }
    }
  }

  // --- Start/Ziel ---
  const P0 = track.posAt(0, 0, {});
  const checker = new THREE.Mesh(
    new THREE.PlaneGeometry(hw[0] * 2, 2.2),
    new THREE.MeshBasicMaterial({ map: checkerTexture(), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
  );
  checker.rotation.set(-Math.PI / 2, 0, 0);
  checker.material.color.setScalar(0.85);
  const startGroup = new THREE.Group();
  startGroup.position.set(P0.x, 0.02, P0.z);
  startGroup.rotation.y = P0.h;
  startGroup.add(checker);
  root.add(startGroup);
  keep(checker.geometry, checker.material);
  const gw = hw[0] + RW + 0.7;
  const gate = new GeoBuilder();
  gate.box(-gw, 3.3, 0, 1.0, 6.6, 1.0, toy.rail);
  gate.box(gw, 3.3, 0, 1.0, 6.6, 1.0, toy.rail);
  gate.box(0, 6.9, 0, gw * 2 + 1.0, 1.2, 1.2, toy.rail);
  for (const sx of [-1, 1]) {
    gate.box(sx * gw, 7.9, 0, 0.08, 1.6, 0.08, '#dddddd');
    gate.tri([sx * gw, 8.6, 0], [sx * gw, 8.0, 0], [sx * gw, 8.3, -1.1], toy.track);
    gate.tri([sx * gw, 8.6, 0], [sx * gw, 8.3, -1.1], [sx * gw, 8.0, 0], toy.track);
  }
  const gateMesh = new THREE.Mesh(gate.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2, 1.0), new THREE.MeshBasicMaterial({ map: checkerTexture(), side: THREE.DoubleSide }));
  banner.position.set(0, 6.9, -0.62);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(gw * 1.4, gw * 0.18),
    new THREE.MeshBasicMaterial({ map: textTexture('ECHO RACER', '#ffffff', 'rgba(0,0,0,0)', 1024, 128), transparent: true, color: col('#ffffff', 2.2), side: THREE.DoubleSide })
  );
  sign.position.set(0, 8.0, -0.62);
  sign.rotation.y = Math.PI;
  const gantryGroup = new THREE.Group();
  gantryGroup.add(gateMesh, banner, sign);
  gantryGroup.position.set(P0.x, 0, P0.z);
  gantryGroup.rotation.y = P0.h;
  root.add(gantryGroup);
  // Startampel: drei Lampenpaare unter dem Banner (rot im Countdown, grün beim Start)
  const lampGeo = new THREE.SphereGeometry(0.34, 16, 12);
  const houseGeo = new THREE.BoxGeometry(2.0, 0.95, 0.5);
  const houseMat = new THREE.MeshStandardMaterial({ color: col('#1c1a24'), roughness: 0.5 });
  const lamps = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 2.4;
    const house = new THREE.Mesh(houseGeo, houseMat);
    house.position.set(x, 5.75, -0.75);
    const mat = new THREE.MeshBasicMaterial({ color: col('#3a0c10') });
    for (const dx of [-0.5, 0.5]) {
      const l = new THREE.Mesh(lampGeo, mat);
      l.position.set(x + dx, 5.75, -1.0);
      gantryGroup.add(l);
    }
    gantryGroup.add(house);
    lamps.push(mat);
  }
  keep(lampGeo, houseGeo, houseMat, ...lamps);
  let lampState = null;
  const setStartLights = (state) => {
    if (state === lampState) return;
    lampState = state;
    lamps.forEach((m, i) => {
      if (state === 'go') m.color.set('#30ff6a').multiplyScalar(3);
      else if (typeof state === 'number' && i < state) m.color.set('#ff2030').multiplyScalar(3);
      else m.color.set('#3a0c10');
    });
  };
  keep(gateMesh.geometry, gateMesh.material, banner.geometry, banner.material, sign.geometry, sign.material);

  // --- Boostfelder + Booster-Tore ---
  const padTex = padTexture();
  const pads = [];
  const glow = new GeoBuilder();
  for (const pd of track.pads) {
    const mat = new THREE.MeshBasicMaterial({
      map: padTex,
      color: col(th.pad, 1.4),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const pg = new THREE.PlaneGeometry(pd.w * 2, pd.len);
    pg.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(pg, mat);
    const p = track.posAt(pd.s, pd.d, {});
    m.position.set(p.x, p.y + 0.05, p.z);
    // am Hang und in der Steilkurve mit der Fahrbahn neigen
    m.rotation.set(-Math.atan(track.slopeAt(pd.s)), p.h, -Math.atan(p.bank), 'YXZ');
    m.userData = { pad: pd, baseColor: col(th.pad, 1.4), heading: p.h };
    root.add(m);
    pads.push(m);
    keep(m.geometry, mat);
    // Tor über der ganzen Bahnbreite
    const k = track.indexAt(pd.s);
    const c = track.posAt(pd.s - pd.len / 2, 0, {});
    const span = hw[k] + RW * 0.5;
    for (const side of [-1, 1]) {
      const q = track.posAt(pd.s - pd.len / 2, side * span, {});
      parts.add(BASIC.box, { x: q.x, y: q.y + RH + 2.0, z: q.z, ry: c.h, sx: 0.45, sy: 4.0, sz: 0.45, color: toy.rail });
    }
    const rz = -Math.atan(c.bank);
    parts.add(BASIC.box, { x: c.x, y: c.y + RH + 4.2, z: c.z, ry: c.h, rz, sx: span * 2 + 0.45, sy: 0.5, sz: 0.5, color: toy.rail });
    glow.add(BASIC.box, { x: c.x, y: c.y + RH + 3.85, z: c.z, ry: c.h, rz, sx: span * 2, sy: 0.16, sz: 0.56, color: th.pad, k: 3 });
    const sg = track.posAt(pd.s - pd.len / 2, pd.d, {});
    glow.add(BASIC.box, { x: sg.x, y: sg.y + RH + 4.75, z: sg.z, ry: c.h, rz, sx: pd.w * 1.4, sy: 0.6, sz: 0.12, color: th.pad, k: 3 });
  }

  // --- Sprungschanzen: Keil über die ganze Bahn, gelbe Fahrfläche mit Pfeilen, Warnstreifen an der Kante ---
  if (track.jumps.length) {
    const jb = new GeoBuilder(false, true);
    jb.pbrMap = { '#ffd23d': [0.35, 0.05], '#22202a': [0.5, 0.05] };
    const side = toy.rail;
    for (const j of track.jumps) {
      const a = track.posAt(j.s - JUMP_LEN, j.d, {});
      const b2 = track.posAt(j.s, j.d, {});
      const corner = (p, sx, y) => [p.x + p.nx * sx * j.w, p.y + y, p.z + p.nz * sx * j.w];
      const y0 = 0.02;
      const y1 = j.h;
      const A0 = corner(a, -1, y0);
      const A1 = corner(a, 1, y0);
      const B0 = corner(b2, -1, y1);
      const B1 = corner(b2, 1, y1);
      const B0g = corner(b2, -1, y0);
      const B1g = corner(b2, 1, y0);
      // Fahrfläche (gelb), Pfeile, Seiten, Rückwand
      jb.quad(A1, A0, B0, B1, '#ffd23d');
      for (let k = 0; k < 3; k++) {
        const u0 = 0.18 + k * 0.26;
        const u1 = u0 + 0.14;
        const at = (u, sx) => {
          const p = track.posAt(j.s - JUMP_LEN * (1 - u), j.d + sx * j.w * 0.45, {});
          return [p.x, p.y + y0 + (y1 - y0) * u + 0.015, p.z];
        };
        const tip = track.posAt(j.s - JUMP_LEN * (1 - u1), j.d, {});
        const T = [tip.x, tip.y + y0 + (y1 - y0) * u1 + 0.015, tip.z];
        jb.tri(at(u0, 1), at(u0, -1), T, '#22202a');
      }
      jb.tri(A0, B0g, B0, side);
      jb.tri(A1, B1, B1g, side);
      jb.quad(B0g, B1g, B1, B0, '#22202a');
    }
    const jm = new THREE.Mesh(jb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, envMapIntensity: toy.envK, side: THREE.DoubleSide }));
    jm.castShadow = true;
    jm.receiveShadow = true;
    root.add(jm);
    keep(jm.geometry, jm.material);
  }

  // --- Randsteine: rot-weiße Streifen an der Innenseite enger Kurven (leicht erhaben) ---
  {
    const cb = new GeoBuilder();
    const SEG = 2;
    for (const cv of track.curves) {
      if (cv.peak < 1 / 60) continue;
      const inner = -cv.sign;
      let n = 0;
      for (let s = cv.s0 + 4; s < cv.s1 - 2; s += SEG, n++) {
        const k = track.indexAt(s);
        if (skip(k) || track.crossing[k]) continue;
        const a0 = track.posAt(s, inner * (hw[k] - 0.05), {});
        const a1 = track.posAt(s, inner * (hw[k] - 1.15), {});
        const b0 = track.posAt(s + SEG, inner * (hw[k] - 0.05), {});
        const b1 = track.posAt(s + SEG, inner * (hw[k] - 1.15), {});
        const c = n % 2 ? '#ffffff' : '#e8202e';
        const y = (p, h) => [p.x, p.y + h, p.z];
        if (inner > 0) cb.quad(y(a1, 0.04), y(a0, 0.07), y(b0, 0.07), y(b1, 0.04), c);
        else cb.quad(y(a0, 0.07), y(a1, 0.04), y(b1, 0.04), y(b0, 0.07), c);
      }
    }
    if (cb.count) {
      const cm = new THREE.Mesh(cb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      cm.receiveShadow = true;
      root.add(cm);
      keep(cm.geometry, cm.material);
    }
  }

  // --- Streckenrand: Pfeiltafeln an engen Kurven, Tribüne + Fahnen am Start ---
  const blockers = [];
  const chev = buildChevrons(track, skip, parts, { RH, RW });
  if (chev.mesh) {
    root.add(chev.mesh);
    keep(chev.mesh.geometry, chev.mesh.material);
  }
  blockers.push(...chev.spots);

  // Kleinkram auf der Fahrbahn je Welt (folgt der Oberfläche): Garten Blütenblätter + Blätter,
  // Canyon Sandverwehungen vom Rand, Neon Regenpfützen (glänzend), Lava Rußflecken
  {
    const PQ = {};
    const busyD = (s) =>
      track.pads.some((pd) => Math.abs(track.deltaS(pd.s, s)) < pd.len / 2 + 2) || track.jumps.some((j) => Math.abs(track.deltaS(j.s, s)) < JUMP_LEN + 4);
    // Fleck als Vieleck um (s, d) – jeder Eckpunkt einzeln auf die Bahn gelegt
    const blob = (b, s, d, rs, rd, seg, color, lift, wob, rot = 0) => {
      const c = track.posAt(s, d, PQ);
      const C = [c.x, c.y + lift, c.z];
      let prev = null;
      let first = null;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2 + rot;
        const k = 1 + Math.sin(a * 3 + s) * wob;
        const p = track.posAt(s + Math.cos(a) * rs * k, d + Math.sin(a) * rd * k, PQ);
        const P = [p.x, p.y + lift, p.z];
        if (prev) b.tri(C, P, prev, color);
        else first = P;
        prev = P;
      }
      return first;
    };
    const L = track.length;
    if (themeId === 'garden') {
      const db = new GeoBuilder();
      const petals = ['#ff8ac8', '#ffffff', '#ff5fb0', '#ffd0ea'];
      for (let s = 6; s < L; s += 2.2) {
        if (busyD(s) || skip(track.indexAt(s))) continue;
        const hw = track.hw[track.indexAt(s)];
        const n0 = rnd() < 0.5 ? 1 : 2;
        for (let i = 0; i < n0; i++) {
          // Blütenblätter häufen sich am Rand
          const side = rnd() < 0.5 ? -1 : 1;
          const d = side * hw * (0.55 + rnd() * 0.42);
          blob(db, s + rnd() * 2, d, 0.3, 0.17, 7, petals[Math.floor(rnd() * petals.length)], 0.025, 0.12, rnd() * 3);
        }
        if (rnd() < 0.18) blob(db, s, (rnd() * 2 - 1) * hw * 0.9, 0.7, 0.32, 9, rnd() < 0.5 ? '#4f9e2e' : '#7fbf3a', 0.028, 0.2, rnd() * 3);
      }
      const dm = new THREE.Mesh(db.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      dm.receiveShadow = true;
      root.add(dm);
      keep(dm.geometry, dm.material);
    } else if (themeId === 'canyon' || themeId === 'lava') {
      const db = new GeoBuilder();
      const cols = themeId === 'canyon' ? ['#e9cd96', '#e2c08a', '#d9b47c'] : ['#121014', '#1c1618', '#241c1c'];
      for (let s = 10; s < L; s += themeId === 'canyon' ? 9 : 14) {
        if (busyD(s) || skip(track.indexAt(s)) || rnd() < 0.35) continue;
        const hw = track.hw[track.indexAt(s)];
        const side = rnd() < 0.5 ? -1 : 1;
        // Verwehung liegt am Rand und läuft zur Mitte hin aus
        const d = side * hw * (0.72 + rnd() * 0.2);
        const len = 2.2 + rnd() * 3;
        blob(db, s, d, len, 0.6 + rnd() * 0.6, 12, cols[Math.floor(rnd() * cols.length)], 0.022, 0.22, rnd() * 3);
        if (rnd() < 0.5) blob(db, s + len * 0.8, d * 0.86, len * 0.45, 0.35, 10, cols[Math.floor(rnd() * cols.length)], 0.024, 0.2, rnd() * 3);
      }
      const dm = new THREE.Mesh(db.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      dm.receiveShadow = true;
      root.add(dm);
      keep(dm.geometry, dm.material);
    } else if (themeId === 'neon') {
      const db = new GeoBuilder();
      for (let s = 16; s < L; s += 17) {
        if (busyD(s) || skip(track.indexAt(s)) || rnd() < 0.3) continue;
        const hw = track.hw[track.indexAt(s)];
        const d = (rnd() * 2 - 1) * hw * 0.7;
        blob(db, s, d, 1.4 + rnd() * 1.8, 0.7 + rnd() * 0.7, 14, '#1c2448', 0.02, 0.16, rnd() * 3);
      }
      // Pfützen: dunkel, fast spiegelnd – reflektieren die Neon-Umgebung
      const dm = new THREE.Mesh(db.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      dm.receiveShadow = true;
      root.add(dm);
      keep(dm.geometry, dm.material);
    }
  }

  // Aufgemalte Kurvenpfeile auf der Fahrbahn vor scharfen Kurven (folgen Hügeln, nicht auf Toren/Schanzen/Kreuzungen)
  {
    const ab = new GeoBuilder(true);
    const PQ = {};
    const busy = (s) =>
      track.pads.some((pd) => Math.abs(track.deltaS(pd.s, s)) < pd.len / 2 + 6) || track.jumps.some((j) => Math.abs(track.deltaS(j.s, s)) < JUMP_LEN + 8);
    for (const cv of track.curves) {
      if (cv.peak < 1 / 48) continue;
      for (const back of [26, 13]) {
        const sm = cv.s0 - back;
        const k = track.indexAt(sm);
        if (skip(k) || track.crossing[k] || busy(sm)) continue;
        const W = Math.min(2.6, track.hw[k] * 0.42);
        const Lh = 3.4;
        const rows = 4;
        let prev = null;
        for (let r = 0; r <= rows; r++) {
          const s = sm - Lh + (2 * Lh * r) / rows;
          const a = track.posAt(s, -W, PQ);
          const A = [a.x, a.y + 0.035, a.z];
          const b = track.posAt(s, W, PQ);
          const B = [b.x, b.y + 0.035, b.z];
          const v = r / rows;
          // Linkskurve (sign > 0): Pfeil gespiegelt
          const uL = cv.sign > 0 ? 1 : 0;
          const uR = 1 - uL;
          if (prev) ab.quad(prev[0], prev[1], B, A, '#ffffff', 1, [[uL, prev[2]], [uR, prev[2]], [uR, v], [uL, v]]);
          prev = [A, B, v];
        }
      }
    }
    if (ab.count) {
      const am = new THREE.Mesh(ab.build(), new THREE.MeshLambertMaterial({ map: roadArrowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      am.receiveShadow = true;
      root.add(am);
      keep(am.geometry, am.material);
    }
  }
  const stand = buildGrandstand(track, th, gy, det, grid, themeId, parts, { RH, RW }, rnd);
  if (stand) {
    root.add(...stand.objects);
    blockers.push(...stand.blockers);
    updaters.push(stand.update);
    keep(stand);
  }
  const blocked = (x, z, r) => blockers.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + r);
  let spectators = null;

  // Stoffbanner an Masten entlang der Strecke (Weltfarben) + Ballontrauben rund um Start/Ziel
  {
    const ACC = { neon: ['#6a2ae0', '#2ce7ff'], canyon: ['#e8582a', '#ffd23d'], sky: ['#ff5fb0', '#40d0ff'], lava: ['#3a1a14', '#ff6a1a'], garden: ['#2f8f3a', '#ffd23d'], park: ['#8a52ff', '#ffc93d'] };
    const [a1, a2] = ACC[themeId] || ACC.neon;
    const bt = { value: 0 };
    // keine Fahnenmasten im Zirkuszelt (Lunapark)
    const tentS = track.def.tent != null ? track.def.tent * track.length : null;
    const poleSkip = tentS == null ? skip : (k) => skip(k) || Math.abs(track.deltaS(tentS, k * track.step)) < 30;
    const poles = buildBannerPoles(track, poleSkip, parts, { RH, RW }, a1, a2, bt, det);
    if (poles) {
      root.add(poles.mesh);
      keep(poles);
      updaters.push((t) => (bt.value = t));
    }
    // Werbebanden auf den Leisten (nicht an Pfeiltafeln und Fahnenmasten); eigener Zufall, damit die übrige
    // Kulisse unverändert bleibt
    const boards = buildSponsorBoards(track, skip, parts, { RH, RW }, {
      themeId,
      night: !!th.beams,
      rnd: mulberry32(track.id.length * 131 + N),
      avoid: [...chev.spots, ...(poles ? poles.spots : [])],
    });
    if (boards) {
      root.add(boards.mesh);
      keep(boards);
      blockers.push(...boards.spots);
    }
    // Zuschauer-Balkone an Schanzen und Kurvenausgängen
    spectators = buildSpectators(track, skip, parts, { RH, RW }, {
      gy,
      det,
      rnd: mulberry32(track.id.length * 53 + N),
      avoid: [...chev.spots, ...(poles ? poles.spots : []), ...(boards ? boards.spots : [])],
      rail: toy.rail,
    });
    if (spectators) {
      root.add(...spectators.objects);
      keep(spectators);
      blockers.push(...spectators.spots);
      updaters.push(spectators.update);
    }
    const balloons = buildBalloons(track, { RH, RW }, rnd, det);
    root.add(...balloons.objects);
    keep(balloons);
    updaters.push(balloons.update);
    // Werbe-Luftschiff zieht hoch über der Strecke seine Kreise
    const BLIMP = { neon: '#6a2ae0', canyon: '#e8582a', sky: '#ff4fa3', lava: '#e8401a', garden: '#2f8f3a', park: '#8a52ff' };
    const blimp = buildBlimp(track, { accent: BLIMP[themeId] || BLIMP.neon, night: !!th.beams });
    root.add(blimp.group);
    keep(blimp);
    updaters.push(blimp.update);
  }

  // --- Riesen-Loopings als Kulisse ---
  const loopB = new GeoBuilder(true);
  const loopRail = new GeoBuilder();
  const loopBase = gy > -40 ? gy : -14;
  let loops = 0;
  // im Lunapark nicht: dort steht eine eigene Achterbahn
  for (const u of themeId === 'park' ? [] : [0.27, 0.68]) {
    const s = u * track.length;
    for (const side of [1, -1]) {
      const k = track.indexAt(s);
      const off = side * (hw[k] + 30);
      const p = track.posAt(s, off, {});
      if (grid.dist(p.x, p.z) < 18) continue;
      addLoop(loopB, loopRail, parts, p, loopBase, 9.5, toy);
      loops++;
      break;
    }
  }
  if (loops) {
    const loopMat = trackMat.clone();
    loopMat.side = THREE.DoubleSide;
    const lm = new THREE.Mesh(loopB.build(), loopMat);
    const lr = new THREE.Mesh(loopRail.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, envMapIntensity: toy.envK, side: THREE.DoubleSide }));
    root.add(lm, lr);
    keep(lm.geometry, loopMat, lr.geometry, lr.material);
  }

  // --- Boden ---
  let ground;
  const gSize = 6000;
  if (themeId === 'neon') {
    const t = playmatTexture();
    t.repeat.set(gSize / 90, gSize / 90);
    setAnisotropy(t, aniso);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), D(new THREE.MeshBasicMaterial({ map: t, color: col('#ffffff', 0.85) }), 'fabric', { size: 0.9, albedo: 0.14, planar: true, coarse: 0.11 }));
  } else if (themeId === 'canyon') {
    const t = sandTexture(th.ground);
    t.repeat.set(gSize / 40, gSize / 40);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), D(new THREE.MeshLambertMaterial({ map: t }), 'sand', { size: 2.6, albedo: 0.16, bump: 0.45, planar: true, coarse: 0.21 }));
  } else if (themeId === 'sky') {
    ground = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), new THREE.MeshLambertMaterial({ color: col(th.ground), emissive: col('#8f86ff', 0.25) }));
  } else if (themeId === 'park') {
    const t = pavingTexture();
    t.repeat.set(gSize / 9.6, gSize / 9.6);
    setAnisotropy(t, aniso);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), D(new THREE.MeshLambertMaterial({ map: t }), 'stone', { size: 3.2, albedo: 0.12, bump: 0.25, planar: true, coarse: 0.18 }));
    ground.receiveShadow = true;
  } else if (themeId === 'garden') {
    const t = grassTexture();
    t.repeat.set(gSize / 34, gSize / 34);
    setAnisotropy(t, aniso);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), D(new THREE.MeshLambertMaterial({ map: t }), 'turf', { size: 4.5, albedo: 0.2, bump: 0.3, planar: true, coarse: 0.23 }));
    ground.receiveShadow = true;
  } else {
    const { glow, crust } = lavaTextures(th.ground, det >= 1 ? 1024 : 512);
    for (const t of [glow, crust]) {
      t.repeat.set(gSize / 50, gSize / 50);
      setAnisotropy(t, aniso);
    }
    ground = new THREE.Mesh(
      new THREE.PlaneGeometry(gSize, gSize),
      D(new THREE.MeshLambertMaterial({ map: crust, emissive: col('#ffffff'), emissiveMap: glow, emissiveIntensity: 1.6 }), 'stone', { size: 5, albedo: 0.3, bump: 0.35, planar: true })
    );
    // Glut pulsiert langsam (Kruste und Risse bleiben deckungsgleich)
    updaters.push((t2) => {
      ground.material.emissiveIntensity = 1.4 + Math.sin(t2 * 1.3) * 0.35;
    });
  }
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = gy;
  root.add(ground);
  keep(ground.geometry, ground.material);

  // --- Kulisse ---
  // Ton-Rückruf (z. B. Feuerwerk): setzt die Rennsitzung über setSfx, im Menü-Hintergrund bleibt es still
  let sfxFn = null;
  const sfx = (name, k, delay) => sfxFn && sfxFn(name, k, delay);
  const scen = buildScenery(themeId, th, track, grid, rnd, gy, det, parts, glow, blocked, sfx);
  const landmarks = (scen.landmarks || []).filter(Boolean).map((m) => {
    // nächster Streckenpunkt (auch für weit entfernte Wahrzeichen)
    let bk = 0;
    let bd = Infinity;
    for (let k = 0; k < track.n; k += 2) {
      const d2 = (track.px[k] - m.x) ** 2 + (track.pz[k] - m.z) ** 2;
      if (d2 < bd) {
        bd = d2;
        bk = k;
      }
    }
    return { ...m, s: bk * track.step, a0: Math.atan2(track.pz[bk] - m.z, track.px[bk] - m.x) };
  });
  for (const m of scen.meshes) {
    root.add(m);
    m.traverse((o) => {
      if (o.isInstancedMesh) keep(o);
      if (o.geometry) keep(o.geometry);
      if (o.material) keep(o.material);
    });
  }
  if (scen.update) updaters.push(scen.update);

  if (parts.count) {
    const m = new THREE.Mesh(parts.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    root.add(m);
    keep(m.geometry, m.material);
  }
  if (glow.count) {
    const m = new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    root.add(m);
    keep(m.geometry, m.material);
  }

  const center = new THREE.Vector3((track.bounds.minX + track.bounds.maxX) / 2, 0, (track.bounds.minZ + track.bounds.maxZ) / 2);
  let particles = null;

  return {
    root,
    fog,
    pads,
    theme: th,
    themeId,
    center,
    groundY: gy,
    envMap: envRT ? envRT.texture : null,
    dirLight: dir,
    landmarks,
    setSfx(fn) {
      sfxFn = fn;
    },
    setShadowSize,
    setStartLights,
    setParticles(P) {
      particles = P;
    },
    // Zuschauer in der Nähe (Balkone, Tribüne) jubeln lassen; true, wenn jemand in Sichtweite war
    cheerNear(x, z, k) {
      let near = false;
      if (spectators && spectators.spots.some((p) => Math.hypot(p.x - x, p.z - z) < 45)) {
        spectators.cheer(k);
        near = true;
      }
      if (stand && stand.blockers.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + 30)) {
        stand.cheer(k);
        near = true;
      }
      return near;
    },
    // Tribüne jubeln lassen (0..1, klingt von selbst ab)
    cheer(k) {
      if (stand) stand.cheer(k);
      if (spectators) spectators.cheer(k);
    },
    update(t, camera, focus) {
      sky.position.copy(camera.position);
      sky.material.uniforms.uTime.value = t;
      padTex.offset.y = -t * 1.6;
      if (focus) {
        // Schattenausschnitt folgt dem Auto und rastet im Raster der Schattenkamera ein (Lichtraum statt Welt-x/z):
        // so wandern Schattenkanten beim Fahren nicht über die Texel – kein Flimmern, auch mit kleiner Schattenkarte
        const step = 68 / Math.max(512, dir.shadow.mapSize.x);
        const fy = focus.y || 0;
        const px = Math.round((focus.x * LX.x + fy * LX.y + focus.z * LX.z) / step) * step;
        const py = Math.round((focus.x * LY.x + fy * LY.y + focus.z * LY.z) / step) * step;
        const pz = focus.x * dirVec.x + fy * dirVec.y + focus.z * dirVec.z;
        const sx = LX.x * px + LY.x * py + dirVec.x * pz;
        const sy = LX.y * px + LY.y * py + dirVec.y * pz;
        const sz = LX.z * px + LY.z * py + dirVec.z * pz;
        dir.target.position.set(sx, sy, sz);
        dir.position.set(sx + dirVec.x * 110, sy + dirVec.y * 110, sz + dirVec.z * 110);
      }
      for (const u of updaters) u(t, camera, focus, particles);
    },
    dispose() {
      for (const d of disposables) d.dispose && d.dispose();
    },
  };
}

// Looping aus derselben Spielzeugbahn (seitlich versetzt wie eine Spirale), mit Rampen und Stützen
function addLoop(surf, rail, parts, p, baseY, R, toy) {
  const t = new THREE.Vector3(p.tx, 0, p.tz).normalize();
  const n = new THREE.Vector3(p.nx, 0, p.nz).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const base = new THREE.Vector3(p.x, baseY + 0.4, p.z);
  const half = 2.2;
  const M = 48;
  const pts = [];
  const pt = (pos, nrm) => ({ pos, nrm });
  for (let i = 0; i <= 6; i++) pts.push(pt(base.clone().addScaledVector(t, -14 + i * 2).addScaledVector(n, -2.6), up.clone()));
  for (let i = 1; i <= M; i++) {
    const a = (i / M) * Math.PI * 2;
    const shift = (i / M) * 5.2 - 2.6;
    const c = base.clone().addScaledVector(t, R * Math.sin(a)).addScaledVector(up, R * (1 - Math.cos(a))).addScaledVector(n, shift);
    const centre = base.clone().addScaledVector(up, R).addScaledVector(n, shift);
    pts.push(pt(c, centre.sub(c).normalize()));
  }
  for (let i = 1; i <= 7; i++) pts.push(pt(base.clone().addScaledVector(t, i * 2).addScaledVector(n, 2.6), up.clone()));
  let v = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const v0 = v / 8;
    v += a.pos.distanceTo(b.pos);
    const v1 = v / 8;
    const aL = a.pos.clone().addScaledVector(n, -half);
    const aR = a.pos.clone().addScaledVector(n, half);
    const bL = b.pos.clone().addScaledVector(n, -half);
    const bR = b.pos.clone().addScaledVector(n, half);
    surf.quad(aL.toArray(), aR.toArray(), bR.toArray(), bL.toArray(), '#ffffff', 1, [
      [0, v0],
      [1, v0],
      [1, v1],
      [0, v1],
    ]);
    for (const [ea, eb] of [
      [aL, bL],
      [aR, bR],
    ]) {
      const ta = ea.clone().addScaledVector(a.nrm, 0.55);
      const tb = eb.clone().addScaledVector(b.nrm, 0.55);
      rail.quad(ea.toArray(), eb.toArray(), tb.toArray(), ta.toArray(), toy.rail);
    }
  }
  for (const a of [Math.PI / 2, (Math.PI * 3) / 2]) {
    const off = (a / (Math.PI * 2)) * 5.2 - 2.6;
    for (const s of [-1, 1]) {
      const c = base.clone().addScaledVector(t, R * Math.sin(a)).addScaledVector(n, off + s * (half + 0.8));
      const h = R - 0.4;
      parts.add(BASIC.cyl8, { x: c.x, y: base.y + h / 2, z: c.z, sx: 0.35, sy: h, sz: 0.35, color: toy.pylon || toy.rail });
    }
  }
}

// Band entlang der Strecke zwischen zwei seitlichen Abständen (flach)
function ribbon(track, dA, dB, y, vLen, skip = null) {
  const N = track.n;
  const { px, pz, nx, nz, tx, tz, step, bank, slope } = track;
  const pos = new Float32Array((N + 1) * 6);
  const uv = new Float32Array((N + 1) * 4);
  const nor = new Float32Array((N + 1) * 6);
  // Unterseiten (dA > dB) zeigen nach unten
  const up = dA(0) < dB(0) ? 1 : -1;
  for (let k = 0; k <= N; k++) {
    const i = k % N;
    const a = dA(i);
    const b = dB(i);
    const yy = y + track.hy[i];
    const bk = bank[i];
    pos.set([px[i] + nx[i] * a, yy + a * bk, pz[i] + nz[i] * a, px[i] + nx[i] * b, yy + b * bk, pz[i] + nz[i] * b], k * 6);
    const v = (k * step) / vLen;
    uv.set([0, v, 1, v], k * 4);
    // Normale der geneigten Fläche (Hang + Steilkurve)
    const gx = -(slope[i] * tx[i] + bk * nx[i]);
    const gz = -(slope[i] * tz[i] + bk * nz[i]);
    const gl = up / Math.hypot(gx, 1, gz);
    nor.set([gx * gl, gl, gz * gl, gx * gl, gl, gz * gl], k * 6);
  }
  const idx = [];
  for (let k = 0; k < N; k++) {
    if (skip && skip(k)) continue;
    const a = k * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    if (dA(k) < dB(k)) idx.push(a, b, c, b, d, c);
    else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Senkrechtes Band bei seitlichem Abstand off(i), Höhe y0..y1; Vorderseite zur Mitte (oder nach außen)
function wallRibbon(track, off, y0, y1, skip, outward = false) {
  const N = track.n;
  const { px, pz, nx, nz } = track;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (let k = 0; k <= N; k++) {
    const i = k % N;
    const d = off(i);
    // u: 8 m je Kachel (Fugen auf den Bahnstößen), v: unten 0 → oben 1
    const u = (k * track.step) / 8;
    uv.push(u, 0, u, 1);
    const x = px[i] + nx[i] * d;
    const z = pz[i] + nz[i] * d;
    let s = d > 0 ? -1 : 1;
    if (outward) s = -s;
    const yb = track.hy[i] + d * track.bank[i];
    pos.push(x, y0 + yb, z, x, y1 + yb, z);
    nor.push(nx[i] * s, 0, nz[i] * s, nx[i] * s, 0, nz[i] * s);
  }
  const right = off(0) > 0 !== outward;
  for (let k = 0; k < N; k++) {
    if (skip && skip(k)) continue;
    const a = k * 2;
    if (right) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Raster für schnelle "Abstand zur Strecke"-Abfragen beim Platzieren der Kulisse
function buildDistanceGrid(track) {
  const cell = 40;
  const grid = new Map();
  for (let k = 0; k < track.n; k += 2) {
    const key = Math.floor(track.px[k] / cell) + ',' + Math.floor(track.pz[k] / cell);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(k);
  }
  const query = (x, z) => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    let best = Infinity;
    let bk = -1;
    for (let gx = -2; gx <= 2; gx++) {
      for (let gz = -2; gz <= 2; gz++) {
        const list = grid.get(cx + gx + ',' + (cz + gz));
        if (!list) continue;
        for (const k of list) {
          const d = Math.hypot(track.px[k] - x, track.pz[k] - z) - track.hw[k];
          if (d < best) {
            best = d;
            bk = k;
          }
        }
      }
    }
    return { d: best === Infinity ? 999 : best, k: bk };
  };
  return {
    dist: (x, z) => query(x, z).d,
    nearest: query,
  };
}

function randomAround(track, rnd, pad) {
  const b = track.bounds;
  return [b.minX - pad + rnd() * (b.maxX - b.minX + pad * 2), b.minZ - pad + rnd() * (b.maxZ - b.minZ + pad * 2)];
}

// Teichwasser: Wellen aus Sinus-Summen, Fresnel-Spiegelung des Himmels, Sonnenglitzern, Nebel
function waterMaterial(th) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uDeep: { value: col('#1f6f8a') },
      uSky: { value: col(th.sky.mid) },
      uSunDir: { value: new THREE.Vector3(...th.dir.pos).normalize() },
      uSun: { value: col('#fff6e0', 2.4) },
    },
  ]);
  return new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uSky;
      uniform vec3 uSunDir;
      uniform vec3 uSun;
      varying vec3 vW;
      void main() {
        vec2 p = vW.xz;
        float a = p.x * 0.31 + uTime * 1.1;
        float b = p.y * 0.37 - uTime * 0.8;
        float c = (p.x + p.y) * 0.73 + uTime * 1.6;
        float d = (p.x - p.y) * 1.3 - uTime * 2.1;
        vec3 n = normalize(vec3(cos(a) * 0.12 + cos(c) * 0.09 + cos(d) * 0.05, 1.0, cos(b) * 0.12 + cos(c) * 0.09 - cos(d) * 0.05));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 col = mix(uDeep, uSky, 0.12 + fres * 0.8);
        vec3 h = normalize(normalize(uSunDir) + v);
        col += uSun * pow(max(dot(n, h), 0.0), 160.0);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
}

// Blinkende Warnlichter (Antennen): je Licht eigene Phase über das Attribut aSeed
// Vogelschwarm: Instanzen kreisen um einen langsam wandernden Mittelpunkt, Flügelschlag im Vertex-Shader
// (in Schüben, dazwischen Gleitflug mit leicht angehobenen Flügeln). Rückgabe: Mesh + Update-Funktion.
function birdFlock({ count, color, x, z, y, radius, size = 1, speed = 0.12, flap = 9, rnd }) {
  const g = new GeoBuilder();
  g.tri([0, 0, 0.5], [1.6, 0, -0.35], [0.25, 0, -0.55], color);
  g.tri([0, 0, 0.5], [-0.25, 0, -0.55], [-1.6, 0, -0.35], color);
  g.box(0, 0, 0.05, 0.22, 0.2, 1.2, color);
  const geo = g.build();
  const uT = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uT;
    sh.uniforms.uFlap = { value: flap };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uFlap;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float id = float(gl_InstanceID);
      float burst = smoothstep(0.2, 0.7, sin(uTime * 0.55 + id * 2.3));
      float fl = 0.16 + sin(uTime * uFlap + id * 1.7) * 0.75 * burst;
      float ax = abs(position.x);
      transformed.x = sign(position.x) * ax * cos(fl);
      transformed.y += ax * sin(fl);`
    );
  };
  mat.customProgramCacheKey = () => 'echo-racer-bird';
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const B = [];
  for (let i = 0; i < count; i++) B.push({ r: radius * (0.55 + rnd() * 0.5), h: (rnd() - 0.5) * radius * 0.12, ph: rnd() * Math.PI * 2, s: size * (0.8 + rnd() * 0.4) });
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const P = new THREE.Vector3();
  const S = new THREE.Vector3();
  const YA = new THREE.Vector3(0, 1, 0);
  const update = (t) => {
    uT.value = t;
    const mx = x + Math.sin(t * 0.013) * radius * 0.6;
    const mz = z + Math.cos(t * 0.011) * radius * 0.6;
    for (let i = 0; i < count; i++) {
      const b = B[i];
      const a = b.ph + t * speed;
      P.set(mx + Math.cos(a) * b.r, y + b.h + Math.sin(t * 0.8 + b.ph) * 1.5, mz + Math.sin(a) * b.r);
      // Blickrichtung entlang der Kreisbahn (gegen den Uhrzeigersinn), leicht in die Kurve geneigt
      Q.setFromAxisAngle(YA, -a);
      S.setScalar(b.s);
      M.compose(P, Q, S);
      mesh.setMatrixAt(i, M);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  return { mesh, update };
}

function blinkMaterial() {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]);
  return new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aSeed;
      attribute vec3 color;
      varying vec3 vCol;
      varying float vSeed;
      void main() {
        vCol = color;
        vSeed = aSeed;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec3 vCol;
      varying float vSeed;
      void main() {
        float ph = fract(uTime * (0.55 + vSeed * 0.3) + vSeed * 7.0);
        float on = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.2, 0.3, ph));
        gl_FragColor = vec4(vCol * mix(0.25, 4.0, on), 1.0);
        #include <fog_fragment>
      }`,
  });
}

// Felsen mit waagrechten Gesteinsschichten (Weltkoordinate y → helle/dunkle Bänder)
function strataMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Schichten leicht gewellt (wie abgelagerter Sandstein), dazu feine dunkle Fugen und helle Sandbänder
      float L = vW.y + sin(vW.x * 0.07 + vW.z * 0.05) * 1.6 + sin(vW.z * 0.23 - vW.x * 0.17) * 0.35;
      float b1 = smoothstep(0.3, 0.7, sin(L * 1.1) * 0.5 + 0.5);
      float b2 = smoothstep(0.88, 0.96, fract(L / 3.9));
      float b3 = smoothstep(0.62, 0.9, sin(L * 0.29 + 1.3) * 0.5 + 0.5);
      diffuseColor.rgb *= mix(vec3(0.8, 0.77, 0.75), vec3(1.04), b1) * (1.0 - 0.24 * b2);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.06, 0.86) + vec3(0.05, 0.035, 0.0), b3 * 0.45);`
    );
  };
  m.customProgramCacheKey = () => 'echo-racer-strata';
  return m;
}

// Werbetafeln mit Atlas-Textur, leichtem Flackern und Nebel
function billboardMaterial() {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tMap: { value: null }, uTime: { value: 0 } }]);
  uniforms.tMap.value = billboardAtlas();
  return new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv;
        vSeed = aSeed;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform sampler2D tMap;
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vec3 c = texture2D(tMap, vUv).rgb;
        float fl = 0.85 + 0.15 * sin(uTime * (2.0 + vSeed * 3.0) + vSeed * 40.0);
        float off = step(0.965, fract(sin(floor(uTime * 7.0 + vSeed * 13.0) * 12.9898) * 43758.5453));
        gl_FragColor = vec4(c * 2.3 * fl * (1.0 - off * 0.75), 1.0);
        #include <fog_fragment>
      }`,
  });
}

function buildScenery(themeId, th, track, grid, rnd, gy, det, parts, glow, blocked, sfx) {
  const meshes = [];
  // Wahrzeichen der Welt für die Kamerafahrt im Strecken-Intro: { x, y, z, r } (Kreisfahrt) oder kind 'view' (Ferne)
  const landmarks = [];
  const cx = (track.bounds.minX + track.bounds.maxX) / 2;
  const cz = (track.bounds.minZ + track.bounds.maxZ) / 2;
  const radius = Math.max(track.bounds.maxX - track.bounds.minX, track.bounds.maxZ - track.bounds.minZ) / 2;
  const solid = new GeoBuilder();
  const plants = new GeoBuilder();
  const updates = [];
  const n = (x) => Math.max(1, Math.round(x * det));

  const ring = (cnt, r0, r1, fn) => {
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * Math.PI * 2 + rnd() * 0.3;
      const r = r0 + rnd() * (r1 - r0);
      fn(cx + Math.cos(a) * r, cz + Math.sin(a) * r, i);
    }
  };

  // Blinklichter: Boxen mit eigener Phase (aSeed je Vertex)
  const blinkB = new GeoBuilder();
  const blinkSeeds = [];
  const blinkLight = (x, y, z, s, color = '#ff2a3a') => {
    const n0 = blinkB.count;
    blinkB.box(x, y, z, s, s, s, color);
    const seed = rnd();
    for (let i = n0; i < blinkB.count; i++) blinkSeeds.push(seed);
  };

  if (themeId === 'neon') {
    let tallest = null;
    // Plastik-Hochhäuser mit Fenstern, Leuchtkanten und Werbetafeln
    const bld = new GeoBuilder(true);
    const bb = { pos: [], uv: [], seed: [] };
    const foot = []; // Grundrisse der Hochhäuser (für den Straßenverkehr)
    let placed = 0;
    const want = n(190);
    for (let tries = 0; tries < 3000 && placed < want; tries++) {
      const [x, z] = randomAround(track, rnd, 260);
      const w = 10 + rnd() * 22;
      const d = 10 + rnd() * 22;
      const q = grid.nearest(x, z);
      if (q.d < 12 + Math.max(w, d) * 0.75 || blocked(x, z, Math.max(w, d) * 0.7)) continue;
      const h = 16 + Math.pow(rnd(), 1.6) * (q.d > 80 ? 110 : 60);
      const shade = ['#3a2a8f', '#52309e', '#2c3a9c', '#7a2a8e', '#2a2f6b', '#1f6a8a'][Math.floor(rnd() * 6)];
      bld.uvBox(x, gy + h / 2, z, w, h, d, shade, 16, 32);
      if (q.d < 140 && (!tallest || h > tallest.h)) tallest = { x, z, h, w: Math.max(w, d) };
      foot.push([x, z, w / 2, d / 2]);
      if (rnd() < 0.6) glow.box(x, gy + h + 0.3, z, w + 0.4, 0.5, d + 0.4, ['#ff3dd0', '#2ce7ff', '#ffd23d', '#9b6bff'][Math.floor(rnd() * 4)], 2.4);
      let roof = h;
      if (h > 30 && rnd() < 0.55) {
        // zurückgesetztes Dachgeschoss (zweite Stufe), teils mit eigener Leuchtkante
        const h2 = h * (0.12 + rnd() * 0.18);
        const w2 = w * (0.5 + rnd() * 0.2);
        const d2 = d * (0.5 + rnd() * 0.2);
        bld.uvBox(x, gy + h + h2 / 2, z, w2, h2, d2, shade, 16, 32);
        if (rnd() < 0.5) glow.box(x, gy + h + h2 + 0.25, z, w2 + 0.3, 0.4, d2 + 0.3, '#2ce7ff', 2.2);
        roof = h + h2;
      }
      if (h > 40 && rnd() < 0.6) {
        const ah = 6 + rnd() * 14;
        solid.box(x, gy + roof + ah / 2, z, 0.35, ah, 0.35, '#2a2440');
        solid.box(x, gy + roof + 0.6, z, 2.2, 1.2, 2.2, '#2a2440');
        blinkLight(x, gy + roof + ah + 0.4, z, 1.0);
      }
      if (q.d < 95 && q.k >= 0 && rnd() < 0.75) {
        const ddx = track.px[q.k] - x;
        const ddz = track.pz[q.k] - z;
        const alongX = Math.abs(ddx) > Math.abs(ddz);
        const sgn = alongX ? Math.sign(ddx) : Math.sign(ddz);
        const face = alongX ? d : w;
        const bw = face * 0.75;
        const bh = bw * 0.5;
        const by = gy + Math.max(12, h * (0.5 + rnd() * 0.3));
        const tile = Math.floor(rnd() * 8);
        const u0 = (tile % 2) * 0.5;
        const v1 = 1 - Math.floor(tile / 2) * 0.25;
        const v0 = v1 - 0.25;
        let corners;
        if (alongX) {
          const fx = x + sgn * (w / 2 + 0.2);
          corners = [[fx, by - bh / 2, z - (sgn * bw) / 2], [fx, by - bh / 2, z + (sgn * bw) / 2], [fx, by + bh / 2, z + (sgn * bw) / 2], [fx, by + bh / 2, z - (sgn * bw) / 2]];
        } else {
          const fz = z + sgn * (d / 2 + 0.2);
          corners = [[x + (sgn * bw) / 2, by - bh / 2, fz], [x - (sgn * bw) / 2, by - bh / 2, fz], [x - (sgn * bw) / 2, by + bh / 2, fz], [x + (sgn * bw) / 2, by + bh / 2, fz]];
        }
        // u läuft aus Sicht der Strecke von links nach rechts (sonst Spiegelschrift)
        const uvq = [[u0 + 0.5, v0], [u0, v0], [u0, v1], [u0 + 0.5, v1]];
        const seed = rnd();
        for (const i of [0, 1, 2, 0, 2, 3]) {
          bb.pos.push(...corners[i]);
          bb.uv.push(...uvq[i]);
          bb.seed.push(seed);
        }
      }
      placed++;
    }
    meshes.push(
      new THREE.Mesh(bld.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: col('#ffffff'), emissiveMap: windowTexture(), emissiveIntensity: 1.5 }))
    );
    if (bb.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bb.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(bb.uv, 2));
      g.setAttribute('aSeed', new THREE.Float32BufferAttribute(bb.seed, 1));
      const bm = billboardMaterial();
      meshes.push(new THREE.Mesh(g, bm));
      updates.push((t) => (bm.uniforms.uTime.value = t));
    }
    // Laternen an den Bahnleisten
    for (let s = 10; s < track.length; s += 34) {
      const side = Math.floor(s / 34) % 2 ? 1 : -1;
      const k = track.indexAt(s);
      if (track.crossing[k]) continue;
      const p = track.posAt(s, side * (track.hw[k] + 0.3), {});
      if (blocked(p.x, p.z, 0.5)) continue;
      const q = track.posAt(s, side * (track.hw[k] - 1.6), {});
      solid.box(p.x, p.y + RH + 2.9, p.z, 0.22, 5.8, 0.22, '#2a2440');
      solid.box((p.x + q.x) / 2, p.y + RH + 5.8, (p.z + q.z) / 2, 2.1, 0.18, 0.3, '#2a2440', 1, p.h + Math.PI / 2);
      glow.box(q.x, p.y + RH + 5.65, q.z, 0.7, 0.14, 0.7, '#ffd0ff', 3.2);
    }
    ring(n(70), radius + 500, radius + 900, (x, z) => {
      const h = 60 + rnd() * 220;
      solid.box(x, gy + h / 2, z, 30 + rnd() * 50, h, 30 + rnd() * 50, '#1a1240');
      if (rnd() < 0.5) glow.box(x, gy + h + 1, z, 8, 2, 8, rnd() < 0.5 ? '#ff3dd0' : '#2ce7ff', 2.5);
      else if (h > 120) blinkLight(x, gy + h + 1.5, z, 3.2);
    });
    // Straßenverkehr auf dem Spielteppich: Straßen liegen alle 45 m (x ≡ 37,5 | 82,5 und z ≡ 7,5 | 52,5 mod 90),
    if (tallest) landmarks.push({ x: tallest.x, y: gy + tallest.h * 0.62, z: tallest.z, r: Math.max(55, tallest.h * 0.85) + tallest.w });
    // Autos fahren rechts, nur auf Stücken ohne Hochhaus, und wachsen an den Enden weich ein/aus
    {
      const R = 380;
      const lines = [];
      const roadsOn = (c0, off) => {
        const out = [];
        for (const o of off) for (let v = Math.floor((c0 - R - o) / 90) * 90 + o; v <= c0 + R; v += 90) if (v >= c0 - R) out.push(v);
        return out;
      };
      for (const zc of roadsOn(cz, [7.5, 52.5])) lines.push(['x', zc]);
      for (const xc of roadsOn(cx, [37.5, 82.5])) lines.push(['z', xc]);
      const runs = [];
      for (const [axis, c] of lines) {
        const lo = (axis === 'x' ? cx : cz) - R;
        const hi = (axis === 'x' ? cx : cz) + R;
        const blk = [];
        for (const [bx, bz, hx, hz] of foot) {
          if (axis === 'x' ? Math.abs(bz - c) < hz + 4 : Math.abs(bx - c) < hx + 4) blk.push(axis === 'x' ? [bx - hx - 2, bx + hx + 2] : [bz - hz - 2, bz + hz + 2]);
        }
        blk.sort((a, b) => a[0] - b[0]);
        let s = lo;
        for (const [a, b] of blk) {
          if (b < lo || a > hi) continue;
          if (a - s > 50) runs.push({ axis, c, a: s, b: a });
          s = Math.max(s, b);
        }
        if (hi - s > 50) runs.push({ axis, c, a: s, b: hi });
      }
      // Straßenlaternen am Rand der freien Straßenstücke (abwechselnd links/rechts)
      let lamps = 0;
      for (const r of runs) {
        for (let p = r.a + 8, side = 1; p < r.b - 8 && lamps < n(140); p += 26, side = -side) {
          const off = side * 4.4;
          const lx = r.axis === 'x' ? p : r.c + off;
          const lz = r.axis === 'x' ? r.c + off : p;
          if (grid.dist(lx, lz) < 6) continue;
          const ix = r.axis === 'x' ? 0 : -side * 1.2;
          const iz = r.axis === 'x' ? -side * 1.2 : 0;
          solid.box(lx, gy + 2.6, lz, 0.22, 5.2, 0.22, '#2a2440');
          solid.box(lx + ix / 2, gy + 5.2, lz + iz / 2, r.axis === 'x' ? 0.18 : 1.3, 0.16, r.axis === 'x' ? 1.3 : 0.18, '#2a2440');
          glow.box(lx + ix, gy + 5.05, lz + iz, 0.55, 0.14, 0.55, '#ffe2b0', 2.6);
          lamps++;
        }
      }
      const tb = new GeoBuilder();
      tb.box(0, 0.42, 0, 1.8, 0.62, 3.8, '#261d4a');
      tb.box(0, 0.95, -0.25, 1.5, 0.5, 1.9, '#33296a');
      tb.box(0, 0.96, -0.25, 1.52, 0.3, 1.5, '#0e0b22');
      for (const sx of [-0.62, 0.62]) {
        tb.box(sx, 0.5, 1.91, 0.42, 0.18, 0.04, '#fff3c8', 4);
        tb.box(sx, 0.52, -1.91, 0.46, 0.16, 0.04, '#ff2440', 3.5);
      }
      tb.box(0, 0.08, 0, 1.6, 0.06, 3.3, '#2ce7ff', 1.6);
      const cars = [];
      const want = n(70);
      for (let i = 0; i < want * 3 && cars.length < want && runs.length; i++) {
        const r = runs[Math.floor(rnd() * runs.length)];
        if ((r.b - r.a) / 55 < rnd()) continue;
        const dir = rnd() < 0.5 ? 1 : -1;
        cars.push({ r, dir, p: r.a + rnd() * (r.b - r.a), v: 7 + rnd() * 6 });
      }
      if (cars.length) {
        const traffic = new THREE.InstancedMesh(tb.build(), new THREE.MeshBasicMaterial({ vertexColors: true }), cars.length);
        traffic.frustumCulled = false;
        const TM = new THREE.Matrix4();
        const TQ = new THREE.Quaternion();
        const TP = new THREE.Vector3();
        const TS = new THREE.Vector3();
        const UP = new THREE.Vector3(0, 1, 0);
        let last = 0;
        updates.push((t) => {
          const dt = Math.min(0.1, Math.max(0, t - last));
          last = t;
          for (let i = 0; i < cars.length; i++) {
            const k = cars[i];
            const r = k.r;
            k.p += k.dir * k.v * dt;
            if (k.p > r.b) k.p = r.a;
            else if (k.p < r.a) k.p = r.b;
            // Rechtsverkehr: in Fahrtrichtung rechts versetzt
            const lane = 1.7 * k.dir;
            if (r.axis === 'x') {
              TP.set(k.p, gy + 0.02, r.c + lane);
              TQ.setFromAxisAngle(UP, k.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
            } else {
              TP.set(r.c - lane, gy + 0.02, k.p);
              TQ.setFromAxisAngle(UP, k.dir > 0 ? 0 : Math.PI);
            }
            const sc = Math.min(1, (k.p - r.a) / 4, (r.b - k.p) / 4);
            TS.setScalar(Math.max(0.001, sc));
            TM.compose(TP, TQ, TS);
            traffic.setMatrixAt(i, TM);
          }
          traffic.instanceMatrix.needsUpdate = true;
        });
        meshes.push(traffic);
      }
    }
    // Suchscheinwerfer: Lichtfinger schwenken langsam über den Nachthimmel (additiv, zur Spitze hin verblassend)
    {
      const beamGeo = new THREE.CylinderGeometry(7, 0.5, 240, 20, 1, true);
      beamGeo.translate(0, 120, 0);
      const beamMat = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color('#bfe4ff') } },
        vertexShader: /* glsl */ `
          varying float vH;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vH = position.y / 240.0;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uCol;
          varying float vH;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            // zur Kegelmitte (Blick quer) heller, an der Silhouette und nach oben weich auslaufend
            float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
            float a = core * (1.0 - vH) * (1.0 - vH) * smoothstep(0.0, 0.03, vH) * 0.22;
            gl_FragColor = vec4(uCol * a, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const lights = [];
      for (let i = 0; i < n(4); i++) {
        const a = (i / n(4)) * Math.PI * 2 + rnd() * 0.6;
        const r = radius + 90 + rnd() * 80;
        const m = new THREE.Mesh(beamGeo, beamMat);
        m.position.set(cx + Math.cos(a) * r, gy, cz + Math.sin(a) * r);
        m.frustumCulled = false;
        meshes.push(m);
        lights.push({ m, ph: rnd() * 6.3, sp: 0.18 + rnd() * 0.14 });
      }
      updates.push((t) => {
        for (const L of lights) {
          // Kegel kippt 15–35° aus der Senkrechten und kreist langsam
          L.m.rotation.set(0.26 + Math.sin(t * L.sp * 0.7 + L.ph) * 0.17, t * L.sp + L.ph, 0, 'YXZ');
        }
      });
    }
    // Fliegende Autos über der Stadt
    const fcB = new GeoBuilder();
    fcB.box(0, 0, 0, 1.7, 0.5, 3.4, '#1c1630');
    fcB.box(0, 0.36, -0.3, 1.2, 0.36, 1.5, '#2a2050');
    fcB.box(0, 0, -1.72, 1.4, 0.14, 0.06, '#ff2a6a', 4);
    fcB.box(0, -0.28, 0, 1.3, 0.05, 2.7, '#2ce7ff', 3);
    fcB.box(0, 0, 1.72, 1.2, 0.1, 0.06, '#fff6e0', 4);
    const fcGeo = fcB.build();
    const fcMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const cnt = n(32);
    const fc = new THREE.InstancedMesh(fcGeo, fcMat, cnt);
    fc.frustumCulled = false;
    const routes = [];
    for (let i = 0; i < cnt; i++) {
      const R = radius * 0.5 + rnd() * (radius + 420);
      routes.push({ R, y: gy + 26 + rnd() * 70, w: ((rnd() < 0.5 ? -1 : 1) * (22 + rnd() * 22)) / R, ph: rnd() * Math.PI * 2 });
    }
    const M = new THREE.Matrix4();
    const qt = new THREE.Quaternion();
    const pv = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const yAxis = new THREE.Vector3(0, 1, 0);
    updates.push((t) => {
      for (let i = 0; i < cnt; i++) {
        const r = routes[i];
        const a = r.ph + r.w * t;
        pv.set(cx + Math.cos(a) * r.R, r.y + Math.sin(t * 0.7 + i) * 1.5, cz + Math.sin(a) * r.R);
        const dxv = -Math.sin(a) * Math.sign(r.w);
        const dzv = Math.cos(a) * Math.sign(r.w);
        qt.setFromAxisAngle(yAxis, Math.atan2(dxv, dzv));
        M.compose(pv, qt, one);
        fc.setMatrixAt(i, M);
      }
      fc.instanceMatrix.needsUpdate = true;
    });
    meshes.push(fc);
  } else if (themeId === 'canyon') {
    const rocks = ['#ff7a3d', '#e8582a', '#ffa04a', '#d9452a', '#ffb86b', '#c8462a'];
    const pick = () => rocks[Math.floor(rnd() * rocks.length)];
    let placed = 0;
    const want = n(150);
    for (let tries = 0; tries < 3000 && placed < want; tries++) {
      const [x, z] = randomAround(track, rnd, 300);
      const sx = 5 + rnd() * 15;
      const sz = 5 + rnd() * 15;
      const sy = 4 + Math.pow(rnd(), 1.5) * 28;
      if (grid.dist(x, z) < 6 + Math.max(sx, sz) || blocked(x, z, Math.max(sx, sz))) continue;
      solid.add(BASIC.ico1, { x, y: gy + sy * 0.35, z, sx, sy, sz, ry: rnd() * 6, color: pick() });
      placed++;
    }
    // Schluchtwände an engen Stellen (vom Boden bis über die Bahn); eng = halbe Breite ≤ 6,65 m (nach der Verbreiterung)
    for (let s = 0; s < track.length; s += 6) {
      const k = track.indexAt(s);
      if (track.hw[k] > 6.65) continue;
      for (const side of [-1, 1]) {
        const r = 4 + rnd() * 3;
        const p = track.posAt(s, side * (track.hw[k] + 1.8 + r), {});
        if (grid.dist(p.x, p.z) < r * 0.6 || blocked(p.x, p.z, r)) continue;
        solid.add(BASIC.ico1, { x: p.x, y: gy + 9, z: p.z, sx: r, sy: 16 + rnd() * 16, sz: r * 1.4, ry: rnd() * 6, color: pick() });
      }
    }
    // Felsbögen über der Bahn (das erste ist das Wahrzeichen fürs Strecken-Intro)
    let arches = 0;
    for (let s = 40; s < track.length && arches < 2; s += 37) {
      const k = track.indexAt(s);
      if (track.hw[k] > 6.65 || track.crossing[k]) continue;
      const span = track.hw[k] + 4.2;
      if (!arches) {
        const c = track.posAt(s, 0, {});
        landmarks.push({ x: c.x, y: c.y + 5, z: c.z, r: 30 });
      }
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI;
        const p = track.posAt(s, Math.cos(a) * span, {});
        solid.add(BASIC.ico1, { x: p.x, y: p.y + Math.sin(a) * 9 + 1.2, z: p.z, sx: 2.6, sy: 2.4, sz: 3.2, ry: rnd() * 6, color: '#e8582a' });
      }
      for (const side of [-1, 1]) {
        const p = track.posAt(s, side * span, {});
        solid.add(BASIC.ico1, { x: p.x, y: gy / 2, z: p.z, sx: 2.8, sy: -gy / 2 + 2, sz: 3.4, ry: rnd() * 6, color: '#c8462a' });
      }
      arches++;
      s += 260;
    }
    // Geier kreisen hoch über der Schlucht
    for (let f = 0; f < 2; f++) {
      const fl = birdFlock({ count: n(6), color: '#2a1a14', x: cx + (rnd() - 0.5) * radius, z: cz + (rnd() - 0.5) * radius, y: gy + 55 + rnd() * 25, radius: 60 + rnd() * 40, size: 2.2, speed: 0.07, flap: 4, rnd });
      meshes.push(fl.mesh);
      updates.push(fl.update);
    }
    // Steppenläufer: rollen über den Sand (unter der aufgeständerten Bahn hindurch), hüpfen und kommen immer wieder
    {
      const tg = new GeoBuilder();
      const tw = new THREE.IcosahedronGeometry(1, 1);
      tg.add(tw, { color: '#9a7a4a' });
      tg.add(tw, { sx: 0.82, sy: 0.82, sz: 0.82, rx: 0.6, ry: 0.4, color: '#7a5a32' });
      tw.dispose();
      const cnt = n(10);
      const weeds = new THREE.InstancedMesh(tg.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), cnt);
      weeds.frustumCulled = false;
      const W = [];
      const wind = rnd() * Math.PI * 2;
      for (let i = 0; i < cnt; i++) W.push({ u: rnd(), off: (rnd() - 0.5) * 2 * (radius + 120), v: 4 + rnd() * 4, s: 0.9 + rnd() * 0.7, ph: rnd() * 10 });
      const dx = Math.cos(wind);
      const dz = Math.sin(wind);
      const L = (radius + 160) * 2;
      const WM = new THREE.Matrix4();
      const WQ = new THREE.Quaternion();
      const WP = new THREE.Vector3();
      const WS = new THREE.Vector3();
      const AX = new THREE.Vector3(dz, 0, -dx);
      updates.push((t) => {
        for (let i = 0; i < cnt; i++) {
          const w = W[i];
          // Strecke entlang der Windrichtung, quer versetzt; Hüpfer + Rollen um die Querachse
          const along = (((w.u * L + t * w.v) % L) + L) % L - L / 2;
          const hop = Math.abs(Math.sin(t * 2.6 + w.ph)) * 1.2 * w.s;
          WP.set(cx + dx * along - dz * w.off, gy + w.s + hop, cz + dz * along + dx * w.off);
          WQ.setFromAxisAngle(AX, -(t * w.v) / w.s);
          WS.setScalar(w.s * Math.min(1, (L / 2 - Math.abs(along)) / 12));
          WM.compose(WP, WQ, WS);
          weeds.setMatrixAt(i, WM);
        }
        weeds.instanceMatrix.needsUpdate = true;
      });
      meshes.push(weeds);
    }
    // Staubteufel: Sandwirbel abseits der Bahn – drehende Bänder auf einem offenen Trichter, entstehen, wandern ein
    // Stück und vergehen, dann woanders neu
    {
      const spots = [];
      for (let i = 0; i < 160 && spots.length < 8; i++) {
        const [x, z] = randomAround(track, rnd, 110);
        const dd = grid.dist(x, z);
        // gut sichtbar, aber weit genug weg, dass der Wirbel nie die Bahn kreuzt
        if (dd > 45 && dd < 100 && !blocked(x, z, 14)) spots.push([x, z]);
      }
      const geo = new THREE.CylinderGeometry(5, 0.4, 22, 28, 10, true);
      geo.translate(0, 11, 0);
      const devils = [];
      for (let i = 0; i < Math.min(spots.length, n(3)); i++) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color('#d6a86e') } },
          vertexShader: /* glsl */ `
            varying vec2 vUv;
            varying vec3 vN;
            varying vec3 vV;
            varying float vD;
            void main() {
              vUv = uv;
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              vN = normalize(normalMatrix * normal);
              vV = normalize(-mv.xyz);
              vD = -mv.z;
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: /* glsl */ `
            uniform float uTime;
            uniform float uA;
            uniform vec3 uCol;
            varying vec2 vUv;
            varying vec3 vN;
            varying vec3 vV;
            varying float vD;
            void main() {
              // schräge Wirbelbänder, die nach oben laufen und sich drehen
              float a = vUv.x * 6.2832;
              float b1 = sin(a * 3.0 + vUv.y * 9.0 - uTime * 7.0);
              float b2 = sin(a * 5.0 - vUv.y * 14.0 - uTime * 11.0 + 1.3);
              float band = smoothstep(0.05, 0.75, b1 * 0.6 + b2 * 0.4 + 0.25);
              // unten dicht, oben ausfransend; Silhouette läuft weich aus, in der Ferne im Dunst
              float h = smoothstep(0.0, 0.07, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
              float rim = smoothstep(0.05, 0.5, abs(dot(normalize(vN), normalize(vV))));
              float far = 1.0 - smoothstep(180.0, 420.0, vD);
              float alpha = band * h * rim * far * 0.68 * uA;
              vec3 c = uCol * (0.78 + 0.3 * vUv.y + 0.12 * b1);
              gl_FragColor = vec4(c, alpha);
            }`,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const m = new THREE.Mesh(geo, mat);
        m.frustumCulled = false;
        // aufgewirbelter Sand am Fuß: flache Scheibe mit kreisenden Schlieren
        const baseMat = new THREE.ShaderMaterial({
          uniforms: mat.uniforms,
          vertexShader: /* glsl */ `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
          fragmentShader: /* glsl */ `
            uniform float uTime;
            uniform float uA;
            uniform vec3 uCol;
            varying vec2 vUv;
            void main() {
              vec2 q = vUv * 2.0 - 1.0;
              float r = length(q);
              float a = atan(q.y, q.x);
              float sw = sin(a * 4.0 + r * 9.0 - uTime * 6.0) * 0.5 + 0.5;
              float alpha = sw * smoothstep(1.0, 0.45, r) * smoothstep(0.05, 0.3, r) * 0.55 * uA;
              gl_FragColor = vec4(uCol * (0.85 + 0.2 * sw), alpha);
            }`,
          transparent: true,
          depthWrite: false,
        });
        const base = new THREE.Mesh(new THREE.CircleGeometry(6.5, 32).rotateX(-Math.PI / 2), baseMat);
        base.position.y = 0.3;
        m.add(base);
        meshes.push(m);
        devils.push({ m, mat, spot: i % spots.length, ph: i / 3 + rnd() * 0.2, per: 30 + rnd() * 12, cyc: -1, ang: rnd() * 6.3 });
      }
      if (devils.length) {
        updates.push((t) => {
          for (const d of devils) {
            const f = t / d.per + d.ph;
            const cyc = Math.floor(f);
            const k = f - cyc;
            // jeder Durchgang an einer anderen Stelle
            if (cyc !== d.cyc) {
              d.cyc = cyc;
              d.spot = (d.spot + 3) % spots.length;
              d.ang = (d.ang + 2.4) % 6.3;
            }
            const [sx, sz] = spots[d.spot];
            const r = 4 + k * 14;
            d.m.position.set(sx + Math.cos(d.ang + k * 2) * r, gy, sz + Math.sin(d.ang + k * 2) * r);
            d.m.rotation.set(Math.sin(t * 0.9 + d.ph * 5) * 0.07, t * 3, Math.cos(t * 0.7 + d.ph * 3) * 0.07);
            const life = Math.min(1, k / 0.18) * (1 - Math.max(0, (k - 0.72) / 0.28));
            d.m.scale.set(0.6 + life * 0.4, 0.5 + life * 0.5, 0.6 + life * 0.4);
            d.mat.uniforms.uA.value = life;
            d.mat.uniforms.uTime.value = t;
          }
        });
      }
    }
    // Tafelberge mit Schichten
    ring(n(24), radius + 380, radius + 900, (x, z) => {
      const r = 40 + rnd() * 80;
      const h = 60 + rnd() * 140;
      for (let L = 0; L < 3; L++) {
        const rr = r * (1 - L * 0.12);
        solid.add(BASIC.cyl6, { x, y: gy + (h / 3) * (L + 0.5), z, sx: rr, sy: h / 3, sz: rr * 0.85, ry: rnd() * 0.2, color: ['#e8582a', '#ffb86b', '#c8462a'][L] });
      }
    });
    // Spielzeug-Kakteen mit Blüten
    for (let i = 0; i < n(80); i++) {
      const [x, z] = randomAround(track, rnd, 140);
      if (grid.dist(x, z) < 5 || blocked(x, z, 1)) continue;
      const h = 3 + rnd() * 4;
      plants.add(BASIC.cyl12, { x, y: gy + h / 2, z, sx: 0.55, sy: h, sz: 0.55, color: '#2fbf5a', smooth: true });
      plants.add(BASIC.sphere, { x, y: gy + h, z, sx: 0.55, sy: 0.4, sz: 0.55, color: '#2fbf5a', smooth: true });
      plants.add(BASIC.cyl12, { x: x + 0.9, y: gy + h * 0.6, z, sx: 0.35, sy: h * 0.42, sz: 0.35, color: '#2fbf5a', smooth: true });
      plants.add(BASIC.sphere, { x: x + 0.9, y: gy + h * 0.81, z, sx: 0.35, sy: 0.3, sz: 0.35, color: '#2fbf5a', smooth: true });
      plants.add(BASIC.cyl12, { x: x + 0.55, y: gy + h * 0.42, z, rz: Math.PI / 2, sx: 0.3, sy: 0.8, sz: 0.3, color: '#2fbf5a', smooth: true });
      plants.add(BASIC.ico, { x, y: gy + h + 0.45, z, sx: 0.5, sy: 0.4, sz: 0.5, color: '#ff5fa8' });
    }
  } else if (themeId === 'sky') {
    // Wolken: unten lila, oben weiß (Cel-Look)
    const clouds = new GeoBuilder();
    for (let i = 0; i < n(90); i++) {
      const [x, z] = randomAround(track, rnd, 500);
      const below = rnd() < 0.55;
      const y = below ? -18 - rnd() * 40 : 12 + rnd() * 70;
      if (!below && grid.dist(x, z) < 40) continue;
      const cntB = 4 + Math.floor(rnd() * 5);
      const s = 8 + rnd() * 16;
      for (let k = 0; k < cntB; k++) {
        clouds.add(BASIC.ico1, { x: x + (rnd() - 0.5) * s * 2.4, y: y + (rnd() - 0.5) * s * 0.5, z: z + (rnd() - 0.5) * s * 1.6, sx: s * (0.6 + rnd() * 0.6), sy: s * (0.45 + rnd() * 0.3), sz: s * (0.6 + rnd() * 0.6), color: '#ffffff' });
      }
    }
    const cg = clouds.build();
    const cc = cg.attributes.color;
    const cn = cg.attributes.normal;
    const lil = new THREE.Color('#c9b8ff');
    const wht = new THREE.Color('#ffffff');
    const tmp = new THREE.Color();
    for (let i = 0; i < cc.count; i++) {
      tmp.copy(lil).lerp(wht, Math.min(1, Math.max(0, cn.getY(i) * 0.5 + 0.55)));
      cc.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    const cloudMesh = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: col('#b8c8ff', 0.3) }));
    meshes.push(cloudMesh);
    updates.push((t) => {
      cloudMesh.position.x = Math.sin(t * 0.02) * 30;
      cloudMesh.position.z = Math.cos(t * 0.017) * 20;
    });
    // Schwebende Inseln: Felskörper mit Zapfen darunter, Erdschicht, Graskappe mit Überhang,
    // oben Bäumchen, Büsche und ein Kristall – an manchen Inseln stürzt ein Wasserfall ins Wolkenmeer
    const falls = new GeoBuilder(true);
    ring(n(20), radius * 0.6, radius + 420, (x, z) => {
      if (grid.dist(x, z) < 45 || blocked(x, z, 40)) return;
      const r = 12 + rnd() * 26;
      const y = -10 + rnd() * 50;
      if (r > 24 && (!landmarks.length || grid.dist(x, z) < landmarks[0].dd)) landmarks[0] = { x, y: y + 4, z, r: r * 2.6, dd: grid.dist(x, z) };
      const rock = ['#8a5aa8', '#7a4f9a', '#9a6ab8'][Math.floor(rnd() * 3)];
      solid.add(BASIC.cone7, { x, y: y - r * 0.9, z, sx: r, sy: r * 1.8, sz: r, rx: Math.PI, ry: rnd() * 6, color: rock });
      const nz = 3 + Math.floor(rnd() * 4);
      for (let k = 0; k < nz; k++) {
        const a = rnd() * Math.PI * 2;
        const d = r * (0.35 + rnd() * 0.4);
        const zr = r * (0.16 + rnd() * 0.18);
        const zh = r * (0.7 + rnd() * 0.9);
        solid.add(BASIC.cone5, { x: x + Math.cos(a) * d, y: y - 0.8 - zh * 0.5, z: z + Math.sin(a) * d, sx: zr, sy: zh, sz: zr, rx: Math.PI, ry: rnd() * 6, color: k % 2 ? '#6a4488' : rock });
      }
      solid.add(BASIC.cyl12, { x, y: y - 0.55, z, sx: r, sy: 1.5, sz: r, color: '#8a5a3a' });
      solid.add(BASIC.cyl12, { x, y: y + 0.55, z, sx: r * 1.05, sy: 1.1, sz: r * 1.05, color: '#5be08a' });
      solid.add(BASIC.cyl12, { x, y: y + 0.02, z, sx: r * 1.09, sy: 0.22, sz: r * 1.09, color: '#3fbf6a' });
      const nb = 2 + Math.floor(rnd() * 4);
      for (let k = 0; k < nb; k++) {
        const a = rnd() * Math.PI * 2;
        const d = r * (0.2 + rnd() * 0.55);
        const bx = x + Math.cos(a) * d;
        const bz = z + Math.sin(a) * d;
        if (rnd() < 0.55) {
          const th2 = 2 + rnd() * 3;
          solid.box(bx, y + 1.1 + th2 / 2, bz, 0.55, th2, 0.55, '#7a5236');
          solid.add(BASIC.ico1, { x: bx, y: y + 1.1 + th2 + 1.1, z: bz, sx: 2 + rnd(), sy: 1.6 + rnd(), sz: 2 + rnd(), ry: rnd() * 6, color: rnd() < 0.5 ? '#3faa55' : '#58c96a' });
        } else {
          solid.add(BASIC.ico1, { x: bx, y: y + 1.5, z: bz, sx: 1.4 + rnd(), sy: 0.9 + rnd() * 0.6, sz: 1.4 + rnd(), ry: rnd() * 6, color: rnd() < 0.4 ? '#ff8fc8' : '#4fc96a' });
        }
      }
      glow.add(BASIC.octa, { x, y: y + 4 + r * 0.25, z, sx: r * 0.18, sy: r * 0.4, sz: r * 0.18, color: rnd() < 0.5 ? '#ff5fb0' : '#40d0ff', k: 2.2 });
      if (rnd() < 0.5) {
        // Wasserfall: senkrechtes Band an der Inselkante (u quer, v = Fallstrecke)
        const a = rnd() * Math.PI * 2;
        const ex = x + Math.cos(a) * r * 1.06;
        const ez = z + Math.sin(a) * r * 1.06;
        const tx = -Math.sin(a);
        const tz = Math.cos(a);
        const w = 2.6 + rnd() * 2.4;
        const h = 34 + rnd() * 40;
        const top = y + 0.9;
        falls.quad([ex - tx * w, top, ez - tz * w], [ex + tx * w, top, ez + tz * w], [ex + tx * w, top - h, ez + tz * w], [ex - tx * w, top - h, ez - tz * w], '#ffffff', 1, [[0, 0], [1, 0], [1, h / 12], [0, h / 12]]);
        // Gischt-Wölkchen an der Abbruchkante
        solid.add(BASIC.ico1, { x: ex, y: top - 0.3, z: ez, sx: w * 0.9, sy: 0.6, sz: w * 0.9, color: '#e8f6ff' });
      }
    });
    if (falls.count) {
      const fm = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            // nach unten laufende Wasserstreifen, Ränder ausgefranst, unten in Gischt auslaufend
            float v = vUv.y - uTime * 1.6;
            float s1 = smoothstep(0.35, 0.65, fract(v * 1.3 + sin(vUv.x * 9.0) * 0.18));
            float s2 = smoothstep(0.4, 0.6, fract(v * 2.7 + vUv.x * 2.1));
            float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
            float fade = 1.0 - smoothstep(1.2, 5.5, vUv.y);
            vec3 c = mix(vec3(0.36, 0.7, 1.0), vec3(0.95, 0.99, 1.0), s1 * 0.65 + s2 * 0.25);
            gl_FragColor = vec4(c, (0.72 + 0.28 * s1) * edge * fade);
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      meshes.push(new THREE.Mesh(falls.build(), fm));
      updates.push((t) => (fm.uniforms.uTime.value = t));
    }
    // Leuchtringe über der Bahn
    for (let s = 60; s < track.length - 30; s += 170) {
      const k = track.indexAt(s);
      const p = track.posAt(s, 0, {});
      const r = track.hw[k] + 3;
      const torus = new THREE.TorusGeometry(r, 0.55, 6, 28, Math.PI);
      glow.add(torus, { x: p.x, y: p.y, z: p.z, ry: p.h + Math.PI / 2, color: rnd() < 0.5 ? '#ff5fb0' : '#40d0ff', k: 2.4 });
      torus.dispose();
    }
    // Möwenschwärme zwischen den Inseln
    for (let f = 0; f < 2; f++) {
      const fl = birdFlock({ count: n(9), color: '#f4f4fa', x: cx + (rnd() - 0.5) * radius * 1.4, z: cz + (rnd() - 0.5) * radius * 1.4, y: 22 + rnd() * 25, radius: 80 + rnd() * 60, size: 1.4, speed: 0.15, flap: 10, rnd });
      meshes.push(fl.mesh);
      updates.push(fl.update);
    }
    // Heißluftballons (Instanzen, schweben und treiben)
    const bal = new GeoBuilder();
    const balGeo = new THREE.IcosahedronGeometry(1, 3);
    bal.add(balGeo, { sy: 1.2, color: '#ffffff', smooth: true });
    balGeo.dispose();
    bal.box(0, -1.75, 0, 0.6, 0.45, 0.6, '#8a5a3a');
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bal.box(sx * 0.32, -1.3, sz * 0.32, 0.03, 0.6, 0.03, '#5a4030');
    const bg = bal.build();
    const bcol = bg.attributes.color;
    const bpos = bg.attributes.position;
    for (let i = 0; i < bcol.count; i += 3) {
      const mx = (bpos.getX(i) + bpos.getX(i + 1) + bpos.getX(i + 2)) / 3;
      const mz = (bpos.getZ(i) + bpos.getZ(i + 1) + bpos.getZ(i + 2)) / 3;
      const my = (bpos.getY(i) + bpos.getY(i + 1) + bpos.getY(i + 2)) / 3;
      if (my < -1.25) continue;
      const stripe = Math.floor(((Math.atan2(mz, mx) + Math.PI) / (Math.PI * 2)) * 10) % 2;
      const k = stripe ? 1 : 0.62;
      for (let j = 0; j < 3; j++) bcol.setXYZ(i + j, k, k, k);
    }
    const balMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const bcnt = n(14);
    const balloons = new THREE.InstancedMesh(bg, balMat, bcnt);
    balloons.frustumCulled = false;
    const bdata = [];
    const palette = ['#ff4fa3', '#ffd23d', '#40d0ff', '#ff7a1f', '#7dff5a', '#a585ff'];
    for (let i = 0; i < bcnt; i++) {
      bdata.push({ a: rnd() * Math.PI * 2, r: radius + 30 + rnd() * 260, y: 14 + rnd() * 50, s: 5 + rnd() * 4, ph: rnd() * 10 });
      balloons.setColorAt(i, col(palette[i % palette.length]));
    }
    const M = new THREE.Matrix4();
    const qt = new THREE.Quaternion();
    const pv = new THREE.Vector3();
    const sv = new THREE.Vector3();
    updates.push((t) => {
      for (let i = 0; i < bcnt; i++) {
        const b = bdata[i];
        const a = b.a + t * 0.004;
        pv.set(cx + Math.cos(a) * b.r, b.y + Math.sin(t * 0.4 + b.ph) * 2.5, cz + Math.sin(a) * b.r);
        sv.setScalar(b.s);
        M.compose(pv, qt, sv);
        balloons.setMatrixAt(i, M);
      }
      balloons.instanceMatrix.needsUpdate = true;
    });
    meshes.push(balloons);
    // Regenbogen gegenüber der Sonne: steigt weit hinter der Bahn aus dem Wolkenmeer auf (klare Farbbänder, durchscheinend)
    {
      const sun = th.sky.sun;
      const hl = Math.hypot(sun[0], sun[2]) || 1;
      const dx = -sun[0] / hl;
      const dz = -sun[2] / hl;
      const R = radius + 520;
      const RO = 300;
      const RI = RO * 0.86;
      const geo = new THREE.RingGeometry(RI, RO, 128, 1, 0, Math.PI);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uRI: { value: RI }, uRO: { value: RO } },
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() {
            vP = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uRI;
          uniform float uRO;
          varying vec2 vP;
          vec3 band(float t) {
            // außen Rot … innen Violett
            vec3 c = mix(vec3(0.55, 0.35, 0.95), vec3(0.25, 0.45, 1.0), smoothstep(0.0, 0.2, t));
            c = mix(c, vec3(0.25, 0.85, 0.45), smoothstep(0.2, 0.4, t));
            c = mix(c, vec3(1.0, 0.92, 0.3), smoothstep(0.4, 0.58, t));
            c = mix(c, vec3(1.0, 0.6, 0.2), smoothstep(0.58, 0.76, t));
            c = mix(c, vec3(1.0, 0.3, 0.3), smoothstep(0.76, 0.92, t));
            return c;
          }
          void main() {
            float r = length(vP);
            float t = clamp((r - uRI) / (uRO - uRI), 0.0, 1.0);
            // Ränder weich auslaufen lassen, unten im Wolkenmeer ausblenden
            float edge = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.88, 1.0, t));
            float foot = smoothstep(0.0, 0.32, vP.y / uRO);
            gl_FragColor = vec4(band(t), 0.42 * edge * foot);
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const bow = new THREE.Mesh(geo, mat);
      bow.position.set(cx + dx * R, -55, cz + dz * R);
      // Bogenfläche zur Bahnmitte drehen
      bow.rotation.y = Math.atan2(-dx, -dz);
      bow.renderOrder = -5;
      bow.frustumCulled = false;
      meshes.push(bow);
    }
  } else if (themeId === 'park') {
    buildPark({ track, grid, rnd, gy, det, glow, solid, meshes, updates, blocked, blink: blinkLight, n, landmarks, sfx });
  } else if (themeId === 'garden') {
    // Riesengarten: die Spielzeugbahn ist winzig – Bäume, Grashalme, Blumen, Teich, Bauklötze, Bälle, Zaun
    const plantB = new GeoBuilder(false, true);
    plantB.pbrMap = { '#ffffff': [0.3, 0.05], '#e8443a': [0.3, 0.05] };
    plantB.pbrDefault = [0.7, 0];
    const leaf = ['#3f9a3a', '#5fbf4a', '#2f7f34', '#4aab3e'];
    const pickLeaf = () => leaf[Math.floor(rnd() * leaf.length)];
    const ponds = [];
    const inPond = (x, z, r = 0) => ponds.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r);
    // Teich mit Seerosen und Steinrand
    for (let tries = 0; tries < 400 && ponds.length < 2; tries++) {
      const [x, z] = randomAround(track, rnd, 120);
      const r = 22 + rnd() * 16;
      const dd = grid.dist(x, z);
      if (dd < r + 10 || dd > r + 60 || blocked(x, z, r) || inPond(x, z, r + 20)) continue;
      ponds.push({ x, z, r });
    }
    const water = new GeoBuilder();
    for (const p of ponds) {
      const seg = 40;
      const rr = [];
      for (let i = 0; i < seg; i++) rr.push(p.r * (0.85 + 0.15 * Math.sin(i * 1.7 + p.x) * Math.cos(i * 0.9)));
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        const r0 = rr[i];
        const r1 = rr[(i + 1) % seg];
        water.tri([p.x, gy + 0.08, p.z], [p.x + Math.sin(a0) * r0, gy + 0.08, p.z + Math.cos(a0) * r0], [p.x + Math.sin(a1) * r1, gy + 0.08, p.z + Math.cos(a1) * r1], '#ffffff');
        if (i % 2 === 0) solid.add(BASIC.ico1, { x: p.x + Math.sin(a0) * (r0 + 0.6), y: gy + 0.25, z: p.z + Math.cos(a0) * (r0 + 0.6), sx: 1.6 + rnd(), sy: 0.8 + rnd() * 0.5, sz: 1.4 + rnd(), ry: rnd() * 6, color: rnd() < 0.5 ? '#a8a29a' : '#8f8a84' });
      }
      for (let k = 0; k < 9; k++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * p.r * 0.65;
        const lx = p.x + Math.sin(a) * d;
        const lz = p.z + Math.cos(a) * d;
        plantB.add(BASIC.cyl24, { x: lx, y: gy + 0.13, z: lz, sx: 1.6 + rnd() * 1.2, sy: 0.06, sz: 1.6 + rnd() * 1.2, color: '#3f9a3a', smooth: true });
        if (rnd() < 0.4) plantB.add(BASIC.sphere, { x: lx + 0.4, y: gy + 0.35, z: lz, sx: 0.45, sy: 0.3, sz: 0.45, color: '#ff9ad0', smooth: true });
      }
    }
    if (water.count) {
      const wm = waterMaterial(th);
      meshes.push(new THREE.Mesh(water.build(), wm));
      updates.push((t) => (wm.uniforms.uTime.value = t));
    }
    // Bäume: Stamm + mehrere runde Kronen
    let placed = 0;
    for (let tries = 0; tries < 2500 && placed < n(120); tries++) {
      const [x, z] = randomAround(track, rnd, 260);
      const s = 0.8 + rnd() * 0.9;
      const dd = grid.dist(x, z);
      if (dd < 10 + 6 * s || blocked(x, z, 6 * s) || inPond(x, z, 6 * s)) continue;
      const h = 9 * s;
      plantB.add(BASIC.cyl12, { x, y: gy + h / 2, z, sx: 0.55 * s, sy: h, sz: 0.55 * s, color: '#7a4a2a', smooth: true });
      const lumps = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < lumps; k++) {
        const a = (k / lumps) * Math.PI * 2 + rnd();
        const rr = (k === 0 ? 0 : 2.2) * s;
        plantB.add(BASIC.ico1, { x: x + Math.cos(a) * rr, y: gy + h + (k === 0 ? 1.6 : 0.2 + rnd()) * s, z: z + Math.sin(a) * rr, sx: (3.2 + rnd()) * s, sy: (2.8 + rnd()) * s, sz: (3.2 + rnd()) * s, color: pickLeaf(), smooth: true });
      }
      placed++;
    }
    // Riesige Grashalme in Büscheln nahe der Bahn (lassen die Bahn wie Spielzeug wirken)
    for (let i = 0, made = 0; i < 1600 && made < n(170); i++) {
      const [x, z] = randomAround(track, rnd, 90);
      const dd = grid.dist(x, z);
      if (dd < 3 || dd > 45 || blocked(x, z, 2) || inPond(x, z, 2)) continue;
      const cnt = 4 + Math.floor(rnd() * 5);
      for (let k = 0; k < cnt; k++) {
        const h = 2.5 + rnd() * 4.5;
        plantB.add(BASIC.cone5, { x: x + (rnd() - 0.5) * 2.2, y: gy + h / 2, z: z + (rnd() - 0.5) * 2.2, rx: (rnd() - 0.5) * 0.5, rz: (rnd() - 0.5) * 0.5, sx: 0.22, sy: h, sz: 0.12, color: pickLeaf(), smooth: true });
      }
      made++;
    }
    // Riesenblumen (Margeriten und Sonnenblumen) mit Stängel, Blättern und Blüte
    for (let i = 0, made = 0; i < 1200 && made < n(42); i++) {
      const [x, z] = randomAround(track, rnd, 120);
      const dd = grid.dist(x, z);
      if (dd < 6 || dd > 70 || blocked(x, z, 3) || inPond(x, z, 3)) continue;
      const sun = rnd() < 0.35;
      const h = (sun ? 11 : 6) + rnd() * 4;
      plantB.add(BASIC.cyl12, { x, y: gy + h / 2, z, sx: 0.22, sy: h, sz: 0.22, color: '#3f8a2e', smooth: true });
      plantB.add(BASIC.sphere, { x: x + 0.9, y: gy + h * 0.45, z, rz: -0.6, sx: 1.2, sy: 0.12, sz: 0.5, color: '#4aab3e', smooth: true });
      const a = Math.atan2(cx - x, cz - z);
      const fx = Math.sin(a);
      const fz = Math.cos(a);
      const pet = sun ? '#ffc81f' : ['#ffffff', '#ff8ac8', '#ffd23d'][Math.floor(rnd() * 3)];
      const R = sun ? 2.2 : 1.4;
      plantB.add(BASIC.cyl24, { x: x + fx * 0.2, y: gy + h, z: z + fz * 0.2, rx: Math.PI / 2, ry: a, sx: R * 0.42, sy: 0.25, sz: R * 0.42, color: sun ? '#6a3a1a' : '#ffd23d', smooth: true });
      for (let k = 0; k < 10; k++) {
        const pa = (k / 10) * Math.PI * 2;
        const ox = Math.cos(pa) * R * 0.75;
        const oy = Math.sin(pa) * R * 0.75;
        plantB.add(BASIC.ico, { x: x + Math.cos(a) * ox, y: gy + h + oy, z: z - Math.sin(a) * ox, ry: a, rz: pa, sx: R * 0.42, sy: R * 0.16, sz: 0.1, color: pet });
      }
      made++;
    }
    // Bauklötze (gestapelt) und Wasserbälle
    const blockCols = ['#e8443a', '#2f7fd8', '#ffd23d', '#3fbf5a', '#ff8a1f', '#a585ff'];
    for (let i = 0, made = 0; i < 600 && made < n(22); i++) {
      const [x, z] = randomAround(track, rnd, 100);
      const dd = grid.dist(x, z);
      if (dd < 9 || dd > 60 || blocked(x, z, 4) || inPond(x, z, 4)) continue;
      const stack = 1 + Math.floor(rnd() * 3);
      const S = 3 + rnd() * 1.5;
      for (let k = 0; k < stack; k++) {
        const c = blockCols[Math.floor(rnd() * blockCols.length)];
        const ry = rnd() * 0.8;
        solid.box(x + (rnd() - 0.5) * 0.6, gy + S / 2 + k * S, z + (rnd() - 0.5) * 0.6, S, S, S, c, 1, ry);
        solid.box(x, gy + S / 2 + k * S, z, S * 1.02, S * 0.6, S * 0.6, '#ffffff', 1, ry);
      }
      made++;
    }
    const ballG = new THREE.SphereGeometry(1, 24, 16);
    for (let i = 0, made = 0; i < 300 && made < 5; i++) {
      const [x, z] = randomAround(track, rnd, 90);
      const dd = grid.dist(x, z);
      const r = 2.6 + rnd() * 1.6;
      if (dd < r + 6 || dd > 50 || blocked(x, z, r) || inPond(x, z, r)) continue;
      const b = new GeoBuilder(false, true);
      b.add(ballG, { smooth: true, color: '#ffffff' });
      const g = b.build();
      const ca = g.attributes.color;
      const pa = g.attributes.position;
      const segC = [col('#e8443a'), col('#ffffff'), col('#2f7fd8'), col('#ffd23d'), col('#ffffff'), col('#3fbf5a')];
      for (let v = 0; v < ca.count; v++) {
        const ang = Math.atan2(pa.getZ(v), pa.getX(v));
        const sc = segC[Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 6) % 6];
        ca.setXYZ(v, sc.r, sc.g, sc.b);
      }
      const ry = rnd() * 6;
      const P = g.attributes.position;
      const N = g.attributes.normal;
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, gy + r, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, ry, 0.3)), new THREE.Vector3(r, r, r));
      const nm = new THREE.Matrix3().getNormalMatrix(m4);
      const tv = new THREE.Vector3();
      for (let v = 0; v < P.count; v++) {
        tv.fromBufferAttribute(P, v).applyMatrix4(m4);
        plantB.pos.push(tv.x, tv.y, tv.z);
        tv.fromBufferAttribute(N, v).applyMatrix3(nm).normalize();
        plantB.nor.push(tv.x, tv.y, tv.z);
        plantB.col.push(ca.getX(v), ca.getY(v), ca.getZ(v));
        plantB.pbr.push(0.25, 0.05);
        plantB.mat.push(0);
      }
      g.dispose();
      made++;
    }
    ballG.dispose();

    // ---- Riesen-Gartendinge (Maßstab: Kart ≈ 2 m) ----
    // Bauteil-Gruppe lokal bauen und gedreht/verschoben in plantB übernehmen
    const M4 = new THREE.Matrix4();
    const NM = new THREE.Matrix3();
    const TV = new THREE.Vector3();
    const place = (local, x, y, z, ry, s = 1) => {
      const g = local.build();
      M4.compose(TV.set(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
      NM.getNormalMatrix(M4);
      const P = g.attributes.position;
      const N = g.attributes.normal;
      const C = g.attributes.color;
      const R = g.attributes.pbr;
      const A = g.attributes.aMat;
      for (let v = 0; v < P.count; v++) {
        TV.fromBufferAttribute(P, v).applyMatrix4(M4);
        plantB.pos.push(TV.x, TV.y, TV.z);
        TV.fromBufferAttribute(N, v).applyMatrix3(NM).normalize();
        plantB.nor.push(TV.x, TV.y, TV.z);
        plantB.col.push(C.getX(v), C.getY(v), C.getZ(v));
        plantB.pbr.push(R.getX(v), R.getY(v));
        plantB.mat.push(A ? A.getX(v) : 0);
      }
      g.dispose();
    };
    const spot = (minD, maxD, r, tries = 400) => {
      for (let i = 0; i < tries; i++) {
        const [x, z] = randomAround(track, rnd, maxD + 20);
        const dd = grid.dist(x, z);
        if (dd < minD || dd > maxD || blocked(x, z, r) || inPond(x, z, r)) continue;
        return [x, z];
      }
      return null;
    };
    const gloss = (b) => {
      b.pbrMap = { '#2fae5a': [0.22, 0], '#1f8a45': [0.25, 0], '#e8443a': [0.22, 0], '#ffd23d': [0.25, 0], '#c9cdd6': [0.18, 0.9], '#ffffff': [0.28, 0], '#3f8fe0': [0.22, 0] };
      b.pbrDefault = [0.7, 0];
      return b;
    };
    // Gießkannen
    const torusH = new THREE.TorusGeometry(2.2, 0.32, 8, 22, Math.PI);
    for (let i = 0; i < n(3); i++) {
      const p = spot(14, 60, 7);
      if (!p) break;
      if (!landmarks.length) landmarks.push({ x: p[0], y: gy + 5, z: p[1], r: 26 });
      const c = gloss(new GeoBuilder(false, true));
      const body = i % 2 ? '#2fae5a' : '#3f8fe0';
      c.add(BASIC.cyl24, { y: 3, sx: 3, sy: 6, sz: 3, color: body, smooth: true });
      c.add(BASIC.cyl24, { y: 6.05, sx: 3.12, sy: 0.3, sz: 3.12, color: '#1f8a45', smooth: true });
      c.add(BASIC.cyl24, { y: 0.15, sx: 3.1, sy: 0.3, sz: 3.1, color: '#1f8a45', smooth: true });
      c.add(BASIC.cyl12, { x: 4.9, y: 4.6, sx: 0.42, sy: 7.2, sz: 0.42, rz: -0.95, color: body, smooth: true });
      c.add(BASIC.cyl12, { x: 7.75, y: 6.6, sx: 0.95, sy: 0.55, sz: 0.95, rz: -0.95, color: '#c9cdd6', smooth: true });
      c.add(torusH, { y: 6.1, color: body, smooth: true });
      place(c, p[0], gy, p[1], rnd() * 6, 0.9 + rnd() * 0.3);
    }
    torusH.dispose();
    // Rasensprenger nahe der Bahn: zweiarmiger Kopf dreht sich, Wasserbögen aus Tropfen, nasser Fleck im Rasen
    let wetMat = null;
    for (let i = 0; i < n(2); i++) {
      const p = spot(8, 26, 4);
      if (!p) break;
      const [x, z] = p;
      const c = gloss(new GeoBuilder(false, true));
      c.add(BASIC.cyl24, { y: 0.12, sx: 0.85, sy: 0.24, sz: 0.85, color: '#ffd23d', smooth: true });
      c.add(BASIC.cyl12, { y: 0.55, sx: 0.14, sy: 0.75, sz: 0.14, color: '#2fae5a', smooth: true });
      place(c, x, gy, z, 0);
      // nasser Rasen: dunkler Fleck mit weich auslaufendem Rand
      if (!wetMat) {
        const wc = document.createElement('canvas');
        wc.width = 128;
        wc.height = 128;
        const wg = wc.getContext('2d');
        // Alpha-Maske liest den Grünkanal: Verlauf in Graustufen (hell = nass), außen schwarz
        wg.fillStyle = '#000';
        wg.fillRect(0, 0, 128, 128);
        const gr = wg.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgb(150,150,150)');
        gr.addColorStop(0.45, 'rgb(120,120,120)');
        gr.addColorStop(1, 'rgb(0,0,0)');
        wg.fillStyle = gr;
        wg.fillRect(0, 0, 128, 128);
        const wt = new THREE.CanvasTexture(wc);
        wetMat = new THREE.MeshLambertMaterial({ color: '#2b7232', alphaMap: wt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
        wetMat.addEventListener('dispose', () => wt.dispose());
      }
      const wet = new THREE.Mesh(new THREE.CircleGeometry(5.2, 36).rotateX(-Math.PI / 2), wetMat);
      wet.position.set(x, gy + 0.05, z);
      meshes.push(wet);
      const hg = gloss(new GeoBuilder(false, true));
      hg.add(BASIC.box, { sx: 1.5, sy: 0.12, sz: 0.16, color: '#3f8fe0' });
      hg.add(BASIC.cyl12, { sx: 0.2, sy: 0.22, sz: 0.2, color: '#c9cdd6', smooth: true });
      for (const e of [-0.78, 0.78]) hg.add(BASIC.cyl12, { x: e, y: 0.08, sx: 0.07, sy: 0.18, sz: 0.07, color: '#c9cdd6' });
      const head = new THREE.Mesh(hg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }));
      head.position.set(x, gy + 0.98, z);
      meshes.push(head);
      const ph = rnd() * 6.3;
      let emitT = 0;
      updates.push((t, camera, focus, P) => {
        const a = ph + t * 2.6;
        head.rotation.y = a;
        // Tropfen nur, wenn jemand in der Nähe ist (Teilchen-Budget)
        if (!P || !focus || Math.hypot(focus.x - x, focus.z - z) > 110) return;
        if (t - emitT < 0.012) return;
        emitT = t;
        for (const e of [1, -1]) {
          // Düse am Armende, Strahl schräg nach außen-oben und etwas tangential (Rückstoß dreht den Kopf)
          const ca = Math.cos(a) * e;
          const sa = -Math.sin(a) * e;
          const sp = 4.2 + Math.random() * 1.2;
          P.emit(x + ca * 0.78, gy + 1.1, z + sa * 0.78, ca * sp - sa * 1.6, 3.6 + Math.random() * 1.2, sa * sp + ca * 1.6, 0.8 + Math.random() * 0.25, 0.34, '#cfeeff', 1.2, 9.8, 0.4);
        }
      });
    }
    // Blumentöpfe aus Terrakotta mit Tulpen
    const potG = new THREE.CylinderGeometry(2.4, 1.8, 3.4, 18, 1);
    for (let i = 0; i < n(6); i++) {
      const p = spot(9, 55, 4);
      if (!p) break;
      const c = gloss(new GeoBuilder(false, true));
      c.add(potG, { y: 1.7, color: '#c8643a', smooth: true });
      c.add(BASIC.cyl24, { y: 3.35, sx: 2.6, sy: 0.55, sz: 2.6, color: '#d2703f', smooth: true });
      c.add(BASIC.cyl24, { y: 3.4, sx: 2.25, sy: 0.6, sz: 2.25, color: '#5a3a22' });
      const tc = ['#e8443a', '#ffd23d', '#ff8ac8', '#ffffff'][Math.floor(rnd() * 4)];
      const nt = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < nt; k++) {
        const a = (k / nt) * Math.PI * 2 + rnd();
        const rr = k ? 1.1 : 0;
        const h = 3.5 + rnd() * 2.5;
        c.add(BASIC.cyl12, { x: Math.cos(a) * rr, y: 3.6 + h / 2, z: Math.sin(a) * rr, sx: 0.13, sy: h, sz: 0.13, color: '#3f8a2e', smooth: true });
        c.add(BASIC.sphere, { x: Math.cos(a) * (rr + 0.5), y: 3.9 + h * 0.35, z: Math.sin(a) * (rr + 0.5), ry: -a, rz: 0.5, sx: 0.9, sy: 0.12, sz: 0.35, color: '#4aab3e', smooth: true });
        c.add(BASIC.sphere, { x: Math.cos(a) * rr, y: 3.6 + h + 0.55, z: Math.sin(a) * rr, sx: 0.62, sy: 0.85, sz: 0.62, color: tc, smooth: true });
      }
      place(c, p[0], gy, p[1], rnd() * 6, 0.85 + rnd() * 0.35);
    }
    potG.dispose();
    // Gartenschlauch, der sich durchs Gras schlängelt (mit Messing-Spritze am Ende)
    for (let hz = 0; hz < 2; hz++) {
      const p = spot(16, 40, 3);
      if (!p) break;
      let [x, z] = p;
      let a = rnd() * Math.PI * 2;
      let turn = (rnd() - 0.5) * 0.25;
      for (let k = 0; k < 70; k++) {
        turn = turn * 0.92 + (rnd() - 0.5) * 0.12;
        a += turn;
        const L = 1.6;
        const nx = x + Math.cos(a) * L;
        const nz = z + Math.sin(a) * L;
        if (grid.dist(nx, nz) < 8 || blocked(nx, nz, 1) || inPond(nx, nz, 1)) {
          a += Math.PI * 0.4;
          continue;
        }
        const mx = (x + nx) / 2;
        const mz = (z + nz) / 2;
        plantB.add(BASIC.cyl12, { x: mx, y: gy + 0.38, z: mz, rz: Math.PI / 2, ry: Math.atan2(nz - z, -(nx - x)), sx: 0.38, sy: L + 0.12, sz: 0.38, color: '#2fae5a', smooth: true });
        x = nx;
        z = nz;
      }
      plantB.add(BASIC.cyl12, { x: x + Math.cos(a) * 0.9, y: gy + 0.42, z: z + Math.sin(a) * 0.9, rz: Math.PI / 2, ry: Math.atan2(Math.sin(a), -Math.cos(a)), sx: 0.5, sy: 1.8, sz: 0.5, color: '#d9a640', smooth: true });
    }
    // Picknickdecke (rot-weiß kariert) mit Riesentasse und Teller
    {
      const p = spot(12, 45, 9);
      if (p) {
        const c = gloss(new GeoBuilder(false, true));
        const N = 8;
        const S = 1.6;
        for (let u = 0; u < N; u++) {
          for (let v = 0; v < N; v++) {
            const x0 = (u - N / 2) * S;
            const z0 = (v - N / 2) * S;
            const colr = (u + v) % 2 ? '#e8443a' : '#f4f0ea';
            c.quad([x0, 0.06, z0], [x0, 0.06, z0 + S], [x0 + S, 0.06, z0 + S], [x0 + S, 0.06, z0], colr);
          }
        }
        c.add(BASIC.cyl24, { x: -2.2, y: 0.25, z: 1.8, sx: 2.6, sy: 0.3, sz: 2.6, color: '#ffffff', smooth: true });
        c.add(BASIC.cyl24, { x: 2.4, y: 1.7, z: -1.6, sx: 1.5, sy: 3.2, sz: 1.5, color: '#3f8fe0', smooth: true });
        c.add(BASIC.cyl24, { x: 2.4, y: 3.2, z: -1.6, sx: 1.32, sy: 0.25, sz: 1.32, color: '#6a3a1a' });
        const th3 = new THREE.TorusGeometry(0.9, 0.22, 8, 16);
        c.add(th3, { x: 3.95, y: 1.8, z: -1.6, color: '#3f8fe0', smooth: true });
        th3.dispose();
        place(c, p[0], gy, p[1], rnd() * 6, 1);
      }
    }
    // Schmetterlinge: flattern um Blumen (Flügelschlag im Shader, Bahnen auf der CPU)
    {
      const bf = new GeoBuilder();
      bf.tri([0, 0, -0.5], [1.4, 0, -1.1], [1.2, 0, 0.7], '#ffffff');
      bf.tri([0, 0, 0.1], [1.0, 0, 0.6], [0.5, 0, 1.2], '#ffffff');
      bf.tri([0, 0, -0.5], [-1.2, 0, 0.7], [-1.4, 0, -1.1], '#ffffff');
      bf.tri([0, 0, 0.1], [-0.5, 0, 1.2], [-1.0, 0, 0.6], '#ffffff');
      bf.box(0, 0, 0, 0.18, 0.18, 1.5, '#2a2030');
      const bg2 = bf.build();
      const uT = { value: 0 };
      const bm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      bm.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uT;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float fl = sin(uTime * 16.0 + float(gl_InstanceID) * 1.9) * 0.95;
          float ax = abs(position.x);
          transformed.x = sign(position.x) * ax * cos(fl);
          transformed.y = ax * sin(fl);`
        );
      };
      bm.customProgramCacheKey = () => 'echo-racer-butterfly';
      const bcount = n(16);
      const flies = new THREE.InstancedMesh(bg2, bm, bcount);
      flies.frustumCulled = false;
      const bfd = [];
      const wings = ['#ffd23d', '#ff8ac8', '#3fa8ff', '#ff7a1f', '#ffffff', '#a585ff'];
      for (let i = 0; i < bcount; i++) {
        const p = spot(5, 60, 1) || [cx, cz];
        bfd.push({ x: p[0], z: p[1], r: 3 + rnd() * 5, y: 4 + rnd() * 6, w: (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), ph: rnd() * 10 });
        flies.setColorAt(i, col(wings[i % wings.length]));
      }
      const BM = new THREE.Matrix4();
      const BQ = new THREE.Quaternion();
      const BP = new THREE.Vector3();
      const BS = new THREE.Vector3(1, 1, 1);
      const YA = new THREE.Vector3(0, 1, 0);
      updates.push((t) => {
        uT.value = t;
        for (let i = 0; i < bcount; i++) {
          const b = bfd[i];
          const a = b.ph + t * b.w;
          BP.set(b.x + Math.cos(a) * b.r, gy + b.y + Math.sin(t * 1.7 + b.ph) * 1.2, b.z + Math.sin(a) * b.r);
          // Flugrichtung = Tangente der Kreisbahn
          BQ.setFromAxisAngle(YA, -a + (b.w > 0 ? 0 : Math.PI));
          BM.compose(BP, BQ, BS);
          flies.setMatrixAt(i, BM);
        }
        flies.instanceMatrix.needsUpdate = true;
      });
      meshes.push(flies);
    }

    // Weißer Lattenzaun als Gartengrenze, dahinter Hecken
    const fr = radius + 220;
    const posts = Math.round((fr * Math.PI * 2) / 3);
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2;
      const x = cx + Math.cos(a) * fr;
      const z = cz + Math.sin(a) * fr;
      solid.box(x, gy + 2.6, z, 0.5, 5.2, 0.3, '#f4f4f8', 1, -a);
    }
    for (const yy of [1.6, 3.8]) {
      const segs = 96;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const am = (a0 + a1) / 2;
        const len = 2 * fr * Math.sin(Math.PI / segs) + 0.1;
        solid.box(cx + Math.cos(am) * (fr + 0.2), gy + yy, cz + Math.sin(am) * (fr + 0.2), 0.12, 0.35, len, '#f4f4f8', 1, -am);
      }
    }
    // Hecken: Block mit buschigem, unregelmäßigem Oberrand (eigenes, gröberes Laubmuster für die Entfernung)
    const hedgeB = new GeoBuilder();
    ring(n(40), fr + 40, fr + 160, (x, z) => {
      const h = 14 + rnd() * 22;
      const L = 30 + rnd() * 40;
      const W = 12 + rnd() * 10;
      const ry = rnd() * 6;
      hedgeB.add(BASIC.box, { x, y: gy + h / 2, z, ry, sx: L, sy: h, sz: W, color: '#2f7f34' });
      const lumps = 3 + Math.floor(L / 14);
      for (let k = 0; k < lumps; k++) {
        const t = (k + 0.5) / lumps - 0.5;
        const lx = x + Math.cos(ry) * t * L * 0.9;
        const lz = z - Math.sin(ry) * t * L * 0.9;
        const s = 7 + rnd() * 6;
        hedgeB.add(BASIC.ico1, { x: lx, y: gy + h + rnd() * 2, z: lz, ry: ry + (rnd() - 0.5) * 0.6, sx: s * 1.3, sy: s * 0.75, sz: W * 0.62, color: k % 2 ? '#3f9a3a' : '#358a36', smooth: true });
      }
    });
    meshes.push(new THREE.Mesh(hedgeB.build(), D(new THREE.MeshLambertMaterial({ vertexColors: true }), 'leaf', { size: 4.2, albedo: 0.3, bump: 0.5, coarse: 0.3 })));
    // Vögel über dem Garten
    for (let f = 0; f < 2; f++) {
      const fl = birdFlock({ count: n(7), color: f ? '#3f6fd8' : '#4a3a30', x: cx + (rnd() - 0.5) * radius, z: cz + (rnd() - 0.5) * radius, y: gy + 26 + rnd() * 14, radius: 45 + rnd() * 30, size: 0.9, speed: 0.22, flap: 14, rnd });
      meshes.push(fl.mesh);
      updates.push(fl.update);
    }
    // Schäfchenwolken
    const clouds = new GeoBuilder();
    for (let i = 0; i < n(26); i++) {
      const [x, z] = randomAround(track, rnd, 700);
      const y = 70 + rnd() * 70;
      const s = 10 + rnd() * 14;
      for (let k = 0; k < 5; k++) {
        clouds.add(BASIC.ico1, { x: x + (rnd() - 0.5) * s * 2.2, y: y + (rnd() - 0.5) * s * 0.4, z: z + (rnd() - 0.5) * s * 1.2, sx: s * (0.7 + rnd() * 0.5), sy: s * (0.45 + rnd() * 0.25), sz: s * (0.7 + rnd() * 0.5), color: '#ffffff', smooth: true });
      }
    }
    meshes.push(new THREE.Mesh(clouds.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: col('#dfe9ff', 0.35) })));
    const pm = new THREE.Mesh(plantB.build(), D(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, envMapIntensity: 0.6 }), 'leaf', { size: 1.5, albedo: 0.26, bump: 0.42, coarse: 0.3 }));
    pm.castShadow = true;
    pm.receiveShadow = true;
    meshes.push(pm);
  } else {
    // Lava: glänzende schwarze Felsen, pulsierende Lavaseen, Fontänen, Vulkan
    const rockB = new GeoBuilder();
    let placed = 0;
    const want = n(150);
    for (let tries = 0; tries < 3000 && placed < want; tries++) {
      const [x, z] = randomAround(track, rnd, 280);
      const r = 3 + rnd() * 9;
      const h = 6 + Math.pow(rnd(), 1.4) * 40;
      if (grid.dist(x, z) < 6 + r || blocked(x, z, r)) continue;
      rockB.add(rnd() < 0.6 ? BASIC.cone5 : BASIC.tet, { x, y: gy + h / 2 - 0.5, z, sx: r, sy: h, sz: r * (0.7 + rnd() * 0.6), ry: rnd() * 6, color: ['#1a1214', '#24161a', '#140e10'][Math.floor(rnd() * 3)] });
      placed++;
    }
    const va = rnd() * Math.PI * 2;
    const vx = cx + Math.cos(va) * (radius + 650);
    const vz = cz + Math.sin(va) * (radius + 650);
    rockB.add(BASIC.cone7, { x: vx, y: gy + 170, z: vz, sx: 420, sy: 340, sz: 420, color: '#1c120f' });
    landmarks.push({ kind: 'view', x: vx, y: gy + 300, z: vz });
    ring(n(30), radius + 380, radius + 800, (x, z) => {
      const h = 50 + rnd() * 160;
      rockB.add(BASIC.cone5, { x, y: gy + h / 2, z, sx: 40 + rnd() * 60, sy: h, sz: 40 + rnd() * 60, ry: rnd() * 6, color: '#160e0c' });
    });
    // Glühende Kristallgruppen zwischen den Felsen
    for (let i = 0, made = 0; i < 400 && made < n(46); i++) {
      const [x, z] = randomAround(track, rnd, 200);
      const dd = grid.dist(x, z);
      if (dd < 7 || dd > 160 || blocked(x, z, 4)) continue;
      const hot = rnd() < 0.7 ? '#ff6a1a' : '#ff2a8a';
      const cnt = 3 + Math.floor(rnd() * 4);
      rockB.add(BASIC.ico, { x, y: gy + 0.3, z, sx: 2.2, sy: 0.9, sz: 2.2, ry: rnd() * 6, color: '#140e10' });
      for (let k = 0; k < cnt; k++) {
        const h = 1.6 + rnd() * 4.5;
        const ox = (rnd() - 0.5) * 2.6;
        const oz = (rnd() - 0.5) * 2.6;
        glow.add(BASIC.octa, { x: x + ox, y: gy + h * 0.45, z: z + oz, rx: (rnd() - 0.5) * 0.7, rz: (rnd() - 0.5) * 0.7, ry: rnd() * 6, sx: 0.35 + rnd() * 0.3, sy: h * 0.55, sz: 0.35 + rnd() * 0.3, color: hot, k: 1.5 + rnd() * 0.8 });
      }
      made++;
    }
    meshes.push(new THREE.Mesh(rockB.build(), D(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.15, envMapIntensity: 1.1, flatShading: true }), 'stone', { size: 2.2, albedo: 0.22, bump: 0.4 })));
    const lavaB = new GeoBuilder();
    const pools = [];
    for (let i = 0; i < n(30); i++) {
      const [x, z] = randomAround(track, rnd, 220);
      const r = 8 + rnd() * 26;
      if (grid.dist(x, z) < r + 4 || blocked(x, z, r)) continue;
      lavaB.add(BASIC.cyl8, { x, y: gy + 0.04, z, sx: r, sy: 0.1, sz: r * (0.6 + rnd() * 0.5), ry: rnd() * 6, color: '#ffffff' });
      pools.push({ x, z, r });
    }
    lavaB.add(BASIC.cyl8, { x: vx, y: gy + 296, z: vz, sx: 95, sy: 10, sz: 95, color: '#ffffff' });
    // Lavaströme vom Kraterrand die Vulkanflanken hinab (schlängeln sich, werden nach unten schmaler und dunkler)
    const streams = 5 + Math.floor(rnd() * 3);
    for (let s = 0; s < streams; s++) {
      let a = (s / streams) * Math.PI * 2 + rnd() * 0.6;
      const seed = rnd() * 10;
      const yTop = 292;
      const yEnd = 30 + rnd() * 70;
      let prev = null;
      for (let y = yTop; y >= yEnd; y -= 9) {
        a += Math.sin(y * 0.031 + seed) * 0.012;
        const r = 420 * (1 - y / 340) + 1.2;
        const w = 4 + 10 * ((y - yEnd) / (yTop - yEnd));
        const px = vx + Math.cos(a) * r;
        const pz = vz + Math.sin(a) * r;
        const tx = -Math.sin(a) * w;
        const tz = Math.cos(a) * w;
        const cur = [[px - tx, gy + y, pz - tz], [px + tx, gy + y, pz + tz]];
        const k = 0.45 + 0.55 * ((y - yEnd) / (yTop - yEnd));
        if (prev) lavaB.quad(prev[0], prev[1], cur[1], cur[0], '#ffffff', k);
        prev = cur;
      }
    }
    const lavaMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: col('#ff5a10', 2.2) });
    meshes.push(new THREE.Mesh(lavaB.build(), lavaMat));
    // Rauchsäule über dem Vulkan: Wolkenballen steigen auf, wachsen und vergehen (Endlosschleife)
    const plumeN = n(16);
    const plume = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: col('#3a2a28'), emissive: col('#ff5a1a'), emissiveIntensity: 0.18, flatShading: true }),
      plumeN
    );
    plume.frustumCulled = false;
    meshes.push(plume);
    const pM = new THREE.Matrix4();
    const pQ = new THREE.Quaternion();
    const pE = new THREE.Euler();
    const pS = new THREE.Vector3();
    const pP = new THREE.Vector3();
    const plumeSeed = Array.from({ length: plumeN }, () => [rnd(), rnd(), rnd()]);
    updates.push((t) => {
      for (let i = 0; i < plumeN; i++) {
        const [a, b, c] = plumeSeed[i];
        const ph = (t * 0.035 + i / plumeN) % 1;
        const sc = (40 + ph * 150) * Math.sin(Math.min(1, ph * 1.4 + 0.08) * Math.PI) * (0.8 + c * 0.4);
        pP.set(vx + (a - 0.5) * 60 + ph * 220, gy + 320 + ph * 520, vz + (b - 0.5) * 60 + ph * 90);
        pE.set(a * 6 + t * 0.05, b * 6, 0);
        pQ.setFromEuler(pE);
        pS.set(sc, sc * 0.75, sc);
        pM.compose(pP, pQ, pS);
        plume.setMatrixAt(i, pM);
      }
      plume.instanceMatrix.needsUpdate = true;
      // Glut im Rauch flackert mit dem Krater
      plume.material.emissiveIntensity = 0.14 + Math.sin(t * 2.1) * 0.05;
    });
    // Vulkanblitze in der Aschewolke: grelle Zickzack-Fäden, die Wolke leuchtet kurz auf, Donner mit Schall-Laufzeit
    {
      const NB = 14;
      const bpos = new Float32Array(NB * 2 * 2 * 3);
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
      const bolt = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: new THREE.Color('#fff0d8').multiplyScalar(3) }));
      bolt.frustumCulled = false;
      bolt.visible = false;
      meshes.push(bolt);
      let next = 4 + rnd() * 4;
      let until = -1;
      const BP = new THREE.Vector3();
      updates.push((t, camera) => {
        if (t > next || t < next - 30) {
          // Blitz von oben nach unten durch die Wolke, zwei leicht versetzte Fäden (wirkt kräftiger)
          const ph = 0.15 + Math.random() * 0.35;
          let x = vx + ph * 220 + (Math.random() - 0.5) * 80;
          let y = gy + 320 + ph * 520 + 60 + Math.random() * 60;
          let z = vz + ph * 90 + (Math.random() - 0.5) * 60;
          const len = 90 + Math.random() * 90;
          for (let k = 0; k < NB; k++) {
            const nx = x + (Math.random() - 0.5) * 24;
            const ny = y - len / NB;
            const nz = z + (Math.random() - 0.5) * 24;
            for (const [o, j] of [[0, 0], [1.2, 1]]) {
              const i = (j * NB + k) * 6;
              bpos[i] = x + o;
              bpos[i + 1] = y;
              bpos[i + 2] = z;
              bpos[i + 3] = nx + o;
              bpos[i + 4] = ny;
              bpos[i + 5] = nz;
            }
            x = nx;
            y = ny;
            z = nz;
          }
          bg.setDrawRange(0, NB * 2 * 2);
          bg.attributes.position.needsUpdate = true;
          until = t + 0.35;
          next = t + 5 + Math.random() * 8;
          if (camera) {
            const d = camera.position.distanceTo(BP.set(x, y, z));
            sfx('thunder', Math.min(1, 520 / d), d / 343);
          }
        }
        const on = t < until && Math.sin(t * 70) > -0.4;
        bolt.visible = on;
        if (on) plume.material.emissiveIntensity += 0.35;
      });
    }
    let fountainT = 0;
    updates.push((t, camera, focus, P) => {
      lavaMat.color.set('#ff5a10').multiplyScalar(2.0 + Math.sin(t * 2.1) * 0.45);
      if (!P || !focus) return;
      fountainT -= 1 / 60;
      if (fountainT > 0) return;
      fountainT = 0.45 + Math.random() * 0.6;
      const near = pools.filter((p) => Math.hypot(p.x - focus.x, p.z - focus.z) < 220);
      if (!near.length) return;
      const p = near[Math.floor(Math.random() * near.length)];
      P.burst(p.x + (Math.random() - 0.5) * p.r, gy + 0.3, p.z + (Math.random() - 0.5) * p.r, 34, 16, 1.6, 0.9, '#ff7a1a', 3, 14);
    });
  }

  // Feinstruktur der Kulisse: Gestein in Canyon, Wolkeninseln und Lava; Kunststoff-Korn bei Spielzeug-Kulissen
  const SOLID_DET = {
    canyon: ['stone', { size: 3.2, albedo: 0.22, bump: 0.42, coarse: 0.25 }],
    sky: ['stone', { size: 2.4, albedo: 0.2, bump: 0.36 }],
    lava: ['stone', { size: 2.4, albedo: 0.22, bump: 0.4 }],
    neon: ['grain', { size: 1.2, albedo: 0.08, bump: 0.06 }],
    garden: ['grain', { size: 0.8, albedo: 0.08, bump: 0.08 }],
    park: ['grain', { size: 0.9, albedo: 0.08, bump: 0.07 }],
  };
  const sd = SOLID_DET[themeId] || SOLID_DET.neon;
  if (solid.count) meshes.push(new THREE.Mesh(solid.build(), D(themeId === 'canyon' ? strataMaterial() : new THREE.MeshLambertMaterial({ vertexColors: true }), sd[0], sd[1])));
  if (plants.count) meshes.push(new THREE.Mesh(plants.build(), D(new THREE.MeshLambertMaterial({ vertexColors: true }), 'leaf', { size: 1.1, albedo: 0.2, bump: 0.3 })));
  if (blinkB.count) {
    const g = blinkB.build();
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(blinkSeeds, 1));
    const bm = blinkMaterial();
    meshes.push(new THREE.Mesh(g, bm));
    updates.push((t) => (bm.uniforms.uTime.value = t));
  }
  return {
    meshes,
    landmarks,
    update: updates.length ? (t, camera, focus, P) => updates.forEach((u) => u(t, camera, focus, P)) : null,
  };
}
