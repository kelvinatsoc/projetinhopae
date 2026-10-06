# Direção visual — "Vidro de Gala"

Alvo: Galaxy S24 Ultra (412×915 CSS px, DPR 3, 120 Hz), com a sensação de um jogo premium de iPhone.

## Referências

1. **Pinterest: quadros de UI de apps de futebol** — https://www.pinterest.com/dhanashreekedar98/football-app/ e https://uk.pinterest.com/owenhughes/football-ui/
   O que usei: fundo escuro com foto e cartões translúcidos por cima; números grandes e condensados como protagonistas.
2. **Pinterest: "Sporty Snap – Football App UI Kit"** — https://ph.pinterest.com/pin/sporty-snap-football-app-ui-kit-ui-kits-in-2024--1044272232340003272/
   O que usei: cartão do próximo jogo com escudos grandes, "VS" central e botões em pílula.
3. **Figma Community: Glassmorphism Football App UI** — https://www.figma.com/community/file/971013685440937649/glassmorphism-football-app-ui
   O que usei: vidro fosco (blur + saturação + filete de luz no topo) só nas barras e cartões principais.
4. **Dribbble: tag Football Manager** — https://dribbble.com/tags/football-manager
   O que usei: grade de atalhos com ícones em "pastilhas" coloridas, como os ícones de app do iOS.
5. **Dribbble: Player Card UI (Antonio Di Nardo)** — https://dribbble.com/shots/2570132-Player-Card-UI
   O que usei: carta com overall + posição no canto e o rosto no centro; hierarquia tipográfica forte.
6. **Dribbble: tag Glassmorphism UI** — https://dribbble.com/tags/glassmorphism-ui
   O que usei: sombras em camadas (curta + longa e difusa) para dar profundidade sem bordas duras.
7. **Behance: EA SPORTS FC / FIFA Mobile UI** — https://www.behance.net/search/projects/EA%20SPORTS%20FOOTBALL%20CLUB%20ui/ux e https://www.behance.net/search/projects/fifa%20mobile%20ui
   O que usei: cartas colecionáveis por nível (bronze/prata/ouro) com faixa de brilho que atravessa a carta e versão holográfica para as lendas.
8. **Apple Sports (iOS)** e **OneFootball** (referência de produto)
   O que usei: tipografia de placar com números tabulares, cantos grandes (24–30 px), dock flutuante em vidro e cores do time como acento.

## Direção escolhida

- **Palco = o estádio do clube.** O Início usa a foto do estádio do usuário (`public/media/stadiums`) como fundo do topo, escurecida e tingida com a cor do clube; o cartão do próximo jogo flutua por cima em vidro. A abertura usa o Maracanã.
- **Vidro só onde importa.** `backdrop-filter` na barra superior, no dock, no toast, no cartão do jogo, nos anéis e nos atalhos. Listas longas e tabelas ficam sem blur (rolagem a 120 Hz).
- **Profundidade:** sombras em duas camadas mais um filete de luz interno (`inset 0 1px`).
- **Cantos iOS:** 24 px nos cartões, 30 px nos heróis e no dock, 18 px nos botões, pílula nos chips e no FAB.
- **Números:** Barlow Condensed 600–900 empacotada via `@fontsource` (vai no build, sem rede em tempo de execução), com `tabular-nums`. No Android, cai para `sans-serif-condensed`.
- **Cores do clube** (`--club`, `--club2`) mandam nos acentos: pastilhas de ícone, FAB, abas ativas, chips e brilho do dock.
- **Ícones próprios** em SVG inline (traço 2 px, cantos redondos) no lugar de emojis no Início e no Clube.
- **Molas:** `--spring` (curva `linear()` de mola amortecida) em `:active` e nas entradas, sempre com transform/opacity. A troca de tela continua só com opacidade, para manter os filhos `position: fixed` estáveis.
- **Cartas colecionáveis:** textura fina, varredura de brilho na prata e no ouro, holográfico em conic-gradient nas lendas.
- **Hápticos:** `@capacitor/haptics` no APK (impacto leve no toque, notificação em sucesso ou aviso) e `navigator.vibrate` como alternativa; tudo protegido para web e testes.
- `prefers-reduced-motion` desliga brilhos, entradas e molas.

Capturas finais: `docs/design-shots/`.
