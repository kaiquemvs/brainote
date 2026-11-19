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

test("exportar: Markdown com títulos, formatação, listas e checklist; texto simples sem marcações", async () => {
  const { noteToText } = await import("./noteContent.ts");
  const t = (text, marks) => ({ type: "text", text, ...(marks && { marks: marks.map((type) => ({ type })) }) });
  const nota = {
    type: "doc",
    content: [
      { type: "paragraph", content: [t("Texto "), t("forte", ["bold"]), t(" e "), t("marcado", ["highlight"])] },
      { type: "heading", attrs: { level: 3 }, content: [t("Tarefas")] },
      { type: "taskList", content: [task("café", true), task("pão", false)] },
      { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [p("um")] }] },
    ],
  };
  assert.equal(noteToText("Mercado", nota, false), "# Mercado\n\nTexto **forte** e <mark>marcado</mark>\n\n### Tarefas\n\n- [x] café\n- [ ] pão\n\n1. um\n");
  assert.equal(noteToText("", nota, true), "Nova nota\n\nTexto forte e marcado\n\nTarefas\n\n[x] café\n[ ] pão\n\n1. um\n");
});

test("imagens e anexos: post-it, nomes sem repetir e exportação com a pasta de anexos", async () => {
  const { noteFiles, noteToText } = await import("./noteContent.ts");
  const img = (id, alt) => ({ type: "image", attrs: { src: `anexo:${id}`, alt } });
  const doc = {
    type: "doc",
    content: [
      p("Fotos"),
      img("a1", "image.png"),
      img("a2", "image.png"), // dois prints colados com o mesmo nome
      { type: "attachment", attrs: { id: "b1", name: "contrato.pdf", size: 2048 } },
    ],
  };
  assert.deepEqual(noteLines(doc), [
    { text: "Fotos" },
    { text: "image.png", image: "http://anexo.localhost/a1" },
    { text: "image.png", image: "http://anexo.localhost/a2" },
    { text: "📎 contrato.pdf" },
  ]);
  assert.deepEqual(noteFiles(doc), [
    { id: "a1", file: "image.png" },
    { id: "a2", file: "image (2).png" },
    { id: "b1", file: "contrato.pdf" },
  ]);
  const md = noteToText("Viagem", doc, false);
  assert.match(md, /!\[image\.png\]\(<\{\{ANEXOS\}\}\/image \(2\)\.png>\)/);
  assert.match(md, /\[📎 contrato\.pdf\]\(<\{\{ANEXOS\}\}\/contrato\.pdf>\)/);
  assert.ok(noteToText("Viagem", doc, true).includes(String.raw`[anexo: {{ANEXOS}}\contrato.pdf]`));
});

test("tabela: uma linha por linha no post-it; tabela Markdown na exportação", async () => {
  const { noteToText } = await import("./noteContent.ts");
  const cell = (type, text) => ({ type, content: [p(text)] });
  const doc = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          { type: "tableRow", content: [cell("tableHeader", "Item"), cell("tableHeader", "Preço")] },
          { type: "tableRow", content: [cell("tableCell", "Monitor"), cell("tableCell", "R$ 900 | à vista")] },
        ],
      },
    ],
  };
  assert.deepEqual(noteLines(doc), [{ text: "Item | Preço" }, { text: "Monitor | R$ 900 | à vista" }]);
  assert.equal(noteToText("Compras", doc, false), "# Compras\n\n| Item | Preço |\n| --- | --- |\n| Monitor | R$ 900 \\| à vista |\n");
  assert.equal(noteToText("Compras", doc, true), "Compras\n\nItem | Preço\nMonitor | R$ 900 | à vista\n");
});
