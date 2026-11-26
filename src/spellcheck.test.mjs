// Rodar com: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { wordsIn } from "./spellcheck.ts";

test("corretor: separa palavras e pula links, e-mails, siglas e letras soltas", () => {
  const text = "Reunião às 9h com o TI: ver https://exemplo.com/caza e mail@exemplo.com, d'água e bem-vindo.";
  assert.deepEqual(wordsIn(text).map((w) => w.word), ["Reunião", "às", "com", "ver", "d'água", "bem-vindo"]);
  // a posição aponta para a palavra certa no texto original
  for (const { word, at } of wordsIn(text)) assert.equal(text.slice(at, at + word.length), word);
});

test("corretor: palavra recém-digitada para a correção automática", async () => {
  const { wordBefore } = await import("./spellcheck.ts");
  assert.equal(wordBefore("Reunião com voce"), "voce");
  assert.equal(wordBefore("ver https://exemplo.com/caza"), null); // link
  assert.equal(wordBefore("às 10h30"), null); // hora
  assert.equal(wordBefore("bem-vindo"), "bem-vindo");
  assert.equal(wordBefore("TI"), null); // sigla não é conferida
  assert.equal(wordBefore(""), null);
});
