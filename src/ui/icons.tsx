// Conjunto de ícones do jogo: duotom (traço 2 px + preenchimento suave na cor de destaque),
// com detalhes de futebol. Cada ícone pode ser trocado por uma imagem própria:
// coloque public/media/icons/<nome>.png (512 px, fundo transparente) e o jogo usa a imagem,
// caindo de volta para o SVG quando o arquivo não existe.
import { useState, type ReactElement } from "react";
import { mediaUrl } from "./mediaUrl";

/** d = traço; f = camada de preenchimento (duotom). */
export const DUO: Record<string, { d: string; f?: string }> = {
  home: { d: "M3 11 12 3.5 21 11M5 9.5V20h5v-5.5h4V20h5V9.5", f: "M5 10 12 4.5 19 10v10h-5v-5.5h-4V20H5z" },
  squad: { // duas camisas
    d: "M5 6.5 8 5a2 2 0 0 0 4 0l3 1.5 1.5 3.5-2 1V19H5.5v-8l-2-1zM16 5.2 17.5 5a2 2 0 0 0 2.5-.3l1 1.3-1 3.2-1.5.6V16",
    f: "M5 6.5 8 5a2 2 0 0 0 4 0l3 1.5 1.5 3.5-2 1V19H5.5v-8l-2-1z",
  },
  trophy: { // taça com alças e base
    d: "M7 3.5h10v5a5 5 0 0 1-10 0zM7 5.5H4.5a3 3 0 0 0 3 4.3M17 5.5h2.5a3 3 0 0 1-3 4.3M12 13.5V17M8.5 20.5h7M9.5 17h5l1 3.5h-7z",
    f: "M7 3.5h10v5a5 5 0 0 1-10 0zM9.5 17h5l1 3.5h-7z",
  },
  market: { // etiqueta de preço com bola
    d: "M3.5 12.5 11 5h8.5v8.5L12 21zM16 8.5h.01",
    f: "M3.5 12.5 11 5h8.5v8.5L12 21z",
  },
  club: { // escudo com faixa
    d: "M12 3 4.5 5.5V11c0 5 3.3 8.5 7.5 10 4.2-1.5 7.5-5 7.5-10V5.5zM4.8 11h14.4M12 3v18",
    f: "M12 3 4.5 5.5V11h7.5zM12 11h7.5c0 5-3.3 8.5-7.5 10z",
  },
  board: { // prancheta tática
    d: "M6 4.5h12a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1zM9 3h6v3H9zM8.5 10.5l2 2m0-2-2 2M15.5 16a1.5 1.5 0 1 0 0-.01M10 16c2-2 3.5-4 5-5.5m0 0h-2.2m2.2 0v2.2",
    f: "M6 4.5h12a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z",
  },
  boot: { // chuteira (treino)
    d: "M3.5 8.5h6l1.5 3 7 1.5a3 3 0 0 1 2.5 3V17H3.5zM3.5 17v1.5M7 17v1.5M11 17v1.5M15 17v1.5M19 17v1.5M9.5 8.5 10 11M12.5 12l.5 2M15.5 12.8l.3 2",
    f: "M3.5 8.5h6l1.5 3 7 1.5a3 3 0 0 1 2.5 3V17H3.5z",
  },
  whistle: {
    d: "M4 13a5 5 0 1 0 10 0l7-4V6h-9.5A5 5 0 0 0 4 13zM13 6V4M9 13h.01",
    f: "M4 13a5 5 0 1 0 10 0l7-4V6h-9.5A5 5 0 0 0 4 13z",
  },
  scarf: { // cachecol da torcida
    d: "M4 6c3 2 13 2 16 0v4c-3 2-13 2-16 0zM6 9.5v10l2-1.5 2 1.5v-9.6M15 10.4V20l2-1.5 2 1.5V9.6",
    f: "M4 6c3 2 13 2 16 0v4c-3 2-13 2-16 0z",
  },
  mail: { d: "M3.5 6h17v12h-17zM3.5 6.5l8.5 6.5 8.5-6.5", f: "M3.5 6h17v12h-17z" },
  sprout: { // muda + bola (base)
    d: "M12 20v-8M12 12C12 8 9 5.5 4.5 5.5c0 4 3 6.5 7.5 6.5zM12 10.5c0-3 2.5-5.5 7.5-5.5 0 4-3 6-7.5 6M8 20h8",
    f: "M12 12C12 8 9 5.5 4.5 5.5c0 4 3 6.5 7.5 6.5zM12 10.5c0-3 2.5-5.5 7.5-5.5 0 4-3 6-7.5 6z",
  },
  shirt: { d: "M8 3.5 3.5 6l1.8 4.3L7 9.6V20.5h10V9.6l1.7.7L20.5 6 16 3.5a4 4 0 0 1-8 0zM12 11v4", f: "M8 3.5 3.5 6l1.8 4.3L7 9.6V20.5h10V9.6l1.7.7L20.5 6 16 3.5a4 4 0 0 1-8 0z" },
  coins: {
    d: "M9 4.5c3.3 0 6 1.3 6 3s-2.7 3-6 3-6-1.3-6-3 2.7-3 6-3zM3 7.5v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4M9 14.5v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.6-2.4-2.9-5.5-3M21 12.5c0 1.7-2.7 3-6 3",
    f: "M9 4.5c3.3 0 6 1.3 6 3s-2.7 3-6 3-6-1.3-6-3 2.7-3 6-3z",
  },
  briefcase: { d: "M3.5 8h17v11.5h-17zM9 8V5.5h6V8M3.5 13h17M11 13v2h2v-2", f: "M3.5 8h17v5h-17z" },
  calendar: { d: "M4 5.5h16v15H4zM4 10h16M8.5 3v4M15.5 3v4M8 14h2v2H8z", f: "M4 5.5h16V10H4z" },
  stadium: { // silhueta de estádio com refletores
    d: "M2.5 17c0-3.3 4.3-5.5 9.5-5.5s9.5 2.2 9.5 5.5M2.5 17v3h19v-3M7 20v-2.5h10V20M4.5 12V5M19.5 12V5M3 5h3M18 5h3M12 11.5V8",
    f: "M2.5 17c0-3.3 4.3-5.5 9.5-5.5s9.5 2.2 9.5 5.5v3h-19z",
  },
  mic: { d: "M12 3a3 3 0 0 0-3 3v5.5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6", f: "M12 3a3 3 0 0 0-3 3v5.5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" },
  bank: { d: "M3 9.5 12 4l9 5.5zM5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5M3 20.5h18M4 17.5h16", f: "M3 9.5 12 4l9 5.5z" },
  crane: { d: "M6 21V4l13 3.5M6 7.5h14M18.5 7.5v4.5M16.5 12h4v3h-4zM3 21h8.5M6 4 3 7.5M9 7.5 6 11M12 7.5 9 11", f: "M16.5 12h4v3h-4z" },
  handshake: { d: "M2 11.5 6 7.5l4 2 3-2 3 2 4-2 2 4-6 6-3-2-2 2-3-3-2 1zM9 13.5l3 3M12 12.5l3 3", f: "M6 7.5l4 2 3-2 3 2 4-2 2 4-6 6-3-2-2 2-3-3-2 1L2 11.5z" },
  gear: { d: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM10.5 3h3l.5 2.5 2 1 2.3-1.2 2.1 2.1L19.2 9.7l1 2 2.3.8v3l-2.3.5-1 2 1.2 2.3-2.1 2.1-2.3-1.2-2 1-.5 2.3h-3l-.5-2.3-2-1-2.3 1.2-2.1-2.1 1.2-2.3-1-2L1.5 15v-3l2.3-.5 1-2-1.2-2.3 2.1-2.1L8 6.5l2-1z", f: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" },
  star: { d: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", f: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" },
  medal: { d: "M7.5 2.5 12 9l4.5-6.5M9 2.5h6M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 12.5l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 14.8l2-.3z", f: "M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12z" },
  compass: { d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z", f: "M15.5 8.5l-2 5-5 2 2-5z" },
  save: { d: "M5 3.5h11l3.5 3.5v13.5H5zM8 3.5v5h7v-5M8 20.5v-6.5h8v6.5", f: "M8 14h8v6.5H8z" },
  news: { d: "M4 5h13v14.5H6a2 2 0 0 1-2-2zM17 9h3v8.5a2 2 0 0 1-2 2M7 8.5h7M7 12h7M7 15.5h4", f: "M4 5h13v14.5H6a2 2 0 0 1-2-2z" },
  ball: { d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5l4 2.9-1.5 4.7h-5L8 10.4zM12 3v4.5M16 10.4l4.5-1.6M14.5 15.1l2.7 4M9.5 15.1l-2.7 4M8 10.4 3.5 8.8", f: "M12 7.5l4 2.9-1.5 4.7h-5L8 10.4z" },
  play: { d: "M7.5 4.5v15l12-7.5z", f: "M7.5 4.5v15l12-7.5z" },
  ff: { d: "M3.5 6v12l8-6zM12.5 6v12l8-6z", f: "M3.5 6v12l8-6zM12.5 6v12l8-6z" },
  compare: { d: "M7 4v16M17 4v16M3.5 8 7 4l3.5 4M13.5 16l3.5 4 3.5-4", f: "M3.5 8 7 4l3.5 4zM13.5 16l3.5 4 3.5-4z" },
  scout: { d: "M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm10.5 16.5-6-6M10 7v6M7 10h6", f: "M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" },
  binoculars: { d: "M6.5 8a3.5 3.5 0 1 0 0 .01M17.5 8a3.5 3.5 0 1 0 0 .01M3 15.5a3.5 3.5 0 1 0 7 0V8M14 8v7.5a3.5 3.5 0 1 0 7 0M10 10h4", f: "M3 15.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0zM14 15.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z" },
  bell: { d: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20.5a2 2 0 0 0 4 0", f: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" },
};

/** Nome do arquivo de imagem (public/media/icons/<slug>.png) → ícone SVG de reserva. */
export const ICON_SLUGS = {
  inicio: "home", elenco: "squad", tatica: "board", treino: "boot", mercado: "market", olheiros: "binoculars",
  base: "sprout", financas: "coins", estrutura: "crane", patrocinios: "handshake", noticias: "news",
  "caixa-entrada": "mail", calendario: "calendar", competicoes: "trophy", clube: "club", carreira: "briefcase",
  conquistas: "medal", configuracoes: "gear", salvar: "save", jogar: "play", "modo-rapido": "ff",
  continuar: "play", selecao: "star", estadio: "stadium", torcida: "scarf", coletiva: "mic",
  diretoria: "bank", comparar: "compare", vestiario: "shirt", lendas: "star",
} as const;
export type IconSlug = keyof typeof ICON_SLUGS;

// arquivos que já falharam nesta sessão (evita pedir de novo a cada render)
const missing = new Set<string>();

/**
 * Ícone do jogo com troca opcional por imagem: tenta media/icons/<slug>.png e,
 * se não existir, mostra o SVG duotom.
 */
export function GameIcon({ slug, size = 22, svg }: { slug: IconSlug; size?: number; svg: (name: string, size: number) => ReactElement }) {
  const [failed, setFailed] = useState(() => missing.has(slug));
  if (failed) return svg(ICON_SLUGS[slug], size);
  return (
    <img className="game-icon" src={mediaUrl(`icons/${slug}.png`)} width={size} height={size} alt="" aria-hidden="true" decoding="async" draggable={false}
      onError={() => { missing.add(slug); setFailed(true); }} />
  );
}
