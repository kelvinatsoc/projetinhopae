// Faixa com o nome do estádio no pontapé inicial (acompanha o sobrevoo "sa-fly" do campo).
import type { CSSProperties } from "react";
import type { Club } from "../engine/types";
import { isBigGame, stadiumStyleFor } from "../data/stadiumStyles";
import "./stadiumArt.css";

export function StadiumBanner({ club, away, neutral, stage }: { club: Club; away: Club; neutral: boolean; stage: string }) {
  const st = stadiumStyleFor(club, neutral);
  const big = !neutral && isBigGame(club, away, stage);
  const style = { "--sa-c0": club.colors[0], "--sa-c1": club.colors[1] } as CSSProperties;
  return (
    <div className="sa-banner" style={style} aria-hidden="true">
      <div className="sa-banner-stripe" />
      <b>{st.name}</b>
      <span>
        {st.tag}
        {!neutral && club.capacity > 0 && ` · ${club.capacity.toLocaleString("pt-BR")} lugares`}
        {big && " · casa cheia!"}
      </span>
    </div>
  );
}
