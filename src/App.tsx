import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "../assets/icone/svg/brainote-claro-small.svg";

type Theme = "light" | "dark";
type Section = "all" | "checklists" | "agenda" | "reminders";

const SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "all", label: "Todas as notas", icon: <><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M9 8h6M9 12h6M9 16h3.5" /></> },
  { id: "checklists", label: "Checklists", icon: <path d="M4 6.5l1.5 1.5L8.5 5M4 12.5L5.5 14l3-3M4 18.5L5.5 20l3-3M12 7h8M12 13h8M12 19h8" /> },
  { id: "agenda", label: "Agenda", icon: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></> },
  { id: "reminders", label: "Lembretes", icon: <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" /> },
];

function Icon({ size = 16, children }: { size?: number; children: ReactNode }) {
  return <svg className="i" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{children}</svg>;
}

function WindowButtons() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const sync = () => { win.isMaximized().then(setMaximized); };
    sync();
    const unlisten = win.onResized(sync);
    return () => { unlisten.then((off) => off()); };
  }, []);

  return (
    <div className="caps">
      <button className="cap" aria-label="Minimizar" onClick={() => win.minimize()}>
        <svg className="i-thin" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M1 6h10" /></svg>
      </button>
      <button className="cap" aria-label={maximized ? "Restaurar" : "Maximizar"} onClick={() => win.toggleMaximize()}>
        <svg className="i-thin" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          {maximized
            ? <><rect x="1.5" y="3.5" width="7" height="7" rx="1.2" /><path d="M3.5 3.5V2.7a1.2 1.2 0 0 1 1.2-1.2h4.6a1.2 1.2 0 0 1 1.2 1.2v4.6a1.2 1.2 0 0 1-1.2 1.2h-.8" /></>
            : <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" />}
        </svg>
      </button>
      {/* shortcut: fecha o app de verdade; esconder na bandeja chega na Fase 4 */}
      <button className="cap cap-x" aria-label="Fechar" onClick={() => win.close()}>
        <svg className="i-thin" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" /></svg>
      </button>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>("light");
  const [section, setSection] = useState<Section>("all");
  const [sideOpen, setSideOpen] = useState(true);
  const current = SECTIONS.find((s) => s.id === section)!;

  return (
    <div className={`app t-${theme}`}>
      {sideOpen && (
        <aside className="pane side" aria-label="Pastas e atalhos">
          <div className="bar" data-tauri-drag-region style={{ gap: 8, padding: "0 16px" }}>
            <img src={logo} alt="" width={20} height={20} data-tauri-drag-region />
            <span data-tauri-drag-region style={{ fontWeight: 600 }}>brainote</span>
          </div>

          <nav aria-label="Navegação" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 10px 12px" }}>
            <div className="lbl" style={{ padding: "6px 10px" }}>Atalhos</div>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`nav${s.id === section ? " is-on" : ""}`}
                aria-current={s.id === section ? "page" : undefined}
                onClick={() => setSection(s.id)}
              >
                <span className="nav-ic"><Icon>{s.icon}</Icon></span>
                <span className="nav-l">{s.label}</span>
                <span className="nav-c">0</span>
              </button>
            ))}
          </nav>

          <div style={{ flex: "none", padding: 12, borderTop: "1px solid var(--sep)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="lbl" style={{ padding: "0 2px" }}>Aparência</div>
            <div className="seg" role="group" aria-label="Tema">
              <button className={`seg-b${theme === "light" ? " is-on" : ""}`} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>
                <Icon size={14}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></Icon>
                Claro
              </button>
              <button className={`seg-b${theme === "dark" ? " is-on" : ""}`} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>
                <Icon size={14}><path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z" /></Icon>
                Escuro
              </button>
            </div>
          </div>
        </aside>
      )}

      <section className="pane list" aria-label="Lista de notas">
        <div className="bar" data-tauri-drag-region style={{ padding: "0 10px" }}>
          <button className="btn-ic" aria-label="Mostrar ou ocultar a barra lateral" aria-expanded={sideOpen} onClick={() => setSideOpen(!sideOpen)}>
            <Icon size={18}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9.5 4v16" /></Icon>
          </button>
          <span className="grow" data-tauri-drag-region />
        </div>
        <div style={{ padding: "8px 22px 4px" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>{current.label}</h2>
          <p className="t2" style={{ margin: "2px 0 0", fontSize: 12 }}>0 notas</p>
        </div>
      </section>

      <section className="pane edit" aria-label="Editor da nota">
        <div className="bar" data-tauri-drag-region style={{ paddingLeft: 14 }}>
          <span className="grow" data-tauri-drag-region />
          <WindowButtons />
        </div>
        <p className="t2" style={{ margin: "120px 0 0", textAlign: "center", fontSize: 14 }}>Selecione ou crie uma nota.</p>
      </section>
    </div>
  );
}
