// Olheiros e potencial escondido (Trilha A). FUNDAÇÃO: componentes provisórios com as assinaturas finais.
import type { Player } from "../../engine/types";

/** Aba "Olheiros" do Mercado (missões e relatórios). */
export function ScoutingTab() {
  return <div className="card center"><b>🔭 Olheiros</b><div className="small muted">Em breve.</div></div>;
}

/** Botão "Mandar olheiro" no perfil de jogadores de outros clubes. */
export function ScoutButton(_props: { p: Player }) {
  return null;
}

/** Cartões de jogadas preferidas, personalidade e relatório do auxiliar no perfil. */
export function PlayerInsightCards(_props: { p: Player }) {
  return null;
}
