import { invoke, isHostedWebApp } from "../../api/backend";
import { subscribeGuiEvent } from "./webEvents";
import type { ApprovalReply, GuiEvent, Request } from "./types";
import { validateUploadedFiles } from "../../../../../shared/remote-chat/composerAttachments";
import { chatMessageCharLimit } from "../../../../../shared/remote-chat/framing";
import { hasDirectChatInput } from "../../../../../shared/remote-chat/uploadMode";

export const guiApi = {
  connect: (options?: { reuseExisting: boolean }) => options
    ? invoke<GuiEvent[]>("codex_gui_connect", options) : invoke<GuiEvent[]>("codex_gui_connect"),
  async request<T>(request: Request) {
    if (request.operation === 'send' || request.operation === 'steer') {
      validateUploadedFiles(request.attachments ?? [], request.transferMode ?? 'relay');
    } else if (request.operation === 'sendBatch') {
      validateUploadedFiles(request.messages.filter((message) => message.transferMode !== 'direct')
        .flatMap((message) => message.attachments ?? []), 'relay');
    }
    if (isHostedWebApp && new TextEncoder().encode(JSON.stringify({ command: "codex_gui_request", args: { request } }))
      .length > chatMessageCharLimit(hasDirectChatInput(request) ? 'direct' : 'relay')) {
      throw new Error("消息太大，请减少图片或缩小图片后再发送。");
    }
    const response = await invoke<{ data: T }>("codex_gui_request", { request });
    return response.data;
  },
  respond: (reply: ApprovalReply) => invoke<void>("codex_gui_respond", { reply }),
  subscribe: (callback: (event: GuiEvent) => void) =>
    subscribeGuiEvent<GuiEvent>("codex-gui-event", callback),
};
