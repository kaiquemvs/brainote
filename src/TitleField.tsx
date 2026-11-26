// Título da nota com o corretor (docs/ESPECIFICACAO.md, 13 — versão 1.3). O campo de texto não aceita
// sublinhado em palavras soltas, então uma cópia invisível do título fica atrás dele, no mesmo lugar, e só
// o sublinhado das palavras erradas aparece. Botão direito e correção automática funcionam como no texto.
import { useEffect, useState, type ChangeEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { api, type SpellLang } from "./api";
import type { MenuState } from "./Menu";
import { autocorrectOn, BOUNDARY, ignoreWord, isWrong, lookup, wordBefore, wordsIn } from "./spellcheck";

type Props = {
  value: string;
  onChange: (title: string) => void;
  onEnter: () => void;
  lang: SpellLang;
  openMenu: (m: MenuState) => void;
  inputRef: RefObject<HTMLInputElement | null>;
};

export function TitleField({ value, onChange, onEnter, lang, openMenu, inputRef }: Props) {
  const [, redraw] = useState(0);
  const [scroll, setScroll] = useState(0); // título comprido rola dentro do campo: a cópia rola junto
  const sync = () => setScroll(inputRef.current?.scrollLeft ?? 0);

  // confere as palavras meio segundo depois de parar de digitar
  useEffect(() => {
    const t = setTimeout(() => lookup(wordsIn(value).map((w) => w.word), api.spellCheck).then(() => redraw((x) => x + 1)), 500);
    return () => clearTimeout(t);
  }, [value]);

  const words = wordsIn(value).filter((w) => isWrong(w.word));
  const mirror: ReactNode[] = [];
  let last = 0;
  for (const { word, at } of words) {
    mirror.push(value.slice(last, at), <span key={at} className="spell-err" data-at={at}>{word}</span>);
    last = at + word.length;
  }
  mirror.push(value.slice(last));

  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const caret = el.selectionStart ?? el.value.length;
    const typed = el.value[caret - 1];
    onChange(el.value);
    if (!autocorrectOn() || el.value.length <= value.length || !typed || !BOUNDARY.test(typed)) return;
    // acabou de digitar espaço ou pontuação: a palavra antes dele é trocada se a troca for quase certa
    const end = caret - 1;
    const word = wordBefore(el.value.slice(0, end));
    if (!word) return;
    const from = end - word.length;
    api.spellAutocorrect(word, lang).then((fix) => {
      const cur = inputRef.current;
      if (!fix || !cur || cur.value.slice(from, end) !== word) return; // o título mudou enquanto o Rust respondia
      const pos = (cur.selectionStart ?? end + 1) + fix.length - word.length;
      onChange(cur.value.slice(0, from) + fix + cur.value.slice(end));
      ignoreWord(fix);
      requestAnimationFrame(() => cur.setSelectionRange(pos, pos));
    });
  };

  // botão direito numa palavra sublinhada: sugestões no menu do app; fora delas, o menu do Windows
  const menu = (e: MouseEvent) => {
    const hit = [...document.querySelectorAll<HTMLElement>(".title-mirror .spell-err")].find((s) => {
      const r = s.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (!hit) return;
    e.preventDefault();
    const at = Number(hit.dataset.at);
    const word = hit.textContent ?? "";
    const { clientX: x, clientY: y } = e;
    api.spellSuggest(word, lang).then((list) => {
      const items = list.length
        ? list.map((w) => ({ label: w, onSelect: () => onChange(value.slice(0, at) + w + value.slice(at + word.length)) }))
        : [{ label: "Sem sugestões", onSelect: () => {} }];
      openMenu({ x, y, items: [...items, { label: "Ignorar", onSelect: () => { ignoreWord(word); redraw((n) => n + 1); } }] });
    });
  };

  return (
    <div className="title-wrap">
      <div className="title-mirror" aria-hidden="true">
        <div style={{ transform: `translateX(${-scroll}px)` }}>{mirror}</div>
      </div>
      <label className="sr-only" htmlFor="titulo">Título da nota</label>
      <input
        id="titulo"
        ref={inputRef}
        className="title-in"
        spellCheck={false}
        placeholder="Título"
        value={value}
        onChange={change}
        onScroll={sync}
        onSelect={sync}
        onContextMenu={menu}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
      />
    </div>
  );
}
