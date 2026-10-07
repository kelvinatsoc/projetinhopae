import { describe, expect, it, vi } from "vitest";
import db from "../src/data/database.json";
import { ESTADUAIS } from "../src/data/estaduais";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ensureMinorClubs, estadualTitles, isEstadual, isFictional } from "../src/engine/estaduais";
import { advance, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { simulateFixture } from "../src/engine/match";
import type { World } from "../src/engine/types";
import { createWorld, migrateWorld, type Database } from "../src/engine/world";

// a tela de histórico é renderizada no servidor (sem DOM): o store é trocado por um mínimo
const ui = vi.hoisted(() => ({ world: null as unknown }));
vi.mock("../src/store", () => {
  const noop = () => {};
  return { useWorld: () => ui.world, forceBack: noop, push: noop, resetNav: noop, setTab: noop, setWorld: noop, toast: noop, update: noop };
});

function play(w: World, untilDay = 999) {
  for (let i = 0; i < 400; i++) {
    if (w.day > untilDay) break;
    const r = advance(w);
    if (r.reason === "match" && r.fixture) {
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
    } else if (r.reason === "seasonEnd") break;
  }
}

const estComps = (w: World) => Object.values(w.comps).filter(isEstadual);

function noClashes(w: World) {
  const seen = new Set<string>();
  for (const f of w.fixtures) {
    for (const c of [f.home, f.away]) {
      const k = `${c}@${f.day}`;
      expect(seen.has(k), `${c} joga duas vezes no dia ${f.day}`).toBe(false);
      seen.add(k);
    }
  }
}

describe("campeonatos estaduais", () => {
  it("cria os estaduais só com clubes reais do estado, os de fora da pirâmide sem disputar as séries", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "palmeiras", seed: 11 });
    const comps = estComps(w);
    expect(comps.length).toBe(ESTADUAIS.length);
    for (const c of comps) {
      const def = ESTADUAIS.find((e) => e.id === c.id)!;
      expect(c.teams.length).toBe(def.size);
      expect(new Set(c.teams).size).toBe(def.size);
      for (const id of c.teams) expect(w.clubs[id].region).toBe(def.uf);
    }
    expect(w.comps["est-SP"].groups.length).toBe(4);
    expect(w.comps["est-SP"].teams).toContain("palmeiras");
    // nenhum clube inventado: os que só jogam o estadual são reais (nome, escudo, estádio do banco)
    expect(Object.values(w.clubs).some(isFictional)).toBe(false);
    const minors = Object.values(w.clubs).filter((c) => c.minor);
    expect(minors.length).toBeGreaterThanOrEqual(60);
    for (const m of minors) {
      expect(m.region).toBe(m.minor);
      expect(m.stadium).not.toMatch(/^Estádio (de|Municipal de) /);
      expect(m.players.filter((id) => !w.players[id].youth).length).toBeGreaterThanOrEqual(20);
      for (const id of ["serieA", "serieB", "serieC", "copaBR"]) expect(w.comps[id].teams).not.toContain(m.id);
    }
    expect(minors.filter((m) => m.logo).length).toBeGreaterThanOrEqual(15); // escudos oficiais (o resto: padrão gerado)
    // participantes reais de 2026 entram primeiro
    for (const def of ESTADUAIS) {
      for (const id of def.real2026) {
        expect(w.clubs[id], `${id} existe no banco`).toBeTruthy();
        expect(w.comps[def.id].teams, `${id} no ${def.short}`).toContain(id);
      }
    }
    // a Série D (sorteio de acesso) não muda: só clubes sem "minor"
    expect(Object.values(w.clubs).filter((c) => c.div === "D" && !c.minor).length).toBe(
      (db as Database).clubs.filter((c) => c.div === "D" && !c.minor).length);
    // datas de janeiro a março e sem dois jogos do mesmo clube no mesmo dia
    for (const f of w.fixtures.filter((x) => x.comp.startsWith("est-"))) expect(f.day).toBeLessThan(90);
    noClashes(w);
    expect(w.board.estadual?.code).toBe("title");
  });

  it("temporada completa com estaduais: campeões, troféus, prêmios e virada de ano (determinístico)", () => {
    const run = () => {
      const w = createWorld(db as Database, { managerName: "T", clubId: "bahia", seed: 2026 });
      play(w, 85);
      return w;
    };
    const a = run();
    const b = run();
    const champs = (w: World) => estComps(w).map((c) => `${c.id}:${c.champion}`).join(",");
    for (const c of estComps(a)) {
      expect(c.done, `${c.id} terminou`).toBe(true);
      expect(c.teams).toContain(c.champion);
    }
    expect(champs(a)).toBe(champs(b));
    noClashes(a);
    expect(a.clubs.bahia.finance.income.prize ?? 0).toBeGreaterThan(0);

    play(a);
    expect(a.seasonEnded).toBe(true);
    const champions = estComps(a).map((c) => c.champion!);
    runEndOfSeason(a);
    expect(a.season).toBe(2027);
    for (const id of champions) {
      expect(estadualTitles(a.clubs[id])).toBeGreaterThanOrEqual(1);
      expect(a.clubs[id].history.at(-1)!.titles.some((t) => t.startsWith("est-"))).toBe(true);
    }
    expect(Object.keys(a.history.at(-1)!.champions).filter((k) => k.startsWith("est-")).length).toBe(ESTADUAIS.length);
    // pirâmide intacta: fictícios continuam fora das séries
    expect(Object.values(a.clubs).filter((c) => c.div === "A").length).toBe(20);
    for (const id of ["serieA", "serieB", "serieC", "copaBR"]) {
      expect(a.comps[id].teams.some((t) => a.clubs[t].minor)).toBe(false);
      expect(a.comps[id].teams.some((t) => isFictional(a.clubs[t]))).toBe(false);
    }
    expect(estComps(a).length).toBe(ESTADUAIS.length);
    noClashes(a);
  }, 120000);

  it("nenhum estadual usa clube fictício quando existe um real do estado", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 3 });
    for (const def of ESTADUAIS) {
      const comp = w.comps[def.id];
      const realOfUf = Object.values(w.clubs).filter((c) => c.country === "BRA" && c.region === def.uf && !isFictional(c));
      const unused = realOfUf.filter((c) => !comp.teams.includes(c.id));
      for (const id of comp.teams) {
        if (isFictional(w.clubs[id])) expect(unused.length, `${def.short} usa ${id} com reais sobrando`).toBe(0);
      }
      expect(realOfUf.length, `${def.short} tem reais suficientes`).toBeGreaterThanOrEqual(def.size);
    }
  });

  it("elenco gerado dos clubes reais sem elenco publicado é o mesmo em qualquer jogo novo", () => {
    const names = (seed: number) => {
      const w = createWorld(db as Database, { managerName: "T", clubId: "sport", seed });
      const club = Object.values(w.clubs).find((c) => c.genSquad)!;
      expect(club).toBeTruthy();
      return club.players.map((id) => w.players[id]).filter((p) => !p.youth).slice(0, 23).map((p) => `${p.name}:${p.pos}:${p.ovr}`);
    };
    expect(names(1)).toEqual(names(99));
  });

  it("save antigo com fictícios: reais entram na hora, troca só na virada e o histórico continua abrindo", async () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "remo", seed: 8 });
    // simula um save da versão com fictícios: sem os clubes reais "minor", com os inventados
    for (const c of Object.values(w.clubs).filter((x) => x.minor)) {
      for (const id of c.players) delete w.players[id];
      delete w.clubs[c.id];
    }
    for (const c of estComps(w)) delete w.comps[c.id];
    w.fixtures = w.fixtures.filter((f) => !f.comp.startsWith("est-"));
    ensureMinorClubs(w);
    const fict = Object.values(w.clubs).filter(isFictional);
    expect(fict.length).toBeGreaterThan(20);
    for (const c of fict) delete c.fictional; // saves antigos não tinham a flag
    const old = fict.find((c) => c.region === "PA")!;
    w.history.push({ season: 2025, champions: { "est-PA": old.id } } as World["history"][number]);
    const loaned = w.players[w.clubs.remo.players[0]];
    loaned.sellOn = { club: old.id, pct: 10 };
    // jogador do Remo emprestado ao fictício: tem de voltar ao Remo quando o fictício sair
    const lent = w.players[w.clubs.remo.players.find((id) => w.players[id].pos === "ATA" && id !== loaned.id)!];
    w.clubs.remo.players = w.clubs.remo.players.filter((id) => id !== lent.id);
    old.players.push(lent.id);
    lent.clubId = old.id;
    lent.loan = { from: "remo", until: 2030, wagePct: 50, since: 2026 };
    w.clubs.remo.loanedOut = [lent.id];
    const save = JSON.parse(JSON.stringify(w)) as World;
    migrateWorld(save, db as Database);
    // reais já existem, fictícios continuam até a virada (nenhum jogo da temporada mexe)
    expect(save.pendingEstadualSwap).toBe(true);
    expect(save.clubs.retro).toBeTruthy();
    expect(save.clubs[old.id]).toBeTruthy();
    const again = JSON.stringify(save);
    migrateWorld(save, db as Database); // idempotente
    expect(Object.keys(save.clubs).length).toBe(Object.keys(JSON.parse(again).clubs).length);
    play(save);
    runEndOfSeason(save);
    expect(save.pendingEstadualSwap).toBeUndefined();
    expect(Object.values(save.clubs).some(isFictional)).toBe(false);
    for (const c of estComps(save)) for (const id of c.teams) expect(isFictional(save.clubs[id])).toBe(false);
    expect(Object.values(save.players).some((p) => p.clubId && !save.clubs[p.clubId])).toBe(false);
    expect(save.players[loaned.id]?.sellOn).toBeUndefined();
    expect(save.players[lent.id]?.clubId).toBe("remo");
    expect(save.players[lent.id]?.loan).toBeUndefined();
    expect(save.formerClubs?.[old.id]).toBe(old.name);
    // a tela de histórico abre e mostra o campeão que saiu do mundo
    const { HistoryScreen } = await import("../src/ui/screens/Club");
    ui.world = save;
    const html = renderToString(createElement(HistoryScreen));
    expect(html).toContain(old.name);
    ui.world = null;
  }, 120000);

  it("save antigo (sem estaduais) carrega e ganha os estaduais na temporada seguinte", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "sport", seed: 5 });
    // simula um save de antes dos estaduais
    for (const c of estComps(w)) delete w.comps[c.id];
    w.fixtures = w.fixtures.filter((f) => !f.comp.startsWith("est-"));
    for (const c of Object.values(w.clubs).filter((x) => x.minor)) {
      for (const id of c.players) delete w.players[id];
      delete w.clubs[c.id];
    }
    delete w.board.estadual;
    const save = JSON.parse(JSON.stringify(w)) as World;
    save.version = 2;
    migrateWorld(save, db as Database);
    expect(estComps(save).length).toBe(0);
    play(save);
    expect(save.seasonEnded).toBe(true);
    runEndOfSeason(save);
    expect(estComps(save).length).toBe(ESTADUAIS.length);
    expect(save.comps["est-PE"].teams).toContain("sport");
    expect(save.board.estadual?.comp).toBe("est-PE");
  }, 120000);
});
