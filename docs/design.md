# Direção visual — "Arquibancada"

Alvo: Galaxy S24 Ultra (412×915 CSS px, DPR 3, 120 Hz). Histórico: "Vidro de Gala" (vidro estilo iOS) → "Era PS1" (rejeitado: o usuário só queria o mapa 3D com cara de PS2) → **"Arquibancada"**, identidade moderna refeita do zero. O visual PS2 ficou **só** no mapa 3D da sede.

## Referências

1. **O Brasileirinho FC** — https://brasileirinhofc.com (só páginas públicas, sem conta). Fundo escuro quase preto, Barlow / Barlow Condensed, um destaque de cor forte para a ação, linguagem direta em português. Peguei o tom e a tipografia; a paleta e os componentes são próprios.
2. **Apple Sports (iOS)** — placar como protagonista, números tabulares, superfícies sólidas e calmas.
3. **OneFootball** — cartão do próximo jogo com foto, escudos sobrepostos e dados em linha; barra de navegação inferior fixa.
4. **Pinterest: quadros de UI de futebol** — https://www.pinterest.com/dhanashreekedar98/football-app/ · https://uk.pinterest.com/owenhughes/football-ui/ — foto do estádio, escudos grandes.
5. **Dribbble: Player Card UI (Antonio Di Nardo)** — https://dribbble.com/shots/2570132-Player-Card-UI — hierarquia da carta do jogador.
6. **Behance: EA SPORTS FC / FIFA Mobile UI** — https://www.behance.net/search/projects/fifa%20mobile%20ui — cartas por nível (bronze/prata/ouro/lenda).
7. **Material 3 / Android** — barra inferior com indicador em pílula, alvos de 48 dp, foco visível.
8. **Gran Turismo 2 / menus de PS2** — hub 3D navegável; inspiração do mapa da sede.

## Sistema ("Arquibancada", `src/ui/theme.css`)

- **Tokens**: fundo `#0b0e14`, superfícies sólidas em três níveis, bordas de 1 px, cantos de 16 px (cartões) e 12 px (botões). Texto em três níveis, todos com contraste AA sobre as superfícies (15:1, 9:1 e 5,3:1). Há tema claro equivalente.
- **Marca**: verde-limão `#c8f43c` com texto quase preto (contraste ~15:1), reservado para a ação principal (Continuar/Jogar, primário de cada tela). A **cor do clube** marca identidade: escudo, faixa do herói, ícones dos atalhos.
- **Tipografia** embutida (sem rede): Barlow 400–700 no texto (16 px base, nada abaixo de 12,5 px) e Barlow Condensed 600–800 em títulos e números tabulares.
- **Componentes**: barra superior com Voltar sempre no mesmo lugar (44 px) em qualquer tela empilhada; barra inferior fixa com rótulos sempre visíveis e indicador em pílula; **barra do próximo passo** fixa acima da navegação (substitui o botão flutuante que cobria conteúdo), com adversário, data e o botão Continuar/Jogar; botões de 48 px (44 px no tamanho pequeno); chips de 44 px; abas segmentadas que rolam quando têm 5+ itens; foco visível em tudo (anel de 3 px na cor da marca); `aria-label` nos botões só de ícone e `aria-current` na navegação.
- **Início refeito**: cartão do próximo jogo com foto do estádio, escudos sobrepostos e ações; "Momento do clube" com três medidores numéricos (Diretoria, Torcida, Entrosamento) e a meta; grade de 8 atalhos; tabela, notícias e Álbum de Lendas.
- **Ícones** (`src/ui/icons.tsx`): duotom com detalhes de futebol. Troca por imagens: `public/media/icons/<nome>.png` (512 px, fundo transparente), com o SVG como reserva. Nomes: inicio, elenco, tatica, treino, mercado, olheiros, base, financas, estrutura, patrocinios, noticias, caixa-entrada, calendario, competicoes, clube, carreira, conquistas, configuracoes, salvar, jogar, modo-rapido, continuar, selecao, estadio, torcida, coletiva, diretoria, comparar.

## Sede do clube em 3D (`src/ui/hq/`)

- **Geografia real**: `src/data/clubSites.json` traz estádio, CT e sede de cada clube (Wikidata P625 e OpenStreetMap via Nominatim/Overpass; nada de Google Maps), gerado por `scripts/fetch_club_sites.py` (retomável, 1 req/s, User-Agent identificado; Série A e B primeiro). O mapa projeta as posições relativas reais (distâncias longas comprimidas em escala logarítmica, ex.: Morumbis ↔ CT da Barra Funda), com ruas, áreas verdes, água, campos e prédios vizinhos do OSM simplificados e extrudados. Sem dados, usa um layout de reserva com bairro procedural.
- **Detalhe que cresce com a Estrutura**: resolução de renderização, sombras (desligadas no nível 1, suaves no 4–5), materiais (chapado → PBR), mais segmentos e anéis de arquibancada, cobertura, telão, placas de LED, torcida instanciada (com "ola" em dia de jogo), refletores, estacionamento, museu; o CT ganha campos, academia, piscina e concentração; a base ganha andares e alojamento; o médico ganha ala e heliponto.
- **Navegação**: arrastar gira, pinça aproxima, tocar num prédio faz a câmera **voar** até ele e abrir o menu do local; atalhos "Visão geral / Estádio / CT / Sede" com a distância real. Créditos "© OpenStreetMap · Wikidata" no mapa.
- Animação por tempo (`frameDt`), para quando sai da tela; sem WebGL, volta para a grade de botões.
- **Partida**: estádios procedurais (sem modelo feito à mão) ganham cobertura, refletores no teto e placar duplo conforme o nível do estádio (`upgradeByLevel` em `src/data/stadiumStyles.ts`).

Capturas: `docs/design-shots/` (412×915, DPR 3). Comparativo antigo de botões: `docs/design-shots/botoes-opcoes.png`.
