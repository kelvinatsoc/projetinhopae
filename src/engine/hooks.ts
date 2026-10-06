// Ganchos de avanço de fase para competições de outros módulos (mundo). Sem dependências de runtime, para não
// sofrer com a ordem de inicialização dos imports circulares.
import type { Competition, World } from "./types";

/** Cada gancho devolve true se tratou a competição. */
export const progressHooks: ((w: World, comp: Competition, news: string[]) => boolean)[] = [];
