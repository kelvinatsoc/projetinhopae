// Rostos dos jogadores gerados com a biblioteca facesjs (Apache-2.0).
// Cada jogador tem uma semente fixa; o rosto muda com a idade (barba, cabelos brancos, rugas)
// e veste a camisa do clube atual.
import { display, generate } from "facesjs";
import { makeRng } from "../engine/rng";
import type { Club, Player } from "../engine/types";

const cache = new Map<string, string>();

const GRAY = ["#8d8d8d", "#a9a9a9", "#c4c4c4"];

// O facesjs precisa desenhar dentro do documento (usa getBBox); usamos um contêiner escondido.
let host: HTMLDivElement | null = null;
function render(face: Parameters<typeof display>[1]): string {
  if (!host) {
    host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-9999px;top:0;width:400px;height:600px;visibility:hidden;pointer-events:none";
    document.body.appendChild(host);
  }
  display(host, face);
  const html = host.innerHTML;
  host.innerHTML = "";
  return html;
}

export function faceSvg(p: Player, club: Club | null | undefined, season: number): string {
  const ageY = season - p.born;
  const bucket = ageY < 19 ? 0 : ageY < 30 ? 1 : ageY < 34 ? 2 : ageY < 38 ? 3 : 4;
  const colors = club?.colors ?? ["#5a6b62", "#d9e2dc", "#1d2a23"];
  const jersey = club?.jersey ?? "football";
  const o = (p.face.o ?? {}) as { hair?: string; hc?: string; fh?: string; acc?: string };
  const key = `${p.face.s}|${p.face.r}|${bucket}|${colors.join("")}|${jersey}|${o.hair ?? ""}${o.hc ?? ""}${o.fh ?? ""}${o.acc ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rnd = makeRng(p.face.s);
  const original = Math.random;
  Math.random = rnd;
  let face;
  try {
    face = generate(undefined, { race: p.face.r, gender: "male" });
  } finally {
    Math.random = original;
  }
  face.teamColors = [colors[0], colors[1], colors[2] ?? colors[1]];
  face.jersey = { id: jersey };
  face.accessories = { id: "none" };
  face.glasses = { id: "none" };
  // idade
  if (bucket === 0) {
    face.facialHair = { id: "none" };
    face.miscLine = { id: "none" };
    face.smileLine = { id: "none", size: 1 };
    face.fatness = Math.min(face.fatness, 0.3);
  }
  if (bucket >= 3) {
    face.hair.color = GRAY[Math.floor(rnd() * GRAY.length)];
    if (rnd() < 0.5) face.miscLine = { id: "forehead2" };
  } else if (bucket === 2 && rnd() < 0.25) {
    face.miscLine = { id: "forehead1" };
  }
  if (bucket >= 4 && rnd() < 0.5) face.hair.id = "short-bald";
  // visual das lendas
  if (o.hair) face.hair.id = o.hair;
  if (o.hc && bucket < 3) face.hair.color = o.hc;
  if (o.fh) face.facialHair = { id: ageY >= 20 ? o.fh : "none" };
  else if (p.legend && ageY < 22) face.facialHair = { id: "none" };
  if (o.acc) face.accessories = { id: o.acc };

  // recorte do busto (o SVG original é 400x600)
  const svg = render(face).replace('viewBox="0 0 400 600"', 'viewBox="35 50 330 400"');
  cache.set(key, svg);
  if (cache.size > 1500) cache.delete(cache.keys().next().value as string);
  return svg;
}
