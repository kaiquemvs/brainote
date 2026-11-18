// Tela de Agenda (docs/ESPECIFICACAO.md, 4.5): calendário do mês e painel do dia, no lugar da lista e do editor.
import { useState } from "react";
import type { CalEvent, Reminder } from "./api";
import { dayItems, dayKicker, dayTitle, isToday, monthGrid, monthName, type DayItem } from "./dates";
import { Icon, paths } from "./icons";
import { WindowButtons } from "./WindowButtons";

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

type Props = {
  events: CalEvent[];
  reminders: Reminder[];
  onNewEvent: (day: Date) => void;
  onEditEvent: (e: CalEvent) => void;
  onOpenReminder: (id: string) => void;
  sideOpen: boolean;
  onToggleSide: () => void;
};

export function Agenda(p: Props) {
  const now = new Date();
  const [selected, setSelected] = useState(now);
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));

  const shiftMonth = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const pick = (d: Date) => {
    setSelected(d);
    if (d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); // dia de outro mês
  };
  const goToday = () => pick(now);

  const items = dayItems(selected, p.events, p.reminders);
  const open = (it: DayItem) => {
    if (it.kind === "reminder") return p.onOpenReminder(it.id);
    const e = p.events.find((x) => x.id === it.id);
    if (e) p.onEditEvent(e);
  };

  return (
    <section className="pane edit" aria-label="Agenda">
      <div className="bar" data-tauri-drag-region style={{ gap: 8, paddingLeft: 10 }}>
        <button className="btn-ic" aria-label="Mostrar ou ocultar a barra lateral" aria-expanded={p.sideOpen} onClick={p.onToggleSide}>
          <Icon size={18}>{paths.sidebar}</Icon>
        </button>
        <button className="btn-soft" onClick={goToday}>Hoje</button>
        <button className="btn-ic" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}>
          <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon size={18}>{paths.chevron}</Icon></span>
        </button>
        <button className="btn-ic" aria-label="Próximo mês" onClick={() => shiftMonth(1)}>
          <Icon size={18}>{paths.chevron}</Icon>
        </button>
        <span className="grow" data-tauri-drag-region />
        <button className="btn-acc" onClick={() => p.onNewEvent(selected)}>
          <Icon size={15}>{paths.plus}</Icon>
          Novo evento
        </button>
        <WindowButtons />
      </div>

      <div className="pane-scroll" style={{ padding: "4px 28px 28px", display: "flex", flexWrap: "wrap", alignContent: "flex-start", gap: 28 }}>
        <div style={{ flex: "999 1 380px", minWidth: 0 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }} aria-live="polite">
            {monthName(month)} <span className="t2" style={{ fontWeight: 500 }}>{month.getFullYear()}</span>
          </h2>
          <div className="cal" style={{ marginBottom: 4 }}>
            {WEEK.map((w) => <span key={w} className="t2 wk">{w}</span>)}
          </div>
          <div className="cal">
            {monthGrid(month.getFullYear(), month.getMonth()).map((d) => {
              const out = d.getMonth() !== month.getMonth();
              const has = dayItems(d, p.events, p.reminders).length > 0;
              const sel = sameDay(d, selected);
              return (
                <button
                  key={d.toDateString()}
                  className={`day${out ? " is-out" : ""}${isToday(d, now) ? " is-today" : ""}${sel ? " is-sel" : ""}`}
                  aria-label={`${dayTitle(d)}${has ? ", com compromissos" : ""}`}
                  aria-pressed={sel}
                  onClick={() => pick(d)}
                >
                  <span className="num">{d.getDate()}</span>
                  {has && <span className="ev-dot" />}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ borderRadius: 16, background: "var(--card)", padding: "18px 18px 8px" }}>
            <p className="lbl" style={{ margin: "0 0 4px", color: "var(--acc)" }}>{dayKicker(selected, now)}</p>
            <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700 }}>{dayTitle(selected)}</h3>
            {items.map((it) => (
              <button key={`${it.kind}-${it.id}`} className="ag-row" onClick={() => open(it)}>
                <span className="t2 ag-row-t">{it.time}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className={`chk-t${it.done ? " is-done" : ""}`} style={{ display: "block", fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
                    {it.title}
                  </span>
                  {it.end && <span className="t2" style={{ display: "block", fontSize: 12 }}>{it.time} – {it.end}</span>}
                  <span className={`badge${it.kind === "reminder" ? " is-rem" : ""}`}>
                    {it.kind === "event" ? "Evento" : it.done ? "Lembrete concluído" : "Lembrete"}
                  </span>
                </span>
              </button>
            ))}
            {items.length === 0 && (
              <p className="t2" style={{ margin: 0, padding: "12px 0 14px", borderTop: "1px solid var(--sep)", fontSize: 13 }}>
                Nenhum compromisso neste dia.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
