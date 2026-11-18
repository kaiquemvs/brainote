// Datas da lista e do editor (docs/ESPECIFICACAO.md, 4.3 e 4.4). Sem dependências, para o teste rodar direto no Node.

const DAY = 86_400_000;

/** Quantos dias de calendário separam `d` de `now` (0 = hoje, 1 = ontem). */
function daysAgo(d: Date, now: Date): number {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(now) - start(d)) / DAY);
}

const two = (n: number) => String(n).padStart(2, "0");
const time = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const month = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const longDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });

/** Grupo da lista: Hoje, Ontem, Últimos 7 dias, Últimos 30 dias ou "Outubro de 2026". */
export function groupLabel(d: Date, now: Date): string {
  const n = daysAgo(d, now);
  if (n <= 0) return "Hoje";
  if (n === 1) return "Ontem";
  if (n < 7) return "Últimos 7 dias";
  if (n < 30) return "Últimos 30 dias";
  const m = month.format(d);
  return m[0].toUpperCase() + m.slice(1);
}

/** Notas já ordenadas da mais recente para a mais antiga, agrupadas; "Fixadas" sempre primeiro. */
export function groupNotes<T extends { pinned: boolean; updated_at: string }>(notes: T[], now: Date) {
  const groups: { label: string; notes: T[] }[] = [];
  for (const n of notes) {
    const label = n.pinned ? "Fixadas" : groupLabel(new Date(n.updated_at), now);
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, notes: [] }));
    g.notes.push(n);
  }
  return groups.sort((a, b) => Number(b.label === "Fixadas") - Number(a.label === "Fixadas"));
}

/** Na linha da lista: "10:40" se for hoje, "Ontem" ou "14/11". */
export function rowWhen(d: Date, now: Date): string {
  const n = daysAgo(d, now);
  if (n <= 0) return time(d);
  if (n === 1) return "Ontem";
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}`;
}

/** No topo do editor: "18 de novembro de 2026 às 10:40". */
export function editorDate(d: Date): string {
  return `${longDate.format(d)} às ${time(d)}`;
}

// ---------- Lembretes (4.6) ----------

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** "Hoje, 16:00", "Amanhã, 09:00", "Ontem, 17:00" ou "Sex, 20/11 · 10:00". */
export function reminderWhen(d: Date, now: Date): string {
  const n = daysAgo(d, now);
  if (n === 0) return `Hoje, ${time(d)}`;
  if (n === -1) return `Amanhã, ${time(d)}`;
  if (n === 1) return `Ontem, ${time(d)}`;
  return `${WEEK[d.getDay()]}, ${two(d.getDate())}/${two(d.getMonth() + 1)} · ${time(d)}`;
}

export const isToday = (d: Date, now: Date) => daysAgo(d, now) === 0;

export const REMINDER_GROUPS = ["Atrasados", "Hoje", "Programados", "Concluídos"] as const;

export function reminderGroup(when: Date, done: boolean, now: Date): (typeof REMINDER_GROUPS)[number] {
  if (done) return "Concluídos";
  if (when < now) return "Atrasados";
  return daysAgo(when, now) === 0 ? "Hoje" : "Programados";
}

/** Atalhos do formulário: Hoje 18:00, Amanhã 09:00 e Próxima segunda 09:00 (numa segunda, a da semana que vem). */
export function quickDue(kind: "today" | "tomorrow" | "monday", now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), kind === "today" ? 18 : 9);
  if (kind === "tomorrow") d.setDate(d.getDate() + 1);
  if (kind === "monday") d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
}

/** Como o banco guarda: hora local com fuso, ex. "2026-11-18T18:00:00-03:00". */
export function toLocalIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const a = Math.abs(off);
  const zone = `${off >= 0 ? "+" : "-"}${two(Math.floor(a / 60))}:${two(a % 60)}`;
  return `${dateInput(d)}T${time(d)}:${two(d.getSeconds())}${zone}`;
}

/** Valor para <input type="date">: "2026-11-18". */
export function dateInput(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** Valor para <input type="time">: "09:05". */
export const timeInput = time;

// ---------- Agenda (4.5) ----------

/** Dias da grade, de domingo a sábado: do domingo antes do dia 1 até o sábado depois do último dia. */
export function monthGrid(year: number, month: number): Date[] {
  const offset = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((offset + days) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => new Date(year, month, 1 - offset + i));
}

export type DayItem = {
  id: string;
  kind: "event" | "reminder";
  title: string;
  /** "09:00" ou "Dia todo" */
  time: string;
  /** hora de fim do evento, se houver */
  end: string | null;
  done: boolean;
  at: Date;
  allDay: boolean;
};

type EventLike = { id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean };
type ReminderLike = { id: string; title: string; due_at: string; snoozed_until: string | null; done: boolean };

/** Eventos e lembretes de um dia: os de dia inteiro primeiro, depois por horário. */
export function dayItems(day: Date, events: EventLike[], reminders: ReminderLike[]): DayItem[] {
  const items: DayItem[] = [];
  for (const e of events) {
    const at = new Date(e.starts_at);
    if (daysAgo(at, day) !== 0) continue;
    const end = e.ends_at && !e.all_day ? time(new Date(e.ends_at)) : null;
    items.push({ id: e.id, kind: "event", title: e.title, time: e.all_day ? "Dia todo" : time(at), end, done: false, at, allDay: e.all_day });
  }
  for (const r of reminders) {
    const at = new Date(r.snoozed_until ?? r.due_at);
    if (daysAgo(at, day) !== 0) continue;
    items.push({ id: r.id, kind: "reminder", title: r.title, time: time(at), end: null, done: r.done, at, allDay: false });
  }
  return items.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.at.getTime() - b.at.getTime());
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const weekdayLong = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });
const monthOnly = new Intl.DateTimeFormat("pt-BR", { month: "long" });

/** "Quarta-feira · Hoje" ou "Sexta-feira". */
export const dayKicker = (d: Date, now: Date) => cap(weekdayLong.format(d)) + (isToday(d, now) ? " · Hoje" : "");
/** "18 de novembro". */
export const dayTitle = (d: Date) => dayMonth.format(d);
/** "Novembro". */
export const monthName = (d: Date) => cap(monthOnly.format(d));
