/** Fase da partida ("FINAL", "Semifinal – ida", "Rodada 12"...) e o banner especial dos jogos decisivos. */
import type { CSSProperties } from "react";
import { derbyName } from "../data/rivalries";
import { COMP_META, tieAggregate } from "../engine/competitions";
import type { Fixture, World } from "../engine/types";
import { CompLogo } from "./components";
import { compTheme, themeVars } from "./compThemes";
import { TrophyImg } from "./Trophy";
import "./matchPhase.css";

const KO: Record<string, string> = {
  final: "Final", sf: "Semifinal", qf: "Quartas", r16: "Oitavas", r32: "Segunda fase", r64: "Primeira fase",
  playoff: "Playoff", ko: "Playoff", third: "Disputa do 3º lugar",
};

export type Decisive = "final" | "semi" | "derby" | null;

export interface MatchPhase {
  /** rótulo curto: "FINAL", "Semifinal – ida", "Rodada 12", "Fase de grupos" */
  label: string;
  /** só a fase, sem o jogo ("FINAL", "Semifinal", "Rodada 12") */
  stage: string;
  leg?: 1 | 2;
  /** complemento (grupo, rodada do grupo) */
  detail?: string;
  decisive: Decisive;
  derby?: string;
  /** placar agregado antes do jogo de volta (do ponto de vista mandante × visitante deste jogo) */
  agg?: { home: number; away: number };
}

export function matchPhase(w: World, f: Fixture): MatchPhase {
  const comp = w.comps[f.comp];
  const derby = derbyName(f.home, f.away);
  let stage: string;
  let detail: string | undefined;
  if (f.stage === "league") stage = `Rodada ${f.round}`;
  else if (f.stage === "group") {
    stage = "Fase de grupos";
    detail = `${comp?.groups[f.group ?? 0]?.name ?? "Grupo"} · ${f.round}ª rodada`;
  } else if (f.stage === "final") stage = "FINAL";
  else stage = KO[f.stage] ?? f.stage;
  const label = f.leg ? `${stage} – ${f.leg === 1 ? "ida" : "volta"}` : stage;
  const decisive: Decisive = f.stage === "final" ? "final" : f.stage === "sf" ? "semi" : derby ? "derby" : null;
  let agg: MatchPhase["agg"];
  if (f.leg === 2 && f.tie != null) {
    const tie = comp?.ties.find((t) => t.id === f.tie);
    if (tie) {
      const a = tieAggregate(w, tie);
      if (a.played > 0) {
        const home = f.home === tie.a ? a.a : a.b;
        const away = f.home === tie.a ? a.b : a.a;
        agg = { home, away };
      }
    }
  }
  return { label, stage, leg: f.leg, detail, decisive, derby, agg };
}

/** Selo compacto da fase (cartão do próximo jogo, listas). */
export function PhaseChip({ w, f }: { w: World; f: Fixture }) {
  const ph = matchPhase(w, f);
  return <span className={`phase-chip${ph.decisive ? ` is-${ph.decisive}` : ""}`}>{ph.label}</span>;
}

/**
 * Banner da fase. Jogos comuns: faixa discreta. Decisivos (final, semi, clássico): banner com o
 * tema da competição, logo grande, troféu ao fundo na final e placar agregado no jogo de volta.
 */
export function PhaseBanner({ w, f, compact }: { w: World; f: Fixture; compact?: boolean }) {
  const ph = matchPhase(w, f);
  const meta = COMP_META[f.comp];
  const t = compTheme(f.comp, meta?.color);
  const home = w.clubs[f.home], away = w.clubs[f.away];
  if (!ph.decisive) {
    return (
      <div className="phase-bar" style={themeVars(t)}>
        <CompLogo id={f.comp} size={22} />
        <b>{ph.label}</b>
        {ph.detail && <span>{ph.detail}</span>}
        {ph.agg && <span className="phase-agg-mini">Agregado {ph.agg.home} × {ph.agg.away}</span>}
      </div>
    );
  }
  const kicker = ph.decisive === "final" ? "Jogo do título" : ph.decisive === "semi" ? "Vaga na final em jogo" : "Clássico";
  return (
    <div className={`phase-banner is-${ph.decisive}${compact ? " compact" : ""}`} style={themeVars(t) as CSSProperties} role="note" aria-label={`${ph.label} · ${meta?.name ?? f.comp}`}>
      <div className="pb-bg" aria-hidden="true" />
      {ph.decisive === "final" && <div className="pb-trophy" aria-hidden="true"><TrophyImg comp={f.comp} size={compact ? 120 : 170} /></div>}
      <div className="pb-shine" aria-hidden="true" />
      <div className="pb-body">
        <div className="pb-logo"><CompLogo id={f.comp} size={compact ? 40 : 52} fallback={<TrophyImg comp={f.comp} size={compact ? 40 : 52} />} /></div>
        <div className="pb-txt">
          <span className="pb-kicker">{ph.derby ? `${kicker} · ${ph.derby}` : kicker}</span>
          <b className="pb-label">{ph.stage}</b>
          {ph.leg && <span className="pb-leg">Jogo de {ph.leg === 1 ? "ida" : "volta"}</span>}
          <span className="pb-comp">{meta?.name ?? f.comp}{ph.detail ? ` · ${ph.detail}` : ""}</span>
        </div>
      </div>
      {ph.agg && (
        <div className="pb-agg" aria-label={`Placar agregado: ${home?.name} ${ph.agg.home}, ${away?.name} ${ph.agg.away}`}>
          <span>Agregado</span>
          <b>{home?.abbr} {ph.agg.home} × {ph.agg.away} {away?.abbr}</b>
          <small>{ph.agg.home === ph.agg.away ? "Tudo igual: quem vencer leva" : `${(ph.agg.home > ph.agg.away ? home : away)?.name} está na frente`}</small>
        </div>
      )}
    </div>
  );
}
