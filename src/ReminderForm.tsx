// Criar ou editar lembrete (docs/ESPECIFICACAO.md, 4.6), pelo sino do editor ou pela tela de Lembretes.
import { useState } from "react";
import { api, type Note, type Reminder, type Repeat } from "./api";
import { dateInput, quickDue, timeInput, toLocalIso } from "./dates";
import { Dialog } from "./Dialog";

/** Editar um lembrete, ou criar um novo (opcionalmente já ligado a uma nota). */
export type ReminderFormInit = { reminder: Reminder } | { noteId: string | null; title: string };

type Mode = "today" | "tomorrow" | "monday" | "custom";
const QUICK: [Mode, string][] = [
  ["today", "Hoje 18:00"],
  ["tomorrow", "Amanhã 09:00"],
  ["monday", "Próxima segunda 09:00"],
  ["custom", "Personalizado"],
];
const REPEAT: [Repeat, string][] = [
  ["none", "Não repetir"],
  ["daily", "Todo dia"],
  ["weekly", "Toda semana"],
  ["monthly", "Todo mês"],
];

type Props = { init: ReminderFormInit; notes: Note[]; onClose: () => void; onSaved: () => void };

export function ReminderForm({ init, notes, onClose, onSaved }: Props) {
  const now = new Date();
  const editing = "reminder" in init ? init.reminder : null;
  const start = editing ? new Date(editing.snoozed_until ?? editing.due_at) : quickDue("tomorrow", now);
  const lateToday = now >= quickDue("today", now); // depois das 18h, "Hoje 18:00" já passou

  const [title, setTitle] = useState("reminder" in init ? init.reminder.title : init.title);
  const [mode, setMode] = useState<Mode>(editing ? "custom" : lateToday ? "tomorrow" : "today");
  const [date, setDate] = useState(dateInput(start));
  const [time, setTime] = useState(timeInput(start));
  const [noteId, setNoteId] = useState(editing ? editing.note_id : "noteId" in init ? init.noteId : null);
  const [repeat, setRepeat] = useState<Repeat>(editing ? editing.repeat : "none");

  const due = mode === "custom" ? new Date(`${date}T${time}`) : quickDue(mode, now);
  const valid = title.trim() !== "" && !isNaN(due.getTime());

  const save = async () => {
    if (!valid) return;
    const input = { note_id: noteId, title: title.trim(), due_at: toLocalIso(due), repeat };
    if (editing) await api.updateReminder(editing.id, input);
    else await api.createReminder(input);
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!editing) return;
    await api.deleteReminder(editing.id);
    onSaved();
    onClose();
  };

  return (
    <Dialog title={editing ? "Editar lembrete" : "Novo lembrete"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "grid", gap: 14 }}>
        <label className="fld">
          <span className="lbl">Título</span>
          <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que lembrar?" />
        </label>

        <div className="fld" role="group" aria-label="Quando">
          <span className="lbl">Quando</span>
          <div className="picks">
            {QUICK.map(([m, label]) => (
              <button
                key={m}
                type="button"
                className={`pick${mode === m ? " is-on" : ""}`}
                aria-pressed={mode === m}
                disabled={m === "today" && lateToday}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "custom" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
              <input className="inp" type="date" aria-label="Data" value={date} onChange={(e) => setDate(e.target.value)} />
              <input className="inp" type="time" aria-label="Hora" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          )}
        </div>

        <label className="fld">
          <span className="lbl">Nota vinculada</span>
          <select className="inp" value={noteId ?? ""} onChange={(e) => setNoteId(e.target.value || null)}>
            <option value="">Nenhuma</option>
            {notes.map((n) => (
              <option key={n.id} value={n.id}>{n.title.trim() || "Nova nota"}</option>
            ))}
          </select>
        </label>

        <label className="fld">
          <span className="lbl">Repetir</span>
          <select className="inp" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
            {REPEAT.map(([r, label]) => (
              <option key={r} value={r}>{label}</option>
            ))}
          </select>
        </label>

        <div className="dlg-actions">
          {editing && (
            <button type="button" className="btn-soft" style={{ marginRight: "auto" }} onClick={remove}>Apagar</button>
          )}
          <button type="button" className="btn-soft" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-acc" disabled={!valid}>Salvar</button>
        </div>
      </form>
    </Dialog>
  );
}
