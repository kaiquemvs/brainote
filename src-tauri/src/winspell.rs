//! Corretor do próprio Windows (o mesmo do Edge e do Teams) para o português do Brasil
//! (docs/ESPECIFICACAO.md, 13 — versão 1.3). É um objeto COM: vive numa thread só dele, e as outras
//! threads mandam pedidos por um canal. Sem o corretor de português no Windows, tudo devolve `None`
//! e o app usa o dicionário embutido (spell.rs).

use std::sync::mpsc::{channel, Sender};
use std::sync::OnceLock;
use windows::core::{HSTRING, PWSTR};
use windows::Win32::Foundation::S_OK;
use windows::Win32::Globalization::{
    IEnumSpellingError, ISpellChecker, ISpellCheckerFactory, ISpellingError, SpellCheckerFactory, CORRECTIVE_ACTION_REPLACE,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};

type Job = Box<dyn FnOnce(&ISpellChecker) + Send>;
static JOBS: OnceLock<Option<Sender<Job>>> = OnceLock::new();

/// Abre a thread do corretor na primeira chamada; `None` se o Windows não tem o corretor de português.
fn jobs() -> Option<&'static Sender<Job>> {
    JOBS.get_or_init(|| {
        let (tx, rx) = channel::<Job>();
        let (ready, is_ready) = channel();
        std::thread::spawn(move || unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let open = || -> windows::core::Result<Option<ISpellChecker>> {
                let factory: ISpellCheckerFactory = CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER)?;
                let tag = HSTRING::from("pt-BR");
                if !factory.IsSupported(&tag)?.as_bool() {
                    return Ok(None);
                }
                factory.CreateSpellChecker(&tag).map(Some)
            };
            let checker = open().unwrap_or_else(|e| {
                eprintln!("corretor do Windows: {e}");
                None
            });
            let _ = ready.send(checker.is_some());
            if let Some(c) = checker {
                for job in rx {
                    job(&c);
                }
            }
        });
        is_ready.recv().unwrap_or(false).then_some(tx)
    })
    .as_ref()
}

/// Roda `f` na thread do corretor e espera a resposta.
fn run<T: Send + 'static>(f: impl FnOnce(&ISpellChecker) -> T + Send + 'static) -> Option<T> {
    let (tx, rx) = channel();
    jobs()?.send(Box::new(move |c| _ = tx.send(f(c)))).ok()?;
    rx.recv().ok()
}

/// Abre a thread do corretor em segundo plano (na abertura do app).
pub fn warm_up() -> bool {
    jobs().is_some()
}

unsafe fn first_error(errors: &IEnumSpellingError) -> Option<ISpellingError> {
    let mut e = None;
    // S_FALSE (também "sucesso") = acabou a lista, sem erro
    (unsafe { errors.Next(&mut e) } == S_OK).then_some(e).flatten()
}

/// Texto devolvido pelo Windows, que precisa ser liberado depois de lido.
unsafe fn take(p: PWSTR) -> Option<String> {
    let s = unsafe { p.to_string() }.ok();
    unsafe { CoTaskMemFree(Some(p.0 as _)) };
    s
}

/// Para cada palavra: `true` se ela existe em português.
pub fn check(words: Vec<String>) -> Option<Vec<bool>> {
    run(move |c| {
        words
            .iter()
            .map(|w| unsafe { c.Check(&HSTRING::from(w.as_str())) }.is_ok_and(|e| unsafe { first_error(&e) }.is_none()))
            .collect()
    })
}

/// Sugestões do Windows para a palavra, a melhor primeiro.
pub fn suggest(word: String) -> Option<Vec<String>> {
    run(move |c| {
        let mut out = Vec::new();
        let Ok(list) = (unsafe { c.Suggest(&HSTRING::from(word.as_str())) }) else { return out };
        loop {
            let mut item = [PWSTR::null()];
            let mut got = 0;
            if unsafe { list.Next(&mut item, Some(&mut got)) } != S_OK || got == 0 {
                break;
            }
            out.extend(unsafe { take(item[0]) });
        }
        out
    })
}

/// A troca que o próprio Windows faz sozinho, quando existe ("voce" → "você", "concerteza" → "com certeza").
pub fn replacement(word: String) -> Option<String> {
    run(move |c| unsafe {
        let e = first_error(&c.ComprehensiveCheck(&HSTRING::from(word.as_str())).ok()?)?;
        if e.CorrectiveAction().ok()? != CORRECTIVE_ACTION_REPLACE {
            return None;
        }
        take(e.Replacement().ok()?)
    })
    .flatten()
}
