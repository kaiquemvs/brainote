//! Widgets na área de trabalho: cada um é uma janela própria (docs/ESPECIFICACAO.md, 5).

use crate::background::{changed, show_main, with_db};
use crate::{apply_appearance, read_appearance, store};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const PREFIX: &str = "widget-";
pub const COLORS: [&str; 4] = ["amarelo", "verde", "rosa", "azul"];

/// Tamanho padrão de cada tipo; `None` = tipo desconhecido.
pub fn default_size(kind: &str) -> Option<(f64, f64)> {
    match kind {
        "postit" => Some((260.0, 220.0)),
        "checklist" => Some((300.0, 320.0)),
        "agenda" => Some((300.0, 260.0)),
        _ => None,
    }
}

/// "widget-<id>" → "<id>".
pub fn id_of(label: &str) -> Option<&str> {
    label.strip_prefix(PREFIX)
}

fn window(app: &AppHandle, id: &str) -> Option<WebviewWindow> {
    app.get_webview_window(&format!("{PREFIX}{id}"))
}

/// Abre a janela do widget no lugar salvo: sem borda, fora da barra de tarefas e no fundo da tela.
pub fn open(app: &AppHandle, w: &store::Widget) -> tauri::Result<()> {
    let url = WebviewUrl::App(format!("index.html#widget={}", w.id).into());
    let mut builder = WebviewWindowBuilder::new(app, format!("{PREFIX}{}", w.id), url)
        .title("brainote")
        .decorations(false)
        .transparent(true)
        .shadow(true) // borda fina, cantos e sombra do próprio Windows 11
        .skip_taskbar(true)
        .maximizable(false)
        .min_inner_size(180.0, 140.0)
        .inner_size(w.width, w.height)
        .always_on_top(w.on_top)
        .always_on_bottom(!w.on_top)
        .focused(false)
        .visible(false);
    if let (Some(x), Some(y)) = (w.x, w.y) {
        builder = builder.position(x, y);
    }
    let win = builder.build()?;
    if let Some(look) = with_db(app, read_appearance) {
        let _ = apply_appearance(&win, &look);
    }
    win.show()
}

/// Cria o widget e abre a janela. No Windows, criar janela dentro de um comando síncrono ou de um
/// clique de menu trava o app: quem chama precisa estar num comando async ou numa thread separada.
pub fn create(app: &AppHandle, kind: &str, note_id: Option<&str>) -> Result<store::Widget, String> {
    let (width, height) = default_size(kind).ok_or("Tipo de widget inválido.")?;
    if kind != "agenda" && note_id.is_none() {
        return Err("Escolha uma nota para o widget.".into());
    }
    if note_id.is_some_and(|n| with_db(app, |c| store::note_body(c, n)).is_some_and(|b| b.2.is_some())) {
        return Err("Nota trancada não pode ficar na área de trabalho.".into());
    }
    let w = with_db(app, |c| store::create_widget(c, kind, note_id, width, height)).ok_or("Não foi possível criar o widget.")?;
    open(app, &w).map_err(|e| e.to_string())?;
    changed(app);
    Ok(w)
}

/// Fecha a janela (sem passar pelo "fechar") e apaga o widget.
pub fn remove(app: &AppHandle, id: &str) {
    with_db(app, |c| store::delete_widget(c, id));
    if let Some(win) = window(app, id) {
        let _ = win.destroy();
    }
    changed(app);
}

/// "Manter por cima" (menu do widget).
pub fn set_on_top(app: &AppHandle, id: &str, on_top: bool) {
    with_db(app, |c| store::set_widget_on_top(c, id, on_top));
    if let Some(win) = window(app, id) {
        let _ = win.set_always_on_top(on_top);
        let _ = win.set_always_on_bottom(!on_top);
    }
    changed(app);
}

/// Troca a nota do post-it ou do checklist (escolhida no app, a pedido do menu do widget).
pub fn set_note(app: &AppHandle, id: &str, note_id: &str) -> Result<(), String> {
    let w = with_db(app, |c| store::get_widget(c, id)).ok_or("Widget não encontrado.")?;
    if w.kind == "agenda" {
        return Err("O widget da agenda não mostra nota.".into());
    }
    let body = with_db(app, |c| store::note_body(c, note_id)).ok_or("Nota não encontrada.")?;
    if body.2.is_some() {
        return Err("Nota trancada não pode ficar na área de trabalho.".into());
    }
    with_db(app, |c| store::set_widget_note(c, id, note_id)).ok_or("Não foi possível trocar a nota.")?;
    changed(app);
    Ok(())
}

/// "Abrir no brainote": a nota do post-it/checklist; sem nota (widget da agenda), a tela de Agenda.
pub fn open_in_app(app: &AppHandle, note_id: Option<&str>) {
    show_main(app);
    let _ = match note_id {
        Some(id) => app.emit("open-note", id),
        None => app.emit("open-agenda", ()),
    };
}

/// Cliques no submenu Widgets da bandeja. Devolve `false` se o id não é de widget.
pub fn on_menu(app: &AppHandle, menu_id: &str) -> bool {
    let (action, id) = menu_id.split_once(':').unwrap_or((menu_id, ""));
    match action {
        "tw" => remove(app, id),
        "tw-agenda" => {
            let app = app.clone();
            std::thread::spawn(move || {
                if let Err(e) = create(&app, "agenda", None) {
                    eprintln!("widget: {e}");
                }
            });
        }
        "tw-add" => {
            show_main(app);
            let _ = app.emit("open-widget-menu", ());
        }
        _ => return false,
    }
    true
}

/// Depois de importar um backup: fecha as janelas de widget e abre as do backup.
pub fn reopen_all(app: &AppHandle) {
    let open = |app: &AppHandle| app.webview_windows().into_keys().filter(|l| id_of(l).is_some()).collect::<Vec<_>>();
    for label in open(app) {
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.destroy();
        }
    }
    // o backup pode trazer os mesmos widgets: espera as janelas antigas sumirem para reusar os nomes
    for _ in 0..40 {
        if open(app).is_empty() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    restore(app);
}

/// Abre todos os widgets salvos (na abertura do app).
pub fn restore(app: &AppHandle) {
    for w in with_db(app, store::list_widgets).unwrap_or_default() {
        if let Err(e) = open(app, &w) {
            eprintln!("widget {}: {e}", w.id);
        }
    }
}

/// Guarda posição e tamanho a cada movimento; fechar com Alt+F4 remove o widget.
pub fn on_window_event(win: &tauri::Window, id: &str, event: &tauri::WindowEvent) {
    let app = win.app_handle();
    let scale = win.scale_factor().unwrap_or(1.0);
    match event {
        tauri::WindowEvent::Moved(p) if !win.is_minimized().unwrap_or(false) => {
            let p = p.to_logical::<f64>(scale);
            with_db(app, |c| store::set_widget_position(c, id, p.x, p.y));
        }
        tauri::WindowEvent::Resized(s) if s.width > 0 && s.height > 0 => {
            let s = s.to_logical::<f64>(scale);
            with_db(app, |c| store::set_widget_size(c, id, s.width, s.height));
        }
        tauri::WindowEvent::CloseRequested { .. } => {
            with_db(app, |c| store::delete_widget(c, id));
            changed(app);
        }
        _ => {}
    }
}
