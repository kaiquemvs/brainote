// Imagens e anexos dentro da nota (docs/ESPECIFICACAO.md, 13 — versão 1.2). Os arquivos ficam em
// %APPDATA%\brainote\anexos (src-tauri/src/attachments.rs); a nota guarda só o id de cada um.
import { Node, type Editor, type JSONContent } from "@tiptap/core";
import FileHandler from "@tiptap/extension-file-handler";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { api, type Attached } from "./api";
import { Icon, paths } from "./icons";
import { menuAt, type MenuState } from "./Menu";
import { ANEXO_URL, anexoUrl } from "./noteContent";

const MAX_BYTES = 100 * 1024 * 1024; // o mesmo limite do Rust; aqui evita mandar o arquivo à toa

/** Imagem: no documento o endereço é "anexo:<id>"; na tela vira http://anexo.localhost/<id>. */
export const Picture = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute("src")?.replace(ANEXO_URL, "anexo:"),
        renderHTML: (attrs) => ({ src: anexoUrl(attrs.src) }),
      },
    };
  },
  // só imagens do próprio brainote: colar um trecho de site não puxa imagens da internet
  parseHTML: () => [{ tag: `img[src^="${ANEXO_URL}"]` }],
}).configure({
  // arrastar o canto de baixo muda o tamanho, sem distorcer
  resize: { enabled: true, directions: ["bottom-right", "bottom-left"], minWidth: 60, minHeight: 40, alwaysPreserveAspectRatio: true },
});

const size = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

type AttachmentOptions = { openMenu: (m: MenuState) => void };

/** Cartão do anexo: clicar abre no programa padrão; botão direito: Abrir, Salvar como…, Remover. */
function AttachmentCard({ node, deleteNode, extension }: ReactNodeViewProps) {
  const { id, name } = node.attrs as { id: string; name: string };
  const open = () => api.openAttachment(id);
  return (
    <NodeViewWrapper className="att-wrap" contentEditable={false}>
      <button
        type="button"
        className="att"
        title="Abrir no programa padrão"
        onClick={open}
        onContextMenu={(e) => {
          e.stopPropagation();
          (extension.options as AttachmentOptions).openMenu({
            ...menuAt(e),
            items: [
              { label: "Abrir", onSelect: open },
              { label: "Salvar como…", onSelect: () => api.saveAttachmentAs(id) },
              { label: "Remover", onSelect: deleteNode },
            ],
          });
        }}
      >
        <Icon size={20}>{paths.file}</Icon>
        <span className="att-n">{name}</span>
        <span className="att-s t2">{size(node.attrs.size)}</span>
      </button>
    </NodeViewWrapper>
  );
}

export const Attachment = Node.create<AttachmentOptions>({
  name: "attachment",
  group: "block",
  atom: true,
  draggable: true,
  addOptions: () => ({ openMenu: () => {} }),
  addAttributes: () => ({ id: { default: null }, name: { default: "arquivo" }, size: { default: 0 } }),
  parseHTML: () => [
    {
      tag: "div[data-anexo]",
      getAttrs: (el) => ({ id: el.dataset.anexo, name: el.dataset.name, size: Number(el.dataset.size) || 0 }),
    },
  ],
  renderHTML: ({ node }) => ["div", { "data-anexo": node.attrs.id, "data-name": node.attrs.name, "data-size": node.attrs.size }, `📎 ${node.attrs.name}`],
  renderText: ({ node }) => `📎 ${node.attrs.name}`, // entra na busca e na prévia da lista
  addNodeView: () => ReactNodeViewRenderer(AttachmentCard),
});

const toNode = (a: Attached): JSONContent =>
  a.image ? { type: "image", attrs: { src: `anexo:${a.id}`, alt: a.name } } : { type: "attachment", attrs: { id: a.id, name: a.name, size: a.size } };

/** Põe na nota o que acabou de ser guardado, onde está o cursor (ou onde o arquivo foi solto). */
export function insertAttached(editor: Editor, items: Attached[], at?: number) {
  if (!items.length || editor.isDestroyed) return;
  const nodes = items.map(toNode);
  const chain = editor.chain().focus();
  (at === undefined ? chain.insertContent(nodes) : chain.insertContentAt(at, nodes)).run();
}

// print colado do Windows sempre chega como "image.png": ganha data e hora para não ficarem todos iguais
const named = (f: File) => {
  if (f.name !== "image.png") return f.name;
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `imagem ${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}.${p(t.getMinutes())}.${p(t.getSeconds())}.png`;
};

async function addFiles(editor: Editor, files: File[], at?: number) {
  const big = files.find((f) => f.size > MAX_BYTES);
  if (big) return window.alert(`"${big.name}" passa de 100 MB, o limite por arquivo.`);
  const saved: Attached[] = [];
  for (const f of files) saved.push(await api.saveAttachment(f, named(f)));
  insertAttached(editor, saved, at);
}

/** Colar (Ctrl+V) e arrastar arquivos do Explorador para dentro da nota. */
export const Files = FileHandler.configure({
  onPaste: (editor, files) => addFiles(editor, files),
  onDrop: (editor, files, pos) => addFiles(editor, files, pos),
});
