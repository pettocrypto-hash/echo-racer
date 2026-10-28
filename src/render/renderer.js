// WebGL2-Renderer mit eigener, schlanker Nachbearbeitung:
// MSAA-Szene -> Umgebungsverdeckung (SAO, halbe Auflösung) -> Bloom (Dual-Filter)
// -> Komposit (Geschwindigkeits-Unschärfe, Glitch, Vignette, ACES, sRGB)
// plus adaptiver Auflösung: senkt die Renderskalierung bei FPS-Einbruch und hebt sie bei Reserven wieder an.

import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BRIGHT = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;
vec3 tapW(vec2 o, inout float wsum) {
  vec3 s = texture2D(tSrc, vUv + uTexel * o).rgb;
  float w = 1.0 / (1.0 + max(max(s.r, s.g), s.b));
  wsum += w;
  return s * w;
}
void main() {
  // Gewichtung 1/(1+Helligkeit): einzelne grelle Pixel (Glanzpunkte) dominieren nicht → kein Glitzer-Flackern im Bloom
  float wsum = 0.0;
  vec3 c = tapW(vec2(-1.0, -1.0), wsum) + tapW(vec2(1.0, -1.0), wsum) + tapW(vec2(-1.0, 1.0), wsum) + tapW(vec2(1.0, 1.0), wsum);
  c /= max(wsum, 1e-4);
  float br = max(max(c.r, c.g), c.b);
  float knee = 0.35;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * w, vec3(12.0)), 1.0);
}`;

const DOWN = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}`;

const UP = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tBase;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 s = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0 + texture2D(tBase, vUv).rgb, 1.0);
}`;

// Scalable Ambient Obscurance: Verdeckung aus dem Tiefenpuffer (Normalen aus Nachbartiefen), Spiralmuster
const AO = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uFullTexel;
uniform float uNear;
uniform float uFar;
uniform float uP00;
uniform float uP11;
uniform float uProjScale;
uniform float uRadius;
uniform float uIntensity;
uniform float uBias;
varying vec2 vUv;
float viewZ(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
vec3 viewPos(vec2 uv) {
  float z = viewZ(texture2D(tDepth, uv).x);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(-z * ndc.x / uP00, -z * ndc.y / uP11, z);
}
// Interleaved Gradient Noise: gleichmäßiges Rauschen auch bei großen Pixelkoordinaten
// (fract(sin(…)) verliert dort Genauigkeit und erzeugt sichtbare Streifenmuster auf Wänden)
float hash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  float d0 = texture2D(tDepth, vUv).x;
  if (d0 >= 0.99999) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
  vec3 P = viewPos(vUv);
  vec3 px1 = viewPos(vUv + vec2(uFullTexel.x, 0.0)) - P;
  vec3 px0 = P - viewPos(vUv - vec2(uFullTexel.x, 0.0));
  vec3 py1 = viewPos(vUv + vec2(0.0, uFullTexel.y)) - P;
  vec3 py0 = P - viewPos(vUv - vec2(0.0, uFullTexel.y));
  vec3 dx = abs(px1.z) < abs(px0.z) ? px1 : px0;
  vec3 dy = abs(py1.z) < abs(py0.z) ? py1 : py0;
  vec3 N = normalize(cross(dx, dy));
  float rPx = min(uProjScale * uRadius / -P.z, 140.0);
  float r2 = uRadius * uRadius;
  float spin = hash(gl_FragCoord.xy) * 6.2831;
  // Toleranz wächst mit der Entfernung: kleine Tiefen-/Normalenfehler auf großen Flächen erzeugen sonst Streifen
  float bias = uBias * (1.0 + -P.z * 0.045);
  float sum = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = (float(i) + 0.5) / 12.0;
    float ang = a * 6.2831 * 3.0 + spin;
    vec2 off = vec2(cos(ang), sin(ang)) * (a * rPx) * uFullTexel;
    vec3 v = viewPos(vUv + off) - P;
    float vv = dot(v, v);
    float f = max(r2 - vv, 0.0);
    // Winkel-Toleranz: Proben fast in der eigenen Fläche (Rechenungenauigkeit) zählen nicht als Verdeckung
    sum += f * f * f * max((dot(v, N) - 0.17 * sqrt(vv) - bias) / (0.01 + vv), 0.0);
  }
  float ao = max(0.0, 1.0 - sum * uIntensity / (r2 * r2 * r2) * (5.0 / 12.0));
  ao = mix(1.0, ao, smoothstep(110.0, 45.0, -P.z));
  gl_FragColor = vec4(ao, -P.z, 0.0, 1.0);
}`;

// Kantenerhaltender Weichzeichner für die Verdeckung (Tiefe in g)
const AO_BLUR = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec2 c = texture2D(tSrc, vUv).rg;
  float sum = c.r;
  float wsum = 1.0;
  float tol = max(0.12, c.g * 0.035);
  for (int i = -4; i <= 4; i++) {
    if (i == 0) continue;
    vec2 sm = texture2D(tSrc, vUv + uDir * float(i)).rg;
    float w = exp(-float(i * i) / 9.0) * max(0.0, 1.0 - abs(sm.g - c.g) / tol);
    sum += sm.r * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, c.g, 0.0, 1.0);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uTexel;
uniform float uBloom;
uniform float uSpeed;
uniform float uGlitch;
uniform float uTime;
uniform float uVignette;
uniform float uExposure;
uniform vec3 uFlashColor;
uniform float uFlash;
uniform float uSharpen;
uniform float uSat;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uChroma;
uniform sampler2D tAO;
uniform float uAO;
varying vec2 vUv;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 comp(vec3 c) { return c / (1.0 + c); }

void main() {
  vec2 uv = vUv;
  if (uGlitch > 0.001) {
    float band = floor(uv.y * 26.0) + floor(uTime * 24.0) * 13.0;
    if (hash(band) > 0.62) uv.x += (hash(band + 1.7) - 0.5) * 0.035 * uGlitch;
  }
  vec2 dir = uv - vec2(0.5, 0.53);
  vec3 c0 = texture2D(tScene, uv).rgb;
  vec3 col = c0;
#ifdef SHARPEN
  // Schärfen: Unsharp Mask in komprimiertem HDR (keine Halos an hellen Leuchtkanten)
  vec3 n = comp(texture2D(tScene, uv + vec2(uTexel.x, 0.0)).rgb)
         + comp(texture2D(tScene, uv - vec2(uTexel.x, 0.0)).rgb)
         + comp(texture2D(tScene, uv + vec2(0.0, uTexel.y)).rgb)
         + comp(texture2D(tScene, uv - vec2(0.0, uTexel.y)).rgb);
  vec3 y = comp(c0);
  y = clamp(y + (y - n * 0.25) * uSharpen, 0.0, 0.995);
  col = y / (1.0 - y);
#endif
#if TAPS > 0
  // Geschwindigkeits-Unschärfe nur zum Rand hin, Bildmitte bleibt scharf
  float m = smoothstep(0.12, 0.75, length(dir)) * uSpeed;
  if (m > 0.002) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < TAPS; i++) {
      float f = float(i) / float(TAPS);
      acc += texture2D(tScene, uv - dir * f * 0.075 * m).rgb;
    }
    col = mix(col, acc / float(TAPS), clamp(m * 3.0, 0.0, 1.0));
  }
#endif
  if (uChroma > 0.001) {
    // Farbsäume nach außen (Treffer, Zeitlupe)
    vec2 co = dir * 0.022 * uChroma;
    col.r = texture2D(tScene, uv + co).r;
    col.b = texture2D(tScene, uv - co).b;
  }
  if (uGlitch > 0.001) {
    float o = 0.004 * uGlitch;
    col.r = mix(col.r, texture2D(tScene, uv + vec2(o, 0.0)).r, 0.85);
    col.b = mix(col.b, texture2D(tScene, uv - vec2(o, 0.0)).b, 0.85);
  }
#ifdef AO
  // Verdeckung dunkelt nur normal helle Flächen ab, Leuchtendes bleibt hell
  float occ = texture2D(tAO, uv).r;
  float lumC = dot(col, vec3(0.299, 0.587, 0.114));
  col *= mix(1.0, occ, uAO * (1.0 - smoothstep(1.2, 4.0, lumC)));
#endif
#ifdef BLOOM
  col += texture2D(tBloom, uv).rgb * uBloom;
#endif
  col = mix(col, uFlashColor, uFlash);
  col = toSRGB(aces(col * uExposure));
  // Color Grading pro Welt: Schatten/Lichter tönen, Sättigung, S-Kurve
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col *= mix(uShadowTint, uHighTint, smoothstep(0.05, 0.85, luma));
  col = clamp(mix(vec3(luma), col, uSat), 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
  col *= 1.0 - uVignette * dot(dir, dir) * 1.7;
  col += (hash2(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

// maxScale > 1 = Supersampling (Renderauflösung über der Bildschirmauflösung, gedeckelt durch dprCap)
export const QUALITY = {
  ultra: { bloom: true, bloomDiv: 2, levels: 5, taps: 8, msaa: 4, shadow: 4096, details: 1.35, maxScale: 2.0, ao: true },
  high: { bloom: true, bloomDiv: 2, levels: 4, taps: 6, msaa: 4, shadow: 2048, details: 1, maxScale: 1.5, ao: true },
  mid: { bloom: true, bloomDiv: 4, levels: 3, taps: 4, msaa: 2, shadow: 1024, details: 0.6, maxScale: 1.0, ao: false },
  low: { bloom: false, bloomDiv: 4, levels: 0, taps: 0, msaa: 0, shadow: 0, details: 0.3, maxScale: 1.0, ao: false },
};
const TIERS = ['low', 'mid', 'high', 'ultra'];

class AdaptiveResolution {
  constructor() {
    this.scale = 1;
    this.max = 1;
    this.min = 0.6;
    this.acc = 0;
    this.frames = 0;
    this.goodT = 0;
    this.badT = 0;
    this.ceiling = 1;
    this.ceilT = 0;
    this.raisedAgo = 99;
    this.lastAvg = 16.7;
    this.hold = 0;
    this.topT = 0;
  }

  // Kurze Aufwärmphase (z.B. nach Rennstart: Shader kompilieren) nicht mitmessen
  warmup(sec) {
    this.hold = sec;
    this.acc = 0;
    this.frames = 0;
  }

  // Liefert 'scale' bei Änderung, 'lower'/'raise' für die Qualitätsstufe, sonst null
  update(frameMs) {
    if (frameMs > 120) return null; // Tab im Hintergrund o.ä.
    if (this.hold > 0) {
      this.hold -= frameMs / 1000;
      return null;
    }
    this.acc += frameMs;
    this.frames++;
    if (this.acc < 500) return null;
    const avg = this.acc / this.frames;
    this.lastAvg = avg;
    this.acc = 0;
    this.frames = 0;
    this.raisedAgo += 0.5;
    if (this.ceilT > 0) this.ceilT -= 0.5;
    if (avg > 18.6) {
      this.goodT = 0;
      this.slowT = (this.slowT || 0) + 0.5;
      if (avg <= 26 && this.slowT < 1) return null;
      this.slowT = 0;
      if (this.scale > this.min + 1e-3) {
        const prev = this.scale;
        this.scale = Math.max(this.min, this.scale - (avg > 26 ? 0.12 : 0.06));
        if (this.raisedAgo < 4) {
          this.ceiling = prev - 0.02;
          this.ceilT = 25;
        }
        return 'scale';
      }
      this.badT += 0.5;
      if (this.badT >= 3) {
        this.badT = 0;
        return 'lower';
      }
    } else if (avg < 17.3) {
      this.badT = 0;
      this.slowT = 0;
      this.goodT += 0.5;
      const cap = Math.min(this.max, this.ceilT > 0 ? this.ceiling : this.max);
      if (this.goodT >= 3 && this.scale < cap - 1e-3) {
        this.scale = Math.min(cap, this.scale + (this.scale < 1 ? 0.05 : 0.1));
        this.goodT = 0;
        this.raisedAgo = 0;
        this.topT = 0;
        return 'scale';
      }
      // volle Auflösung und weiter Reserven: Grafikstufe wieder anheben
      if (this.scale >= cap - 1e-3) {
        this.topT += 0.5;
        if (this.topT >= 12) {
          this.topT = 0;
          return 'raise';
        }
      }
    } else {
      this.badT = 0;
      this.topT = 0;
    }
    return null;
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    gl.toneMapping = THREE.NoToneMapping;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl = gl;
    this.maxAniso = gl.capabilities.getMaxAnisotropy();
    this.listeners = new Set();
    const ext = gl.extensions;
    this.hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.rtType = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.maxSamples = gl.capabilities.maxSamples || 0;
    this.dprCap = 2.5;
    this.adaptive = new AdaptiveResolution();
    this.autoQuality = true;
    this.qualityName = 'high';
    this.q = QUALITY.high;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.fx = {
      speed: 0,
      glitch: 0,
      flash: 0,
      flashColor: new THREE.Color(1, 1, 1),
      bloom: 1.0,
      bloomThreshold: 1.0,
      exposure: 1.0,
      vignette: 0.35,
      time: 0,
      sat: 1.15,
      contrast: 0.25,
      sharpen: 0.4,
      shadowTint: new THREE.Color(1, 1, 1),
      highTint: new THREE.Color(1, 1, 1),
      chroma: 0,
    };

    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsScene = new THREE.Scene();
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(tri);
    this.quad.frustumCulled = false;
    this.fsScene.add(this.quad);

    const mk = (frag, uniforms, defines = {}) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
    this.mBright = mk(BRIGHT, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: this.hdr ? 1.0 : 0.72 } });
    this.mDown = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(UP, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mAO = mk(AO, {
      tDepth: { value: null },
      uFullTexel: { value: new THREE.Vector2() },
      uNear: { value: 0.3 },
      uFar: { value: 1000 },
      uP00: { value: 1 },
      uP11: { value: 1 },
      uProjScale: { value: 500 },
      uRadius: { value: 1.5 },
      uIntensity: { value: 2.1 },
      uBias: { value: 0.09 },
    });
    this.mAOBlur = mk(AO_BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.compUniforms = {
      tScene: { value: null },
      tBloom: { value: null },
      uBloom: { value: 1 },
      uSpeed: { value: 0 },
      uGlitch: { value: 0 },
      uTime: { value: 0 },
      uVignette: { value: 0.35 },
      uExposure: { value: 1 },
      uFlashColor: { value: new THREE.Color() },
      uFlash: { value: 0 },
      uSat: { value: 1.15 },
      uContrast: { value: 0.25 },
      uSharpen: { value: 0.4 },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uShadowTint: { value: new THREE.Color(1, 1, 1) },
      uHighTint: { value: new THREE.Color(1, 1, 1) },
      uChroma: { value: 0 },
      tAO: { value: null },
      uAO: { value: 0.85 },
    };
    this.mComp = null;
    this.rts = { scene: null, down: [], up: [], ao: [] };
    this.setQuality('high', true);
    this.resize();
  }

  // höchste sinnvolle Skalierung: Supersampling der Stufe, aber nie über dprCap
  _maxScale() {
    const base = Math.min(window.devicePixelRatio || 1, this.dprCap);
    return Math.max(1, Math.min(this.q.maxScale, this.dprCap / base));
  }

  setQuality(name, force = false) {
    if (!QUALITY[name]) name = 'high';
    if (!force && name === this.qualityName && this.mComp) return;
    this.qualityName = name;
    this.q = QUALITY[name];
    this.adaptive.max = this._maxScale();
    this.adaptive.scale = Math.min(this.adaptive.scale, this.adaptive.max);
    if (this.mComp) this.mComp.dispose();
    const defines = { TAPS: this.q.taps, SHARPEN: 1 };
    if (this.q.bloom) defines.BLOOM = 1;
    if (this.q.ao) defines.AO = 1;
    this.mComp = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: COMPOSITE,
      uniforms: this.compUniforms,
      defines,
      depthTest: false,
      depthWrite: false,
    });
    this._allocTargets();
    for (const fn of this.listeners) fn(this.q);
  }

  // Szenen reagieren auf Qualitätswechsel (Schatten, Details)
  onQuality(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  lowerQuality() {
    const now = performance.now();
    const i = TIERS.indexOf(this.qualityName);
    if (i <= 0) return;
    this.setQuality(TIERS[i - 1]);
    // kurz nach einem Hochstufen wieder zu langsam -> obere Stufe für diese Sitzung sperren
    if (this.raisedAt && now - this.raisedAt < 20000) this.tierCap = this.qualityName;
    this.adaptive.scale = Math.max(this.adaptive.scale, 0.8);
    this.resize();
  }

  raiseQuality() {
    const i = TIERS.indexOf(this.qualityName);
    const cap = TIERS.indexOf(this.tierCap || this.maxTier || 'high');
    if (i < 0 || i >= cap) return;
    this.setQuality(TIERS[i + 1]);
    this.raisedAt = performance.now();
    this.resize();
  }

  _disposeTargets() {
    if (this.rts.scene) {
      if (this.rts.scene.depthTexture) this.rts.scene.depthTexture.dispose();
      this.rts.scene.dispose();
    }
    for (const r of this.rts.down) r.dispose();
    for (const r of this.rts.up) r.dispose();
    for (const r of this.rts.ao) r.dispose();
    this.rts = { scene: null, down: [], up: [], ao: [] };
  }

  _allocTargets() {
    this._disposeTargets();
    const w = Math.max(1, this.width);
    const h = Math.max(1, this.height);
    const opts = {
      type: this.rtType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    };
    const samples = Math.min(this.q.msaa, this.maxSamples);
    this.rts.scene = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true, samples });
    if (this.q.ao) {
      // Tiefe als Textur (wird nach dem MSAA-Rendern mit aufgelöst) + zwei Puffer in halber Auflösung
      // 32-Bit-Gleitkomma-Tiefe: feine Stufen auch auf großen, flach angeschnittenen Flächen (sonst Streifen in der Verdeckung)
      this.rts.scene.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
      const aw = Math.max(1, w >> 1);
      const ah = Math.max(1, h >> 1);
      for (let i = 0; i < 2; i++) this.rts.ao.push(new THREE.WebGLRenderTarget(aw, ah, opts));
    }
    if (this.q.bloom) {
      let bw = Math.max(1, Math.round(w / this.q.bloomDiv));
      let bh = Math.max(1, Math.round(h / this.q.bloomDiv));
      for (let i = 0; i < this.q.levels; i++) {
        this.rts.down.push(new THREE.WebGLRenderTarget(bw, bh, opts));
        bw = Math.max(1, bw >> 1);
        bh = Math.max(1, bh >> 1);
      }
      for (let i = 0; i < this.q.levels - 1; i++) {
        const d = this.rts.down[i];
        this.rts.up.push(new THREE.WebGLRenderTarget(d.width, d.height, opts));
      }
    }
  }

  resize() {
    const cw = this.canvas.clientWidth || window.innerWidth;
    const ch = this.canvas.clientHeight || window.innerHeight;
    const base = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.adaptive.max = this._maxScale();
    const pr = Math.min(this.dprCap, Math.max(0.6, base * this.adaptive.scale));
    const w = Math.max(1, Math.floor(cw * pr));
    const h = Math.max(1, Math.floor(ch * pr));
    this.cssW = cw;
    this.cssH = ch;
    // Die Leinwand bleibt fest auf Geräteauflösung (max. 2×); die adaptive Renderskala ändert nur die internen
    // Puffer, der Kompositpass skaliert auf die Leinwand. So wird die Leinwand beim Nachregeln nicht geleert
    // (kein Aufblitzen auf Handys) und Supersampling wird im Shader herunterskaliert.
    const cpr = Math.min(2, base);
    const cwp = Math.max(1, Math.floor(cw * cpr));
    const chp = Math.max(1, Math.floor(ch * cpr));
    if (cwp !== this.canvasW || chp !== this.canvasH) {
      this.canvasW = cwp;
      this.canvasH = chp;
      this.gl.setPixelRatio(1);
      this.gl.setSize(cwp, chp, false);
    }
    if (w === this.width && h === this.height && pr === this.pixelRatio) return;
    this.pixelRatio = pr;
    this.width = w;
    this.height = h;
    this._allocTargets();
  }

  get aspect() {
    return (this.cssW || 1) / (this.cssH || 1);
  }

  // Wird pro gerendertem Frame mit der Frame-Dauer aufgerufen
  measure(frameMs) {
    const r = this.adaptive.update(frameMs);
    if (r === 'scale') this.resize();
    else if (r === 'lower' && this.autoQuality) this.lowerQuality();
    else if (r === 'raise' && this.autoQuality) this.raiseQuality();
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.fsScene, this.fsCam);
  }

  render(scene, camera) {
    const gl = this.gl;
    const fx = this.fx;
    gl.setRenderTarget(this.rts.scene);
    gl.render(scene, camera);

    let aoTex = null;
    if (this.q.ao && this.rts.ao.length && camera.isPerspectiveCamera) {
      const [a0, a1] = this.rts.ao;
      const U = this.mAO.uniforms;
      const pe = camera.projectionMatrix.elements;
      U.tDepth.value = this.rts.scene.depthTexture;
      U.uFullTexel.value.set(1 / this.width, 1 / this.height);
      U.uNear.value = camera.near;
      U.uFar.value = camera.far;
      U.uP00.value = pe[0];
      U.uP11.value = pe[5];
      U.uProjScale.value = this.height * pe[5] * 0.5;
      this._pass(this.mAO, a0);
      const B = this.mAOBlur.uniforms;
      B.tSrc.value = a0.texture;
      B.uDir.value.set(1 / a0.width, 0);
      this._pass(this.mAOBlur, a1);
      B.tSrc.value = a1.texture;
      B.uDir.value.set(0, 1 / a1.height);
      this._pass(this.mAOBlur, a0);
      aoTex = a0.texture;
    }

    let bloomTex = null;
    if (this.q.bloom && this.rts.down.length) {
      const d = this.rts.down;
      this.mBright.uniforms.uThreshold.value = this.hdr ? fx.bloomThreshold : Math.min(0.85, fx.bloomThreshold * 0.72);
      this.mBright.uniforms.tSrc.value = this.rts.scene.texture;
      this.mBright.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
      this._pass(this.mBright, d[0]);
      for (let i = 1; i < d.length; i++) {
        this.mDown.uniforms.tSrc.value = d[i - 1].texture;
        this.mDown.uniforms.uTexel.value.set(1 / d[i - 1].width, 1 / d[i - 1].height);
        this._pass(this.mDown, d[i]);
      }
      let src = d[d.length - 1];
      for (let i = d.length - 2; i >= 0; i--) {
        const dst = this.rts.up[i];
        this.mUp.uniforms.tSrc.value = src.texture;
        this.mUp.uniforms.tBase.value = d[i].texture;
        this.mUp.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this._pass(this.mUp, dst);
        src = dst;
      }
      bloomTex = src.texture;
    }

    const u = this.compUniforms;
    u.tScene.value = this.rts.scene.texture;
    u.tBloom.value = bloomTex;
    u.uBloom.value = fx.bloom * (this.hdr ? 0.9 : 1.2);
    u.uSpeed.value = fx.speed;
    u.uGlitch.value = fx.glitch;
    u.uTime.value = fx.time;
    u.uVignette.value = fx.vignette;
    u.uExposure.value = fx.exposure;
    u.uFlash.value = fx.flash;
    u.uFlashColor.value.copy(fx.flashColor);
    u.uSat.value = fx.sat;
    u.uContrast.value = fx.contrast;
    // bei abgesenkter Auflösung stärker nachschärfen
    u.uSharpen.value = fx.sharpen * (1 + Math.max(0, 1 - this.adaptive.scale) * 0.6);
    u.uTexel.value.set(1 / this.width, 1 / this.height);
    u.uShadowTint.value.copy(fx.shadowTint);
    u.uHighTint.value.copy(fx.highTint);
    u.uChroma.value = fx.chroma;
    u.tAO.value = aoTex;
    u.uAO.value = aoTex ? fx.ao ?? 0.85 : 0;
    this._pass(this.mComp, null);
  }
}
