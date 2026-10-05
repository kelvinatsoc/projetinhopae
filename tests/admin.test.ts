import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import {
  adminAllStaffFive, adminBoard, adminClub, adminCreatePlayer, adminEditPlayer, adminFinishProjects, adminForceGem, adminIntake,
  adminLegendWave, adminMoney, adminMovePlayer, adminPoints, adminRetire, adminSetCheat, adminSetOn, adminSetYouth, adminSpawnLegend,
  adminSquad, adminTakeOver, adminUndo, adminCheats, adminForgotPin, adminSetPin, lastUndo, markAdmin,
} from "../src/engine/admin";
import { advance, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { validateWorld } from "../src/engine/integrity";
import { simulateFixture } from "../src/engine/match";
import { rawOvr } from "../src/engine/positions";
import { staffStars } from "../src/engine/staff";
import type { World } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const make = (seed: number, clubId = "flamengo") => {
  const w = createWorld(db as Database, { managerName: "Kelvin", clubId, seed });
  adminSetOn(w, true);
  return w;
};
const valid = (w: World) => expect(validateWorld(w)).toEqual([]);
const user = (w: World) => w.clubs[w.userClubId];
const squad = (w: World) => user(w).players.map((id) => w.players[id]);

describe("modo administrador", () => {
  it("lendas: invocar não duplica e trazer para o clube mantém a lenda ativa", () => {
    const w = make(31);
    const r1 = adminSpawnLegend(w, "pele", "santos");
    expect(r1.ok).toBe(true);
    valid(w);
    const r2 = adminSpawnLegend(w, "pele");
    expect(r2.ok).toBe(false);
    expect(w.legends.pele.appearances).toHaveLength(1);
    const pid = w.legends.pele.active!;
    expect(adminMovePlayer(w, pid, w.userClubId, false).ok).toBe(true);
    valid(w);
    expect(w.legends.pele.active).toBe(pid);
    expect(w.players[pid].clubId).toBe(w.userClubId);
    expect(user(w).players).toContain(pid);
    // pagando o valor
    const z = adminSpawnLegend(w, "zico", "botafogo");
    const bal = user(w).balance;
    expect(adminMovePlayer(w, z.pid!, w.userClubId, true).ok).toBe(true);
    expect(user(w).balance).toBeLessThan(bal);
    valid(w);
  });

  it("editor: idade 30 tira da base; atributo recalcula o overall", () => {
    const w = make(32);
    const kid = squad(w).find((p) => p.youth && !p.legend)!;
    expect(adminEditPlayer(w, kid.id, { age: 30 }).ok).toBe(true);
    expect(kid.youth).toBe(false);
    valid(w);
    const ata = Object.values(w.players).find((p) => p.pos === "ATA" && p.attrs.fin < 90)!;
    expect(adminEditPlayer(w, ata.id, { attrs: { fin: 99 } }).ok).toBe(true);
    expect(ata.ovr).toBe(rawOvr(ata.attrs, ata.pos));
    expect(ata.pot).toBeGreaterThanOrEqual(ata.ovr);
    valid(w);
    // ajustar overall, posições, jogadas e ocultos
    const p = squad(w).find((x) => x.pos === "MC")!;
    expect(adminEditPlayer(w, p.id, { ovrTarget: 88, pos: "MEI", sec: ["MEI", "MC", "PD", "ATA"], traits: ["GAR", "GAR", "XYZ" as never, "LID"], hid: [20, 20, 20, 1, 20, 20, 1] }).ok).toBe(true);
    expect(p.pos).toBe("MEI");
    expect(p.sec).not.toContain("MEI");
    expect(p.sec.length).toBeLessThanOrEqual(3);
    expect(p.traits).toEqual(["GAR", "LID"]);
    valid(w);
  });

  it("entrada inválida devolve ok:false sem mudar nada", () => {
    const w = make(33);
    const p = squad(w)[0];
    const before = JSON.stringify(w);
    expect(adminEditPlayer(w, p.id, { attrs: { fin: 500 } }).ok).toBe(false);
    expect(adminEditPlayer(w, 99_999_999, { age: 20 }).ok).toBe(false);
    expect(adminEditPlayer(w, p.id, { name: "Ok", hid: [1, 2, 3] }).ok).toBe(false);
    expect(adminMovePlayer(w, 99_999_999, null).ok).toBe(false);
    expect(adminRetire(w, 99_999_999).ok).toBe(false);
    expect(adminMoney(w, "nao-existe", { add: 1 }).ok).toBe(false);
    expect(adminClub(w, w.userClubId, { rep: Number.NaN }).ok).toBe(false);
    expect(adminSpawnLegend(w, "fulano").ok).toBe(false);
    expect(adminPoints(w, "serieA", "nao-existe", 3).ok).toBe(false);
    expect(adminSetPin(w, "12a4").ok).toBe(false);
    expect(JSON.stringify(w)).toBe(before);
  });

  it("desfazer restaura exatamente o jogador e o clube", () => {
    const w = make(34);
    const p = squad(w)[3];
    const before = JSON.stringify(p);
    adminEditPlayer(w, p.id, { name: "Mudado", attrs: { vel: 99, def: 1 }, morale: 3 });
    expect(lastUndo(w)).not.toBeNull();
    expect(adminUndo(w).ok).toBe(true);
    expect(JSON.stringify(w.players[p.id])).toBe(before);
    valid(w);
    const c = user(w);
    const bal = c.balance;
    adminMoney(w, c.id, { add: 10_000_000 });
    expect(c.balance).toBe(bal + 10_000_000);
    expect(c.finance.income.admin).toBe(10_000_000);
    adminClub(w, c.id, { facilities: 1, rep: 99, capacity: 999_999 });
    expect(c.capacity).toBe(120_000);
    adminUndo(w);
    adminUndo(w);
    expect(c.balance).toBe(bal);
    expect(c.facilities).not.toBe(1);
    expect(adminUndo(w).ok).toBe(false);
  });

  it("aposentar não deixa ids soltos", () => {
    const w = make(35);
    const c = user(w);
    const id = c.lineup?.starters.find((x) => x != null) ?? c.players[0];
    w.shortlist.push(id!);
    c.lineup = c.lineup ?? { starters: [id!], bench: [], captain: id! };
    c.lineup.captain = id!;
    expect(adminRetire(w, id!).ok).toBe(true);
    expect(w.players[id!]).toBeUndefined();
    expect(c.players).not.toContain(id);
    expect(c.lineup.starters).not.toContain(id);
    expect(c.lineup.captain).toBeUndefined();
    expect(w.shortlist).not.toContain(id);
    valid(w);
    // aposentar uma lenda ativa libera a lenda
    const r = adminSpawnLegend(w, "romario");
    adminRetire(w, r.pid!);
    expect(w.legends.romario.active).toBeUndefined();
    valid(w);
  });

  it("todas as outras ferramentas mantêm o save íntegro", () => {
    const w = make(36);
    const c = user(w);
    for (const op of ["heal", "cond", "morale", "cards", "renew"] as const) { expect(adminSquad(w, op).ok).toBe(true); valid(w); }
    expect(squad(w).every((p) => p.injury === 0 && p.cond === 100 && p.morale === 100)).toBe(true);
    expect(adminMoney(w, c.id, { set: -5 }).ok).toBe(true);
    expect(c.balance).toBe(-5);
    expect(adminMoney(w, c.id, { set: 1e13 }).ok).toBe(true);
    expect(c.balance).toBe(10_000_000_000);
    expect(adminBoard(w, 77, "A-title").ok).toBe(true);
    expect(w.board.objective).toContain("título");
    expect(adminAllStaffFive(w).ok).toBe(true);
    expect(staffStars(w, c, "fis")).toBe(5);
    valid(w);
    const created = adminCreatePlayer(w, { name: "Craque Kelvin", pos: "ATA", age: 16, nat: "BRA", ovr: 70, pot: 95, foot: "E", height: 180, dest: "youth" });
    expect(created.ok).toBe(true);
    expect(w.players[created.pid!].youth).toBe(true);
    expect(w.players[created.pid!].clubId).toBe(c.id);
    valid(w);
    const free = adminCreatePlayer(w, { name: "Livre", pos: "GOL", age: 30, nat: "ARG", ovr: 80, pot: 80, foot: "D", height: 190, dest: "free" });
    expect(w.players[free.pid!].clubId).toBeNull();
    valid(w);
    expect(adminSetYouth(w, created.pid!, false).ok).toBe(true);
    expect(adminMovePlayer(w, free.pid!, "palmeiras").ok).toBe(true);
    expect(adminMovePlayer(w, free.pid!, null).ok).toBe(true);
    valid(w);
    const nBefore = c.players.length;
    expect(adminIntake(w, "dourada").ok).toBe(true);
    expect(c.players.length + (w.peneira?.kids.length ?? 0)).toBeGreaterThan(nBefore - 1);
    valid(w);
    expect(adminForceGem(w).ok).toBe(true);
    expect(w.forceGem).toBe(true);
    expect(adminLegendWave(w).ok).toBe(true);
    valid(w);
    const row = w.comps.serieA.table.find((r) => r.club === c.id)!;
    expect(adminPoints(w, "serieA", c.id, 3).ok).toBe(true);
    expect(row.pts).toBe(3);
    expect(w.comps.serieA.table[0].club).toBe(c.id);
    expect(adminSetCheat(w, "noInj", true).ok).toBe(true);
    expect(adminSetCheat(w, "boost", 0.2).ok).toBe(true);
    expect(adminCheats(w)).toMatchObject({ noInj: true, boost: 0.2 });
    adminSetOn(w, false);
    expect(adminCheats(w)).toEqual({});
    adminSetOn(w, true);
    expect(adminFinishProjects(w).ok).toBe(false);
    expect(adminTakeOver(w, "palmeiras").ok).toBe(true);
    expect(w.userClubId).toBe("palmeiras");
    valid(w);
    expect(adminSetPin(w, "1234").ok).toBe(true);
    expect(adminForgotPin(w, "kelvin ")).toBe(true);
    expect(w.admin?.pin).toBeUndefined();
    expect(w.admin?.log.length).toBeGreaterThan(10);
  });

  it("markAdmin marca a temporada e o fim de temporada grava o selo 🛠️ no histórico", () => {
    const w = make(37);
    markAdmin(w, "teste");
    expect(w.admin?.seasons).toEqual([w.season]);
    expect(w.admin?.everUsed).toBe(true);
    const y = w.season;
    for (let i = 0; i < 400; i++) {
      const r = advance(w);
      if (r.reason === "match" && r.fixture) {
        loadRng(w);
        const res = simulateFixture(w, r.fixture);
        saveRng(w);
        finishUserMatch(w, r.fixture, res);
      } else if (r.reason === "seasonEnd") break;
    }
    runEndOfSeason(w);
    const h = w.managerHistory.find((x) => x.season === y);
    expect(h?.admin).toBe(true);
  }, 60000);
});
