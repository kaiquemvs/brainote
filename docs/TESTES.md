# brainote — lista de testes

Use esta lista a cada versão nova. Marque com `x` o que passou. Teste no **app instalado**
(Menu Iniciar → brainote), salvo onde estiver escrito outra coisa.

## Antes de começar

- [ ] Se for atualizar: clique com o botão direito no ícone da bandeja → **Sair**, espere uns 10 segundos e rode o instalador.
- [ ] O instalador não pede senha de administrador e abre o brainote no fim (ou abra pelo Menu Iniciar).

## Primeira abertura (só num computador novo ou com a pasta de dados vazia)

- [ ] Aparecem as pastas **Pessoal** e **Trabalho**.
- [ ] Aparece a nota **Bem-vindo ao brainote**, com um checklist de exemplo.

## Janela e aparência (Fases 0 e 3)

- [ ] A janela abre com 3 colunas: barra lateral, lista e editor.
- [ ] Arrasta pela barra de cima; duplo clique nela maximiza e restaura.
- [ ] Minimizar, maximizar/restaurar e fechar funcionam; o fechar fica vermelho ao passar o mouse.
- [ ] O botão de painel esconde e mostra a barra lateral.
- [ ] Não diminui abaixo de 900×600.
- [ ] **Claro/Escuro** e **Efeito vidro** mudam na hora; as 4 combinações ficam legíveis.
- [ ] Com o vidro ligado, o que está atrás da janela aparece desfocado.
- [ ] Fechar e abrir de novo mantém tema, vidro, posição e tamanho.

## Notas e pastas (Fase 1)

- [ ] **Nova pasta** cria e já deixa o nome editável; botão direito → Renomear e Apagar (as notas vão para "Todas as notas").
- [ ] **Nova nota** põe o cursor no título; Enter vai para o texto.
- [ ] A lista agrupa em Fixadas, Hoje, Ontem, Últimos 7 dias, Últimos 30 dias e meses.
- [ ] Cada linha mostra título, hora/"Ontem"/data, prévia e a pasta (em "Todas as notas").
- [ ] Botão direito na nota: Fixar/Desafixar, Mover para pasta…, Fixar na área de trabalho, Apagar.
- [ ] Apagar mostra "Nota apagada · Desfazer" por 6 segundos, e Desfazer traz a nota de volta.
- [ ] A busca acha sem acento e por pedaço de palavra ("reuniao", "orcam"); Esc limpa.
- [ ] O texto salva sozinho; fechar e abrir o app mantém tudo.

## Editor e checklist (Fase 2)

- [ ] Menu **Aa**: Título, Subtítulo, Corpo, N/I/S/R, lista com marcadores e numerada; Esc fecha.
- [ ] Ctrl+B, Ctrl+I, Ctrl+U e Ctrl+Z funcionam.
- [ ] Botão de checklist liga e desliga; Enter cria item; Enter em item vazio sai do checklist.
- [ ] Clicar na bolinha ou **Ctrl+Enter** marca; o item fica amarelo e **não muda de lugar**.
- [ ] O atalho **Checklists** mostra só as notas com checklist, com contador certo.

## Lembretes, notificações e bandeja (Fase 4)

- [ ] Sino no editor cria o lembrete; o chip "Lembrete · …" aparece; clicar edita; × remove.
- [ ] Tela de Lembretes: Atrasados, Hoje, Programados e Concluídos (recolhido); bolinha conclui.
- [ ] Formulário: Hoje 18:00, Amanhã 09:00, Próxima segunda 09:00, Personalizado, nota vinculada e repetição.
- [ ] Lembrete para daqui a 2 minutos dispara com a janela **fechada** (app na bandeja).
- [ ] A notificação mostra "brainote", o título e "Lembrete · Hoje, HH:MM · nota".
- [ ] Clicar na notificação abre o app em Lembretes com o item destacado.
- [ ] Botões **Concluir** e **Adiar 10 min** da notificação funcionam.
- [ ] Concluir um lembrete repetido cria o próximo.
- [ ] Bandeja: clique abre a janela; menu com Abrir brainote, Nova nota, Widgets ▸ e Sair.
- [ ] Fechar a janela no X deixa o app na bandeja; só o **Sair** fecha de vez.
- [ ] Abrir o brainote de novo pelo Menu Iniciar só traz a janela para a frente.
- [ ] Configurações: "Iniciar com o Windows" ligado; depois de reiniciar o PC, o app abre só na bandeja.

## Widgets (Fase 5)

- [ ] **Adicionar widget**: post-it (escolhe a nota), checklist (escolhe a nota) e agenda de hoje.
- [ ] Arrasta pelo topo, redimensiona pelas bordas; volta ao mesmo lugar ao reiniciar.
- [ ] Post-it: 4 cores, duplo clique abre a nota.
- [ ] Marcar item no widget marca na nota (mesmo aberta no editor), e o contrário.
- [ ] Botão direito: Abrir no brainote, Manter por cima, Remover; × remove.
- [ ] Botão de post-it no editor fixa e remove; bandeja → Widgets ▸ lista e remove.
- [ ] **Win+D**: os widgets continuam visíveis; ao abrir outra janela, voltam para o fundo.
- [ ] Os widgets seguem tema e vidro.

## Agenda (Fase 6)

- [ ] Hoje com círculo amarelo, dia selecionado em destaque, ponto nos dias com compromisso.
- [ ] Setas mudam o mês; **Hoje** volta; clicar num dia de outro mês vai para aquele mês.
- [ ] **+ Novo evento** com hora de início/fim ou dia inteiro e nota vinculada; aparece no dia certo.
- [ ] Clicar no evento edita e permite apagar; clicar num lembrete abre Lembretes destacado.
- [ ] O contador da Agenda e o widget Agenda de hoje mostram os eventos de hoje.

## Backup (Fase 7)

- [ ] Configurações → **Exportar backup** salva um `.json` onde você escolher.
- [ ] **Importar backup** avisa antes, troca os dados e deixa uma cópia `brainote-antes-da-importacao-….db` em `%APPDATA%\brainote`.
- [ ] Depois de importar: notas, pastas, lembretes, eventos, widgets e tema voltam como estavam.
- [ ] Importar um arquivo que não é backup do brainote mostra erro e não muda nada.

## Versão 1.1 — Lote A (visual e lembretes)

- [ ] No tema **escuro**, o post-it continua amarelo claro com texto escuro; os outros widgets ficam escuros.
- [ ] A barra de rolagem é fina, arredondada e nas cores do tema (veja numa nota longa e na lista).
- [ ] As listas suspensas (nota vinculada, Configurações) abrem no visual do app e funcionam com setas + Enter.
- [ ] Lembrete e evento: a data abre um calendário; a hora gira com a roda do mouse (um número por clique da roda).
- [ ] Repetir: bolinhas **D S T Q Q S S**, **Mensal** e **Anual**; o resumo em texto muda conforme a escolha.
- [ ] Um lembrete que repete em dias escolhidos reaparece no próximo dia marcado depois de concluído.

## Versão 1.1 — Lote B (edição)

- [ ] **Exportar** (ícone de seta para baixo na barra do editor): salva `.md` por padrão; trocando o tipo para Texto salva `.txt` sem símbolos de formatação.
- [ ] Arrastar uma nota da lista e soltar numa pasta: a pasta acende durante o arrasto e a nota passa para ela.
- [ ] **Marca-texto**: selecionar um trecho e clicar numa das 5 cores marca o trecho; clicar em outra cor troca.
- [ ] **Modo caneta**: ligar no painel do marca-texto; o cursor vira uma caneta e cada trecho arrastado fica marcado; Esc desliga.
- [ ] **Borracha**: ligar no painel do marca-texto; cada trecho arrastado perde a cor; Esc desliga. As marcas continuam lá depois de trocar de nota e reabrir o app.
- [ ] As marcas ficam legíveis no tema claro e no escuro.
- [ ] **Corretor**: palavras erradas em português ou inglês ganham sublinhado vermelho ondulado; palavras certas nos dois idiomas não.
- [ ] Botão direito numa palavra sublinhada mostra sugestões e **Ignorar**; escolher uma sugestão troca a palavra.
- [ ] Configurações → **Correção automática** ligada: digitar "voce nao recieve excecao " vira "você não receive exceção "; Ctrl+Z logo depois desfaz só a última troca. Desligada, nada é trocado.
- [ ] Com **Efeito vidro** ligado, trocar entre Claro e Escuro várias vezes: o vidro continua translúcido, sem precisar desligar e ligar.

## Teclado e leitura

- [ ] Só com **Tab** dá para chegar em todos os botões, e o botão em foco mostra um contorno.
- [ ] Nas janelas (lembrete, evento, Configurações) o Tab não sai delas; Esc fecha.
