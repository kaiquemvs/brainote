# brainote

App pessoal de notas para Windows 11, com visual inspirado no Notas do macOS: notas, checklists, agenda, lembretes e post-its (widgets) na área de trabalho. Uso individual, dados 100% locais.

## Sobre o dono do projeto

- Trabalho com TI, mas **não sou programador**. Explique em português simples o que vai fazer.
- Ao terminar cada etapa, me diga **exatamente como testar**: o comando a rodar e o que clicar.
- **Peça confirmação antes de**: instalar programas no Windows, trocar a stack, apagar arquivos ou mudar algo fora da fase atual.
- O app roda num **notebook corporativo** (ingressado no domínio). Políticas de segurança podem bloquear executáveis não assinados; por isso testamos o instalador logo na Fase 0.

## Onde está cada coisa

- `docs/ESPECIFICACAO.md` — o que construir. **É a fonte da verdade.** Na dúvida, siga ela e me pergunte.
- `referencia/prototipo.dc.html` — protótipo visual **aprovado**. É só referência: reproduza o layout, as cores e os comportamentos; não tente rodar nem copiar o arquivo como está (ele usa um formato próprio de protótipo).
- `referencia/icone-final.png` — o ícone aprovado, versões clara e escura.
- `assets/icone/` — arquivos oficiais do ícone (PNG 1024, `.ico`, SVG).

## Stack (decidida)

- **Tauri 2** (backend em Rust) + **React + TypeScript + Vite**.
- Estilo em **CSS puro com variáveis** (os tokens estão na especificação). Sem frameworks de UI pesados.
- Editor de texto: **TipTap** (com lista de tarefas para os checklists).
- Banco: **SQLite** local, acessado pelo **backend Rust** (`rusqlite`) e exposto ao front por comandos Tauri. O agendador de lembretes também roda no Rust.
- Fonte **Inter** empacotada no app (licença OFL), sem depender de internet.
- Plugins oficiais do Tauri conforme a fase: notificação, autostart, single-instance, dialog.

## Comandos

```bash
npm install                 # instala dependências
npm run tauri dev           # roda o app em modo de desenvolvimento
npm run tauri build         # gera o instalador em src-tauri/target/release/bundle/
npx tauri icon assets/icone/brainote-claro-1024.png   # gera os ícones do app
```

## Como trabalhar

- Construa **por fases**, na ordem da seção 9 da especificação. Uma fase por vez.
- Antes de começar uma fase, mostre um plano curto e espere meu ok.
- No fim de cada fase: rode o app, liste o que eu devo testar e, depois do meu ok, faça um commit `fase N: <resumo>`.
- Não adicione funções que não estão na especificação sem perguntar.
- Textos da interface em **português do Brasil**. O nome é sempre **brainote**, em minúsculas.
- Acessibilidade básica: botões de verdade, foco visível pelo teclado e contraste legível nos dois temas.
- A pasta do projeto já tem `docs/`, `referencia/` e `assets/`. Crie o app Tauri **nesta mesma pasta** (raiz do repositório), preservando esses arquivos.

## Regras do produto (resumo)

- Dados só no computador (`%APPDATA%\brainote`). Sem nuvem, sem login e sem telemetria na v1.
- Fechar a janela principal **esconde na bandeja**; o app só fecha pelo menu da bandeja ("Sair").
- Cada widget é uma **janela própria**, sem borda e fora da barra de tarefas.
- Lembretes disparam notificação do Windows mesmo com a janela fechada (o app fica na bandeja).
