// Criar ou editar evento da Agenda (docs/ESPECIFICACAO.md, 4.5).
import { useState } from "react";
import { api, type CalEvent, type Note } from "./api";
import { dateInput, timeInput, toLocalIso } from "./dates";
import { Dialog } from "./Dialog";

/** Editar um evento, ou criar um novo no dia escolhido no calendário. */
export type EventFormInit = { event: CalEvent } | { day: Date };

type Props = { init: EventFormInit; notes: Note[]; onClose: () => void; onSaved: () => void };

export function EventForm({ init, notes, onClose, onSaved }: Props) {
  const editing = "event" in init ? init.event : null;
  const start = "event" in init
    ? new Date(init.event.starts_at)
    : new Date(init.day.getFullYear(), init.day.getMonth(), init.day.getDate(), 9);

  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(dateInput(start));
  const [allDay, setAllDay] = useState(editing?.all_day ?? false);
  const [from, setFrom] = useState(timeInput(start));
  const [to, setTo] = useState(editing?.ends_at ? timeInput(new Date(editing.ends_at)) : "");
  const [noteId, setNoteId] = useState(editing?.note_id ?? null);

  const startsAt = new Date(`${date}T${allDay ? "00:00" : from}`);
  const endsAt = !allDay && to ? new Date(`${date}T${to}`) : null;
  const problem =
    !title.trim() ? "Dê um título ao evento."
    : isNaN(startsAt.getTime()) ? "Escolha a data e a hora."
    : endsAt && endsAt < startsAt ? "A hora de fim é antes do início."
    : null;

  const save = async () => {
    if (problem) return;
    const input = {
      title: title.trim(),
      starts_at: toLocalIso(startsAt),
      ends_at: endsAt && toLocalIso(endsAt),
      all_day: allDay,
      note_id: noteId,
    };
    if (editing) await api.updateEvent(editing.id, input);
    else await api.createEvent(input);
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!editing) return;
    await api.deleteEvent(editing.id);
    onSaved();
    onClose();
  };

  return (
    <Dialog title={editing ? "Editar evento" : "Novo evento"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "grid", gap: 14 }}>
        <label className="fld">
          <span className="lbl">Título</span>
          <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do compromisso" />
        </label>

        <label className="fld">
          <span className="lbl">Data</span>
          <input className="inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <button type="button" className="toggle-row" role="switch" aria-checked={allDay} onClick={() => setAllDay(!allDay)}>
          <span>Dia inteiro</span>
          <span className={`sw${allDay ? " is-on" : ""}`}><span className="knob" /></span>
        </button>

        {!allDay && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="fld">
              <span className="lbl">Início</span>
              <input className="inp" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="fld">
              <span className="lbl">Fim (opcional)</span>
              <input className="inp" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}

        <label className="fld">
          <span className="lbl">Nota vinculada</span>
          <select className="inp" value={noteId ?? ""} onChange={(e) => setNoteId(e.target.value || null)}>
            <option value="">Nenhuma</option>
            {notes.map((n) => (
              <option key={n.id} value={n.id}>{n.title.trim() || "Nova nota"}</option>
            ))}
          </select>
        </label>

        {problem && title && <p className="t2" role="alert" style={{ margin: 0, fontSize: 12 }}>{problem}</p>}

        <div className="dlg-actions">
          {editing && (
            <button type="button" className="btn-soft" style={{ marginRight: "auto" }} onClick={remove}>Apagar</button>
          )}
          <button type="button" className="btn-soft" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-acc" disabled={!!problem}>Salvar</button>
        </div>
      </form>
    </Dialog>
  );
}
