// Uniformes reais dos clubes (titular, reserva e terceiro), desenhados como a predefinição
// "Football kit" da Wikipedia: cinco caixas (braço esquerdo, corpo, braço direito, calção e
// meias), cada uma com a cor de fundo, o padrão por cima (PNG transparente, quando existe) e,
// por cima de tudo, o contorno/sombreado. Dados: src/data/kits.json (scripts/fetch_kits.py);
// arquivos: public/media/kits/.
import { brandLogo } from "../engine/sponsors";
import { useId } from "react";
import kitsData from "../data/kits.json";
import { mediaUrl } from "./mediaUrl";

/** Um uniforme: cor "#RRGGBB" de cada parte e, se houver, o arquivo do padrão em media/kits/. */
export type Kit = {
  /** "Titular" | "Reserva" | "Terceiro" */
  name: string;
  /** braço esquerdo, corpo, braço direito, calção e meias */
  la: string;
  b: string;
  ra: string;
  sh: string;
  so: string;
  pla?: string;
  pb?: string;
  pra?: string;
  psh?: string;
  pso?: string;
  /** cor predominante da camisa já com o padrão aplicado (calculada pelo script) */
  shirt?: string;
  /** uniforme liso gerado a partir das cores do clube (sem dados na Wikipedia) */
  synthetic?: boolean;
  /** padrão do corpo detectado no PNG (listras verticais, horizontais, faixa diagonal, metades, faixa no peito) */
  pat?: "stripes" | "hoops" | "sash" | "halves" | "band";
  /** cor secundária do padrão */
  st?: string;
};

type Part = "la" | "b" | "ra" | "sh" | "so";

// Geometria (px) da predefinição, na ordem em que as camadas são desenhadas. "edge" é o
// caminho do contorno de cada parte (o mesmo do arquivo .svg): na Wikipedia ele pinta de
// branco tudo o que fica fora do desenho; aqui ele vira uma máscara, para o fundo de fora
// ficar transparente (o uniforme fica igual sobre fundo branco e também funciona no escuro).
const PARTS: readonly { part: Part; x: number; y: number; w: number; h: number; overlay: string; edge: string }[] = [
  { part: "la", x: 0, y: 0, w: 31, h: 59, overlay: "kit_left_arm.svg", edge: "M-1-1V60H30.5V31.5L25,37 12,24 30.5,5.5h2V-1" },
  { part: "b", x: 31, y: 0, w: 38, h: 59, overlay: "kit_body.svg", edge: "M-2-1V60H39V58.5H-1V5.5H10c9,4 9,4 18,0H39V-1" },
  { part: "ra", x: 69, y: 0, w: 31, h: 59, overlay: "kit_right_arm.svg", edge: "M-1-1V5.5H.5L19,24 6,37 .5,31.5V60H32V-1" },
  { part: "sh", x: 0, y: 59, w: 100, h: 36, overlay: "kit_shorts.svg", edge: "m-2-2v40h104V-2zm33,0H69l5,37.5H54l-4-13-4,13H26z" },
  { part: "so", x: 0, y: 95, w: 100, h: 40, overlay: "kit_socks_long.svg", edge: "M-3-3V43H31.5L29.5,9.5H44.5V43H55.5V9.5H70.5L68.5,43H103V-3z" },
];

const KITS = kitsData as Record<string, Kit[]>;

/** Uniforme liso com as cores dadas (clubes sem dados, ex.: criados pelo jogador). */
export function plainKit(colors: readonly string[], name = "Titular"): Kit {
  const c0 = colors[0] ?? "#FFFFFF";
  const c1 = colors[1] ?? (luminance(c0) > 0.6 ? "#111111" : "#FFFFFF");
  return { name, la: c0, b: c0, ra: c0, sh: c1, so: c0, synthetic: true };
}

/** Uniformes do clube (o primeiro é o titular). Vazio se o clube não tiver dados. */
export function kitsOf(clubId: string): Kit[] {
  return KITS[clubId] ?? [];
}

/** Cor que representa a camisa (para marcadores e para checar contraste). */
export function kitShirtColor(kit: Kit): string {
  return kit.shirt ?? kit.b;
}

// ---------------------------------------------------------------- contraste entre camisas
function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** sRGB -> CIE Lab (D65). */
function lab(hex: string): [number, number, number] {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex).map(lin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Distância perceptual (ΔE CIE76) entre duas cores. */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** ΔE mínimo para duas camisas não se confundirem em campo. */
const MIN_CONTRAST = 40;

/** Uniformes de uma partida: mandante de titular; visitante com o primeiro uniforme que
 * contrasta com a camisa do mandante (se nenhum contrastar, o segundo uniforme). */
export function pickKits(homeId: string, awayId: string): { home: Kit; away: Kit } {
  const home = kitsOf(homeId)[0] ?? plainKit(["#FFFFFF", "#111111"]);
  const hc = kitShirtColor(home);
  const options = kitsOf(awayId);
  if (!options.length) {
    const alt = luminance(hc) > 0.5 ? ["#1B3E8F", "#FFFFFF"] : ["#FFFFFF", "#111111"];
    return { home, away: plainKit(alt, "Reserva") };
  }
  const away = options.find((k) => colorDistance(kitShirtColor(k), hc) >= MIN_CONTRAST) ?? options[1] ?? options[0];
  return { home, away };
}

// ---------------------------------------------------------------- desenho
/** Uniforme completo (camisa, calção e meias) em SVG, como na infobox da Wikipedia. */
/** Uniforme; com `supplier`, a logo da fornecedora aparece no peito (lado esquerdo, como na camisa real). */
export function KitView({ kit, width = 64, title, supplier }: { kit: Kit; width?: number; title?: string; supplier?: string }) {
  const logo = supplier ? brandLogo(supplier) : null;
  const label = title ?? kit.name;
  const maskId = `kit${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg className="kit" width={width} height={(width * 135) / 100} viewBox="0 0 100 135" role="img" aria-label={label}>
      <title>{label}</title>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="135">
          {PARTS.map(({ part, x, y, w, h, edge }) => (
            <svg key={part} x={x} y={y} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              <rect width={w} height={h} fill="#fff" />
              <path d={edge} fill="#000" stroke="#fff" strokeLinejoin="round" />
            </svg>
          ))}
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        {PARTS.map(({ part, x, y, w, h, overlay }) => {
          const pattern = kit[`p${part}`];
          return (
            <g key={part}>
              <rect x={x} y={y} width={w} height={h} fill={kit[part]} />
              {pattern && (
                <image href={mediaUrl(`kits/${pattern}`)} x={x} y={y} width={w} height={h} preserveAspectRatio="xMinYMin meet" />
              )}
              <image href={mediaUrl(`kits/${overlay}`)} x={x} y={y} width={w} height={h} preserveAspectRatio="none" />
            </g>
          );
        })}
      </g>
      {logo && <image href={mediaUrl(logo)} x={56} y={12} width={10} height={8} preserveAspectRatio="xMidYMid meet" opacity={0.92} />}
    </svg>
  );
}
