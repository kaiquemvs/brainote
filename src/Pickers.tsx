// Seletores de data e hora dos formulários de lembrete e de evento (docs/ESPECIFICACAO.md, 13 — versão 1.1):
// calendário em popover e "rodas" de horas e minutos no estilo do relógio do iPhone.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { dayTitle, monthGrid, monthName } from "./dates";
import { Icon, paths } from "./icons";

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const weekdayLong = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate(); // 31/01 + 1 mês = 28/02
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
};

/** Campo de data que abre um calendário (setas mudam o mês; teclado: setas, PageUp/PageDown, Enter, Esc). */
export function DatePicker({ value, onChange, label }: { value: Date; onChange: (d: Date) => void; label: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(value); // dia marcado pelo teclado
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const today = new Date();

  const show = () => {
    const r = btn.current!.getBoundingClientRect();
    const [w, h] = [292, 318];
    setPos({
      left: Math.max(8, Math.min(r.left, innerWidth - w - 8)),
      top: innerHeight - r.bottom >= h + 8 ? r.bottom + 4 : Math.max(8, r.top - h - 4),
    });
    setFocus(value);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const pick = (d: Date) => {
    onChange(d);
    close();
  };

  useEffect(() => {
    if (!open) return;
    pop.current?.focus();
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const shut = () => close(false);
    addEventListener("mousedown", outside);
    addEventListener("resize", shut);
    return () => {
      removeEventListener("mousedown", outside);
      removeEventListener("resize", shut);
    };
  }, [open]);

  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
    };
    if (moves[e.key]) setFocus(moves[e.key]());
    else if (e.key === "Enter" || e.key === " ") pick(focus);
    else if (e.key === "Escape") close();
    else if (e.key === "Tab") return close();
    else return;
    e.preventDefault();
    e.stopPropagation(); // o Esc fecha só o calendário, não o formulário
  };

  const host = (btn.current?.closest(".app") as HTMLElement | null) ?? document.body;

  return (
    <>
      <button ref={btn} type="button" className="inp sel-btn" aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${dayTitle(value)} de ${value.getFullYear()}`} onClick={() => (open ? close() : show())}>
        <span>{dayTitle(value)} de {value.getFullYear()}</span>
        <span className="sel-chev"><Icon size={14}>{paths.chevron}</Icon></span>
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="dp" data-popup role="dialog" aria-label={`Escolher ${label.toLowerCase()}`} tabIndex={-1} style={pos} onKeyDown={onKey}>
            <div className="dp-head">
              <span aria-live="polite">{dayTitle(focus)}, {weekdayLong.format(focus)}</span>
              <span style={{ display: "flex" }}>
                <button type="button" className="btn-ic dp-nav" aria-label="Mês anterior" onClick={() => setFocus(addMonths(focus, -1))}>
                  <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon size={16}>{paths.chevron}</Icon></span>
                </button>
                <button type="button" className="btn-ic dp-nav" aria-label="Próximo mês" onClick={() => setFocus(addMonths(focus, 1))}>
                  <Icon size={16}>{paths.chevron}</Icon>
                </button>
              </span>
            </div>
            <p className="t2 dp-month">{monthName(focus)} de {focus.getFullYear()}</p>
            <div className="dp-grid">
              {WEEK.map((w) => <span key={w} className="dp-wk">{w}</span>)}
              {monthGrid(focus.getFullYear(), focus.getMonth()).map((d) =>
                d.getMonth() !== focus.getMonth() ? (
                  <span key={d.toDateString()} />
                ) : (
                  <button
                    key={d.toDateString()}
                    type="button"
                    tabIndex={-1}
                    className={`dp-day${sameDay(d, value) ? " is-sel" : ""}${sameDay(d, today) ? " is-today" : ""}${sameDay(d, focus) ? " is-focus" : ""}`}
                    aria-label={`${dayTitle(d)} de ${d.getFullYear()}`}
                    aria-pressed={sameDay(d, value)}
                    onClick={() => pick(d)}
                  >
                    {d.getDate()}
                  </button>
                ),
              )}
            </div>
          </div>,
          host,
        )}
    </>
  );
}

const ROW = 36; // altura de cada número da roda
const VISIBLE = 5; // números à mostra; o do meio é o escolhido

/** Roda de números (horas ou minutos): roda do mouse anda 1 por "clique"; setas, PageUp/PageDown e clique também. */
export function Wheel({ value, count, onChange, label }: { value: number; count: number; onChange: (v: number) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const clamp = (v: number) => Math.max(0, Math.min(count - 1, v));

  // listener próprio: o onWheel do React é "passivo" e não deixa impedir a rolagem do formulário
  useEffect(() => {
    let acc = 0;
    const step = (dir: number) => latest.current.onChange(clamp(latest.current.value + dir));
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // em linhas → pixels
      if (Math.abs(dy) >= 50) {
        acc = 0;
        step(Math.sign(dy)); // um "clique" da roda do mouse = 1 número
      } else if (Math.abs((acc += dy)) >= 50) {
        step(Math.sign(acc)); // touchpad: movimentos pequenos somam até 1 passo
        acc = 0;
      }
    };
    const el = box.current!;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [count]);

  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
    if (step !== undefined) onChange(clamp(value + step));
    else if (e.key === "Home") onChange(0);
    else if (e.key === "End") onChange(count - 1);
    else return;
    e.preventDefault();
  };

  const two = (n: number) => String(n).padStart(2, "0");
  return (
    <div
      ref={box}
      className="wheel"
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuenow={value}
      aria-valuetext={two(value)}
      onKeyDown={onKey}
      style={{ height: ROW * VISIBLE }}
    >
      <div className="wheel-list" style={{ transform: `translateY(${(Math.floor(VISIBLE / 2) - value) * ROW}px)` }}>
        {Array.from({ length: count }, (_, i) => {
          const far = Math.abs(i - value);
          return (
            <div
              key={i}
              className={`wheel-n${i === value ? " is-on" : ""}`}
              style={{ height: ROW, opacity: far > 2 ? 0 : 1 - far * 0.32 }}
              aria-hidden="true"
              onClick={() => onChange(i)}
            >
              {two(i)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Horas e minutos lado a lado, com a faixa de seleção no meio (como no relógio do iPhone). */
export function TimeWheels({ hours, minutes, onChange, label }: { hours: number; minutes: number; onChange: (h: number, m: number) => void; label: string }) {
  return (
    <div className="wheels" role="group" aria-label={label}>
      <div className="wheels-band" style={{ top: ROW * Math.floor(VISIBLE / 2), height: ROW }} aria-hidden="true" />
      <Wheel label={`${label}: horas`} value={hours} count={24} onChange={(h) => onChange(h, minutes)} />
      <span className="wheels-sep" aria-hidden="true">:</span>
      <Wheel label={`${label}: minutos`} value={minutes} count={60} onChange={(m) => onChange(hours, m)} />
    </div>
  );
}
