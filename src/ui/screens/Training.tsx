// Treino (Trilha A). FUNDAÇÃO: componentes provisórios com as assinaturas finais.
import type { Player } from "../../engine/types";
import { Sheet } from "../components";

export function TrainingScreen() {
  return (
    <div className="page">
      <TrainingTab />
    </div>
  );
}

/** Conteúdo do treino (também usado como aba do Elenco). */
export function TrainingTab() {
  return <div className="card center"><b>🏋️ Treino</b><div className="small muted">Em breve.</div></div>;
}

export function IndividualTrainingSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  return (
    <Sheet title={`🎯 Treino individual: ${p.name}`} onClose={onClose}>
      <p className="small muted">Em breve.</p>
    </Sheet>
  );
}
