// Marca-texto (docs/ESPECIFICACAO.md, 13 — versão 1.1): tons pastel, gravados pelo nome da cor para o
// tema escuro usar uma versão própria (o texto continua legível nos dois temas).
import Highlight from "@tiptap/extension-highlight";

export const MARKER_COLORS = [
  ["azul", "Azul"],
  ["amarelo", "Amarelo"],
  ["verde", "Verde"],
  ["vermelho", "Vermelho"],
  ["laranja", "Laranja"],
] as const;

export type MarkerColor = (typeof MARKER_COLORS)[number][0];

export const Marker = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: "amarelo",
        parseHTML: (el) => el.getAttribute("data-color") ?? "amarelo",
        renderHTML: (attrs) => ({ "data-color": attrs.color }), // sem cor fixa no HTML: quem pinta é o CSS do tema
      },
    };
  },
}).configure({ multicolor: true });
