mod background;
mod store;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::window::{Effect, EffectsBuilder};
use tauri::{AppHandle, Manager, State, Theme, WebviewWindow, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_window_state::StateFlags;

/// Argumento que o Windows passa ao abrir o app junto com o sistema.
const AUTOSTART_ARG: &str = "--autostart";

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

/// Tema ("light" ou "dark") e efeito vidro, guardados na tabela `settings`.
#[derive(Serialize, Deserialize)]
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

/// Vidro = Acrylic do Windows 11 (desfoca o que está atrás da janela; o Mica ficou fraco demais).
/// A variante clara/escura do Acrylic segue o tema da janela, por isso o `set_theme`.
fn apply_appearance(w: &WebviewWindow, a: &Appearance) -> tauri::Result<()> {
    w.set_theme(Some(if a.theme == "dark" { Theme::Dark } else { Theme::Light }))?;
    w.set_effects(a.glass.then(|| EffectsBuilder::new().effect(Effect::Acrylic).build()))
}

#[tauri::command]
fn get_appearance(db: State<Db>) -> Res<Appearance> {
    with(&db, read_appearance)
}

#[tauri::command]
fn set_appearance(window: WebviewWindow, db: State<Db>, appearance: Appearance) -> Res<()> {
    if appearance.theme != "light" && appearance.theme != "dark" {
        return Err("Tema inválido.".into());
    }
    with(&db, |c| {
        store::set_setting(c, "theme", &appearance.theme)?;
        store::set_setting(c, "glass", if appearance.glass { "1" } else { "0" })
    })?;
    apply_appearance(&window, &appearance).map_err(|e| e.to_string())
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

// ---------- Lembretes ----------

fn check_reminder(r: &store::ReminderInput) -> Res<()> {
    if r.title.trim().is_empty() {
        return Err("O lembrete precisa de um título.".into());
    }
    chrono::DateTime::parse_from_rfc3339(&r.due_at).map_err(|_| "Data do lembrete inválida.")?;
    if !["none", "daily", "weekly", "monthly"].contains(&r.repeat.as_str()) {
        return Err("Repetição inválida.".into());
    }
    Ok(())
}

#[tauri::command]
fn list_reminders(db: State<Db>) -> Res<Vec<store::Reminder>> {
    with(&db, store::list_reminders)
}

#[tauri::command]
fn create_reminder(db: State<Db>, reminder: store::ReminderInput) -> Res<store::Reminder> {
    check_reminder(&reminder)?;
    with(&db, |c| store::create_reminder(c, &reminder))
}

#[tauri::command]
fn update_reminder(db: State<Db>, id: &str, reminder: store::ReminderInput) -> Res<()> {
    check_reminder(&reminder)?;
    with(&db, |c| store::update_reminder(c, id, &reminder))
}

#[tauri::command]
fn delete_reminder(db: State<Db>, id: &str) -> Res<()> {
    with(&db, |c| store::delete_reminder(c, id))
}

#[tauri::command]
fn set_reminder_done(db: State<Db>, id: &str, done: bool) -> Res<()> {
    with(&db, |c| store::set_reminder_done(c, id, done))
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
        // guarda posição e tamanho da janela; quem decide se ela aparece é o setup (bandeja)
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(StateFlags::all() - StateFlags::VISIBLE).build())
        .setup(|app| {
            // %APPDATA%\brainote\brainote.db
            let dir = app.path().data_dir()?.join("brainote");
            std::fs::create_dir_all(&dir)?;
            let conn = store::open(&dir.join("brainote.db"))?;
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

            background::tray(app.handle())?;
            // aberto pelo Windows ao ligar: fica só na bandeja
            if !std::env::args().any(|a| a == AUTOSTART_ARG) {
                background::show_main(app.handle());
            }
            background::start_scheduler(app.handle().clone());
            Ok(())
        })
        // fechar a janela esconde na bandeja; o app só fecha pelo "Sair" da bandeja
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
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
