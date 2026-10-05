// Onde ficam os arquivos de mídia (fotos, escudos, estádios, uniformes, sons): public/media/.
// Os componentes pedem os arquivos por aqui (caminho relativo a media/, ex.: "players/Q1.webp"),
// sem barra inicial, porque o jogo roda em subpasta (GitHub Pages) e dentro do APK.

/** URL de um arquivo de mídia. */
export function mediaUrl(path: string): string {
  return `media/${path}`;
}

/** Mesmo que mediaUrl(), aceitando caminho vazio (devolve null). */
export function mediaUrlOrNull(path: string | null | undefined): string | null {
  return path ? mediaUrl(path) : null;
}

/** Versão assíncrona (para fetch de áudio/JSON). */
export function resolveMedia(path: string): Promise<string | null> {
  return Promise.resolve(mediaUrl(path));
}
