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
"#, r#"
-- Posição e tamanho em pixels lógicos; x/y nulos = o Windows escolhe onde abrir.
-- Nota apagada de vez (lixeira de 30 dias) leva junto os widgets dela.
CREATE TABLE widgets (
  id      TEXT PRIMARY KEY,
  kind    TEXT NOT NULL,
  note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  color   TEXT NOT NULL DEFAULT 'amarelo',
  x       REAL,
  y       REAL,
  width   REAL NOT NULL,
  height  REAL NOT NULL,
  on_top  INTEGER NOT NULL DEFAULT 0
);
"#, r#"
-- Evento de dia inteiro: starts_at à meia-noite do dia e ends_at nulo.
CREATE TABLE events (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at   TEXT,
  all_day   INTEGER NOT NULL DEFAULT 0,
  note_id   TEXT REFERENCES notes(id) ON DELETE SET NULL
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

#[derive(Serialize)]
pub struct Event {
    pub id: String,
    pub title: String,
    pub starts_at: String,
    pub ends_at: Option<String>,
    pub all_day: bool,
    pub note_id: Option<String>,
}

/// O que a tela manda ao criar ou editar um evento (validado em lib.rs).
#[derive(Deserialize)]
pub struct EventInput {
    pub title: String,
    pub starts_at: String,
    pub ends_at: Option<String>,
    pub all_day: bool,
    pub note_id: Option<String>,
}

/// Widget na área de trabalho: postit, checklist ou agenda.
#[derive(Serialize, Clone)]
pub struct Widget {
    pub id: String,
    pub kind: String,
    pub note_id: Option<String>,
    pub color: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: f64,
    pub height: f64,
    pub on_top: bool,
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
    first_run(&conn)?;
    Ok(conn)
}

/// Primeira abertura (banco vazio): pastas Pessoal e Trabalho e uma nota de boas-vindas.
/// Acontece uma vez só: quem apagar tudo depois não recebe a nota de novo.
fn first_run(c: &Connection) -> Result<()> {
    if get_setting(c, "welcomed")?.is_some() {
        return Ok(());
    }
    let empty: bool = c.query_row("SELECT NOT EXISTS (SELECT 1 FROM notes) AND NOT EXISTS (SELECT 1 FROM folders)", [], |r| r.get(0))?;
    if empty {
        create_folder(c, "Pessoal")?;
        create_folder(c, "Trabalho")?;
        let p = |t: &str| serde_json::json!({ "type": "paragraph", "content": [{ "type": "text", "text": t }] });
        let item = |t: &str| serde_json::json!({ "type": "taskItem", "attrs": { "checked": false }, "content": [p(t)] });
        let lines = [
            "Algumas dicas para começar:",
            "Marque este item clicando na bolinha (ou com Ctrl+Enter).",
            "Crie checklists com o botão de checklist, no topo do editor.",
            "Lembretes: clique no sino para ser avisado na hora certa, mesmo com a janela fechada.",
            "Post-its: o botão de post-it fixa a nota na área de trabalho.",
            "Ao fechar a janela, o brainote fica na bandeja, perto do relógio. Para sair de vez, use o menu da bandeja.",
        ];
        let doc = serde_json::json!({ "type": "doc", "content": [
            p(lines[0]),
            { "type": "taskList", "content": [item(lines[1]), item(lines[2])] },
            p(lines[3]), p(lines[4]), p(lines[5]),
        ]});
        let note = create_note(c, None)?;
        update_note(c, &note.id, "Bem-vindo ao brainote", &doc.to_string(), &lines.join("\n"))?;
    }
    set_setting(c, "welcomed", "1")
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

// ---------- Backup (8) ----------

/// Tabelas do backup, na ordem de inserção (notas dependem de pastas; lembretes, eventos e widgets de notas).
const BACKUP_TABLES: [&str; 6] = ["folders", "notes", "reminders", "events", "widgets", "settings"];
/// Depende do computador, não da pessoa: não sai do backup nem é restaurada.
const LOCAL_SETTINGS: [&str; 1] = ["autostart"];

fn schema_version(c: &Connection) -> Result<i64> {
    c.pragma_query_value(None, "user_version", |r| r.get(0))
}

/// Tudo do banco num JSON: { app, schema, exported_at, tables: { tabela: [ { coluna: valor } ] } }.
pub fn export_backup(c: &Connection) -> Result<serde_json::Value> {
    use rusqlite::types::ValueRef;
    use serde_json::Value;
    let mut tables = serde_json::Map::new();
    for t in BACKUP_TABLES {
        let mut stmt = c.prepare(&format!("SELECT * FROM {t}"))?;
        let cols: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
        let rows = stmt
            .query_map([], |r| {
                let mut row = serde_json::Map::new();
                for (i, col) in cols.iter().enumerate() {
                    let v = match r.get_ref(i)? {
                        ValueRef::Null | ValueRef::Blob(_) => Value::Null,
                        ValueRef::Integer(n) => n.into(),
                        ValueRef::Real(f) => f.into(),
                        ValueRef::Text(s) => String::from_utf8_lossy(s).into(),
                    };
                    row.insert(col.clone(), v);
                }
                Ok(Value::Object(row))
            })?
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .filter(|row| t != "settings" || !LOCAL_SETTINGS.contains(&row["key"].as_str().unwrap_or_default()))
            .collect();
        tables.insert(t.into(), Value::Array(rows));
    }
    Ok(serde_json::json!({ "app": "brainote", "schema": schema_version(c)?, "exported_at": now(), "tables": tables }))
}

/// Troca todos os dados pelos do backup, numa transação só (se algo falhar, nada muda).
/// Só entram tabelas e colunas que existem neste banco; o resto do arquivo é ignorado.
pub fn import_backup(c: &mut Connection, data: &serde_json::Value) -> std::result::Result<(), String> {
    use rusqlite::types::Value as Sql;
    use serde_json::Value;
    if data["app"] != "brainote" {
        return Err("Este arquivo não é um backup do brainote.".into());
    }
    let tables = data["tables"].as_object().ok_or("O backup está incompleto.")?;
    let current = schema_version(c).map_err(|e| e.to_string())?;
    if data["schema"].as_i64().unwrap_or(0) > current {
        return Err("Este backup veio de uma versão mais nova do brainote. Atualize o app antes de importar.".into());
    }
    let to_sql = |v: &Value| match v {
        Value::Null => Sql::Null,
        Value::Bool(b) => Sql::Integer(*b as i64),
        Value::Number(n) => n.as_i64().map(Sql::Integer).unwrap_or_else(|| Sql::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => Sql::Text(s.clone()),
        other => Sql::Text(other.to_string()),
    };

    let tx = c.transaction().map_err(|e| e.to_string())?;
    let run = || -> Result<()> {
        for t in BACKUP_TABLES.iter().rev() {
            let local_ones = if *t == "settings" { format!(" WHERE key NOT IN ('{}')", LOCAL_SETTINGS.join("','")) } else { String::new() };
            tx.execute(&format!("DELETE FROM {t}{local_ones}"), [])?;
        }
        for t in BACKUP_TABLES {
            // nomes de coluna vêm do próprio banco, nunca do arquivo
            let known: Vec<String> = tx.prepare(&format!("SELECT name FROM pragma_table_info('{t}')"))?.query_map([], |r| r.get(0))?.collect::<Result<_>>()?;
            for row in tables.get(t).and_then(Value::as_array).into_iter().flatten() {
                let Some(row) = row.as_object() else { continue };
                if t == "settings" && LOCAL_SETTINGS.contains(&row.get("key").and_then(Value::as_str).unwrap_or_default()) {
                    continue;
                }
                let cols: Vec<&String> = known.iter().filter(|k| row.contains_key(k.as_str())).collect();
                if cols.is_empty() {
                    continue;
                }
                let names = cols.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ");
                let marks = (1..=cols.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(", ");
                let values: Vec<Sql> = cols.iter().map(|k| to_sql(&row[k.as_str()])).collect();
                tx.execute(&format!("INSERT INTO {t} ({names}) VALUES ({marks})"), rusqlite::params_from_iter(values))?;
            }
        }
        Ok(())
    };
    run().map_err(|e| format!("O backup tem dados que não puderam ser importados: {e}"))?;
    tx.commit().map_err(|e| e.to_string())
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

// ---------- Eventos (Agenda) ----------

const EVENT_COLS: &str = "id, title, starts_at, ends_at, all_day, note_id";

fn event(r: &Row) -> Result<Event> {
    Ok(Event { id: r.get(0)?, title: r.get(1)?, starts_at: r.get(2)?, ends_at: r.get(3)?, all_day: r.get(4)?, note_id: r.get(5)? })
}

pub fn list_events(c: &Connection) -> Result<Vec<Event>> {
    c.prepare(&format!("SELECT {EVENT_COLS} FROM events ORDER BY julianday(starts_at)"))?.query_map([], event)?.collect()
}

pub fn create_event(c: &Connection, e: &EventInput) -> Result<Event> {
    let id = new_id();
    c.execute(
        "INSERT INTO events (id, title, starts_at, ends_at, all_day, note_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, e.title, e.starts_at, e.ends_at, e.all_day, e.note_id],
    )?;
    c.query_row(&format!("SELECT {EVENT_COLS} FROM events WHERE id = ?1"), [&id], event)
}

pub fn update_event(c: &Connection, id: &str, e: &EventInput) -> Result<()> {
    c.execute(
        "UPDATE events SET title = ?2, starts_at = ?3, ends_at = ?4, all_day = ?5, note_id = ?6 WHERE id = ?1",
        params![id, e.title, e.starts_at, e.ends_at, e.all_day, e.note_id],
    )?;
    Ok(())
}

pub fn delete_event(c: &Connection, id: &str) -> Result<()> {
    c.execute("DELETE FROM events WHERE id = ?1", [id])?;
    Ok(())
}

// ---------- Widgets ----------

const WIDGET_COLS: &str = "id, kind, note_id, color, x, y, width, height, on_top";

fn widget(r: &Row) -> Result<Widget> {
    Ok(Widget {
        id: r.get(0)?,
        kind: r.get(1)?,
        note_id: r.get(2)?,
        color: r.get(3)?,
        x: r.get(4)?,
        y: r.get(5)?,
        width: r.get(6)?,
        height: r.get(7)?,
        on_top: r.get(8)?,
    })
}

pub fn list_widgets(c: &Connection) -> Result<Vec<Widget>> {
    c.prepare(&format!("SELECT {WIDGET_COLS} FROM widgets ORDER BY rowid"))?.query_map([], widget)?.collect()
}

pub fn get_widget(c: &Connection, id: &str) -> Result<Widget> {
    c.query_row(&format!("SELECT {WIDGET_COLS} FROM widgets WHERE id = ?1"), [id], widget)
}

pub fn create_widget(c: &Connection, kind: &str, note_id: Option<&str>, width: f64, height: f64) -> Result<Widget> {
    let id = new_id();
    c.execute(
        "INSERT INTO widgets (id, kind, note_id, width, height) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, kind, note_id, width, height],
    )?;
    get_widget(c, &id)
}

pub fn delete_widget(c: &Connection, id: &str) -> Result<()> {
    c.execute("DELETE FROM widgets WHERE id = ?1", [id])?;
    Ok(())
}

pub fn set_widget_color(c: &Connection, id: &str, color: &str) -> Result<()> {
    c.execute("UPDATE widgets SET color = ?2 WHERE id = ?1", params![id, color])?;
    Ok(())
}

pub fn set_widget_on_top(c: &Connection, id: &str, on_top: bool) -> Result<()> {
    c.execute("UPDATE widgets SET on_top = ?2 WHERE id = ?1", params![id, on_top])?;
    Ok(())
}

pub fn set_widget_position(c: &Connection, id: &str, x: f64, y: f64) -> Result<()> {
    c.execute("UPDATE widgets SET x = ?2, y = ?3 WHERE id = ?1", params![id, x, y])?;
    Ok(())
}

pub fn set_widget_size(c: &Connection, id: &str, width: f64, height: f64) -> Result<()> {
    c.execute("UPDATE widgets SET width = ?2, height = ?3 WHERE id = ?1", params![id, width, height])?;
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

pub fn note_title(c: &Connection, id: &str) -> Result<String> {
    c.query_row("SELECT title FROM notes WHERE id = ?1", [id], |r| r.get(0))
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
    fn primeira_abertura_uma_vez_so() {
        let c = db();
        first_run(&c).unwrap();
        assert_eq!(list_folders(&c).unwrap().iter().map(|f| f.name.as_str()).collect::<Vec<_>>(), ["Pessoal", "Trabalho"]);
        let notes = list_notes(&c).unwrap();
        assert_eq!((notes.len(), notes[0].title.as_str(), notes[0].has_checklist), (1, "Bem-vindo ao brainote", true));

        // apagou tudo: não volta
        c.execute_batch("DELETE FROM notes; DELETE FROM folders;").unwrap();
        first_run(&c).unwrap();
        assert!(list_notes(&c).unwrap().is_empty());

        // banco de quem já usava o app (sem a marca "welcomed"): não cria nada
        let c = db();
        create_note(&c, None).unwrap();
        first_run(&c).unwrap();
        assert_eq!(list_notes(&c).unwrap().len(), 1);
        assert!(list_folders(&c).unwrap().is_empty());
    }

    #[test]
    fn backup_volta_igual_e_ignora_o_desconhecido() {
        let c = db();
        let pasta = create_folder(&c, "Trabalho").unwrap();
        let n = create_note(&c, Some(&pasta.id)).unwrap();
        update_note(&c, &n.id, "Nota", r#"{"type":"doc"}"#, "texto com acento: reunião").unwrap();
        create_reminder(&c, &ReminderInput { note_id: Some(n.id.clone()), title: "Lembrar".into(), due_at: now(), repeat: "weekly".into() }).unwrap();
        create_event(&c, &EventInput { title: "Evento".into(), starts_at: now(), ends_at: None, all_day: true, note_id: None }).unwrap();
        create_widget(&c, "postit", Some(&n.id), 260.0, 220.0).unwrap();
        set_setting(&c, "theme", "dark").unwrap();
        set_setting(&c, "autostart", "1").unwrap();

        let mut data = export_backup(&c).unwrap();
        assert!(!data.to_string().contains("autostart")); // é do computador, não vai no backup
        // campo e tabela que não existem no banco são ignorados
        data["tables"]["notes"][0]["coluna_estranha"] = "x".into();
        data["tables"]["tabela_estranha"] = serde_json::json!([{ "a": 1 }]);

        let mut destino = db();
        set_setting(&destino, "autostart", "0").unwrap();
        create_note(&destino, None).unwrap(); // dado antigo que deve sumir
        import_backup(&mut destino, &data).unwrap();

        assert_eq!(export_backup(&destino).unwrap()["tables"], export_backup(&c).unwrap()["tables"]);
        assert_eq!(get_setting(&destino, "autostart").unwrap().as_deref(), Some("0")); // a do computador fica
        assert_eq!(search_notes(&destino, "reuniao").unwrap(), vec![n.id.clone()]); // a busca volta junto

        // arquivo que não é do brainote: recusado sem mexer em nada
        assert!(import_backup(&mut destino, &serde_json::json!({ "app": "outro" })).is_err());
        assert_eq!(list_notes(&destino).unwrap().len(), 1);
    }

    #[test]
    fn eventos() {
        let c = db();
        let n = create_note(&c, None).unwrap();
        let ev = |title: &str, starts: &str| EventInput {
            title: title.into(),
            starts_at: starts.into(),
            ends_at: None,
            all_day: false,
            note_id: Some(n.id.clone()),
        };
        let tarde = create_event(&c, &ev("Reunião", "2026-11-18T14:00:00-03:00")).unwrap();
        create_event(&c, &ev("Café", "2026-11-18T09:00:00-03:00")).unwrap();
        // em ordem de horário
        assert_eq!(list_events(&c).unwrap().iter().map(|e| e.title.as_str()).collect::<Vec<_>>(), ["Café", "Reunião"]);

        let mut dia_todo = ev("Feriado", "2026-11-20T00:00:00-03:00");
        dia_todo.all_day = true;
        update_event(&c, &tarde.id, &dia_todo).unwrap();
        let e = list_events(&c).unwrap().into_iter().find(|e| e.id == tarde.id).unwrap();
        assert_eq!((e.title.as_str(), e.all_day), ("Feriado", true));

        // nota apagada de vez: o evento fica, sem a nota
        c.execute("DELETE FROM notes WHERE id = ?1", [&n.id]).unwrap();
        assert!(list_events(&c).unwrap().iter().all(|e| e.note_id.is_none()));
        delete_event(&c, &tarde.id).unwrap();
        assert_eq!(list_events(&c).unwrap().len(), 1);
    }

    #[test]
    fn widgets() {
        let c = db();
        let n = create_note(&c, None).unwrap();
        let w = create_widget(&c, "postit", Some(&n.id), 260.0, 220.0).unwrap();
        assert_eq!((w.x, w.color.as_str(), w.on_top), (None, "amarelo", false));
        set_widget_position(&c, &w.id, 100.0, 50.5).unwrap();
        set_widget_size(&c, &w.id, 300.0, 240.0).unwrap();
        set_widget_on_top(&c, &w.id, true).unwrap();
        let w = get_widget(&c, &w.id).unwrap();
        assert_eq!((w.x, w.y, w.width, w.height, w.on_top), (Some(100.0), Some(50.5), 300.0, 240.0, true));

        // nota apagada de vez leva o post-it junto
        c.execute("DELETE FROM notes WHERE id = ?1", [&n.id]).unwrap();
        assert!(list_widgets(&c).unwrap().is_empty());
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
