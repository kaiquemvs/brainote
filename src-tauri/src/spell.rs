//! Corretor ortográfico de português do Brasil e inglês (docs/ESPECIFICACAO.md, 13 — versão 1.1).
//! O corretor do WebView2 só usa o idioma do Windows (testado: marcava "receive" como erro). Aqui
//! uma palavra só está errada se faltar nos dois dicionários, que vão embutidos no app.

use spellbook::Dictionary;
use std::sync::OnceLock;

static DICTS: OnceLock<Vec<Dictionary>> = OnceLock::new();

fn dicts() -> &'static [Dictionary] {
    DICTS.get_or_init(|| {
        [
            (include_str!("../dicionarios/pt-BR.aff"), include_str!("../dicionarios/pt-BR.dic")),
            (include_str!("../dicionarios/en-US.aff"), include_str!("../dicionarios/en-US.dic")),
        ]
        .iter()
        .filter_map(|(aff, dic)| Dictionary::new(aff, dic).map_err(|e| eprintln!("dicionário: {e}")).ok())
        .collect()
    })
}

/// Carrega os dicionários em segundo plano ao abrir o app (o de português leva um instante).
pub fn warm_up() {
    std::thread::spawn(|| {
        dicts();
    });
}

/// Para cada palavra: `true` se ela existe em português ou em inglês.
pub fn check(words: &[String]) -> Vec<bool> {
    words.iter().map(|w| dicts().iter().any(|d| d.check(w))).collect()
}

/// As sugestões de cada idioma, na ordem do dicionário (a melhor primeiro).
fn suggestions(word: &str) -> Vec<Vec<String>> {
    dicts()
        .iter()
        .map(|d| {
            let mut out = Vec::new();
            d.suggest(word, &mut out);
            out
        })
        .collect()
}

/// Até 6 sugestões, alternando português e inglês (a palavra errada pode ser de qualquer um dos dois).
pub fn suggest(word: &str) -> Vec<String> {
    let lists = suggestions(word);
    // o dicionário às vezes sugere "quebrar" a palavra ("re cieve"): só vale se cada parte existir
    let real = |w: &str| w.split(' ').all(|part| dicts().iter().any(|d| d.check(part)));
    let mut out: Vec<String> = Vec::new();
    for i in 0..lists.iter().map(Vec::len).max().unwrap_or(0) {
        for w in lists.iter().filter_map(|l| l.get(i)) {
            if !out.contains(w) && real(w) {
                out.push(w.clone());
            }
        }
    }
    out.truncate(6);
    out
}

/// Correção automática: devolve a troca só quando ela é quase certa. Olha a 1ª sugestão de cada idioma
/// e só aceita a que muda acentos ou uma letra (trocada, a mais, a menos, ou duas vizinhas invertidas).
/// Palavra com maiúscula (pode ser um nome) só ganha acento. Se os dois idiomas sugerirem coisas
/// diferentes e igualmente parecidas, não mexe. `None` = deixa como está.
pub fn autocorrect(word: &str) -> Option<String> {
    if word.chars().count() < 3 || check(&[word.to_string()])[0] {
        return None;
    }
    let typed = plain(word);
    let limit = if word.starts_with(char::is_uppercase) { 0 } else { 1 };
    let mut picks: Vec<(usize, String)> = suggestions(word)
        .into_iter()
        .filter_map(|l| l.into_iter().find(|s| !s.contains(' '))) // "Por tugues" não conta
        .filter(|s| s.to_uppercase() != *s) // nunca vira sigla ("www" não é "WWW")
        .map(|s| (distance(&typed, &plain(&s)), s))
        .filter(|(d, _)| *d <= limit)
        .collect();
    picks.sort();
    picks.dedup_by(|a, b| a.1 == b.1);
    match picks.as_slice() {
        [(_, s)] => Some(s.clone()),
        [(d1, s), (d2, _)] if d1 < d2 => Some(s.clone()),
        _ => None,
    }
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

    #[test]
    fn portugues_e_ingles_juntos() {
        let words = ["casa", "exceção", "reunião", "Brasil", "receive", "definitely", "house", "caza", "exeção", "recieve", "houze"];
        let ok: Vec<bool> = check(&words.map(String::from));
        assert_eq!(ok, [true, true, true, true, true, true, true, false, false, false, false]);
        assert_eq!(suggest("recieve").first().map(String::as_str), Some("receive"));
        assert!(suggest("recieve").iter().all(|w| w.split(' ').all(|p| check(&[p.to_string()])[0]))); // sem "re cieve"
        assert!(suggest("exeção").contains(&"exceção".to_string()));
        assert!(suggest("caza").iter().any(|w| w == "casa"));
    }

    #[test]
    fn correcao_automatica() {
        for w in ["excecao", "recieve", "beautifull", "definately", "Portugues"] {
            println!("{w} -> {:?}   sugestões: {:?}", autocorrect(w), suggest(w));
        }
        assert_eq!(autocorrect("excecao").as_deref(), Some("exceção")); // só acento
        assert_eq!(autocorrect("recieve").as_deref(), Some("receive")); // letras invertidas
        assert_eq!(autocorrect("beautifull").as_deref(), Some("beautiful")); // letra a mais
        assert_eq!(autocorrect("Portugues").as_deref(), Some("Português")); // maiúscula: acento pode
        assert_eq!(autocorrect("voce").as_deref(), Some("você")); // "voice" em inglês fica atrás
        assert_eq!(autocorrect("casa"), None); // já está certa
        assert_eq!(autocorrect("www"), None);
        assert_eq!(autocorrect("Kaique"), None); // nome: não inventa
        assert_eq!(autocorrect("qwrtzx"), None); // nada parecido
        assert_eq!(distance(&plain("ab"), &plain("ba")), 1);
    }
}
