// Configurações (docs/ESPECIFICACAO.md, 7). Backup entra na Fase 7.
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { api, type Autostart } from "./api";
import { Dialog } from "./Dialog";

export function Settings({ onClose }: { onClose: () => void }) {
  const [auto, setAuto] = useState<Autostart | null>(null);
  const [version, setVersion] = useState("");

  useEffect(() => {
    api.getAutostart().then(setAuto);
    getVersion().then(setVersion);
  }, []);

  const toggle = async () => {
    if (!auto) return;
    await api.setAutostart(!auto.enabled);
    setAuto({ ...auto, enabled: !auto.enabled });
  };

  return (
    <Dialog title="Configurações" onClose={onClose}>
      <button className="toggle-row" role="switch" aria-checked={!!auto?.enabled} disabled={!auto?.available} onClick={toggle}>
        <span>Iniciar com o Windows</span>
        <span className={`sw${auto?.enabled ? " is-on" : ""}`}><span className="knob" /></span>
      </button>
      {auto && !auto.available && <p className="t2 dlg-note">Disponível só no app instalado.</p>}
      <p className="t2 dlg-note">brainote {version}</p>
      <div className="dlg-actions">
        <button className="btn-acc" onClick={onClose}>Fechar</button>
      </div>
    </Dialog>
  );
}
