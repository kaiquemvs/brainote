// Menu de botão direito, no estilo dos popovers do protótipo.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Icon, paths } from "./icons";

export type MenuItem = { label: string; onSelect: () => void; checked?: boolean };
export type MenuState = { x: number; y: number; items: MenuItem[] };

/** Onde abrir o menu. Shift+F10 e a tecla Menu não trazem posição do mouse: abre embaixo do item. */
export function menuAt(e: MouseEvent): { x: number; y: number } {
  e.preventDefault();
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + 16, y: r.bottom };
}

export function Menu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });

  useLayoutEffect(() => {
    const el = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    setPos({
      left: Math.max(8, Math.min(menu.x, innerWidth - el.offsetWidth - 8)),
      top: Math.max(8, Math.min(menu.y, innerHeight - el.offsetHeight - 8)),
    });
    el.querySelector("button")?.focus();
    const outside = (e: Event) => { if (!el.contains(e.target as Node)) onClose(); };
    addEventListener("mousedown", outside);
    addEventListener("blur", onClose);
    addEventListener("resize", onClose);
    return () => {
      removeEventListener("mousedown", outside);
      removeEventListener("blur", onClose);
      removeEventListener("resize", onClose);
      opener?.focus(); // devolve o foco do teclado para onde estava
    };
  }, [menu]);

  const onKey = (e: KeyboardEvent) => {
    const items = [...ref.current!.querySelectorAll("button")];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") items[(i + 1) % items.length].focus();
    else if (e.key === "ArrowUp") items[(i - 1 + items.length) % items.length].focus();
    else if (e.key === "Escape" || e.key === "Tab") onClose();
    else return;
    e.preventDefault();
  };

  return (
    <div ref={ref} className="menu" role="menu" style={pos} onKeyDown={onKey}>
      {menu.items.map((it, i) => (
        <button key={i} role="menuitem" className="menu-i" onClick={() => { onClose(); it.onSelect(); }}>
          <span className="menu-ck">{it.checked && <Icon size={14}>{paths.check}</Icon>}</span>
          {it.label}
        </button>
      ))}
    </div>
  );
}
