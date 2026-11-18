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
