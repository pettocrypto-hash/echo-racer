// Geometrie-Baukasten: sammelt flach schattierte Teile mit Vertexfarben in EINER BufferGeometry
// (wenige Draw-Calls = gut fürs Handy).

import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();

export class GeoBuilder {
  constructor(withUV = false, withPbr = false) {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = withUV ? [] : null;
    // optional pro Vertex: [Rauheit, Metall] – Zuordnung über die Farbe (pbrMap)
    this.pbr = withPbr ? [] : null;
    this.pbrMap = null;
    this.pbrDefault = [0.5, 0];
    // dazu die Materialklasse für die Feinstruktur (3. Wert eines pbrMap-Eintrags, sonst 0)
    this.mat = withPbr ? [] : null;
  }

  _pbrFor(color) {
    if (!this.pbr) return null;
    if (typeof color === 'string' && this.pbrMap && this.pbrMap[color]) return this.pbrMap[color];
    return this.pbrDefault;
  }

  get count() {
    return this.pos.length / 3;
  }

  _color(color, k) {
    _c.set(color);
    return [_c.r * k, _c.g * k, _c.b * k];
  }

  tri(a, b, c, color, k = 1, uva, uvb, uvc, pbr) {
    const col = Array.isArray(color) ? color : this._color(color, k);
    if (this.pbr) {
      const m = pbr || this._pbrFor(color);
      this.pbr.push(m[0], m[1], m[0], m[1], m[0], m[1]);
      const cls = m[2] || 0;
      this.mat.push(cls, cls, cls);
    }
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b).normalize();
    for (const v of [a, b, c]) {
      this.pos.push(v[0], v[1], v[2]);
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(col[0], col[1], col[2]);
    }
    if (this.uv) {
      const z = [0.01, 0.01];
      const A = uva || z;
      const B = uvb || z;
      const C = uvc || z;
      this.uv.push(A[0], A[1], B[0], B[1], C[0], C[1]);
    }
  }

  quad(a, b, c, d, color, k = 1, uvs) {
    const col = this._color(color, k);
    const m = this._pbrFor(color);
    this.tri(a, b, c, col, 1, uvs && uvs[0], uvs && uvs[1], uvs && uvs[2], m);
    this.tri(a, c, d, col, 1, uvs && uvs[0], uvs && uvs[2], uvs && uvs[3], m);
  }

  // 8 Ecken: unten (0:-x-z, 1:+x-z, 2:+x+z, 3:-x+z), oben (4..7 gleiche Reihenfolge)
  hexa(c, color, k = 1, opts = {}) {
    const f = (i0, i1, i2, i3, skip) => {
      if (!skip) this.quad(c[i0], c[i1], c[i2], c[i3], color, k);
    };
    f(4, 7, 6, 5);
    f(0, 1, 2, 3, opts.noBottom);
    f(3, 2, 6, 7);
    f(1, 0, 4, 5);
    f(2, 1, 5, 6);
    f(0, 3, 7, 4);
  }

  // Verjüngbarer Block: unten Breite wb (halb), z von zb0..zb1; oben Breite wt, z von zt0..zt1
  shape({ wb, wt = wb, y0, y1, zb0, zb1, zt0 = zb0, zt1 = zb1, x = 0 }, color, k = 1, opts) {
    this.hexa(
      [
        [x - wb, y0, zb0],
        [x + wb, y0, zb0],
        [x + wb, y0, zb1],
        [x - wb, y0, zb1],
        [x - wt, y1, zt0],
        [x + wt, y1, zt0],
        [x + wt, y1, zt1],
        [x - wt, y1, zt1],
      ],
      color,
      k,
      opts
    );
  }

  box(cx, cy, cz, sx, sy, sz, color, k = 1, rotY = 0) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const cs = Math.cos(rotY);
    const sn = Math.sin(rotY);
    const P = (x, y, z) => [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
    this.hexa(
      [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz)],
      color,
      k
    );
  }

  // Block mit Welt-skalierten UVs (für Fenstertexturen an Hochhäusern)
  uvBox(cx, cy, cz, sx, sy, sz, color, uS, vS) {
    const hx = sx / 2;
    const hz = sz / 2;
    const y0 = cy - sy / 2;
    const y1 = cy + sy / 2;
    const v1 = sy / vS;
    const face = (x0, z0, x1, z1, len) => {
      const u1 = len / uS;
      this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], color, 1, [
        [0.03, 0],
        [u1, 0],
        [u1, v1],
        [0.03, v1],
      ]);
    };
    face(cx - hx, cz + hz, cx + hx, cz + hz, sx);
    face(cx + hx, cz - hz, cx - hx, cz - hz, sx);
    face(cx + hx, cz + hz, cx + hx, cz - hz, sz);
    face(cx - hx, cz - hz, cx - hx, cz + hz, sz);
    this.quad([cx - hx, y1, cz - hz], [cx - hx, y1, cz + hz], [cx + hx, y1, cz + hz], [cx + hx, y1, cz - hz], color);
  }

  // Beliebige THREE-Geometrie transformiert anhängen (flach schattiert, oder mit smooth: glatte Rundungen)
  add(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color = '#ffffff', k = 1, smooth = false } = {}) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    let g;
    if (smooth) {
      // Original-Normalen behalten (Normalenmatrix), erst danach entindizieren
      g = geo.clone();
      g.applyMatrix4(_m);
      if (g.index) {
        const ni = g.toNonIndexed();
        g.dispose();
        g = ni;
      }
    } else {
      g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(_m);
      g.computeVertexNormals();
    }
    const P = g.attributes.position.array;
    const N = g.attributes.normal.array;
    const col = Array.isArray(color) ? color : this._color(color, k);
    const m = this._pbrFor(color);
    for (let i = 0; i < P.length; i += 3) {
      this.pos.push(P[i], P[i + 1], P[i + 2]);
      this.nor.push(N[i], N[i + 1], N[i + 2]);
      this.col.push(col[0], col[1], col[2]);
      if (this.uv) this.uv.push(0.01, 0.01);
      if (this.pbr) {
        this.pbr.push(m[0], m[1]);
        this.mat.push(m[2] || 0);
      }
    }
    g.dispose();
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.pbr) {
      g.setAttribute('pbr', new THREE.Float32BufferAttribute(this.pbr, 2));
      g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 1));
    }
    g.computeBoundingSphere();
    return g;
  }
}

export const BASIC = {
  ico: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  octa: new THREE.OctahedronGeometry(1, 0),
  dodeca: new THREE.DodecahedronGeometry(1, 0),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6, 1),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8, 1),
  cyl12: new THREE.CylinderGeometry(1, 1, 1, 14, 1),
  cyl24: new THREE.CylinderGeometry(1, 1, 1, 28, 1),
  sphere: new THREE.SphereGeometry(1, 18, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone5: new THREE.ConeGeometry(1, 1, 5, 1),
  cone7: new THREE.ConeGeometry(1, 1, 7, 1),
  tet: new THREE.TetrahedronGeometry(1, 0),
};
