@echo off
setlocal
title Lendas da Base - gerar o APK
cd /d "%~dp0"

rem Gera o APK do Android neste computador (Windows).
rem Precisa do Node.js LTS e do Android Studio (aberto pelo menos uma vez, para baixar o Android SDK).

echo.
echo  ==== Lendas da Base: gerar o APK do Android ====
echo.

rem ---------- Node.js
where node >nul 2>nul
if errorlevel 1 goto sem_node

rem ---------- Java: o que vem junto com o Android Studio (pasta "jbr")
set "JBR="
if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JBR=%ProgramFiles%\Android\Android Studio\jbr"
if not defined JBR if exist "%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\java.exe" set "JBR=%LOCALAPPDATA%\Programs\Android Studio\jbr"
if defined JBR set "JAVA_HOME=%JBR%"
if not defined JAVA_HOME goto sem_studio
if not exist "%JAVA_HOME%\bin\java.exe" goto sem_studio
set "PATH=%JAVA_HOME%\bin;%PATH%"

rem ---------- Android SDK (o Android Studio baixa na primeira vez que abre)
if defined ANDROID_HOME if not exist "%ANDROID_HOME%\platforms" set "ANDROID_HOME="
if not defined ANDROID_HOME if defined ANDROID_SDK_ROOT if exist "%ANDROID_SDK_ROOT%\platforms" set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk\platforms" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_HOME goto sem_sdk

rem o Gradle le o caminho do SDK deste arquivo (barras "/" funcionam no Windows)
set "SDKDIR=%ANDROID_HOME:\=/%"
> "android\local.properties" echo sdk.dir=%SDKDIR%

echo  Java:        %JAVA_HOME%
echo  Android SDK: %ANDROID_HOME%
echo.

rem ---------- dependencias do jogo (so na primeira vez)
if exist "node_modules\@capacitor\android\" goto compilar
echo  Instalando as dependencias (so na primeira vez, pode levar alguns minutos)...
call npm install --no-audit --no-fund
if errorlevel 1 goto erro

:compilar
echo.
echo  [1/3] Compilando o jogo...
call npm run build
if errorlevel 1 goto erro

echo.
echo  [2/3] Copiando o jogo para o projeto Android...
call npx cap sync android
if errorlevel 1 goto erro

echo.
echo  [3/3] Gerando o APK (a primeira vez demora: o Gradle baixa varias coisas)...
pushd android
call gradlew.bat assembleRelease
set "RESULTADO=%ERRORLEVEL%"
popd
if not "%RESULTADO%"=="0" goto erro

copy /y "android\app\build\outputs\apk\release\app-release.apk" "LendasDaBase.apk" >nul
if errorlevel 1 goto erro

echo.
echo  ==============================================================
echo   Pronto! O APK esta em:
echo     %CD%\LendasDaBase.apk
echo.
echo   Para passar para o celular, escolha um jeito:
echo    - Quick Share (Samsung) ou Google Drive;
echo    - mande para voce mesmo no WhatsApp/Telegram (como documento);
echo    - ou ligue o celular no cabo USB e copie para a pasta Download.
echo   No celular, toque no arquivo e permita "instalar apps desconhecidos".
echo  ==============================================================
echo.
explorer /select,"%CD%\LendasDaBase.apk"
pause
exit /b 0

:sem_node
echo  Precisa do Node.js (gratis). Vou abrir o site: baixe a versao "LTS",
echo  instale e depois abra este arquivo de novo.
start "" "https://nodejs.org/pt"
goto fim_erro

:sem_studio
echo  Nao achei o Java do Android Studio.
echo  Instale o Android Studio (gratis), abra ele uma vez ate o fim da configuracao
echo  e depois abra este arquivo de novo. Vou abrir o site.
start "" "https://developer.android.com/studio"
goto fim_erro

:sem_sdk
echo  Nao achei o Android SDK.
echo  Abra o Android Studio uma vez e conclua a configuracao inicial (ele baixa o SDK
echo  em %LOCALAPPDATA%\Android\Sdk). Depois abra este arquivo de novo.
goto fim_erro

:erro
echo.
echo  Algo deu errado (veja as mensagens acima). Dicas:
echo   - verifique a internet (a primeira vez baixa bastante coisa);
echo   - feche e abra este arquivo de novo;
echo   - mais detalhes no arquivo ANDROID.md, secao "Problemas comuns".

:fim_erro
echo.
pause
exit /b 1
