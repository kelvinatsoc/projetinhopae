# App Android (APK) — detalhes técnicos

Guia para quem programa (ou para outro assistente de IA) manter o app Android do **Lendas da Base**.
Para instruções simples de instalação, veja o [COMO-JOGAR.md](COMO-JOGAR.md).

## Visão geral

- O jogo é uma página web (Vite + React + TypeScript). O **Capacitor 8** empacota o `dist/` dentro de um
  app Android nativo (WebView). Nada é baixado da internet: o APK funciona offline.
- `appId`: `com.kelvinatsoc.lendasdabase` · nome: *Lendas da Base* · orientação: retrato.
- Versão: `versionName 0.2.0` / `versionCode 2` (em `android/app/build.gradle`; acompanhe o `version` do `package.json`).
- SDK: `minSdk 24` (Android 7), `compileSdk 36`, `targetSdk 36` (Android 16) — em `android/variables.gradle`.
- Ferramentas: Android Gradle Plugin 8.13, Gradle 8.14.3 (wrapper), **Java 21**.
- Plugins: `@capacitor/app`, `@capacitor/filesystem`, `@capacitor/share`, `@capacitor/splash-screen`
  (e o `SystemBars`, que já vem no `@capacitor/core`).

| Arquivo | Para quê |
| --- | --- |
| `capacitor.config.ts` | appId, cor de fundo, SystemBars (de ponta a ponta) e tela de abertura |
| `android/` | projeto nativo (versionado). `app/src/main/assets/public` e `capacitor-cordova-android-plugins/` são gerados pelo `cap sync` (ignorados no git) |
| `src/native.ts` | integração nativa (só carrega dentro do APK) |
| `src/main.tsx` | no APK não registra o service worker e chama o `native.ts` |
| `src/save.ts` | exportar save: no APK usa Filesystem + Share |
| `assets/gerar_icones.py` | gera ícone adaptável e telas de abertura a partir de `public/icons/icon-512.png` |
| `.github/workflows/android.yml` | gera o APK no GitHub e publica na Release `apk-latest` |
| `Gerar-APK.bat` / `gerar-apk.sh` | gerar o APK com dois cliques (Android Studio instalado) |

## Pré-requisitos

- **Node.js 22** (LTS) e npm.
- **JDK 21**. O mais fácil é o que vem com o Android Studio (pasta `jbr`):
  Windows `C:\Program Files\Android\Android Studio\jbr`, Mac `/Applications/Android Studio.app/Contents/jbr/Contents/Home`.
- **Android SDK** com `platforms;android-36`, `build-tools;35.0.0` e `platform-tools`. O Android Studio instala
  (Windows `%LOCALAPPDATA%\Android\Sdk`, Mac `~/Library/Android/sdk`, Linux `~/Android/Sdk`).
  Sem Android Studio (servidor/CI):

  ```bash
  # baixe o "commandlinetools-linux-*_latest.zip" (o nome atual está em
  # https://dl.google.com/android/repository/repository2-1.xml) e extraia em $ANDROID_HOME/cmdline-tools/latest
  export ANDROID_HOME=/opt/android-sdk
  yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
  $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-36" "build-tools;35.0.0"
  ```

  O Gradle acha o SDK pela variável `ANDROID_HOME` ou pelo arquivo `android/local.properties`
  (`sdk.dir=...`, não versionado — os scripts `Gerar-APK` escrevem ele).

## Comandos

```bash
npm ci                    # dependências (exatamente as do package-lock.json)
npm run android:sync      # npm run build + npx cap sync android (copia dist/ para o projeto Android)
npm run apk               # android:sync + ./gradlew assembleRelease (Mac/Linux/Git Bash;
                          # no Prompt do Windows use o Gerar-APK.bat ou "cd android && gradlew assembleRelease")
# o APK sai em android/app/build/outputs/apk/release/app-release.apk

adb install -r android/app/build/outputs/apk/release/app-release.apk   # instalar com o celular no USB
npx cap open android      # abre o projeto no Android Studio
```

- Rode `npx cap sync android` **sempre** depois de `npm run build`, de mudar o `capacitor.config.ts` ou de
  instalar/remover plugins. Sem isso o APK sai com o jogo antigo (ou tela preta, se `assets/public` não existir).
- A mídia de `public/media/` vai inteira para dentro do APK (o tamanho do APK cresce junto).
- Depurar a WebView: gere `./gradlew assembleDebug` (no APK de desenvolvimento o Capacitor liga a depuração),
  instale e abra `chrome://inspect` no Chrome do computador com o celular no USB.
- Conferir um APK: `apksigner verify --print-certs <apk>` e `aapt2 dump badging <apk>` (ficam em
  `$ANDROID_HOME/build-tools/<versão>/`).

## O que o app faz de diferente da versão web (`src/native.ts`)

Só roda quando `Capacitor.isNativePlatform()` é verdadeiro; no navegador nada disso é carregado.

- **Botão/gesto voltar**: fecha uma folha inferior (`.overlay`) aberta; senão, se há telas empilhadas,
  chama `back()` do `store.ts` (o `popstate` de lá impede sair da partida ao vivo, fim de temporada e demissão);
  senão, se a aba não é *Início*, volta para *Início*; senão minimiza o app (`App.minimizeApp()`), sem fechar.
- **Salvar ao sair**: no evento `pause` do app (home, trocar de app, apagar a tela) chama `autosave(true)` de
  `src/ui/actions.ts` (respeita a opção de salvamento automático das configurações).
- **Tela de abertura**: fundo `#0c1712` com o ícone (API de splash do Android 12+, com compatibilidade).
  O `native.ts` esconde assim que o jogo desenha a primeira tela (e ela some sozinha em 1,5 s de qualquer jeito).
- **Barras do sistema**: ícones claros sobre o fundo escuro; no tema claro do jogo, ícones escuros.
- **Importar save**: o seletor de arquivos do Android mostra todos os arquivos (alguns apps salvam `.json`
  com outro tipo); o conteúdo é validado na importação.
- **Exportar save** (`src/save.ts`): grava o `.json` no cache do app (`Directory.Cache`) e abre o menu
  *Compartilhar* (Google Drive, WhatsApp, e-mail, Quick Share...). No navegador continua baixando o arquivo.
- **Sem service worker** no APK (o jogo já está dentro do app; evita cache velho depois de atualizar).
- **De ponta a ponta (Android 15+)**: o `SystemBars` com `insetsHandling: "css"` e o `viewport-fit=cover`
  fazem a página passar por baixo das barras; o CSS usa `env(safe-area-inset-*)` na barra superior, na barra de
  navegação, no botão flutuante, nas folhas inferiores e na tela inicial. Em WebViews antigas (Chromium < 140)
  o Capacitor afasta a WebView das barras e os insets valem 0 — nos dois casos o layout fica certo.

## Ícone e tela de abertura

- Ícone adaptável: camada da frente = `public/icons/icon-512.png` (74/108 do quadro, o escudo dentro da área
  segura), fundo `#0c1712`. Ícones antigos (Android 7) e telas de abertura legadas também são gerados.
- Para trocar: mude `public/icons/icon-512.png` e rode `python3 assets/gerar_icones.py` (precisa do Pillow).

## Assinatura do APK (importante)

O Android só deixa **atualizar** um app instalado se o APK novo tiver **a mesma assinatura** (a mesma chave).
Com chave diferente, a instalação falha ("App não instalado" / "conflito com um pacote existente") e o único
jeito é **desinstalar — o que apaga os jogos salvos** (a menos que o jogador exporte o save antes).

Por isso o projeto aceita uma **chave fixa**, que **nunca fica no repositório**:

- `android/app/build.gradle` lê `LENDAS_KEYSTORE_FILE`, `LENDAS_KEYSTORE_PASSWORD`, `LENDAS_KEY_ALIAS` e
  `LENDAS_KEY_PASSWORD` de **variáveis de ambiente** ou de **propriedades do Gradle**
  (`~/.gradle/gradle.properties`, fora do projeto).
- Sem elas, o `assembleRelease` assina com a **chave de depuração** do computador (`~/.android/debug.keystore`):
  o APK instala normalmente, mas cada computador tem a sua. No GitHub Actions essa chave de depuração fica
  guardada no cache do Actions para os próximos builds saírem iguais — o cache pode expirar após 7 dias sem uso,
  então a solução definitiva é a chave fixa.
- Ao passar da chave de depuração para a chave fixa, o jogador precisa desinstalar **uma vez** (exportando o save antes).

### Criar a chave fixa (uma vez só)

1. Gere o arquivo de chave com o `keytool` (vem com o Java/Android Studio). Ele **pergunta** as senhas —
   anote-as num gerenciador de senhas; não escreva em arquivos do projeto.

   ```bash
   # Windows (Prompt de Comando):
   "%ProgramFiles%\Android\Android Studio\jbr\bin\keytool" -genkeypair -v -keystore lendas.jks -alias lendas -keyalg RSA -keysize 2048 -validity 10000
   # Mac/Linux:
   keytool -genkeypair -v -keystore lendas.jks -alias lendas -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Guarde o `lendas.jks` num lugar seguro **fora do projeto** (e faça backup: perder a chave = não dá mais
   para atualizar o app sem desinstalar). `*.jks` e `*.keystore` já estão no `.gitignore`.
3. Converta o arquivo para texto base64 (vai para o secret):

   ```bash
   # Windows (PowerShell) — copia para a área de transferência:
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("lendas.jks")) | Set-Clipboard
   # Mac:
   base64 -i lendas.jks | pbcopy
   # Linux:
   base64 -w0 lendas.jks
   ```

4. No GitHub: **Settings › Secrets and variables › Actions › New repository secret**, crie os 4 secrets:

   | Secret | Valor |
   | --- | --- |
   | `LENDAS_KEYSTORE_BASE64` | o texto base64 do passo 3 |
   | `LENDAS_KEYSTORE_PASSWORD` | a senha do arquivo de chave |
   | `LENDAS_KEY_ALIAS` | o alias (no exemplo: `lendas`) |
   | `LENDAS_KEY_PASSWORD` | a senha da chave (se não criou uma separada, a mesma do arquivo) |

5. Para assinar com ela também no seu computador, coloque no `~/.gradle/gradle.properties` (na pasta do
   usuário, **não** no projeto): `LENDAS_KEYSTORE_FILE=/caminho/absoluto/lendas.jks` e as outras três
   propriedades — ou defina as quatro como variáveis de ambiente antes de rodar o Gradle.

O log do Gradle diz qual chave foi usada ("assinado com a chave fixa" ou "usa a chave de depuração").

## GitHub Actions (`.github/workflows/android.yml`)

Roda a cada push na `main` e em `claude/**`, ou à mão (*Actions › APK Android › Run workflow*):

1. `npm ci`, `npm test`, `npm run build`, `npx cap sync android`;
2. Java 21 (Temurin) + Android SDK (`android-actions/setup-android`);
3. chave fixa dos secrets, se existirem (decodificada em `$RUNNER_TEMP`, apagada no fim); senão a chave de depuração do cache;
4. `./gradlew assembleRelease --no-daemon` → `LendasDaBase.apk`;
5. envia o APK como *artifact* e **substitui** a Release `apk-latest` ("Lendas da Base — APK") pelo APK novo
   (apaga a release e a tag antigas com `gh release delete --cleanup-tag` e cria de novo no commit atual).

Link fixo para baixar: `https://github.com/kelvinatsoc/projetinhopae/releases/tag/apk-latest`.
Um push novo cancela o build anterior que ainda estava rodando. Precisa de `permissions: contents: write`
(já no workflow); se o repositório restringir o token, libere em *Settings › Actions › General › Workflow permissions*.

## Lançar uma versão nova

1. Suba o `version` do `package.json` e, em `android/app/build.gradle`, o `versionName` e o `versionCode` (+1).
2. Faça push: o GitHub Actions gera e publica o APK. Os jogadores instalam por cima (mesma chave = saves mantidos).

## Problemas comuns

| Sintoma | Causa / solução |
| --- | --- |
| `SDK location not found` | Defina `ANDROID_HOME` ou crie `android/local.properties` com `sdk.dir=<caminho do SDK>` (no Windows use `/` ou `\\`). |
| `invalid source release: 21` / `Unsupported class file major version` | Gradle rodando com Java errado. Use o JDK 21 (o `jbr` do Android Studio atual) e confira `JAVA_HOME`. Android Studio antigo traz Java 17: atualize. |
| `Failed to install the following SDK components` / licenças | `yes \| sdkmanager --licenses` e instale `platforms;android-36` e `build-tools;35.0.0`. |
| Aviso `SDK XML version 4` | Inofensivo (command-line tools mais novas que o Android Gradle Plugin). |
| Celular: "App não instalado" / "conflito com um pacote existente" | Assinatura diferente da instalada. Exporte o save, desinstale, instale o novo e importe o save. |
| Samsung bloqueia a instalação | Desligue o *Bloqueador automático* (Configurações › Segurança e privacidade) e permita "instalar apps desconhecidos" para o navegador/Meus Arquivos. |
| APK abre com tela preta ou jogo antigo | Faltou `npm run build` + `npx cap sync android` antes do Gradle. |
| Gradle não baixa nada atrás de proxy | Configure `systemProp.https.proxyHost/Port` no `~/.gradle/gradle.properties`. |
| Build muito lento ou sem memória | Feche o Android Studio durante o build; `org.gradle.jvmargs` fica em `android/gradle.properties`. |
