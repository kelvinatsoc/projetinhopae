// Selos do jogador na lista: seta ▲▼ da evolução mensal, até 2 jogadas preferidas
// e a situação no vestiário (📤 emprestado, 😤 quer sair, ⏱️ promessa de minutos).
import { knowledgeOf, TRAITS_K } from "../engine/scouting";
import { injuryProne, streakOf } from "../engine/form";
import { isUserOwned } from "../engine/training";
import { TRAITS } from "../engine/traits";
import type { Player } from "../engine/types";
import { getWorld } from "../store";

const MINI = { flex: "none", fontSize: 13 } as const;

export function PlayerBadges({ p }: { p: Player }) {
  const w = getWorld();
  if (!w) return null;
  const mine = isUserOwned(w, p);
  const trend = p.trend && mine ? p.trend : 0;
  const traits = (p.traits ?? []).filter((t) => !TRAITS[t].bad);
  const showTraits = traits.length > 0 && knowledgeOf(w, p) >= TRAITS_K;
  const loan = p.loan ? (p.loan.from === w.userClubId ? "Emprestado pelo seu clube" : `Emprestado pelo ${w.clubs[p.loan.from]?.name ?? "clube de origem"}`) : null;
  const wantsOut = mine && p.wantsOut;
  const promise = mine && !!p.promise;
  const streak = mine ? streakOf(p) : null;
  const fav = mine && !!p.fav;
  const prone = mine && injuryProne(p);
  if (!trend && !showTraits && !loan && !wantsOut && !promise && !streak && !fav && !prone) return null;
  return (
    <>
      {trend !== 0 && (
        <span className="kbd" style={{ flex: "none", fontSize: 12, fontWeight: 800, color: trend > 0 ? "var(--accent)" : "var(--danger)" }}
          title={trend > 0 ? "Evoluiu nos últimos treinos" : "Caiu de rendimento nos últimos treinos"}>
          {trend > 0 ? "▲" : "▼"}{Math.abs(trend)}
        </span>
      )}
      {streak === "hot" && <span style={MINI} title="Em alta: notas acima do esperado" aria-label="Em alta">🔥</span>}
      {streak === "cold" && <span style={MINI} title="Em baixa: notas abaixo do esperado" aria-label="Em baixa">🧊</span>}
      {fav && <span style={MINI} title="Ídolo da torcida" aria-label="Ídolo da torcida">❤️</span>}
      {prone && <span style={MINI} title="Propenso a lesões" aria-label="Propenso a lesões">🩹</span>}
      {loan && <span style={MINI} title={loan} aria-label={loan}>📤</span>}
      {wantsOut && <span style={MINI} title="Pediu para sair do clube" aria-label="Quer sair">😤</span>}
      {promise && <span style={MINI} title="Você prometeu mais minutos para ele" aria-label="Promessa de minutos">⏱️</span>}
      {showTraits && (
        <span style={{ flex: "none", fontSize: 13, letterSpacing: 1 }} title={traits.map((t) => TRAITS[t].label).join(", ")}>
          {traits.slice(0, 2).map((t) => TRAITS[t].emoji).join("")}
        </span>
      )}
    </>
  );
}
