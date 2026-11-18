// Comandos do backend Rust (src-tauri/src/lib.rs).
import { invoke } from "@tauri-apps/api/core";

export type Folder = { id: string; name: string };
export type Note = {
  id: string;
  folder_id: string | null;
  title: string;
  plain_text: string;
  pinned: boolean;
  updated_at: string;
};

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args).catch((e) => {
    // erro do banco é raro, mas não pode passar em silêncio (ex.: salvar falhou)
    window.alert(`Algo deu errado: ${e}`);
    throw e;
  });
}

export const api = {
  listFolders: () => call<Folder[]>("list_folders"),
  createFolder: (name: string) => call<Folder>("create_folder", { name }),
  renameFolder: (id: string, name: string) => call<void>("rename_folder", { id, name }),
  deleteFolder: (id: string) => call<void>("delete_folder", { id }),
  listNotes: () => call<Note[]>("list_notes"),
  searchNotes: (query: string) => call<string[]>("search_notes", { query }),
  createNote: (folderId: string | null) => call<Note>("create_note", { folderId }),
  updateNote: (id: string, title: string, plainText: string) => call<void>("update_note", { id, title, plainText }),
  setPinned: (id: string, pinned: boolean) => call<void>("set_pinned", { id, pinned }),
  moveNote: (id: string, folderId: string | null) => call<void>("move_note", { id, folderId }),
  deleteNote: (id: string) => call<void>("delete_note", { id }),
  restoreNote: (id: string) => call<void>("restore_note", { id }),
};
