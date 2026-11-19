// Lista suspensa no visual do app: as listas nativas (<select>) são desenhadas pelo Windows e
// não aceitam tema, cantos nem vidro (docs/ESPECIFICACAO.md, 13 — versão 1.1).
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon, paths } from "./icons";

export type Option = { value: string; label: string };

/** "Nenhuma" + as notas, para os campos "Nota vinculada" de lembrete e evento. */
export const noteOptions = (notes: { id: string; title: string }[]): Option[] => [
  { value: "", label: "Nenhuma" },
  ...notes.map((n) => ({ value: n.id, label: n.title.trim() || "Nova nota" })),
];

type Props = { value: string; options: Option[]; onChange: (value: string) => void; label: string };

export function Select({ value, options, onChange, label }: Props) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });
  const current = options.find((o) => o.value === value);

  const show = () => {
    const r = btn.current!.getBoundingClientRect();
    const height = Math.min(264, options.length * 34 + 12);
    const fitsBelow = innerHeight - r.bottom >= height + 8;
    setPos({ left: r.left, width: r.width, top: fitsBelow ? r.bottom + 4 : Math.max(8, r.top - height - 4) });
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const pick = (i: number) => {
    onChange(options[i].value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const shut = () => close(false);
    addEventListener("mousedown", outside);
    addEventListener("resize", shut);
    return () => {
      removeEventListener("mousedown", outside);
      removeEventListener("resize", shut);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKey = (e: KeyboardEvent) => {
    const last = options.length - 1;
    if (e.key === "ArrowDown") setActive((a) => Math.min(last, a + 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter" || e.key === " ") pick(active);
    else if (e.key === "Escape" || e.key === "Tab") close();
    else return;
    e.preventDefault();
    e.stopPropagation(); // o Esc fecha só a lista, não o formulário
  };

  // A lista é desenhada sobre o app inteiro: dentro do formulário (que tem vidro e rolagem) ela seria cortada.
  const host = (btn.current?.closest(".app") as HTMLElement | null) ?? document.body;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="inp sel-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? ""}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="ell">{current?.label ?? ""}</span>
        <span className="sel-chev"><Icon size={14}>{paths.chevron}</Icon></span>
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            className="sel-pop"
            data-popup
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${id}-${active}`}
            style={{ left: pos.left, top: pos.top, width: pos.width }}
            onKeyDown={onKey}
          >
            {options.map((o, i) => (
              <div
                key={o.value}
                id={`${id}-${i}`}
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                className={`sel-opt${i === active ? " is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span className="menu-ck">{o.value === value && <Icon size={14}>{paths.check}</Icon>}</span>
                <span className="ell">{o.label}</span>
              </div>
            ))}
          </div>,
          host,
        )}
    </>
  );
}
