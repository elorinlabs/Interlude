import { uiText } from "../../i18n/uiText";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";

type ImageAction = "copy" | "saveAs";

export function useImageMenu(prepare?: (url: string) => Promise<string>) {
  const [feedback, setFeedback] = useState("");
  const source = useRef("");
  const busy = useRef(false);
  const menu = useRef<Promise<Menu>>();
  useEffect(() => () => {
    // Popup completion does not mean the native menu resource can be released on every platform.
    void menu.current?.then((value) => value.close()).catch(() => console.warn("Could not release image menu"));
  }, []);

  const perform = async (action: ImageAction) => {
    if (busy.current) return;
    busy.current = true;
    setFeedback(action === "copy" ? uiText("client.workspaceActions.copyingImage") : uiText("client.workspaceActions.preparingToSave"));
    try {
      const result = await invoke<{ completed: boolean }>("codex_gui_image_action", {
        request: { source: prepare ? await prepare(source.current) : source.current, action },
      });
      setFeedback(result.completed ? (action === "copy" ? uiText("client.workspaceActions.imageCopied") : uiText("client.workspaceActions.imageSaved")) : "");
    } catch {
      setFeedback(action === "copy" ? uiText("client.workspaceActions.couldNotCopyTheImagePleaseTryAgain") : uiText("client.workspaceActions.couldNotSaveTheImagePleaseTryAgain"));
    } finally { busy.current = false; }
  };

  const open = (event: MouseEvent, url: string) => {
    event.preventDefault();
    if (busy.current) return;
    source.current = url;
    const position = new LogicalPosition(event.clientX, event.clientY);
    if (!menu.current) menu.current = Menu.new({ items: [
      { text: uiText("client.workspaceActions.copyImage"), action: () => { void perform("copy"); } },
      { text: uiText("client.composer.saveAs"), action: () => { void perform("saveAs"); } },
    ] }).catch((error: unknown) => { menu.current = undefined; throw error; });
    void menu.current.then((value) => value.popup(position))
      .catch(() => setFeedback(uiText("client.workspaceActions.couldNotOpenTheMenuPleaseTryAgain")));
  };
  return { feedback, contextMenu: isTauri() ? open : undefined };
}
