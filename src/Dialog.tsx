// Janela modal simples (formulário de lembrete e Configurações).
import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = "button:not(:disabled), input, select, textarea";

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = () => ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    first()?.focus();
    // modal de verdade: o foco não sai da janela enquanto ela estiver aberta
    const keepInside = (e: FocusEvent) => {
      // listas abertas pelo formulário (data-popup) ficam fora da janela no HTML, mas fazem parte dela
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-popup]")) first()?.focus();
    };
    document.addEventListener("focusin", keepInside);
    return () => {
      document.removeEventListener("focusin", keepInside);
      opener?.focus(); // devolve o foco do teclado para onde estava
    };
  }, []);

  return (
    <div className="dlg-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          // o Tab dá a volta dentro da janela, sem escapar para o app por trás
          if (e.key === "Tab") {
            const all = [...ref.current!.querySelectorAll<HTMLElement>(FOCUSABLE)];
            const [first, last] = [all[0], all[all.length - 1]];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <h2 className="dlg-t">{title}</h2>
        {children}
      </div>
    </div>
  );
}
