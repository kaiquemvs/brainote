mod attachments;
mod background;
#[cfg(windows)]
mod desktop;
mod spell;
mod store;
mod vault;
mod widgets;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri_plugin_dialog::DialogExt;
use tauri::{AppHandle, Emitter, Manager, State, Theme, WebviewWindow, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;
use vault::Vault;

/// Argumento que o Windows passa ao abrir o app junto com o sistema.
const AUTOSTART_ARG: &str = "--autostart";

struct Db(Mutex<Connection>);

type Res<T> = Result<T, String>;

/// Roda uma operação do banco que já devolve o erro em texto para a tela.
fn with_res<T>(db: &State<Db>, f: impl FnOnce(&Connection) -> Res<T>) -> Res<T> {
    f(&db.0.lock().unwrap_or_else(|e| e.into_inner()))
}

/// Roda uma operação do banco e transforma o erro em texto para a tela.
fn with<T>(db: &State<Db>, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Res<T> {
    with_res(db, |c| f(c).map_err(|e| e.to_string()))
}

/// Como `with`, para o que altera dados: depois avisa todas as janelas (app e widgets).
fn write<T>(app: &AppHandle, db: &State<Db>, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Res<T> {
    let out = with(db, f)?;
    background::changed(app);
    Ok(out)
}

fn folder_name(name: &str) -> Res<&str> {
    let name = name.trim();
    if name.is_empty() {
        return Err("O nome da pasta não pode ficar vazio.".into());
    }
    Ok(name)
}

/// Tema ("light" ou "dark") e efeito vidro, guardados na tabela `settings`.
#[derive(Serialize, Deserialize, Clone)]
struct Appearance {
    theme: String,
    glass: bool,
}

/// Na primeira abertura: claro com vidro, como no protótipo.
fn read_appearance(c: &Connection) -> rusqlite::Result<Appearance> {
    Ok(Appearance {
        theme: store::get_setting(c, "theme")?.unwrap_or_else(|| "light".into()),
        glass: store::get_setting(c, "glass")?.is_none_or(|v| v == "1"),
    })
}

/// Vidro (o mesmo efeito do TranslucentRM, desktop.rs) na janela principal, onde só a barra lateral fica
/// translúcida (App.css), e no widget de checklist. Post-it e agenda ficam sempre com cor sólida.
fn apply_appearance(w: &WebviewWindow, a: &Appearance) -> tauri::Result<()> {
    let kind = widgets::id_of(w.label())
        .and_then(|id| background::with_db(w.app_handle(), |c| store::get_widget(c, id)))
        .map(|wd| wd.kind);
    // post-it mantém as cores claras nos dois temas
    let postit = kind.as_deref() == Some("postit");
    w.set_theme(Some(if a.theme == "dark" && !postit { Theme::Dark } else { Theme::Light }))?;
    #[cfg(windows)]
    {
        let (win, on) = (w.clone(), a.glass && kind.as_deref().is_none_or(|k| k == "checklist"));
        w.run_on_main_thread(move || desktop::set_glass(&win, on))?;
    }
    Ok(())
}

#[tauri::command]
fn get_appearance(db: State<Db>) -> Res<Appearance> {
    with(&db, read_appearance)
}

/// Aplica a aparência na janela principal e em todos os widgets, e avisa as telas.
fn broadcast_appearance(app: &AppHandle, a: &Appearance) -> Res<()> {
    for w in app.webview_windows().values() {
        apply_appearance(w, a).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("appearance-changed", a);
    Ok(())
}

#[tauri::command]
fn set_appearance(app: AppHandle, db: State<Db>, appearance: Appearance) -> Res<()> {
    if appearance.theme != "light" && appearance.theme != "dark" {
        return Err("Tema inválido.".into());
    }
    with(&db, |c| {
        store::set_setting(c, "theme", &appearance.theme)?;
        store::set_setting(c, "glass", if appearance.glass { "1" } else { "0" })
    })?;
    broadcast_appearance(&app, &appearance)
}

// ---------- Backup ----------

/// %APPDATA%\brainote, onde fica o banco.
fn data_dir(app: &AppHandle) -> Res<PathBuf> {
    Ok(app.path().data_dir().map_err(|e| e.to_string())?.join("brainote"))
}

/// Salva tudo num .zip escolhido pela pessoa: os dados em `brainote.json` e os anexos em `anexos/`.
/// `None` = cancelou.
// async: a janela "Salvar como" espera a pessoa sem travar o app
#[tauri::command]
async fn export_backup(app: AppHandle) -> Res<Option<String>> {
    let name = format!("brainote-backup-{}.zip", chrono::Local::now().format("%Y-%m-%d"));
    let Some(path) = app.dialog().file().set_title("Exportar backup").add_filter("Backup do brainote", &["zip"]).set_file_name(name).blocking_save_file()
    else {
        return Ok(None);
    };
    let path = path.as_path().ok_or("Escolha uma pasta do computador.")?.to_path_buf();
    let data = with(&app.state::<Db>(), store::export_backup)?;
    let fail = |e: &dyn std::fmt::Display| format!("Não foi possível salvar o backup: {e}");
    let file = std::fs::File::create(&path).map_err(|e| fail(&e))?;
    let mut zip = zip::ZipWriter::new(file);
    let packed = zip::write::SimpleFileOptions::default();
    zip.start_file("brainote.json", packed).map_err(|e| fail(&e))?;
    serde_json::to_writer_pretty(&mut zip, &data).map_err(|e| fail(&e))?;
    // imagens e PDFs já vêm comprimidos: guardar como estão é mais rápido e quase não muda o tamanho
    let stored = packed.compression_method(zip::CompressionMethod::Stored);
    for (inside, file) in attachments::all(&app) {
        zip.start_file(inside, stored).map_err(|e| fail(&e))?;
        std::io::copy(&mut std::fs::File::open(&file).map_err(|e| fail(&e))?, &mut zip).map_err(|e| fail(&e))?;
    }
    zip.finish().map_err(|e| fail(&e))?;
    Ok(Some(path.display().to_string()))
}

/// Troca todos os dados pelos de um backup. Antes, guarda uma cópia do banco atual ao lado dele.
/// `false` = cancelou.
/// Aceita o .zip da versão 1.2 e o .json das versões anteriores (sem anexos).
#[tauri::command]
async fn import_backup(app: AppHandle) -> Res<bool> {
    let Some(path) = app.dialog().file().set_title("Importar backup").add_filter("Backup do brainote", &["zip", "json"]).blocking_pick_file() else {
        return Ok(false);
    };
    let path = path.as_path().ok_or("Escolha um arquivo do computador.")?.to_path_buf();
    let not_backup = "Este arquivo não é um backup do brainote.";
    let base = data_dir(&app)?;
    // os anexos do .zip vão primeiro para uma pasta à parte; só trocam de lugar com os atuais depois
    // que o banco foi importado sem erro
    let incoming = base.join("anexos-importando");
    let _ = std::fs::remove_dir_all(&incoming);
    let is_json = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("json"));
    let data: serde_json::Value = if is_json {
        let text = std::fs::read_to_string(&path).map_err(|e| format!("Não foi possível ler o arquivo: {e}"))?;
        serde_json::from_str(&text).map_err(|_| not_backup)?
    } else {
        unpack_backup(&path, &incoming).inspect_err(|_| {
            let _ = std::fs::remove_dir_all(&incoming);
        })?
    };
    let stamp = chrono::Local::now().format("%Y-%m-%d-%H%M%S");
    let aside = base.join(format!("anexos-antes-da-importacao-{stamp}"));
    swap_attachments(&attachments::dir(&app)?, &aside, &incoming, || {
        let db = app.state::<Db>();
        let mut conn = db.0.lock().unwrap_or_else(|e| e.into_inner());
        let copy = base.join(format!("brainote-antes-da-importacao-{stamp}.db"));
        conn.execute("VACUUM INTO ?1", [copy.to_string_lossy()])
            .map_err(|e| format!("Não foi possível guardar a cópia do banco atual, então nada foi importado: {e}"))?;
        store::import_backup(&mut conn, &data)
    })?;
    widgets::reopen_all(&app);
    broadcast_appearance(&app, &with(&app.state::<Db>(), read_appearance)?)?;
    // a senha pode ter vindo junto com o backup: as notas trancadas fecham
    set_vault(&app, None);
    let _ = app.emit("relock", ());
    background::changed(&app);
    Ok(true)
}

/// Troca os anexos junto com o banco (`import`). Os atuais saem do caminho antes, para `aside`: ficam guardados
/// ao lado da cópia do banco, e a limpeza (attachments::cleanup) não apaga os que as notas importadas não usam.
/// Se não der para tirá-los (arquivo aberto em outro programa), nada é importado; se `import` falhar, eles voltam.
/// Depois, os do backup (`incoming`, só no .zip) entram no lugar.
fn swap_attachments(current: &Path, aside: &Path, incoming: &Path, import: impl FnOnce() -> Res<()>) -> Res<()> {
    let fail = |e: String| {
        let _ = std::fs::remove_dir_all(incoming);
        e
    };
    if current.exists() {
        std::fs::rename(current, aside).map_err(|e| {
            fail(format!("Nada foi importado: não foi possível guardar os anexos atuais. Feche os anexos abertos em outros programas e tente de novo. ({e})"))
        })?;
    }
    if let Err(e) = import() {
        if aside.exists() {
            let _ = std::fs::rename(aside, current);
        }
        return Err(fail(e));
    }
    if incoming.exists() {
        std::fs::rename(incoming, current).map_err(|e| format!("Os dados foram importados, mas os anexos não: {e}"))?;
    }
    Ok(())
}

/// Lê o .zip do backup: devolve os dados e extrai os anexos em `into`.
fn unpack_backup(path: &Path, into: &Path) -> Res<serde_json::Value> {
    let not_backup = || "Este arquivo não é um backup do brainote.".to_string();
    let file = std::fs::File::open(path).map_err(|e| format!("Não foi possível ler o arquivo: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| not_backup())?;
    let data = {
        let mut text = String::new();
        zip.by_name("brainote.json").map_err(|_| not_backup())?.read_to_string(&mut text).map_err(|_| not_backup())?;
        serde_json::from_str(&text).map_err(|_| not_backup())?
    };
    let fail = |e: &dyn std::fmt::Display| format!("Não foi possível extrair os anexos do backup: {e}");
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| fail(&e))?;
        // enclosed_name: recusa caminhos que sairiam da pasta (ex.: "../../")
        let Some(rel) = entry.enclosed_name() else { continue };
        let Ok(rel) = rel.strip_prefix("anexos") else { continue };
        if entry.is_dir() || rel.as_os_str().is_empty() {
            continue;
        }
        let out = into.join(rel);
        std::fs::create_dir_all(out.parent().unwrap_or(into)).map_err(|e| fail(&e))?;
        std::io::copy(&mut entry, &mut std::fs::File::create(&out).map_err(|e| fail(&e))?).map_err(|e| fail(&e))?;
    }
    Ok(data)
}

#[tauri::command]
fn list_folders(db: State<Db>) -> Res<Vec<store::Folder>> {
    with(&db, store::list_folders)
}

#[tauri::command]
fn create_folder(app: AppHandle, db: State<Db>, name: &str) -> Res<store::Folder> {
    let name = folder_name(name)?;
    write(&app, &db, |c| store::create_folder(c, name))
}

#[tauri::command]
fn rename_folder(app: AppHandle, db: State<Db>, id: &str, name: &str) -> Res<()> {
    let name = folder_name(name)?;
    write(&app, &db, |c| store::rename_folder(c, id, name))
}

#[tauri::command]
fn delete_folder(app: AppHandle, db: State<Db>, id: &str) -> Res<()> {
    write(&app, &db, |c| store::delete_folder(c, id))
}

#[tauri::command]
fn list_notes(db: State<Db>) -> Res<Vec<store::Note>> {
    with(&db, store::list_notes)
}

/// A nota de um post-it ou checklist; `None` se ela foi apagada.
#[tauri::command]
fn get_note(db: State<Db>, id: &str) -> Res<Option<store::Note>> {
    with(&db, |c| store::live_note(c, id))
}

#[tauri::command]
fn search_notes(db: State<Db>, query: &str) -> Res<Vec<String>> {
    with(&db, |c| store::search_notes(c, query))
}

#[tauri::command]
fn create_note(app: AppHandle, db: State<Db>, folder_id: Option<&str>) -> Res<store::Note> {
    write(&app, &db, |c| store::create_note(c, folder_id))
}

#[tauri::command]
fn update_note(app: AppHandle, db: State<Db>, id: &str, title: &str, content_json: &str, plain_text: &str) -> Res<()> {
    // JSON quebrado deixaria a nota impossível de abrir: recusa antes de gravar
    serde_json::from_str::<serde_json::Value>(content_json).map_err(|e| format!("Conteúdo inválido: {e}"))?;
    let key = vault_key(&app);
    with_res(&db, |c| save_note(c, key.as_ref(), id, title, content_json, plain_text))?;
    background::changed(&app);
    Ok(())
}

// ---------- Notas com senha (13, versão 1.2) ----------

#[derive(Serialize)]
struct LockState {
    has_password: bool,
    unlocked: bool,
    hint: Option<String>,
}

/// O conteúdo de uma nota trancada, criptografado junto.
#[derive(Serialize, Deserialize)]
struct NoteBody {
    content_json: Option<String>,
    plain_text: String,
}

const NO_KEY: &str = "As notas trancadas estão fechadas: digite a senha.";

fn vault_key(app: &AppHandle) -> Option<vault::Secret> {
    *app.state::<Vault>().0.lock().unwrap_or_else(|e| e.into_inner())
}

fn set_vault(app: &AppHandle, key: Option<vault::Secret>) {
    *app.state::<Vault>().0.lock().unwrap_or_else(|e| e.into_inner()) = key;
}

/// (sal, valor de conferência) da senha, se ela já foi criada.
fn password_of(db: &State<Db>) -> Res<Option<(String, String)>> {
    with(db, |c| Ok(store::get_setting(c, "lock_salt")?.zip(store::get_setting(c, "lock_check")?)))
}

/// A senha digitada confere? Devolve a chave dela.
fn check_password(db: &State<Db>, password: &str) -> Res<Option<vault::Secret>> {
    let (salt, check) = password_of(db)?.ok_or("Ainda não há senha.")?;
    Ok(vault::derive(password, &salt).filter(|k| vault::verify(k, &check)))
}

/// Grava a senha nova (sal, conferência e dica). A senha em si não é guardada.
fn save_password(c: &Connection, salt: &str, key: &vault::Secret, hint: &str) -> rusqlite::Result<()> {
    store::set_setting(c, "lock_salt", salt)?;
    store::set_setting(c, "lock_check", &vault::check_value(key))?;
    store::set_setting(c, "lock_hint", hint.trim())
}

fn has_files(content_json: &str) -> bool {
    content_json.contains(r#""type":"image""#) || content_json.contains(r#""type":"attachment""#)
}

fn seal_body(key: &vault::Secret, content_json: Option<String>, plain_text: String) -> Res<String> {
    let body = serde_json::to_vec(&NoteBody { content_json, plain_text }).map_err(|e| e.to_string())?;
    Ok(vault::seal(key, &body))
}

/// Grava a nota: aberta se é comum; cifrada com `key` se é trancada (sem a chave, recusa).
/// O texto aberto de uma nota trancada nunca vai para o banco.
fn save_note(c: &Connection, key: Option<&vault::Secret>, id: &str, title: &str, content_json: &str, plain_text: &str) -> Res<()> {
    let err = |e: rusqlite::Error| e.to_string();
    if store::note_body(c, id).map_err(err)?.2.is_none() {
        return store::update_note(c, id, title, content_json, plain_text).map_err(err);
    }
    let sealed = seal_body(key.ok_or(NO_KEY)?, Some(content_json.into()), plain_text.into())?;
    store::update_locked_note(c, id, title, &sealed).map_err(err)
}

/// Tranca a nota: o conteúdo vai cifrado e o texto aberto sai do banco. `false` = já estava trancada.
fn lock_body(c: &Connection, key: &vault::Secret, id: &str) -> Res<bool> {
    let err = |e: rusqlite::Error| e.to_string();
    let (content_json, plain_text, sealed) = store::note_body(c, id).map_err(err)?;
    if sealed.is_some() {
        return Ok(false);
    }
    if content_json.as_deref().is_some_and(has_files) {
        return Err("Tire as imagens e os anexos da nota antes de trancá-la.".into());
    }
    store::set_note_body(c, id, Some(&seal_body(key, content_json, plain_text)?), None, "").map_err(err)?;
    Ok(true)
}

/// Conteúdo aberto de uma nota trancada (só com a chave certa).
fn open_body(c: &Connection, key: &vault::Secret, id: &str) -> Res<NoteBody> {
    let sealed = store::note_body(c, id).map_err(|e| e.to_string())?.2.ok_or("Esta nota não está trancada.")?;
    vault::open(key, &sealed).and_then(|b| serde_json::from_slice(&b).ok()).ok_or_else(|| "Não foi possível abrir a nota.".into())
}

#[tauri::command]
fn lock_state(app: AppHandle, db: State<Db>) -> Res<LockState> {
    let has_password = password_of(&db)?.is_some();
    let hint = with(&db, |c| store::get_setting(c, "lock_hint"))?.filter(|h| !h.is_empty());
    Ok(LockState { has_password, unlocked: vault_key(&app).is_some(), hint })
}

/// Primeira nota trancada: cria a senha, que já fica aberta. async: o Argon2 leva meio segundo.
#[tauri::command]
async fn create_password(app: AppHandle, password: String, hint: String) -> Res<()> {
    let db = app.state::<Db>();
    if password.is_empty() {
        return Err("Digite uma senha.".into());
    }
    if password_of(&db)?.is_some() {
        return Err("A senha das notas trancadas já existe.".into());
    }
    let salt = vault::new_salt();
    let key = vault::derive(&password, &salt).ok_or("Não foi possível criar a senha.")?;
    with(&db, |c| save_password(c, &salt, &key, &hint))?;
    set_vault(&app, Some(key));
    Ok(())
}

/// Destranca todas as notas trancadas; `false` = senha errada.
#[tauri::command]
async fn unlock_notes(app: AppHandle, password: String) -> Res<bool> {
    let key = check_password(&app.state::<Db>(), &password)?;
    if key.is_some() {
        set_vault(&app, key);
    }
    Ok(key.is_some())
}

#[tauri::command]
fn lock_notes(app: AppHandle) {
    set_vault(&app, None);
}

#[tauri::command]
fn open_locked_note(app: AppHandle, db: State<Db>, id: &str) -> Res<NoteBody> {
    let key = vault_key(&app).ok_or(NO_KEY)?;
    with_res(&db, |c| open_body(c, &key, id))
}

/// Tranca a nota: o conteúdo vai criptografado e os widgets dela saem da área de trabalho.
/// async: fechar janela de widget num comando síncrono trava o app.
#[tauri::command]
async fn lock_note(app: AppHandle, id: String) -> Res<()> {
    let key = vault_key(&app).ok_or(NO_KEY)?;
    let db = app.state::<Db>();
    if !with_res(&db, |c| lock_body(c, &key, &id))? {
        return Ok(());
    }
    for w in with(&db, store::list_widgets)?.into_iter().filter(|w| w.note_id.as_deref() == Some(id.as_str())) {
        widgets::remove(&app, &w.id);
    }
    background::changed(&app);
    Ok(())
}

/// Tira o cadeado: a nota volta a ser comum.
#[tauri::command]
fn unlock_note(app: AppHandle, db: State<Db>, id: &str) -> Res<()> {
    let key = vault_key(&app).ok_or(NO_KEY)?;
    with_res(&db, |c| {
        let body = open_body(c, &key, id)?;
        store::set_note_body(c, id, None, body.content_json.as_deref(), &body.plain_text).map_err(|e| e.to_string())
    })?;
    background::changed(&app);
    Ok(())
}

/// Confere a senha atual e refaz todas as notas trancadas com a nova, numa transação só; `false` = senha atual errada.
#[tauri::command]
async fn change_password(app: AppHandle, current: String, new: String, hint: String) -> Res<bool> {
    let db = app.state::<Db>();
    if new.is_empty() {
        return Err("Digite a nova senha.".into());
    }
    let Some(old) = check_password(&db, &current)? else { return Ok(false) };
    let salt = vault::new_salt();
    let key = vault::derive(&new, &salt).ok_or("Não foi possível criar a senha.")?;
    let resealed = with(&db, store::locked_notes)?
        .into_iter()
        .map(|(id, sealed)| vault::open(&old, &sealed).map(|body| (id, vault::seal(&key, &body))))
        .collect::<Option<Vec<_>>>()
        .ok_or("Uma nota trancada não abriu com a senha atual; a senha não foi trocada.")?;
    with(&db, |c| {
        let tx = c.unchecked_transaction()?;
        for (id, sealed) in &resealed {
            store::set_locked_cipher(&tx, id, sealed)?;
        }
        save_password(&tx, &salt, &key, &hint)?;
        tx.commit()
    })?;
    set_vault(&app, Some(key));
    Ok(true)
}

#[tauri::command]
fn set_pinned(app: AppHandle, db: State<Db>, id: &str, pinned: bool) -> Res<()> {
    write(&app, &db, |c| store::set_pinned(c, id, pinned))
}

#[tauri::command]
fn move_note(app: AppHandle, db: State<Db>, id: &str, folder_id: Option<&str>) -> Res<()> {
    write(&app, &db, |c| store::move_note(c, id, folder_id))
}

#[tauri::command]
fn delete_note(app: AppHandle, db: State<Db>, id: &str) -> Res<()> {
    write(&app, &db, |c| store::delete_note(c, id))
}

#[tauri::command]
fn restore_note(app: AppHandle, db: State<Db>, id: &str) -> Res<()> {
    write(&app, &db, |c| store::restore_note(c, id))
}

// ---------- Lembretes ----------

fn check_reminder(r: &store::ReminderInput) -> Res<()> {
    if r.title.trim().is_empty() {
        return Err("O lembrete precisa de um título.".into());
    }
    chrono::DateTime::parse_from_rfc3339(&r.due_at).map_err(|_| "Data do lembrete inválida.")?;
    if !["none", "monthly", "yearly"].contains(&r.repeat.as_str()) && store::weekly_days(&r.repeat).is_none() {
        return Err("Repetição inválida.".into());
    }
    Ok(())
}

#[tauri::command]
fn list_reminders(db: State<Db>) -> Res<Vec<store::Reminder>> {
    with(&db, store::list_reminders)
}

#[tauri::command]
fn create_reminder(app: AppHandle, db: State<Db>, reminder: store::ReminderInput) -> Res<store::Reminder> {
    check_reminder(&reminder)?;
    write(&app, &db, |c| store::create_reminder(c, &reminder))
}

#[tauri::command]
fn update_reminder(app: AppHandle, db: State<Db>, id: &str, reminder: store::ReminderInput) -> Res<()> {
    check_reminder(&reminder)?;
    write(&app, &db, |c| store::update_reminder(c, id, &reminder))
}

#[tauri::command]
fn delete_reminder(app: AppHandle, db: State<Db>, id: &str) -> Res<()> {
    write(&app, &db, |c| store::delete_reminder(c, id))
}

#[tauri::command]
fn set_reminder_done(app: AppHandle, db: State<Db>, id: &str, done: bool) -> Res<()> {
    write(&app, &db, |c| store::set_reminder_done(c, id, done))
}

// ---------- Eventos (Agenda) ----------

fn check_event(e: &store::EventInput) -> Res<()> {
    if e.title.trim().is_empty() {
        return Err("O evento precisa de um título.".into());
    }
    let start = chrono::DateTime::parse_from_rfc3339(&e.starts_at).map_err(|_| "Data do evento inválida.")?;
    if let Some(end) = &e.ends_at {
        let end = chrono::DateTime::parse_from_rfc3339(end).map_err(|_| "Hora de fim inválida.")?;
        if end < start {
            return Err("A hora de fim é antes do início.".into());
        }
    }
    Ok(())
}

#[tauri::command]
fn list_events(db: State<Db>) -> Res<Vec<store::Event>> {
    with(&db, store::list_events)
}

#[tauri::command]
fn create_event(app: AppHandle, db: State<Db>, event: store::EventInput) -> Res<store::Event> {
    check_event(&event)?;
    write(&app, &db, |c| store::create_event(c, &event))
}

#[tauri::command]
fn update_event(app: AppHandle, db: State<Db>, id: &str, event: store::EventInput) -> Res<()> {
    check_event(&event)?;
    write(&app, &db, |c| store::update_event(c, id, &event))
}

#[tauri::command]
fn delete_event(app: AppHandle, db: State<Db>, id: &str) -> Res<()> {
    write(&app, &db, |c| store::delete_event(c, id))
}

// ---------- Exportar nota ----------

/// Salva a nota num .md (padrão) ou .txt escolhido pela pessoa; os dois textos vêm prontos da tela.
/// `None` = cancelou. As notas continuam no banco: isto é só uma cópia fora do app.
/// Imagens e anexos (`files`: id e nome no arquivo exportado) vão para a pasta "<nome> - anexos", ao lado;
/// o texto aponta para eles pela marca `{{ANEXOS}}`, trocada aqui pelo nome dessa pasta.
#[tauri::command]
async fn export_note(app: AppHandle, title: String, markdown: String, text: String, files: Vec<(String, String)>) -> Res<Option<String>> {
    let name: String = title.chars().filter(|c| !r#"<>:"/|?*"#.contains(*c) && !c.is_control()).collect();
    let name = if name.trim().is_empty() { "nota".to_string() } else { name.trim().to_string() };
    let Some(path) = app.dialog().file().set_title("Exportar nota").add_filter("Markdown", &["md"]).add_filter("Texto", &["txt"]).set_file_name(name).blocking_save_file()
    else {
        return Ok(None);
    };
    let mut path = path.as_path().ok_or("Escolha uma pasta do computador.")?.to_path_buf();
    if path.extension().is_none() {
        path.set_extension("md");
    }
    let txt = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("txt"));
    let folder = format!("{} - anexos", path.file_stem().unwrap_or_default().to_string_lossy());
    if !files.is_empty() {
        let out = path.with_file_name(&folder);
        std::fs::create_dir_all(&out).map_err(|e| format!("Não foi possível criar a pasta dos anexos: {e}"))?;
        for (id, name) in &files {
            let Some(src) = attachments::file_of(&app, id) else { continue }; // arquivo sumiu: a nota sai sem ele
            std::fs::copy(src, out.join(attachments::clean_name(name))).map_err(|e| format!("Não foi possível copiar \"{name}\": {e}"))?;
        }
    }
    let body = if txt { text } else { markdown }.replace("{{ANEXOS}}", &folder);
    std::fs::write(&path, body).map_err(|e| format!("Não foi possível salvar a nota: {e}"))?;
    Ok(Some(path.display().to_string()))
}

// ---------- Imagens e anexos (versão 1.2) ----------

/// "Inserir imagem ou arquivo": escolhe um ou mais arquivos e guarda uma cópia de cada. Vazio = cancelou.
#[tauri::command]
async fn attach_files(app: AppHandle) -> Res<Vec<attachments::Attached>> {
    let Some(picked) = app.dialog().file().set_title("Inserir imagem ou arquivo").blocking_pick_files() else {
        return Ok(vec![]);
    };
    let paths: Vec<PathBuf> = picked.iter().filter_map(|p| p.as_path().map(Path::to_path_buf)).collect();
    for p in &paths {
        attachments::check(p)?; // se um passar do limite, nenhum é guardado
    }
    paths.iter().map(|p| attachments::store_copy(&app, p)).collect()
}

/// Imagem ou arquivo colado ou arrastado para a nota: o conteúdo vem no corpo da chamada e o nome no
/// cabeçalho "x-name", codificado como em endereço web (cabeçalho só aceita letras sem acento).
#[tauri::command]
async fn save_attachment(app: AppHandle, request: tauri::ipc::Request<'_>) -> Res<attachments::Attached> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Arquivo inválido.".into());
    };
    // o Url já sabe decodificar "%C3%A7" de volta para "ç"
    let name = request
        .headers()
        .get("x-name")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| tauri::Url::parse(&format!("http://n/?n={v}")).ok())
        .and_then(|u| u.query_pairs().next().map(|(_, v)| v.into_owned()))
        .unwrap_or_else(|| "arquivo".into());
    attachments::store_bytes(&app, &name, bytes)
}

/// Abre o anexo no programa padrão do Windows (a cópia guardada pelo brainote).
#[tauri::command]
async fn open_attachment(app: AppHandle, id: String) -> Res<()> {
    let path = attachments::file_of(&app, &id).ok_or("O arquivo deste anexo não foi encontrado.")?;
    app.opener().open_path(path.to_string_lossy(), None::<&str>).map_err(|e| format!("Não foi possível abrir o arquivo: {e}"))
}

/// "Salvar como…" de um anexo. `None` = cancelou.
#[tauri::command]
async fn save_attachment_as(app: AppHandle, id: String) -> Res<Option<String>> {
    let src = attachments::file_of(&app, &id).ok_or("O arquivo deste anexo não foi encontrado.")?;
    let name = src.file_name().unwrap_or_default().to_string_lossy().to_string();
    let Some(path) = app.dialog().file().set_title("Salvar anexo").set_file_name(name).blocking_save_file() else {
        return Ok(None);
    };
    let path = path.as_path().ok_or("Escolha uma pasta do computador.")?.to_path_buf();
    std::fs::copy(&src, &path).map_err(|e| format!("Não foi possível salvar o arquivo: {e}"))?;
    Ok(Some(path.display().to_string()))
}

// ---------- Corretor ortográfico ----------

// async: o dicionário de português pode ainda estar carregando na primeira chamada
#[tauri::command]
async fn spell_check(words: Vec<String>) -> Vec<bool> {
    spell::check(&words)
}

#[tauri::command]
async fn spell_suggest(word: String) -> Vec<String> {
    spell::suggest(&word)
}

#[tauri::command]
async fn spell_autocorrect(word: String) -> Option<String> {
    spell::autocorrect(&word)
}

/// Correção automática ao digitar (Configurações). Começa desligada.
#[tauri::command]
fn get_autocorrect(db: State<Db>) -> Res<bool> {
    with(&db, |c| Ok(store::get_setting(c, "autocorrect")?.is_some_and(|v| v == "1")))
}

#[tauri::command]
fn set_autocorrect(db: State<Db>, enabled: bool) -> Res<()> {
    with(&db, |c| store::set_setting(c, "autocorrect", if enabled { "1" } else { "0" }))
}

// ---------- Widgets ----------

#[tauri::command]
fn list_widgets(db: State<Db>) -> Res<Vec<store::Widget>> {
    with(&db, store::list_widgets)
}

#[tauri::command]
fn get_widget(db: State<Db>, id: &str) -> Res<store::Widget> {
    with(&db, |c| store::get_widget(c, id))
}

// async: no Windows, criar ou fechar janela num comando síncrono trava o app
#[tauri::command]
async fn create_widget(app: AppHandle, kind: String, note_id: Option<String>) -> Res<store::Widget> {
    widgets::create(&app, &kind, note_id.as_deref())
}

#[tauri::command]
async fn delete_widget(app: AppHandle, id: String) -> Res<()> {
    widgets::remove(&app, &id);
    Ok(())
}

#[tauri::command]
fn set_widget_color(app: AppHandle, db: State<Db>, id: &str, color: &str) -> Res<()> {
    if !widgets::COLORS.contains(&color) {
        return Err("Cor inválida.".into());
    }
    write(&app, &db, |c| store::set_widget_color(c, id, color))
}

#[tauri::command]
fn set_widget_on_top(app: AppHandle, id: &str, on_top: bool) {
    widgets::set_on_top(&app, id, on_top);
}

#[tauri::command]
fn set_widget_note(app: AppHandle, id: &str, note_id: &str) -> Res<()> {
    widgets::set_note(&app, id, note_id)
}

/// "Trocar nota…" no widget: a escolha acontece no app, que tem espaço para a lista de notas.
#[tauri::command]
fn pick_widget_note(app: AppHandle, id: &str) {
    background::show_main(&app);
    let _ = app.emit("pick-widget-note", id);
}

/// "Abrir no brainote" e duplo clique no post-it: a nota do widget; no widget da agenda, a tela de Agenda.
#[tauri::command]
fn open_widget(app: AppHandle, db: State<Db>, id: &str) -> Res<()> {
    let note = with(&db, |c| store::get_widget(c, id))?.note_id;
    widgets::open_in_app(&app, note.as_deref());
    Ok(())
}


// ---------- Iniciar com o Windows ----------

#[derive(Serialize)]
struct Autostart {
    enabled: bool,
    /// Só no app instalado: em desenvolvimento o Windows abriria a versão de teste ao ligar.
    available: bool,
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> Autostart {
    Autostart { enabled: app.autolaunch().is_enabled().unwrap_or(false), available: !cfg!(debug_assertions) }
}

#[tauri::command]
fn set_autostart(app: AppHandle, db: State<Db>, enabled: bool) -> Res<()> {
    if cfg!(debug_assertions) {
        return Err("Disponível só no app instalado.".into());
    }
    let launcher = app.autolaunch();
    if enabled { launcher.enable() } else { launcher.disable() }.map_err(|e| e.to_string())?;
    with(&db, |c| store::set_setting(c, "autostart", if enabled { "1" } else { "0" }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // abrir o brainote de novo só traz a janela existente para frente (precisa ser o primeiro plugin)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| background::show_main(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![AUTOSTART_ARG])))
        .plugin(tauri_plugin_dialog::init()) // janelas "Salvar como" e "Abrir" do backup
        .plugin(tauri_plugin_opener::init()) // abrir anexos no programa padrão (só pelo Rust)
        // imagens das notas: http://anexo.localhost/<id> lê de %APPDATA%\brainote\anexos
        .register_asynchronous_uri_scheme_protocol("anexo", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_string();
            std::thread::spawn(move || responder.respond(attachments::serve(&app, &path)));
        })
        // guarda posição e tamanho da janela principal; quem decide se ela aparece é o setup (bandeja).
        // Os widgets guardam o lugar deles no banco.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() - StateFlags::VISIBLE)
                .with_filter(|label| label == "main")
                .build(),
        )
        .setup(|app| {
            // %APPDATA%\brainote\brainote.db
            let dir = app.path().data_dir()?.join("brainote");
            std::fs::create_dir_all(&dir)?;
            let conn = store::open(&dir.join("brainote.db"))?;
            attachments::cleanup(app.handle(), &conn);
            let main = app.get_webview_window("main").expect("janela principal");
            // aplica o vidro antes da primeira pintura, para a janela já abrir com a aparência salva
            if let Err(e) = apply_appearance(&main, &read_appearance(&conn)?) {
                eprintln!("efeito vidro indisponível: {e}"); // ex.: Windows 10 antigo; o app segue opaco
            }
            // iniciar com o Windows vem ligado na primeira abertura do app instalado
            if !cfg!(debug_assertions) && store::get_setting(&conn, "autostart")?.is_none() {
                app.autolaunch().enable()?;
                store::set_setting(&conn, "autostart", "1")?;
            }
            app.manage(Db(Mutex::new(conn)));
            app.manage(Vault(Mutex::new(None))); // notas com senha começam trancadas

            background::tray(app.handle())?;
            widgets::restore(app.handle());
            #[cfg(windows)]
            desktop::watch(app.handle().clone()); // Win+D não esconde os widgets
            // aberto pelo Windows ao ligar: fica só na bandeja (com os widgets na tela)
            if !std::env::args().any(|a| a == AUTOSTART_ARG) {
                background::show_main(app.handle());
            }
            background::start_scheduler(app.handle().clone());
            spell::warm_up();
            Ok(())
        })
        .on_window_event(|window, event| match widgets::id_of(window.label()) {
            Some(id) => widgets::on_window_event(window, id, event),
            // janela principal: fechar esconde na bandeja; o app só fecha pelo "Sair"
            None => {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                    // notas com senha trancam ao fechar: a tela salva o que falta e tranca (App.tsx);
                    // se ela não responder, tranca do mesmo jeito em 3 s
                    let _ = window.emit("relock", ());
                    let app = window.app_handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(3));
                        if app.get_webview_window("main").is_some_and(|w| !w.is_visible().unwrap_or(true)) {
                            set_vault(&app, None);
                        }
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            lock_state,
            create_password,
            unlock_notes,
            lock_notes,
            open_locked_note,
            lock_note,
            unlock_note,
            change_password,
            attach_files,
            save_attachment,
            open_attachment,
            save_attachment_as,
            spell_check,
            spell_suggest,
            spell_autocorrect,
            get_autocorrect,
            set_autocorrect,
            export_note,
            export_backup,
            import_backup,
            list_events,
            create_event,
            update_event,
            delete_event,
            list_widgets,
            get_widget,
            create_widget,
            delete_widget,
            set_widget_color,
            set_widget_on_top,
            set_widget_note,
            pick_widget_note,
            open_widget,
            list_reminders,
            create_reminder,
            update_reminder,
            delete_reminder,
            set_reminder_done,
            get_autostart,
            set_autostart,
            get_appearance,
            set_appearance,
            list_folders,
            create_folder,
            rename_folder,
            delete_folder,
            list_notes,
            get_note,
            search_notes,
            create_note,
            update_note,
            set_pinned,
            move_note,
            delete_note,
            restore_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    /// Importar: os anexos atuais saem do caminho antes de trocar o banco e voltam se a importação falhar.
    #[test]
    fn troca_de_anexos_na_importacao() {
        let tmp = std::env::temp_dir().join(format!("brainote-teste-{}", uuid::Uuid::new_v4()));
        let (current, incoming) = (tmp.join("anexos"), tmp.join("anexos-importando"));
        let put = |dir: &std::path::Path, name: &str| {
            std::fs::create_dir_all(dir).unwrap();
            std::fs::write(dir.join(name), b"x").unwrap();
        };
        // importação que falha: tudo volta como estava
        put(&current, "atual.png");
        put(&incoming, "do-backup.png");
        assert!(super::swap_attachments(&current, &tmp.join("antes-1"), &incoming, || Err("falhou".into())).is_err());
        assert!(current.join("atual.png").exists() && !tmp.join("antes-1").exists() && !incoming.exists());
        // backup .json (sem anexos): os atuais ficam guardados ao lado, longe da limpeza
        super::swap_attachments(&current, &tmp.join("antes-2"), &incoming, || Ok(())).unwrap();
        assert!(tmp.join("antes-2").join("atual.png").exists() && !current.exists());
        // backup .zip: os do backup entram no lugar, e os atuais ficam guardados
        put(&current, "atual-2.png");
        put(&incoming, "do-backup.png");
        super::swap_attachments(&current, &tmp.join("antes-3"), &incoming, || Ok(())).unwrap();
        assert!(current.join("do-backup.png").exists() && !current.join("atual-2.png").exists());
        assert!(tmp.join("antes-3").join("atual-2.png").exists() && !incoming.exists());
        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// Nota trancada: o texto aberto nunca vai para o banco, nem ao trancar nem ao salvar; só a chave certa abre.
    #[test]
    fn nota_trancada_nunca_grava_texto_aberto() {
        use crate::{store, vault};
        let tmp = std::env::temp_dir().join(format!("brainote-teste-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();
        let c = store::open(&tmp.join("teste.db")).unwrap();
        let key = vault::derive("senha", &vault::new_salt()).unwrap();
        let doc = r#"{"type":"doc"}"#;
        let n = store::create_note(&c, None).unwrap();
        super::save_note(&c, None, &n.id, "Banco", doc, "agência 1234").unwrap();
        assert!(super::lock_body(&c, &key, &n.id).unwrap());
        assert!(!super::lock_body(&c, &key, &n.id).unwrap()); // trancar de novo não muda nada
        assert!(super::save_note(&c, None, &n.id, "Banco", doc, "agência 5678").is_err()); // sem a chave, recusa
        super::save_note(&c, Some(&key), &n.id, "Banco", doc, "agência 5678").unwrap();
        let (json, text, sealed) = store::note_body(&c, &n.id).unwrap();
        assert!(json.is_none() && text.is_empty() && sealed.is_some());
        assert!(store::search_notes(&c, "agencia").unwrap().is_empty());
        assert_eq!(super::open_body(&c, &key, &n.id).unwrap().plain_text, "agência 5678");
        let other = vault::derive("outra", &vault::new_salt()).unwrap();
        assert!(super::open_body(&c, &other, &n.id).is_err());
        // nota com imagem não tranca
        let img = store::create_note(&c, None).unwrap();
        super::save_note(&c, None, &img.id, "Foto", r#"{"type":"doc","content":[{"type":"image","attrs":{"src":"anexo:x"}}]}"#, "").unwrap();
        assert!(super::lock_body(&c, &key, &img.id).is_err());
        drop(c);
        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// O backup .zip devolve os dados e extrai só o que está em "anexos/", sem sair da pasta.
    #[test]
    fn backup_zip() {
        let tmp = std::env::temp_dir().join(format!("brainote-teste-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();
        let path = tmp.join("backup.zip");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        zip.start_file("brainote.json", opts).unwrap();
        zip.write_all(br#"{"app":"brainote"}"#).unwrap();
        zip.start_file("anexos/0f8fad5b-d9cb-469f-a165-70867728950e/foto.png", opts).unwrap();
        zip.write_all(b"png").unwrap();
        zip.start_file("../fora.txt", opts).unwrap(); // arquivo malicioso tentando sair da pasta
        zip.write_all(b"x").unwrap();
        zip.finish().unwrap();

        let into = tmp.join("anexos-importando");
        let data = super::unpack_backup(&path, &into).unwrap();
        assert_eq!(data["app"], "brainote");
        assert_eq!(std::fs::read(into.join("0f8fad5b-d9cb-469f-a165-70867728950e").join("foto.png")).unwrap(), b"png");
        assert!(!tmp.join("fora.txt").exists() && !std::env::temp_dir().join("fora.txt").exists());
        assert!(super::unpack_backup(&tmp.join("nao-existe.zip"), &into).is_err());
        std::fs::remove_dir_all(&tmp).unwrap();
    }
}
