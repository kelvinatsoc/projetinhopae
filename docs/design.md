# Direção visual — "Era PS1"

Alvo: Galaxy S24 Ultra (412×915 CSS px, DPR 3, 120 Hz). A primeira passada ("Vidro de Gala", vidro fosco estilo iOS) foi substituída a pedido do usuário por uma identidade de **jogo de futebol de PlayStation 1** (Winning Eleven / ISS Pro), coerente com a partida em 3D "Retrô PS1". A camada premium continua por baixo (`src/ui/premium.css`) e o tema `src/ui/ps1.css` vence por cima.

## Referências

1. **Pinterest: quadros de UI de futebol** — https://www.pinterest.com/dhanashreekedar98/football-app/ · https://uk.pinterest.com/owenhughes/football-ui/ — números grandes como protagonistas, foto do estádio ao fundo.
2. **Pinterest: Sporty Snap – Football App UI Kit** — https://ph.pinterest.com/pin/sporty-snap-football-app-ui-kit-ui-kits-in-2024--1044272232340003272/ — cartão do próximo jogo com escudos grandes e "VS" central.
3. **Figma Community: Glassmorphism Football App UI** — https://www.figma.com/community/file/971013685440937649/glassmorphism-football-app-ui — usado na 1ª passada (vidro); descartado na direção atual.
4. **Dribbble: Football Manager** — https://dribbble.com/tags/football-manager — grade de atalhos com ícones em pastilhas.
5. **Dribbble: Player Card UI (Antonio Di Nardo)** — https://dribbble.com/shots/2570132-Player-Card-UI — hierarquia da carta: overall + posição no canto, rosto ao centro.
6. **Behance: EA SPORTS FC / FIFA Mobile UI** — https://www.behance.net/search/projects/EA%20SPORTS%20FOOTBALL%20CLUB%20ui/ux · https://www.behance.net/search/projects/fifa%20mobile%20ui — cartas por nível (bronze/prata/ouro/lenda) com brilho.
7. **Menus de Winning Eleven 3/4 e ISS Pro Evolution (PS1, 1998-2000)** — painéis azuis chanfrados (borda clara em cima/esquerda, escura embaixo/direita), sombra dura preta, cursor amarelo, títulos em itálico pesado, rótulos em fonte bitmap.
8. **Gran Turismo 2 / FIFA 2001 (PS1/PS2)** — mapa/menu 3D navegável como hub; inspiração da sede 3D do clube.

## Direção escolhida

- **Painéis chanfrados** em degradê azul (#1f3f98 → #0c1d55), cantos retos (3 px), sombra dura 4 px preta, sem desfoque nenhum (mais leve a 120 Hz).
- **Tipografia embutida** (sem rede): Chakra Petch 600/700/itálico para títulos e números (itálico pesado tipo placar de PS1) e Press Start 2P para rótulos curtos (cabeçalhos de seção, data, minuto, tags).
- **Cor do clube** no botão principal, nos ícones (preenchimento sólido) e no destaque do fundo; **amarelo** como cursor de seleção (aba/chip ativo, item da doca).
- **Botões**: blocos chanfrados; ao tocar, o chanfro inverte e o bloco desce 2 px (como apertar um botão de menu de PS1). Um único primário por tela (pré-jogo: "Jogar"; "Aplicar sugestões" passou a secundário). Alvos ≥ 44–58 px. Comparativo de sistemas de botões em `docs/design-shots/botoes-opcoes.png` (a opção A, pílula sólida, venceu antes da mudança para PS1; a hierarquia sólido > tonal > texto foi mantida no tema PS1).
- **Ícones próprios** (`src/ui/icons.tsx`): duotom com detalhes de futebol (chuteira = treino, cachecol = torcida, taça com alças, silhueta de estádio, prancheta tática, apito…), no tema PS1 com traço quadrado, `crispEdges`, preenchimento sólido e sombra dura.
  - **Troca por imagens**: coloque `public/media/icons/<nome>.png` (512 px, fundo transparente) e o jogo usa a imagem no lugar do SVG. Nomes: inicio, elenco, tatica, treino, mercado, olheiros, base, financas, estrutura, patrocinios, noticias, caixa-entrada, calendario, competicoes, clube, carreira, conquistas, configuracoes, salvar, jogar, modo-rapido, continuar, selecao, estadio, torcida, coletiva, diretoria, comparar (extras: vestiario, lendas).
- **Início assimétrico**: foto do estádio do clube ao fundo, cartão do jogo com "VS" vazado gigante, Tática como bloco 2×2 com linhas de campo, Lendas como faixa dourada, os três anéis num painel único. Os atalhos ficam acima do botão "Continuar".
- **Sede do clube em 3D** (`src/ui/hq/`, three.js baixado sob demanda): complexo low-poly estilo PS2 — estádio (arquibancadas/cobertura conforme o nível do estádio), diretoria (diretoria/finanças/patrocínios), CT (treino/tática/bola parada, nº de campos pelo nível de treino, jogadores correndo), vestiário (elenco/clima/comissão), base (andares pelo nível da base), departamento médico (ala extra no nível 3+), imprensa (notícias/caixa de entrada) e observação (mercado). Bandeiras tremulando, carros na rua, antena girando, noite em dia de jogo (refletores acesos). Arrastar gira a câmera; parado, ela orbita devagar. Animação por tempo (`frameDt` em `animTime.ts`), resolução interna reduzida, para quando sai da tela. Sem WebGL, volta para a grade de botões.
- `prefers-reduced-motion` congela brilhos, órbita e entradas.

Capturas finais: `docs/design-shots/` (412×915, DPR 3).
