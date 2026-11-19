// Criar ou editar evento da Agenda (docs/ESPECIFICACAO.md, 4.5); data no calendário e horas nas rodas (versão 1.1).
import { useState } from "react";
import { api, type CalEvent, type Note } from "./api";
import { toLocalIso } from "./dates";
import { Dialog } from "./Dialog";
import { DatePicker, TimeWheels } from "./Pickers";
import { noteOptions, Select } from "./Select";

/** Editar um evento, ou criar um novo no dia escolhido no calendário. */
export type EventFormInit = { event: CalEvent } | { day: Date };

type Props = { init: EventFormInit; notes: Note[]; onClose: () => void; onSaved: () => void };

export function EventForm({ init, notes, onClose, onSaved }: Props) {
  const editing = "event" in init ? init.event : null;
  const start = "event" in init
    ? new Date(init.event.starts_at)
    : new Date(init.day.getFullYear(), init.day.getMonth(), init.day.getDate(), 9);

  const [title, setTitle] = useState(editing?.title ?? "");
  const end = editing?.ends_at ? new Date(editing.ends_at) : null;
  const [day, setDay] = useState(start);
  const [allDay, setAllDay] = useState(editing?.all_day ?? false);
  const [from, setFrom] = useState({ h: start.getHours(), m: start.getMinutes() });
  const [hasEnd, setHasEnd] = useState(!!end);
  const [to, setTo] = useState(end ? { h: end.getHours(), m: end.getMinutes() } : { h: (start.getHours() + 1) % 24, m: start.getMinutes() });
  const [noteId, setNoteId] = useState(editing?.note_id ?? null);

  const at = (t: { h: number; m: number }) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.h, t.m);
  const startsAt = allDay ? at({ h: 0, m: 0 }) : at(from);
  const endsAt = !allDay && hasEnd ? at(to) : null;
  const problem =
    !title.trim() ? "Dê um título ao evento."
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

        <div className="fld">
          <span className="lbl">Data</span>
          <DatePicker label="Data" value={day} onChange={setDay} />
        </div>

        <button type="button" className="toggle-row" role="switch" aria-checked={allDay} onClick={() => setAllDay(!allDay)}>
          <span>Dia inteiro</span>
          <span className={`sw${allDay ? " is-on" : ""}`}><span className="knob" /></span>
        </button>

        {!allDay && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "start" }}>
            <div className="fld">
              <span className="lbl">Início</span>
              <TimeWheels label="Início" hours={from.h} minutes={from.m} onChange={(h, m) => setFrom({ h, m })} />
            </div>
            <div className="fld">
              <button type="button" className="toggle-row" role="switch" aria-checked={hasEnd} onClick={() => setHasEnd(!hasEnd)} style={{ height: 18, padding: 0 }}>
                <span className="lbl">Fim</span>
                <span className={`sw sw-sm${hasEnd ? " is-on" : ""}`}><span className="knob" /></span>
              </button>
              {hasEnd ? (
                <TimeWheels label="Fim" hours={to.h} minutes={to.m} onChange={(h, m) => setTo({ h, m })} />
              ) : (
                <p className="t2" style={{ margin: "70px 0 0", fontSize: 12, textAlign: "center" }}>Sem hora de fim</p>
              )}
            </div>
          </div>
        )}

        <div className="fld">
          <span className="lbl">Nota vinculada</span>
          <Select label="Nota vinculada" value={noteId ?? ""} onChange={(v) => setNoteId(v || null)} options={noteOptions(notes)} />
        </div>

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
