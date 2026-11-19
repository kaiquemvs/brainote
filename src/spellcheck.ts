// Corretor ortográfico no editor (docs/ESPECIFICACAO.md, 13 — versão 1.1): sublinha as palavras que não
// existem em português nem em inglês (dicionários no Rust, src-tauri/src/spell.rs) e, no botão direito,
// mostra as sugestões no menu do app. Com a correção automática ligada (Configurações), troca a palavra
// errada assim que você digita espaço, pontuação ou Enter depois dela, se a troca for quase certa.
import { Extension } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

const WORD = /\p{L}+(?:['’-]\p{L}+)*/gu;
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+|\S+@\S+\.\S+/g;

/** Palavras a conferir e onde começam: sem links, e-mails, siglas (TI, OSPF) e letras soltas. */
export function wordsIn(text: string): { word: string; at: number }[] {
  const masked = text.replace(LINK, (m) => " ".repeat(m.length)); // mesmo tamanho: as posições não mudam
  const out: { word: string; at: number }[] = [];
  for (const m of masked.matchAll(WORD)) {
    const w = m[0];
    if (w.length > 1 && w !== w.toUpperCase()) out.push({ word: w, at: m.index });
  }
  return out;
}

export type SpellMenu = { x: number; y: number; word: string; replace: (w: string) => void; ignore: () => void };

type Options = {
  check: (words: string[]) => Promise<boolean[]>;
  /** correção quase certa para a palavra, ou null (regra em src-tauri/src/spell.rs) */
  fix: (word: string) => Promise<string | null>;
  onMenu: (m: SpellMenu) => void;
};

const key = new PluginKey<DecorationSet>("spellcheck");
// palavra → existe? Vale para todas as notas enquanto a janela está aberta (inclui as "ignoradas").
const known = new Map<string, boolean>();

let autoOn = false;
/** Liga ou desliga a correção automática (vem das Configurações). */
export const setAutocorrect = (on: boolean) => {
  autoOn = on;
};
// o que encerra uma palavra ao digitar (hífen e apóstrofo ficam de fora: fazem parte de "guarda-chuva", "d'água")
const BOUNDARY = /^[\s.,;:!?)\]}"”]$/;

export const Spellcheck = Extension.create<Options>({
  name: "spellcheck",
  addOptions: () => ({ check: async (w) => w.map(() => true), fix: async () => null, onMenu: () => {} }),

  addProseMirrorPlugins() {
    const { check, fix, onMenu } = this.options;
    let timer = 0;

    // A palavra que termina em `at` (onde o espaço/pontuação/Enter vai entrar) é corrigida se estiver errada.
    // Ctrl+Z desfaz só a troca.
    const autocorrect = (view: EditorView, at: number) => {
      if (!autoOn) return;
      const $at = view.state.doc.resolve(at);
      const token = $at.parent.textBetween(0, $at.parentOffset, undefined, " ").split(/\s/).pop() ?? "";
      if (/[@/\\:\d]/.test(token)) return; // e-mail, caminho, hora, código: não mexe
      const last = wordsIn(token).pop(); // links e e-mails já saem aqui
      if (!last || last.at + last.word.length !== token.length || known.get(last.word)) return;
      const { word } = last;
      const from = at - word.length;
      fix(word).then((right) => {
        // só troca se a palavra continua lá (o texto pode ter mudado enquanto o Rust respondia)
        if (!right || view.isDestroyed || view.state.doc.textBetween(from, at) !== word) return;
        known.set(right, true);
        view.dispatch(closeHistory(view.state.tr).insertText(right, from, at));
      });
    };

    const ranges = (view: EditorView) => {
      const out: { word: string; from: number; to: number }[] = [];
      view.state.doc.descendants((node, pos) => {
        if (node.isText) for (const { word, at } of wordsIn(node.text!)) out.push({ word, from: pos + at, to: pos + at + word.length });
      });
      return out;
    };

    const run = async (view: EditorView) => {
      const unknown = [...new Set(ranges(view).map((r) => r.word))].filter((w) => !known.has(w));
      if (unknown.length) (await check(unknown)).forEach((ok, i) => known.set(unknown[i], ok));
      if (view.isDestroyed) return;
      const decos = ranges(view) // de novo: o texto pode ter mudado enquanto o Rust respondia
        .filter((r) => known.get(r.word) === false)
        .map((r) => Decoration.inline(r.from, r.to, { class: "spell-err" }, { word: r.word }));
      view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(view.state.doc, decos)));
    };
    const schedule = (view: EditorView) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => run(view), 500);
    };

    return [
      new Plugin({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => tr.getMeta(key) ?? set.map(tr.mapping, tr.doc),
        },
        view: (view) => {
          schedule(view);
          return {
            update: (v, prev) => {
              if (!prev.doc.eq(v.state.doc)) schedule(v);
            },
            destroy: () => clearTimeout(timer),
          };
        },
        props: {
          decorations: (state) => key.getState(state),
          handleTextInput: (view, from, to, text) => {
            if (from === to && BOUNDARY.test(text)) autocorrect(view, from);
            return false; // o caractere entra normalmente
          },
          handleKeyDown: (view, event) => {
            if (event.key === "Enter" && view.state.selection.empty) autocorrect(view, view.state.selection.from);
            return false;
          },
          handleDOMEvents: {
            // botão direito numa palavra sublinhada: sugestões no menu do app; fora delas, o menu do Windows
            contextmenu: (view, event) => {
              const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const hit = at && key.getState(view.state)?.find(at.pos, at.pos)[0];
              if (!hit) return false;
              event.preventDefault();
              const word = (hit.spec as { word: string }).word;
              onMenu({
                x: event.clientX,
                y: event.clientY,
                word,
                replace: (w) => view.dispatch(view.state.tr.insertText(w, hit.from, hit.to)),
                ignore: () => {
                  known.set(word, true);
                  run(view);
                },
              });
              return true;
            },
          },
        },
      }),
    ];
  },
});
