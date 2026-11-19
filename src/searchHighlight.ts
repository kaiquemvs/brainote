// Busca: destaca na nota aberta o que foi digitado no campo "Buscar". Segue a mesma regra da busca no
// SQLite (src-tauri/src/store.rs, search_notes): cada palavra vale como começo de palavra, sem ligar para
// maiúsculas nem acentos ("orcam" acha "Orçamento").
import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

// letra por letra (minúscula e sem acento), para as posições continuarem batendo com o texto original
const foldChar = (c: string) => {
  const f = c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return f.length === 1 ? f : c;
};
const fold = (s: string) => s.split("").map(foldChar).join("");
const WORD = /[\p{L}\p{N}]+/gu; // o que o SQLite (unicode61) considera palavra

/** Palavras da busca, mais longas primeiro ("casa" vence "cas" quando as duas servem). */
export const searchTerms = (query: string) =>
  (fold(query).match(WORD) ?? []).sort((a, b) => b.length - a.length);

/** Trechos [início, fim] de `text` a destacar. */
export function searchHits(text: string, terms: string[]): [number, number][] {
  const out: [number, number][] = [];
  for (const m of fold(text).matchAll(WORD)) {
    const term = terms.find((t) => m[0].startsWith(t));
    if (term) out.push([m.index, m.index + term.length]);
  }
  return out;
}

function decorate(doc: PMNode, terms: string[]) {
  const decos: Decoration[] = [];
  if (terms.length)
    doc.descendants((block, pos) => {
      if (!block.isTextblock) return true;
      // um caractere por item sem texto (quebra de linha), para a posição no texto ser a posição no bloco
      const text = block.textBetween(0, block.content.size, undefined, "￼");
      for (const [from, to] of searchHits(text, terms)) decos.push(Decoration.inline(pos + 1 + from, pos + 1 + to, { class: "search-hit" }));
      return false;
    });
  return DecorationSet.create(doc, decos);
}

type State = { terms: string[]; set: DecorationSet };
const key = new PluginKey<State>("search");

export const SearchHighlight = Extension.create({
  name: "searchHighlight",
  addProseMirrorPlugins: () => [
    new Plugin<State>({
      key,
      state: {
        init: () => ({ terms: [], set: DecorationSet.empty }),
        apply: (tr, prev) => {
          const terms: string[] = tr.getMeta(key) ?? prev.terms;
          return terms !== prev.terms || tr.docChanged ? { terms, set: decorate(tr.doc, terms) } : prev;
        },
      },
      props: { decorations: (state) => key.getState(state)?.set },
    }),
  ],
});

/** Troca o que está destacado (texto do campo "Buscar"; vazio tira o destaque) e mostra o primeiro trecho. */
export function setSearch(view: EditorView, query: string) {
  view.dispatch(view.state.tr.setMeta(key, searchTerms(query)));
  view.dom.querySelector(".search-hit")?.scrollIntoView({ block: "center" });
}
