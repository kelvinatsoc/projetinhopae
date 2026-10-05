// Modo Administrador (Trilha C). FUNDAÇÃO: componentes provisórios com as assinaturas finais.
import type { Player } from "../../engine/types";
import { Sheet } from "../components";

export function AdminScreen() {
  return (
    <div className="page">
      <div className="card center"><b>🛠️ Painel do administrador</b><div className="small muted">Em breve.</div></div>
    </div>
  );
}

/** Cartão nas Configurações para ligar o Modo Administrador. */
export function AdminSettingsCard() {
  return null;
}

/** Editor completo do jogador (substitui o ✏️ quando o admin está ligado). */
export function AdminPlayerEditor({ p, onClose }: { p: Player; onClose: () => void }) {
  return (
    <Sheet title={`🛠️ Editor completo: ${p.name}`} onClose={onClose}>
      <p className="small muted">Em breve.</p>
    </Sheet>
  );
}
