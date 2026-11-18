//! Banco SQLite do brainote (docs/ESPECIFICACAO.md, seção 8).

use rusqlite::{params, Connection, Result, Row};
use serde::Serialize;
use std::path::Path;

/// Cada item roda uma única vez, em ordem; `PRAGMA user_version` guarda quantos já rodaram.
/// Nunca edite um item já publicado: acrescente um novo no fim.
const MIGRATIONS: &[&str] = &[r#"
CREATE TABLE folders (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE notes (
  id           TEXT PRIMARY KEY,
  folder_id    TEXT REFERENCES folders(id) ON DELETE SET NULL,
  title        TEXT NOT NULL DEFAULT '',
  content_json TEXT,
  plain_text   TEXT NOT NULL DEFAULT '',
  pinned       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
-- Tabela de busca com cópia própria do texto: não depende do rowid de `notes`, que muda no VACUUM.
CREATE VIRTUAL TABLE notes_fts USING fts5(id UNINDEXED, title, plain_text, tokenize = 'unicode61 remove_diacritics 2');
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts (id, title, plain_text) VALUES (new.id, new.title, new.plain_text);
END;
CREATE TRIGGER notes_au AFTER UPDATE OF title, plain_text ON notes BEGIN
  UPDATE notes_fts SET title = new.title, plain_text = new.plain_text WHERE id = old.id;
END;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  DELETE FROM notes_fts WHERE id = old.id;
END;
"#];

#[derive(Serialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct Note {
    pub id: String,
    pub folder_id: Option<String>,
    pub title: String,
    /// JSON do TipTap; vazio nas notas da Fase 1 (o editor monta a partir de `plain_text`).
    pub content_json: Option<String>,
    pub plain_text: String,
    pub pinned: bool,
    pub updated_at: String,
    pub has_checklist: bool,
}

fn now() -> String {
    chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn open(path: &Path) -> Result<Connection> {
    let mut conn = Connection::open(path)?;
    prepare(&mut conn)?;
    Ok(conn)
}

fn prepare(conn: &mut Connection) -> Result<()> {
    conn.pragma_update(None, "foreign_keys", true)?;
    let done: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(done as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", i as i64 + 1)?;
        tx.commit()?;
    }
    // Notas apagadas há mais de 30 dias saem de vez.
    conn.execute(
        "DELETE FROM notes WHERE deleted_at IS NOT NULL AND julianday('now') - julianday(deleted_at) > 30",
        [],
    )?;
    Ok(())
}

// ---------- Pastas ----------

pub fn list_folders(c: &Connection) -> Result<Vec<Folder>> {
    c.prepare("SELECT id, name FROM folders ORDER BY sort_order, created_at")?
        .query_map([], |r| Ok(Folder { id: r.get(0)?, name: r.get(1)? }))?
        .collect()
}

pub fn create_folder(c: &Connection, name: &str) -> Result<Folder> {
    let id = new_id();
    c.execute(
        "INSERT INTO folders (id, name, sort_order, created_at)
         VALUES (?1, ?2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM folders), ?3)",
        params![id, name, now()],
    )?;
    Ok(Folder { id, name: name.into() })
}

pub fn rename_folder(c: &Connection, id: &str, name: &str) -> Result<()> {
    c.execute("UPDATE folders SET name = ?2 WHERE id = ?1", params![id, name])?;
    Ok(())
}

/// As notas da pasta vão para "Sem pasta" (ON DELETE SET NULL).
pub fn delete_folder(c: &Connection, id: &str) -> Result<()> {
    c.execute("DELETE FROM folders WHERE id = ?1", [id])?;
    Ok(())
}

// ---------- Notas ----------

// has_checklist: o JSON do TipTap (JSON.stringify, sem espaços) tem pelo menos um item de checklist.
const NOTE_COLS: &str = r#"id, folder_id, title, content_json, plain_text, pinned, updated_at,
    COALESCE(content_json LIKE '%"type":"taskItem"%', 0)"#;

fn note(r: &Row) -> Result<Note> {
    Ok(Note {
        id: r.get(0)?,
        folder_id: r.get(1)?,
        title: r.get(2)?,
        content_json: r.get(3)?,
        plain_text: r.get(4)?,
        pinned: r.get(5)?,
        updated_at: r.get(6)?,
        has_checklist: r.get(7)?,
    })
}

fn get_note(c: &Connection, id: &str) -> Result<Note> {
    c.query_row(&format!("SELECT {NOTE_COLS} FROM notes WHERE id = ?1"), [id], note)
}

/// Notas não apagadas, da edição mais recente para a mais antiga.
pub fn list_notes(c: &Connection) -> Result<Vec<Note>> {
    // julianday() compara o instante real, mesmo se o fuso das datas gravadas for diferente
    c.prepare(&format!(
        "SELECT {NOTE_COLS} FROM notes WHERE deleted_at IS NULL ORDER BY julianday(updated_at) DESC"
    ))?
    .query_map([], note)?
    .collect()
}

pub fn create_note(c: &Connection, folder_id: Option<&str>) -> Result<Note> {
    let id = new_id();
    c.execute(
        "INSERT INTO notes (id, folder_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![id, folder_id, now()],
    )?;
    get_note(c, &id)
}

pub fn update_note(c: &Connection, id: &str, title: &str, content_json: &str, plain_text: &str) -> Result<()> {
    c.execute(
        "UPDATE notes SET title = ?2, content_json = ?3, plain_text = ?4, updated_at = ?5 WHERE id = ?1",
        params![id, title, content_json, plain_text, now()],
    )?;
    Ok(())
}

pub fn set_pinned(c: &Connection, id: &str, pinned: bool) -> Result<()> {
    c.execute("UPDATE notes SET pinned = ?2 WHERE id = ?1", params![id, pinned])?;
    Ok(())
}

pub fn move_note(c: &Connection, id: &str, folder_id: Option<&str>) -> Result<()> {
    c.execute("UPDATE notes SET folder_id = ?2 WHERE id = ?1", params![id, folder_id])?;
    Ok(())
}

pub fn delete_note(c: &Connection, id: &str) -> Result<()> {
    c.execute("UPDATE notes SET deleted_at = ?2 WHERE id = ?1", params![id, now()])?;
    Ok(())
}

pub fn restore_note(c: &Connection, id: &str) -> Result<()> {
    c.execute("UPDATE notes SET deleted_at = NULL WHERE id = ?1", [id])?;
    Ok(())
}

/// IDs das notas cujo título ou texto têm todas as palavras digitadas (como começo de palavra, sem ligar para acentos).
pub fn search_notes(c: &Connection, query: &str) -> Result<Vec<String>> {
    let q = fts_query(query);
    if q.is_empty() {
        return Ok(vec![]);
    }
    c.prepare("SELECT id FROM notes_fts WHERE notes_fts MATCH ?1")?
        .query_map([q], |r| r.get(0))?
        .collect()
}

/// Transforma o texto digitado numa busca FTS5 segura: cada palavra vira `"palavra"*`.
/// Palavras sem letras nem números (ex.: "--") são ignoradas, porque o FTS5 recusaria a busca.
fn fts_query(input: &str) -> String {
    input
        .split_whitespace()
        .filter(|w| w.chars().any(char::is_alphanumeric))
        .map(|w| format!("\"{}\"*", w.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        prepare(&mut c).unwrap();
        prepare(&mut c).unwrap(); // rodar de novo não pode refazer as migrações
        c
    }

    #[test]
    fn notas_pastas_e_busca() {
        let c = db();
        let pasta = create_folder(&c, "Trabalho").unwrap();
        let n = create_note(&c, Some(&pasta.id)).unwrap();
        let json = r#"{"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":false}}]}]}"#;
        update_note(&c, &n.id, "Reunião de alinhamento", json, "Pauta: orçamento dos monitores").unwrap();
        create_note(&c, None).unwrap();

        // só a nota com item de checklist entra em "Checklists"
        let marcadas: Vec<bool> = list_notes(&c).unwrap().iter().map(|n| n.has_checklist).collect();
        assert_eq!(marcadas.iter().filter(|&&m| m).count(), 1);
        assert_eq!(get_note(&c, &n.id).unwrap().content_json.as_deref(), Some(json));

        // busca ignora acento, acha começo de palavra e exige todas as palavras
        assert_eq!(search_notes(&c, "reuniao").unwrap(), vec![n.id.clone()]);
        assert_eq!(search_notes(&c, "orcam monit").unwrap(), vec![n.id.clone()]);
        assert!(search_notes(&c, "orcam impressora").unwrap().is_empty());
        // textos estranhos não quebram a busca
        assert!(search_notes(&c, "-- \" * (").unwrap().is_empty());
        assert!(search_notes(&c, "   ").unwrap().is_empty());

        // apagar e desfazer
        delete_note(&c, &n.id).unwrap();
        assert_eq!(list_notes(&c).unwrap().len(), 1);
        restore_note(&c, &n.id).unwrap();
        assert_eq!(list_notes(&c).unwrap().len(), 2);

        // apagar a pasta manda as notas para "Sem pasta"
        delete_folder(&c, &pasta.id).unwrap();
        assert!(list_folders(&c).unwrap().is_empty());
        assert_eq!(get_note(&c, &n.id).unwrap().folder_id, None);
    }

    #[test]
    fn lixeira_some_depois_de_30_dias() {
        let mut c = db();
        let velha = create_note(&c, None).unwrap();
        let nova = create_note(&c, None).unwrap();
        c.execute("UPDATE notes SET deleted_at = '2020-01-01T10:00:00-03:00' WHERE id = ?1", [&velha.id]).unwrap();
        delete_note(&c, &nova.id).unwrap();
        prepare(&mut c).unwrap(); // a limpeza roda ao abrir o app
        let restantes: i64 = c.query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0)).unwrap();
        assert_eq!(restantes, 1);
    }
}
