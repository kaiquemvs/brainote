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
