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
