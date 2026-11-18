// Editor da nota (docs/ESPECIFICACAO.md, 4.4), com TipTap.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor as TipTap } from "@tiptap/react";
import type { ChainedCommands, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-list";
import { api, type Note, type Reminder } from "./api";
import { ChecklistItem } from "./checklist";
import { editorDate, reminderWhen } from "./dates";
import { Icon, paths } from "./icons";
import { WindowButtons } from "./WindowButtons";

const extensions = [
  // Só os formatos do menu Aa. Link desligado: clicar abriria o site dentro do app.
  StarterKit.configure({ heading: { levels: [2, 3] }, link: false, code: false, codeBlock: false, blockquote: false, horizontalRule: false }),
  TaskList,
  ChecklistItem,
];

/** Notas da Fase 1 só têm texto simples: cada linha vira um parágrafo. */
function initialContent(note: Note): JSONContent {
  if (note.content_json) return JSON.parse(note.content_json);
  const lines = note.plain_text ? note.plain_text.split("\n") : [""];
  return { type: "doc", content: lines.map((t) => ({ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] })) };
}

type Props = {
  note: Note;
  autoFocus: boolean;
  onSaved: () => void;
  /** próximo lembrete pendente da nota (chip e sino) */
  reminder: Reminder | null;
  onReminder: () => void;
  onRemoveReminder: (r: Reminder) => void;
};

/** Montado com `key={note.id}`: cada nota tem o seu próprio editor. */
export function Editor({ note, autoFocus, onSaved, reminder, onReminder, onRemoveReminder }: Props) {
  const [title, setTitle] = useState(note.title);
  const [aaOpen, setAaOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  // Última versão de tudo, em refs: o salvamento também roda depois que o editor já foi desmontado.
  const latest = useRef({ title: note.title, json: JSON.stringify(initialContent(note)), text: note.plain_text });
  const dirty = useRef(false);
  const timer = useRef(0);

  const flush = async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const { title, json, text } = latest.current;
    try {
      await api.updateNote(note.id, title, json, text);
    } catch {
      dirty.current = true; // não perde o texto: tenta de novo na próxima edição ou ao fechar
      return;
    }
    onSaved();
  };

  const schedule = () => {
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 500);
  };

  const editor = useEditor({
    extensions,
    content: initialContent(note),
    editorProps: { attributes: { "aria-label": "Texto da nota" } },
    onUpdate: ({ editor }) => {
      // listas geram separadores em dobro: uma linha por bloco basta para busca e prévia
      const text = editor.getText({ blockSeparator: "\n" }).replace(/\n+/g, "\n").trim();
      latest.current = { ...latest.current, json: JSON.stringify(editor.getJSON()), text };
      schedule();
    },
  });

  // Não usa o atributo autoFocus: a nota nova pode já estar aberta quando o pedido de foco chega.
  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus]);

  // Salva o que faltar ao trocar de nota (desmontar) ou quando a janela perde o foco
  // (fechar só esconde na bandeja; clicar no "Sair" da bandeja já tira o foco antes).
  useEffect(() => {
    addEventListener("blur", flush);
    return () => {
      removeEventListener("blur", flush);
      flush();
    };
  }, []);

  const taskOn = useEditorState({ editor, selector: ({ editor: e }) => e?.isActive("taskList") ?? false });

  return (
    <>
      <div className="bar" data-tauri-drag-region style={{ paddingLeft: 14, position: "relative" }}>
        <button
          className={`btn-ic${aaOpen ? " is-on" : ""}`}
          data-aa
          aria-label="Formatar texto"
          aria-expanded={aaOpen}
          onClick={() => setAaOpen(!aaOpen)}
        >
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em" }}>Aa</span>
        </button>
        <button
          className={`btn-ic${taskOn ? " is-on" : ""}`}
          aria-label="Checklist"
          aria-pressed={taskOn}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        >
          <Icon size={18}>{paths.checklist}</Icon>
        </button>
        <button className={`btn-ic${reminder ? " is-on" : ""}`} aria-label="Lembrete desta nota" aria-pressed={!!reminder} onClick={onReminder}>
          <Icon size={18}>{paths.bell}</Icon>
        </button>
        <span className="grow" data-tauri-drag-region />
        <WindowButtons />
        {aaOpen && editor && (
          <FormatPanel
            editor={editor}
            onClose={() => {
              setAaOpen(false);
              editor.commands.focus();
            }}
          />
        )}
      </div>

      <div className="pane-scroll" style={{ padding: "4px clamp(20px, 6%, 64px) 40px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <p className="t2" style={{ margin: "0 0 18px", fontSize: 12, textAlign: "center" }}>{editorDate(new Date(note.updated_at))}</p>
          {reminder && (
            <p style={{ margin: "0 0 16px" }}>
              <span className="chip">
                <button className="chip-b" onClick={onReminder}>
                  <Icon size={13}>{paths.bell}</Icon>
                  Lembrete · {reminderWhen(new Date(reminder.snoozed_until ?? reminder.due_at), new Date())}
                </button>
                <button className="chip-x" aria-label="Remover lembrete" onClick={() => onRemoveReminder(reminder)}>
                  <Icon size={12}>{paths.x}</Icon>
                </button>
              </span>
            </p>
          )}
          <label className="sr-only" htmlFor="titulo">Título da nota</label>
          <input
            id="titulo"
            ref={titleRef}
            className="title-in"
            placeholder="Título"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              latest.current = { ...latest.current, title: e.target.value };
              schedule();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                editor?.commands.focus("start");
              }
            }}
          />
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}

/** Menu Aa: título, subtítulo e corpo; negrito, itálico, sublinhado e riscado; listas. */
function FormatPanel({ editor, onClose }: { editor: TipTap; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
    }),
  });

  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const outside = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest("[data-aa]")) onClose();
    };
    addEventListener("mousedown", outside);
    return () => removeEventListener("mousedown", outside);
  }, []);

  // Sem focus() no comando: o foco fica no menu para escolher vários formatos seguidos.
  const btn = (label: string, active: boolean, run: (c: ChainedCommands) => ChainedCommands, content: ReactNode = label) => (
    <button className={`seg-b${active ? " is-on" : ""}`} aria-label={label} aria-pressed={active} onClick={() => run(editor.chain()).run()}>
      {content}
    </button>
  );

  return (
    <div
      ref={ref}
      className="fmt"
      role="dialog"
      aria-label="Formatar texto"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="seg" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {btn("Título", on.h2, (c) => c.setHeading({ level: 2 }), <span style={{ fontSize: 14, fontWeight: 700 }}>Título</span>)}
        {btn("Subtítulo", on.h3, (c) => c.setHeading({ level: 3 }))}
        {btn("Corpo", !on.h2 && !on.h3, (c) => c.setParagraph())}
      </div>
      <div className="seg" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {btn("Negrito", on.bold, (c) => c.toggleBold(), <b>N</b>)}
        {btn("Itálico", on.italic, (c) => c.toggleItalic(), <i style={{ fontFamily: "Georgia, serif" }}>I</i>)}
        {btn("Sublinhado", on.underline, (c) => c.toggleUnderline(), <u>S</u>)}
        {btn("Riscado", on.strike, (c) => c.toggleStrike(), <s>R</s>)}
      </div>
      <div className="seg">
        {btn("Lista com marcadores", on.bullet, (c) => c.toggleBulletList(), "• Marcadores")}
        {btn("Lista numerada", on.ordered, (c) => c.toggleOrderedList(), "1. Numerada")}
      </div>
    </div>
  );
}
