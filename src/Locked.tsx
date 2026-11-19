// Notas com senha (docs/ESPECIFICACAO.md, 13 — versão 1.2): criar, digitar e trocar a senha, a tela da nota
// trancada e o editor que recebe o conteúdo já aberto. A criptografia fica no Rust (src-tauri/src/vault.rs).
import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { Dialog } from "./Dialog";
import { Editor, type EditorProps } from "./Editor";
import { Icon, paths } from "./icons";
import { WindowButtons } from "./WindowButtons";

/** "criar": primeira nota trancada; "abrir": destrancar as notas; "trocar": nas Configurações. */
export type PasswordMode = "criar" | "abrir" | "trocar";

function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="fld">
      <span className="lbl">{label}</span>
      <input className="inp" type="password" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function PasswordDialog(p: { mode: PasswordMode; hint: string | null; onDone: () => void; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [hint, setHint] = useState(p.mode === "trocar" ? (p.hint ?? "") : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isNew = p.mode !== "abrir"; // pede a senha duas vezes e a dica
  const valid = pw.length > 0 && (!isNew || pw === again) && (p.mode !== "trocar" || current.length > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const ok =
        p.mode === "criar" ? await api.createPassword(pw, hint).then(() => true)
        : p.mode === "abrir" ? await api.unlockNotes(pw)
        : await api.changePassword(current, pw, hint);
      if (ok) return p.onDone();
      setError(p.mode === "abrir" ? `Senha incorreta.${p.hint ? ` Dica: ${p.hint}` : ""}` : "A senha atual está incorreta.");
    } finally {
      setBusy(false);
    }
  };

  const title = p.mode === "criar" ? "Criar senha das notas" : p.mode === "abrir" ? "Notas trancadas" : "Trocar senha";
  const action = p.mode === "criar" ? "Criar senha" : p.mode === "abrir" ? "Abrir" : "Trocar senha";
  return (
    <Dialog title={title} onClose={p.onClose}>
      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        {p.mode === "criar" && (
          <p className="t2" style={{ margin: 0, fontSize: 13 }}>
            Uma senha só para todas as notas trancadas. <b>Se você esquecer a senha, não há como recuperar essas notas.</b>
          </p>
        )}
        {p.mode === "trocar" && <PasswordField label="Senha atual" value={current} onChange={(v) => { setCurrent(v); setError(""); }} />}
        <PasswordField label={p.mode === "trocar" ? "Nova senha" : "Senha"} value={pw} onChange={(v) => { setPw(v); setError(""); }} />
        {isNew && <PasswordField label="Repita a senha" value={again} onChange={setAgain} />}
        {isNew && (
          <label className="fld">
            <span className="lbl">Dica (opcional)</span>
            <input className="inp" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Aparece quando a senha é digitada errada" />
          </label>
        )}
        {isNew && again && pw !== again && <p className="dlg-err" role="alert">As duas senhas não são iguais.</p>}
        {error && <p className="dlg-err" role="alert">{error}</p>}
        <div className="dlg-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn-soft" onClick={p.onClose}>Cancelar</button>
          <button type="submit" className="btn-acc" disabled={!valid || busy}>{busy ? "Conferindo…" : action}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** Nota trancada com as notas fechadas: só o título e o campo da senha. */
export function LockedNote({ title, hint, onUnlocked }: { title: string; hint: string | null; onUnlocked: () => void }) {
  const [pw, setPw] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    try {
      if (await api.unlockNotes(pw)) return onUnlocked();
      setWrong(true);
      setPw("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="bar" data-tauri-drag-region>
        <span className="grow" data-tauri-drag-region />
        <WindowButtons />
      </div>
      <form className="lock-screen" onSubmit={submit}>
        <Icon size={34}>{paths.lock}</Icon>
        <h2 className="lock-t">{title.trim() || "Nova nota"}</h2>
        <p className="t2">Esta nota está trancada. Digite a senha das notas trancadas para ver o conteúdo.</p>
        <div className="lock-row">
          <label className="sr-only" htmlFor="senha-nota">Senha das notas trancadas</label>
          <input id="senha-nota" className="inp" type="password" autoComplete="off" autoFocus placeholder="Senha" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="btn-acc" disabled={!pw || busy}>{busy ? "Conferindo…" : "Abrir"}</button>
        </div>
        {wrong && <p className="dlg-err" role="alert">Senha incorreta.{hint ? ` Dica: ${hint}` : ""}</p>}
      </form>
    </>
  );
}

/** Nota trancada com as notas abertas: o conteúdo chega aberto do Rust e volta criptografado ao salvar. */
export function LockedEditor({ onFail, ...p }: EditorProps & { onFail: () => void }) {
  const [body, setBody] = useState<{ content_json: string | null; plain_text: string } | null>(null);
  useEffect(() => {
    api.openLockedNote(p.note.id).then(setBody, onFail);
  }, [p.note.id]);
  return body && <Editor {...p} note={{ ...p.note, ...body }} />;
}
