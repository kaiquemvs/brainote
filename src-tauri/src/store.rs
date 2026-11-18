//! Banco SQLite do brainote (docs/ESPECIFICACAO.md, seção 8).

use chrono::{DateTime, Days, Local, Months, SecondsFormat};
use rusqlite::{params, Connection, OptionalExtension, Result, Row};
use serde::{Deserialize, Serialize};
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
"#, r#"
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#, r#"
CREATE TABLE reminders (
  id            TEXT PRIMARY KEY,
  note_id       TEXT REFERENCES notes(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  due_at        TEXT NOT NULL,
  repeat        TEXT NOT NULL DEFAULT 'none',
  done          INTEGER NOT NULL DEFAULT 0,
  done_at       TEXT,
  snoozed_until TEXT,
  notified_at   TEXT
);
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

#[derive(Serialize)]
pub struct Reminder {
    pub id: String,
    pub note_id: Option<String>,
    pub title: String,
    pub due_at: String,
    /// none, daily, weekly ou monthly
    pub repeat: String,
    pub done: bool,
    pub snoozed_until: Option<String>,
}

/// O que a tela manda ao criar ou editar um lembrete (validado em lib.rs).
#[derive(Deserialize)]
pub struct ReminderInput {
    pub note_id: Option<String>,
    pub title: String,
    pub due_at: String,
    pub repeat: String,
}

/// Lembrete vencido, pronto para virar notificação.
pub struct Due {
    pub id: String,
    pub title: String,
    /// quando vence de fato: `snoozed_until` se foi adiado, senão `due_at`
    pub when: String,
    pub note_title: Option<String>,
}

fn now() -> String {
    Local::now().to_rfc3339_opts(SecondsFormat::Secs, false)
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

// ---------- Configurações ----------

pub fn get_setting(c: &Connection, key: &str) -> Result<Option<String>> {
    c.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).optional()
}

pub fn set_setting(c: &Connection, key: &str, value: &str) -> Result<()> {
    c.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

// ---------- Lembretes ----------

const REMINDER_COLS: &str = "id, note_id, title, due_at, repeat, done, snoozed_until";

fn reminder(r: &Row) -> Result<Reminder> {
    Ok(Reminder {
        id: r.get(0)?,
        note_id: r.get(1)?,
        title: r.get(2)?,
        due_at: r.get(3)?,
        repeat: r.get(4)?,
        done: r.get(5)?,
        snoozed_until: r.get(6)?,
    })
}

pub fn list_reminders(c: &Connection) -> Result<Vec<Reminder>> {
    c.prepare(&format!("SELECT {REMINDER_COLS} FROM reminders ORDER BY julianday(COALESCE(snoozed_until, due_at))"))?
        .query_map([], reminder)?
        .collect()
}

pub fn create_reminder(c: &Connection, r: &ReminderInput) -> Result<Reminder> {
    let id = new_id();
    c.execute(
        "INSERT INTO reminders (id, note_id, title, due_at, repeat) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, r.note_id, r.title, r.due_at, r.repeat],
    )?;
    c.query_row(&format!("SELECT {REMINDER_COLS} FROM reminders WHERE id = ?1"), [&id], reminder)
}

/// Mudou o horário: pode notificar de novo e esquece o "adiar".
pub fn update_reminder(c: &Connection, id: &str, r: &ReminderInput) -> Result<()> {
    c.execute(
        "UPDATE reminders SET note_id = ?2, title = ?3, due_at = ?4, repeat = ?5, snoozed_until = NULL, notified_at = NULL
         WHERE id = ?1",
        params![id, r.note_id, r.title, r.due_at, r.repeat],
    )?;
    Ok(())
}

pub fn delete_reminder(c: &Connection, id: &str) -> Result<()> {
    c.execute("DELETE FROM reminders WHERE id = ?1", [id])?;
    Ok(())
}

/// Concluir um lembrete repetido cria a próxima ocorrência.
pub fn set_reminder_done(c: &Connection, id: &str, done: bool) -> Result<()> {
    let tx = c.unchecked_transaction()?;
    if done {
        let open: Option<(String, Option<String>, String, String)> = tx
            .query_row("SELECT title, note_id, due_at, repeat FROM reminders WHERE id = ?1 AND done = 0", [id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })
            .optional()?;
        let Some((title, note_id, due_at, repeat)) = open else { return Ok(()) }; // já estava concluído
        if let Some(next) = next_due(&due_at, &repeat, Local::now()) {
            create_reminder(&tx, &ReminderInput { note_id, title, due_at: next, repeat })?;
        }
        tx.execute("UPDATE reminders SET done = 1, done_at = ?2 WHERE id = ?1", params![id, now()])?;
    } else {
        tx.execute("UPDATE reminders SET done = 0, done_at = NULL WHERE id = ?1", [id])?;
    }
    tx.commit()
}

pub fn snooze_reminder(c: &Connection, id: &str, minutes: i64) -> Result<()> {
    let until = (Local::now() + chrono::Duration::minutes(minutes)).to_rfc3339_opts(SecondsFormat::Secs, false);
    c.execute("UPDATE reminders SET snoozed_until = ?2, notified_at = NULL WHERE id = ?1", params![id, until])?;
    Ok(())
}

/// Pendentes cujo horário (ou o do "adiar") já passou e que ainda não viraram notificação.
pub fn due_reminders(c: &Connection) -> Result<Vec<Due>> {
    c.prepare(
        "SELECT r.id, r.title, COALESCE(r.snoozed_until, r.due_at), n.title
         FROM reminders r LEFT JOIN notes n ON n.id = r.note_id AND n.deleted_at IS NULL
         WHERE r.done = 0 AND r.notified_at IS NULL
           AND julianday(COALESCE(r.snoozed_until, r.due_at)) <= julianday('now')
         ORDER BY julianday(COALESCE(r.snoozed_until, r.due_at))",
    )?
    .query_map([], |r| Ok(Due { id: r.get(0)?, title: r.get(1)?, when: r.get(2)?, note_title: r.get(3)? }))?
    .collect()
}

pub fn mark_notified(c: &Connection, id: &str) -> Result<()> {
    c.execute("UPDATE reminders SET notified_at = ?2 WHERE id = ?1", params![id, now()])?;
    Ok(())
}

/// Próxima ocorrência depois de `now`. Conta sempre a partir da data original, para o
/// mensal de dia 31 não "encolher" (31/01 → 28/02 → 31/03, e não 28/03).
fn next_due(due_at: &str, repeat: &str, now: DateTime<Local>) -> Option<String> {
    let due = DateTime::parse_from_rfc3339(due_at).ok()?;
    (1..)
        .map_while(|k: u32| match repeat {
            "daily" => due.checked_add_days(Days::new(k.into())),
            "weekly" => due.checked_add_days(Days::new(7 * u64::from(k))),
            "monthly" => due.checked_add_months(Months::new(k)),
            _ => None,
        })
        .find(|d| *d > now)
        .map(|d| d.to_rfc3339_opts(SecondsFormat::Secs, false))
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

    fn at(s: &str) -> DateTime<Local> {
        DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Local)
    }

    #[test]
    fn proxima_repeticao() {
        let jan31 = "2027-01-31T09:00:00-03:00";
        assert_eq!(next_due(jan31, "monthly", at("2027-02-01T00:00:00-03:00")).unwrap(), "2027-02-28T09:00:00-03:00");
        // conta da data original: março volta a ser dia 31
        assert_eq!(next_due(jan31, "monthly", at("2027-03-01T00:00:00-03:00")).unwrap(), "2027-03-31T09:00:00-03:00");
        // atrasado há dias: pula direto para a próxima no futuro
        assert_eq!(next_due(jan31, "daily", at("2027-02-05T10:00:00-03:00")).unwrap(), "2027-02-06T09:00:00-03:00");
        assert_eq!(next_due(jan31, "weekly", at("2027-01-31T09:00:00-03:00")).unwrap(), "2027-02-07T09:00:00-03:00");
        assert_eq!(next_due(jan31, "none", at("2027-01-01T00:00:00-03:00")), None);
    }

    #[test]
    fn lembretes_vencidos_concluir_e_adiar() {
        let c = db();
        let hora = |min: i64| (Local::now() + chrono::Duration::minutes(min)).to_rfc3339_opts(SecondsFormat::Secs, false);
        let novo = |titulo: &str, quando: String, repeat: &str| {
            create_reminder(&c, &ReminderInput { note_id: None, title: titulo.into(), due_at: quando, repeat: repeat.into() }).unwrap()
        };
        let vencido = novo("vencido", hora(-5), "weekly");
        novo("futuro", hora(60), "none");

        let ids = |c: &Connection| due_reminders(c).unwrap().into_iter().map(|d| d.title).collect::<Vec<_>>();
        assert_eq!(ids(&c), vec!["vencido"]);
        mark_notified(&c, &vencido.id).unwrap();
        assert!(ids(&c).is_empty()); // não notifica duas vezes

        // adiar: volta a vencer só depois do prazo
        snooze_reminder(&c, &vencido.id, 10).unwrap();
        assert!(ids(&c).is_empty());
        c.execute("UPDATE reminders SET snoozed_until = ?1 WHERE id = ?2", params![hora(-1), vencido.id]).unwrap();
        assert_eq!(ids(&c), vec!["vencido"]);

        // concluir o semanal cria a próxima ocorrência, uma vez só
        set_reminder_done(&c, &vencido.id, true).unwrap();
        set_reminder_done(&c, &vencido.id, true).unwrap();
        let todos = list_reminders(&c).unwrap();
        assert_eq!(todos.len(), 3);
        assert_eq!(todos.iter().filter(|r| r.title == "vencido" && !r.done).count(), 1);
    }

    #[test]
    fn configuracoes() {
        let c = db();
        assert_eq!(get_setting(&c, "theme").unwrap(), None);
        set_setting(&c, "theme", "dark").unwrap();
        set_setting(&c, "theme", "light").unwrap(); // gravar de novo substitui
        assert_eq!(get_setting(&c, "theme").unwrap().as_deref(), Some("light"));
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
