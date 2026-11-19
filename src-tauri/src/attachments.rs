//! Imagens e anexos das notas (docs/ESPECIFICACAO.md, 13 — versão 1.2). Cada arquivo fica numa pasta
//! própria, `%APPDATA%\brainote\anexos\<id>\<nome original>`: a nota guarda só o id, e o programa que
//! abre o anexo mostra o nome original.

use rusqlite::Connection;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::http::{header::CONTENT_TYPE, Response};
use tauri::{AppHandle, Manager};

/// Maior arquivo aceito (o backup leva todos os anexos).
const MAX_BYTES: u64 = 100 * 1024 * 1024;

const IMAGES: [(&str, &str); 6] =
    [("png", "image/png"), ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"), ("gif", "image/gif"), ("webp", "image/webp"), ("bmp", "image/bmp")];

#[derive(Serialize)]
pub struct Attached {
    pub id: String,
    pub name: String,
    pub size: u64,
    /// imagem aparece dentro da nota; o resto vira um cartão de anexo
    pub image: bool,
}

pub fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().data_dir().map_err(|e| e.to_string())?.join("brainote").join("anexos"))
}

/// Nome que o Windows aceita, sem caminho (\ / : * ? " < > | viram "_").
pub fn clean_name(name: &str) -> String {
    let n: String = name.chars().map(|c| if r#"\/:*?"<>|"#.contains(c) || c.is_control() { '_' } else { c }).collect();
    let n = n.trim().trim_end_matches('.').trim(); // o Windows também não aceita nome terminado em ponto
    if n.is_empty() { "arquivo".into() } else { n.into() }
}

pub fn valid_id(id: &str) -> bool {
    id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// O arquivo guardado com este id (o único dentro da pasta dele).
pub fn file_of(app: &AppHandle, id: &str) -> Option<PathBuf> {
    if !valid_id(id) {
        return None;
    }
    std::fs::read_dir(dir(app).ok()?.join(id)).ok()?.flatten().map(|e| e.path()).find(|p| p.is_file())
}

fn image_type(name: &str) -> Option<&'static str> {
    let ext = Path::new(name).extension()?.to_str()?.to_ascii_lowercase();
    IMAGES.iter().find(|(e, _)| *e == ext).map(|(_, t)| *t)
}

fn too_big(name: &str, size: u64) -> Result<(), String> {
    if size > MAX_BYTES {
        return Err(format!("\"{name}\" passa de 100 MB, o limite por arquivo."));
    }
    Ok(())
}

/// Confere o tamanho de um arquivo escolhido antes de copiar qualquer um.
pub fn check(source: &Path) -> Result<(), String> {
    let size = std::fs::metadata(source).map_err(|e| format!("Não foi possível ler \"{}\": {e}", source.display()))?.len();
    too_big(&source.file_name().unwrap_or_default().to_string_lossy(), size)
}

/// Cria a pasta do anexo e grava o conteúdo com `write`; se a gravação falhar, não sobra pasta vazia.
fn store(app: &AppHandle, name: &str, size: u64, write: impl FnOnce(&Path) -> std::io::Result<()>) -> Result<Attached, String> {
    too_big(name, size)?;
    let id = uuid::Uuid::new_v4().to_string();
    let name = clean_name(name);
    let folder = dir(app)?.join(&id);
    std::fs::create_dir_all(&folder).map_err(|e| format!("Não foi possível criar a pasta de anexos: {e}"))?;
    if let Err(e) = write(&folder.join(&name)) {
        let _ = std::fs::remove_dir_all(&folder);
        return Err(format!("Não foi possível guardar \"{name}\": {e}"));
    }
    Ok(Attached { image: image_type(&name).is_some(), id, name, size })
}

/// Arquivo colado ou arrastado para a nota (o conteúdo chega da tela).
pub fn store_bytes(app: &AppHandle, name: &str, bytes: &[u8]) -> Result<Attached, String> {
    store(app, name, bytes.len() as u64, |p| std::fs::write(p, bytes))
}

/// Arquivo escolhido em "Inserir imagem ou arquivo": copia do lugar original.
pub fn store_copy(app: &AppHandle, source: &Path) -> Result<Attached, String> {
    let name = source.file_name().unwrap_or_default().to_string_lossy().to_string();
    let size = std::fs::metadata(source).map_err(|e| format!("Não foi possível ler \"{name}\": {e}"))?.len();
    store(app, &name, size, |p| std::fs::copy(source, p).map(|_| ()))
}

/// Entrega a imagem para as telas no endereço `http://anexo.localhost/<id>` (notas e post-its).
pub fn serve(app: &AppHandle, uri_path: &str) -> Response<Vec<u8>> {
    let found = file_of(app, uri_path.trim_start_matches('/')).and_then(|p| Some((std::fs::read(&p).ok()?, p)));
    match found {
        Some((bytes, p)) => {
            let kind = image_type(&p.to_string_lossy()).unwrap_or("application/octet-stream");
            Response::builder().header(CONTENT_TYPE, kind).body(bytes).expect("resposta válida")
        }
        None => Response::builder().status(404).body(Vec::new()).expect("resposta válida"),
    }
}

/// Apaga as pastas de anexos que nenhuma nota usa mais (as notas da lixeira contam como uso). Só olha
/// as que têm mais de um dia: uma imagem recém-colada pode ainda não ter sido salva na nota.
pub fn cleanup(app: &AppHandle, conn: &Connection) {
    let Ok(base) = dir(app) else { return };
    let Ok(entries) = std::fs::read_dir(&base) else { return };
    let day = std::time::Duration::from_secs(24 * 3600);
    for e in entries.flatten() {
        let id = e.file_name().to_string_lossy().to_string();
        let old = e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|age| age > day);
        if !valid_id(&id) || !old {
            continue;
        }
        let used = conn
            .query_row("SELECT EXISTS(SELECT 1 FROM notes WHERE instr(content_json, ?1) > 0)", [&id], |r| r.get::<_, bool>(0))
            .unwrap_or(true); // na dúvida, guarda
        if !used {
            let _ = std::fs::remove_dir_all(e.path());
        }
    }
}

/// Todos os anexos guardados: (caminho dentro do backup, arquivo no disco).
pub fn all(app: &AppHandle) -> Vec<(String, PathBuf)> {
    let Ok(base) = dir(app) else { return vec![] };
    let Ok(entries) = std::fs::read_dir(&base) else { return vec![] };
    entries
        .flatten()
        .filter(|e| valid_id(&e.file_name().to_string_lossy()))
        .filter_map(|e| {
            let file = std::fs::read_dir(e.path()).ok()?.flatten().map(|f| f.path()).find(|p| p.is_file())?;
            Some((format!("anexos/{}/{}", e.file_name().to_string_lossy(), file.file_name()?.to_string_lossy()), file))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nomes_e_ids() {
        assert_eq!(clean_name(r"..\..\Windows\notepad.exe"), ".._.._Windows_notepad.exe"); // sem sair da pasta
        assert_eq!(clean_name("relatório: final?.pdf"), "relatório_ final_.pdf");
        assert_eq!(clean_name("   "), "arquivo");
        assert!(valid_id("0f8fad5b-d9cb-469f-a165-70867728950e"));
        assert!(!valid_id("../../../etc"));
        assert_eq!(image_type("Foto.JPG"), Some("image/jpeg"));
        assert_eq!(image_type("contrato.pdf"), None);
    }
}
