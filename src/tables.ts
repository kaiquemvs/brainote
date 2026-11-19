// Tabelas na nota (docs/ESPECIFICACAO.md, 13 — versão 1.2): 3×3 com cabeçalho, Tab anda entre as células,
// arrastar a borda muda a largura e o botão direito adiciona e remove linhas e colunas.
import { Extension, type ChainedCommands } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import type { MenuState } from "./Menu";

export const Tables = TableKit.configure({ table: { resizable: true } });

type Options = { openMenu: (m: MenuState) => void };

export const TableMenu = Extension.create<Options>({
  name: "tableMenu",
  addOptions: () => ({ openMenu: () => {} }),

  addProseMirrorPlugins() {
    const { editor } = this;
    const { openMenu } = this.options;
    const run = (cmd: (c: ChainedCommands) => ChainedCommands) => () => cmd(editor.chain().focus()).run();
    const items = [
      { label: "Adicionar linha acima", onSelect: run((c) => c.addRowBefore()) },
      { label: "Adicionar linha abaixo", onSelect: run((c) => c.addRowAfter()) },
      { label: "Adicionar coluna à esquerda", onSelect: run((c) => c.addColumnBefore()) },
      { label: "Adicionar coluna à direita", onSelect: run((c) => c.addColumnAfter()) },
      { label: "Remover linha", onSelect: run((c) => c.deleteRow()) },
      { label: "Remover coluna", onSelect: run((c) => c.deleteColumn()) },
      { label: "Apagar tabela", onSelect: run((c) => c.deleteTable()) },
    ];
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            contextmenu: (view, e) => {
              const el = e.target as HTMLElement;
              if (el.closest(".spell-err")) return false; // palavra errada: o menu é o do corretor
              const mouse = !!(e.clientX || e.clientY); // Shift+F10 e a tecla Menu não trazem posição
              if (mouse ? !el.closest("td, th") : !editor.isActive("table")) return false;
              // o menu vale para a célula clicada
              const at = mouse && view.posAtCoords({ left: e.clientX, top: e.clientY });
              if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
              e.preventDefault();
              const cursor = view.coordsAtPos(view.state.selection.from); // pelo teclado, abre embaixo do cursor
              openMenu({ x: mouse ? e.clientX : cursor.left, y: mouse ? e.clientY : cursor.bottom, items });
              return true;
            },
          },
        },
      }),
    ];
  },
});
