// Utilidades puras do mapa da sede (sem DOM): geometria 2D, aleatoriedade determinística,
// superelipse dos estádios e retângulo de área mínima. Testáveis no Node.

/** Gerador pseudoaleatório determinístico (mesma sede sempre igual). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type P2 = [number, number];

/** Lista plana [x0, z0, x1, z1, ...] -> pontos. */
export function pts(flat: number[]): P2[] {
  const out: P2[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

export function area(p: P2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function centroid(p: P2[]): P2 {
  let x = 0, z = 0;
  for (const q of p) { x += q[0]; z += q[1]; }
  return [x / Math.max(1, p.length), z / Math.max(1, p.length)];
}

export function inside(pt: P2, poly: P2[]): boolean {
  const [x, y] = pt;
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[j], [x2, y2] = poly[i];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1 || 1e-9) + x1) c = !c;
  }
  return c;
}

function hull(p: P2[]): P2[] {
  const s = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [], up: P2[] = [];
  for (const q of s) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = s.length - 1; i >= 0; i--) { const q = s[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Retângulo de área mínima: centro, meia-largura (eixo longo), meia-altura e ângulo (rad) do eixo longo. */
export function minRect(p: P2[]): { cx: number; cz: number; hw: number; hh: number; ang: number } {
  const h = hull(p);
  let best = { a: Infinity, ang: 0, cu: 0, cv: 0, hw: 1, hh: 1 };
  for (let i = 0; i < h.length; i++) {
    const a = h[(i + h.length - 1) % h.length], b = h[i];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(ang), s = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of h) {
      const u = q[0] * c + q[1] * s, v = -q[0] * s + q[1] * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const ar = (u1 - u0) * (v1 - v0);
    if (ar < best.a) best = { a: ar, ang, cu: (u0 + u1) / 2, cv: (v0 + v1) / 2, hw: (u1 - u0) / 2, hh: (v1 - v0) / 2 };
  }
  let { ang, hw, hh } = best;
  const c = Math.cos(ang), s = Math.sin(ang);
  const cx = best.cu * c - best.cv * s, cz = best.cu * s + best.cv * c;
  if (hh > hw) { [hw, hh] = [hh, hw]; ang += Math.PI / 2; }
  return { cx, cz, hw, hh, ang };
}

/** Ponto da superelipse |x/a|^n + |z/b|^n = 1 no parâmetro t (t = 0 no eixo +x). */
export function superEllipse(t: number, a: number, b: number, n: number): P2 {
  const c = Math.cos(t), s = Math.sin(t), e = 2 / n;
  return [a * Math.sign(c) * Math.abs(c) ** e, b * Math.sign(s) * Math.abs(s) ** e];
}

/** Ruído de valor suave 2D (relevo leve). */
export function noise2(seed: number) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

/** Distância de um ponto a um segmento. */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
