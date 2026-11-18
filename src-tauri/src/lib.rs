mod store;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Manager, State};

struct Db(Mutex<Connection>);

type Res<T> = Result<T, String>;

/// Roda uma operação do banco e transforma o erro em texto para a tela.
fn with<T>(db: &State<Db>, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Res<T> {
    let conn = db.0.lock().unwrap_or_else(|e| e.into_inner());
    f(&conn).map_err(|e| e.to_string())
}

fn folder_name(name: &str) -> Res<&str> {
    let name = name.trim();
    if name.is_empty() {
        return Err("O nome da pasta não pode ficar vazio.".into());
    }
    Ok(name)
}

#[tauri::command]
fn list_folders(db: State<Db>) -> Res<Vec<store::Folder>> {
    with(&db, store::list_folders)
}

#[tauri::command]
fn create_folder(db: State<Db>, name: &str) -> Res<store::Folder> {
    let name = folder_name(name)?;
    with(&db, |c| store::create_folder(c, name))
}

#[tauri::command]
fn rename_folder(db: State<Db>, id: &str, name: &str) -> Res<()> {
    let name = folder_name(name)?;
    with(&db, |c| store::rename_folder(c, id, name))
}

#[tauri::command]
fn delete_folder(db: State<Db>, id: &str) -> Res<()> {
    with(&db, |c| store::delete_folder(c, id))
}

#[tauri::command]
fn list_notes(db: State<Db>) -> Res<Vec<store::Note>> {
    with(&db, store::list_notes)
}

#[tauri::command]
fn search_notes(db: State<Db>, query: &str) -> Res<Vec<String>> {
    with(&db, |c| store::search_notes(c, query))
}

#[tauri::command]
fn create_note(db: State<Db>, folder_id: Option<&str>) -> Res<store::Note> {
    with(&db, |c| store::create_note(c, folder_id))
}

#[tauri::command]
fn update_note(db: State<Db>, id: &str, title: &str, content_json: &str, plain_text: &str) -> Res<()> {
    // JSON quebrado deixaria a nota impossível de abrir: recusa antes de gravar
    serde_json::from_str::<serde_json::Value>(content_json).map_err(|e| format!("Conteúdo inválido: {e}"))?;
    with(&db, |c| store::update_note(c, id, title, content_json, plain_text))
}

#[tauri::command]
fn set_pinned(db: State<Db>, id: &str, pinned: bool) -> Res<()> {
    with(&db, |c| store::set_pinned(c, id, pinned))
}

#[tauri::command]
fn move_note(db: State<Db>, id: &str, folder_id: Option<&str>) -> Res<()> {
    with(&db, |c| store::move_note(c, id, folder_id))
}

#[tauri::command]
fn delete_note(db: State<Db>, id: &str) -> Res<()> {
    with(&db, |c| store::delete_note(c, id))
}

#[tauri::command]
fn restore_note(db: State<Db>, id: &str) -> Res<()> {
    with(&db, |c| store::restore_note(c, id))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // guarda posição e tamanho da janela num arquivo próprio do plugin
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // %APPDATA%\brainote\brainote.db
            let dir = app.path().data_dir()?.join("brainote");
            std::fs::create_dir_all(&dir)?;
            app.manage(Db(Mutex::new(store::open(&dir.join("brainote.db"))?)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_folders,
            create_folder,
            rename_folder,
            delete_folder,
            list_notes,
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
