// Lista de notas (docs/ESPECIFICACAO.md, 4.3).
import type { MouseEvent } from "react";
import type { Folder, Note } from "./api";
import { groupNotes, rowWhen } from "./dates";
import { Icon, paths } from "./icons";
import { menuAt, type MenuItem, type MenuState } from "./Menu";

/** Tipo do arrastar de nota (a pasta da barra lateral só aceita este). */
export const NOTE_DRAG = "application/x-brainote-note";

type Props = {
  title: string;
  notes: Note[];
  folders: Folder[];
  showFolder: boolean;
  emptyText: string;
  selectedId: string | null;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onPin: (n: Note) => void;
  onMove: (id: string, folderId: string | null) => void;
  /** a nota tem post-it na área de trabalho? (muda o texto do menu) */
  hasPostit: (id: string) => boolean;
  onPostit: (n: Note) => void;
  /** trancar a nota com senha, ou tirar o cadeado */
  onLock: (n: Note) => void;
  sideOpen: boolean;
  onToggleSide: () => void;
  openMenu: (m: MenuState) => void;
};

const preview = (n: Note) => n.locked ? "Nota trancada" : n.plain_text.split("\n").map((s) => s.trim()).find(Boolean) ?? "Sem texto adicional";

export function NoteList(p: Props) {
  const now = new Date();
  const folderName = (id: string) => p.folders.find((f) => f.id === id)?.name;

  const rowMenu = (e: MouseEvent, n: Note) => {
    const at = menuAt(e);
    const moveItems: MenuItem[] = [
      { label: "Sem pasta", checked: !n.folder_id, onSelect: () => p.onMove(n.id, null) },
      ...p.folders.map((f) => ({ label: f.name, checked: n.folder_id === f.id, onSelect: () => p.onMove(n.id, f.id) })),
    ];
    p.openMenu({
      ...at,
      items: [
        { label: n.pinned ? "Desafixar" : "Fixar", onSelect: () => p.onPin(n) },
        { label: "Mover para pasta…", onSelect: () => p.openMenu({ ...at, items: moveItems }) },
        // nota trancada não vai para a área de trabalho
        ...(n.locked ? [] : [{ label: p.hasPostit(n.id) ? "Remover da área de trabalho" : "Fixar na área de trabalho", onSelect: () => p.onPostit(n) }]),
        { label: n.locked ? "Remover cadeado" : "Trancar nota", onSelect: () => p.onLock(n) },
        { label: "Apagar", onSelect: () => p.onDelete(n.id) },
      ],
    });
  };

  return (
    <section className="pane list" aria-label="Lista de notas">
      <div className="bar" data-tauri-drag-region style={{ padding: "0 10px" }}>
        <button className="btn-ic" aria-label="Mostrar ou ocultar a barra lateral" aria-expanded={p.sideOpen} onClick={p.onToggleSide}>
          <Icon size={18}>{paths.sidebar}</Icon>
        </button>
        <span className="grow" data-tauri-drag-region />
        <button className="btn-ic" aria-label="Apagar nota" disabled={!p.selectedId} onClick={() => p.selectedId && p.onDelete(p.selectedId)}>
          <Icon size={18}>{paths.trash}</Icon>
        </button>
        <button className="btn-ic" aria-label="Nova nota" onClick={p.onNew}>
          <Icon size={18}>{paths.compose}</Icon>
        </button>
      </div>

      <div style={{ padding: "0 14px 8px" }}>
        <label className="field">
          <Icon size={15}>{paths.search}</Icon>
          <span className="sr-only">Buscar notas</span>
          <input
            className="plain"
            type="search"
            placeholder="Buscar"
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && p.onQuery("")}
          />
        </label>
      </div>

      <div style={{ padding: "8px 22px 4px" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>{p.title}</h2>
        <p className="t2" style={{ margin: "2px 0 0", fontSize: 12 }}>{p.notes.length === 1 ? "1 nota" : `${p.notes.length} notas`}</p>
      </div>

      <div className="pane-scroll" style={{ padding: "4px 10px 14px" }}>
        {groupNotes(p.notes, now).map((g) => (
          <div key={g.label}>
            <div className="lbl" style={{ padding: "12px 12px 6px" }}>{g.label}</div>
            {g.notes.map((n) => {
              const sel = n.id === p.selectedId;
              return (
                <button
                  key={n.id}
                  className={`row${sel ? " is-sel" : ""}`}
                  aria-current={sel ? "true" : undefined}
                  onClick={() => p.onSelect(n.id)}
                  onContextMenu={(e) => rowMenu(e, n)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(NOTE_DRAG, n.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <span className="row-t">
                    {n.locked && <Icon size={13}>{paths.lock}</Icon>}
                    {n.title.trim() || "Nova nota"}
                  </span>
                  <span className="row-m">
                    <span className="t2" style={{ flex: "none", fontWeight: 500 }}>{rowWhen(new Date(n.updated_at), now)}</span>
                    <span className="t2 ell">{preview(n)}</span>
                  </span>
                  {p.showFolder && n.folder_id && (
                    <span className="t2 row-f"><Icon size={13}>{paths.folder}</Icon>{folderName(n.folder_id)}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {p.notes.length === 0 && <p className="t2" style={{ margin: "24px 12px", fontSize: 13, textAlign: "center" }}>{p.emptyText}</p>}
      </div>
    </section>
  );
}
