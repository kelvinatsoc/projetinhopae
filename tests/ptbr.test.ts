// Garante que o texto do jogo usa o vocabulário do futebol brasileiro:
// nada de português de Portugal nem jargão estrangeiro sem tradução.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "src");

/** Termos proibidos dentro de strings (regex, sem diferenciar maiúsculas). */
const BLACKLIST: [RegExp, string][] = [
  [/gegenpress/i, "Pressão alta"],
  [/tiki-?taka/i, "Toque de bola"],
  [/jogo direto/i, "Ligação direta"],
  [/\bequipas?\b/i, "time/equipe"],
  [/\bgolos?\b/i, "gol"],
  [/\bplantel\b/i, "elenco"],
  [/guarda-redes/i, "goleiro"],
  [/\brelvado\b/i, "gramado"],
  [/\bregisto\b/i, "registro"],
  [/\becrã\b/i, "tela"],
  [/telemóvel/i, "celular"],
  [/\bextremos? (direito|esquerdo)\b/i, "ponta"],
  [/\bmédios? (centro|defensivo|ofensivo)\b/i, "volante/meia"],
  [/\bavançados?\b/i, "atacante"],
  [/\bdefesa-central\b/i, "zagueiro"],
  [/\bbox-to-box\b/i, "segundo volante"],
  [/\bregista\b/i, "primeiro volante"],
  [/\bmezzala|trequartista|raumdeuter|enganche\b/i, "função em português"],
  [/\bhat-trick\b/i, "três gols"],
  [/\bStaff\b/, "comissão técnica"],
  [/\bfair[ -]?play\b/i, "disciplina"],
  [/\bcounter-?press/i, "pressão pós-perda"],
  [/\bSquad\b/, "elenco"],
];

/** Nomes próprios permitidos mesmo contendo um termo da lista. */
const ALLOW: RegExp[] = [/Extremo Sul/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

/** Extrai literais de string e textos JSX, ignorando comentários e imports. */
function texts(src: string): string[] {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const out: string[] = [];
  const lit = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  for (const line of noComments.split("\n")) {
    if (/^\s*(import|export \* from)\b/.test(line)) continue;
    let m: RegExpExecArray | null;
    while ((m = lit.exec(line))) out.push(m[2]);
    for (const j of line.matchAll(/>([^<>{}]+)</g)) out.push(j[1]);
  }
  return out;
}

describe("vocabulário pt-BR", () => {
  it("não usa termos de Portugal nem jargão estrangeiro", () => {
    const bad: string[] = [];
    for (const f of files(ROOT)) {
      for (const t of texts(readFileSync(f, "utf8"))) {
        let s = t;
        for (const a of ALLOW) s = s.replace(a, "");
        for (const [re, fix] of BLACKLIST) if (re.test(s)) bad.push(`${f.slice(ROOT.length + 1)}: "${t.slice(0, 80)}" → use "${fix}"`);
      }
    }
    expect(bad).toEqual([]);
  });
});
