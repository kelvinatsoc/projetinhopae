import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { canEditCustomKit, draftCustomKit, saveCustomKit } from "../src/engine/customKit";
import { activeDeal, currentOffers, rollSponsorDeals, signSponsor, sponsorWindow } from "../src/engine/sponsors";
import { createWorld, type Database } from "../src/engine/world";
import { kitsOf, setCustomKit } from "../src/ui/Kit";

const fresh = () => createWorld(db as Database, { managerName: "Teste", clubId: "flamengo", seed: 7 });

describe("contratos de fornecedor e master", () => {
  it("bloqueia a troca no meio do contrato e libera no último ano", () => {
    const w = fresh();
    const c = w.clubs[w.userClubId];
    const d = activeDeal(w, c, "shirt");
    expect(d).toBeTruthy();
    d!.until = w.season + 2;
    expect(sponsorWindow(w, c, "shirt").open).toBe(false);
    expect(currentOffers(w, c).some((o) => o.slot === "shirt")).toBe(false);
    d!.until = w.season;
    const win = sponsorWindow(w, c, "shirt");
    expect(win.open).toBe(true);
    expect(win.from).toBe(w.season + 1);
    const offers = currentOffers(w, c).filter((o) => o.slot === "shirt");
    expect(offers.length).toBeGreaterThanOrEqual(3);
    const pick = offers.find((o) => o.brand !== d!.brand) ?? offers[0];
    const news = w.news.length;
    expect(signSponsor(w, c, pick.id)).toBeNull();
    expect(w.news.length).toBe(news + 1);
    // continua o atual nesta temporada; o novo entra na próxima
    expect(activeDeal(w, c, "shirt")!.brand).toBe(d!.brand);
    expect(sponsorWindow(w, c, "shirt").open).toBe(false);
    w.season += 1;
    rollSponsorDeals(w, c);
    expect(activeDeal(w, c, "shirt")!.brand).toBe(pick.brand);
  });
});

describe("3º uniforme personalizado", () => {
  it("uma vez por temporada e entra na lista de uniformes", () => {
    const w = fresh();
    const c = w.clubs[w.userClubId];
    const k = { ...draftCustomKit(w, c), pat: "stripes" as const, b: "#112233" };
    expect(saveCustomKit(w, c, k)).toBeNull();
    expect(canEditCustomKit(w, c)).toBe(false);
    expect(saveCustomKit(w, c, k)).toMatch(/já foi lançado/);
    setCustomKit(c.id, c.customKit);
    expect(kitsOf(c.id).some((x) => x.custom && x.b === "#112233")).toBe(true);
    w.season += 1;
    expect(canEditCustomKit(w, c)).toBe(true);
    setCustomKit(c.id, undefined);
  });
});
