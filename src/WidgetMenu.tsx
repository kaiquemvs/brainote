// Menu "Adicionar widget" (docs/ESPECIFICACAO.md, 5), no estilo do protótipo.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Note, type Widget, type WidgetKind } from "./api";
import { Dialog } from "./Dialog";
import { Icon, paths } from "./icons";
import { Select } from "./Select";

const KINDS: { kind: WidgetKind; label: string; desc: string; icon: ReactNode }[] = [
  { kind: "postit", label: "Post-it", desc: "Uma nota sempre visível na área de trabalho", icon: paths.postit },
  { kind: "checklist", label: "Checklist", desc: "Uma nota com checklist e o progresso", icon: paths.checklist },
  { kind: "agenda", label: "Agenda de hoje", desc: "Compromissos e lembretes do dia", icon: paths.agenda },
];

type Props = { widgets: Widget[]; notes: Note[]; noteId: string | null; onClose: () => void };

export function WidgetMenu({ widgets, notes, noteId, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState<"postit" | "checklist" | null>(null);

  // Clique fora fecha; com a escolha de nota aberta, os cliques são dela.
  useEffect(() => {
    if (picking) return;
    ref.current?.querySelector("button")?.focus();
    const outside = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest("[data-wmenu]")) onClose();
    };
    addEventListener("mousedown", outside);
    return () => removeEventListener("mousedown", outside);
  }, [picking]);

  // Checklist e agenda: um de cada. Post-its podem ser vários.
  const existing = (kind: WidgetKind) => (kind === "postit" ? undefined : widgets.find((w) => w.kind === kind));
  const act = (kind: WidgetKind) => {
    const w = existing(kind);
    if (w) api.deleteWidget(w.id);
    else if (kind === "agenda") api.createWidget("agenda", null);
    else setPicking(kind);
  };

  return (
    <>
      <div
        ref={ref}
        className="wmenu"
        role="dialog"
        aria-label="Widgets na área de trabalho"
        onKeyDown={(e) => e.key === "Escape" && !picking && onClose()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 8px" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Widgets na área de trabalho</span>
          <button className="btn-ic" aria-label="Fechar menu de widgets" style={{ width: 26, height: 26 }} onClick={onClose}>
            <Icon size={14}>{paths.x}</Icon>
          </button>
        </div>
        {KINDS.map(({ kind, label, desc, icon }) => {
          const on = !!existing(kind);
          return (
            <div key={kind} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px" }}>
              <span className="w-tile"><Icon size={18}>{icon}</Icon></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{label}</span>
                <span className="t2" style={{ display: "block", fontSize: 12, lineHeight: 1.35 }}>{desc}</span>
              </span>
              <button className={`pill${on ? " is-on" : ""}`} aria-label={`${on ? "Remover" : "Adicionar"} widget ${label}`} onClick={() => act(kind)}>
                {on ? "Remover" : "Adicionar"}
              </button>
            </div>
          );
        })}
      </div>
      {picking && <NotePicker kind={picking} notes={notes} noteId={noteId} onClose={() => setPicking(null)} />}
    </>
  );
}

/** Escolher a nota do post-it ou do checklist (já marcada a que está aberta). */
function NotePicker({ kind, notes, noteId, onClose }: { kind: "postit" | "checklist"; notes: Note[]; noteId: string | null; onClose: () => void }) {
  const options = kind === "checklist" ? notes.filter((n) => n.has_checklist) : notes;
  const [id, setId] = useState(options.find((n) => n.id === noteId)?.id ?? options[0]?.id ?? "");

  const add = async () => {
    if (!id) return;
    await api.createWidget(kind, id);
    onClose();
  };

  return (
    <Dialog title={kind === "postit" ? "Post-it de qual nota?" : "Checklist de qual nota?"} onClose={onClose}>
      {options.length > 0 ? (
        <div className="fld">
          <span className="lbl">Nota</span>
          <Select label="Nota" value={id} onChange={setId} options={options.map((n) => ({ value: n.id, label: n.title.trim() || "Nova nota" }))} />
        </div>
      ) : (
        <p className="t2" style={{ margin: 0, fontSize: 14 }}>
          {kind === "checklist" ? "Nenhuma nota com checklist ainda." : "Nenhuma nota ainda."}
        </p>
      )}
      <div className="dlg-actions">
        <button className="btn-soft" onClick={onClose}>Cancelar</button>
        <button className="btn-acc" disabled={!id} onClick={add}>Adicionar</button>
      </div>
    </Dialog>
  );
}
