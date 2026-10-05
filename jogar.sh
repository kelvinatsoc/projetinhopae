#!/usr/bin/env bash
# Lendas da Base: roda o jogo neste computador e mostra o QR code para abrir no celular.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo " Para jogar no computador é preciso instalar o Node.js (grátis): https://nodejs.org/pt"
  echo " Baixe a versão LTS, instale e rode este arquivo de novo."
  echo
  exit 1
fi

if [ ! -d node_modules ]; then
  echo
  echo " Instalando o jogo (só na primeira vez, pode levar alguns minutos)..."
  echo
  npm install --no-audit --no-fund || { echo " Não consegui instalar. Verifique a internet."; exit 1; }
fi

node scripts/jogar.mjs
