// Créditos (autor e licença) de cada arquivo de mídia empacotado em public/media/.
export interface Credit { file: string; author: string; license: string; url: string }

let creditsPromise: Promise<Record<string, Credit>> | null = null;

/** Carrega media/credits.json uma única vez (sob demanda). */
export function loadCredits(): Promise<Record<string, Credit>> {
  creditsPromise ??= fetch("media/credits.json")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, Credit>>) : {}))
    .catch(() => ({}));
  return creditsPromise;
}
