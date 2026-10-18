// Componente Strikers Arcade Deck: Deck interativo estilo Super Mario Strikers
// com Caixa de Itens, Medidor de Voltagem da Bola, Desarme Brutal e Hyper Strike QTE.
import { useEffect, useRef, useState } from "react";
import type { MatchSim } from "../engine/match";
import {
  ARCADE_ITEMS,
  evaluateHyperStrike,
  playArcadeHyperStrike,
  playArcadeMiss,
  playArcadeTackle,
  triggerScreenShake,
  type ArcadeItemId,
} from "./strikersArcade";
import { haptic } from "./haptics";
import "./strikersArcade.css";

export interface StrikersDeckProps {
  sim: MatchSim;
  userSide: 0 | 1;
  currentItem: ArcadeItemId | null;
  itemCharge: number;
  rolling: boolean;
  onUseItem: () => void;
  onTackle: () => void;
  onHyperStrike: () => void;
}

export function StrikersArcadeDeck({
  sim,
  userSide,
  currentItem,
  itemCharge,
  rolling,
  onUseItem,
  onTackle,
  onHyperStrike,
}: StrikersDeckProps) {
  const item = currentItem ? ARCADE_ITEMS[currentItem] : null;
  const oppAttacking = sim.phase.atk === (1 - userSide);
  const userAttacking = sim.phase.atk === userSide;
  const voltage = sim.arcade.voltage;

  return (
    <div className="strikers-deck" role="region" aria-label="Deck de Ação Arcade Super Mario Strikers">
      <div className="strikers-row">
        {/* Caixa de Itens (Item Box Roulette) */}
        <button
          className={`strikers-itembox${item ? " ready" : ""}`}
          onClick={onUseItem}
          disabled={!item && !rolling}
          title={item ? `${item.name}: Toque para usar!` : `Caixa de Itens: ${itemCharge}%`}
          aria-label={item ? `Usar ${item.name}` : `Caixa de itens: ${itemCharge}%`}
        >
          <div className="strikers-item-icon" aria-hidden="true">
            {rolling ? "🎰" : item ? item.emoji : "📦"}
          </div>
          <div className="strikers-item-info">
            <span className="strikers-item-name">
              {rolling ? "SORTEANDO..." : item ? item.name : "CAIXA DE ITENS"}
            </span>
            <span className="strikers-item-sub">
              {item ? "TOQUE PARA ATIVAR" : `${itemCharge}% de carga`}
            </span>
          </div>
          <div className="strikers-item-bar-bg">
            <div
              className="strikers-item-bar-fill"
              style={{ width: `${item ? 100 : itemCharge}%` }}
            />
          </div>
        </button>

        {/* Medidor de Voltagem da Bola (Ball Voltage) */}
        <div className="strikers-voltage" title={`Voltagem da Bola: Carga Nível ${voltage}`}>
          <span className="strikers-voltage-title">VOLTAGEM</span>
          <div className="strikers-voltage-bars">
            <div className={`strikers-voltage-cell${voltage >= 1 ? " lvl-1" : ""}`} />
            <div className={`strikers-voltage-cell${voltage >= 2 ? " lvl-2" : ""}`} />
            <div className={`strikers-voltage-cell${voltage >= 3 ? " lvl-3" : ""}`} />
          </div>
        </div>

        {/* Botão de Desarme Brutal / Carrinho na Grade ou Chute Especial */}
        {oppAttacking ? (
          <button
            className="strikers-tackle-btn hot"
            onClick={onTackle}
            title="Desarme Brutal na Grade Elétrica!"
            aria-label="Desarme Brutal na Grade Elétrica"
          >
            <span aria-hidden="true">💥</span>
            <span>CARRINHO!</span>
          </button>
        ) : (
          <button
            className={`strikers-tackle-btn${userAttacking ? " hot" : ""}`}
            onClick={onHyperStrike}
            disabled={!userAttacking}
            title="Preparar Hyper Strike!"
            aria-label="Preparar Hyper Strike"
            style={{
              background: userAttacking
                ? "linear-gradient(135deg, #00f0ff 0%, #0099cc 100%)"
                : undefined,
              borderColor: userAttacking ? "#ccff00" : undefined,
              color: userAttacking ? "#080d16" : undefined,
            }}
          >
            <span aria-hidden="true">⚡</span>
            <span>HYPER STRIKE</span>
          </button>
        )}
      </div>
    </div>
  );
}

export interface HyperStrikeModalProps {
  onResolve: (bonusXg: number, label: string) => void;
  onClose: () => void;
}

export function HyperStrikeModal({ onResolve, onClose }: HyperStrikeModalProps) {
  const [needle, setNeedle] = useState(15);
  const [result, setResult] = useState<{
    label: string;
    comic: string;
    color: string;
    bonusXg: number;
  } | null>(null);
  const animRef = useRef<number>(0);
  const dirRef = useRef<number>(1);
  const posRef = useRef<number>(15);
  const resolvedRef = useRef<boolean>(false);

  useEffect(() => {
    const speed = 2.4;
    const loop = () => {
      if (resolvedRef.current) return;
      posRef.current += speed * dirRef.current;
      if (posRef.current >= 88) dirRef.current = -1;
      else if (posRef.current <= 12) dirRef.current = 1;
      setNeedle(posRef.current);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    // Timeout de 2.2 segundos para não travar jogo passivo
    const autoTimer = window.setTimeout(() => {
      if (!resolvedRef.current) handleShoot();
    }, 2200);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.clearTimeout(autoTimer);
    };
  }, []);

  const handleShoot = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    cancelAnimationFrame(animRef.current);

    const res = evaluateHyperStrike(posRef.current);
    setResult(res);

    if (res.rating === "perfect") {
      playArcadeHyperStrike();
      triggerScreenShake("heavy");
      haptic("success");
    } else if (res.rating === "good") {
      playArcadeTackle();
      triggerScreenShake("light");
      haptic("tap");
    } else {
      playArcadeMiss();
    }

    onResolve(res.bonusXg, res.comic);

    window.setTimeout(() => {
      onClose();
    }, 700);
  };

  return (
    <div className="strikers-qte-overlay" onClick={handleShoot}>
      <div className="strikers-qte-modal" onClick={(e) => e.stopPropagation()}>
        <span className="strikers-qte-badge">⚡ SUPER MARIO STRIKERS ⚡</span>
        <h2 className="strikers-qte-title">HYPER STRIKE!</h2>
        <p className="strikers-qte-desc">Acerte o centro verde/dourado para soltar o chute perfeito!</p>

        {/* Trilho do medidor com zonas */}
        <div className="strikers-gauge-track">
          <div className="strikers-gauge-good" />
          <div className="strikers-gauge-sweet" />
          <div
            className="strikers-gauge-needle"
            style={{ left: `${needle}%` }}
          />
        </div>

        {result ? (
          <div
            className="strikers-qte-result"
            style={{ color: result.color }}
          >
            {result.comic}
          </div>
        ) : (
          <button className="strikers-qte-btn" onClick={handleShoot}>
            CHUTAR! ⚡
          </button>
        )}
      </div>
    </div>
  );
}
