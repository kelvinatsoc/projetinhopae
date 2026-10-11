// Web Worker do salvamento: compacta o mundo (colunas + JSON + gzip) fora do thread principal,
// para o jogo não engasgar no autosave em celulares fracos.
import { encodeWorld } from "./savePack";
import type { World } from "./engine/types";

self.onmessage = async (e: MessageEvent<{ id: number; world: World }>) => {
  const { id, world } = e.data;
  try {
    const stored = await encodeWorld(world);
    const transfer = stored.fmt === "gz1" ? [stored.data.buffer as ArrayBuffer] : [];
    (self as unknown as Worker).postMessage({ id, stored }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
