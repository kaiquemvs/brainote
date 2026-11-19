// Criar ou editar lembrete (docs/ESPECIFICACAO.md, 4.6 e 13 — versão 1.1), pelo sino do editor ou pela tela de Lembretes:
// data no calendário, hora nas rodas e repetição por dias da semana, mensal ou anual.
import { useState } from "react";
import { api, type Note, type Reminder } from "./api";
import { alignToWeekdays, repeatLabel, toLocalIso, weeklyDays } from "./dates";
import { Dialog } from "./Dialog";
import { DatePicker, TimeWheels } from "./Pickers";
import { noteOptions, Select } from "./Select";

/** Editar um lembrete, ou criar um novo (opcionalmente já ligado a uma nota). */
export type ReminderFormInit = { reminder: Reminder } | { noteId: string | null; title: string };

const DAYS = [
  ["D", "domingo"],
  ["S", "segunda-feira"],
  ["T", "terça-feira"],
  ["Q", "quarta-feira"],
  ["Q", "quinta-feira"],
  ["S", "sexta-feira"],
  ["S", "sábado"],
];

type Props = { init: ReminderFormInit; notes: Note[]; onClose: () => void; onSaved: () => void };

export function ReminderForm({ init, notes, onClose, onSaved }: Props) {
  const editing = "reminder" in init ? init.reminder : null;
  // novo lembrete: próxima hora cheia (19:12 → 20:00)
  const start = editing ? new Date(editing.snoozed_until ?? editing.due_at) : new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000);

  const [title, setTitle] = useState("reminder" in init ? init.reminder.title : init.title);
  const [day, setDay] = useState(start);
  const [time, setTime] = useState({ h: start.getHours(), m: start.getMinutes() });
  const [repeat, setRepeat] = useState(editing?.repeat ?? "none");
  const [noteId, setNoteId] = useState(editing ? editing.note_id : "noteId" in init ? init.noteId : null);

  const days = weeklyDays(repeat);
  const chosen = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.h, time.m);
  const due = alignToWeekdays(chosen, days); // repete só em certos dias: começa no primeiro dia marcado
  const valid = title.trim() !== "";

  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    setRepeat(next.length ? `weekly:${next.join(",")}` : "none");
  };
  const toggleMode = (mode: "monthly" | "yearly") => setRepeat(repeat === mode ? "none" : mode);

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

        <div className="fld">
          <span className="lbl">Quando</span>
          <DatePicker label="Data" value={day} onChange={setDay} />
          <TimeWheels label="Hora" hours={time.h} minutes={time.m} onChange={(h, m) => setTime({ h, m })} />
        </div>

        <div className="fld rep">
          <div className="rep-head">
            <span className="lbl">Repetir</span>
            <span className="t2" aria-live="polite">{repeatLabel(repeat, due)}</span>
          </div>
          <div className="rep-days" role="group" aria-label="Repetir nos dias da semana">
            {DAYS.map(([letter, name], d) => (
              <button
                key={d}
                type="button"
                className={`rep-day${days.includes(d) ? " is-on" : ""}`}
                aria-label={name}
                aria-pressed={days.includes(d)}
                onClick={() => toggleDay(d)}
              >
                {letter}
              </button>
            ))}
          </div>
          <div className="picks">
            <button type="button" className={`pick${repeat === "monthly" ? " is-on" : ""}`} aria-pressed={repeat === "monthly"} onClick={() => toggleMode("monthly")}>
              Mensal · dia {chosen.getDate()}
            </button>
            <button type="button" className={`pick${repeat === "yearly" ? " is-on" : ""}`} aria-pressed={repeat === "yearly"} onClick={() => toggleMode("yearly")}>
              Anual · {repeatLabel("yearly", chosen).replace("Todo ", "")}
            </button>
          </div>
        </div>

        <div className="fld">
          <span className="lbl">Nota vinculada</span>
          <Select label="Nota vinculada" value={noteId ?? ""} onChange={(v) => setNoteId(v || null)} options={noteOptions(notes)} />
        </div>

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
