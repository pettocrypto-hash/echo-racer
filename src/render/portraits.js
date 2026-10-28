// Rundporträts der Fahrerfiguren: jeder Kopf wird einmal aus den echten 3D-Modellen in ein kleines Bild gerendert
// (Dreiviertel-Ansicht, transparenter Hintergrund) – für Minikarte, Ergebnisliste und Fahrerauswahl.

import * as THREE from 'three';
import { buildDriver } from './characters.js';
import { makePaintMaterial } from './carModels.js';
import { CHARACTERS } from '../config.js';

let cache = null;

export function driverPortraits(gl, size = 128) {
  if (cache) return cache;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8ac0, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-1.4, 2.2, 3);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  const mat = makePaintMaterial(0, 'standard');
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const buf = new Uint8Array(size * size * 4);
  const head = new THREE.Vector3();
  const prevTarget = gl.getRenderTarget();
  const prevColor = gl.getClearColor(new THREE.Color());
  const prevAlpha = gl.getClearAlpha();
  const out = [];
  for (let i = 0; i < CHARACTERS.length; i++) {
    const d = buildDriver(i, mat, glowMat, { y: 0, z: 0 }, { y: 0.55, z: 0.55 }, false);
    scene.add(d.root);
    d.root.updateMatrixWorld(true);
    d.head.getWorldPosition(head);
    cam.position.set(head.x + 0.55, head.y + 0.16, head.z + 2.4);
    cam.lookAt(head.x, head.y + 0.02, head.z);
    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, cam);
    gl.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    scene.remove(d.root);
    // in ein Canvas umkopieren: Zeilen spiegeln (WebGL zählt von unten), linear → sRGB
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const si = ((size - 1 - y) * size + x) * 4;
        const di = (y * size + x) * 4;
        const a = buf[si + 3];
        for (let k = 0; k < 3; k++) {
          // vormultipliziertes Alpha zurückrechnen, dann Gamma
          const lin = a ? Math.min(1, buf[si + k] / a) : 0;
          img.data[di + k] = Math.round(255 * Math.pow(lin, 1 / 2.2));
        }
        img.data[di + 3] = a;
      }
    }
    g.putImageData(img, 0, 0);
    out.push({ canvas: c, url: c.toDataURL('image/png') });
  }
  gl.setRenderTarget(prevTarget);
  gl.setClearColor(prevColor, prevAlpha);
  rt.dispose();
  mat.dispose();
  glowMat.dispose();
  cache = out;
  return cache;
}

export function portraitsReady() {
  return cache;
}
