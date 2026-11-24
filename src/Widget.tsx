// Janela de widget na área de trabalho (docs/ESPECIFICACAO.md, 5): post-it, checklist ou agenda de hoje.
import { useEffect, useState, type MouseEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type Appearance, type CalEvent, type Note, type Reminder, type Widget } from "./api";
import { dayItems } from "./dates";
import { Icon, paths } from "./icons";
import { noteDoc, noteLines, toggleTask, type Line } from "./noteContent";

const COLORS = ["amarelo", "verde", "rosa", "azul"];
const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const month = new Intl.DateTimeFormat("pt-BR", { month: "long" });

export function WidgetApp({ id, initialLook }: { id: string; initialLook: Appearance }) {
  const [look, setLook] = useState(initialLook);
  const [w, setW] = useState<Widget | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [, setTick] = useState(0);

  // Cada widget busca só o que mostra (roda a cada gravação no app): a nota dele, ou lembretes e eventos.
  const load = async () => {
    const wd = await api.getWidget(id);
    setW(wd);
    if (wd?.note_id) return setNote(await api.getNote(wd.note_id));
    const [r, e] = await Promise.all([api.listReminders(), api.listEvents()]);
    setEvents(e);
    setReminders(r);
  };

  useEffect(() => {
    load();
    const offs = [listen("data-changed", load), listen<Appearance>("appearance-changed", (e) => setLook(e.payload))];
    const t = setInterval(() => setTick((x) => x + 1), 60_000); // a agenda de hoje muda com o relógio
    return () => {
      offs.forEach((off) => off.then((f) => f()));
      clearInterval(t);
    };
  }, []);

  // Tema na raiz: as cores do post-it (.t-light .pc-amarelo) valem para o widget e para as bolinhas.
  // O post-it fica sempre com as cores claras, como um papel de verdade (pedido do usuário).
  const theme = w?.kind === "postit" ? "light" : look.theme;
  useEffect(() => {
    document.documentElement.className = `t-${theme}${look.glass ? " g-on" : ""}`;
  }, [theme, look.glass]);

  if (!w) return null;
  const lines = note ? noteLines(noteDoc(note)) : [];
  const title = note && (note.title.trim() || "Nova nota");

  const menu = (e: MouseEvent) => {
    e.preventDefault();
    api.widgetMenu();
  };
  const toggle = (index: number) =>
    note && api.updateNote(note.id, note.title, JSON.stringify(toggleTask(noteDoc(note), index)), note.plain_text);

  const close = (
    <button className="w-x" aria-label="Remover widget" onClick={() => api.deleteWidget(w.id)}>
      <Icon size={14}>{paths.x}</Icon>
    </button>
  );
  const item = (l: Line, i: number) =>
    l.task ? (
      <div key={i} className="w-item">
        <button
          className={`chk chk-sm${l.task.checked ? " is-done" : ""}`}
          aria-pressed={l.task.checked}
          aria-label={`${l.task.checked ? "Desmarcar" : "Concluir"}: ${l.text}`}
          onClick={() => toggle(l.task!.index)}
        >
          <svg className="i i-b" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">{paths.check}</svg>
        </button>
        <span className={`chk-t${l.task.checked ? " is-done" : ""}`}>{l.text}</span>
      </div>
    ) : l.image ? (
      <img key={i} className="w-img" src={l.image} alt={l.text} />
    ) : (
      <p key={i} className="w-line">{l.text}</p>
    );
  const gone = <p className="w-line t2">Esta nota foi apagada.</p>;

  if (w.kind === "postit") {
    return (
      <div className={`wg postit pc-${w.color}`} onContextMenu={menu} onDoubleClick={() => note && api.openNote(note.id)}>
        <div className="w-top" data-tauri-drag-region>
          {COLORS.map((c) => (
            <button
              key={c}
              className={`dot pc-${c}${w.color === c ? " is-on" : ""}`}
              aria-label={`Cor do post-it: ${c}`}
              aria-pressed={w.color === c}
              onClick={() => api.setWidgetColor(w.id, c)}
            />
          ))}
          <span className="grow" data-tauri-drag-region />
          {close}
        </div>
        <div className="w-body">
          {note ? <><p className="w-title">{title}</p>{lines.slice(0, 8).map(item)}</> : gone}
        </div>
      </div>
    );
  }

  if (w.kind === "checklist") {
    const tasks = lines.filter((l) => l.task);
    const done = tasks.filter((l) => l.task!.checked).length;
    return (
      <div className="wg" onContextMenu={menu}>
        <div className="w-top" data-tauri-drag-region>
          <span className="lbl" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--acc)" }} data-tauri-drag-region>
            <Icon size={15}>{paths.checklist}</Icon>
            Checklist
          </span>
          <span className="grow" data-tauri-drag-region />
          {close}
        </div>
        {note ? (
          <>
            <p className="w-title" style={{ fontSize: 16, marginBottom: 2 }}>{title}</p>
            <p className="t2" style={{ margin: "0 0 10px", fontSize: 12 }}>{done} de {tasks.length} concluídas</p>
            <div className="prog"><span style={{ width: `${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%` }} /></div>
            <div className="w-scroll">{tasks.map(item)}</div>
          </>
        ) : gone}
      </div>
    );
  }

  // Agenda de hoje: os próximos eventos e lembretes do dia (os de dia inteiro ficam até o fim do dia).
  const now = new Date();
  const next = dayItems(now, events, reminders).filter((i) => !i.done && (i.allDay || i.at >= now)).slice(0, 4);
  const wd = weekday.format(now);
  return (
    <div className="wg" onContextMenu={menu}>
      <div className="w-top" data-tauri-drag-region>
        <span className="grow" data-tauri-drag-region />
        {close}
      </div>
      <div className="ag-head" data-tauri-drag-region>
        <span className="ag-day">{now.getDate()}</span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, pointerEvents: "none" }}>
          <span className="lbl" style={{ color: "var(--acc)" }}>{wd[0].toUpperCase() + wd.slice(1)}</span>
          <span className="t2" style={{ fontSize: 13 }}>{month.format(now)}</span>
        </span>
      </div>
      <div className="w-scroll">
        {next.map((it) => (
          <div key={`${it.kind}-${it.id}`} className="ag-item">
            <span className="t2 ag-time">{it.time}</span>
            <span>{it.title}</span>
          </div>
        ))}
        {next.length === 0 && <p className="t2 ag-empty">Nada mais para hoje.</p>}
      </div>
    </div>
  );
}
