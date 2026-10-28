// Effekte: Hologramm-Material (Echos, Hacks), Lichtspuren, Partikel (Funken, Boost, Staub).

import * as THREE from 'three';

export function makeHoloMaterial(color, { scan = 1, rim = 2.2, base = 0.35 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uAlpha: { value: 1 },
      uGlitch: { value: 0 },
      uScan: { value: scan },
      uRim: { value: rim },
      uBase: { value: base },
      uRise: { value: 1e4 },
      uBottom: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uGlitch;
      attribute float aBase; // optionale Bodenhöhe je Ecke (fehlt sie, ist sie 0)
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vV;
      varying float vBase;
      float hh(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        float band = floor(w.y * 5.0 + floor(uTime * 20.0) * 3.0);
        float g = step(0.72, hh(band + 3.1)) * uGlitch;
        w.x += (hh(band) - 0.5) * g * 1.4;
        w.z += (hh(band + 9.0) - 0.5) * g * 1.4;
        vW = w.xyz;
        vBase = aBase;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uAlpha;
      uniform float uScan;
      uniform float uRim;
      uniform float uBase;
      uniform float uRise;
      uniform float uBottom;
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vV;
      varying float vBase;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float scan = mix(1.0, 0.55 + 0.45 * sin(vW.y * 24.0 - uTime * 9.0), uScan);
        float flick = 0.88 + 0.12 * sin(uTime * 57.0 + vW.x * 0.7);
        // "Materialisieren": von unten nach oben aufbauen
        float bot = uBottom + vBase;
        float rise = step(vW.y - bot, uRise);
        float edge = smoothstep(0.25, 0.0, abs(vW.y - bot - uRise)) * (1.0 - step(2.9, uRise));
        vec3 col = uColor * ((uBase + uRim * fres) * scan * flick + edge * 3.0);
        gl_FragColor = vec4(col * uAlpha * rise, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// Lichtspur hinter Echos: Band aus N Punkten, Alpha über die Länge
export class Trail {
  constructor(color, n = 26, width = 0.75) {
    this.n = n;
    this.width = width;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    const alpha = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = Math.pow(1 - i / (n - 1), 1.6);
      alpha[i * 2] = a;
      alpha[i * 2 + 1] = a;
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float alpha;
        varying float vA;
        void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uAlpha;
        varying float vA;
        void main() { gl_FragColor = vec4(uColor * vA * uAlpha * 1.6, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }

  // pts: Array von {x, y, z, h} (neuester zuerst)
  set(points) {
    const p = this.pos;
    for (let i = 0; i < this.n; i++) {
      const q = points[Math.min(i, points.length - 1)];
      const rx = -Math.cos(q.h) * this.width;
      const rz = Math.sin(q.h) * this.width;
      const o = i * 6;
      p[o] = q.x - rx;
      p[o + 1] = q.y + 0.55;
      p[o + 2] = q.z - rz;
      p[o + 3] = q.x + rx;
      p[o + 4] = q.y + 0.55;
      p[o + 5] = q.z + rz;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// Ein Punkt-System für alle Partikel: additiv (Funken, Glühen) oder als Rauch (normal gemischt, wächst, verblasst)
// Farbtexte ("#ff9a3a") nur einmal parsen – emit() läuft hundertfach pro Sekunde
const RGB_CACHE = new Map();

export class Particles {
  // smoke = false: Funken als scharfe, nach der Bewegung gestreckte Striche (Instanz-Quads, additiv)
  // smoke = true:  Comic-Rauchwolken (Punkte mit unregelmäßigem Umriss, normal geblendet)
  constructor(max = 1800, smoke = false) {
    this.max = max;
    this.smoke = smoke;
    this.count = 0;
    this.px = new Float32Array(max);
    this.py = new Float32Array(max);
    this.pz = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.vz = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.cr = new Float32Array(max);
    this.cg = new Float32Array(max);
    this.cb = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.seed = new Float32Array(max);
    this.aPos = new Float32Array(max * 3);
    this.aCol = new Float32Array(max * 3);
    this.aSize = new Float32Array(max);
    this.aAlpha = new Float32Array(max);
    const dyn = (a, n, inst) => (inst ? new THREE.InstancedBufferAttribute(a, n) : new THREE.BufferAttribute(a, n)).setUsage(THREE.DynamicDrawUsage);
    if (smoke) {
      const g = new THREE.BufferGeometry();
      this.aSeed = new Float32Array(max);
      g.setAttribute('position', dyn(this.aPos, 3));
      g.setAttribute('color', dyn(this.aCol, 3));
      g.setAttribute('size', dyn(this.aSize, 1));
      g.setAttribute('alpha', dyn(this.aAlpha, 1));
      g.setAttribute('seed', dyn(this.aSeed, 1));
      g.setDrawRange(0, 0);
      this.geo = g;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 500 } },
        vertexShader: /* glsl */ `
          attribute float size;
          attribute vec3 color;
          attribute float alpha;
          attribute float seed;
          uniform float uScale;
          varying vec3 vC;
          varying float vA;
          varying float vSeed;
          void main() {
            vC = color;
            vSeed = seed;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            // direkt vor der Kamera ausblenden: keine riesigen Scheiben
            vA = alpha * smoothstep(2.0, 6.5, -mv.z);
            gl_PointSize = clamp(size * uScale / max(0.5, -mv.z), 1.0, 64.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vC;
          varying float vA;
          varying float vSeed;
          float lobe(vec2 p, vec2 c, float r) {
            return r - length(p - c);
          }
          void main() {
            // Comic-Wolke aus vier Lappen (je Teilchen anders gedreht) statt einer Kugel: klare Kante,
            // oben heller, unten Schatten, Rand etwas durchscheinend
            vec2 d = gl_PointCoord - 0.5;
            float s = vSeed * 6.2831;
            float m = max(
              max(lobe(d, vec2(cos(s), sin(s)) * 0.12, 0.27), lobe(d, vec2(cos(s + 2.1), sin(s + 2.1)) * 0.13, 0.25)),
              max(lobe(d, vec2(cos(s + 4.2), sin(s + 4.2)) * 0.11, 0.26), lobe(d, vec2(0.0, -0.04), 0.25))
            );
            float a = smoothstep(-0.012, 0.012, m);
            float lit = 0.72 + 0.42 * clamp(-d.y * 2.2 + 0.25, 0.0, 1.0) - 0.12 * smoothstep(0.1, 0.45, d.y);
            // Furchen zwischen den Lappen leicht dunkler
            lit *= 0.9 + 0.1 * smoothstep(0.0, 0.08, m);
            gl_FragColor = vec4(vC * lit, a * vA * (0.6 + 0.4 * smoothstep(0.0, 0.12, m)));
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });
      this.points = new THREE.Points(g, this.mat);
    } else {
      // Instanz-Quad: x = quer (-1…1), y = entlang (0 = Ende, 1 = Kopf)
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
      g.setIndex([0, 1, 2, 2, 1, 3]);
      this.aVel = new Float32Array(max * 3);
      g.setAttribute('iPos', dyn(this.aPos, 3, true));
      g.setAttribute('iVel', dyn(this.aVel, 3, true));
      g.setAttribute('iCol', dyn(this.aCol, 3, true));
      g.setAttribute('iSize', dyn(this.aSize, 1, true));
      g.instanceCount = 0;
      this.geo = g;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 500 }, uStreak: { value: 0.045 } },
        vertexShader: /* glsl */ `
          attribute vec3 iPos;
          attribute vec3 iVel;
          attribute vec3 iCol;
          attribute float iSize;
          uniform float uStreak;
          varying vec3 vC;
          varying vec2 vUv;
          varying float vA;
          void main() {
            vC = iCol;
            vUv = position.xy;
            vec4 head = modelViewMatrix * vec4(iPos, 1.0);
            vec4 tail = modelViewMatrix * vec4(iPos - iVel * uStreak, 1.0);
            float w = iSize * 0.16;
            vec3 ax = head.xyz - tail.xyz;
            float L = length(ax);
            // langsame Funken bleiben kurze, klare Striche statt zu verschwinden
            vec3 dir = L > 1e-4 ? ax / L : vec3(0.0, 1.0, 0.0);
            if (L < w * 2.2) tail.xyz = head.xyz - dir * w * 2.2;
            vec4 P = mix(tail, head, position.y);
            vec3 side = cross(dir, normalize(P.xyz));
            float sl = length(side);
            side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
            P.xyz += side * position.x * w;
            vA = smoothstep(2.0, 6.5, -P.z);
            gl_Position = projectionMatrix * P;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vC;
          varying vec2 vUv;
          varying float vA;
          void main() {
            // harter Kern, kurze Kante; zum Ende hin dunkler – liest sich als Funkenflug
            float across = abs(vUv.x);
            float a = smoothstep(1.0, 0.6, across) * mix(0.2, 1.0, vUv.y) * vA;
            vec3 hot = mix(vC, vec3(max(vC.r, max(vC.g, vC.b))), (1.0 - across) * 0.35 * vUv.y);
            gl_FragColor = vec4(hot * a, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.points = new THREE.Mesh(g, this.mat);
    }
    this.points.frustumCulled = false;
    this.c = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, life, size, color, k = 1, grav = 0, drag = 0) {
    let i = this.count;
    if (i >= this.max) {
      i = Math.floor(Math.random() * this.max);
    } else this.count++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.seed[i] = Math.random();
    let v = typeof color === 'string' ? RGB_CACHE.get(color) : null;
    if (!v) {
      this.c.set(color);
      v = { r: this.c.r, g: this.c.g, b: this.c.b };
      if (typeof color === 'string' && RGB_CACHE.size < 256) RGB_CACHE.set(color, v);
    }
    this.cr[i] = v.r * k;
    this.cg[i] = v.g * k;
    this.cb[i] = v.b * k;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  // Flacher Ring nach außen (Schockwelle)
  ring(x, y, z, n, speed, life, size, color, k = 2) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.12;
      const s = speed * (0.85 + Math.random() * 0.3);
      this.emit(x, y, z, Math.cos(a) * s, 0.5 + Math.random() * 1.5, Math.sin(a) * s, life * (0.8 + Math.random() * 0.4), size, color, k, 0, 0.6);
    }
  }

  burst(x, y, z, n, speed, life, size, color, k = 2, grav = 9) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.9 + 0.1;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, Math.cos(a) * s * (1 - e * 0.5), e * s, Math.sin(a) * s * (1 - e * 0.5), life * (0.6 + Math.random() * 0.4), size, color, k, grav, 1.5);
    }
  }

  update(dt, scale) {
    this.mat.uniforms.uScale.value = scale;
    const A = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.maxLife, this.size, this.cr, this.cg, this.cb, this.grav, this.drag, this.seed];
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) for (let k = 0; k < A.length; k++) A[k][i] = A[k][n];
        i--;
        continue;
      }
      const dk = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dk;
      this.vy[i] = this.vy[i] * dk - this.grav[i] * dt;
      this.vz[i] *= dk;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.02 && this.grav[i] > 0) {
        this.py[i] = 0.02;
        this.vy[i] *= -0.35;
      }
    }
    this.count = n;
    for (let i = 0; i < n; i++) {
      const f = this.life[i] / this.maxLife[i];
      const i3 = i * 3;
      this.aPos[i3] = this.px[i];
      this.aPos[i3 + 1] = this.py[i];
      this.aPos[i3 + 2] = this.pz[i];
      if (this.smoke) {
        // Rauch: wächst schnell auf, wird dann größer und blasser; jede Wolke hat ihre eigene Größe
        const age = 1 - f;
        this.aCol[i3] = this.cr[i];
        this.aCol[i3 + 1] = this.cg[i];
        this.aCol[i3 + 2] = this.cb[i];
        this.aAlpha[i] = Math.min(1, age * 8) * Math.pow(f, 1.3) * 0.72;
        this.aSize[i] = this.size[i] * (0.55 + 0.45 * this.seed[i]) * (0.6 + 1.5 * Math.sqrt(age));
        this.aSeed[i] = this.seed[i];
        continue;
      }
      this.aVel[i3] = this.vx[i];
      this.aVel[i3 + 1] = this.vy[i];
      this.aVel[i3 + 2] = this.vz[i];
      this.aCol[i3] = this.cr[i] * f;
      this.aCol[i3 + 1] = this.cg[i] * f;
      this.aCol[i3 + 2] = this.cb[i] * f;
      this.aSize[i] = this.size[i] * (0.5 + 0.5 * f);
    }
    const at = this.geo.attributes;
    if (this.smoke) {
      this.geo.setDrawRange(0, n);
      at.position.needsUpdate = true;
      at.alpha.needsUpdate = true;
      at.seed.needsUpdate = true;
      at.color.needsUpdate = true;
      at.size.needsUpdate = true;
    } else {
      this.geo.instanceCount = n;
      at.iPos.needsUpdate = true;
      at.iVel.needsUpdate = true;
      at.iCol.needsUpdate = true;
      at.iSize.needsUpdate = true;
    }
  }

  clear() {
    this.count = 0;
    if (this.smoke) this.geo.setDrawRange(0, 0);
    else this.geo.instanceCount = 0;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// Umgebungspartikel rund um die Kamera (Regen, Staub, Glitzer, Glut) – komplett im Shader animiert
const AMBIENT = {
  rain: { color: '#a8d4ff', k: 0.6, vel: [3, -34, 1.2], box: 70, len: 1.8, lines: true, count: 900 },
  dust: { color: '#ffd2a0', k: 0.28, vel: [4, 0.35, 1.5], box: 80, size: 0.13, tw: 0, count: 700 },
  sparkle: { color: '#fff4ff', k: 1.2, vel: [0.3, 0.9, 0.2], box: 90, size: 0.2, tw: 1, count: 700 },
  embers: { color: '#ff7a2a', k: 2.4, vel: [0.6, 2.8, 0.4], box: 70, size: 0.18, tw: 1, count: 800 },
  pollen: { color: '#fff3b8', k: 0.9, vel: [0.8, 0.25, 0.5], box: 70, size: 0.15, tw: 1, count: 500 },
  fair: { color: '#ffd9a0', k: 1.7, vel: [0.3, 0.45, 0.2], box: 80, size: 0.15, tw: 1, count: 420 },
};

export class Ambient {
  constructor(type, density = 1) {
    const c = AMBIENT[type] || AMBIENT.dust;
    const count = Math.max(50, Math.round(c.count * density));
    const per = c.lines ? 2 : 1;
    const pos = new Float32Array(count * per * 3);
    const seed = new Float32Array(count * per);
    const end = new Float32Array(count * per);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * c.box;
      const y = (Math.random() - 0.5) * c.box;
      const z = (Math.random() - 0.5) * c.box;
      const s = Math.random();
      for (let j = 0; j < per; j++) {
        const o = i * per + j;
        pos.set([x, y, z], o * 3);
        seed[o] = s;
        end[o] = j;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uBox: { value: c.box },
      uVel: { value: new THREE.Vector3(...c.vel) },
      uLen: { value: c.len || 0 },
      uSize: { value: c.size || 0.2 },
      uScale: { value: 500 },
      uTw: { value: c.tw || 0 },
      uColor: { value: new THREE.Color(c.color).multiplyScalar(c.k) },
    };
    const common = /* glsl */ `
      uniform float uTime;
      uniform vec3 uCam;
      uniform float uBox;
      uniform vec3 uVel;
      uniform float uLen;
      uniform float uSize;
      uniform float uScale;
      uniform float uTw;
      attribute float aSeed;
      attribute float aEnd;
      varying float vA;
      vec3 place() {
        vec3 p = position + uVel * uTime * (0.7 + 0.6 * aSeed);
        p.x += sin(uTime * 0.6 + aSeed * 31.0) * 1.2;
        p.z += cos(uTime * 0.5 + aSeed * 17.0) * 1.2;
        return mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
      }`;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: c.lines
        ? common + /* glsl */ `
          void main() {
            vec3 head = place();
            // Tropfen dicht vor der Kamera schrumpfen zu nichts (sonst quer übers Bild gezogene Striche)
            float near = smoothstep(3.0, 7.0, length(head - uCam));
            vec3 p = head - normalize(uVel) * uLen * aEnd * near;
            float d = length(p - uCam) / (uBox * 0.5);
            vA = (1.0 - smoothstep(0.5, 1.0, d)) * (1.0 - aEnd * 0.9) * near;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`
        : common + /* glsl */ `
          void main() {
            vec3 p = place();
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp(uSize * uScale / max(0.5, -mv.z) * (0.6 + 0.8 * aSeed), 1.0, 18.0);
            float d = length(p - uCam) / (uBox * 0.5);
            // dicht vor der Kamera ausblenden (sonst große, unscharf wirkende Kreise)
            vA = (1.0 - smoothstep(0.55, 1.0, d)) * smoothstep(3.0, 8.0, -mv.z) * mix(1.0, 0.5 + 0.5 * sin(uTime * 4.0 + aSeed * 60.0), uTw);
          }`,
      fragmentShader: c.lines
        ? /* glsl */ `
          uniform vec3 uColor;
          varying float vA;
          void main() { gl_FragColor = vec4(uColor * vA, 1.0); }`
        : /* glsl */ `
          uniform vec3 uColor;
          varying float vA;
          void main() {
            float r = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.36, r) * (0.4 + 0.6 * smoothstep(0.45, 0.0, r));
            gl_FragColor = vec4(uColor * a * vA, 1.0);
          }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.object = c.lines ? new THREE.LineSegments(g, mat) : new THREE.Points(g, mat);
    this.object.frustumCulled = false;
    this.geo = g;
    this.mat = mat;
  }

  update(t, camPos, scale) {
    this.uniforms.uTime.value = t;
    this.uniforms.uCam.value.copy(camPos);
    this.uniforms.uScale.value = scale;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// Speed-Streifen: dünne Lichtlinien im Kameraraum, die beim Boost am Bild vorbeirasen (komplett im Shader animiert)
export class SpeedLines {
  constructor(n = 70) {
    const pos = new Float32Array(n * 4 * 3);
    const line = new Float32Array(n * 4 * 3);
    const corner = new Float32Array(n * 4 * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      // Winkel ohne den Bereich direkt unter der Bildmitte (dort fährt das Auto)
      let a = Math.random() * Math.PI * 2;
      if (Math.sin(a) < -0.55 && Math.abs(Math.cos(a)) < 0.6) a += Math.PI;
      const r = 2.4 + Math.random() * 3.2;
      const seed = Math.random();
      for (let k = 0; k < 4; k++) {
        line.set([a, r, seed], (i * 4 + k) * 3);
        corner.set([k & 1 ? 1 : -1, k >> 1], (i * 4 + k) * 2);
      }
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aLine', new THREE.BufferAttribute(line, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(idx);
    this.uniforms = { uTime: { value: 0 }, uSpeed: { value: 40 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aLine;
        attribute vec2 aCorner;
        uniform float uTime;
        uniform float uSpeed;
        varying float vA;
        void main() {
          float L = 50.0;
          float z = -mod(aLine.z * L + uTime * uSpeed * 1.6, L) - 1.5;
          float len = 1.0 + uSpeed * 0.045;
          float zz = z - aCorner.y * len;
          vec2 rad = vec2(cos(aLine.x), sin(aLine.x));
          vec2 tg = vec2(-rad.y, rad.x);
          vec2 xy = rad * aLine.y + tg * aCorner.x * 0.018;
          // erst ab einigen Metern sichtbar: kurze, klare Striche am Bildrand statt langer Kratzer quer durchs Bild
          vA = smoothstep(-7.0, -13.0, zz) * smoothstep(-51.0, -38.0, zz) * (0.5 + 0.5 * aLine.z) * 0.7;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(xy, zz, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uAlpha;
        varying float vA;
        void main() { gl_FragColor = vec4(uColor * vA * uAlpha, 1.0); }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 50;
    this.geo = g;
  }

  update(t, speed, alpha, color) {
    this.uniforms.uTime.value = t;
    this.uniforms.uSpeed.value = speed;
    this.uniforms.uAlpha.value = alpha;
    if (color) this.uniforms.uColor.value.copy(color);
    this.mesh.visible = alpha > 0.01;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// Reifenspuren: Ringpuffer aus Streifen-Segmenten auf der Fahrbahn, verblassen nach einigen Sekunden (im Shader)
export class SkidMarks {
  constructor(max = 900) {
    this.max = max;
    this.next = 0;
    this.time = 0;
    this.pos = new Float32Array(max * 4 * 3);
    this.birth = new Float32Array(max * 4).fill(-99);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('birth', new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    this.uniforms = { uTime: { value: 0 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float birth;
        varying float vA;
        uniform float uTime;
        void main() {
          vA = 0.42 * (1.0 - smoothstep(5.0, 9.0, uTime - birth));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { gl_FragColor = vec4(0.04, 0.04, 0.05, vA); }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }

  // Segment von a nach b (Breite w); y = Höhe bei a, (gx, gz) = Gefälle der Fahrbahn (Hang + Steilkurve)
  add(ax, az, bx, bz, y, w, gx = 0, gz = 0) {
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * w * 0.5;
    const nz = (dx / l) * w * 0.5;
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const Y = (x, z) => y + gx * (x - ax) + gz * (z - az);
    const p = this.pos;
    p.set([ax - nx, Y(ax - nx, az - nz), az - nz, ax + nx, Y(ax + nx, az + nz), az + nz], i * 12);
    p.set([bx - nx, Y(bx - nx, bz - nz), bz - nz, bx + nx, Y(bx + nx, bz + nz), bz + nz], i * 12 + 6);
    this.birth.fill(this.time, i * 4, i * 4 + 4);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.birth.needsUpdate = true;
  }

  update(t) {
    this.time = t;
    this.uniforms.uTime.value = t;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// Konfetti: kleine Papierschnipsel (Instanzen), drehen sich, flattern und sinken langsam – sichtbar bei Tag und Nacht
const CONFETTI_COLS = ['#ff3b5c', '#ffd23d', '#2ce7ff', '#7dff5a', '#ff5fd0', '#ffffff', '#a585ff', '#ff8a1f'].map((c) => new THREE.Color(c));
export class Confetti {
  constructor(max = 500) {
    this.max = max;
    this.n = 0;
    this.d = [];
    for (let i = 0; i < max; i++) this.d.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: new THREE.Vector3(1, 0, 0), a: 0, w: 0, life: 0, ph: 0 });
    const geo = new THREE.PlaneGeometry(0.26, 0.16);
    this.mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.geo = geo;
    this.M = new THREE.Matrix4();
    this.Q = new THREE.Quaternion();
    this.P = new THREE.Vector3();
    this.S = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, CONFETTI_COLS[i % CONFETTI_COLS.length]);
  }

  // n Schnipsel in Richtung (dx, dy, dz) mit Streuung abfeuern
  burst(x, y, z, n, dx, dy, dz, speed, spread = 0.5) {
    for (let k = 0; k < n; k++) {
      let i = this.n;
      if (i >= this.max) i = Math.floor(Math.random() * this.max);
      else this.n++;
      const p = this.d[i];
      const sp = speed * (0.6 + Math.random() * 0.6);
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = (dx + (Math.random() - 0.5) * spread * 2) * sp;
      p.vy = (dy + (Math.random() - 0.5) * spread * 2) * sp;
      p.vz = (dz + (Math.random() - 0.5) * spread * 2) * sp;
      p.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      p.a = Math.random() * 6.28;
      p.w = 6 + Math.random() * 10;
      p.life = 4 + Math.random() * 2.5;
      p.ph = Math.random() * 6.28;
      p.col = CONFETTI_COLS[Math.floor(Math.random() * CONFETTI_COLS.length)];
    }
  }

  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      const p = this.d[i];
      p.life -= dt;
      if (p.life <= 0) {
        n--;
        const last = this.d[n];
        this.d[n] = p;
        this.d[i] = last;
        i--;
        continue;
      }
      // starker Luftwiderstand, langsames Sinken, seitliches Flattern
      const drag = Math.exp(-2.2 * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - 4.5 * dt;
      if (p.vy < -2.2) p.vy = -2.2;
      p.ph += dt * 3;
      p.x += (p.vx + Math.sin(p.ph) * 0.6) * dt;
      p.y += p.vy * dt;
      p.z += (p.vz + Math.cos(p.ph * 0.8) * 0.6) * dt;
      p.a += p.w * dt;
      this.Q.setFromAxisAngle(p.ax, p.a);
      const s = Math.min(1, p.life * 2);
      this.S.set(s, s, s);
      this.M.compose(this.P.set(p.x, p.y, p.z), this.Q, this.S);
      this.mesh.setMatrixAt(i, this.M);
      this.mesh.setColorAt(i, p.col);
    }
    this.n = n;
    this.mesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
