// Checklist do editor (docs/ESPECIFICACAO.md, 4.4). Itens marcados ficam onde estão.
import { TaskItem } from "@tiptap/extension-list";

/** Item de checklist com rótulo em português e Ctrl+Enter para marcar/desmarcar pelo teclado. */
export const ChecklistItem = TaskItem.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-Enter": () =>
        this.editor.commands.command(({ tr, state }) => {
          const { $from } = state.selection;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type.name === this.name) {
              tr.setNodeMarkup($from.before(d), undefined, { ...node.attrs, checked: !node.attrs.checked });
              return true;
            }
          }
          return false;
        }),
    };
  },
}).configure({
  a11y: { checkboxLabel: (node, checked) => `${checked ? "Desmarcar" : "Concluir"}: ${node.textContent || "item vazio"}` },
});
