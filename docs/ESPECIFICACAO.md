# brainote — Especificação da v1

Versão do documento: 18/11/2026. O visual foi aprovado no protótipo (`referencia/prototipo.dc.html`) e no ícone (`referencia/icone-final.png`).

---

## 1. Visão geral

O brainote é um app de notas para Windows 11, para uso pessoal no dia a dia. Ele deve ser **simples e sem complicação**, com o visual e a sensação do Notas do macOS.

Funções da v1:

1. **Notas** organizadas em pastas, com busca e notas fixadas.
2. **Checklists** dentro das notas.
3. **Lembretes** com notificação do Windows.
4. **Agenda**: calendário do mês com eventos e lembretes.
5. **Widgets na área de trabalho**: post-it, checklist e agenda do dia.
6. **Aparência**: tema claro/escuro e "efeito vidro" (transparência do Windows 11).

O app fica aberto o dia todo na bandeja do sistema (perto do relógio), precisa ser leve e abrir junto com o Windows.

---

## 2. Identidade

- **Nome:** brainote (sempre em minúsculas, inclusive no título da janela e no instalador).
- **Ícone:** duas notas de vidro sobrepostas, retas, sobre fundo laranja sólido. Arquivos em `assets/icone/`:
  - `brainote-claro-1024.png`: base para `npx tauri icon` (gera todos os tamanhos do app).
  - `brainote-claro.ico` / `brainote-escuro.ico`: `.ico` prontos (16 a 256 px).
  - `svg/`: originais vetoriais.
  - O ícone do app no Windows usa a versão **clara**. A versão escura fica disponível para uso futuro.
- **Cor da marca (ícone):** laranja `#FF8C42`. Versão escura do ícone: logo laranja sobre `#1C1C1E`.
- **Cor de destaque da interface:** amarelo (igual ao protótipo). Veja os tokens.
- **Tipografia:** Inter (400, 500, 600, 700), empacotada no app.
- **Ícones da interface:** traço fino e arredondado (estilo do protótipo: SVG inline, `stroke-width` 1.8, pontas arredondadas). Pode usar a biblioteca **Lucide** se ela tiver os equivalentes.

---

## 3. Tokens de design

Copiados do protótipo aprovado. Use como variáveis CSS no `:root` com classes de tema.

```css
/* Tema claro (opaco) */
.t-light {
  --text: #1C1C1E;  --text2: #5C5C61;
  --side: #EFEEEA;  --list: #F8F8F6;  --edit: #FFFFFF;  --card: #F4F3F0;
  --sep: rgba(0,0,0,.09);  --hover: rgba(0,0,0,.05);
  --sel: #FCE6A0;  --seltext: #1C1C1E;  --seltext2: #4D4231;  --side-sel: rgba(0,0,0,.075);
  --acc: #8F5B00;        /* texto/ícone de destaque */
  --accfill: #F5B800;    /* preenchimento de destaque (checkbox marcado, botões) */
  --acctick: #1C1C1E;    /* conteúdo sobre --accfill */
  --chip: rgba(245,184,0,.18);  --field: rgba(0,0,0,.055);
  --seg-on: #FFFFFF;  --sw-off: rgba(0,0,0,.2);  --pop: #FFFFFF;  --widget: #FFFFFF;
  --win-shadow: 0 24px 70px rgba(40,30,80,.28), 0 0 0 1px rgba(0,0,0,.1);
  --w-shadow: 0 14px 40px rgba(40,30,80,.22);
  --rim: inset 0 0 0 1px rgba(0,0,0,.04);
  --blur: none;
}

/* Tema escuro (opaco) */
.t-dark {
  --text: #F2F2F3;  --text2: #A8A8AE;
  --side: #29292B;  --list: #222224;  --edit: #1C1C1E;  --card: #262628;
  --sep: rgba(255,255,255,.09);  --hover: rgba(255,255,255,.06);
  --sel: #6B5208;  --seltext: #FFFFFF;  --seltext2: #EFE3BF;  --side-sel: rgba(255,255,255,.1);
  --acc: #FFD60A;  --accfill: #FFD60A;  --acctick: #1C1C1E;
  --chip: rgba(255,214,10,.14);  --field: rgba(255,255,255,.08);
  --seg-on: #4A4A4D;  --sw-off: rgba(255,255,255,.24);  --pop: #2C2C2E;  --widget: #262628;
  --win-shadow: 0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08);
  --w-shadow: 0 14px 40px rgba(0,0,0,.45);
  --rim: inset 0 0 0 1px rgba(255,255,255,.06);
  --blur: none;
}

/* Efeito vidro ligado: superfícies translúcidas */
.t-light.g-on {
  --side: rgba(244,243,248,.6);  --list: rgba(250,250,252,.68);  --edit: rgba(255,255,255,.78);
  --card: rgba(255,255,255,.55);  --pop: rgba(255,255,255,.82);  --widget: rgba(255,255,255,.58);
  --blur: blur(28px) saturate(180%);
  --rim: inset 0 1px 0 rgba(255,255,255,.85), inset 0 0 0 1px rgba(255,255,255,.45);
}
.t-dark.g-on {
  --side: rgba(34,34,38,.58);  --list: rgba(30,30,34,.64);  --edit: rgba(24,24,26,.72);
  --card: rgba(255,255,255,.06);  --pop: rgba(44,44,48,.84);  --widget: rgba(30,30,34,.62);
  --blur: blur(28px) saturate(160%);
  --rim: inset 0 1px 0 rgba(255,255,255,.2), inset 0 0 0 1px rgba(255,255,255,.08);
}

/* Cores do post-it (--pi = fundo, --pit = texto) */
.t-light .pc-amarelo { --pi: #FFE57A; --pit: #3D3000; }
.t-light .pc-verde   { --pi: #C6EFB3; --pit: #173D0E; }
.t-light .pc-rosa    { --pi: #FFCADC; --pit: #4A1027; }
.t-light .pc-azul    { --pi: #C2E2FF; --pit: #0D2E4F; }
.t-dark  .pc-amarelo { --pi: #5C4A0C; --pit: #FFF0BF; }
.t-dark  .pc-verde   { --pi: #284A1F; --pit: #DDF6D0; }
.t-dark  .pc-rosa    { --pi: #5B2238; --pit: #FFD9E7; }
.t-dark  .pc-azul    { --pi: #1C3D5E; --pit: #D7ECFF; }
```

Medidas de referência:

- **Janela:** cantos de 14 px.
- **Linhas da lista:** cantos de 10 px.
- **Widgets:** cantos de 22 px; post-it com 14 px.
- **Texto do editor:** 15 px com entrelinha 1.6; título da nota com 26 px em negrito.
- **Barra lateral:** 224 px; lista de notas: 292 px; o editor ocupa o resto.
- **Altura das barras de topo:** 52 px.

> O fundo de "área de trabalho" do protótipo (círculos coloridos) era só para simular o Windows. No app real, o que fica atrás da janela é a área de trabalho de verdade.

---

## 4. Janela principal

Uma janela única, **sem a borda padrão do Windows** (`decorations: false`), com barra de título própria.

### 4.1 Barra de título

- **Botões no canto direito, no estilo do Windows 11:** minimizar, maximizar/restaurar e fechar. O fechar fica vermelho `#C42B1C` ao passar o mouse.
- **Arrastar:** a área vazia das barras de topo arrasta a janela (`data-tauri-drag-region`). Duplo clique nela maximiza ou restaura.
- **Fechar:** esconde a janela na bandeja (não encerra o app).
- **Posição e tamanho:** a janela lembra a posição e o tamanho entre aberturas. Tamanho mínimo: 900×600.

### 4.2 Barra lateral (224 px)

- **Topo:** ícone + "brainote".
- **Atalhos:**
  - **Todas as notas** (com contador).
  - **Checklists:** notas que têm pelo menos um item de checklist.
  - **Agenda:** contador de compromissos de hoje.
  - **Lembretes:** contador de pendentes.
- **Pastas:**
  - Lista das pastas, com contador de notas em cada uma.
  - **Nova pasta:** cria a pasta e já deixa o nome editável.
  - Botão direito numa pasta: **Renomear**, **Apagar**. Ao apagar uma pasta, as notas dela vão para "Sem pasta" (aparecem em Todas as notas).
- **Rodapé:**
  - **Aparência:** botões segmentados **Claro / Escuro** e a chave **Efeito vidro**.
  - **Adicionar widget:** abre o menu de widgets (seção 5).
  - Ícone de engrenagem que abre **Configurações** (seção 7).
- O botão de barra lateral, no topo da lista, mostra ou esconde a barra lateral.

### 4.3 Lista de notas (292 px)

- **Barra de topo:** mostrar/esconder barra lateral, **Apagar nota** e **Nova nota**.
- **Busca:** filtra por título e conteúdo, com SQLite FTS5. Na nota aberta, as palavras buscadas ficam **destacadas** (mesma regra: começo de palavra, sem acento) e o texto rola até a primeira; o destaque some ao limpar a busca.
- **Cabeçalho:** nome da seção ou pasta e "N notas".
- **Grupos:**
  - **Fixadas**, **Hoje**, **Ontem**, **Últimos 7 dias**, **Últimos 30 dias**, depois um grupo por mês ("Outubro de 2026").
  - Dentro de cada grupo, as mais recentes primeiro.
- **Cada linha:**
  - Título em negrito.
  - Hora (se for de hoje), "Ontem" ou data dd/mm, seguida da prévia do texto.
  - Nome da pasta, quando estiver em "Todas as notas" ou "Checklists".
- **Nota selecionada:** fundo `--sel`.
- **Botão direito numa nota:**
  - **Fixar/Desafixar**.
  - **Mover para pasta…**.
  - **Fixar na área de trabalho** (post-it).
  - **Apagar**.
- **Apagar:** some na hora e mostra um aviso "Nota apagada · Desfazer" por 6 segundos. O registro ganha `deleted_at`; notas apagadas há mais de 30 dias são removidas de vez.
- **Nova nota:** cria na pasta atual (ou sem pasta), com o foco já no título.

### 4.4 Editor

- **Barra de topo:**
  - **Aa:** menu de formatação.
  - **Checklist:** insere um item de checklist.
  - **Sino:** cria ou edita o lembrete da nota.
  - **Post-it:** fixa a nota na área de trabalho.
  - **Botões da janela**, no canto direito.
- **Conteúdo** (largura máxima de 680 px, centralizado):
  - **Data e hora** da última edição, centralizadas, em `--text2`, por exemplo "18 de novembro de 2026 às 10:40".
  - **Chip do lembrete**, se a nota tiver um: ícone de sino + "Lembrete · Hoje, 16:00". Clicar no chip edita; um "×" remove. O sino é um ícone SVG, não emoji.
  - **Título** em campo próprio, 26 px em negrito.
  - **Corpo** com TipTap. O menu **Aa** oferece:
    - Título, Subtítulo e Corpo.
    - Lista com marcadores e lista numerada.
    - Negrito, itálico, sublinhado e riscado.
  - **Checklist:**
    - Item com bolinha à esquerda. Marcado, a bolinha fica preenchida com `--accfill` e o texto vai para `--text2`.
    - Enter cria um novo item; Enter num item vazio sai do checklist.
    - Ao marcar, o item **fica no mesmo lugar** (não desce para o fim da lista).
    - Ctrl+Enter marca ou desmarca o item onde está o cursor.
- **Salvamento automático** cerca de 500 ms depois da última digitação. Não existe botão "Salvar".
- O conteúdo é salvo como **JSON do TipTap**, mais uma cópia em texto puro para busca e prévia.

### 4.5 Agenda

A agenda ocupa as colunas da lista e do editor.

- **Barra de topo:** mostrar/esconder barra lateral, botão **Hoje**, setas de mês anterior e próximo mês, e **+ Novo evento**.
- **Calendário do mês:**
  - Grade de 7 colunas, de domingo a sábado.
  - Dia de hoje com o número em círculo `--accfill`.
  - Dia selecionado com fundo `--sel`.
  - Um ponto embaixo dos dias que têm compromisso.
  - Dias de outros meses aparecem esmaecidos.
- **Painel do dia:**
  - Dia da semana e data ("Quarta-feira · Hoje / 18 de novembro").
  - Lista em ordem de horário, com selo **Evento** ou **Lembrete**.
  - Clicar num evento abre a edição; clicar num lembrete abre a tela de Lembretes com ele destacado.
  - Dia vazio: "Nenhum compromisso neste dia."
- **Evento:** título, data, hora de início, hora de fim (opcional) ou "dia inteiro", e nota vinculada (opcional). Criar e editar num popover no estilo do protótipo, com opção de apagar.

### 4.6 Lembretes

Também ocupa as colunas da lista e do editor.

- **Cabeçalho:** "Lembretes" e "N pendentes", com **+ Novo lembrete**.
- **Grupos:**
  - **Atrasados**, **Hoje**, **Programados** e **Concluídos**.
  - Concluídos ficam recolhidos por padrão.
- **Cada item:**
  - Bolinha de concluir.
  - Título.
  - Linha com relógio e o quando: "Hoje, 16:00", "Amanhã, 09:00" ou "Sex, 20/11 · 10:00", mais "· Nota: …" se houver nota vinculada.
- **Criar ou editar** (pelo sino do editor ou aqui):
  - Título.
  - Atalhos de data: **Hoje 18:00**, **Amanhã 09:00**, **Próxima segunda 09:00**, **Personalizado** (escolher data e hora).
  - Nota vinculada (opcional).
  - Repetir: nenhum, diário, semanal ou mensal.

---

## 5. Widgets na área de trabalho

- **O que são:** cada widget é uma **janela Tauri separada** (label `widget-<id>`).
  - Sem borda e transparente: o arredondado e a sombra vêm do CSS.
  - Fora da barra de tarefas (`skip_taskbar`).
  - Por padrão, **fica no fundo**, junto da área de trabalho (`always_on_bottom`).
  - Cada widget tem a opção **"Manter por cima das janelas"** (`always_on_top`).
- **Como se usa:**
  - Arrasta-se pelo topo do widget.
  - Pode ser redimensionado, com tamanho mínimo.
  - **Posição e tamanho são salvos** e restaurados quando o app abre.
  - Botão "×" no canto remove o widget.
  - Botão direito no widget: **Abrir no brainote**, **Manter por cima**, **Remover**.
- **Tipos:**
  1. **Post-it:**
     - Mostra uma nota: título e até cerca de 8 linhas, com checklist marcável.
     - Escolha de 4 cores (amarelo, verde, rosa, azul).
     - Criado por "Fixar na área de trabalho" ou pelo menu de widgets (que pede para escolher a nota).
     - Duplo clique abre a nota no app.
     - Tamanho padrão de 260×220.
  2. **Checklist:**
     - Mostra uma nota com checklist: título, "X de Y concluídas", barra de progresso e itens marcáveis.
     - Ao adicionar, escolhe-se qual nota.
     - Tamanho padrão de 300×320.
  3. **Agenda de hoje:**
     - Dia grande, dia da semana e mês.
     - Próximos compromissos e lembretes de hoje (até 4).
     - Sem nada: "Nada mais para hoje."
     - Tamanho padrão de 300×260.
- **Menu "Adicionar widget"** (popover no estilo do protótipo): uma linha por tipo, com ícone, nome, descrição curta e botão **Adicionar** (ou **Remover**, se já existir um daquele tipo; post-its podem ser vários).
- **Sincronização:** quando qualquer dado muda, o backend emite o evento Tauri `data-changed` e todas as janelas recarregam o que mostram. Marcar um item no widget marca na nota, e o contrário também.
- **Tema e vidro:** os widgets seguem o tema e o efeito vidro do app.
- **Win+D (mostrar área de trabalho):** testado na Fase 5. O Windows não minimiza os widgets: ele põe a área de trabalho na frente deles. O app percebe isso e traz os widgets para a frente da área de trabalho; quando outra janela fica ativa, eles voltam para o fundo. Um clique comum na área de trabalho não dispara nada.

---

## 6. Lembretes e notificações

- **Agendador no Rust:**
  - Uma tarefa em segundo plano verifica a cada 30 segundos os lembretes vencidos e não notificados.
  - Para cada um, dispara uma **notificação do Windows** e grava `notified_at`.
  - Lembretes repetidos geram a próxima ocorrência quando a atual é concluída.
- **Ao abrir o app:** se houver lembretes que venceram com o computador desligado, mostra uma única notificação "Você tem N lembretes atrasados".
- **Notificação:**
  - Título: o título do lembrete.
  - Corpo: "Lembrete · Hoje, 16:00 · Tarefas da semana".
  - Clicar na notificação abre o app na tela de Lembretes, com o item destacado.
- **Botões Concluir e Adiar 10 min dentro da notificação:**
  - Implemente se o plugin de notificação escolhido suportar ações no Windows.
  - Se não suportar, **não force**: o clique abre o app e as ações ficam lá.
  - Me avise qual caminho foi possível.
- **Adiar:** grava `snoozed_until` e limpa `notified_at`.

---

## 7. Bandeja, inicialização e configurações

- **Ícone na bandeja** com menu: **Abrir brainote**, **Nova nota**, **Widgets ▸** (lista com marcar/desmarcar), **Sair**.
  - Clique simples no ícone abre ou mostra a janela.
- **Instância única** (plugin single-instance): abrir o app de novo só traz a janela existente para frente.
- **Iniciar com o Windows** (plugin autostart): ligado por padrão, com opção em Configurações. Ao iniciar assim, o app abre **minimizado na bandeja**, com os widgets na tela.
- **Configurações** (janela modal):
  - Iniciar com o Windows.
  - Exportar backup / Importar backup (seção 8).
  - Versão do app.

---

## 8. Dados

- **Local:** banco SQLite em `%APPDATA%\brainote\brainote.db`, com migrações versionadas.
- **IDs:** UUID em texto. Datas em ISO 8601 com fuso local.

| Tabela | Campos principais |
|---|---|
| `folders` | `id`, `name`, `sort_order`, `created_at` |
| `notes` | `id`, `folder_id` (nulo = sem pasta), `title`, `content_json`, `plain_text`, `pinned`, `created_at`, `updated_at`, `deleted_at` |
| `notes_fts` | tabela FTS5 sobre `title` + `plain_text` |
| `reminders` | `id`, `note_id` (opcional), `title`, `due_at`, `repeat` (`none`/`daily`/`weekly`/`monthly`), `done`, `done_at`, `snoozed_until`, `notified_at` |
| `events` | `id`, `title`, `starts_at`, `ends_at` (opcional), `all_day`, `note_id` (opcional) |
| `widgets` | `id`, `kind` (`postit`/`checklist`/`agenda`), `note_id`, `color`, `x`, `y`, `width`, `height`, `on_top` |
| `settings` | `key`, `value` (tema, vidro, iniciar com Windows, estado da janela) |

- **Backup:** exporta tudo para um único `.json` (escolha do local pelo diálogo de salvar). A importação faz uma cópia do banco atual antes de substituir. Desde a versão 1.2 é um `.zip` com o `.json` e a pasta de anexos (seção 13).
- **Primeira abertura:** cria as pastas **Pessoal** e **Trabalho**, e uma nota de boas-vindas curta explicando checklists, lembretes e post-its.

---

## 9. Fases de construção

Uma fase por vez. Em cada uma: plano curto → construir → rodar → me passar a lista de testes → commit depois do meu ok.

### Fase 0 — Base do projeto
- Verificar ou instalar os pré-requisitos (com meu ok): Node LTS, Rust (rustup), Microsoft C++ Build Tools e WebView2 (normalmente já vem no Windows 11).
- Criar o projeto Tauri 2 + React + TypeScript + Vite nesta pasta, com `git init`.
- Aplicar o ícone (`npx tauri icon`), definir o nome `brainote` e o identificador.
- Montar a janela sem borda com a barra de título própria e os botões do Windows.
- Aplicar os tokens claro/escuro, a fonte Inter e o layout vazio de 3 colunas.
- **Gerar um instalador de teste** (`npm run tauri build`), de preferência NSIS com instalação **por usuário** (sem precisar de administrador). Eu instalo e confirmo se o notebook corporativo deixa rodar.
- **Pronto quando:** o app abre com as 3 colunas, alterna claro/escuro, arrasta pela barra, e o instalador roda no meu notebook.

### Fase 1 — Notas e pastas
- SQLite com migrações, comandos Tauri de CRUD, pastas e notas.
- Lista agrupada por data, fixar, buscar (FTS5), apagar com "Desfazer" e salvamento automático (por enquanto, com o corpo em texto simples).
- **Pronto quando:** consigo criar, editar, mover, fixar, buscar e apagar notas, e tudo continua lá depois de fechar e abrir o app.

### Fase 2 — Editor e checklist
- TipTap com o menu **Aa** e checklists (itens marcados ficam no lugar).
- Botão de checklist na barra.
- Contador da seção **Checklists**.
- **Pronto quando:** formato texto, crio e marco checklists com o teclado e o mouse, e a prévia na lista fica correta.

### Fase 3 — Aparência e efeito vidro
- Chave **Efeito vidro**: janela transparente com o **Acrylic** do Windows 11 (variante clara ou escura conforme o tema) mais os tokens translúcidos `.g-on`. O Mica foi testado e ficou fraco demais (decisão do usuário). No Windows 11 22H2 ou mais novo o Acrylic é o do próprio sistema e não trava ao arrastar; no Windows 10 ele pode ficar lento.
- Ligar e desligar o efeito em tempo de execução, sem reiniciar.
- O vidro continua ativo quando a janela perde o foco (o Windows o deixaria opaco ao clicar em outra janela ou na área de trabalho); vale para a janela principal e os widgets.
- Desligado: cores opacas.
- Tema e vidro salvos nas configurações.
- **Pronto quando:** alterno claro/escuro e vidro, os dois combinam e a escolha continua ao reabrir.

### Fase 4 — Lembretes, notificações e bandeja
- Tabela e tela de Lembretes, sino e chip no editor, agendador no Rust e notificação do Windows.
- Bandeja com menu, fechar = esconder, instância única e iniciar com o Windows.
- Configurações (as opções desta fase).
- **Pronto quando:** um lembrete para daqui a 2 minutos dispara com a janela fechada na bandeja; clicar na notificação abre o lembrete; depois de reiniciar o PC, o app abre sozinho na bandeja.

### Fase 5 — Widgets na área de trabalho
- Janelas de widget: post-it, checklist e agenda de hoje.
- Menu "Adicionar widget" e "Fixar na área de trabalho".
- Posição e tamanho salvos, sincronização pelo evento `data-changed`, opção "Manter por cima".
- Testar o Win+D.
- **Pronto quando:** os 3 tipos funcionam, marcar um item no widget atualiza a nota (e o contrário), e os widgets voltam ao mesmo lugar ao reiniciar.

### Fase 6 — Agenda
- Calendário mensal com navegação, eventos (criar, editar, apagar) e lembretes no painel do dia.
- Contador na barra lateral e widget de agenda usando os eventos reais.
- **Pronto quando:** crio eventos, eles aparecem no dia certo, no widget e no contador.

### Fase 7 — Acabamento
- Exportar e importar backup.
- Primeira abertura (pastas padrão e nota de boas-vindas).
- Revisão de contraste e foco pelo teclado.
- Instalador final.
- Passar comigo a lista de testes de todas as fases.
- **Pronto quando:** instalo a versão final do zero e tudo da lista funciona.

---

## 10. Notebook corporativo e distribuição

- O executável não terá assinatura digital. Na primeira execução, o **SmartScreen** pode avisar ("Mais informações → Executar assim mesmo").
- Se alguma política (AppLocker, antivírus/EDR) bloquear, preciso saber cedo: por isso o instalador de teste fica na **Fase 0**.
- Prefira instalação **por usuário** (sem administrador) e dados em `%APPDATA%`.
- Nada de chamadas de rede na v1, exceto as que o próprio sistema fizer para as notificações.

---

## 11. Fora do escopo da v1 (ideias para depois)

- Imagens e anexos dentro das notas, tabelas e nota com senha: **planejado para a versão 1.2** (seção 13).
- Agenda externa: **planejada para a versão 1.4** pelo link ICS ("Publicar calendário" do Outlook, ou o link iCal do Google), só leitura. A integração completa pelo Microsoft Graph exige registrar um app no Entra ID; na conta corporativa, o TI precisa liberar.
- Atalho global de teclado para nota rápida.
- Variante escura do ícone no Windows.
- **Fora do projeto (decisão do usuário):** sincronização entre computadores ou com o celular.

---

## 12. Sobre o arquivo do protótipo

`referencia/prototipo.dc.html` usa um formato de protótipo com:

- **Marcação HTML** dentro de `<x-dc>`, com marcadores como `{{ nome }}`, `<sc-if>` e `<sc-for>`.
- **Um `<style>`** com os tokens.
- **Uma classe JavaScript** (`class Component extends DCLogic`) com os dados de exemplo e os comportamentos.

Use para entender a **estrutura das telas, as classes CSS, as medidas e os comportamentos**. Os conteúdos (notas, tarefas, eventos) são **exemplos** e não devem ir para o app. Referências de imagem `/_blob/...` não funcionam fora do protótipo: o ícone oficial está em `assets/icone/`.

---

## 13. Versões seguintes

### Versão 1.1 — melhorias do dia a dia (em dois lotes)

**Lote A — visual e lembretes**
- **Post-it:** usa as cores claras (`.t-light`) nos dois temas; os outros widgets seguem o tema.
- **Barra de rolagem** integrada: fina, arredondada, nas cores do tema e translúcida com o efeito vidro.
- **Listas suspensas** próprias (no lugar das listas nativas do Windows): cantos arredondados, cores do tema, vidro e uso pelo teclado.
- **Seletor de data:** calendário em popover (mês com setas, hoje destacado, dia escolhido em círculo).
- **Seletor de hora:** duas "rodas" (horas e minutos) no estilo do relógio do iPhone, com a faixa de seleção no meio; gira com a roda do mouse, com as setas do teclado ou clicando no número.
- Os dois seletores valem para **lembretes e eventos**.
- **Formulário de lembrete:** sem os atalhos de horário; já abre na data e hora.
- **Repetir:** resumo em texto ("Nunca", "Seg, Qua, Sex", "Todo dia 19", "Todo 19 de novembro"); bolinhas **D S T Q Q S S** para repetir semanalmente nos dias escolhidos (as 7 = todo dia); opções **Mensal** (todo dia X, pelo dia da data) e **Anual** (todo dia X do mês Y).
  - No banco, `reminders.repeat` passa a guardar `none`, `weekly:<dias>` (0 = domingo … 6 = sábado, ex. `weekly:1,3,5`), `monthly` ou `yearly`. Os lembretes antigos são convertidos: `daily` → `weekly:0,1,2,3,4,5,6`; `weekly` → o dia da semana do lembrete.
  - Mensal de dia 31 cai no último dia dos meses menores, sem "encolher" nos meses seguintes; anual de 29/02 cai em 28/02 nos anos não bissextos.

**Lote B — edição**
- **Exportar nota** em `.md` (padrão: mantém títulos, listas, checklists e negrito) ou `.txt`, por um ícone discreto na barra do editor ("Salvar como"). As notas já ficam salvas no banco; isto é uma cópia fora do app.
- **Arrastar notas** da lista e soltar numa pasta da barra lateral (move a nota).
- **Marca-texto:** tons pastel de azul, amarelo, verde, vermelho e laranja (versões ajustadas no tema escuro). Selecionar o texto e escolher a cor, ou ligar o **modo caneta**: cada trecho arrastado fica marcado até desligar. Para tirar a cor, a **borracha** funciona do mesmo jeito: ligada, cada trecho arrastado perde a marca. Esc desliga a caneta e a borracha.
- **Corretor ortográfico** de português do Brasil e inglês, com sugestões no botão direito da palavra errada.
  - O corretor do próprio WebView2 só usa o idioma do Windows, então o brainote traz dicionários Hunspell (pt-BR e en-US, licenças em `src-tauri/dicionarios/`) dentro do app e confere as palavras no Rust (crate `spellbook`), sem internet. Uma palavra conta como certa se existir em qualquer um dos dois idiomas.
  - "Ignorar" vale até fechar o brainote (não há dicionário pessoal nesta versão).
- **Correção automática** (Configurações, começa desligada), como a do Teams: ao digitar espaço, pontuação ou Enter depois de uma palavra errada, ela é trocada se a troca for quase certa — a 1ª sugestão do português ou do inglês que só muda acentos ou uma letra (trocada, a mais, a menos ou duas vizinhas invertidas). Palavra com maiúscula (pode ser nome) só ganha acento; empate entre os idiomas, siglas, e-mails, links e números ficam como estão. Ctrl+Z desfaz só a troca.

### Versão 1.2 — conteúdo rico (em dois lotes)

**Lote A — imagens, anexos e backup**
- **Imagens** (PNG, JPG, GIF, WebP, BMP): pelo botão de clipe na barra do editor ("Inserir imagem ou arquivo"), arrastando do Explorador ou **colando** (Ctrl+V, inclusive print de tela, que ganha o nome "imagem <data e hora>.png"). Ocupam no máximo a largura do texto; arrastar o canto de baixo muda o tamanho sem distorcer; clicar seleciona e Delete apaga.
- **Anexos** de qualquer outro tipo: cartão com ícone, nome e tamanho; clicar abre no programa padrão do Windows; botão direito: Abrir, Salvar como…, Remover. O brainote abre a cópia guardada por ele (o que for editado fica nessa cópia). Limite de **100 MB por arquivo**. O nome do anexo entra na busca e na prévia.
- Os arquivos ficam em `%APPDATA%\brainote\anexos\<id>\<nome original>`; a nota guarda só o id (`anexo:<id>` nas imagens). As telas leem as imagens pelo endereço interno `http://anexo.localhost/<id>`. Colar um trecho de site não traz imagens da internet.
- **Post-it** mostra as imagens da nota (reduzidas para caber) e os anexos como "📎 nome".
- **Exportar** `.md`/`.txt` cria, ao lado do arquivo, a pasta "<nome> - anexos" com as imagens e anexos; o Markdown mostra as imagens e liga os anexos; o `.txt` escreve onde cada um está.
- **Backup** passa a ser `.zip` (`brainote.json` + `anexos/`). Importar aceita o `.zip` e os `.json` antigos; os anexos atuais ficam guardados em `anexos-antes-da-importacao-<data>`, como a cópia do banco.
- **Limpeza:** ao abrir o app, apaga as pastas de anexos com mais de um dia que nenhuma nota usa (as notas da lixeira contam como uso; a lixeira se esvazia sozinha depois de 30 dias).

**Lote B — tabelas e notas com senha**
- **Tabelas** no editor: botão "Inserir tabela" na barra (3×3 com cabeçalho); Tab anda entre células (na última, cria linha); botão direito numa célula adiciona linha acima/abaixo e coluna à esquerda/direita, remove linha ou coluna e apaga a tabela; arrastar a borda muda a largura. Exportadas como tabela Markdown no `.md` e com colunas separadas por " | " no `.txt`; no post-it, cada linha da tabela vira uma linha.
- **Notas com senha:** uma senha só para todas as notas trancadas (como no Notas do Mac), definida na primeira vez. Conteúdo criptografado, sem recuperação se a senha for esquecida. Título visível; o conteúdo fica fora da busca, da prévia e dos widgets. Tranca de novo ao fechar a janela do brainote ou pelo botão "Trancar agora". Trocar a senha nas Configurações. **Nota trancada não aceita imagem nem anexo**, e nota com imagem ou anexo não pode ser trancada.
  - Trancar pelo cadeado da barra do editor ou por "Trancar nota" no menu da nota; "Remover cadeado" devolve a nota ao normal. Na primeira vez o app pede a senha duas vezes e uma **dica opcional**, mostrada quando a senha é digitada errada.
  - Nota trancada com as notas fechadas mostra só o título e o campo da senha; depois da senha, todas as notas trancadas ficam abertas até trancar de novo (ao fechar a janela, pelo cadeado "Trancar agora" ou ao abrir o app).
  - Ao trancar, os widgets da nota saem da área de trabalho; nota trancada não pode virar widget.
  - Criptografia no Rust (`src-tauri/src/vault.rs`): chave tirada da senha com Argon2id (64 MB, 3 passadas, sal aleatório) e conteúdo com XChaCha20-Poly1305. A senha não é guardada; a chave fica só na memória. O backup leva as notas trancadas criptografadas, com o sal e a conferência da senha (a mesma senha abre depois de importar). O banco zera o texto apagado (`secure_delete`, inclusive no índice da busca); backups feitos antes de trancar ainda têm o texto aberto.

### Versão 1.3 — ajustes do dia a dia (em dois lotes)

**Lote A — vidro, janelas e widgets**
- **Vidro:** passa a ser o mesmo efeito do TranslucentRM dos widgets do Rainmeter do usuário: o acrílico clássico do Windows (`SetWindowCompositionAttribute`, em `src-tauri/src/desktop.rs`), que não fica opaco quando a janela perde o foco. A cor por cima vem do CSS.
  - Janela principal: a barra lateral é sempre a coluna mais transparente (camada de 40%, letras mais fortes com um contorno suave para ler sobre qualquer coisa atrás da janela); a lista de notas mantém o vidro da versão 1.2; o editor fica com cor sólida.
  - Widgets: só o checklist tem vidro; post-it e agenda ficam sempre com cor sólida.
  - Sai o truque que fazia o Windows achar que todas as janelas do brainote estavam ativas (`WM_NCACTIVATE`). Com isso os widgets têm a sombra menor de janela em segundo plano, e o **Win+V** (histórico da área de transferência) volta a abrir dentro do app.
- **Menu do widget:** o botão direito abre o mesmo menu do app (Abrir no brainote, Trocar nota…, Manter por cima, Remover), dentro do widget e pelo teclado.
- **Trocar nota:** "Trocar nota…" no post-it ou no checklist abre o brainote com a lista de notas para escolher (no checklist, só as notas com checklist; nota trancada não entra).
- **Win+D:** enquanto a área de trabalho está selecionada, o app confere a cada 0,15 s se ela cobriu os widgets. Antes, o Win+D apertado com a área de trabalho já selecionada (ex.: depois de um clique nela), ou com o Explorer demorando mais de 1 s, deixava os widgets escondidos.

**Lote B — texto**
- **Cursor de texto** ("I") no corpo, no título e nos campos de texto. No modo caneta e na borracha, o mesmo cursor de texto com uma bolinha da cor da ferramenta ao lado, para ver exatamente onde a marca começa.
- **Corretor:** o português passa a usar o corretor do próprio Windows (`src-tauri/src/winspell.rs`, o mesmo do Edge e do Teams), que acerta acentos ("voce" → "você", "sabado" → "sábado"), troca expressões ("concerteza" → "com certeza") e sugere melhor ("mecher" → "mexer"). Sem esse corretor no Windows, volta o dicionário embutido. O inglês continua com o dicionário embutido (o Windows em português não traz o de inglês). Uma palavra certa em qualquer um dos dois idiomas não fica sublinhada.
  - **Idioma por nota:** botão **PT/EN** na barra do editor (padrão PT, guardado em `notes.spell_lang`). Ele decide de onde vêm primeiro as sugestões (até 4 do idioma da nota, depois as do outro) e a correção automática; em nota em português vale primeiro a troca que o Windows faz sozinho.
  - **Título** também é corrigido: sublinhado, sugestões no botão direito e correção automática (no título, Ctrl+Z não desfaz a troca).
  - **Correção automática** passa a vir ligada (quem já tinha escolhido nas Configurações continua com a escolha).
  - Limite: palavras que existem mas estão erradas no contexto ("esta/está", "e/é") não são pegas; isso exigiria revisão gramatical, que o corretor do Windows não faz.

### Versão 1.4 — agenda externa
- Ler um calendário pelo link ICS e mostrar os compromissos na Agenda (só leitura).
