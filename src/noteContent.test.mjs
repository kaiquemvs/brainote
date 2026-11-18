// Rodar com: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { noteDoc, noteLines, toggleTask } from "./noteContent.ts";

const p = (text) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
const task = (text, checked) => ({ type: "taskItem", attrs: { checked }, content: [p(text)] });
const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Pauta" }] },
    p(""),
    { type: "bulletList", content: [{ type: "listItem", content: [p("monitores")] }] },
    { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [p("um")] }, { type: "listItem", content: [p("dois")] }] },
    { type: "taskList", content: [task("café", true), task("pão", false)] },
    p("fim"),
  ],
};

test("linhas do widget: títulos, listas e itens de checklist em ordem", () => {
  assert.deepEqual(noteLines(doc), [
    { text: "Pauta" },
    { text: "• monitores" },
    { text: "1. um" },
    { text: "2. dois" },
    { text: "café", task: { checked: true, index: 0 } },
    { text: "pão", task: { checked: false, index: 1 } },
    { text: "fim" },
  ]);
});

test("marcar no widget muda só o item escolhido", () => {
  const novo = toggleTask(doc, 1);
  assert.deepEqual(noteLines(novo).filter((l) => l.task).map((l) => l.task.checked), [true, true]);
  assert.equal(noteLines(doc)[5].task.checked, false); // o original não é alterado
});

test("nota da Fase 1 (só texto) vira parágrafos", () => {
  assert.deepEqual(noteLines(noteDoc({ content_json: null, plain_text: "a\n\nb" })), [{ text: "a" }, { text: "b" }]);
});
