@echo off
chcp 65001 >nul
title Lendas da Base
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Para jogar no computador e preciso instalar o Node.js ^(gratis^).
  echo  Vou abrir o site: baixe a versao "LTS", instale e depois abra este arquivo de novo.
  echo.
  start "" "https://nodejs.org/pt"
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo.
  echo  Instalando o jogo ^(so na primeira vez, pode levar alguns minutos^)...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  Nao consegui instalar. Verifique a internet e tente de novo.
    pause
    exit /b 1
  )
)

node scripts\jogar.mjs
pause
