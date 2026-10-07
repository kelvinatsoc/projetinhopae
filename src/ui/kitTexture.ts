// Camisa de verdade em <canvas>: o tecido sai dos padrões da Wikipedia (src/data/kits.json, as
// mesmas camadas do KitView) e por cima vêm a logo da fornecedora, o escudo, o patrocinador
// master (marca tingida na cor de contraste, como o silk da camisa real) e, nas costas, nome e
// número. Usado pela tela "Uniformes", pelo perfil do jogador e como textura dos jogadores 3D.
//
// Tudo é síncrono: a função devolve o canvas já desenhado com o que estiver carregado e, quando as
// imagens que faltam chegam, redesenha o MESMO canvas e chama `onReady` (no three.js basta marcar
// `texture.needsUpdate = true`). Sem imagem/dado, cai para cores lisas e o nome da marca em texto.
import kitPhotosJson from "../data/kitPhotos.json";
import { brandLogo, REAL_SPONSORS } from "../engine/sponsors";
import { colorDistance, kitShirtColor, kitsOf, plainKit, type Kit } from "./Kit";
import { mediaUrl } from "./mediaUrl";

/** 0 = titular, 1 = reserva, 2 = terceiro. */
export type KitWhich = 0 | 1 | 2;

export interface KitTexOptions {
  /** número e nome (costas) */
  num?: number | string;
  name?: string;
  /** marcas; undefined = as reais do clube (sponsorsReal.json), null = nenhuma */
  supplier?: string | null;
  sponsor?: string | null;
  /** escudo: caminho em media/ (ex.: "crests/flamengo.webp"); undefined = o do clube, null = sem */
  crest?: string | null;
  /** cores do clube para o uniforme liso quando não há dados */
  colors?: readonly string[];
  /** "sheet" = textura 2:1 (metade esquerda costas, direita frente; UV do boneco 3D);
   * "front"/"back" = camisa recortada com mangas (telas) */
  layout?: "sheet" | "front" | "back";
  /** altura do canvas em px (largura = 2× no "sheet", ≈0.91× nas vistas) */
  size?: number;
  /** chamado quando terminam de carregar as imagens e o canvas foi redesenhado */
  onReady?: (c: HTMLCanvasElement) => void;
}

type PhotoRec = { sdb?: string; season?: number | null; files: Record<string, string> };
const PHOTOS = kitPhotosJson as Record<string, PhotoRec>;

// ---------------------------------------------------------------- dados
/** Uniforme `which` do clube (se não existir, o mais próximo; sem dados, liso nas cores dadas). */
export function kitOf(clubId: string, which: KitWhich = 0, colors?: readonly string[]): Kit {
  const ks = kitsOf(clubId);
  if (ks.length) return ks[Math.min(which, ks.length - 1)];
  const cs = colors?.length ? colors : ["#FFFFFF", "#111111"];
  return which === 0 ? plainKit(cs) : plainKit([cs[1] ?? "#FFFFFF", cs[0]], which === 1 ? "Reserva" : "Terceiro");
}

/** Fornecedora e patrocinador master reais (sem contratos do jogo). */
export function kitBrands(clubId: string): { supplier?: string; sponsor?: string } {
  const r = REAL_SPONSORS[clubId];
  return { supplier: r?.kit, sponsor: r?.shirt };
}

/** Foto real da camisa (TheSportsDB), se houver: caminho em media/. */
export function kitPhoto(clubId: string, which: KitWhich = 0): string | null {
  return PHOTOS[clubId]?.files[String(which + 1)] ?? null;
}

/** Índice do uniforme do visitante: o primeiro que não se confunde com a camisa do mandante. */
export function awayKitIndex(homeId: string, awayId: string, minDelta = 40): KitWhich {
  const home = kitShirtColor(kitOf(homeId, 0));
  const ks = kitsOf(awayId);
  const i = ks.findIndex((k) => colorDistance(kitShirtColor(k), home) >= minDelta);
  return (i < 0 ? Math.min(1, Math.max(0, ks.length - 1)) : i) as KitWhich;
}

// ---------------------------------------------------------------- imagens
const IMGS = new Map<string, { img: HTMLImageElement; ok: boolean; done: Promise<void> }>();

function img(path: string | null | undefined) {
  if (!path || typeof Image === "undefined") return null;
  let e = IMGS.get(path);
  if (!e) {
    const im = new Image();
    im.decoding = "async";
    const rec = { img: im, ok: false, done: Promise.resolve() };
    rec.done = new Promise<void>((res) => {
      im.onload = () => { rec.ok = im.naturalWidth > 0; res(); };
      im.onerror = () => res();
    });
    im.src = /^(data:|https?:|blob:)/.test(path) ? path : mediaUrl(path);
    IMGS.set(path, rec);
    e = rec;
  }
  return e;
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum(hex: string) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function shade(hex: string, f: number) {
  const [r, g, b] = rgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
  return `rgb(${r},${g},${b})`;
}

/** Cor do silk (marca, número) que contrasta com a camisa. */
export function kitInk(kit: Kit): string {
  const base = kitShirtColor(kit);
  if (kit.pat && kit.st && colorDistance(kit.st, base) > 30) {
    // listrada: o silk costuma vir na cor de contraste das duas
    return lum(base) + lum(kit.st) > 1.1 ? "#111111" : "#FFFFFF";
  }
  return lum(base) > 0.62 ? "#111111" : "#FFFFFF";
}

// marca tingida (silhueta na cor do silk); logos com fundo opaco vão como estão, num selo
const TINT = new Map<string, HTMLCanvasElement | null>();
function tinted(path: string, color: string, im: HTMLImageElement): HTMLCanvasElement | null {
  const key = `${path}|${color}`;
  if (TINT.has(key)) return TINT.get(key)!;
  const w = im.naturalWidth, h = im.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  g.drawImage(im, 0, 0);
  let opaque = false;
  try {
    const px = g.getImageData(0, 0, 1, 1).data;
    const px2 = g.getImageData(w - 1, h - 1, 1, 1).data;
    opaque = px[3] > 200 && px2[3] > 200;
  } catch {
    opaque = false;
  }
  if (opaque) {
    TINT.set(key, null);
    return null;
  }
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  TINT.set(key, c);
  return c;
}

function fitRect(sw: number, sh: number, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / sw, h / sh);
  const dw = sw * s, dh = sh * s;
  return [x + (w - dw) / 2, y + (h - dh) / 2, dw, dh] as const;
}

function brandMark(g: CanvasRenderingContext2D, brand: string | null | undefined, x: number, y: number, w: number, h: number, ink: string, pending: Promise<void>[], textFallback: boolean) {
  if (!brand) return;
  const path = brandLogo(brand);
  const e = img(path);
  if (e && !e.ok) pending.push(e.done);
  if (e?.ok && path) {
    const t = tinted(path, ink, e.img);
    if (t) {
      const [dx, dy, dw, dh] = fitRect(t.width, t.height, x, y, w, h);
      g.drawImage(t, dx, dy, dw, dh);
    } else {
      const [dx, dy, dw, dh] = fitRect(e.img.naturalWidth, e.img.naturalHeight, x, y, w, h);
      g.drawImage(e.img, dx, dy, dw, dh);
    }
    return;
  }
  if (!textFallback || (e && !e.ok && path && !e.img.complete)) return;
  // sem logo: o nome da marca em letras de silk
  const label = brand.toUpperCase();
  let fs = h * 0.8;
  g.font = `900 ${fs}px "Arial Black", Impact, system-ui, sans-serif`;
  const mw = g.measureText(label).width;
  if (mw > w) {
    fs *= w / mw;
    g.font = `900 ${fs}px "Arial Black", Impact, system-ui, sans-serif`;
  }
  g.fillStyle = ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, x + w / 2, y + h / 2);
}

// ---------------------------------------------------------------- tecido
// Caixas da predefinição Football kit: corpo 38×59 (gola nos ~6 px de cima) e mangas 31×59 (a
// manga ocupa o triângulo x 12–31, y 5–37).
function fabric(g: CanvasRenderingContext2D, kit: Kit, part: "b" | "la" | "ra" | "sh" | "so", x: number, y: number, w: number, h: number, pending: Promise<void>[], crop?: [number, number, number, number]) {
  g.fillStyle = kit[part];
  g.fillRect(x, y, w, h);
  const file = kit[`p${part}`];
  const e = img(file ? `kits/${file}` : null);
  if (e && !e.ok) pending.push(e.done);
  if (e?.ok) {
    const [sx, sy, sw, sh] = crop ?? [0, 0, e.img.naturalWidth, e.img.naturalHeight];
    const smooth = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;
    g.drawImage(e.img, sx, sy, sw, sh, x, y, w, h);
    g.imageSmoothingEnabled = smooth;
  }
}

// silhueta da camisa numa grade 200×220
const SHIRT_W = 200, SHIRT_H = 220;
function shirtPath(back: boolean): Path2D {
  const p = new Path2D();
  p.moveTo(76, 14);
  p.quadraticCurveTo(100, back ? 22 : 34, 124, 14);
  p.lineTo(152, 22);
  p.lineTo(192, 70);
  p.lineTo(166, 96);
  p.lineTo(150, 82);
  p.lineTo(150, 208);
  p.quadraticCurveTo(100, 216, 50, 208);
  p.lineTo(50, 82);
  p.lineTo(34, 96);
  p.lineTo(8, 70);
  p.lineTo(48, 22);
  p.closePath();
  return p;
}
function sleevePath(left: boolean): Path2D {
  const p = new Path2D();
  const m = (x: number) => (left ? x : SHIRT_W - x);
  p.moveTo(m(48), 22);
  p.lineTo(m(8), 70);
  p.lineTo(m(34), 96);
  p.lineTo(m(52), 80);
  p.lineTo(m(56), 26);
  p.closePath();
  return p;
}

function crestPath(clubId: string, crest: string | null | undefined) {
  return crest === undefined ? `crests/${clubId}.webp` : crest;
}

function drawBack(g: CanvasRenderingContext2D, kit: Kit, o: KitTexOptions, x: number, y: number, w: number, h: number) {
  const ink = kitInk(kit);
  const name = (o.name ?? "").toUpperCase();
  if (name) {
    let fs = h * 0.11;
    g.font = `800 ${fs}px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif`;
    const mw = g.measureText(name).width;
    if (mw > w * 0.8) {
      fs *= (w * 0.8) / mw;
      g.font = `800 ${fs}px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif`;
    }
    g.fillStyle = ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(name, x + w / 2, y + h * 0.16);
  }
  const num = o.num != null && o.num !== "" && o.num !== 0 ? String(o.num) : "";
  if (num) {
    const fs = h * 0.5;
    g.font = `900 ${fs}px "Arial Black", Impact, system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = Math.max(1, fs * 0.05);
    g.strokeStyle = ink === "#FFFFFF" ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.35)";
    g.strokeText(num, x + w / 2, y + h * 0.52);
    g.fillStyle = ink;
    g.fillText(num, x + w / 2, y + h * 0.52);
  }
}

function drawFront(g: CanvasRenderingContext2D, clubId: string, kit: Kit, o: KitTexOptions, x: number, y: number, w: number, h: number, pending: Promise<void>[]) {
  const ink = kitInk(kit);
  const real = kitBrands(clubId);
  const supplier = o.supplier === undefined ? real.supplier : o.supplier;
  const sponsor = o.sponsor === undefined ? real.sponsor : o.sponsor;
  // fornecedora: peito direito do jogador (esquerda de quem olha)
  brandMark(g, supplier, x + w * 0.1, y + h * 0.06, w * 0.24, h * 0.13, ink, pending, true);
  // escudo: peito esquerdo (coração)
  const cp = crestPath(clubId, o.crest);
  const e = img(cp);
  if (e && !e.ok) pending.push(e.done);
  if (e?.ok) {
    const [dx, dy, dw, dh] = fitRect(e.img.naturalWidth, e.img.naturalHeight, x + w * 0.64, y + h * 0.03, w * 0.24, h * 0.2);
    g.drawImage(e.img, dx, dy, dw, dh);
  }
  // patrocinador master no centro
  brandMark(g, sponsor, x + w * 0.12, y + h * 0.36, w * 0.76, h * 0.22, ink, pending, true);
  // número pequeno na frente (como em muitas camisas)
  if (o.num && o.layout === "sheet") {
    g.font = `900 ${h * 0.12}px "Arial Black", Impact, system-ui, sans-serif`;
    g.fillStyle = ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(o.num), x + w * 0.5, y + h * 0.78);
  }
}

function paintSheet(c: HTMLCanvasElement, clubId: string, kit: Kit, o: KitTexOptions, pending: Promise<void>[]) {
  const g = c.getContext("2d");
  if (!g) return;
  const S = c.height;
  g.clearRect(0, 0, c.width, c.height);
  // tecido: corpo sem a gola (6 px de cima)
  fabric(g, kit, "b", 0, 0, S, S, pending, [0, 6, 38, 53]);
  fabric(g, kit, "b", S, 0, S, S, pending, [0, 6, 38, 53]);
  // gola
  g.fillStyle = shade(kitShirtColor(kit), lum(kitShirtColor(kit)) > 0.5 ? -0.35 : 0.35);
  g.fillRect(S + S * 0.38, 0, S * 0.24, S * 0.05);
  g.fillRect(S * 0.35, 0, S * 0.3, S * 0.04);
  drawBack(g, kit, o, 0, 0, S, S);
  drawFront(g, clubId, kit, o, S, 0, S, S, pending);
}

function paintView(c: HTMLCanvasElement, clubId: string, kit: Kit, o: KitTexOptions, back: boolean, pending: Promise<void>[]) {
  const g = c.getContext("2d");
  if (!g) return;
  const s = c.height / SHIRT_H;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.setTransform(s, 0, 0, s, 0, 0);
  const outline = shirtPath(back);
  g.save();
  g.clip(outline);
  // corpo (o PNG da Wikipedia inclui a gola no topo)
  fabric(g, kit, "b", 50, 6, 100, 210, pending);
  // mangas: de frente, a esquerda de quem olha é a "la" da Wikipedia; de costas, inverte
  for (const left of [true, false]) {
    const part = (left !== back ? "la" : "ra") as "la" | "ra";
    g.save();
    g.clip(sleevePath(left));
    const crop: [number, number, number, number] = part === "la" ? [12, 5, 19, 32] : [0, 5, 19, 32];
    if (left) fabric(g, kit, part, 6, 20, 52, 78, pending, crop);
    else fabric(g, kit, part, SHIRT_W - 58, 20, 52, 78, pending, crop);
    g.restore();
  }
  // volume: sombra nas laterais e um brilho no meio
  const grad = g.createLinearGradient(50, 0, 150, 0);
  grad.addColorStop(0, "rgba(0,0,0,.22)");
  grad.addColorStop(0.25, "rgba(0,0,0,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,.08)");
  grad.addColorStop(0.75, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,.22)");
  g.fillStyle = grad;
  g.fillRect(0, 0, SHIRT_W, SHIRT_H);
  // costura dos ombros/mangas
  g.strokeStyle = "rgba(0,0,0,.18)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(52, 80); g.lineTo(56, 26);
  g.moveTo(148, 80); g.lineTo(144, 26);
  g.stroke();
  if (back) drawBack(g, kit, o, 50, 30, 100, 170);
  else drawFront(g, clubId, kit, o, 50, 40, 100, 160, pending);
  g.restore();
  // gola
  const collar = shade(kitShirtColor(kit), lum(kitShirtColor(kit)) > 0.5 ? -0.45 : 0.5);
  g.strokeStyle = collar;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(76, 14);
  g.quadraticCurveTo(100, back ? 22 : 34, 124, 14);
  g.stroke();
  g.strokeStyle = "rgba(0,0,0,.45)";
  g.lineWidth = 1.5;
  g.stroke(outline);
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * Textura/arte da camisa do clube. `which`: 0 titular, 1 reserva, 2 terceiro.
 * Devolve um canvas pronto; quando as imagens terminam de carregar, ele é redesenhado e
 * `opts.onReady(canvas)` é chamado.
 */
export function makeKitTexture(clubId: string, which: KitWhich = 0, opts: KitTexOptions = {}): HTMLCanvasElement {
  const layout = opts.layout ?? "sheet";
  const size = opts.size ?? (layout === "sheet" ? 128 : 220);
  const c = document.createElement("canvas");
  c.height = size;
  c.width = layout === "sheet" ? size * 2 : Math.round((size * SHIRT_W) / SHIRT_H);
  const kit = kitOf(clubId, which, opts.colors);
  const paint = () => {
    const pending: Promise<void>[] = [];
    if (layout === "sheet") paintSheet(c, clubId, kit, { ...opts, layout }, pending);
    else paintView(c, clubId, kit, opts, layout === "back", pending);
    return pending;
  };
  const pending = paint();
  if (pending.length) {
    void Promise.all(pending).then(() => {
      paint();
      opts.onReady?.(c);
    });
  } else {
    queueMicrotask(() => opts.onReady?.(c));
  }
  return c;
}

/** Chave estável do uniforme (para caches de textura). */
export function kitKey(clubId: string, which: KitWhich, num?: number | string, name?: string) {
  return `${clubId}:${which}:${num ?? ""}:${name ?? ""}`;
}
