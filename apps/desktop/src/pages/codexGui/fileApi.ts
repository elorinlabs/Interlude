import { createContext } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileTarget, FileAction, FileActionResult, FileApplication } from '../../../../../shared/remote-chat/files';
export type { FileAction, FileActionResult, FileApplication } from '../../../../../shared/remote-chat/files';

export const FileThreadContext = createContext<string | null>(null);

// Only used without a remote FileEnvironmentContext.
export const fileApi = {
  applications: () => invoke<FileApplication[]>("codex_gui_file_applications"),
  perform: (target: FileTarget, action: FileAction) =>
    invoke<FileActionResult>("codex_gui_file_action", { request: { target, action } }),
};
