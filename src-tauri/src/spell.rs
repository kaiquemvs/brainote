//! Corretor ortográfico de português do Brasil e inglês (docs/ESPECIFICACAO.md, 13 — versões 1.1 e 1.3).
//! Português: o corretor do próprio Windows (winspell.rs), o mesmo do Edge e do Teams; sem ele, o
//! dicionário embutido. Inglês: o dicionário embutido (o Windows em português não traz o de inglês).
//! Uma palavra só está errada se faltar nos dois idiomas. O idioma da nota ("pt" ou "en") decide de onde
//! vêm primeiro as sugestões e a correção automática.

use crate::winspell;
use spellbook::Dictionary;
use std::sync::OnceLock;

static PT: OnceLock<Option<Dictionary>> = OnceLock::new();
static EN: OnceLock<Option<Dictionary>> = OnceLock::new();

fn load(aff: &str, dic: &str) -> Option<Dictionary> {
    Dictionary::new(aff, dic).map_err(|e| eprintln!("dicionário: {e}")).ok()
}

/// Dicionário embutido de português: só é carregado se o Windows não tiver o corretor.
fn hunspell_pt() -> Option<&'static Dictionary> {
    PT.get_or_init(|| load(include_str!("../dicionarios/pt-BR.aff"), include_str!("../dicionarios/pt-BR.dic"))).as_ref()
}

fn hunspell_en() -> Option<&'static Dictionary> {
    EN.get_or_init(|| load(include_str!("../dicionarios/en-US.aff"), include_str!("../dicionarios/en-US.dic"))).as_ref()
}

fn hunspell_suggest(d: Option<&Dictionary>, word: &str) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(d) = d {
        d.suggest(word, &mut out);
    }
    out
}

/// Abre o corretor do Windows e carrega os dicionários em segundo plano ao abrir o app.
pub fn warm_up() {
    std::thread::spawn(|| {
        if !winspell::warm_up() {
            hunspell_pt();
        }
        hunspell_en();
    });
}

/// Para cada palavra: `true` se ela existe em português ou em inglês.
pub fn check(words: &[String]) -> Vec<bool> {
    let pt = winspell::check(words.to_vec())
        .unwrap_or_else(|| words.iter().map(|w| hunspell_pt().is_some_and(|d| d.check(w))).collect());
    words.iter().zip(pt).map(|(w, ok)| ok || hunspell_en().is_some_and(|d| d.check(w))).collect()
}

fn is_word(w: &str) -> bool {
    check(&[w.to_string()])[0]
}

/// As sugestões de cada idioma (a melhor primeiro), o idioma da nota antes.
fn suggestions(word: &str, lang: &str) -> [Vec<String>; 2] {
    let pt = winspell::suggest(word.to_string()).unwrap_or_else(|| hunspell_suggest(hunspell_pt(), word));
    let en = hunspell_suggest(hunspell_en(), word);
    if lang == "en" { [en, pt] } else { [pt, en] }
}

/// Até 6 sugestões: primeiro até 4 do idioma da nota, depois as do outro.
pub fn suggest(word: &str, lang: &str) -> Vec<String> {
    let [first, second] = suggestions(word, lang);
    // o corretor às vezes sugere "quebrar" a palavra ("re cieve"): só vale se cada parte existir
    let real = |w: &str| w.split(' ').all(is_word);
    let mut out: Vec<String> = Vec::new();
    for w in first.iter().take(4).chain(&second).chain(first.iter().skip(4)) {
        if out.len() == 6 {
            break;
        }
        if !out.contains(w) && real(w) {
            out.push(w.clone());
        }
    }
    out
}

/// Correção automática: devolve a troca só quando ela é quase certa. Em nota em português, vale primeiro a
/// troca que o próprio Windows faz ("voce" → "você"). Senão, olha a 1ª sugestão de cada idioma e só aceita a
/// que muda acentos ou uma letra (trocada, a mais, a menos, ou duas vizinhas invertidas); empate fica com o
/// idioma da nota. Palavra com maiúscula (pode ser um nome) só ganha acento. `None` = deixa como está.
pub fn autocorrect(word: &str, lang: &str) -> Option<String> {
    if word.chars().count() < 3 || is_word(word) {
        return None;
    }
    if lang != "en" {
        if let Some(fix) = winspell::replacement(word.to_string()) {
            return Some(fix);
        }
    }
    let typed = plain(word);
    let limit = if word.starts_with(char::is_uppercase) { 0 } else { 1 };
    suggestions(word, lang)
        .into_iter()
        .filter_map(|l| l.into_iter().find(|s| !s.contains(' '))) // "Por tugues" não conta
        .filter(|s| s.to_uppercase() != *s) // nunca vira sigla ("www" não é "WWW")
        .map(|s| (distance(&typed, &plain(&s)), s))
        .filter(|(d, _)| *d <= limit)
        .min_by_key(|(d, _)| *d) // a mais parecida; empate: a primeira, do idioma da nota
        .map(|(_, s)| s)
}

/// Minúsculas e sem acento, para comparar "excecao" com "exceção".
fn plain(w: &str) -> Vec<char> {
    w.to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            c => c,
        })
        .collect()
}

/// Quantas edições separam as palavras: trocar, pôr ou tirar uma letra, ou inverter duas vizinhas.
fn distance(a: &[char], b: &[char]) -> usize {
    let mut d = vec![vec![0; b.len() + 1]; a.len() + 1];
    for i in 0..=a.len() {
        d[i][0] = i;
    }
    for j in 0..=b.len() {
        d[0][j] = j;
    }
    for i in 1..=a.len() {
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            d[i][j] = (d[i - 1][j] + 1).min(d[i][j - 1] + 1).min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }
    d[a.len()][b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    // Estes testes usam o corretor de português do Windows desta máquina (sem ele, o dicionário embutido).
    #[test]
    fn portugues_e_ingles_juntos() {
        let words = ["casa", "exceção", "reunião", "Brasil", "receive", "definitely", "house", "caza", "exeção", "recieve", "houze"];
        let ok: Vec<bool> = check(&words.map(String::from));
        assert_eq!(ok, [true, true, true, true, true, true, true, false, false, false, false]);
        assert_eq!(suggest("recieve", "en").first().map(String::as_str), Some("receive"));
        assert!(suggest("recieve", "pt").contains(&"receive".to_string())); // o inglês entra depois do português
        assert!(suggest("recieve", "en").iter().all(|w| w.split(' ').all(is_word))); // sem "re cieve"
        assert!(suggest("exeção", "pt").contains(&"exceção".to_string()));
        assert!(suggest("caza", "pt").iter().any(|w| w == "casa"));
        assert!(suggest("mecher", "pt").iter().any(|w| w == "mexer"));
    }

    #[test]
    fn correcao_automatica() {
        for w in ["excecao", "recieve", "beautifull", "definately", "Portugues", "nao", "concerteza", "sabado"] {
            println!("{w} -> {:?}   sugestões: {:?}", autocorrect(w, "pt"), suggest(w, "pt"));
        }
        assert_eq!(autocorrect("excecao", "pt").as_deref(), Some("exceção")); // só acento
        assert_eq!(autocorrect("nao", "pt").as_deref(), Some("não"));
        assert_eq!(autocorrect("recieve", "pt").as_deref(), Some("receive")); // letras invertidas, do inglês
        assert_eq!(autocorrect("beautifull", "en").as_deref(), Some("beautiful")); // letra a mais
        assert_eq!(autocorrect("Portugues", "pt").as_deref(), Some("Português")); // maiúscula: acento pode
        assert_eq!(autocorrect("voce", "pt").as_deref(), Some("você")); // "voice" em inglês fica atrás
        assert_eq!(autocorrect("casa", "pt"), None); // já está certa
        assert_eq!(autocorrect("house", "pt"), None); // certa em inglês: nota em português não mexe
        assert_eq!(autocorrect("www", "pt"), None);
        assert_eq!(autocorrect("Kaique", "pt"), None); // nome: não inventa
        assert_eq!(autocorrect("qwrtzx", "pt"), None); // nada parecido
        assert_eq!(distance(&plain("ab"), &plain("ba")), 1);
    }
}
