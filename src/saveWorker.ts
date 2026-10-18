// Web Worker do salvamento: compacta o mundo (colunas + JSON + gzip) fora do thread principal,
// para o jogo não engasgar no autosave em celulares fracos.
import { encodeWorld } from "./savePack";
import type { World } from "./engine/types";

self.onmessage = async (e: MessageEvent<{ id: number; world?: World; rawJson?: string }>) => {
  const { id, world, rawJson } = e.data;
  try {
    const target = world ?? (rawJson ? JSON.parse(rawJson) as World : null);
    if (!target) throw new Error("mundo vazio");
    const stored = await encodeWorld(target);
    const transfer = stored.fmt === "gz1" ? [stored.data.buffer as ArrayBuffer] : [];
    (self as unknown as Worker).postMessage({ id, stored }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
