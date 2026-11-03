import type { ChatController } from './controller';

/** Bind the request to its original conversation across image loading and compression. */
export function imageAiSender(controller: Pick<ChatController, 'snapshot' | 'send'>,
  prepare: (url: string) => Promise<string>) {
  const initial = controller.snapshot();
  const threadId = initial.selected?.id;
  return async (text: string, source: string) => {
    const image = await prepare(source);
    const state = controller.snapshot();
    if (state.selected?.id !== threadId || !state.ready) return false;
    if (!threadId && state.draftProject?.cwd !== initial.draftProject?.cwd) return false;
    return controller.send({ text, images: [image], access: state.settings.access });
  };
}
