// Garage: das gewählte Spielzeugauto auf einer Drehscheibe im Studio-Licht (mit Spiegelungen).

import * as THREE from 'three';
import { buildCar, disposeCar } from './carModels.js';
import { glowTexture } from './textures.js';
import { blink } from './characters.js';

function studioEnv(renderer) {
  const scene = new THREE.Scene();
  const disp = [];
  // Hintergrund-Verlauf: heller oben, dunkler unten (damit Chrom und Lack glänzen)
  const bgMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.05, 0.04, 0.1), vec3(0.42, 0.42, 0.55), smoothstep(-0.3, 0.8, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const bg = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), bgMat);
  scene.add(bg);
  disp.push(bg.geometry, bgMat);
  const add = (color, k, pos, w, h) => {
    const g = new THREE.PlaneGeometry(w, h);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
    disp.push(g, m);
  };
  add('#ffffff', 5, [0, 30, 0], 30, 12);
  add('#ffffff', 3, [22, 14, -18], 16, 10);
  add('#ff4fd8', 4, [-30, 6, -8], 8, 30);
  add('#2ce7ff', 4, [30, 6, 8], 8, 30);
  add('#ffffff', 2.5, [0, 8, 30], 34, 8);
  const pm = new THREE.PMREMGenerator(renderer.gl);
  const rt = pm.fromScene(scene, 0.04, 0.1, 100, { size: 128 });
  pm.dispose();
  for (const d of disp) d.dispose();
  return rt;
}

export class Showroom {
  constructor(renderer) {
    this.renderer = renderer;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#0b0820');
    scene.fog = new THREE.Fog('#0b0820', 14, 40);
    this.envRT = studioEnv(renderer);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 1.0;
    scene.add(new THREE.HemisphereLight(new THREE.Color('#9a8cff'), new THREE.Color('#1a0a2a'), 1.6));
    const key = new THREE.DirectionalLight(new THREE.Color('#ffffff'), 2.6);
    key.position.set(4, 7, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(new THREE.Color('#ff4fd8'), 2.0);
    rim.position.set(-6, 3, -5);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.4, 48), new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1640'), roughness: 0.55, envMapIntensity: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.35, 4.5, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#2ce7ff').multiplyScalar(1.6) }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);
    const grid = new THREE.GridHelper(60, 30, new THREE.Color('#5a2cff'), new THREE.Color('#2a1660'));
    grid.position.y = -0.02;
    scene.add(grid);
    this.turn = new THREE.Group();
    scene.add(this.turn);
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 6.6),
      new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.03;
    this.turn.add(this.glow);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.car = null;
    this.t = 0;
  }

  setCar(type, color, finish = 'standard', driver = 0) {
    if (this.car) {
      this.turn.remove(this.car.root);
      disposeCar(this.car);
    }
    this.car = buildCar(type, color, { envK: 1.2, shadows: false, number: 1, finish, driver });
    this.turn.add(this.car.root);
    this.glow.material.color.set(color).multiplyScalar(0.6);
  }

  frame(dt) {
    this.t += dt;
    this.turn.rotation.y = this.t * 0.45;
    if (this.car) {
      for (const w of this.car.wheels) w.mesh.rotation.x += dt * 1.5;
      // Figur schaut sich um und winkt ab und zu
      const d = this.car.driver;
      d.head.rotation.y = Math.sin(this.t * 0.7) * 0.45;
      d.head.rotation.z = Math.sin(this.t * 1.3) * 0.05;
      blink(d, this, dt);
      if (this.car.bodyMat.userData.uTime) this.car.bodyMat.userData.uTime.value = this.t;
    }
    const a = this.renderer.aspect;
    this.camera.aspect = a;
    const dist = a < 1.2 ? 11.5 : 8.2;
    this.camera.position.set(Math.sin(0.6) * dist, 2.7, Math.cos(0.6) * dist);
    this.camera.lookAt(0, 1.15, 0);
    this.camera.updateProjectionMatrix();
    const fx = this.renderer.fx;
    fx.speed = 0;
    fx.glitch = 0;
    fx.flash = 0;
    fx.bloom = 0.35;
    fx.bloomThreshold = 1.8;
    fx.exposure = 1;
    fx.sat = 1.06;
    fx.contrast = 0.2;
    fx.vignette = 0.2;
    fx.sharpen = 0.5;
    fx.chroma = 0;
    fx.shadowTint.setRGB(0.98, 0.98, 1.02);
    fx.highTint.setRGB(1.01, 1.0, 0.99);
    fx.time = this.t;
    this.renderer.render(this.scene, this.camera);
  }
}
