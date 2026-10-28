// Modal de Central de Mods e Banco de Dados Personalizado em JSON (Estilo Openfoot Manager)
import { useState, useRef, type ChangeEvent } from "react";
import { applyModToWorld, getModTemplateJson, parseModPackage, type ModPackage } from "../engine/modding";
import { toast, update } from "../store";
import { autosave } from "./actions";
import { Icon, Sheet } from "./components";

interface ModdingModalProps {
  onClose: () => void;
}

export function ModdingModal({ onClose }: ModdingModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ mod: ModPackage; summary: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const res = parseModPackage(text);
      if (!res.ok || !res.mod) {
        setError(res.error ?? "Erro ao carregar o arquivo.");
        setParsed(null);
      } else {
        setParsed({ mod: res.mod, summary: res.summary ?? "" });
        setError(null);
      }
    };
    reader.onerror = () => {
      setError("Falha ao ler o arquivo selecionado.");
    };
    reader.readAsText(file);
  }

  function handleApply() {
    if (!parsed) return;
    try {
      let result = { clubsAdded: 0, clubsUpdated: 0, playersAdded: 0 };
      update((world) => {
        result = applyModToWorld(world, parsed.mod);
      });
      autosave();
      toast(`Patch "${parsed.mod.meta.name}" aplicado! (+${result.clubsAdded + result.clubsUpdated} clubes, +${result.playersAdded} jogadores)`);
      onClose();
    } catch (err) {
      setError(`Erro ao aplicar o patch: ${String((err as Error)?.message ?? err)}`);
    }
  }

  function handleDownloadTemplate() {
    const json = getModTemplateJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-patch-lendas-da-base.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Modelo de patch JSON baixado!");
  }

  return (
    <Sheet title="Central de Mods & Dados Comunitários (JSON)" onClose={onClose}>
      <div style={{ padding: "8px 0" }}>
        <p className="small muted">
          Inspirado na arquitetura aberta do <b>Openfoot Manager</b>, você pode criar, importar e compartilhar clubes, jogadores e ligas personalizadas em arquivos <code>.json</code>.
        </p>

        <div className="card mt8" style={{ border: "1px dashed var(--line)", background: "rgba(255,255,255,0.02)", textAlign: "center", padding: 16 }}>
          <input
            type="file"
            ref={fileInputRef}
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={handleFile}
          />
          <div style={{ color: "var(--accent)", marginBottom: 8 }}>
            <Icon name="download" size={28} />
          </div>
          <b>Selecione um Patch da Comunidade (.json)</b>
          <div className="tiny muted mt4">O patch será integrado diretamente ao seu mundo salvo.</div>

          <div className="row center gap8 mt12">
            <button
              className="btn primary sm row center gap6"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="search" size={14} /> Escolher Arquivo JSON
            </button>
            <button
              className="btn sm ghost row center gap6"
              onClick={handleDownloadTemplate}
            >
              <Icon name="scroll" size={14} /> Baixar Modelo Exemplo
            </button>
          </div>
        </div>

        {error && (
          <div className="banner red mt8" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="alert" size={16} /> {error}
          </div>
        )}

        {parsed && (
          <div className="card mt8" style={{ borderColor: "var(--gold)" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ color: "var(--gold)" }}>{parsed.mod.meta.name}</b>
              <span className="tag">v{parsed.mod.meta.version ?? "1.0"}</span>
            </div>
            <div className="tiny muted mt4">Criado por: {parsed.mod.meta.author ?? "Autor anônimo"}</div>
            {parsed.mod.meta.description && (
              <p className="small mt4">{parsed.mod.meta.description}</p>
            )}

            <div className="row gap8 mt8 small">
              <span>Clubes: <b>{parsed.mod.clubs?.length ?? 0}</b></span>
              <span>•</span>
              <span>Jogadores: <b>{parsed.mod.players?.length ?? 0}</b></span>
            </div>

            <button
              className="btn primary block mt12 row center gap6"
              onClick={handleApply}
            >
              <Icon name="check" size={14} /> Instalar e Aplicar no Jogo
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
