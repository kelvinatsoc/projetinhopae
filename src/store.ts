// Estado global simples: o World fica fora do React e um contador de versão
// avisa os componentes para redesenhar depois de cada mudança.
import { useSyncExternalStore } from "react";
import type { World } from "./engine/types";

let world: World | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  for (const l of listeners) l();
}

export function getWorld(): World | null {
  return world;
}

export function setWorld(w: World | null) {
  world = w;
  emit();
}

/** Aplica uma mudança no mundo e redesenha a interface. */
export function update(fn?: (w: World) => void) {
  if (world && fn) fn(world);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Hook: devolve o World atual e redesenha quando ele muda. */
export function useWorld(): World {
  useSyncExternalStore(subscribe, () => version);
  return world as World;
}

export function useVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

// ---------------------------------------------------------------- navegação
export type Tab = "home" | "squad" | "comps" | "market" | "club";

export type Route =
  | { name: "tab" }
  | { name: "player"; id: number }
  | { name: "club"; id: string }
  | { name: "tactics" }
  | { name: "prematch" }
  | { name: "match"; quick?: boolean }
  | { name: "news" }
  | { name: "legends" }
  | { name: "settings" }
  | { name: "credits" }
  | { name: "finances" }
  | { name: "youth" }
  | { name: "history" }
  | { name: "fixture"; id: number }
  | { name: "seasonEnd"; summary: string[] }
  | { name: "fired" }
  | { name: "admin"; tab?: string }
  | { name: "training" }
  | { name: "peneira" }
  | { name: "staff" }
  | { name: "board" }
  | { name: "dressing" }
  | { name: "sponsors" }
  | { name: "facilities" }
  | { name: "setpieces" };

interface NavState {
  tab: Tab;
  stack: Route[];
  toast?: string;
}

let nav: NavState = { tab: "home", stack: [] };
const navListeners = new Set<() => void>();
const emitNav = () => navListeners.forEach((l) => l());

export function useNav(): NavState {
  return useSyncExternalStore(
    (l) => {
      navListeners.add(l);
      return () => navListeners.delete(l);
    },
    () => nav,
  );
}

/** Estado atual da navegação (fora do React, ex.: botão voltar do Android). */
export function getNav(): Readonly<NavState> {
  return nav;
}

export function setTab(tab: Tab) {
  nav = { ...nav, tab, stack: [] };
  emitNav();
  window.scrollTo(0, 0);
}

export function push(r: Route) {
  nav = { ...nav, stack: [...nav.stack, r] };
  history.pushState({ depth: nav.stack.length }, "");
  emitNav();
  window.scrollTo(0, 0);
}

export function replace(r: Route) {
  nav = { ...nav, stack: [...nav.stack.slice(0, -1), r] };
  emitNav();
  window.scrollTo(0, 0);
}

let forcePop = false;

export function back() {
  if (nav.stack.length) history.back();
}

/** Fecha a tela atual mesmo que ela bloqueie o botão voltar (ex.: fim da partida). */
export function forceBack() {
  if (!nav.stack.length) return;
  forcePop = true;
  history.back();
}

export function resetNav() {
  nav = { tab: "home", stack: [] };
  emitNav();
}

window.addEventListener("popstate", () => {
  if (nav.stack.length) {
    const top = nav.stack[nav.stack.length - 1];
    // partida ao vivo não fecha com o botão voltar do celular
    if (!forcePop && (top.name === "match" || top.name === "seasonEnd" || top.name === "fired")) {
      history.pushState({ depth: nav.stack.length }, "");
      return;
    }
    nav = { ...nav, stack: nav.stack.slice(0, -1) };
    emitNav();
  }
  forcePop = false;
});

let toastTimer: number | undefined;
export function toast(msg: string) {
  nav = { ...nav, toast: msg };
  emitNav();
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    nav = { ...nav, toast: undefined };
    emitNav();
  }, 2600);
}
