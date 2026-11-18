// Editor da nota (docs/ESPECIFICACAO.md, 4.4). Corpo em texto simples até a Fase 2 (TipTap).
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, type Note } from "./api";
import { editorDate } from "./dates";

type Props = { note: Note; autoFocus: boolean; onSaved: () => void };

/** Montado com `key={note.id}`: cada nota tem o seu próprio editor. */
export function Editor({ note, autoFocus, onSaved }: Props) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.plain_text);
  const pending = useRef<{ title: string; body: string } | null>(null);
  const timer = useRef(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Não usa o atributo autoFocus: a nota nova pode já estar aberta quando o pedido de foco chega.
  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus]);

  const flush = async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    try {
      await api.updateNote(note.id, p.title, p.body);
    } catch {
      pending.current ??= p; // não perde o texto: tenta de novo na próxima edição ou ao fechar
      return;
    }
    onSaved();
  };

  const edit = (t: string, b: string) => {
    setTitle(t);
    setBody(b);
    pending.current = { title: t, body: b };
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 500);
  };

  // Salva o que faltar ao trocar de nota (desmontar) ou ao fechar a janela.
  useEffect(() => {
    const off = getCurrentWindow().onCloseRequested(flush);
    return () => {
      off.then((f) => f());
      flush();
    };
  }, []);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <p className="t2" style={{ margin: "0 0 18px", fontSize: 12, textAlign: "center" }}>{editorDate(new Date(note.updated_at))}</p>
      <label className="sr-only" htmlFor="titulo">Título da nota</label>
      <input
        id="titulo"
        ref={titleRef}
        className="title-in"
        placeholder="Título"
        value={title}
        onChange={(e) => edit(e.target.value, body)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            bodyRef.current?.focus();
          }
        }}
      />
      <label className="sr-only" htmlFor="corpo">Texto da nota</label>
      <textarea id="corpo" ref={bodyRef} className="body-in" value={body} onChange={(e) => edit(title, e.target.value)} />
    </div>
  );
}
