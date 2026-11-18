// Barra lateral (docs/ESPECIFICACAO.md, 4.2).
import { useState, type ReactNode, type MouseEvent } from "react";
import { api, type Appearance, type Folder, type Note } from "./api";
import { Icon, paths } from "./icons";
import { menuAt, type MenuState } from "./Menu";
import logo from "../assets/icone/svg/brainote-claro-small.svg";

export const SHORTCUTS = [
  { id: "all", label: "Todas as notas", icon: paths.notes },
  { id: "checklists", label: "Checklists", icon: paths.checklist },
  { id: "agenda", label: "Agenda", icon: paths.agenda },
  { id: "reminders", label: "Lembretes", icon: paths.bell },
];

type Props = {
  folders: Folder[];
  notes: Note[];
  pendingReminders: number;
  section: string;
  onSection: (id: string) => void;
  look: Appearance;
  onLook: (change: Partial<Appearance>) => void;
  onSettings: () => void;
  widgetMenuOpen: boolean;
  onWidgetMenu: () => void;
  openMenu: (m: MenuState) => void;
  onChanged: () => Promise<void>;
};

export function Sidebar(p: Props) {
  const [editing, setEditing] = useState<string | null>(null);

  const newFolder = async () => {
    const taken = p.folders.filter((f) => f.name.startsWith("Nova pasta")).length;
    const f = await api.createFolder(taken ? `Nova pasta ${taken + 1}` : "Nova pasta");
    await p.onChanged();
    p.onSection(f.id);
    setEditing(f.id);
  };

  const rename = async (f: Folder, name: string) => {
    setEditing(null);
    name = name.trim();
    if (name && name !== f.name) {
      await api.renameFolder(f.id, name);
      await p.onChanged();
    }
  };

  const remove = async (f: Folder) => {
    await api.deleteFolder(f.id);
    if (p.section === f.id) p.onSection("all");
    await p.onChanged();
  };

  const folderMenu = (e: MouseEvent, f: Folder) =>
    p.openMenu({
      ...menuAt(e),
      items: [
        { label: "Renomear", onSelect: () => setEditing(f.id) },
        { label: "Apagar", onSelect: () => remove(f) },
      ],
    });

  const nav = (id: string, label: string, icon: ReactNode, count: number, onContextMenu?: (e: MouseEvent) => void) => (
    <button
      key={id}
      className={`nav${p.section === id ? " is-on" : ""}`}
      aria-current={p.section === id ? "page" : undefined}
      onClick={() => p.onSection(id)}
      onContextMenu={onContextMenu}
    >
      <span className="nav-ic"><Icon>{icon}</Icon></span>
      <span className="nav-l">{label}</span>
      <span className="nav-c">{count}</span>
    </button>
  );

  return (
    <aside className="pane side" aria-label="Pastas e atalhos">
      <div className="bar" data-tauri-drag-region style={{ gap: 8, padding: "0 16px" }}>
        <img src={logo} alt="" width={20} height={20} data-tauri-drag-region />
        <span data-tauri-drag-region style={{ fontWeight: 600 }}>brainote</span>
      </div>

      <nav aria-label="Navegação" className="pane-scroll" style={{ padding: "0 10px 12px" }}>
        <div className="lbl" style={{ padding: "6px 10px" }}>Atalhos</div>
        {SHORTCUTS.map((s) =>
          nav(s.id, s.label, s.icon,
            s.id === "all" ? p.notes.length
            : s.id === "checklists" ? p.notes.filter((n) => n.has_checklist).length
            : s.id === "reminders" ? p.pendingReminders
            : 0),
        )}

        <div className="lbl" style={{ padding: "18px 10px 6px" }}>Pastas</div>
        {p.folders.map((f) =>
          editing === f.id ? (
            <div key={f.id} className="nav is-on">
              <span className="nav-ic"><Icon>{paths.folder}</Icon></span>
              <input
                className="plain"
                aria-label="Nome da pasta"
                defaultValue={f.name}
                autoFocus
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.currentTarget.value = f.name;
                  if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                }}
                onBlur={(e) => rename(f, e.target.value)}
              />
            </div>
          ) : (
            nav(f.id, f.name, paths.folder, p.notes.filter((n) => n.folder_id === f.id).length, (e) => folderMenu(e, f))
          ),
        )}
        <button className="nav" style={{ marginTop: 4 }} onClick={newFolder}>
          <span className="nav-ic"><Icon>{paths.folderPlus}</Icon></span>
          <span className="nav-l t2">Nova pasta</span>
        </button>
      </nav>

      <div style={{ flex: "none", padding: 12, borderTop: "1px solid var(--sep)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 0 2px" }}>
          <span className="lbl">Aparência</span>
          <button className="btn-ic" aria-label="Configurações" style={{ width: 28, height: 28 }} onClick={p.onSettings}>
            <Icon>{paths.gear}</Icon>
          </button>
        </div>
        <div className="seg" role="group" aria-label="Tema">
          <button className={`seg-b${p.look.theme === "light" ? " is-on" : ""}`} aria-pressed={p.look.theme === "light"} onClick={() => p.onLook({ theme: "light" })}>
            <Icon size={14}>{paths.sun}</Icon>
            Claro
          </button>
          <button className={`seg-b${p.look.theme === "dark" ? " is-on" : ""}`} aria-pressed={p.look.theme === "dark"} onClick={() => p.onLook({ theme: "dark" })}>
            <Icon size={14}>{paths.moon}</Icon>
            Escuro
          </button>
        </div>
        <button className="toggle-row" role="switch" aria-checked={p.look.glass} onClick={() => p.onLook({ glass: !p.look.glass })}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon>{paths.drop}</Icon>
            Efeito vidro
          </span>
          <span className={`sw${p.look.glass ? " is-on" : ""}`}><span className="knob" /></span>
        </button>
        <button className={`wbtn${p.widgetMenuOpen ? " is-on" : ""}`} data-wmenu aria-expanded={p.widgetMenuOpen} onClick={p.onWidgetMenu}>
          <span className="nav-ic"><Icon>{paths.widgets}</Icon></span>
          <span>Adicionar widget</span>
        </button>
      </div>
    </aside>
  );
}
