// Streckenrand im Spielzeug-Look: Pfeiltafeln an engen Kurven, Tribüne mit hüpfenden Steckfiguren,
// wehende Fahnen und Flutlichtmasten am Start/Ziel.

import * as THREE from 'three';
import { GeoBuilder, BASIC } from './geo.js';
import { chevronTexture, bannerTexture, sponsorAtlas, SPONSOR_IDS } from './textures.js';

const FRAME = '#2a2633';

// Rot-weiße Pfeiltafeln auf der Außenleiste enger Kurven – die Pfeile zeigen in Fahrtrichtung.
// Rückgabe: Mesh (oder null) + belegte Stellen, damit dort keine Laternen o.ä. entstehen.
export function buildChevrons(track, skip, parts, { RH, RW }) {
  const b = new GeoBuilder(true);
  const spots = [];
  const Q = {};
  const L = 1.2; // halbe Tafellänge
  const y0 = RH + 0.32;
  const y1 = RH + 1.32;
  const nearGate = (s) => track.pads.some((pd) => Math.abs(track.deltaS(pd.s - pd.len / 2, s)) < 3);
  for (const cv of track.curves) {
    if (cv.peak < 1 / 48) continue;
    const side = cv.sign; // Linkskurve (+) → Außenseite rechts (d > 0)
    const end = cv.s0 + Math.min(cv.len * 0.8, 46);
    for (let s = cv.s0 + 2; s < end; s += 6.5) {
      const k = track.indexAt(s);
      if (skip(k) || nearGate(s)) continue;
      const p = track.posAt(s, side * (track.hw[k] + RW * 0.6), Q);
      const ax = p.tx * L;
      const az = p.tz * L;
      const A0 = [p.x - ax, p.y + y0, p.z - az];
      const B0 = [p.x + ax, p.y + y0, p.z + az];
      const A1 = [p.x - ax, p.y + y1, p.z - az];
      const B1 = [p.x + ax, p.y + y1, p.z + az];
      // Vorderseite zur Bahn; u wächst in Fahrtrichtung → Pfeile zeigen dorthin, wo die Kurve hinführt
      if (side < 0) b.quad(A0, B0, B1, A1, '#ffffff', 1, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      else b.quad(B0, A0, A1, B1, '#ffffff', 1, [[1, 0], [0, 0], [0, 1], [1, 1]]);
      const bx = p.x + p.nx * side * 0.06;
      const bz = p.z + p.nz * side * 0.06;
      parts.add(BASIC.box, { x: bx, y: p.y + (y0 + y1) / 2, z: bz, ry: p.h, sx: 0.07, sy: 1.06, sz: L * 2 + 0.06, color: FRAME });
      for (const e of [-1, 1]) {
        parts.add(BASIC.box, { x: bx + p.tx * e * (L - 0.25), y: p.y + RH + 0.16, z: bz + p.tz * e * (L - 0.25), ry: p.h, sx: 0.09, sy: 0.32, sz: 0.09, color: FRAME });
      }
      spots.push({ x: p.x, z: p.z, r: 1.6 });
    }
  }
  if (!b.count) return { mesh: null, spots };
  const mesh = new THREE.Mesh(b.build(), new THREE.MeshBasicMaterial({ map: chevronTexture(), vertexColors: true }));
  return { mesh, spots };
}

// Shader-Zusatz: Figuren hüpfen (je Instanz eigene Phase), Fahnen wehen
function crowdMaterial(uTime, uCheer) {
  const m = new THREE.MeshLambertMaterial();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uCheer = uCheer;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uCheer;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float fid = float(gl_InstanceID);
      float ph = fract(sin(fid * 12.9898) * 43758.5453);
      float hop = max(0.0, sin(uTime * (6.0 + ph * 4.0 + uCheer * 4.0) + ph * 60.0));
      transformed.y += hop * hop * (0.34 + uCheer * 0.45) * step(0.3 - uCheer * 0.3, ph);`
    );
  };
  m.customProgramCacheKey = () => 'echo-racer-crowd';
  return m;
}

function flagMaterial(uTime) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vFlagUv;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vFlagUv = uv;
      float fid = float(gl_InstanceID);
      float w = position.x / 1.5;
      transformed.z += sin(uTime * 7.0 - position.x * 2.6 + fid * 1.7) * 0.18 * w;
      transformed.y += sin(uTime * 5.0 - position.x * 2.0 + fid) * 0.05 * w;`
    );
    // Muster: weiße Fahnen werden Zielflaggen (schwarz-weiß kariert), farbige bekommen einen weißen Mittelstreifen
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vFlagUv;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 fu = vFlagUv;
      if (min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)) > 0.9) {
        float ck = mod(floor(fu.x * 8.0) + floor(fu.y * 5.0), 2.0);
        diffuseColor.rgb = mix(vec3(0.05), vec3(0.95), ck);
      } else {
        float band = step(abs(fu.y - 0.5), 0.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96), band);
      }`
    );
  };
  m.customProgramCacheKey = () => 'echo-racer-flag';
  return m;
}

const BODY_COLS = ['#ff3b5c', '#ffd23d', '#2ce7ff', '#7dff5a', '#ff7a1f', '#a585ff', '#ffffff', '#ff5fd0', '#3d7bff'];
const SKIN = ['#ffd9b8', '#f1c27d', '#c68642', '#8d5524', '#ffe0c4', '#e0ac69'];
const FLAG_COLS = ['#ff3b5c', '#ffd23d', '#2ce7ff', '#ffffff', '#ff7a1f', '#a585ff'];

// Tribüne an der Start-/Zielgeraden. Rückgabe null, wenn neben der Geraden kein Platz ist.
export function buildGrandstand(track, th, gy, det, grid, themeId, parts, { RH, RW }, rnd) {
  const toy = th.toy;
  const sC = -10; // Tribünenmitte kurz vor der Ziellinie (Startaufstellung im Blick)
  const p = track.posAt(sC, 0, {});
  const hw = track.hw[track.indexAt(sC)];
  const D0 = hw + RW + 2.6; // Bahnmitte → Tribünenfront
  const TIERS = 5;
  const TD = 1.5;
  const TH = 0.85;
  const DEPTH = TIERS * TD;
  const toWorld = (rot, x, z) => {
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    return [p.x + x * cs + z * sn, p.z - x * sn + z * cs];
  };
  const fits = (rot, half) => {
    for (let z = -half - 2; z <= half + 2; z += 3) {
      for (const x of [D0 - 1, D0 + DEPTH * 0.5, D0 + DEPTH + 1.5]) {
        const [wx, wz] = toWorld(rot, x, z);
        if (grid.dist(wx, wz) < x - hw - 0.8) return false;
      }
    }
    return true;
  };
  let rot = null;
  let half = 0;
  for (const h of [20, 14]) {
    for (const side of [1, -1]) {
      const r = p.h + (side > 0 ? Math.PI : 0); // lokales +x zeigt von der Bahn weg
      if (fits(r, h)) {
        rot = r;
        half = h;
        break;
      }
    }
    if (rot !== null) break;
  }
  if (rot === null) return null;
  const L = half * 2;

  const group = new THREE.Group();
  group.position.set(p.x, 0, p.z);
  group.rotation.y = rot;
  const disposables = [];
  const base = gy > -40 ? gy : -5;
  const b = new GeoBuilder();
  const glow = new GeoBuilder();
  const shell = '#ece8f4';
  const seatCols = [toy.track, toy.railGlow || toy.railTop || '#ffd23d', toy.track, '#ffffff', toy.track];
  const y0 = -0.45; // erste Reihe knapp unter Bahnhöhe
  const tops = [];
  for (let i = 0; i < TIERS; i++) {
    const x0 = D0 + i * TD;
    const top = y0 + i * TH;
    tops.push(top);
    b.box(x0 + TD / 2, (base + top) / 2, 0, TD, top - base, L, shell);
    b.box(x0 + TD * 0.78, top + 0.22, 0, 0.5, 0.44, L - 0.5, seatCols[i]);
    for (const sz of [-1, 1]) b.box(x0 + TD / 2, (base + top + 1.1) / 2, sz * (half + 0.2), TD, top + 1.1 - base, 0.4, toy.rail);
  }
  const xBack = D0 + DEPTH;
  const roofY = 6.3;
  b.box(xBack + 0.2, (base + roofY + 0.5) / 2, 0, 0.4, roofY + 0.5 - base, L + 0.8, toy.rail);
  // schräges Dach über alle Reihen
  const xF = D0 - 0.8;
  const xB = xBack + 0.4;
  const zr = half + 0.6;
  b.hexa(
    [
      [xF, roofY, -zr],
      [xB, roofY + 0.5, -zr],
      [xB, roofY + 0.5, zr],
      [xF, roofY, zr],
      [xF, roofY + 0.28, -zr],
      [xB, roofY + 0.78, -zr],
      [xB, roofY + 0.78, zr],
      [xF, roofY + 0.28, zr],
    ],
    toy.rail
  );
  b.box(xF + 0.05, roofY - 0.2, 0, 0.12, 0.4, L + 1.2, toy.track);
  for (let i = 0; i <= 4; i++) {
    const z = -half + (i / 4) * L;
    b.add(BASIC.cyl12, { x: D0 - 0.5, y: (base + roofY) / 2, z, sx: 0.16, sy: roofY - base, sz: 0.16, color: '#d8d4e4', smooth: true });
  }
  // Flutlichtmasten an beiden Enden
  for (const sz of [-1, 1]) {
    const z = sz * (half + 2.2);
    const top = 13;
    b.box(xBack, (base + top) / 2, z, 0.5, top - base, 0.5, FRAME);
    b.box(xBack - 0.6, top + 0.9, z, 0.4, 2.2, 3.4, FRAME);
    glow.box(xBack - 0.82, top + 0.9, z, 0.06, 1.8, 3.0, '#fff6e0', 3.2);
  }
  if (gy <= -40) {
    // Himmelswelt: Tribüne steht auf einer schwebenden Plattform mit Wolke darunter
    b.box(D0 + DEPTH / 2, base - 0.7, 0, DEPTH + 3.5, 1.4, L + 5, '#8a5aa8');
    b.box(D0 + DEPTH / 2, base + 0.06, 0, DEPTH + 3.3, 0.14, L + 4.8, '#5be08a');
    for (let i = 0; i < 7; i++) {
      b.add(BASIC.ico1, { x: D0 + DEPTH / 2 + (rnd() - 0.5) * DEPTH, y: base - 3 - rnd() * 2, z: (rnd() - 0.5) * L, sx: 5 + rnd() * 4, sy: 2.5 + rnd() * 1.5, sz: 5 + rnd() * 4, color: '#ffffff' });
    }
  }
  // Fahnen auf dem Dach (Stangen gehören zum Tribünen-Mesh, Tücher sind Instanzen in Weltkoordinaten)
  group.updateMatrixWorld(true);
  const flagM = [];
  const yAxis = new THREE.Vector3(0, 1, 0);
  const M = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  for (let z = -half + 2; z <= half - 2; z += 6) {
    const px = xB - 0.3;
    const py = roofY + 0.78;
    b.add(BASIC.cyl8, { x: px, y: py + 1.3, z, sx: 0.05, sy: 2.6, sz: 0.05, color: '#d8d4e4' });
    M.compose(v.set(px, py + 2.1, z), q.setFromAxisAngle(yAxis, -Math.PI / 2), sc.setScalar(1));
    flagM.push(group.matrixWorld.clone().multiply(M));
  }
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const standMesh = new THREE.Mesh(b.build(), bodyMat);
  standMesh.castShadow = true;
  standMesh.receiveShadow = true;
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const glowMesh = new THREE.Mesh(glow.build(), glowMat);
  group.add(standMesh, glowMesh);
  disposables.push(standMesh.geometry, bodyMat, glowMesh.geometry, glowMat);

  // Spruchband unter der Dachkante
  const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTexture('★  ECHO RACER  ★  GRAND PRIX  ', '#ffffff', toy.track), color: new THREE.Color(1.05, 1.05, 1.05) });
  const bannerGeo = new THREE.PlaneGeometry(L - 1, 1.1);
  // Schrift nicht strecken: Textur entlang des Bands kacheln (Seitenverhältnis Textur 16:1)
  const uv = bannerGeo.attributes.uv;
  const reps = Math.max(1, Math.round((L - 1) / 1.1 / 16));
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * reps);
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(xF - 0.04, roofY - 0.75, 0);
  banner.rotation.y = -Math.PI / 2;
  group.add(banner);
  disposables.push(banner.geometry, bannerMat);

  // Zuschauer: Steckfiguren (Körper + Kopf als getrennte Instanzen mit gleicher Reihenfolge)
  const uTime = { value: 0 };
  const uCheer = { value: 0 };
  const density = Math.min(1, 0.25 + det);
  const spots = [];
  for (let i = 0; i < TIERS; i++) {
    for (let z = -half + 0.8; z < half - 0.6; z += 0.95) {
      if (rnd() > density * 0.9) continue;
      spots.push([D0 + i * TD + TD * 0.36 + (rnd() - 0.5) * 0.2, tops[i], z + (rnd() - 0.5) * 0.3, 0.88 + rnd() * 0.24]);
    }
  }
  const bodyGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.82, 10).translate(0, 0.41, 0);
  const headGeo = new THREE.SphereGeometry(0.22, 12, 8).translate(0, 1.05, 0);
  const crowdMat = crowdMaterial(uTime, uCheer);
  const bodies = new THREE.InstancedMesh(bodyGeo, crowdMat, spots.length);
  const heads = new THREE.InstancedMesh(headGeo, crowdMat, spots.length);
  const c = new THREE.Color();
  q.identity();
  spots.forEach(([x, y, z, s], i) => {
    M.compose(v.set(x, y, z), q, sc.setScalar(s));
    bodies.setMatrixAt(i, M);
    heads.setMatrixAt(i, M);
    bodies.setColorAt(i, c.set(BODY_COLS[Math.floor(rnd() * BODY_COLS.length)]));
    heads.setColorAt(i, c.set(SKIN[Math.floor(rnd() * SKIN.length)]));
  });
  group.add(bodies, heads);
  disposables.push(bodyGeo, headGeo, crowdMat);

  // Fahnen an beiden Leisten der Start-/Zielgeraden
  const Q = {};
  for (let s = -42; s <= 22; s += 8) {
    const k = track.indexAt(s);
    if (Math.abs(s) < 3) continue; // nicht am Startportal
    if (track.pads.some((pd) => Math.abs(track.deltaS(pd.s - pd.len / 2, s)) < 2)) continue;
    for (const side of [-1, 1]) {
      const r = track.posAt(s, side * (track.hw[k] + RW * 0.6), Q);
      parts.add(BASIC.cyl8, { x: r.x, y: RH + 1.8, z: r.z, sx: 0.05, sy: 3.6, sz: 0.05, color: '#d8d4e4' });
      // Fahne weht nach hinten (gegen die Fahrtrichtung)
      M.compose(v.set(r.x, RH + 3.05, r.z), q.setFromAxisAngle(yAxis, r.h + Math.PI / 2), sc.setScalar(1));
      flagM.push(M.clone());
    }
  }
  const flagGeo = new THREE.PlaneGeometry(1.5, 0.95, 8, 1).translate(0.75, 0, 0);
  const flagMat = flagMaterial(uTime);
  const flags = new THREE.InstancedMesh(flagGeo, flagMat, flagM.length);
  flagM.forEach((m, i) => {
    flags.setMatrixAt(i, m);
    flags.setColorAt(i, c.set(FLAG_COLS[i % FLAG_COLS.length]));
  });
  flags.frustumCulled = false;
  disposables.push(flagGeo, flagMat);

  // Bereiche, in denen die Kulisse nichts platzieren darf
  const blockers = [];
  for (let z = -half - 3; z <= half + 3; z += 5) {
    const [wx, wz] = toWorld(rot, D0 + DEPTH / 2, z);
    blockers.push({ x: wx, z: wz, r: DEPTH / 2 + 4 });
  }
  return {
    objects: [group, flags],
    blockers,
    update: (t) => {
      uTime.value = t;
      uCheer.value = Math.max(0, uCheer.value - 0.004);
    },
    cheer: (k) => {
      uCheer.value = Math.max(uCheer.value, k);
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

// Senkrechte Stoffbanner (Weltfarbe + Stern + "ECHO") an Masten auf den Leisten, wehen leicht im Wind
function poleBannerTexture(col, col2) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = col;
  g.fillRect(0, 0, 128, 320);
  g.fillStyle = col2;
  g.fillRect(0, 0, 128, 26);
  g.fillRect(0, 294, 128, 26);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  // Stern
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 15 : 34;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(64 + Math.cos(a) * r, 84 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.font = 'italic 900 40px system-ui, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  ['E', 'C', 'H', 'O'].forEach((ch, i) => g.fillText(ch, 64, 150 + i * 38));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildBannerPoles(track, skip, parts, { RH, RW }, accent, accent2, uTime, det = 1) {
  const Q = {};
  const M = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const mats = [];
  const spots = [];
  const step = det > 0.8 ? 58 : 90;
  for (let s = 40, side = 1; s < track.length - 50; s += step, side = -side) {
    const k = track.indexAt(s);
    if (skip(k) || track.crossing[k]) continue;
    if (track.pads.some((pd) => Math.abs(track.deltaS(pd.s, s)) < pd.len / 2 + 3)) continue;
    const r = track.posAt(s, side * (track.hw[k] + RW * 0.5), Q);
    parts.add(BASIC.cyl8, { x: r.x, y: r.y + RH + 4, z: r.z, sx: 0.09, sy: 8, sz: 0.09, color: '#2a2633' });
    parts.add(BASIC.box, { x: r.x, y: r.y + RH + 7.9, z: r.z, ry: r.h, sx: 0.07, sy: 0.07, sz: 2.0, color: '#2a2633' });
    parts.add(BASIC.sphere, { x: r.x, y: r.y + RH + 8.1, z: r.z, sx: 0.18, sy: 0.18, sz: 0.18, color: accent2 });
    spots.push({ x: r.x, z: r.z, r: 1.4 });
    // Banner hängt am Querholm, zeigt zur Bahn
    M.compose(v.set(r.x, r.y + RH + 5.75, r.z), q.setFromAxisAngle(yAxis, r.h + (side > 0 ? -Math.PI / 2 : Math.PI / 2)), sc);
    mats.push(M.clone());
  }
  if (!mats.length) return null;
  const geo = new THREE.PlaneGeometry(1.75, 4.2, 1, 8);
  const tex = poleBannerTexture(accent, accent2);
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float fid = float(gl_InstanceID);
      float w = (2.1 - position.y) / 4.2;
      transformed.z += sin(uTime * 3.1 + position.y * 1.7 + fid * 2.1) * 0.16 * w;`
    );
  };
  mat.customProgramCacheKey = () => 'echo-racer-polebanner';
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.frustumCulled = false;
  return { mesh, spots, dispose: () => [geo, tex, mat].forEach((d) => d.dispose()) };
}

// Ballontrauben rund um Start/Ziel: bunte Ballons an Schnüren, wippen leicht
export function buildBalloons(track, { RH, RW }, rnd, det = 1) {
  const Q = {};
  const spots = [];
  for (const [s, side] of [[-26, 1], [-26, -1], [14, 1], [14, -1], [-50, 1], [30, -1]]) {
    const k = track.indexAt(s);
    const r = track.posAt(s, side * (track.hw[k] + RW + 0.8), Q);
    spots.push({ x: r.x, y: r.y + RH, z: r.z });
  }
  const per = det > 0.8 ? 7 : 4;
  const cols = ['#ff3b5c', '#ffd23d', '#2ce7ff', '#7dff5a', '#ff5fd0', '#ffffff', '#a585ff', '#ff8a1f'];
  const geo = new THREE.SphereGeometry(0.55, 16, 12);
  geo.scale(1, 1.2, 1);
  const knot = new THREE.ConeGeometry(0.1, 0.18, 6).rotateX(Math.PI).translate(0, -0.72, 0);
  const g = mergeGeos([geo, knot]);
  geo.dispose();
  knot.dispose();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.0 });
  const mesh = new THREE.InstancedMesh(g, mat, spots.length * per);
  const lines = [];
  const B = [];
  const c = new THREE.Color();
  let n = 0;
  for (const sp of spots) {
    for (let i = 0; i < per; i++) {
      const b = { x: sp.x + (rnd() - 0.5) * 1.6, y: sp.y + 5 + rnd() * 2.6, z: sp.z + (rnd() - 0.5) * 1.6, ax: sp.x, ay: sp.y + 0.8, az: sp.z, ph: rnd() * 6.28 };
      B.push(b);
      mesh.setColorAt(n++, c.set(cols[Math.floor(rnd() * cols.length)]));
      lines.push(b.ax, b.ay, b.az, b.x, b.y - 0.75, b.z);
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const lm = new THREE.LineBasicMaterial({ color: 0xf2f2f6, transparent: true, opacity: 0.7 });
  const strings = new THREE.LineSegments(lg, lm);
  mesh.frustumCulled = false;
  const M = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = lg.attributes.position;
  return {
    objects: [mesh, strings],
    update: (t) => {
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        const ox = Math.sin(t * 0.9 + b.ph) * 0.25;
        const oz = Math.cos(t * 0.7 + b.ph * 1.3) * 0.25;
        e.set(oz * 0.25, 0, -ox * 0.25);
        M.compose(v.set(b.x + ox, b.y + Math.sin(t * 1.3 + b.ph) * 0.12, b.z + oz), q.setFromEuler(e), one);
        mesh.setMatrixAt(i, M);
        pos.setXYZ(i * 2 + 1, b.x + ox, b.y - 0.75, b.z + oz);
      }
      mesh.instanceMatrix.needsUpdate = true;
      pos.needsUpdate = true;
    },
    dispose: () => [g, mat, lg, lm].forEach((d) => d.dispose()),
  };
}

function mergeGeos(list) {
  const pos = [];
  const nor = [];
  for (const gg of list) {
    const ng = gg.index ? gg.toNonIndexed() : gg;
    pos.push(...ng.attributes.position.array);
    nor.push(...ng.attributes.normal.array);
    if (ng !== gg) ng.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

// Werbebanden: lange, niedrige Tafeln auf den Leisten von Geraden und sanften Kurven mit erfundenen Sponsoren
// (sponsorAtlas); die Marke der jeweiligen Welt kommt öfter vor. Nachts hinterleuchtet (Leuchtkasten).
// avoid = belegte Stellen {x, z, r} (Pfeiltafeln, Fahnenmasten) – dort keine Tafel.
const SPONSOR_WORLD = { neon: 'nyx', canyon: 'oase', sky: 'wolke', lava: 'lavalino', garden: 'zwerg' };
const SPONSOR_POOL = ['volt', 'kiko', 'byte', 'zed', 'mira', 'nyx', 'rune', 'juno', 'echofm', 'toffee', 'glitch', 'pops'];

export function buildSponsorBoards(track, skip, parts, { RH, RW }, { themeId, night, rnd, avoid = [] }) {
  const BL = 7.2; // Tafellänge (8:1 wie die Atlas-Felder)
  const GAP = 0.3; // Abstand zweier Tafeln nebeneinander
  const y0 = RH + 0.14;
  const y1 = y0 + 0.9;
  const TH = 0.07; // Tafeldicke
  const SEG = 8;
  const L = track.length;
  const b = new GeoBuilder(true);
  const spots = [];
  const Q = {};
  const C = {};
  const own = SPONSOR_WORLD[themeId] || 'nyx';
  const pool = SPONSOR_POOL.filter((x) => x !== own);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let count = 0;
  let pi = 0;
  const nextBrand = () => (count++ % 3 === 0 ? own : pool[pi++ % pool.length]);
  const at = (s, side) => {
    const hw = track.posAt(s, 0, C).hw;
    return track.posAt(s, side * (hw + RW * 0.55), Q);
  };
  const free = (sA, sB, side) => {
    for (let s = sA - 2; s <= sB + 2; s += 1) {
      const k = track.indexAt(s);
      if (skip(k) || track.crossing[k] || Math.abs(track.curvWide[k]) > 1 / 70) return false;
    }
    // Tor-Pfosten der Boostfelder, Sprungschanzen
    if (track.pads.some((pd) => track.deltaS(sA - 4, pd.s - pd.len / 2) > 0 && track.deltaS(pd.s - pd.len / 2, sB + 4) > 0)) return false;
    if (track.jumps.some((j) => track.deltaS(sA - 16, j.s) > 0 && track.deltaS(j.s, sB + 22) > 0)) return false;
    for (let s = sA; s <= sB + 0.01; s += 1.8) {
      const p = at(s, side);
      if (avoid.some((a) => Math.hypot(a.x - p.x, a.z - p.z) < a.r + 1.2)) return false;
    }
    return true;
  };
  const board = (sA, side, id) => {
    const idx = Math.max(0, SPONSOR_IDS.indexOf(id));
    const u0 = (idx % 2) * 0.5 + 0.002;
    const u1 = u0 + 0.496;
    const vTop = 1 - (idx >> 1) / 8 - 0.004;
    const vBot = 1 - ((idx >> 1) + 1) / 8 + 0.004;
    let prev = null;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const p = at(sA + BL * t, side);
      const ox = p.nx * side * TH * 0.5;
      const oz = p.nz * side * TH * 0.5;
      const F0 = [p.x - ox, p.y + y0, p.z - oz];
      const F1 = [p.x - ox, p.y + y1, p.z - oz];
      const B0 = [p.x + ox, p.y + y0, p.z + oz];
      const B1 = [p.x + ox, p.y + y1, p.z + oz];
      // Schrift von der Bahn aus lesbar: links der Bahn wächst u mit s, rechts umgekehrt
      const u = side < 0 ? u0 + (u1 - u0) * t : u1 - (u1 - u0) * t;
      if (prev) {
        if (side < 0) {
          b.quad(prev.F0, F0, F1, prev.F1, '#ffffff', 1, [[prev.u, vBot], [u, vBot], [u, vTop], [prev.u, vTop]]);
          parts.quad(B0, prev.B0, prev.B1, B1, FRAME);
          parts.quad(prev.F1, F1, B1, prev.B1, FRAME);
        } else {
          b.quad(F0, prev.F0, prev.F1, F1, '#ffffff', 1, [[u, vBot], [prev.u, vBot], [prev.u, vTop], [u, vTop]]);
          parts.quad(prev.B0, B0, B1, prev.B1, FRAME);
          parts.quad(F1, prev.F1, prev.B1, B1, FRAME);
        }
      }
      // Halter: an den Enden als Rahmen (verdecken die Stirnseiten), in der Mitte hinter der Tafel
      if (i === 0 || i === SEG) {
        const sy = y1 + 0.05 - RH;
        parts.add(BASIC.box, { x: p.x, y: p.y + RH + sy / 2, z: p.z, ry: p.h, sx: TH + 0.08, sy, sz: 0.16, color: FRAME });
      } else if (i === SEG / 2) {
        const sy = y1 - 0.1 - RH;
        const o = side * (TH * 0.5 + 0.05);
        parts.add(BASIC.box, { x: p.x + p.nx * o, y: p.y + RH + sy / 2, z: p.z + p.nz * o, ry: p.h, sx: 0.1, sy, sz: 0.12, color: FRAME });
      }
      if (i % 2 === 0) spots.push({ x: p.x, z: p.z, r: 0.9 });
      prev = { F0, F1, B0, B1, u };
    }
  };
  let lastSide = 1;
  for (let s = 64; s < L - 100; ) {
    const n = rnd() < 0.4 ? 2 : 1;
    const sB = s + n * BL + (n - 1) * GAP;
    // in sanften Kurven außen, auf Geraden abwechselnd
    const cw = track.curvWide[track.indexAt((s + sB) / 2)];
    let side = Math.abs(cw) > 1 / 220 ? Math.sign(cw) : -lastSide;
    if (!free(s, sB, side)) {
      side = -side;
      if (!free(s, sB, side)) {
        s += 5;
        continue;
      }
    }
    for (let c = 0; c < n; c++) board(s + c * (BL + GAP), side, nextBrand());
    lastSide = side;
    s = sB + 30 + rnd() * 30;
  }
  if (!b.count) return null;
  const atlas = sponsorAtlas();
  const mat = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.42, metalness: 0, envMapIntensity: 0.55 });
  if (night) {
    // Leuchtkasten: Druck von hinten beleuchtet
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveMap = atlas;
    mat.emissiveIntensity = 0.42;
  }
  const mesh = new THREE.Mesh(b.build(), mat);
  mesh.receiveShadow = true;
  return { mesh, spots, dispose: () => [mesh.geometry, mat].forEach((d) => d.dispose()) };
}
