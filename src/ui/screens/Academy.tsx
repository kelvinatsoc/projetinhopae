// Base FM26 e Dia da Peneira (Trilha A). FUNDAÇÃO: componentes provisórios com as assinaturas finais.
import { YouthScreen } from "./Squad";

/** Nova tela da base (rota "youth"). Por enquanto, a lista de sempre. */
export function AcademyScreen() {
  return <YouthScreen />;
}

export function PeneiraScreen() {
  return (
    <div className="page">
      <div className="card center"><b>🌱 Dia da peneira</b><div className="small muted">Em breve.</div></div>
    </div>
  );
}

/** Cartão no Início quando há uma peneira pendente. */
export function PeneiraHomeCard() {
  return null;
}
