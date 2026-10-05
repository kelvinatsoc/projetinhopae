# ⚽ Como jogar Lendas da Base

Tem três jeitos. O **primeiro é o melhor** para quem tem celular Android (como o Galaxy S24 Ultra).

---

## 1. No celular Android: instalar o APK (recomendado)

O APK é o "instalador" do jogo. Ele funciona **sem internet** e guarda os jogos salvos no próprio celular.

1. No celular, abra este link no navegador:
   **https://github.com/kelvinatsoc/projetinhopae/releases/tag/apk-latest**
2. Em **Assets**, toque em **LendasDaBase.apk** para baixar.
3. Quando terminar, toque na notificação do download (ou abra o app **Meus Arquivos › Downloads** e toque no arquivo).
4. O Android avisa que o app vem de uma fonte desconhecida. Toque em **Configurações** e ligue
   **"Permitir desta fonte"** (no Samsung: *Instalar apps desconhecidos*). Volte e toque em **Instalar**.
5. Se o **Play Protect** perguntar, toque em **Mais detalhes › Instalar assim mesmo**.
6. Pronto! O ícone **Lendas da Base** aparece junto com os outros apps.

> **Samsung bloqueou a instalação?** Os Galaxy mais novos têm o **Bloqueador automático**.
> Desligue em **Configurações › Segurança e privacidade › Bloqueador automático**, instale o jogo
> e, se quiser, ligue de novo depois.

**Para atualizar:** baixe o APK novo no mesmo link e instale **por cima**. Os jogos salvos continuam.
Se o celular disser *"App não instalado"* ou *"conflito com um pacote existente"*, é porque o APK novo
foi assinado com outra chave. Aí faça assim: no jogo, **Clube › Configurações › Backup › Exportar save** (guarde no
Google Drive ou mande para você mesmo), desinstale o jogo, instale o novo e, na tela inicial, toque em
**Importar arquivo de save**.

**Dicas no app:** o botão/gesto **voltar** do Android fecha a tela atual; o jogo salva sozinho quando você
sai do app.

---

## 2. No computador (e no celular pelo Wi-Fi)

1. Instale o **Node.js** (é grátis): **https://nodejs.org/pt** › baixe a versão **LTS** › *Avançar, Avançar, Instalar*.
2. Baixe o jogo:
   **https://github.com/kelvinatsoc/projetinhopae/archive/refs/heads/claude/ecstatic-tesla-mamls5.zip**
3. Clique com o **botão direito** no arquivo ZIP baixado › **Extrair tudo…** › **Extrair**.
   ⚠️ Não abra o jogo de dentro do ZIP: use a pasta extraída.
4. Na pasta extraída, dê **dois cliques em `Jogar.bat`**.
   Se aparecer *"O Windows protegeu o computador"*, clique em **Mais informações › Executar assim mesmo**.
5. Na primeira vez ele instala o que precisa (alguns minutos). Depois aparece uma **janela preta** com os endereços.
6. Para jogar:
   - **no computador:** abra **http://localhost:4173** no navegador;
   - **no celular** (no **mesmo Wi-Fi** do computador): aponte a câmera para o **QR code** da janela preta
     (ou digite no navegador do celular o endereço que aparece em *"No celular"*).
7. Se o Windows perguntar sobre o **Firewall** e o Node.js, marque **Redes privadas** e clique em **Permitir acesso**
   (sem isso o celular não consegue abrir o jogo).
8. **Deixe a janela preta aberta** enquanto joga. Para parar, é só fechar a janela.

No Mac ou no Linux: abra o Terminal na pasta do jogo e rode `bash jogar.sh`.

> **Atenção com os jogos salvos no navegador:** eles ficam guardados **naquele navegador e naquele endereço**.
> Se o endereço mudar (por exemplo, o IP do computador mudou, ou você abriu por `localhost` e depois pelo IP),
> o save não aparece — ele não foi apagado, só ficou no outro endereço. Para carreiras longas, **use o APK**.
> Para levar um save de um lugar para outro: **Clube › Configurações › Backup › Exportar save** e, na tela inicial,
> **Importar arquivo de save**.

---

## 3. Gerar o APK você mesmo (opcional)

Só se quiser montar o APK no seu computador em vez de baixar pronto.

1. Instale o **Node.js LTS** (passo 2.1 acima) e o **Android Studio**: **https://developer.android.com/studio**.
2. Abra o Android Studio **uma vez** e conclua a configuração inicial (escolha *Standard*). Ele baixa o Android SDK.
3. Na pasta do jogo, dê **dois cliques em `Gerar-APK.bat`** (Mac/Linux: `bash gerar-apk.sh`).
4. A primeira vez demora (baixa bastante coisa). No fim, o arquivo **`LendasDaBase.apk`** aparece na pasta do jogo.
5. Passe o APK para o celular (Quick Share, Google Drive, WhatsApp como documento ou cabo USB) e instale como no passo 1.

> O APK gerado no seu computador tem uma assinatura diferente do APK do GitHub. Trocar de um para o outro
> exige desinstalar o jogo — exporte o save antes.

Detalhes técnicos (para quem programa): veja o [ANDROID.md](ANDROID.md).
