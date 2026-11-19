// Rodar com: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchHits, searchTerms } from "./searchHighlight.ts";

const marcado = (text, query) => searchHits(text, searchTerms(query)).map(([a, b]) => text.slice(a, b));

test("destaque da busca: começo de palavra, sem acento nem maiúscula, como a busca do SQLite", () => {
  assert.deepEqual(marcado("Orçamento dos monitores e do orçamento anual", "orcam"), ["Orçam", "orçam"]);
  assert.deepEqual(marcado("Reunião às 10h com a área", "reuniao area"), ["Reunião", "área"]);
  assert.deepEqual(marcado("a casa do pescador", "casa"), ["casa"]); // "pescador" não começa com "casa"
  assert.deepEqual(marcado("casamento e casa", "cas casa"), ["casa", "casa"]); // a palavra mais longa vence
  assert.deepEqual(marcado("d'água e e-mail", "agua mail"), ["água", "mail"]);
  assert.deepEqual(marcado("nada aqui", "   -- "), []);
});
