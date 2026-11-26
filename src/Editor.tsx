// Editor da nota (docs/ESPECIFICACAO.md, 4.4), com TipTap.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor as TipTap } from "@tiptap/react";
import type { ChainedCommands } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-list";
import { api, type Note, type Reminder, type SpellLang } from "./api";
import { ChecklistItem } from "./checklist";
import { editorDate, reminderWhen } from "./dates";
import { Marker, MARKER_COLORS, type MarkerColor } from "./highlight";
import { Attachment, Files, insertAttached, Picture } from "./attachments";
import { Icon, paths } from "./icons";
import { type MenuState } from "./Menu";
import { noteDoc as initialContent, noteFiles, noteToText } from "./noteContent";
import { SearchHighlight, setSearch } from "./searchHighlight";
import { TableMenu, Tables } from "./tables";
import { Spellcheck, type SpellMenu } from "./spellcheck";
import { TitleField } from "./TitleField";
import { WindowButtons } from "./WindowButtons";

const extensions = [
  // Só os formatos do menu Aa. Link desligado: clicar abriria o site dentro do app.
  StarterKit.configure({ heading: { levels: [2, 3] }, link: false, code: false, codeBlock: false, blockquote: false, horizontalRule: false }),
  TaskList,
  ChecklistItem,
  Marker,
  Tables,
  SearchHighlight,
];

// Salvamentos pendentes dos editores abertos: antes de trancar, o que foi digitado vai para o banco.
const pending = new Set<() => Promise<void>>();
export const saveAll = () => Promise.all([...pending].map((save) => save()));

type Props = {
  note: Note;
  autoFocus: boolean;
  onSaved: () => void;
  /** próximo lembrete pendente da nota (chip e sino) */
  reminder: Reminder | null;
  onReminder: () => void;
  onRemoveReminder: (r: Reminder) => void;
  /** a nota já tem post-it na área de trabalho */
  postitOn: boolean;
  onPostit: () => void;
  openMenu: (m: MenuState) => void;
  /** texto do campo "Buscar": destacado na nota */
  search: string;
  /** nota com senha (aberta): sem imagens, anexos nem post-it */
  locked: boolean;
  /** cadeado da barra: tranca a nota, ou, se ela já é trancada, tranca todas agora */
  onLock: () => void;
};
export type EditorProps = Props;

/** Montado com `key={note.id}`: cada nota tem o seu próprio editor. */
export function Editor({ note, autoFocus, onSaved, reminder, onReminder, onRemoveReminder, postitOn, onPostit, openMenu, search, locked, onLock }: Props) {
  const [title, setTitle] = useState(note.title);
  const [aaOpen, setAaOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [markColor, setMarkColor] = useState<MarkerColor>("amarelo");
  // caneta: cada trecho arrastado fica marcado; borracha: cada trecho arrastado perde a marca
  const [tool, setTool] = useState<MarkTool>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // idioma principal do corretor nesta nota (o botão PT/EN da barra)
  const [lang, setLang] = useState<SpellLang>(note.spell_lang);
  const langRef = useRef(lang);
  langRef.current = lang;
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

  // Botão direito numa palavra errada: sugestões do corretor no menu do app.
  const spellMenu = async (m: SpellMenu) => {
    const words = await api.spellSuggest(m.word, langRef.current);
    const items = words.length ? words.map((w) => ({ label: w, onSelect: () => m.replace(w) })) : [{ label: "Sem sugestões", onSelect: () => {} }];
    openMenu({ x: m.x, y: m.y, items: [...items, { label: "Ignorar", onSelect: m.ignore }] });
  };
  const spellMenuRef = useRef(spellMenu);
  spellMenuRef.current = spellMenu;

  const editor = useEditor({
    extensions: [
      ...extensions,
      // nota trancada não aceita imagem nem anexo (nem colando, nem arrastando)
      ...(locked ? [] : [Picture, Files, Attachment.configure({ openMenu })]),
      Spellcheck.configure({ check: api.spellCheck, fix: (w) => api.spellAutocorrect(w, langRef.current), onMenu: (m) => spellMenuRef.current(m) }),
      TableMenu.configure({ openMenu }),
    ],
    content: initialContent(note),
    // corretor do Windows desligado: ele só conhece português e marcaria as palavras em inglês
    editorProps: { attributes: { "aria-label": "Texto da nota", spellcheck: "false" } },
    onUpdate: ({ editor }) => {
      // listas geram separadores em dobro: uma linha por bloco basta para busca e prévia
      const text = editor.getText({ blockSeparator: "\n" }).replace(/\n+/g, "\n").trim();
      latest.current = { ...latest.current, json: JSON.stringify(editor.getJSON()), text };
      schedule();
    },
  });

  useEffect(() => {
    if (editor) setSearch(editor.view, search);
  }, [editor, search]);

  // Não usa o atributo autoFocus: a nota nova pode já estar aberta quando o pedido de foco chega.
  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus]);

  // A nota mudou fora do editor (item marcado num widget): mostra a versão nova. Se houver
  // digitação ainda não salva, ela tem prioridade e o salvamento dela vence.
  useEffect(() => {
    if (!editor || !note.content_json || dirty.current || note.content_json === latest.current.json) return;
    editor.commands.setContent(JSON.parse(note.content_json), { emitUpdate: false });
    latest.current = { ...latest.current, json: note.content_json };
  }, [note.content_json]);

  // Salva o que faltar ao trocar de nota (desmontar) ou quando a janela perde o foco
  // (fechar só esconde na bandeja; clicar no "Sair" da bandeja já tira o foco antes).
  useEffect(() => {
    addEventListener("blur", flush);
    pending.add(flush);
    return () => {
      removeEventListener("blur", flush);
      pending.delete(flush);
      flush();
    };
  }, []);

  // Caneta e borracha: ao soltar o mouse depois de arrastar sobre o texto, o trecho ganha ou perde a cor; Esc desliga.
  useEffect(() => {
    if (!editor || !tool) return;
    const onUp = () =>
      setTimeout(() => {
        // espera o editor terminar de ler a seleção feita pelo mouse
        const { to, empty } = editor.state.selection;
        if (empty) return;
        const c = editor.chain();
        (tool === "caneta" ? c.setHighlight({ color: markColor }) : c.unsetHighlight()).setTextSelection(to).run();
      });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTool(null);
    editor.view.dom.addEventListener("mouseup", onUp);
    addEventListener("keydown", onKey);
    return () => {
      editor.view.dom.removeEventListener("mouseup", onUp);
      removeEventListener("keydown", onKey);
    };
  }, [editor, tool, markColor]);

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
        <button
          className={`btn-ic${markOpen || tool ? " is-on" : ""}`}
          data-mk
          aria-label={tool ? `Marca-texto (${tool} ligada)` : "Marca-texto"}
          aria-expanded={markOpen}
          onClick={() => setMarkOpen(!markOpen)}
        >
          <Icon size={18}>{paths.marker}</Icon>
        </button>
        <button
          className="btn-ic"
          aria-label="Inserir tabela"
          title="Inserir tabela (botão direito numa célula adiciona e remove linhas e colunas)"
          onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <Icon size={18}>{paths.table}</Icon>
        </button>
        {!locked && (
          <button
            className="btn-ic"
            aria-label="Inserir imagem ou arquivo"
            title="Inserir imagem ou arquivo (ou cole com Ctrl+V, ou arraste para a nota)"
            onClick={async () => editor && insertAttached(editor, await api.attachFiles())}
          >
            <Icon size={18}>{paths.clip}</Icon>
          </button>
        )}
        <button className={`btn-ic${reminder ? " is-on" : ""}`} aria-label="Lembrete desta nota" aria-pressed={!!reminder} onClick={onReminder}>
          <Icon size={18}>{paths.bell}</Icon>
        </button>
        {!locked && (
          <button className={`btn-ic${postitOn ? " is-on" : ""}`} aria-label="Fixar como post-it na área de trabalho" aria-pressed={postitOn} onClick={onPostit}>
            <Icon size={18}>{paths.postit}</Icon>
          </button>
        )}
        <button
          className={`btn-ic${locked ? " is-on" : ""}`}
          aria-label={locked ? "Trancar agora" : "Trancar nota com senha"}
          title={locked ? "Trancar agora (fecha todas as notas trancadas)" : "Trancar nota com senha"}
          onClick={onLock}
        >
          <Icon size={18}>{paths.lock}</Icon>
        </button>
        <button
          className="btn-ic"
          aria-label="Exportar nota (.md ou .txt)"
          title="Exportar nota"
          onClick={() => {
            const doc = editor?.getJSON() ?? initialContent(note);
            const files = noteFiles(doc).map((f): [string, string] => [f.id, f.file]);
            api.exportNote(title, noteToText(title, doc, false), noteToText(title, doc, true), files);
          }}
        >
          <Icon size={18}>{paths.download}</Icon>
        </button>
        <button
          className="btn-ic lang-b"
          aria-label={`Idioma do corretor nesta nota: ${lang === "pt" ? "português" : "inglês"}. Clique para trocar.`}
          title="Idioma do corretor nesta nota (as palavras certas no outro idioma também valem)"
          onClick={() => {
            const next = lang === "pt" ? "en" : "pt";
            setLang(next);
            api.setNoteLang(note.id, next).then(onSaved);
          }}
        >
          {lang.toUpperCase()}
        </button>
        <span className="grow" data-tauri-drag-region />
        <WindowButtons />
        {markOpen && editor && (
          <MarkPanel
            editor={editor}
            color={markColor}
            tool={tool}
            onColor={setMarkColor}
            onTool={(t) => {
              setTool(t);
              if (t) setMarkOpen(false); // ferramenta ligada: o painel sai da frente para você arrastar
            }}
            onClose={() => setMarkOpen(false)}
          />
        )}
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
        <div style={{ maxWidth: 680, margin: "0 auto" }} className={tool === "caneta" ? `pen-${markColor}` : tool === "borracha" ? "eraser-on" : undefined}>
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
          <TitleField
            value={title}
            inputRef={titleRef}
            lang={lang}
            openMenu={openMenu}
            onChange={(t) => {
              setTitle(t);
              latest.current = { ...latest.current, title: t };
              schedule();
            }}
            onEnter={() => editor?.commands.focus("start")}
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

type MarkTool = "caneta" | "borracha" | null;

/** Marca-texto: cores, caneta e borracha. Com texto selecionado, clicar na cor já marca o trecho. */
function MarkPanel(p: {
  editor: TipTap;
  color: MarkerColor;
  tool: MarkTool;
  onColor: (c: MarkerColor) => void;
  onTool: (t: MarkTool) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const outside = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest("[data-mk]")) p.onClose();
    };
    addEventListener("mousedown", outside);
    return () => removeEventListener("mousedown", outside);
  }, []);

  return (
    <div
      ref={ref}
      className="fmt"
      style={{ left: 84, width: 250 }}
      role="dialog"
      aria-label="Marca-texto"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          p.onClose();
        }
      }}
    >
      <div className="mk-colors">
        {MARKER_COLORS.map(([c, name]) => (
          <button
            key={c}
            className={`mk-dot${c === p.color ? " is-on" : ""}`}
            data-color={c}
            aria-label={`Marca-texto ${name.toLowerCase()}`}
            aria-pressed={c === p.color}
            onClick={() => {
              p.onColor(c);
              if (!p.editor.state.selection.empty) p.editor.chain().setHighlight({ color: c }).run();
            }}
          />
        ))}
      </div>
      {(["caneta", "borracha"] as const).map((t) => (
        <button key={t} className="toggle-row" role="switch" aria-checked={p.tool === t} onClick={() => p.onTool(p.tool === t ? null : t)}>
          <span>{t === "caneta" ? "Modo caneta" : "Borracha"}</span>
          <span className={`sw${p.tool === t ? " is-on" : ""}`}><span className="knob" /></span>
        </button>
      ))}
    </div>
  );
}
