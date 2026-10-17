// Gerador procedural de estádios (three.js) a partir de src/data/stadiumModels.json.
// Cada estádio é descrito por parâmetros (planta em superelipse, anéis de arquibancada,
// cobertura, fachada, cores das cadeiras) e ajustado ao contorno real do prédio no OSM.
// Tudo é construído em metros; quem chama aplica a escala da cena.
//
// As texturas vêm de uma fábrica injetada (canvas no navegador, nada nos testes do Node).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import modelsJson from "../../data/stadiumModels.json";
import { rng, superEllipse, minRect, pts, type P2 } from "./geo";
import type { StadiumLook } from "../../engine/types";

export interface TierSpec {
  rise: number; depth: number; base?: number; gap?: number; lift?: number;
  seats: string[]; pattern?: "solid" | "mosaic" | "sectors" | "bands"; boxes?: boolean;
}
export interface RoofSpec {
  type: "ring" | "box" | "canopy" | "petals" | "none";
  cover: number; height: number; drop?: number; color: string; opacity?: number;
  ribs?: number; ribColor?: string; innerRing?: boolean; cables?: boolean;
  side?: number; span?: number; retractable?: boolean;
}
export interface FacadeSpec {
  type: "columns" | "frame" | "ribbons" | "waves" | "cantilever" | "glass" | "panels" | "membrane" | "classic" | "plain";
  color: string; color2?: string; count?: number; lean?: number; fork?: boolean;
}
export interface StadiumModel {
  key?: string;
  name: string; aliases?: string[]; clubs?: string[]; lat?: number; lon?: number;
  plan: "oval" | "rect"; n: number; inner: [number, number];
  tiers: TierSpec[]; sides?: [number, number, number, number]; open?: [number, number][];
  roof?: RoofSpec; facade: FacadeSpec; arches?: { color: string; height: number; width: number };
  /** desnível do terreno em volta (inclinação m/m e direção da subida em graus: 0 = leste, 90 = sul) */
  terrain?: { slope: number; dir: number };
  /** telão na fachada (Neo Química): lado em graus, abertura, altura e base (m) */
  screen?: { side: number; span: number; height: number; base: number };
  ramps?: number; lights?: "roof" | "rim" | "towers"; screens?: number;
  plaza?: string; plazaR?: number; track?: string; turf?: "natural" | "synthetic"; note?: string;
}
/** Contorno real do estádio no OSM (scripts/fetch_club_sites.py). */
export interface GeoBowl { rect: [number, number, number, number, number]; h: number; outline: number[]; fill: number }

export const STADIUM_MODELS: Record<string, StadiumModel> = (modelsJson as unknown as { models: Record<string, StadiumModel> }).models;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Modelo marcante do clube (pelo id do clube ou pelo nome do estádio). */
export function findModel(clubId: string, stadiumName?: string): StadiumModel | null {
  for (const [k, m] of Object.entries(STADIUM_MODELS)) if (m.clubs?.includes(clubId)) return { ...m, key: k };
  if (stadiumName) {
    const s = norm(stadiumName);
    for (const [k, m] of Object.entries(STADIUM_MODELS)) if (m.aliases?.some((a) => s === a || s.includes(a))) return { ...m, key: k };
  }
  return null;
}

/**
 * Personalização do estádio feita pelo clube (cores das cadeiras, cobertura, fachada, nome e
 * reformas). Só descreve o que muda; applyCustom devolve um modelo novo, sem mexer no original.
 */
export interface StadiumCustom extends StadiumLook {
  /** nome comercial (naming rights) */
  name?: string;
}

export function applyCustom(m: StadiumModel, c?: StadiumCustom | null): StadiumModel {
  if (!c) return m;
  const out: StadiumModel = { ...m, tiers: m.tiers.map((t) => ({ ...t })) };
  if (c.name) out.name = c.name;
  if (c.seats?.length) for (const t of out.tiers) { t.seats = [...c.seats]; if (c.pattern) t.pattern = c.pattern; }
  if (c.extraTier) {
    const top = out.tiers[out.tiers.length - 1];
    out.tiers.push({ gap: -2, lift: 4, rise: Math.max(8, top.rise * 0.5), depth: Math.max(12, top.depth * 0.45), seats: [...top.seats], pattern: top.pattern, boxes: true });
  }
  if (c.roof) {
    const top = out.tiers.reduce((s, t) => s + t.rise + (t.lift ?? 0), out.tiers[0].base ?? 1.2);
    const depth = out.tiers.reduce((s, t) => s + t.depth + (t.gap ?? 0), 0);
    const base = out.roof && out.roof.type !== "none" ? out.roof : { type: "ring" as const, cover: depth * 0.85, height: top + 8, drop: 2, color: "#f2f3f4", ribs: 48, ribColor: "#b9bec4", innerRing: true };
    out.roof = { ...base, type: c.roof.type, color: c.roof.color ?? base.color, opacity: c.roof.opacity ?? base.opacity,
      height: Math.max(base.height, top + 6), cover: c.roof.type === "canopy" ? Math.min(base.cover, depth * 0.5) : base.cover, side: base.side ?? 90, span: base.span ?? 120 };
  }
  if (c.facade) out.facade = { ...out.facade, ...Object.fromEntries(Object.entries(c.facade).filter(([, v]) => v !== undefined)) };
  if (c.screens !== undefined) out.screens = c.screens;
  return out;
}

/** Estádio genérico (clubes sem modelo): tamanho pelo contorno do OSM, detalhes pelo nível do estádio. */
export function genericModel(colors: [string, string], lv: number, bowl?: GeoBowl | null): StadiumModel {
  const hw = bowl ? Math.max(70, Math.min(150, bowl.rect[2])) : 74 + lv * 6;
  const hh = bowl ? Math.max(52, Math.min(125, bowl.rect[3])) : 56 + lv * 5;
  const rect = bowl ? bowl.fill > 0.86 : lv < 4;
  const room = Math.max(10, Math.min(hw - 58, hh - 40));
  const two = room > 34 || lv >= 4;
  const inner: [number, number] = [hw - room, hh - room];
  const d = room - 1.5;
  const seats = [colors[0], colors[1]];
  const tiers: TierSpec[] = two
    ? [{ rise: d * 0.22, depth: d * 0.42, base: 1.4, seats, pattern: "sectors" }, { gap: -1, lift: 2.5, rise: d * 0.32, depth: d * 0.58, seats, pattern: "sectors", boxes: lv >= 4 }]
    : [{ rise: d * 0.42, depth: d, base: 1.4, seats, pattern: "sectors" }];
  const top = tiers.reduce((s, t) => s + t.rise + (t.lift ?? 0), 1.4);
  return {
    key: "generico", name: "Estádio", plan: rect ? "rect" : "oval", n: rect ? 5 : 2.2, inner, tiers,
    roof: lv >= 5 ? { type: "ring", cover: d * 0.8, height: top + 7, drop: 1.5, color: "#eef0f2", opacity: 0.95, ribs: 40, ribColor: "#a0a6ad", innerRing: true }
      : lv >= 2 ? { type: "canopy", side: 90, span: lv >= 4 ? 140 : 80, cover: d * 0.6, height: top + 5, drop: 1, color: "#e9ebee", opacity: 1, ribs: 12, ribColor: "#8c9196" }
      : { type: "none", cover: 0, height: 0, color: "#ffffff" },
    facade: { type: lv >= 4 ? "panels" : "plain", color: "#d8d4cb", color2: colors[0], count: 80 },
    lights: lv >= 4 ? "roof" : "towers", screens: lv >= 3 ? 1 : 0, plaza: "#aaa59b", plazaR: 8,
  };
}

export type TexFactory = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: boolean) => THREE.Texture | null;

export interface StadiumBuildOpts {
  q: number;              // qualidade 1-5 (Estrutura do clube)
  night: boolean;
  matchDay: boolean;
  colors: [string, string];
  stadiumLv: number;
  tex: TexFactory;
  mat: (p: THREE.MeshStandardMaterialParameters) => THREE.Material;
}

interface Sample { t: number; f: number; open: boolean }
interface TierRing { r0: number; y0: number; r1: number; y1: number; under: number }

/** Monta uma malha "loft": anéis de pontos (mesmo número de amostras) ligados por quads. */
function loft(rings: THREE.Vector3[][], segOn: boolean[], closed: boolean, uLen = 8, vRep = 1, flip = false): THREE.BufferGeometry {
  const N = rings[0].length;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  // u ao longo do perímetro em metros (/uLen), v ao longo dos anéis
  const per: number[] = [0];
  for (let i = 1; i <= N; i++) {
    const a = rings[rings.length - 1][(i - 1) % N], b = rings[rings.length - 1][i % N];
    per.push(per[i - 1] + a.distanceTo(b));
  }
  const cols = closed ? N + 1 : N;
  for (let j = 0; j < rings.length; j++) {
    for (let i = 0; i < cols; i++) {
      const p = rings[j][i % N];
      pos.push(p.x, p.y, p.z);
      uv.push(per[i] / uLen, (j / (rings.length - 1)) * vRep);
    }
  }
  for (let j = 0; j + 1 < rings.length; j++) {
    for (let i = 0; i < cols - 1; i++) {
      if (!segOn[i % N]) continue;
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const C = (c: string) => new THREE.Color(c);

/** Furo com a orientação oposta à do contorno (o earcut do three exige). */
function oppositeHole(shape: THREE.Shape, hole: THREE.Vector2[]): THREE.Path {
  const cw = THREE.ShapeUtils.isClockWise(shape.getPoints());
  const hcw = THREE.ShapeUtils.isClockWise(hole);
  return new THREE.Path(cw === hcw ? [...hole].reverse() : hole);
}

/** Constrói o estádio (Group em metros, origem no centro do campo, eixo longo em +x). */
export function buildStadium(m: StadiumModel, o: StadiumBuildOpts): { group: THREE.Group; topY: number; outer: [number, number] } {
  const g = new THREE.Group();
  const { q, tex, mat } = o;
  const N = q >= 4 ? 256 : q >= 2 ? 192 : 144;
  const [A, B] = m.inner;
  const n = m.n;
  const sides = m.sides ?? [1, 1, 1, 1];
  const inOpen = (deg: number) => (m.open ?? []).some(([a, b]) => {
    const d = ((deg % 360) + 360) % 360;
    const a2 = ((a % 360) + 360) % 360, b2 = ((b % 360) + 360) % 360;
    return a2 <= b2 ? d >= a2 && d <= b2 : d >= a2 || d <= b2;
  });
  const S: Sample[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const f = c * c * (c >= 0 ? sides[0] : sides[2]) + s * s * (s >= 0 ? sides[1] : sides[3]);
    S.push({ t, f, open: inOpen((t * 180) / Math.PI) });
  }
  // segmento i liga a amostra i à i+1: só existe se as duas pontas tiverem arquibancada
  const segOn = S.map((s, i) => !s.open && !S[(i + 1) % N].open);
  const at = (i: number, d: number, y: number) => {
    const [x, z] = superEllipse(S[i].t, A + d, B + d, n);
    return new THREE.Vector3(x, y, z);
  };

  // ---------------- anéis de arquibancada
  const rings: TierRing[][] = [];
  m.tiers.forEach((t, k) => {
    const row: TierRing[] = [];
    for (let i = 0; i < N; i++) {
      const f = m.tiers.length === 1 || k > 0 ? S[i].f : 1;
      const prev = k > 0 ? rings[k - 1][i] : null;
      const r0 = prev ? prev.r1 + (t.gap ?? 0) : 0;
      const y0 = prev ? prev.y1 + (t.lift ?? 0) : (t.base ?? 1.2);
      // altura da arquibancada de baixo no ponto onde a frente deste anel cai (balanço)
      let under = 0;
      if (prev) {
        const k2 = Math.max(0, Math.min(1, (r0 - prev.r0) / Math.max(0.1, prev.r1 - prev.r0)));
        under = r0 >= prev.r1 ? prev.y1 : prev.y0 + (prev.y1 - prev.y0) * k2;
      }
      row.push({ r0, y0, r1: r0 + t.depth * f, y1: y0 + t.rise * f, under });
    }
    rings.push(row);
  });
  const last = rings[rings.length - 1];
  const outR = last.map((_, i) => Math.max(...rings.map((rr) => rr[i].r1)) + 1.5);
  const topY = last.map((r) => r.y1 + 1.2);
  const roof = m.roof && m.roof.type !== "none" ? m.roof : null;
  const fullRoof = roof && roof.type !== "canopy";
  const facadeH = topY.map((y) => (fullRoof ? Math.max(y, roof!.height - 0.5) : y));
  const maxTop = Math.max(...facadeH);

  // ---------------- texturas
  const hiTex = q >= 3;
  const seatTex = (t: TierSpec, k: number) => {
    const W = hiTex ? 2048 : 1024, rows = Math.max(16, Math.round(t.depth / 0.85)), H = Math.min(256, rows * (hiTex ? 4 : 2));
    const r = rng(k * 977 + t.seats.length * 31 + W);
    return tex(W, H, (x) => {
      const pal = t.seats.map(C);
      const pick = (u: number, v: number) => {
        switch (t.pattern) {
          case "mosaic": return t.seats[Math.floor(r() * t.seats.length)];
          case "sectors": return t.seats[Math.floor((u / W) * 18) % t.seats.length];
          case "bands": return t.seats[Math.min(t.seats.length - 1, Math.floor((v / H) * t.seats.length))];
          default: return r() < 0.06 && t.seats.length > 1 ? t.seats[1] : t.seats[0];
        }
      };
      void pal;
      const cw = hiTex ? 2 : 1, rh = H / rows;
      if (t.pattern === "mosaic") {
        for (let y = 0; y < H; y += rh) for (let u = 0; u < W; u += cw) { x.fillStyle = pick(u, y); x.fillRect(u, y, cw, rh); }
      } else if (t.pattern === "sectors" || t.pattern === "bands") {
        const step = t.pattern === "bands" ? W : W / 18;
        for (let u = 0; u < W; u += step) for (let y = 0; y < H; y += rh) { x.fillStyle = pick(u, y); x.fillRect(u, y, step, rh); }
      } else {
        x.fillStyle = t.seats[0]; x.fillRect(0, 0, W, H);
        if (t.seats[1]) for (let i = 0; i < W * 0.6; i++) { x.fillStyle = t.seats[1]; x.fillRect(Math.floor(r() * W), Math.floor(r() * rows) * rh, cw, rh); }
      }
      // torcida no dia de jogo (pontos coloridos sobre as cadeiras)
      if (o.matchDay) {
        const cc = [o.colors[0], o.colors[1], "#e9d6c0", "#3a2a20", o.colors[0]];
        for (let i = 0; i < W * rows * 0.55; i++) { x.fillStyle = cc[Math.floor(r() * cc.length)]; x.fillRect(Math.floor(r() * W), Math.floor(r() * rows) * rh, cw, rh * 0.75); }
      }
      // degraus: sombra do espelho de cada fileira
      for (let y = 0; y < rows; y++) { x.fillStyle = "rgba(0,0,0,0.38)"; x.fillRect(0, y * rh + rh * 0.62, W, rh * 0.38); }
      // escadas e vomitórios
      for (let u = 0; u < W; u += W / 64) { x.fillStyle = "rgba(205,205,200,0.85)"; x.fillRect(u, 0, cw, H); }
      for (let u = W / 48; u < W; u += W / 24) { x.fillStyle = "#1a1c20"; x.fillRect(u - 6, H * 0.45, 12, rh * 3); }
    });
  };
  const concrete = mat({ color: 0xc9c6bf, roughness: 0.92, side: THREE.DoubleSide });
  const darkConcrete = mat({ color: 0x8a8781, roughness: 0.95 });

  // ---------------- arquibancadas
  m.tiers.forEach((t, k) => {
    const row = rings[k];
    const front = row.map((r, i) => at(i, r.r0, r.y0));
    const back = row.map((r, i) => at(i, r.r1, r.y1));
    const steps = q >= 3 ? 6 : 3; // subdivide (sombras mais suaves)
    const lines: THREE.Vector3[][] = [];
    for (let s = 0; s <= steps; s++) lines.push(front.map((p, i) => p.clone().lerp(back[i], s / steps)));
    const st = seatTex(t, k);
    const geo = loft(lines, segOn, true, 1, 1, true);
    // u em [0, 1] ao longo do perímetro (a textura cobre o anel inteiro)
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    let maxU = 0;
    for (let i = 0; i < uv.count; i++) maxU = Math.max(maxU, uv.getX(i));
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) / maxU);
    const sm = mat({ color: st ? 0xffffff : C(t.seats[0]).getHex(), map: st ?? undefined, roughness: 0.85, side: THREE.DoubleSide });
    const me = new THREE.Mesh(geo, sm);
    me.castShadow = true; me.receiveShadow = true;
    g.add(me);
    // espelho frontal (muro do campo ou faixa de camarotes)
    const bottom = row.map((r, i) => at(i, r.r0, k === 0 ? 0 : r.under));
    const wallTex = t.boxes || k > 0 ? tex(512, 32, (x) => {
      x.fillStyle = "#3b4048"; x.fillRect(0, 0, 512, 32);
      for (let u = 0; u < 512; u += 8) { x.fillStyle = o.night ? "#ffd98a" : "#1d2733"; x.fillRect(u + 1, 8, 6, 18); x.fillStyle = "rgba(255,255,255,0.18)"; x.fillRect(u + 1, 8, 2, 18); }
      x.fillStyle = "#d9d6cf"; x.fillRect(0, 0, 512, 4); x.fillRect(0, 28, 512, 4);
    }, true) : null;
    if (wallTex) wallTex.repeat.set(1 / 64, 1);
    const wg = loft([bottom, front], segOn, true, 1, 1, true);
    const wm = wallTex ? mat({ color: 0xffffff, map: wallTex, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }) : concrete;
    const wmesh = new THREE.Mesh(wg, wm); wmesh.receiveShadow = true; wmesh.castShadow = true;
    g.add(wmesh);
  });

  // ---------------- borda de cima e fachada
  const rimIn = last.map((r, i) => at(i, r.r1, r.y1));
  const rimOut = last.map((r, i) => at(i, outR[i], r.y1 + 0.2));
  const rim = new THREE.Mesh(loft([rimIn, rimOut], segOn, true, 8, 1, true), concrete); rim.receiveShadow = true; g.add(rim);
  const parapetTop = last.map((_, i) => at(i, outR[i], facadeH[i]));
  const fac = m.facade;
  const fc = fac.color, fc2 = fac.color2 ?? "#555a60";
  const facadeTex = tex(512, 256, (x) => {
    const W = 512, H = 256, r = rng(fac.type.length * 7);
    x.fillStyle = fc; x.fillRect(0, 0, W, H);
    switch (fac.type) {
      case "columns": case "frame": {
        // vãos escuros entre pilares + vigas horizontais (concreto aparente)
        const cols = 8;
        for (let i = 0; i < cols; i++) {
          x.fillStyle = fac.type === "frame" ? "#2c2f34" : "#6a665f"; x.fillRect(i * (W / cols) + (fac.type === "frame" ? 10 : 22), 20, W / cols - (fac.type === "frame" ? 20 : 44), H - 40);
          if (fac.type === "frame") for (const yy of [H * 0.33, H * 0.62]) { x.fillStyle = fc; x.fillRect(i * (W / cols), yy, W / cols, 14); }
          x.fillStyle = fc2; x.fillRect(i * (W / cols) + 10, H - 40, W / cols - 20, 6);
        }
        x.fillStyle = "rgba(0,0,0,0.12)"; for (let i = 0; i < cols; i++) x.fillRect(i * (W / cols) + 4, 0, 6, H);
        break;
      }
      case "ribbons": {
        const k = fac.count ?? 8, bh = H / k;
        for (let i = 0; i < k; i++) { x.fillStyle = fc2; x.fillRect(0, i * bh + bh * 0.62, W, bh * 0.38); }
        x.fillStyle = "rgba(255,255,255,0.25)"; for (let i = 0; i < k; i++) x.fillRect(0, i * bh, W, 3);
        break;
      }
      case "cantilever": {
        // Morumbis (Vilanova Artigas): base monumental de concreto aparente canelado, vão escuro
        // recuado da circulação sob o grande balanço com vigas radiais aparentes, e borda branca
        // superior com o friso tricolor (vermelho, branco e preto) e janelas iluminadas dos camarotes
        x.fillStyle = "#cfc9be"; x.fillRect(0, 0, W, H);
        // textura vertical de concreto aparente (fôrmas de madeira)
        for (let u = 0; u < W; u += 4) {
          x.fillStyle = (u / 4) % 2 === 0 ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.03)";
          x.fillRect(u, 0, 2, H);
        }
        // galeria escura sob o balanço do anel superior
        x.fillStyle = "#26282c"; x.fillRect(0, H * 0.28, W, H * 0.36);
        // vigas protendidas inclinadas do balanço (marca registrada do Morumbi)
        for (let i = 0; i < 16; i++) {
          const bx = i * (W / 16);
          x.fillStyle = "#b5afa4"; x.fillRect(bx + 6, H * 0.28, 10, H * 0.56);
          x.fillStyle = "rgba(0,0,0,0.22)"; x.fillRect(bx + 16, H * 0.28, 4, H * 0.56);
        }
        // faixa contínua de camarotes/vidros no meio do balanço
        for (let i = 0; i < 32; i++) {
          x.fillStyle = o.night ? "#ffe094" : "#3a5068";
          x.fillRect(i * (W / 32) + 2, H * 0.44, W / 32 - 4, H * 0.11);
        }
        // testeira superior branca em balanço + friso tricolor do SPFC
        x.fillStyle = "#f5f4ef"; x.fillRect(0, 0, W, H * 0.28);
        x.fillStyle = fc2; x.fillRect(0, 0, W, 11); // vermelho no topo
        x.fillStyle = "#ffffff"; x.fillRect(0, 11, W, 5);
        x.fillStyle = "#141414"; x.fillRect(0, 16, W, 6);
        x.fillStyle = fc2; x.fillRect(0, H * 0.24, W, 8); // friso vermelho inferior da testeira
        x.fillStyle = "rgba(0,0,0,0.18)"; x.fillRect(0, H * 0.28 - 4, W, 4);
        // vitrine do Concept Hall / portões no térreo
        for (let i = 0; i < 24; i++) {
          x.fillStyle = o.night ? "#ffd98a" : "#435361";
          x.fillRect(i * (W / 24) + 4, H * 0.75, W / 24 - 8, H * 0.14);
        }
        break;
      }
      case "waves": {
        // lâminas brancas onduladas sobre fundo escuro (Allianz Parque)
        x.fillStyle = fc2; x.fillRect(0, 0, W, H);
        const k = fac.count ?? 7, bh = H / k;
        for (let i = 0; i < k; i++) {
          x.fillStyle = fc; x.beginPath();
          for (let u = 0; u <= W; u += 8) x.lineTo(u, i * bh + bh * 0.2 + Math.sin((u / W) * Math.PI * 4 + i * 0.9) * bh * 0.18);
          for (let u = W; u >= 0; u -= 8) x.lineTo(u, i * bh + bh * 0.78 + Math.sin((u / W) * Math.PI * 4 + i * 0.9 + 0.6) * bh * 0.18);
          x.closePath(); x.fill();
        }
        break;
      }
      case "glass": {
        for (let yy = 0; yy < H; yy += 32) for (let xx = 0; xx < W; xx += 32) {
          const l = 0.85 + r() * 0.3;
          x.fillStyle = `rgba(${Math.round(150 * l)},${Math.round(180 * l)},${Math.round(205 * l)},1)`; x.fillRect(xx + 2, yy + 2, 28, 28);
          if (o.night && r() < 0.5) { x.fillStyle = "rgba(255,226,150,0.85)"; x.fillRect(xx + 2, yy + 2, 28, 28); }
        }
        x.fillStyle = fc2; for (let yy = 0; yy < H; yy += 32) x.fillRect(0, yy, W, 2); for (let xx = 0; xx < W; xx += 32) x.fillRect(xx, 0, 2, H);
        break;
      }
      case "panels": {
        let xx = 0;
        while (xx < W) { const w = 4 + Math.floor(r() * 10); x.fillStyle = r() < 0.5 ? fc2 : fc; x.fillRect(xx, 0, w, H); xx += w + 2; }
        x.fillStyle = "rgba(0,0,0,0.25)"; x.fillRect(0, H - 30, W, 30);
        break;
      }
      case "membrane": {
        const k = 6;
        for (let i = 0; i < k; i++) {
          const gx = x.createLinearGradient(i * (W / k), 0, (i + 1) * (W / k), 0);
          gx.addColorStop(0, "rgba(0,0,0,0.18)"); gx.addColorStop(0.5, "rgba(255,255,255,0.12)"); gx.addColorStop(1, "rgba(0,0,0,0.18)");
          x.fillStyle = gx; x.fillRect(i * (W / k), 0, W / k, H);
          x.strokeStyle = fc2; x.lineWidth = 3; x.beginPath(); x.moveTo(i * (W / k), H); x.quadraticCurveTo((i + 0.5) * (W / k), H * 0.2, (i + 1) * (W / k), H); x.stroke();
        }
        break;
      }
      case "classic": {
        x.fillStyle = fc2; x.fillRect(0, 0, W, 14); x.fillRect(0, H - 22, W, 22);
        for (let i = 0; i < 6; i++) {
          const cx = (i + 0.5) * (W / 6);
          x.fillStyle = o.night ? "#e8c070" : "#30353c";
          x.beginPath(); x.moveTo(cx - 22, H - 40); x.lineTo(cx - 22, 90); x.arc(cx, 90, 22, Math.PI, 0); x.lineTo(cx + 22, H - 40); x.closePath(); x.fill();
          x.fillStyle = "rgba(255,255,255,0.5)"; x.fillRect(cx - 34, 30, 4, H - 60); x.fillRect(cx + 30, 30, 4, H - 60);
        }
        break;
      }
      default: {
        x.fillStyle = fc2; x.fillRect(0, 0, W, 18);
        for (let i = 0; i < 2000; i++) { x.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"; x.fillRect(r() * W, r() * H, 3, 3); }
        for (let i = 0; i < 8; i++) { x.fillStyle = "#3a3d42"; x.fillRect(i * 64 + 26, H - 60, 14, 60); }
      }
    }
  }, true);
  if (facadeTex) facadeTex.repeat.set(1, 1);
  const facadeGround = last.map((_, i) => at(i, outR[i], 0));
  const fg = loft([facadeGround, parapetTop], segOn, true, fac.type === "glass" ? 18 : 30, 1);
  const glassy = fac.type === "glass";
  const fm = mat({ color: facadeTex ? 0xffffff : C(fc).getHex(), map: facadeTex ?? undefined, roughness: glassy ? 0.18 : 0.72, metalness: glassy ? 0.55 : 0.08, side: THREE.DoubleSide });
  const fmesh = new THREE.Mesh(fg, fm); fmesh.castShadow = true; fmesh.receiveShadow = true; g.add(fmesh);
  // No Morumbis (cantilever): anel saliente em balanço com friso vermelho + 72 vigas radiais + letreiro MORUMBIS
  if (fac.type === "cantilever") {
    const beltLow = last.map((_, i) => at(i, outR[i] + 2.4, facadeH[i] * 0.72));
    const beltTop = last.map((_, i) => at(i, outR[i] + 2.8, facadeH[i] * 0.98));
    const beltIn = last.map((_, i) => at(i, outR[i] - 0.2, facadeH[i] * 0.70));
    const beltCap = last.map((_, i) => at(i, outR[i] - 0.2, facadeH[i] * 0.99));
    const beltTex = tex(256, 64, (x) => {
      x.fillStyle = "#f4f3ee"; x.fillRect(0, 0, 256, 64);
      x.fillStyle = fc2; x.fillRect(0, 0, 256, 12);
      x.fillStyle = "#151515"; x.fillRect(0, 12, 256, 5);
      x.fillStyle = fc2; x.fillRect(0, 52, 256, 12);
    }, true);
    const bg = loft([beltIn, beltLow, beltTop, beltCap], segOn, true, 24, 1);
    const bm = new THREE.Mesh(bg, mat({ color: 0xffffff, map: beltTex ?? undefined, roughness: 0.55, metalness: 0.08, side: THREE.DoubleSide }));
    bm.castShadow = true; bm.receiveShadow = true;
    g.add(bm);
    // 72 pórticos/vigas monumentais de concreto aparente sustentando o balanço
    const finCount = 72;
    const finGeo = new THREE.BoxGeometry(1.1, 1, 3.4);
    finGeo.translate(0, 0.5, 0);
    const fins = new THREE.InstancedMesh(finGeo, mat({ color: 0xc8c2b6, roughness: 0.82 }), finCount);
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let fk = 0;
    for (let c = 0; c < finCount; c++) {
      const i = Math.floor((c / finCount) * N);
      if (S[i].open) continue;
      const p = at(i, outR[i] + 0.5, 0);
      const out = at(i, outR[i] + 2.5, 0).sub(p).normalize();
      const tang = new THREE.Vector3().crossVectors(up, out).normalize();
      const h = facadeH[i] * 0.74;
      qq.setFromAxisAngle(tang, -0.14).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out));
      sc.set(1, h, 1);
      mm.compose(p, qq, sc);
      fins.setMatrixAt(fk++, mm);
    }
    fins.count = fk; fins.castShadow = true; fins.receiveShadow = true;
    g.add(fins);
    // Letreiro luminoso frontal "MorumBIS" / nome do estádio nas fachadas principais da Praça Roberto Gomes Pedrosa
    const signTex = tex(512, 96, (x) => {
      x.fillStyle = "#c4122f"; x.fillRect(0, 0, 512, 96);
      x.fillStyle = "#111111"; x.fillRect(0, 0, 512, 10); x.fillRect(0, 86, 512, 10);
      x.fillStyle = "#ffffff"; x.fillRect(0, 10, 512, 5); x.fillRect(0, 81, 512, 5);
      x.font = "900 50px 'Barlow Condensed', Arial, sans-serif";
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillStyle = "#ffffff";
      x.fillText((m.name || "MORUMBIS").toUpperCase(), 256, 50);
    });
    const signMat = mat({
      color: 0xffffff, map: signTex ?? undefined,
      emissive: 0xffffff, emissiveMap: signTex ?? undefined, emissiveIntensity: o.night ? 1.15 : 0.25,
      roughness: 0.35, side: THREE.DoubleSide,
    });
    for (const [d0, d1] of [[68, 112], [248, 292]] as [number, number][]) {
      const signList: THREE.Vector3[][] = [[], []];
      for (let i = 0; i < N; i++) {
        const deg = ((S[i].t * 180) / Math.PI + 360) % 360;
        if (deg < d0 || deg > d1) continue;
        signList[0].push(at(i, outR[i] + 3.05, facadeH[i] * 0.76));
        signList[1].push(at(i, outR[i] + 3.05, facadeH[i] * 0.95));
      }
      if (signList[0].length > 2) {
        const sg = loft(signList, signList[0].map(() => true), false, 1, 1);
        const uv = sg.attributes.uv as THREE.BufferAttribute; let mu = 0;
        for (let i = 0; i < uv.count; i++) mu = Math.max(mu, uv.getX(i));
        for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i) / (mu || 1));
        g.add(new THREE.Mesh(sg, signMat));
      }
    }
  }
  // tampas das pontas abertas (ferradura)
  if (m.open?.length) {
    const caps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (S[i].open === S[j].open) continue;
      const e = S[i].open ? j : i;
      const prof: P2[] = [[0, 0], [0, rings[0][e].y0]];
      for (const rr of rings) { prof.push([rr[e].r0, rr[e].y0], [rr[e].r1, rr[e].y1]); }
      prof.push([outR[e], facadeH[e]], [outR[e], 0]);
      const shape = new THREE.Shape(prof.map(([r, y]) => new THREE.Vector2(r, y)));
      const sg = new THREE.ShapeGeometry(shape);
      const dir = at(e, 1, 0).sub(at(e, 0, 0)).setY(0).normalize();
      const p0 = at(e, 0, 0);
      const mtx = new THREE.Matrix4().makeBasis(dir, new THREE.Vector3(0, 1, 0), new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)));
      sg.applyMatrix4(mtx); sg.translate(p0.x, 0, p0.z);
      caps.push(sg);
    }
    if (caps.length) { const cm = new THREE.Mesh(mergeGeometries(caps), mat({ color: C(fc).getHex(), roughness: 0.85, side: THREE.DoubleSide })); cm.castShadow = true; g.add(cm); }
  }
  // pilares externos (Maracanã, Mineirão)
  if ((fac.type === "columns" || fac.type === "frame") && (fac.count ?? 0) > 0) {
    const cnt = fac.count!;
    const hBase = Math.max(...facadeH);
    const colG = new THREE.BoxGeometry(1.6, 1, 2.6);
    colG.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(colG, mat({ color: C(fc).getHex(), roughness: 0.85 }), cnt * (fac.fork ? 3 : 1));
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let k = 0;
    for (let c = 0; c < cnt; c++) {
      const i = Math.floor((c / cnt) * N);
      if (S[i].open) continue;
      const p = at(i, outR[i] + 1.4, 0);
      const out = at(i, outR[i] + 2.4, 0).sub(p).normalize();
      const tang = new THREE.Vector3().crossVectors(up, out).normalize();
      const lean = ((fac.lean ?? 0) * Math.PI) / 180;
      const h = Math.min(hBase, facadeH[i]) + 0.4;
      qq.setFromAxisAngle(tang, -lean);
      const yaw = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
      qq.multiply(yaw);
      sc.set(1, fac.fork ? h * 0.62 : h / Math.cos(lean), 1);
      mm.compose(p.clone().addScaledVector(out, -Math.tan(lean) * h * 0.5), qq, sc);
      im.setMatrixAt(k++, mm);
      if (fac.fork) {
        for (const sgn of [-1, 1]) {
          const base = p.clone().setY(h * 0.6);
          const q2 = new THREE.Quaternion().setFromAxisAngle(out, sgn * 0.42).multiply(yaw);
          mm.compose(base, q2, new THREE.Vector3(0.8, h * 0.45, 1));
          im.setMatrixAt(k++, mm);
        }
      }
    }
    im.count = k;
    im.castShadow = true; im.receiveShadow = true;
    g.add(im);
  }
  // rampas helicoidais externas com passarela de ligação (Morumbis, Maracanã)
  if (m.ramps) {
    const rampTex = tex(256, 256, (x) => {
      x.fillStyle = fc; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = "#484d54"; x.lineWidth = 14;
      for (let i = -4; i < 8; i++) { x.beginPath(); x.moveTo(0, i * 48); x.lineTo(256, i * 48 + 64); x.stroke(); }
      x.strokeStyle = fc2; x.lineWidth = 4;
      for (let i = -4; i < 8; i++) { x.beginPath(); x.moveTo(0, i * 48 + 7); x.lineTo(256, i * 48 + 71); x.stroke(); }
    }, true);
    const rh = maxTop * 0.68;
    for (let k = 0; k < m.ramps; k++) {
      const i = Math.floor(((k + 0.125) / m.ramps) * N) % N;
      const pWall = at(i, outR[i] + 1, 0);
      const p = at(i, outR[i] + 13.5, 0);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.5, rh, 32, 1, true), mat({ color: 0xffffff, map: rampTex ?? undefined, roughness: 0.78, side: THREE.DoubleSide }));
      cyl.position.set(p.x, rh / 2, p.z);
      cyl.castShadow = true; cyl.receiveShadow = true;
      g.add(cyl);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 1.2, 32), mat({ color: C(fc).getHex(), roughness: 0.75 }));
      cap.position.set(p.x, rh + 0.4, p.z); cap.castShadow = true;
      g.add(cap);
      // passarela ligando a torre helicoidal ao anel superior
      const mid = p.clone().lerp(pWall, 0.5);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.2, p.distanceTo(pWall)), mat({ color: C(fc).getHex(), roughness: 0.8 }));
      bridge.position.set(mid.x, rh * 0.78, mid.z);
      bridge.lookAt(pWall.x, rh * 0.78, pWall.z);
      bridge.castShadow = true;
      g.add(bridge);
    }
  }

  // telão na fachada (Neo Química)
  if (m.screen) {
    const sc = m.screen, list: THREE.Vector3[][] = [[], []];
    for (let i = 0; i < N; i++) {
      const d = ((S[i].t * 180) / Math.PI - sc.side + 540) % 360 - 180;
      if (Math.abs(d) > sc.span / 2) continue;
      list[0].push(at(i, outR[i] + 0.6, sc.base)); list[1].push(at(i, outR[i] + 0.6, sc.base + sc.height));
    }
    if (list[0].length > 2) {
      const scrTex = tex(512, 64, (x) => {
        const gr = x.createLinearGradient(0, 0, 512, 0);
        gr.addColorStop(0, "#1b1b1b"); gr.addColorStop(0.5, o.colors[0].toLowerCase() === "#ffffff" ? "#d9d9d9" : o.colors[0]); gr.addColorStop(1, "#1b1b1b");
        x.fillStyle = gr; x.fillRect(0, 0, 512, 64);
        x.fillStyle = "rgba(0,0,0,0.25)"; for (let u = 0; u < 512; u += 4) x.fillRect(u, 0, 1, 64);
      });
      const sg = loft(list, list[0].map(() => true), false, 1, 1);
      const uv = sg.attributes.uv as THREE.BufferAttribute; let mu = 0;
      for (let i = 0; i < uv.count; i++) mu = Math.max(mu, uv.getX(i));
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) / mu);
      g.add(new THREE.Mesh(sg, mat({ color: 0x111111, emissive: 0xffffff, emissiveMap: scrTex ?? undefined, emissiveIntensity: o.night ? 1.4 : 0.8, roughness: 0.3, side: THREE.DoubleSide })));
    }
  }

  // ---------------- cobertura
  if (roof) {
    const drop = roof.drop ?? 2;
    const rOuter = outR.map((r) => r + 1.5);
    const inRange = (i: number) => {
      if (roof.type !== "canopy") return !S[i].open;
      const d = ((S[i].t * 180) / Math.PI - (roof.side ?? 90) + 540) % 360 - 180;
      return Math.abs(d) <= (roof.span ?? 90) / 2;
    };
    const roofOn = S.map((_, i) => inRange(i) && inRange((i + 1) % N) && segOn[i]);
    const H = roof.type === "canopy" ? Math.max(...topY) + 4 : roof.height;
    const rIn = rOuter.map((r) => Math.max(4, r - roof.cover));
    const o1 = rOuter.map((r, i) => at(i, r, H));
    const i1 = rIn.map((r, i) => at(i, r, H - drop));
    const steps = 4;
    const lines: THREE.Vector3[][] = [];
    for (let s = 0; s <= steps; s++) lines.push(o1.map((p, i) => {
      const v = p.clone().lerp(i1[i], s / steps);
      v.y += Math.sin((s / steps) * Math.PI) * 1.2; // leve abaulado da membrana
      return v;
    }));
    const op = roof.opacity ?? 1;
    const roofTex = tex(256, 64, (x) => {
      x.fillStyle = roof.color; x.fillRect(0, 0, 256, 64);
      for (let u = 0; u < 256; u += 16) { x.fillStyle = "rgba(0,0,0,0.07)"; x.fillRect(u, 0, 2, 64); }
      x.fillStyle = "rgba(255,255,255,0.25)"; x.fillRect(0, 0, 256, 3);
    }, true);
    const rg = loft(lines, roofOn, true, 1, 1);
    const ruv = rg.attributes.uv as THREE.BufferAttribute;
    let mu = 0; for (let i = 0; i < ruv.count; i++) mu = Math.max(mu, ruv.getX(i));
    for (let i = 0; i < ruv.count; i++) ruv.setX(i, (ruv.getX(i) / mu) * Math.round(roof.ribs ?? 48));
    const rm = mat({ color: roofTex ? 0xffffff : C(roof.color).getHex(), map: roofTex ?? undefined, roughness: 0.55, metalness: 0.08, transparent: op < 1, opacity: op, side: THREE.DoubleSide, depthWrite: op >= 0.9 });
    const rmesh = new THREE.Mesh(rg, rm);
    rmesh.castShadow = true; rmesh.receiveShadow = op >= 0.9;
    rmesh.renderOrder = op < 1 ? 2 : 0;
    g.add(rmesh);
    // treliças radiais por cima da cobertura
    const ribs = roof.ribs ?? 0;
    if (ribs) {
      const rib = new THREE.BoxGeometry(0.7, 1.4, 1); rib.translate(0, 0.7, 0.5);
      const im = new THREE.InstancedMesh(rib, mat({ color: C(roof.ribColor ?? "#cccccc").getHex(), roughness: 0.6, metalness: 0.3 }), ribs);
      const mm = new THREE.Matrix4();
      let k = 0;
      for (let c = 0; c < ribs; c++) {
        const i = Math.floor((c / ribs) * N);
        if (!roofOn[i]) continue;
        const a = o1[i].clone().setY(H + 0.2), b = i1[i].clone().setY(H - drop + 0.2);
        const len = a.distanceTo(b);
        const obj = new THREE.Object3D();
        obj.position.copy(a); obj.lookAt(b); obj.scale.set(1, 1, len);
        obj.updateMatrix(); mm.copy(obj.matrix);
        im.setMatrixAt(k++, mm);
      }
      im.count = k; im.castShadow = true;
      g.add(im);
    }
    // anel de compressão / tração na borda interna
    if (roof.innerRing && roof.type !== "canopy") {
      const curve = new THREE.CatmullRomCurve3(i1.filter((_, i) => i % 2 === 0), true);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, N, 0.9, 6, true), mat({ color: C(roof.ribColor ?? "#bbbbbb").getHex(), roughness: 0.5, metalness: 0.4 }));
      tube.castShadow = true;
      g.add(tube);
    }
    // cabos (Maracanã): da borda externa até o anel interno, por baixo da membrana
    if (roof.cables) {
      const pos: number[] = [];
      for (let i = 0; i < N; i += 2) { const a = o1[i], b = i1[i]; pos.push(a.x, H + 3.5, a.z, b.x, b.y - 0.3, b.z); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8b9097 })));
      // mastros curtos na borda externa
      const mast = new THREE.CylinderGeometry(0.35, 0.35, 4.5, 6); mast.translate(0, H + 1.6, 0);
      const ims = new THREE.InstancedMesh(mast, mat({ color: 0xd9dcdf, roughness: 0.6 }), Math.ceil(N / 4));
      let k = 0; const mm = new THREE.Matrix4();
      for (let i = 0; i < N; i += 4) { mm.makeTranslation(o1[i].x, 0, o1[i].z); ims.setMatrixAt(k++, mm); }
      ims.count = k; g.add(ims);
    }
    // teto retrátil (Arena da Baixada): painel translúcido sobre o campo
    if (roof.retractable) {
      const shape = new THREE.Shape(i1.map((p) => new THREE.Vector2(p.x, -p.z)));
      const sg = new THREE.ShapeGeometry(shape, 8); sg.rotateX(-Math.PI / 2);
      const panel = new THREE.Mesh(sg, mat({ color: 0xe9eef2, roughness: 0.3, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
      panel.position.y = H + 1.5; panel.renderOrder = 3;
      g.add(panel);
      const beam = new THREE.BoxGeometry(1.2, 1.6, (B + 6) * 2);
      const beams: THREE.BufferGeometry[] = [];
      for (let x = -A + 8; x <= A - 8; x += 14) { const b = beam.clone(); b.translate(x, H + 2.2, 0); beams.push(b); }
      const bm = new THREE.Mesh(mergeGeometries(beams), mat({ color: 0x4a4f55, roughness: 0.6, metalness: 0.4 })); bm.castShadow = true; g.add(bm);
    }
    // apoios da marquise
    if (roof.type === "canopy") {
      const posts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < N; i += 6) if (roofOn[i]) { const p = at(i, outR[i] - 0.5, 0); const c = new THREE.CylinderGeometry(0.4, 0.5, H, 6); c.translate(p.x, H / 2, p.z); posts.push(c); }
      if (posts.length) g.add(new THREE.Mesh(mergeGeometries(posts), darkConcrete));
    }
  }
  // arcos do Engenhão
  if (m.arches) {
    const am = mat({ color: C(m.arches.color).getHex(), roughness: 0.45, metalness: 0.3 });
    const R0 = Math.max(...outR) + 1;
    const ax = A + (R0 - A) * 0.9, bz = B + (R0 - B) * 0.9;
    const arc = (p1: THREE.Vector3, p2: THREE.Vector3) => {
      const mid = p1.clone().add(p2).multiplyScalar(0.5).setY(m.arches!.height);
      const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
      const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, m.arches!.width, 10, false), am);
      t.castShadow = true;
      g.add(t);
    };
    arc(new THREE.Vector3(-ax, 0, bz), new THREE.Vector3(ax, 0, bz));
    arc(new THREE.Vector3(-ax, 0, -bz), new THREE.Vector3(ax, 0, -bz));
    arc(new THREE.Vector3(ax, 0, -bz), new THREE.Vector3(ax, 0, bz));
    arc(new THREE.Vector3(-ax, 0, -bz), new THREE.Vector3(-ax, 0, bz));
  }

  // ---------------- campo, pista e placas
  const fieldShape = new THREE.Shape();
  for (let i = 0; i <= N; i++) { const [x, z] = superEllipse(S[i % N].t, A + 0.5, B + 0.5, n); if (i === 0) fieldShape.moveTo(x, -z); else fieldShape.lineTo(x, -z); }
  const apronG = new THREE.ShapeGeometry(fieldShape, 4); apronG.rotateX(-Math.PI / 2);
  const synthetic = m.turf === "synthetic";
  const apron = new THREE.Mesh(apronG, mat({ color: m.track ? C(m.track).getHex() : synthetic ? 0x2f7d34 : 0x3b7f2f, roughness: 0.95 }));
  apron.position.y = 0.04; apron.receiveShadow = true; g.add(apron);
  if (m.track) {
    // pista de atletismo de 400 m (retas de 84,39 m, curvas de 36,5 m) com raias
    const lanes = tex(64, 256, (x) => {
      x.fillStyle = m.track!; x.fillRect(0, 0, 64, 256);
      x.fillStyle = "rgba(255,255,255,0.8)"; for (let i = 0; i <= 8; i++) x.fillRect(0, Math.min(255, i * 32), 64, 2);
    }, true);
    const trackShape = (r: number) => {
      const s = new THREE.Shape(); const L = 42.2;
      s.moveTo(-L, -r); s.lineTo(L, -r); s.absarc(L, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-L, r); s.absarc(-L, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
      return s;
    };
    const outer = trackShape(46.3); outer.holes.push(oppositeHole(outer, trackShape(36.5).getPoints(24)));
    const tg = new THREE.ShapeGeometry(outer, 24); tg.rotateX(-Math.PI / 2);
    // uv radial para as raias
    const p = tg.attributes.position as THREE.BufferAttribute; const uv = tg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const dx = Math.max(0, Math.abs(x) - 42.2); const r = Math.hypot(dx, z); uv.setXY(i, 0.5, (r - 36.5) / 9.8); }
    const tm = new THREE.Mesh(tg, mat({ color: 0xffffff, map: lanes ?? undefined, roughness: 0.9 }));
    tm.position.y = 0.06; tm.receiveShadow = true; g.add(tm);
    const inf = new THREE.ShapeGeometry(trackShape(36.5), 24); inf.rotateX(-Math.PI / 2);
    const im = new THREE.Mesh(inf, mat({ color: 0x3b7f2f, roughness: 0.95 })); im.position.y = 0.06; im.receiveShadow = true; g.add(im);
  }
  const k = q >= 3 ? 16 : 10;
  const pitchTex = tex(120 * k, 78 * k, (x) => {
    x.scale(k, k);
    const a = synthetic ? ["#2f8a3a", "#36963f"] : ["#3f8f31", "#4a9d38"];
    x.fillStyle = a[0]; x.fillRect(0, 0, 120, 78);
    for (let i = 0; i < 20; i++) { x.fillStyle = a[i % 2]; x.fillRect(7.5 + (i * 105) / 20, 0, 105 / 20, 78); }
    for (let i = 0; i < 6; i++) { x.fillStyle = "rgba(255,255,255,0.03)"; x.fillRect(0, i * 13, 120, 6.5); }
    x.strokeStyle = "#f4fff2"; x.lineWidth = 0.14;
    x.strokeRect(7.5, 5, 105, 68);
    x.beginPath(); x.moveTo(60, 5); x.lineTo(60, 73); x.stroke();
    x.beginPath(); x.arc(60, 39, 9.15, 0, Math.PI * 2); x.stroke();
    for (const s of [0, 1]) {
      const x0 = s ? 112.5 : 7.5, d = s ? -1 : 1;
      x.strokeRect(s ? x0 - 16.5 : x0, 39 - 20.16, 16.5, 40.32);
      x.strokeRect(s ? x0 - 5.5 : x0, 39 - 9.16, 5.5, 18.32);
      x.beginPath(); x.arc(x0 + d * 11, 39, 9.15, s ? Math.PI - 0.93 : -0.93, s ? Math.PI + 0.93 : 0.93); x.stroke();
      x.fillStyle = "#f4fff2"; x.beginPath(); x.arc(x0 + d * 11, 39, 0.25, 0, 7); x.fill();
    }
    x.beginPath(); x.arc(60, 39, 0.25, 0, 7); x.fill();
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(120, 78), mat({ color: pitchTex ? 0xffffff : 0x46992f, map: pitchTex ?? undefined, roughness: 0.92, emissive: o.night ? 0x0c1a08 : 0x000000 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.08; pitch.receiveShadow = true;
  g.add(pitch);
  // traves
  const gm = mat({ color: 0xffffff, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const x0 = s * 52.5;
    for (const [w, h, d, y, z] of [[0.15, 2.44, 0.15, 1.22, -3.66], [0.15, 2.44, 0.15, 1.22, 3.66], [0.15, 0.15, 7.47, 2.44, 0]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gm);
      post.position.set(x0, y, z);
      g.add(post);
    }
    const net = new THREE.Mesh(new THREE.BoxGeometry(2, 2.44, 7.32), mat({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    net.position.set(x0 + s * 1, 1.22, 0); g.add(net);
  }
  // placas de LED em volta do campo
  if (o.stadiumLv >= 2 || q >= 2) {
    const led = tex(256, 16, (x) => {
      const cc = [o.colors[0], "#ffffff", o.colors[1], "#1a1a1a"];
      for (let i = 0; i < 16; i++) { x.fillStyle = cc[i % cc.length]; x.fillRect(i * 16, 0, 16, 16); }
      x.fillStyle = "rgba(255,255,255,0.5)"; for (let i = 0; i < 16; i++) x.fillRect(i * 16 + 3, 6, 10, 3);
    }, true);
    const boards: THREE.BufferGeometry[] = [];
    for (const [w, x, z, ry] of [[105, 0, -38, 0], [105, 0, 38, 0], [64, -57, 0, Math.PI / 2], [64, 57, 0, Math.PI / 2]] as const) {
      const b = new THREE.BoxGeometry(w, 0.9, 0.2); b.rotateY(ry); b.translate(x, 0.5, z); boards.push(b);
    }
    if (led) led.repeat.set(4, 1);
    const ledM = mat({ color: 0xffffff, map: led ?? undefined, emissive: 0xffffff, emissiveMap: led ?? undefined, emissiveIntensity: o.night ? 0.9 : 0.35, roughness: 0.4 });
    g.add(new THREE.Mesh(mergeGeometries(boards), ledM));
  }
  // telões
  const screens = m.screens ?? 0;
  for (let s = 0; s < screens; s++) {
    const i = s === 0 ? 0 : Math.floor(N / 2);
    const p = at(i, (last[i].r0 + last[i].r1) / 2 + 2, last[i].y1 - 1);
    const scr = new THREE.Mesh(new THREE.BoxGeometry(1, 7, 18), mat({ color: 0x1b2230, emissive: o.night ? 0x5aa0ff : 0x1d3b66, emissiveIntensity: 0.9, roughness: 0.3 }));
    scr.position.set(p.x, last[i].y1 + 4, p.z);
    g.add(scr);
  }
  // refletores
  const lamp = mat({ color: 0xf2f4f5, emissive: o.night ? 0xfff3c4 : 0x000000, emissiveIntensity: 1.6, roughness: 0.3 });
  if (m.lights === "towers") {
    const tower: THREE.BufferGeometry[] = [], heads: THREE.BufferGeometry[] = [];
    const ht = Math.max(...topY) + 26;
    for (const a of [35, 145, 215, 325]) {
      const i = Math.floor(((a / 360) * N)) % N;
      const p = at(i, outR[i] + 6, 0);
      const c = new THREE.CylinderGeometry(0.6, 1.4, ht, 8); c.translate(p.x, ht / 2, p.z); tower.push(c);
      const h = new THREE.BoxGeometry(7, 4, 1); h.lookAt(new THREE.Vector3(-p.x, 0, -p.z)); h.translate(p.x, ht, p.z); heads.push(h);
    }
    const tm = new THREE.Mesh(mergeGeometries(tower), mat({ color: 0x8c9198, roughness: 0.5, metalness: 0.5 })); tm.castShadow = true; g.add(tm);
    g.add(new THREE.Mesh(mergeGeometries(heads), lamp));
  } else if (m.lights === "rim") {
    const heads: THREE.BufferGeometry[] = [];
    for (let i = 0; i < N; i += Math.max(1, Math.round(N / 40))) {
      if (S[i].open) continue;
      const p = at(i, outR[i] - 1, facadeH[i] + 4);
      const h = new THREE.BoxGeometry(5, 2, 0.6); h.lookAt(new THREE.Vector3(-p.x, -40, -p.z)); h.translate(p.x, p.y, p.z); heads.push(h);
      const pole = new THREE.CylinderGeometry(0.25, 0.25, 4, 5); pole.translate(p.x, p.y - 2, p.z); heads.push(pole);
    }
    g.add(new THREE.Mesh(mergeGeometries(heads), lamp));
  } else if (roof && m.lights === "roof") {
    const H = roof.height - (roof.drop ?? 2) - 0.8;
    const pts3: THREE.Vector3[] = [];
    for (let i = 0; i < N; i += 2) pts3.push(at(i, Math.max(4, outR[i] + 1.5 - roof.cover) + 0.5, H));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3, true), N, 0.6, 4, true), lamp);
    g.add(tube);
  }

  // ---------------- esplanada
  const pr = m.plazaR ?? 20;
  const plazaShape = new THREE.Shape();
  for (let i = 0; i <= N; i++) { const p = at(i % N, outR[i % N] + pr, 0); if (i === 0) plazaShape.moveTo(p.x, -p.z); else plazaShape.lineTo(p.x, -p.z); }
  const hole = new THREE.Path();
  for (let i = 0; i <= N; i++) { const p = at(i % N, outR[i % N] - 0.5, 0); if (i === 0) hole.moveTo(p.x, -p.z); else hole.lineTo(p.x, -p.z); }
  plazaShape.holes.push(oppositeHole(plazaShape, hole.getPoints()));
  const pg = new THREE.ShapeGeometry(plazaShape, 2); pg.rotateX(-Math.PI / 2);
  const paving = tex(128, 128, (x) => {
    x.fillStyle = m.plaza ?? "#b5b0a6"; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = "rgba(0,0,0,0.08)"; x.lineWidth = 1;
    for (let i = 0; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
  }, true);
  if (paving) paving.repeat.set(1 / 16, 1 / 16);
  const pgUv = pg.attributes.uv as THREE.BufferAttribute;
  const pgPos = pg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pgUv.count; i++) pgUv.setXY(i, pgPos.getX(i), pgPos.getZ(i));
  const plaza = new THREE.Mesh(pg, mat({ color: 0xffffff, map: paving ?? undefined, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  plaza.position.y = 0.2; plaza.receiveShadow = true;
  g.add(plaza);

  const maxR = Math.max(...outR);
  const [ox, oz] = superEllipse(0, A + maxR, B + maxR, n);
  const [, oz2] = superEllipse(Math.PI / 2, A + maxR, B + maxR, n);
  void ox; void oz;
  return { group: g, topY: Math.max(maxTop, roof ? roof.height : 0), outer: [A + maxR, Math.abs(oz2)] };
}

/** Posição, rotação e escala do estádio a partir do contorno real do OSM (metros). */
export function fitToBowl(outer: [number, number], bowl?: GeoBowl | null): { x: number; z: number; rotY: number; sx: number; sz: number } {
  if (!bowl) return { x: 0, z: 0, rotY: 0, sx: 1, sz: 1 };
  let [cx, cz, hw, hh, deg] = bowl.rect;
  // prefere o contorno quando existe (o retângulo do script já vem dele)
  if (bowl.outline?.length >= 8) {
    const r = minRect(pts(bowl.outline));
    cx = r.cx; cz = r.cz; hw = r.hw; hh = r.hh; deg = (r.ang * 180) / Math.PI;
  }
  const clamp = (v: number) => Math.max(0.82, Math.min(1.22, v));
  return { x: cx, z: cz, rotY: -(deg * Math.PI) / 180, sx: clamp(hw / outer[0]), sz: clamp(hh / outer[1]) };
}
