// Comandos do backend Rust (src-tauri/src/lib.rs).
import { invoke } from "@tauri-apps/api/core";

export type Folder = { id: string; name: string };
export type Note = {
  id: string;
  folder_id: string | null;
  title: string;
  content_json: string | null; // JSON do TipTap; null nas notas da Fase 1
  plain_text: string;
  pinned: boolean;
  updated_at: string;
  has_checklist: boolean;
  /** com senha: content_json nulo e plain_text vazio; o conteúdo só vem por openLockedNote */
  locked: boolean;
  /** idioma principal do corretor nesta nota */
  spell_lang: SpellLang;
};
export type SpellLang = "pt" | "en";

/** Notas com senha: já existe senha? estão abertas agora? `hint` = dica da senha. */
export type LockState = { has_password: boolean; unlocked: boolean; hint: string | null };

export type Appearance = { theme: "light" | "dark"; glass: boolean };

/** "none", "weekly:<dias>" (0 = domingo, ex. "weekly:1,3,5"), "monthly" ou "yearly" */
export type Repeat = string;
export type ReminderInput = { note_id: string | null; title: string; due_at: string; repeat: Repeat };
export type Reminder = ReminderInput & { id: string; done: boolean; snoozed_until: string | null };
export type Autostart = { enabled: boolean; available: boolean };
export type EventInput = { title: string; starts_at: string; ends_at: string | null; all_day: boolean; note_id: string | null };
export type CalEvent = EventInput & { id: string };
/** Arquivo guardado em %APPDATA%\brainote\anexos; `image` = aparece dentro da nota. */
export type Attached = { id: string; name: string; size: number; image: boolean };
export type WidgetKind ="postit" | "checklist" | "agenda";
export type Widget = {
  id: string;
  kind: WidgetKind;
  note_id: string | null;
  color: string;
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  on_top: boolean;
};

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args).catch((e) => {
    // erro do banco é raro, mas não pode passar em silêncio (ex.: salvar falhou)
    window.alert(`Algo deu errado: ${e}`);
    throw e;
  });
}

export const api = {
  /** caminho do arquivo salvo, ou null se cancelou; `files` = [id, nome na pasta exportada] */
  exportNote: (title: string, markdown: string, text: string, files: [string, string][]) =>
    call<string | null>("export_note", { title, markdown, text, files }),
  /** escolhe arquivos e guarda uma cópia de cada; vazio se cancelou */
  attachFiles: () => call<Attached[]>("attach_files"),
  /** arquivo colado ou arrastado: vai como bytes, e o nome num cabeçalho (só aceita ASCII, por isso codificado) */
  saveAttachment: async (file: File, name: string) =>
    invoke<Attached>("save_attachment", new Uint8Array(await file.arrayBuffer()), { headers: { "x-name": encodeURIComponent(name) } }).catch((e) => {
      window.alert(`Algo deu errado: ${e}`);
      throw e;
    }),
  openAttachment: (id: string) => call<void>("open_attachment", { id }),
  saveAttachmentAs: (id: string) => call<string | null>("save_attachment_as", { id }),
  spellCheck: (words: string[]) => call<boolean[]>("spell_check", { words }),
  /** `lang`: idioma principal da nota, de onde vêm primeiro as sugestões */
  spellSuggest: (word: string, lang: SpellLang) => call<string[]>("spell_suggest", { word, lang }),
  spellAutocorrect: (word: string, lang: SpellLang) => call<string | null>("spell_autocorrect", { word, lang }),
  setNoteLang: (id: string, lang: SpellLang) => call<void>("set_note_lang", { id, lang }),
  getAutocorrect: () => call<boolean>("get_autocorrect"),
  setAutocorrect: (enabled: boolean) => call<void>("set_autocorrect", { enabled }),
  /** caminho do arquivo salvo, ou null se cancelou */
  exportBackup: () => call<string | null>("export_backup"),
  /** false se cancelou */
  importBackup: () => call<boolean>("import_backup"),
  listEvents: () => call<CalEvent[]>("list_events"),
  createEvent: (event: EventInput) => call<CalEvent>("create_event", { event }),
  updateEvent: (id: string, event: EventInput) => call<void>("update_event", { id, event }),
  deleteEvent: (id: string) => call<void>("delete_event", { id }),
  listWidgets: () => call<Widget[]>("list_widgets"),
  // sem aviso de erro: o widget pode ter acabado de ser removido enquanto a janela fecha
  getWidget: (id: string) => invoke<Widget>("get_widget", { id }).catch(() => null),
  createWidget: (kind: WidgetKind, noteId: string | null) => call<Widget>("create_widget", { kind, noteId }),
  deleteWidget: (id: string) => call<void>("delete_widget", { id }),
  setWidgetColor: (id: string, color: string) => call<void>("set_widget_color", { id, color }),
  setWidgetOnTop: (id: string, onTop: boolean) => call<void>("set_widget_on_top", { id, onTop }),
  setWidgetNote: (id: string, noteId: string) => call<void>("set_widget_note", { id, noteId }),
  /** "Trocar nota…": abre o app com a lista de notas para este widget */
  pickWidgetNote: (id: string) => call<void>("pick_widget_note", { id }),
  /** a nota do widget no app (agenda: a tela de Agenda) */
  openWidget: (id: string) => call<void>("open_widget", { id }),
  listReminders: () => call<Reminder[]>("list_reminders"),
  createReminder: (reminder: ReminderInput) => call<Reminder>("create_reminder", { reminder }),
  updateReminder: (id: string, reminder: ReminderInput) => call<void>("update_reminder", { id, reminder }),
  deleteReminder: (id: string) => call<void>("delete_reminder", { id }),
  setReminderDone: (id: string, done: boolean) => call<void>("set_reminder_done", { id, done }),
  getAutostart: () => call<Autostart>("get_autostart"),
  setAutostart: (enabled: boolean) => call<void>("set_autostart", { enabled }),
  getAppearance: () => call<Appearance>("get_appearance"),
  setAppearance: (appearance: Appearance) => call<void>("set_appearance", { appearance }),
  listFolders: () => call<Folder[]>("list_folders"),
  createFolder: (name: string) => call<Folder>("create_folder", { name }),
  renameFolder: (id: string, name: string) => call<void>("rename_folder", { id, name }),
  deleteFolder: (id: string) => call<void>("delete_folder", { id }),
  listNotes: () => call<Note[]>("list_notes"),
  /** a nota de um post-it ou checklist; null se foi apagada */
  getNote: (id: string) => call<Note | null>("get_note", { id }),
  searchNotes: (query: string) => call<string[]>("search_notes", { query }),
  createNote: (folderId: string | null) => call<Note>("create_note", { folderId }),
  updateNote: (id: string, title: string, contentJson: string, plainText: string) =>
    call<void>("update_note", { id, title, contentJson, plainText }),
  setPinned: (id: string, pinned: boolean) => call<void>("set_pinned", { id, pinned }),
  moveNote: (id: string, folderId: string | null) => call<void>("move_note", { id, folderId }),
  deleteNote: (id: string) => call<void>("delete_note", { id }),
  lockState: () => call<LockState>("lock_state"),
  createPassword: (password: string, hint: string) => call<void>("create_password", { password, hint }),
  /** false = senha errada */
  unlockNotes: (password: string) => call<boolean>("unlock_notes", { password }),
  lockNotes: () => call<void>("lock_notes"),
  /** sem aviso de erro: falha quando o cadeado acabou de sair ou as notas fecharam, e quem chama só recarrega */
  openLockedNote: (id: string) => invoke<{ content_json: string | null; plain_text: string }>("open_locked_note", { id }),
  /** recusa (com o aviso do Rust, sem "Algo deu errado") se a nota tiver imagem ou anexo */
  lockNote: (id: string) =>
    invoke<void>("lock_note", { id }).catch((e) => {
      window.alert(String(e));
      throw e;
    }),
  /** tira o cadeado: a nota volta a ser comum */
  unlockNote: (id: string) => call<void>("unlock_note", { id }),
  /** false = senha atual errada */
  changePassword: (current: string, next: string, hint: string) => call<boolean>("change_password", { current, new: next, hint }),
  restoreNote: (id: string) => call<void>("restore_note", { id }),
};
