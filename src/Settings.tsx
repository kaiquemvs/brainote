// Configurações (docs/ESPECIFICACAO.md, 7): iniciar com o Windows, correção automática, backup e versão.
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { api, type Autostart } from "./api";
import { Dialog } from "./Dialog";
import { setAutocorrect } from "./spellcheck";

export function Settings({ onClose }: { onClose: () => void }) {
  const [auto, setAuto] = useState<Autostart | null>(null);
  const [version, setVersion] = useState("");
  const [confirmImport, setConfirmImport] = useState(false);
  const [status, setStatus] = useState("");
  const [fix, setFix] = useState(false);

  useEffect(() => {
    api.getAutostart().then(setAuto);
    api.getAutocorrect().then(setFix);
    getVersion().then(setVersion);
  }, []);

  const toggle = async () => {
    if (!auto) return;
    await api.setAutostart(!auto.enabled);
    setAuto({ ...auto, enabled: !auto.enabled });
  };

  const toggleFix = async () => {
    await api.setAutocorrect(!fix);
    setAutocorrect(!fix); // vale na hora, sem reabrir o app
    setFix(!fix);
  };

  const exportBackup = async () => {
    const path = await api.exportBackup();
    if (path) setStatus(`Backup salvo em ${path}`);
  };

  const importBackup = async () => {
    setConfirmImport(false);
    if (await api.importBackup()) setStatus("Backup importado. Uma cópia dos dados anteriores ficou guardada na pasta do brainote.");
  };

  return (
    <Dialog title="Configurações" onClose={onClose}>
      <button className="toggle-row" role="switch" aria-checked={!!auto?.enabled} disabled={!auto?.available} onClick={toggle}>
        <span>Iniciar com o Windows</span>
        <span className={`sw${auto?.enabled ? " is-on" : ""}`}><span className="knob" /></span>
      </button>
      {auto && !auto.available && <p className="t2 dlg-note">Disponível só no app instalado.</p>}
      <button className="toggle-row" role="switch" aria-checked={fix} onClick={toggleFix} style={{ marginTop: 8 }}>
        <span>Correção automática</span>
        <span className={`sw${fix ? " is-on" : ""}`}><span className="knob" /></span>
      </button>
      <p className="t2 dlg-note">Ao digitar, corrige erros comuns (acento esquecido, letra trocada) em português e inglês. Ctrl+Z desfaz a troca.</p>

      <p className="lbl" style={{ margin: "20px 4px 8px" }}>Backup</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button className="btn-soft" onClick={exportBackup}>Exportar backup</button>
        <button className="btn-soft" onClick={() => setConfirmImport(true)}>Importar backup…</button>
      </div>
      {confirmImport && (
        <div className="dlg-warn" role="alert">
          <p style={{ margin: "0 0 10px" }}>
            Importar <b>substitui todas as notas, pastas, lembretes, eventos e widgets</b> pelos do arquivo. Antes, o brainote guarda
            uma cópia dos dados atuais.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-soft" onClick={() => setConfirmImport(false)}>Cancelar</button>
            <button className="btn-acc" onClick={importBackup}>Escolher arquivo…</button>
          </div>
        </div>
      )}
      {status && <p className="t2 dlg-note" role="status" style={{ overflowWrap: "anywhere" }}>{status}</p>}

      <p className="t2 dlg-note" style={{ marginTop: 20 }}>brainote {version}</p>
      <div className="dlg-actions">
        <button className="btn-acc" onClick={onClose}>Fechar</button>
      </div>
    </Dialog>
  );
}
