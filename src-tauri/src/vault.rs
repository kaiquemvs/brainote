//! Notas com senha (docs/ESPECIFICACAO.md, 13 — versão 1.2): uma senha só para todas as notas trancadas.
//! A senha nunca é guardada. Dela sai uma chave (Argon2id, lento de propósito contra quem tenta adivinhar)
//! que criptografa o conteúdo (XChaCha20-Poly1305, que também recusa qualquer alteração no texto cifrado).
//! A chave só existe na memória enquanto as notas estão destrancadas.

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, Generate, KeyInit};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};
use std::sync::Mutex;

pub type Secret = [u8; 32];

/// Chave das notas trancadas enquanto estão abertas; `None` = trancadas.
pub struct Vault(pub Mutex<Option<Secret>>);

/// Texto fixo criptografado ao criar a senha: abrir ele de volta prova que a senha digitada está certa.
const CHECK: &[u8] = b"brainote";
const NONCE_LEN: usize = 24;

pub fn new_salt() -> String {
    hex(&<[u8; 16]>::generate())
}

/// A mesma senha com o mesmo sal dá sempre a mesma chave.
pub fn derive(password: &str, salt_hex: &str) -> Option<Secret> {
    let salt = unhex(salt_hex)?;
    // 64 MB de memória e 3 passadas (recomendação da OWASP para Argon2id): cerca de meio segundo por tentativa
    let params = Params::new(64 * 1024, 3, 1, Some(32)).ok()?;
    let mut key = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params).hash_password_into(password.as_bytes(), &salt, &mut key).ok()?;
    Some(key)
}

/// Texto cifrado em hexadecimal (o backup é JSON): nonce novo a cada vez + conteúdo.
pub fn seal(key: &Secret, plain: &[u8]) -> String {
    let nonce = XNonce::generate();
    let sealed = XChaCha20Poly1305::new(&Key::from(*key)).encrypt(&nonce, plain).expect("criptografar na memória não falha");
    hex(&[nonce.as_slice(), &sealed].concat())
}

/// `None` se a chave estiver errada ou o texto tiver sido alterado.
pub fn open(key: &Secret, sealed: &str) -> Option<Vec<u8>> {
    let raw = unhex(sealed)?;
    if raw.len() < NONCE_LEN {
        return None;
    }
    let (nonce, data) = raw.split_at(NONCE_LEN);
    XChaCha20Poly1305::new(&Key::from(*key)).decrypt(&XNonce::try_from(nonce).ok()?, data).ok()
}

pub fn check_value(key: &Secret) -> String {
    seal(key, CHECK)
}

pub fn verify(key: &Secret, check: &str) -> bool {
    open(key, check).as_deref() == Some(CHECK)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    (0..s.len()).step_by(2).map(|i| s.get(i..i + 2).and_then(|h| u8::from_str_radix(h, 16).ok())).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn senha_e_criptografia() {
        let salt = new_salt();
        let key = derive("minha senha", &salt).unwrap();
        assert_eq!(derive("minha senha", &salt), Some(key));
        let check = check_value(&key);
        assert!(verify(&key, &check));
        assert!(!verify(&derive("minha senhA", &salt).unwrap(), &check));
        assert_ne!(derive("minha senha", &new_salt()), Some(key)); // outro sal, outra chave

        let sealed = seal(&key, "Orçamento: 1234".as_bytes());
        assert_eq!(open(&key, &sealed).as_deref(), Some("Orçamento: 1234".as_bytes()));
        assert_ne!(seal(&key, b"x"), seal(&key, b"x")); // nonce novo a cada vez
        // um caractere mudado no texto cifrado: recusa em vez de devolver lixo
        let mut bad = sealed.clone();
        let flip = if &sealed[60..61] == "0" { "1" } else { "0" };
        bad.replace_range(60..61, flip);
        assert_eq!(open(&key, &bad), None);
        assert_eq!(open(&key, "zz"), None);
        assert_eq!(open(&key, "abc"), None);
    }
}
