//! Win+D ("mostrar área de trabalho"): o Windows não minimiza os widgets, ele põe a área de
//! trabalho (Progman) na frente deles. Este vigia percebe isso e sobe os widgets para a frente;
//! quando outra janela fica ativa, eles voltam para o fundo (docs/ESPECIFICACAO.md, 5).
//!
//! Um clique comum na área de trabalho também a deixa ativa, mas ela continua no fundo da pilha;
//! por isso só reagimos quando ela está de fato na frente de um widget.
//!
//! Aqui também fica o vidro das janelas (`set_glass`).

use crate::background::with_db;
use crate::store;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, GetClassNameW, GetForegroundWindow, GetMessageW, GetWindow, EVENT_SYSTEM_FOREGROUND, GW_HWNDNEXT, MSG,
    WINEVENT_OUTOFCONTEXT,
};

static APP: OnceLock<AppHandle> = OnceLock::new();
/// Os widgets estão na frente da área de trabalho por causa de um Win+D.
static RAISED: AtomicBool = AtomicBool::new(false);
/// Há uma thread conferindo a área de trabalho enquanto ela está selecionada.
static WATCHING: AtomicBool = AtomicBool::new(false);

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

/// A área de trabalho está selecionada.
fn desktop_active() -> bool {
    is_desktop(unsafe { GetForegroundWindow() })
}

extern "system" fn on_foreground(_: HWINEVENTHOOK, _: u32, hwnd: HWND, _: i32, _: i32, _: u32, _: u32) {
    let Some(app) = APP.get() else { return };
    let widgets = bottom_widgets(app);

    if is_desktop(hwnd) {
        // Enquanto a área de trabalho estiver selecionada, confere se ela cobriu os widgets. O Win+D pode
        // chegar depois deste aviso (o Explorer às vezes demora) ou sem aviso nenhum (a área de trabalho
        // já estava selecionada, ex.: depois de um clique nela).
        if WATCHING.swap(true, Ordering::SeqCst) {
            return;
        }
        std::thread::spawn(move || {
            while desktop_active() {
                let desk = unsafe { GetForegroundWindow() };
                if widgets.iter().filter_map(|w| w.hwnd().ok()).any(|w| is_below(desk, w)) {
                    RAISED.store(true, Ordering::SeqCst);
                    for w in &widgets {
                        // tirar do fundo e passar por "sempre por cima" deixa o widget no topo das janelas comuns
                        let _ = w.set_always_on_bottom(false);
                        let _ = w.set_always_on_top(true);
                        let _ = w.set_always_on_top(false);
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(150));
            }
            WATCHING.store(false, Ordering::SeqCst);
        });
    } else if !widgets.iter().any(|w| w.hwnd().is_ok_and(|h| h == hwnd)) && RAISED.swap(false, Ordering::SeqCst) {
        // outra janela ficou ativa (fim do Win+D): os widgets voltam para o fundo
        for w in &widgets {
            let _ = w.set_always_on_bottom(true);
        }
    }
}

/// Vidro igual ao dos widgets do Rainmeter (TranslucentRM, tipo 4): o acrílico clássico do Windows desfoca o
/// que está atrás da janela e, ao contrário do acrílico novo do Windows 11, não fica opaco quando a janela
/// perde o foco. A cor por cima vem do CSS (App.css, "Efeito vidro"). Precisa rodar na thread da janela.
pub fn set_glass(w: &WebviewWindow, on: bool) {
    #[repr(C)]
    struct AccentPolicy {
        state: u32,
        flags: u32,
        color: u32, // AABBGGRR
        animation: u32,
    }
    #[repr(C)]
    struct Attribute {
        kind: u32,
        data: *mut AccentPolicy,
        size: usize,
    }
    // função do Windows sem documentação oficial (a mesma que o TranslucentRM usa)
    #[link(name = "user32", kind = "raw-dylib")]
    unsafe extern "system" {
        fn SetWindowCompositionAttribute(hwnd: HWND, data: *mut Attribute) -> i32;
    }
    const WCA_ACCENT_POLICY: u32 = 19;
    const ACCENT_DISABLED: u32 = 0;
    const ACCENT_ENABLE_ACRYLICBLURBEHIND: u32 = 4;
    // o acrílico não aceita cor 100% transparente: 1/255 de preto, invisível
    let mut policy = AccentPolicy {
        state: if on { ACCENT_ENABLE_ACRYLICBLURBEHIND } else { ACCENT_DISABLED },
        flags: 0,
        color: 0x0100_0000,
        animation: 0,
    };
    let mut attr = Attribute { kind: WCA_ACCENT_POLICY, data: &mut policy, size: size_of::<AccentPolicy>() };
    if let Ok(hwnd) = w.hwnd() {
        unsafe { SetWindowCompositionAttribute(hwnd, &mut attr) };
    }
}
