// Rodar com: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLabel, groupNotes, rowWhen, editorDate, reminderWhen, reminderGroup, quickDue, toLocalIso } from "./dates.ts";

const now = new Date(2026, 10, 18, 10, 40); // 18/11/2026 10:40
const at = (day, month = 10, h = 9, m = 5) => new Date(2026, month, day, h, m);

test("grupos por data", () => {
  assert.equal(groupLabel(at(18, 10, 0, 1), now), "Hoje");
  assert.equal(groupLabel(at(17, 10, 23, 59), now), "Ontem");
  assert.equal(groupLabel(at(12), now), "Últimos 7 dias");
  assert.equal(groupLabel(at(11), now), "Últimos 30 dias");
  assert.equal(groupLabel(at(19), now), "Hoje"); // data no futuro (relógio mudado) conta como hoje
  assert.equal(groupLabel(at(15, 9), now), "Outubro de 2026");
  assert.equal(groupLabel(new Date(2025, 11, 3), now), "Dezembro de 2025");
});

test("fixadas vêm primeiro e a ordem dentro do grupo é mantida", () => {
  const n = (id, d, pinned = false) => ({ id, pinned, updated_at: d.toISOString() });
  const groups = groupNotes([n("a", at(18)), n("b", at(17)), n("c", at(1), true), n("d", at(18, 10, 8))], now);
  assert.deepEqual(
    groups.map((g) => [g.label, g.notes.map((x) => x.id)]),
    [["Fixadas", ["c"]], ["Hoje", ["a", "d"]], ["Ontem", ["b"]]],
  );
});

test("textos de data", () => {
  assert.equal(rowWhen(at(18, 10, 8, 5), now), "08:05");
  assert.equal(rowWhen(at(17), now), "Ontem");
  assert.equal(rowWhen(at(4), now), "04/11");
  assert.equal(editorDate(at(18, 10, 10, 40)), "18 de novembro de 2026 às 10:40");
});

test("lembretes: textos, grupos e atalhos de data", () => {
  // 18/11/2026 é quarta-feira
  assert.equal(reminderWhen(at(18, 10, 16, 0), now), "Hoje, 16:00");
  assert.equal(reminderWhen(at(19, 10, 9, 0), now), "Amanhã, 09:00");
  assert.equal(reminderWhen(at(17, 10, 17, 0), now), "Ontem, 17:00");
  assert.equal(reminderWhen(at(20, 10, 10, 0), now), "Sex, 20/11 · 10:00");

  assert.equal(reminderGroup(at(18, 10, 9, 0), false, now), "Atrasados");
  assert.equal(reminderGroup(at(18, 10, 16, 0), false, now), "Hoje");
  assert.equal(reminderGroup(at(19, 10, 9, 0), false, now), "Programados");
  assert.equal(reminderGroup(at(17, 10, 9, 0), true, now), "Concluídos");

  assert.equal(quickDue("today", now).getTime(), at(18, 10, 18, 0).getTime());
  assert.equal(quickDue("tomorrow", now).getTime(), at(19, 10, 9, 0).getTime());
  assert.equal(quickDue("monday", now).getTime(), at(23, 10, 9, 0).getTime());
  // numa segunda, "próxima segunda" é a da semana seguinte
  assert.equal(quickDue("monday", at(23, 10, 8, 0)).getTime(), at(30, 10, 9, 0).getTime());

  const iso = toLocalIso(at(18, 10, 18, 0));
  assert.match(iso, /^2026-11-18T18:00:00[+-]\d\d:\d\d$/);
  assert.equal(new Date(iso).getTime(), at(18, 10, 18, 0).getTime());
});

test("agenda: grade do mês começa no domingo e fecha a última semana", async () => {
  const { monthGrid } = await import("./dates.ts");
  const nov = monthGrid(2026, 10); // 1º/11/2026 é domingo, 30 dias
  assert.equal(nov.length, 35);
  assert.equal(nov[0].getTime(), new Date(2026, 10, 1).getTime());
  assert.equal(nov[34].getTime(), new Date(2026, 11, 5).getTime());
  assert.equal(monthGrid(2026, 1).length, 28); // fevereiro de 2026 cabe em 4 semanas
  const ago = monthGrid(2026, 7); // 1º/08/2026 é sábado: 6 semanas
  assert.equal(ago.length, 42);
  assert.equal(ago[0].getTime(), new Date(2026, 6, 26).getTime());
});

test("agenda: compromissos do dia em ordem, dia inteiro primeiro", async () => {
  const { dayItems, dayKicker, dayTitle, monthName } = await import("./dates.ts");
  const iso = (d, h, m = 0) => new Date(2026, 10, d, h, m).toISOString();
  const events = [
    { id: "e1", title: "Reunião", starts_at: iso(18, 14), ends_at: iso(18, 15, 30), all_day: false },
    { id: "e2", title: "Feriado", starts_at: iso(18, 0), ends_at: null, all_day: true },
    { id: "e3", title: "Outro dia", starts_at: iso(19, 9), ends_at: null, all_day: false },
  ];
  const reminders = [{ id: "r1", title: "Pagar conta", due_at: iso(18, 9), snoozed_until: iso(18, 16), done: false }];
  const items = dayItems(new Date(2026, 10, 18), events, reminders);
  assert.deepEqual(items.map((i) => [i.title, i.time, i.end]), [
    ["Feriado", "Dia todo", null],
    ["Reunião", "14:00", "15:30"],
    ["Pagar conta", "16:00", null], // adiado: vale o horário do "adiar"
  ]);
  assert.equal(dayKicker(new Date(2026, 10, 18), now), "Quarta-feira · Hoje");
  assert.equal(dayKicker(new Date(2026, 10, 20), now), "Sexta-feira");
  assert.equal(dayTitle(new Date(2026, 10, 18)), "18 de novembro");
  assert.equal(monthName(new Date(2026, 10, 1)), "Novembro");
});
