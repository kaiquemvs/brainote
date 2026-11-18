// Rodar com: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLabel, groupNotes, rowWhen, editorDate } from "./dates.ts";

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
