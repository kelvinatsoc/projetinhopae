import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { derbyIntensity, derbyName, isDerby, RIVALRIES, rivalsOf } from "../src/data/rivalries";
import { isClassico, withWorldRng } from "../src/engine/common";
import { inboxOf, inboxUnread, markRead, runInboxAction, syncInbox } from "../src/engine/inbox";
import { interact, interactionOptions } from "../src/engine/interactions";
import { applyDerbyOutcome, narrativeOf } from "../src/engine/narrative";
import { addNews } from "../src/engine/news";
import { applyPress, generatePress, pressContext, pressDone, pressEffect } from "../src/engine/press";
import { squadOf } from "../src/engine/lineup";
import type { Fixture, MatchResult, World } from "../src/engine/types";
import { createWorld, migrateWorld, type Database } from "../src/engine/world";

const make = (seed = 7, clubId = "flamengo") => createWorld(db as Database, { managerName: "T", clubId, seed });
const userFixture = (w: World) => w.fixtures.find((f) => f.home === w.userClubId || f.away === w.userClubId)!;
const fakeFixture = (w: World, home: string, away: string): Fixture => ({ id: 999999, comp: "serieA", stage: "league", round: 1, day: w.day, home, away });
const result = (hg: number, ag: number): MatchResult => ({
  hg, ag, events: [], ratings: {}, lineups: [[], []],
  stats: { poss: [50, 50], shots: [0, 0], onTarget: [0, 0], corners: [0, 0], fouls: [0, 0], yellows: [0, 0], reds: [0, 0], xg: [0, 0] },
});

describe("rivalidades", () => {
  it("todos os clubes dos clássicos existem no banco de dados", () => {
    const ids = new Set((db as Database).clubs.map((c) => c.id));
    for (const r of RIVALRIES) {
      expect(ids.has(r.a), r.a).toBe(true);
      expect(ids.has(r.b), r.b).toBe(true);
    }
  });
  it("pares reais são simétricos e alimentam isClassico", () => {
    expect(isDerby("flamengo", "fluminense")).toBe(true);
    expect(isDerby("internacional", "gremio")).toBe(true);
    expect(derbyName("sao-paulo", "palmeiras")).toBe("Choque-Rei");
    expect(derbyIntensity("river-plate", "boca-juniors")).toBe(3);
    expect(derbyIntensity("flamengo", "remo")).toBe(0);
    expect(rivalsOf("flamengo")[0].int).toBe(3);
    const w = make();
    expect(isClassico(w, "bahia", "vitoria")).toBe(true);
  });
  it("vitória no clássico anima elenco, diretoria e torcida", () => {
    const w = make();
    const sq = squadOf(w, w.clubs.flamengo);
    for (const p of sq) p.morale = 60;
    const conf = w.board.confidence;
    applyDerbyOutcome(w, fakeFixture(w, "flamengo", "fluminense"), result(2, 0));
    expect(sq[0].morale).toBe(66);
    expect(w.board.confidence).toBe(conf + 3);
    expect(w.narrative!.fan).toBeGreaterThan(60);
  });
});

describe("coletiva", () => {
  it("gera 3 perguntas com 3 respostas de tons distintos, determinístico", () => {
    const w = make();
    const f = userFixture(w);
    const a = generatePress(w, f, "pre");
    const b = generatePress(w, f, "pre");
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    for (const q of a) {
      expect(q.answers).toHaveLength(3);
      expect(new Set(q.answers.map((x) => x.tone)).size).toBe(3);
    }
  });
  it("clássico gera pergunta sobre o clássico", () => {
    const w = make();
    const qs = generatePress(w, fakeFixture(w, "flamengo", "vasco"), "pre");
    expect(qs.some((q) => q.topic === "derby")).toBe(true);
  });
  it("aplica efeitos uma única vez", () => {
    const w = make();
    const f = userFixture(w);
    const qs = generatePress(w, f, "pre");
    const picks = Object.fromEntries(qs.map((q) => [q.id, q.answers[0].tone]));
    const ctx = pressContext(w, f, "pre");
    const exp = qs.reduce((s, q) => s + pressEffect(w, ctx, q, picks[q.id]).board, 0);
    const conf = w.board.confidence;
    const e = applyPress(w, f, "pre", qs, picks);
    expect(e.board).toBe(exp);
    expect(w.board.confidence).toBe(Math.max(0, Math.min(100, conf + exp)));
    expect(pressDone(w, f.id, "pre")).toBe(true);
    expect(applyPress(w, f, "pre", qs, picks).board).toBe(0);
  });
  it("resposta agressiva sobre jogador temperamental derruba a moral dele", () => {
    const w = make();
    const p = squadOf(w, w.clubs.flamengo)[0];
    p.hid = [10, 10, 10, 18, 10, 10, 8];
    const ctx = pressContext(w, userFixture(w), "pre");
    const e = pressEffect(w, ctx, { id: "x", topic: "player", reporter: "", text: "", pid: p.id, answers: [] }, "aggressive");
    expect(e.player).toBe(-12);
  });
});

describe("caixa de entrada", () => {
  it("embrulha notícias e propostas, com lido e ações", () => {
    const w = make();
    syncInbox(w);
    const before = inboxOf(w).msgs.length;
    expect(before).toBeGreaterThan(0);
    const p = squadOf(w, w.clubs.flamengo)[0];
    addNews(w, "injury", "Lesão", "Fora por 10 dias", { pid: p.id });
    expect(inboxUnread(w)).toBeGreaterThan(0);
    w.offers.push({ id: w.nextId++, pid: p.id, from: "palmeiras", to: "flamengo", fee: 1_000_000, status: "pending", day: w.day, season: w.season, byUser: false });
    syncInbox(w);
    syncInbox(w); // idempotente
    const ib = inboxOf(w);
    expect(ib.msgs.filter((m) => m.kind === "injury")).toHaveLength(1);
    const offer = ib.msgs.find((m) => m.kind === "offer")!;
    expect(offer.actions.map((a) => a.id)).toContain("accept");
    const inj = ib.msgs.find((m) => m.kind === "injury")!;
    markRead(w, inj.id);
    expect(w.news.find((n) => n.id === inj.newsId)!.read).toBe(true);
    const r = runInboxAction(w, offer.id, "reject");
    expect(r.ok).toBe(true);
    expect(w.offers.find((o) => o.id === offer.offerId)!.status).toBe("rejected");
    expect(offer.done).toBe(true);
  });
  it("saves antigos sem os sub-objetos carregam", () => {
    const w = make();
    delete w.narrative;
    delete w.inbox;
    migrateWorld(w, db as Database);
    expect(w.inbox!.msgs).toEqual([]);
    expect(w.narrative!.fan).toBe(60);
  });
});

describe("interações", () => {
  it("elogio para quem está bem sobe a moral; espera de 7 dias", () => {
    const w = make();
    const p = squadOf(w, w.clubs.flamengo)[0];
    p.form = [7.5, 8, 7.4];
    p.morale = 50;
    p.hid = [12, 10, 10, 10, 10, 10, 8];
    const r = withWorldRng(w, () => interact(w, p, "praise"));
    expect(r.ok).toBe(true);
    expect(p.morale).toBe(56);
    expect(interactionOptions(w, p).every((o) => !!o.disabled)).toBe(true);
    expect(withWorldRng(w, () => interact(w, p, "praise")).ok).toBe(false);
  });
  it("crítica injusta revolta temperamental; profissional aceita cobrança na fase ruim", () => {
    const w = make();
    const [a, b] = squadOf(w, w.clubs.flamengo);
    a.form = [7.8, 7.6, 7.5]; a.morale = 60; a.hid = [10, 10, 10, 18, 10, 10, 8];
    b.form = [5.5, 5.8, 6]; b.morale = 60; b.hid = [17, 10, 10, 8, 10, 10, 8];
    withWorldRng(w, () => interact(w, a, "criticize"));
    withWorldRng(w, () => interact(w, b, "criticize"));
    expect(a.morale).toBe(48);
    expect(b.morale).toBe(64);
  });
  it("promessa de minutos cria promessa do vestiário", () => {
    const w = make();
    const p = squadOf(w, w.clubs.flamengo)[3];
    p.promise = undefined;
    withWorldRng(w, () => interact(w, p, "promise"));
    expect(p.promise).toBeDefined();
    expect(narrativeOf(w).talks[p.id]).toBeDefined();
  });
});
