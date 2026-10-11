// Modo leve para celulares fracos (ex.: Redmi 10A: Helio G25, 2–3 GB de RAM, GPU PowerVR GE8320).
// Detecta o aparelho (memória, núcleos, GPU do WebGL e FPS medido) e liga a classe `lite` no <html>:
// sem blur/backdrop-filter, sem animações pesadas, sede em grade de botões e partida no campo 2D.
// O usuário escolhe em Ajustes: Automático, Leve ou Completo.

export type PerfMode = "auto" | "leve" | "completo";
const KEY = "ldb.perf";
const SLOW_KEY = "ldb.perf.slow";

export interface DeviceInfo {
  memory?: number; // GB (navigator.deviceMemory)
  cores?: number;
  gpu?: string; // renderer do WebGL
  fps?: number; // medido na abertura
}

/** GPUs de entrada que travam com 3D, blur e muitas camadas. */
const WEAK_GPU = /PowerVR|GE8\d{3}|Mali-(4\d\d|T\d+|G31|G51|G52 MC1)|Adreno \(TM\) (3\d\d|4\d\d|50\d|505|506|508|509|510|512)|SwiftShader|llvmpipe/i;

/** Aparelho fraco? Função pura (testável): qualquer sinal forte basta. */
export function isWeakDevice(d: DeviceInfo): boolean {
  if (d.memory != null && d.memory <= 3) return true;
  if (d.cores != null && d.cores <= 4) return true;
  if (d.gpu && WEAK_GPU.test(d.gpu)) return true;
  if (d.fps != null && d.fps < 40) return true;
  return false;
}

let gpuCache: string | null | undefined;
/** Nome da GPU (sem custo depois da primeira chamada). */
export function gpuName(): string | undefined {
  if (gpuCache !== undefined) return gpuCache ?? undefined;
  gpuCache = null;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      gpuCache = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    /* sem WebGL */
  }
  return gpuCache ?? undefined;
}

export function deviceInfo(): DeviceInfo {
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  let fps: number | undefined;
  try {
    const v = localStorage.getItem(SLOW_KEY);
    if (v) fps = Number(v);
  } catch {
    /* */
  }
  return { memory: nav?.deviceMemory, cores: nav?.hardwareConcurrency, gpu: gpuName(), fps };
}

export function readPerfMode(): PerfMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "leve" || v === "completo" || v === "auto") return v;
  } catch {
    /* */
  }
  return "auto";
}

export function savePerfMode(m: PerfMode) {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* */
  }
  applyLite();
}

/** O app está no modo leve agora? */
export function isLite(): boolean {
  const m = readPerfMode();
  if (m !== "auto") return m === "leve";
  return isWeakDevice(deviceInfo());
}

/** Liga/desliga a classe `lite` no <html> (CSS em theme.css). */
export function applyLite() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("lite", isLite());
}

/**
 * Mede o FPS por ~1,5 s com a tela parada (uma vez por aparelho). Abaixo de 40 quadros, o modo
 * automático passa a ser o leve.
 */
export function measureFpsOnce() {
  try {
    if (localStorage.getItem(SLOW_KEY) || typeof requestAnimationFrame === "undefined") return;
  } catch {
    return;
  }
  let n = 0;
  const t0 = performance.now();
  const step = () => {
    n++;
    const dt = performance.now() - t0;
    if (dt < 1500) requestAnimationFrame(step);
    else {
      const fps = Math.round((n * 1000) / dt);
      try { localStorage.setItem(SLOW_KEY, String(fps)); } catch { /* */ }
      applyLite();
    }
  };
  // espera o app assentar (a medida não deve pegar o carregamento)
  window.setTimeout(() => requestAnimationFrame(step), 2500);
}

/** Roda quando o navegador estiver ocioso (ou logo, se não houver requestIdleCallback). */
export function whenIdle(fn: () => void, timeout = 2000) {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout });
  else window.setTimeout(fn, 60);
}
