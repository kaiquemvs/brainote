// Conteúdo da nota fora do editor: montar o documento e ler as linhas que os widgets mostram.
import type { JSONContent } from "@tiptap/core";

type NoteLike = { content_json: string | null; plain_text: string };

/** Documento TipTap da nota. Notas da Fase 1 só têm texto simples: cada linha vira um parágrafo. */
export function noteDoc(note: NoteLike): JSONContent {
  if (note.content_json) return JSON.parse(note.content_json);
  const lines = note.plain_text ? note.plain_text.split("\n") : [""];
  return { type: "doc", content: lines.map((t) => ({ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] })) };
}

/** Uma linha do post-it/checklist; `task.index` é a ordem do item entre os itens de checklist da nota. */
export type Line = { text: string; task?: { checked: boolean; index: number } };

const textOf = (n: JSONContent): string => n.text ?? (n.content ?? []).map(textOf).join("");

/** Parágrafos e títulos (sem linhas vazias), listas com "•" ou "1." e itens de checklist. */
export function noteLines(doc: JSONContent): Line[] {
  const lines: Line[] = [];
  let tasks = 0;
  const walk = (n: JSONContent, bullet = "•") => {
    switch (n.type) {
      case "taskItem":
        lines.push({ text: textOf(n), task: { checked: !!n.attrs?.checked, index: tasks++ } });
        return;
      case "listItem":
        lines.push({ text: `${bullet} ${textOf(n)}` });
        return;
      case "paragraph":
      case "heading": {
        const t = textOf(n);
        if (t.trim()) lines.push({ text: t });
        return;
      }
      case "orderedList":
        n.content?.forEach((c, i) => walk(c, `${(n.attrs?.start ?? 1) + i}.`));
        return;
      default:
        n.content?.forEach((c) => walk(c));
    }
  };
  walk(doc);
  return lines;
}

/** O mesmo documento com o item de checklist nº `index` marcado ou desmarcado. */
export function toggleTask(doc: JSONContent, index: number): JSONContent {
  let i = 0;
  const visit = (n: JSONContent): JSONContent => {
    if (n.type === "taskItem" && i++ === index) return { ...n, attrs: { ...n.attrs, checked: !n.attrs?.checked } };
    return n.content ? { ...n, content: n.content.map(visit) } : n;
  };
  return visit(doc);
}

// ---------- Exportar a nota (versão 1.1) ----------

type Mark = { type: string };
const MD_MARKS: Record<string, [string, string]> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  strike: ["~~", "~~"],
  underline: ["<u>", "</u>"], // Markdown não tem sublinhado
  highlight: ["<mark>", "</mark>"],
};

/**
 * Nota em Markdown (`plain = false`: títulos, listas, checklists "- [ ]" e negrito) ou em texto simples
 * (`plain = true`: o mesmo, sem marcações de formatação).
 * shortcut: não escapa caracteres do Markdown digitados na nota (ex. "*"); escapar se alguém reclamar.
 */
export function noteToText(title: string, doc: JSONContent, plain: boolean): string {
  const inline = (n: JSONContent): string => {
    if (n.type === "hardBreak") return plain ? "\n" : "  \n";
    if (n.text === undefined) return (n.content ?? []).map(inline).join("");
    if (plain) return n.text;
    return ((n.marks ?? []) as Mark[]).reduce((t, m) => (MD_MARKS[m.type] ? MD_MARKS[m.type][0] + t + MD_MARKS[m.type][1] : t), n.text);
  };
  const blocks: string[] = [];
  const list = (n: JSONContent, indent: string) => {
    (n.content ?? []).forEach((item, i) => {
      const [first, ...rest] = item.content ?? [];
      const mark =
        n.type === "taskList" ? (plain ? (item.attrs?.checked ? "[x]" : "[ ]") : item.attrs?.checked ? "- [x]" : "- [ ]")
        : n.type === "orderedList" ? `${(n.attrs?.start ?? 1) + i}.`
        : plain ? "•" : "-";
      blocks.push(`${indent}${mark} ${first ? inline(first) : ""}`);
      for (const sub of rest) list(sub, indent + "  "); // listas dentro de listas
    });
  };
  for (const n of doc.content ?? []) {
    if (n.type === "heading") blocks.push((plain ? "" : "#".repeat(n.attrs?.level ?? 2) + " ") + inline(n), "");
    else if (n.type === "paragraph") blocks.push(inline(n), "");
    else if (n.type?.endsWith("List")) {
      list(n, "");
      blocks.push("");
    }
  }
  const head = title.trim() || "Nova nota";
  return `${plain ? head : `# ${head}`}\n\n${blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
