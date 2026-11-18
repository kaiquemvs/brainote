import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Minimizar, maximizar/restaurar e fechar, no estilo do Windows 11. */
export function WindowButtons() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const sync = () => { win.isMaximized().then(setMaximized); };
    sync();
    const unlisten = win.onResized(sync);
    return () => { unlisten.then((off) => off()); };
  }, []);

  return (
    <div className="caps">
      <button className="cap" aria-label="Minimizar" onClick={() => win.minimize()}>
        <svg className="i-thin" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M1 6h10" /></svg>
      </button>
      <button className="cap" aria-label={maximized ? "Restaurar" : "Maximizar"} onClick={() => win.toggleMaximize()}>
        <svg className="i-thin" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          {maximized
            ? <><rect x="1.5" y="3.5" width="7" height="7" rx="1.2" /><path d="M3.5 3.5V2.7a1.2 1.2 0 0 1 1.2-1.2h4.6a1.2 1.2 0 0 1 1.2 1.2v4.6a1.2 1.2 0 0 1-1.2 1.2h-.8" /></>
            : <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" />}
        </svg>
      </button>
      {/* shortcut: fecha o app de verdade; esconder na bandeja chega na Fase 4 */}
      <button className="cap cap-x" aria-label="Fechar" onClick={() => win.close()}>
        <svg className="i-thin" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" /></svg>
      </button>
    </div>
  );
}
