import { useEffect, useState } from "react";
import { api, type Folder, type Note } from "./api";
import { Editor } from "./Editor";
import { Menu, type MenuState } from "./Menu";
import { NoteList } from "./NoteList";
import { Sidebar, SHORTCUTS, type Theme } from "./Sidebar";
import { WindowButtons } from "./WindowButtons";

// Atalhos que ganham conteúdo nas próximas fases (Checklists: 2, Lembretes: 4, Agenda: 6).
const LATER = ["checklists", "agenda", "reminders"];

export default function App() {
  const [theme, setTheme] = useState<Theme>("light");
  const [sideOpen, setSideOpen] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [section, setSection] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null); // nota nova: cursor no título
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Set<string> | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null); // aviso "Desfazer"
  const [menu, setMenu] = useState<MenuState | null>(null);

  const refresh = async () => {
    const [f, n] = await Promise.all([api.listFolders(), api.listNotes()]);
    setFolders(f);
    setNotes(n);
  };
  useEffect(() => { refresh(); }, []);

  // Busca no SQLite (FTS5); refaz quando as notas mudam.
  useEffect(() => {
    const q = query.trim();
    if (!q) return setMatches(null);
    let stale = false;
    api.searchNotes(q).then((ids) => { if (!stale) setMatches(new Set(ids)); });
    return () => { stale = true; };
  }, [query, notes]);

  useEffect(() => {
    if (!deleted) return;
    const t = setTimeout(() => setDeleted(null), 6000);
    return () => clearTimeout(t);
  }, [deleted]);

  const folder = folders.find((f) => f.id === section);
  const inSection = section === "all" ? notes : folder ? notes.filter((n) => n.folder_id === folder.id) : [];
  const list = matches ? inSection.filter((n) => matches.has(n.id)) : inSection;
  const selected = list.find((n) => n.id === selectedId) ?? list[0] ?? null;
  const title = folder?.name ?? SHORTCUTS.find((s) => s.id === section)?.label ?? "";

  // A nota que aparece aberta (ex.: a primeira da busca) passa a ser a selecionada de verdade.
  // O cursor só vai sozinho para o título da nota recém-criada.
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
    if (selected?.id !== focusId) setFocusId(null);
  }, [selected?.id]);

  const go = (id: string) => {
    setSection(id);
    setQuery("");
  };

  const newNote = async () => {
    const n = await api.createNote(folder ? folder.id : null);
    if (!folder) setSection("all");
    setQuery("");
    await refresh();
    setSelectedId(n.id);
    setFocusId(n.id);
  };

  const deleteNote = async (id: string) => {
    await api.deleteNote(id);
    await refresh();
    setDeleted(id);
  };

  const undoDelete = async () => {
    if (!deleted) return;
    await api.restoreNote(deleted);
    setDeleted(null);
    await refresh();
    setSelectedId(deleted);
  };

  return (
    <div className={`app t-${theme}`}>
      {sideOpen && (
        <Sidebar
          folders={folders}
          notes={notes}
          section={section}
          onSection={go}
          theme={theme}
          onTheme={setTheme}
          openMenu={setMenu}
          onChanged={refresh}
        />
      )}

      <NoteList
        title={title}
        notes={list}
        folders={folders}
        showFolder={!folder}
        emptyText={query ? "Nenhuma nota encontrada." : LATER.includes(section) ? "Chega numa próxima fase." : "Nenhuma nota ainda."}
        selectedId={selected?.id ?? null}
        query={query}
        onQuery={setQuery}
        onSelect={setSelectedId}
        onNew={newNote}
        onDelete={deleteNote}
        onPin={(n) => api.setPinned(n.id, !n.pinned).then(refresh)}
        onMove={(id, folderId) => api.moveNote(id, folderId).then(refresh)}
        sideOpen={sideOpen}
        onToggleSide={() => setSideOpen(!sideOpen)}
        openMenu={setMenu}
      />

      <section className="pane edit" aria-label="Editor da nota">
        <div className="bar" data-tauri-drag-region style={{ paddingLeft: 14 }}>
          <span className="grow" data-tauri-drag-region />
          <WindowButtons />
        </div>
        <div className="pane-scroll" style={{ padding: "4px clamp(20px, 6%, 64px) 40px" }}>
          {selected ? (
            <Editor key={selected.id} note={selected} autoFocus={selected.id === focusId} onSaved={refresh} />
          ) : (
            <p className="t2" style={{ margin: "120px 0 0", textAlign: "center", fontSize: 14 }}>Selecione ou crie uma nota.</p>
          )}
        </div>
      </section>

      {menu && <Menu menu={menu} onClose={() => setMenu(null)} />}
      <div className="toast-area" role="status">
        {deleted && (
          <div className="toast">
            Nota apagada ·
            <button className="toast-b" onClick={undoDelete}>Desfazer</button>
          </div>
        )}
      </div>
    </div>
  );
}
