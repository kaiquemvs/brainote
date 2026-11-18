// Tela de Lembretes (docs/ESPECIFICACAO.md, 4.6): ocupa as colunas da lista e do editor.
import { useEffect, useState } from "react";
import type { Note, Reminder } from "./api";
import { REMINDER_GROUPS, reminderGroup, reminderWhen } from "./dates";
import { Icon, paths } from "./icons";
import { WindowButtons } from "./WindowButtons";

type Props = {
  reminders: Reminder[];
  notes: Note[];
  highlightId: string | null;
  onNew: () => void;
  onEdit: (r: Reminder) => void;
  onToggleDone: (r: Reminder) => void;
  sideOpen: boolean;
  onToggleSide: () => void;
};

/** Quando o lembrete vence de fato: o horário do "adiar", se houver. */
const whenOf = (r: Reminder) => new Date(r.snoozed_until ?? r.due_at);

export function Reminders(p: Props) {
  const now = new Date();
  const [doneOpen, setDoneOpen] = useState(false);
  const pending = p.reminders.filter((r) => !r.done).length;
  const noteTitle = (id: string | null) => {
    const n = id ? p.notes.find((x) => x.id === id) : undefined;
    return n && (n.title.trim() || "Nova nota");
  };
  const groups = REMINDER_GROUPS.map((label) => ({
    label,
    items: p.reminders.filter((r) => reminderGroup(whenOf(r), r.done, now) === label),
  })).filter((g) => g.items.length > 0);

  // aberto pela notificação: mostra o item, mesmo se estiver em Concluídos
  const hlDone = p.reminders.some((r) => r.id === p.highlightId && r.done);
  useEffect(() => {
    document.getElementById(`rem-${p.highlightId}`)?.scrollIntoView({ block: "center" });
  }, [p.highlightId, p.reminders]);

  return (
    <section className="pane edit" aria-label="Lembretes">
      <div className="bar" data-tauri-drag-region style={{ gap: 8, paddingLeft: 10 }}>
        <button className="btn-ic" aria-label="Mostrar ou ocultar a barra lateral" aria-expanded={p.sideOpen} onClick={p.onToggleSide}>
          <Icon size={18}>{paths.sidebar}</Icon>
        </button>
        <span className="grow" data-tauri-drag-region />
        <button className="btn-acc" onClick={p.onNew}>
          <Icon size={15}>{paths.plus}</Icon>
          Novo lembrete
        </button>
        <WindowButtons />
      </div>

      <div className="pane-scroll" style={{ padding: "4px clamp(20px, 6%, 64px) 32px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>Lembretes</h2>
          <p className="t2" style={{ margin: "0 0 6px", fontSize: 13 }}>{pending === 1 ? "1 pendente" : `${pending} pendentes`}</p>
          {p.reminders.length === 0 && <p className="t2" style={{ marginTop: 40, textAlign: "center", fontSize: 14 }}>Nenhum lembrete ainda.</p>}

          {groups.map((g) => {
            const isDone = g.label === "Concluídos";
            const open = !isDone || doneOpen || hlDone;
            return (
              <div key={g.label}>
                {isDone ? (
                  <button className="rem-h rem-h-btn" aria-expanded={open} onClick={() => setDoneOpen(!open)}>
                    <span className={`rem-chev${open ? " is-open" : ""}`}><Icon size={14}>{paths.chevron}</Icon></span>
                    Concluídos ({g.items.length})
                  </button>
                ) : (
                  <h3 className="rem-h">{g.label}</h3>
                )}
                {open &&
                  g.items.map((r) => {
                    const note = noteTitle(r.note_id);
                    return (
                      <div key={r.id} id={`rem-${r.id}`} className={`rem${r.id === p.highlightId ? " is-hl" : ""}`}>
                        <button
                          className={`chk${r.done ? " is-done" : ""}`}
                          aria-pressed={r.done}
                          aria-label={`${r.done ? "Reabrir" : "Concluir"}: ${r.title}`}
                          onClick={() => p.onToggleDone(r)}
                        >
                          <svg className="i i-b" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">{paths.check}</svg>
                        </button>
                        <button className="rem-body" aria-label={`Editar lembrete: ${r.title}`} onClick={() => p.onEdit(r)}>
                          <span className={`chk-t${r.done ? " is-done" : ""}`} style={{ display: "block", fontSize: 15, lineHeight: "22px" }}>
                            {r.title}
                          </span>
                          <span className="t2 rem-meta">
                            <Icon size={13}>{paths.clock}</Icon>
                            <span>{reminderWhen(whenOf(r), now)}</span>
                            {note && <span>· Nota: {note}</span>}
                          </span>
                        </button>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
