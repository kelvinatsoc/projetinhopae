#!/usr/bin/env bash
# Lendas da Base: gera o APK do Android neste computador (Mac ou Linux).
# Precisa do Node.js LTS e do Android Studio (aberto pelo menos uma vez, para baixar o Android SDK).
cd "$(dirname "$0")" || exit 1

falha() {
  echo
  echo " $1"
  echo
  exit 1
}

echo
echo " ==== Lendas da Base: gerar o APK do Android ===="
echo

command -v node >/dev/null 2>&1 || falha "Precisa do Node.js (grátis): baixe a versão LTS em https://nodejs.org/pt e rode este arquivo de novo."

# Java: prefere o que vem junto com o Android Studio (pasta "jbr")
for d in "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
         "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
         "$HOME/android-studio/jbr" "/opt/android-studio/jbr" "/snap/android-studio/current/jbr"; do
  if [ -x "$d/bin/java" ]; then export JAVA_HOME="$d"; break; fi
done
if [ -z "$JAVA_HOME" ] && ! command -v java >/dev/null 2>&1; then
  falha "Não achei o Java. Instale o Android Studio (https://developer.android.com/studio), abra ele uma vez e rode este arquivo de novo."
fi
[ -n "$JAVA_HOME" ] && export PATH="$JAVA_HOME/bin:$PATH"

# Android SDK (o Android Studio baixa na primeira vez que abre)
if [ ! -d "$ANDROID_HOME/platforms" ]; then
  ANDROID_HOME=""
  for d in "$ANDROID_SDK_ROOT" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [ -n "$d" ] && [ -d "$d/platforms" ]; then export ANDROID_HOME="$d"; break; fi
  done
fi
[ -n "$ANDROID_HOME" ] && [ -d "$ANDROID_HOME/platforms" ] || \
  falha "Não achei o Android SDK. Abra o Android Studio uma vez e conclua a configuração inicial; depois rode este arquivo de novo."
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

echo " Java:        ${JAVA_HOME:-$(command -v java)}"
echo " Android SDK: $ANDROID_HOME"

if [ ! -d node_modules/@capacitor/android ]; then
  echo
  echo " Instalando as dependências (só na primeira vez, pode levar alguns minutos)..."
  npm install --no-audit --no-fund || falha "Não consegui instalar as dependências. Verifique a internet."
fi

echo; echo " [1/3] Compilando o jogo..."
npm run build || falha "A compilação do jogo falhou (veja as mensagens acima)."

echo; echo " [2/3] Copiando o jogo para o projeto Android..."
npx cap sync android || falha "Não consegui copiar o jogo para o projeto Android."

echo; echo " [3/3] Gerando o APK (a primeira vez demora: o Gradle baixa várias coisas)..."
(cd android && chmod +x gradlew && ./gradlew assembleRelease) || \
  falha "O Gradle não conseguiu gerar o APK (veja as mensagens acima e a seção \"Problemas comuns\" do ANDROID.md)."

cp android/app/build/outputs/apk/release/app-release.apk LendasDaBase.apk || falha "Não achei o APK gerado."

echo
echo " =============================================================="
echo "  Pronto! O APK está em:"
echo "    $(pwd)/LendasDaBase.apk"
echo
echo "  Para passar para o celular, escolha um jeito:"
echo "   - Quick Share (Samsung) ou Google Drive;"
echo "   - mande para você mesmo no WhatsApp/Telegram (como documento);"
echo "   - ou ligue o celular no cabo USB e copie para a pasta Download."
echo "  No celular, toque no arquivo e permita \"instalar apps desconhecidos\"."
echo " =============================================================="
echo
