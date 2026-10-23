import { useEffect, useState } from "react";
import { loadDatabase, loadWorldFile } from "./actions";
import { warmUpAudio } from "./audio";
import { Icon } from "./components";
import { mediaUrl } from "./mediaUrl";
import "./gamePreloader.css";

let _preloaded = false;

export function isGamePreloaded(): boolean {
  return _preloaded;
}

export function setGamePreloaded(val = true): void {
  _preloaded = val;
}

const TIPS = [
  "Dica do Auxiliar: A instrução 'Vamos pra cima!' sobe a marcação e acelera o ritmo em momentos de pressão.",
  "Atmosfera do MorumBIS: A torcida tricolor canta mais alto e empurra o time em clássicos e jogos de mata-mata.",
  "Dica Tática: No terço final do campo, atacantes e meias buscam tabelas rápidas e finalizações diretas ao gol.",
  "Categorias de Base: Lendas do futebol renascem nas categorias de base com alto potencial de evolução.",
  "Agilidade: Você pode tocar na tela ou em 'Pular' na entrada do campo para ir direto ao pontapé inicial.",
  "Física da Bola: O som de toque na bola e o arco do passe variam conforme a força e estilo do jogador.",
];

export function GamePreloader({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(5);
  const [status, setStatus] = useState("Iniciando motor de jogo...");
  const [tipIndex, setTipIndex] = useState(0);
  const [ready, setReady] = useState(false);

  // Troca de dicas rotativas a cada 2.5 segundos
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;

    async function runPreload() {
      try {
        // Etapa 1: Carregamento do banco de dados e dados reais (0 -> 35%)
        setStatus("Carregando elencos reais e dados da temporada 2026...");
        setProgress(18);
        await Promise.all([loadDatabase(), loadWorldFile()]);
        if (!alive) return;
        setProgress(42);

        // Etapa 2: Pré-aquecimento do sistema sonoro WebAudio (35 -> 65%)
        setStatus("Sintonizando acústica dos estádios e áudio da partida...");
        await warmUpAudio();
        if (!alive) return;
        setProgress(68);

        // Etapa 3: Pré-aquecimento do módulo 3D Three.js e shaders (65 -> 92%)
        setStatus("Pré-carregando motor 3D, campo e iluminação esportiva...");
        try {
          await import("./match3d/MatchRenderer");
        } catch {
          // ignora se rodando em ambiente sem suporte a 3D
        }
        if (!alive) return;
        setProgress(92);

        // Etapa 4: Finalização (92 -> 100%)
        setStatus("Tudo pronto! Entrando em campo...");
        setProgress(100);
        setReady(true);
        _preloaded = true;

        // Transição suave para o jogo
        window.setTimeout(() => {
          if (alive) onComplete();
        }, 550);
      } catch (err) {
        console.error("Erro durante pré-carregamento:", err);
        if (alive) {
          setProgress(100);
          _preloaded = true;
          onComplete();
        }
      }
    }

    runPreload();
    return () => {
      alive = false;
    };
  }, [onComplete]);

  return (
    <div className="g-preloader" role="status" aria-live="polite">
      <div className="gp-bg" aria-hidden="true">
        <img src={mediaUrl("stadiums/Q155174.webp")} alt="" decoding="async" />
        <div className="gp-overlay" />
      </div>

      <div className="gp-center">
        <div className="gp-logo-wrapper">
          <div className="gp-ball-glow">
            <div className="gp-ball-spin">
              <Icon name="ball" size={54} />
            </div>
          </div>
          <div className="gp-title">LENDAS <span>DA BASE</span></div>
          <div className="gp-subtitle">EXPERIÊNCIA FUTEBOL REAL · TEMPORADA 2026</div>
        </div>

        <div className="gp-card">
          <div className="gp-progress-header">
            <span className="gp-status-text">{status}</span>
            <span className="gp-percent-text">{Math.round(progress)}%</span>
          </div>

          <div className="gp-bar-container">
            <div
              className="gp-bar-fill"
              style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
            >
              <div className="gp-bar-shimmer" />
            </div>
          </div>

          <div className="gp-tip-box">
            <div className="gp-tip-badge">
              <Icon name="sparkle" size={13} /> DICA DO JOGO
            </div>
            <p className="gp-tip-text">{TIPS[tipIndex]}</p>
          </div>
        </div>

        {ready && (
          <button className="gp-ready-btn" onClick={onComplete}>
            Começar Agora ❯
          </button>
        )}
      </div>

      <div className="gp-footer">
        <span>São Paulo FC & Clubes do Brasil · MorumBIS Edition</span>
      </div>
    </div>
  );
}
