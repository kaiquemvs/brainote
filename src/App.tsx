import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type Appearance, type CalEvent, type Folder, type LockState, type Note, type Reminder, type Widget } from "./api";
import { Editor, saveAll, type EditorProps } from "./Editor";
import { LockedEditor, LockedNote, PasswordDialog, type PasswordMode } from "./Locked";
import { Menu, type MenuState } from "./Menu";
import { NoteList } from "./NoteList";
import { ReminderForm, type ReminderFormInit } from "./ReminderForm";
import { Reminders } from "./Reminders";
import { Settings } from "./Settings";
import { setAutocorrect } from "./spellcheck";
import { Sidebar, SHORTCUTS } from "./Sidebar";
import { WidgetMenu } from "./WidgetMenu";
import { WindowButtons } from "./WindowButtons";
import { Agenda } from "./Agenda";
import { EventForm, type EventFormInit } from "./EventForm";
import { dayItems } from "./dates";

export default function App({ initialLook }: { initialLook: Appearance }) {
  const [look, setLook] = useState(initialLook);
  const changeLook = (next: Partial<Appearance>) => {
    const a = { ...look, ...next };
    setLook(a);
    api.setAppearance(a); // salva e troca o efeito da janela
  };
  const [sideOpen, setSideOpen] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [section, setSection] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null); // nota nova: cursor no título
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Set<string> | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null); // aviso "Desfazer"
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [form, setForm] = useState<ReminderFormInit | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null); // lembrete aberto pela notificação
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [eventForm, setEventForm] = useState<EventFormInit | null>(null);
  const [widgetMenuOpen, setWidgetMenuOpen] = useState(false);
  const [vault, setVault] = useState<LockState>({ has_password: false, unlocked: false, hint: null });
  const [askPassword, setAskPassword] = useState<{ mode: PasswordMode; then: () => void } | null>(null);
  const loadVault = () => api.lockState().then(setVault);

  const refresh = async () => {
    const [f, n, r, w, e] = await Promise.all([api.listFolders(), api.listNotes(), api.listReminders(), api.listWidgets(), api.listEvents()]);
    setEvents(e);
    setFolders(f);
    setNotes(n);
    setReminders(r);
    setWidgets(w);
  };

  // Post-it da nota: o botão do editor e o menu da nota fixam ou removem.
  const postitOf = (noteId: string) => widgets.find((w) => w.kind === "postit" && w.note_id === noteId);
  const togglePostit = (n: Note) => {
    if (n.locked) return; // nota trancada não vai para a área de trabalho
    const w = postitOf(n.id);
    if (w) api.deleteWidget(w.id);
    else api.createWidget("postit", n.id);
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
  const inSection =
    section === "all" ? notes
    : section === "checklists" ? notes.filter((n) => n.has_checklist)
    : folder ? notes.filter((n) => n.folder_id === folder.id)
    : [];
  const list = matches ? inSection.filter((n) => matches.has(n.id)) : inSection;
  const selected = list.find((n) => n.id === selectedId) ?? list[0] ?? null;
  const title = folder?.name ?? SHORTCUTS.find((s) => s.id === section)?.label ?? "";
  // próximo lembrete pendente da nota aberta (a lista já vem em ordem de horário)
  const noteReminder = (selected && reminders.find((r) => r.note_id === selected.id && !r.done)) || null;

  // A nota que aparece aberta (ex.: a primeira da busca) passa a ser a selecionada de verdade.
  // O cursor só vai sozinho para o título da nota recém-criada.
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
    if (selected?.id !== focusId) setFocusId(null);
  }, [selected?.id]);

  const go = (id: string) => {
    setSection(id);
    setQuery("");
    setHighlight(null);
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

  // Notas com senha: trancar e tirar o cadeado precisam das notas abertas. Na primeira vez cria a senha;
  // depois, se estiverem fechadas, pede a senha. O que foi digitado é salvo antes de trancar.
  const withVault = (then: () => void) =>
    vault.unlocked ? then() : setAskPassword({ mode: vault.has_password ? "abrir" : "criar", then });
  const lockNote = (n: Note) =>
    withVault(async () => {
      await saveAll();
      await api.lockNote(n.id).catch(() => {}); // o aviso (ex.: nota com imagem) já apareceu
      await refresh();
    });
  const removeLock = (n: Note) =>
    withVault(async () => {
      await saveAll();
      await api.unlockNote(n.id);
      await refresh();
    });
  const lockNow = async () => {
    await saveAll();
    await api.lockNotes();
    setVault((v) => ({ ...v, unlocked: false }));
  };

  const undoDelete = async () => {
    if (!deleted) return;
    await api.restoreNote(deleted);
    setDeleted(null);
    await refresh();
    setSelectedId(deleted);
  };

  // Avisos do Rust: bandeja, notificação clicada, widgets e dados mudados fora desta janela.
  const handlers = useRef({ newNote, lockNow, openReminder: (_: string | null) => {}, openNote: (_: string) => {}, openAgenda: () => {} });
  handlers.current = {
    newNote,
    lockNow,
    openAgenda: () => go("agenda"),
    openReminder: (id) => {
      go("reminders");
      setHighlight(id);
    },
    openNote: (id) => {
      go("all");
      setSelectedId(id);
    },
  };
  useEffect(() => {
    const offs = [
      listen("data-changed", () => refresh()),
      listen("new-note", () => handlers.current.newNote()),
      listen<string | null>("open-reminder", (e) => handlers.current.openReminder(e.payload)),
      listen<string>("open-note", (e) => handlers.current.openNote(e.payload)),
      listen("open-widget-menu", () => {
        setSideOpen(true);
        setWidgetMenuOpen(true);
      }),
      listen("open-agenda", () => handlers.current.openAgenda()),
      // janela fechada (vai para a bandeja) ou backup importado: as notas com senha trancam
      listen("relock", () => handlers.current.lockNow()),
      // tema e vidro trocados por fora (ex.: backup importado)
      listen<Appearance>("appearance-changed", (e) => setLook(e.payload)),
    ];
    api.getAutocorrect().then(setAutocorrect);
    loadVault();
    return () => offs.forEach((off) => off.then((f) => f()));
  }, []);

  const editorProps: EditorProps | null = selected && {
    note: selected,
    autoFocus: selected.id === focusId,
    onSaved: refresh,
    reminder: noteReminder,
    onReminder: () => setForm(noteReminder ? { reminder: noteReminder } : { noteId: selected.id, title: selected.title }),
    onRemoveReminder: (r) => api.deleteReminder(r.id).then(refresh),
    postitOn: !!postitOf(selected.id),
    onPostit: () => togglePostit(selected),
    openMenu: setMenu,
    search: query,
    locked: selected.locked,
    onLock: () => (selected.locked ? lockNow() : lockNote(selected)),
  };

  return (
    <div className={`app t-${look.theme}${look.glass ? " g-on" : ""}`}>
      {sideOpen && (
        <Sidebar
          folders={folders}
          notes={notes}
          pendingReminders={reminders.filter((r) => !r.done).length}
          todayCount={dayItems(new Date(), events, reminders).filter((i) => !i.done).length}
          section={section}
          onSection={go}
          look={look}
          onLook={changeLook}
          onSettings={() => setSettingsOpen(true)}
          widgetMenuOpen={widgetMenuOpen}
          onWidgetMenu={() => setWidgetMenuOpen(!widgetMenuOpen)}
          openMenu={setMenu}
          onChanged={refresh}
        />
      )}

      {section === "agenda" ? (
        <Agenda
          events={events}
          reminders={reminders}
          onNewEvent={(day) => setEventForm({ day })}
          onEditEvent={(event) => setEventForm({ event })}
          onOpenReminder={(id) => handlers.current.openReminder(id)}
          sideOpen={sideOpen}
          onToggleSide={() => setSideOpen(!sideOpen)}
        />
      ) : section === "reminders" ? (
        <Reminders
          reminders={reminders}
          notes={notes}
          highlightId={highlight}
          onNew={() => setForm({ noteId: null, title: "" })}
          onEdit={(r) => setForm({ reminder: r })}
          onToggleDone={(r) => api.setReminderDone(r.id, !r.done).then(refresh)}
          sideOpen={sideOpen}
          onToggleSide={() => setSideOpen(!sideOpen)}
        />
      ) : (
        <>
          <NoteList
            title={title}
            notes={list}
            folders={folders}
            showFolder={!folder}
            emptyText={query ? "Nenhuma nota encontrada." : "Nenhuma nota ainda."}
            selectedId={selected?.id ?? null}
            query={query}
            onQuery={setQuery}
            onSelect={setSelectedId}
            onNew={newNote}
            onDelete={deleteNote}
            onPin={(n) => api.setPinned(n.id, !n.pinned).then(refresh)}
            onMove={(id, folderId) => api.moveNote(id, folderId).then(refresh)}
            hasPostit={(id) => !!postitOf(id)}
            onPostit={togglePostit}
            onLock={(n) => (n.locked ? removeLock(n) : lockNote(n))}
            sideOpen={sideOpen}
            onToggleSide={() => setSideOpen(!sideOpen)}
            openMenu={setMenu}
          />

          <section className="pane edit" aria-label="Editor da nota">
            {selected && editorProps ? (
              !selected.locked ? (
                <Editor key={selected.id} {...editorProps} />
              ) : vault.unlocked ? (
                <LockedEditor key={selected.id} {...editorProps} onFail={loadVault} />
              ) : (
                <LockedNote key={selected.id} title={selected.title} hint={vault.hint} onUnlocked={loadVault} />
              )
            ) : (
              <>
                <div className="bar" data-tauri-drag-region>
                  <span className="grow" data-tauri-drag-region />
                  <WindowButtons />
                </div>
                <p className="t2" style={{ margin: "120px 0 0", textAlign: "center", fontSize: 14 }}>Selecione ou crie uma nota.</p>
              </>
            )}
          </section>
        </>
      )}

      {menu && <Menu menu={menu} onClose={() => setMenu(null)} />}
      {form && <ReminderForm init={form} notes={notes} onClose={() => setForm(null)} onSaved={refresh} />}
      {eventForm && <EventForm init={eventForm} notes={notes} onClose={() => setEventForm(null)} onSaved={refresh} />}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} onVault={loadVault} />}
      {askPassword && (
        <PasswordDialog
          mode={askPassword.mode}
          hint={vault.hint}
          onClose={() => setAskPassword(null)}
          onDone={async () => {
            setAskPassword(null);
            await loadVault();
            askPassword.then();
          }}
        />
      )}
      {widgetMenuOpen && (
        <WidgetMenu widgets={widgets} notes={notes} noteId={selected?.id ?? null} onClose={() => setWidgetMenuOpen(false)} />
      )}
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
