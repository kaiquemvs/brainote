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
};

export type Appearance = { theme: "light" | "dark"; glass: boolean };

export type Repeat = "none" | "daily" | "weekly" | "monthly";
export type ReminderInput = { note_id: string | null; title: string; due_at: string; repeat: Repeat };
export type Reminder = ReminderInput & { id: string; done: boolean; snoozed_until: string | null };
export type Autostart = { enabled: boolean; available: boolean };

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args).catch((e) => {
    // erro do banco é raro, mas não pode passar em silêncio (ex.: salvar falhou)
    window.alert(`Algo deu errado: ${e}`);
    throw e;
  });
}

export const api = {
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
  searchNotes: (query: string) => call<string[]>("search_notes", { query }),
  createNote: (folderId: string | null) => call<Note>("create_note", { folderId }),
  updateNote: (id: string, title: string, contentJson: string, plainText: string) =>
    call<void>("update_note", { id, title, contentJson, plainText }),
  setPinned: (id: string, pinned: boolean) => call<void>("set_pinned", { id, pinned }),
  moveNote: (id: string, folderId: string | null) => call<void>("move_note", { id, folderId }),
  deleteNote: (id: string) => call<void>("delete_note", { id }),
  restoreNote: (id: string) => call<void>("restore_note", { id }),
};
