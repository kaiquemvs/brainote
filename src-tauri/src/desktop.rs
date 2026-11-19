//! Win+D ("mostrar área de trabalho"): o Windows não minimiza os widgets, ele põe a área de
//! trabalho (Progman) na frente deles. Este vigia percebe isso e sobe os widgets para a frente;
//! quando outra janela fica ativa, eles voltam para o fundo (docs/ESPECIFICACAO.md, 5).
//!
//! Um clique comum na área de trabalho também a deixa ativa, mas ela continua no fundo da pilha;
//! por isso só reagimos quando ela está de fato na frente de um widget.

use crate::background::with_db;
use crate::store;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, GetClassNameW, GetForegroundWindow, GetMessageW, GetWindow, PostMessageW, SendMessageW, EVENT_SYSTEM_FOREGROUND,
    GW_HWNDNEXT, MSG, WINEVENT_OUTOFCONTEXT, WM_NCACTIVATE,
};

static APP: OnceLock<AppHandle> = OnceLock::new();
/// Os widgets estão na frente da área de trabalho por causa de um Win+D.
static RAISED: AtomicBool = AtomicBool::new(false);

pub fn watch(app: AppHandle) {
    let _ = APP.set(app);
    // o aviso do Windows chega pela fila de mensagens da thread que pediu
    std::thread::spawn(|| unsafe {
        let _hook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, None, Some(on_foreground), 0, 0, WINEVENT_OUTOFCONTEXT);
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {}
    });
}

/// Widgets que ficam no fundo (os "Manter por cima" não precisam de ajuda).
fn bottom_widgets(app: &AppHandle) -> Vec<WebviewWindow> {
    with_db(app, store::list_widgets)
        .unwrap_or_default()
        .into_iter()
        .filter(|w| !w.on_top)
        .filter_map(|w| app.get_webview_window(&format!("widget-{}", w.id)))
        .collect()
}

/// A janela é a área de trabalho com os ícones (Progman, ou WorkerW em algumas versões).
fn is_desktop(hwnd: HWND) -> bool {
    let mut buf = [0u16; 32];
    let len = unsafe { GetClassNameW(hwnd, &mut buf) } as usize;
    let class = String::from_utf16_lossy(&buf[..len]);
    (class == "Progman" || class == "WorkerW")
        && unsafe { FindWindowExW(Some(hwnd), None, w!("SHELLDLL_DefView"), None) }.is_ok()
}

/// `widget` está abaixo de `above` na pilha de janelas.
fn is_below(above: HWND, widget: HWND) -> bool {
    let mut h = above;
    while let Ok(next) = unsafe { GetWindow(h, GW_HWNDNEXT) } {
        if next == widget {
            return true;
        }
        h = next;
    }
    false
}

extern "system" fn on_foreground(_: HWINEVENTHOOK, _: u32, hwnd: HWND, _: i32, _: i32, _: u32, _: u32) {
    let Some(app) = APP.get() else { return };
    // O Windows às vezes desliga o "ativa" sem passar pelo aviso (ex.: ao piscar na barra de tarefas, ao
    // bloquear a tela); a cada troca de janela ativa, as do brainote voltam a ficar com o vidro ativo.
    for w in app.webview_windows().values() {
        if let Ok(h) = w.hwnd() {
            let _ = unsafe { PostMessageW(Some(h), WM_NCACTIVATE, WPARAM(1), LPARAM(0)) };
        }
    }
    let widgets = bottom_widgets(app);
    let hwnds: Vec<HWND> = widgets.iter().filter_map(|w| w.hwnd().ok()).collect();

    if is_desktop(hwnd) {
        // O aviso chega antes de o Explorer pôr a área de trabalho na frente: confere por até 1 s.
        let (desk, ids) = (hwnd.0 as isize, hwnds.iter().map(|h| h.0 as isize).collect::<Vec<_>>());
        std::thread::spawn(move || {
            for _ in 0..10 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if unsafe { GetForegroundWindow() }.0 as isize != desk {
                    return; // já saiu da área de trabalho
                }
                if ids.iter().any(|&w| is_below(HWND(desk as _), HWND(w as _))) {
                    RAISED.store(true, Ordering::SeqCst);
                    for w in &widgets {
                        // tirar do fundo e passar por "sempre por cima" deixa o widget no topo das janelas comuns
                        let _ = w.set_always_on_bottom(false);
                        let _ = w.set_always_on_top(true);
                        let _ = w.set_always_on_top(false);
                    }
                    return;
                }
            }
        });
    } else if !hwnds.contains(&hwnd) && RAISED.swap(false, Ordering::SeqCst) {
        // outra janela ficou ativa (fim do Win+D): os widgets voltam para o fundo
        for w in &widgets {
            let _ = w.set_always_on_bottom(true);
        }
    }
}

/// O Windows 11 desenha o vidro (Acrylic) opaco quando outra janela está ativa. Aqui a janela sempre
/// responde ao Windows como "ativa" (WM_NCACTIVATE) e o vidro fica igual com ou sem foco. O foco de
/// verdade (teclado) não muda. Chamar de novo na mesma janela não instala nada a mais.
pub fn keep_glass_active(w: &WebviewWindow) {
    unsafe extern "system" fn proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM, _: usize, _: usize) -> LRESULT {
        let wp = if msg == WM_NCACTIVATE { WPARAM(1) } else { wp };
        unsafe { DefSubclassProc(hwnd, msg, wp, lp) }
    }
    if let Ok(hwnd) = w.hwnd() {
        unsafe {
            let _ = SetWindowSubclass(hwnd, Some(proc), 1, 0);
            // janela que ainda não recebeu foco (widget, app recém-aberto) já começa com o vidro ativo
            SendMessageW(hwnd, WM_NCACTIVATE, Some(WPARAM(1)), Some(LPARAM(0)));
        }
    }
}
