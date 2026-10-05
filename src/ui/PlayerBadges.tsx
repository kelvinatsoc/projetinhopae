// Selos do jogador na lista: seta ▲▼ da evolução mensal e até 2 jogadas preferidas.
import { knowledgeOf, TRAITS_K } from "../engine/scouting";
import { isUserOwned } from "../engine/training";
import { TRAITS } from "../engine/traits";
import type { Player } from "../engine/types";
import { getWorld } from "../store";

export function PlayerBadges({ p }: { p: Player }) {
  const w = getWorld();
  if (!w) return null;
  const trend = p.trend && isUserOwned(w, p) ? p.trend : 0;
  const traits = (p.traits ?? []).filter((t) => !TRAITS[t].bad);
  const showTraits = traits.length > 0 && knowledgeOf(w, p) >= TRAITS_K;
  if (!trend && !showTraits) return null;
  return (
    <>
      {trend !== 0 && (
        <span className="kbd" style={{ flex: "none", fontSize: 12, fontWeight: 800, color: trend > 0 ? "var(--accent)" : "var(--danger)" }}
          title={trend > 0 ? "Evoluiu nos últimos treinos" : "Caiu de rendimento nos últimos treinos"}>
          {trend > 0 ? "▲" : "▼"}{Math.abs(trend)}
        </span>
      )}
      {showTraits && (
        <span style={{ flex: "none", fontSize: 13, letterSpacing: 1 }} title={traits.map((t) => TRAITS[t].label).join(", ")}>
          {traits.slice(0, 2).map((t) => TRAITS[t].emoji).join("")}
        </span>
      )}
    </>
  );
}
