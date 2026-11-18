//! O que funciona com a janela fechada: bandeja, agendador de lembretes e notificações
//! do Windows (docs/ESPECIFICACAO.md, seções 6 e 7).

use crate::{store, Db};
use chrono::{DateTime, Local};
use rusqlite::Connection;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_winrt_notification::{Scenario, Toast};

/// Mostra e foca a janela principal (bandeja, notificação, segunda instância).
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Banco a partir de qualquer thread; erro vira log, porque aqui não há tela para mostrar.
fn with_db<T>(app: &AppHandle, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Option<T> {
    let db = app.state::<Db>();
    let conn = db.0.lock().unwrap_or_else(|e| e.into_inner());
    f(&conn).map_err(|e| eprintln!("banco: {e}")).ok()
}

pub fn tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open", "Abrir brainote", true, None::<&str>)?,
            &MenuItem::with_id(app, "new-note", "Nova nota", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?,
        ],
    )?;
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().expect("ícone do app").clone())
        .tooltip("brainote")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => show_main(app),
            "new-note" => {
                show_main(app);
                let _ = app.emit("new-note", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// A cada 30 s, notifica os lembretes vencidos. Na primeira volta, vários atrasados
/// (venceram com o PC desligado) viram um aviso só.
pub fn start_scheduler(app: AppHandle) {
    std::thread::spawn(move || {
        let mut first = true;
        loop {
            let due = with_db(&app, store::due_reminders).unwrap_or_default();
            if first && due.len() > 1 {
                if notify_overdue(&app, due.len()) {
                    due.iter().for_each(|d| _ = with_db(&app, |c| store::mark_notified(c, &d.id)));
                }
            } else {
                for d in &due {
                    if notify(&app, d) {
                        with_db(&app, |c| store::mark_notified(c, &d.id));
                    }
                }
            }
            first = false;
            std::thread::sleep(Duration::from_secs(30));
        }
    });
}

/// App instalado: o atalho do Menu Iniciar registra o identificador e a notificação sai com o
/// nome e o ícone do brainote. Em desenvolvimento não há atalho, e o Windows exige um id conhecido.
fn app_id(app: &AppHandle) -> String {
    if cfg!(debug_assertions) { Toast::POWERSHELL_APP_ID.into() } else { app.config().identifier.clone() }
}

/// "Hoje, 16:00" ou "17/11, 16:00".
fn when_label(when: &str) -> String {
    let Ok(d) = DateTime::parse_from_rfc3339(when) else { return String::new() };
    let d = d.with_timezone(&Local);
    let fmt = if d.date_naive() == Local::now().date_naive() { "Hoje, %H:%M" } else { "%d/%m, %H:%M" };
    d.format(fmt).to_string()
}

/// Título do lembrete; corpo "Lembrete · Hoje, 16:00 · Nome da nota"; botões Concluir e Adiar.
/// O cenário "Lembrete" do Windows deixa a notificação na tela até a pessoa agir.
fn notify(app: &AppHandle, d: &store::Due) -> bool {
    let mut body = vec!["Lembrete".to_string(), when_label(&d.when)];
    body.extend(d.note_title.clone().filter(|t| !t.trim().is_empty()));
    let (handle, id) = (app.clone(), d.id.clone());
    Toast::new(&app_id(app))
        .title(&d.title)
        .text1(&body.join(" · "))
        .scenario(Scenario::Reminder)
        .add_button("Concluir", "done")
        .add_button("Adiar 10 min", "snooze")
        .on_activated(move |action| {
            match action.as_deref() {
                Some("done") => _ = with_db(&handle, |c| store::set_reminder_done(c, &id, true)),
                Some("snooze") => _ = with_db(&handle, |c| store::snooze_reminder(c, &id, 10)),
                _ => {
                    show_main(&handle);
                    let _ = handle.emit("open-reminder", Some(&id));
                }
            }
            let _ = handle.emit("data-changed", ());
            Ok(())
        })
        .show()
        .map_err(|e| eprintln!("notificação falhou: {e}"))
        .is_ok()
}

fn notify_overdue(app: &AppHandle, n: usize) -> bool {
    let handle = app.clone();
    Toast::new(&app_id(app))
        .title(&format!("Você tem {n} lembretes atrasados"))
        .text1("Clique para ver no brainote.")
        .on_activated(move |_| {
            show_main(&handle);
            let _ = handle.emit("open-reminder", None::<String>);
            Ok(())
        })
        .show()
        .map_err(|e| eprintln!("notificação falhou: {e}"))
        .is_ok()
}
