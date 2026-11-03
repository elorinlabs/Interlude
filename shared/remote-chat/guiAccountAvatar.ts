import type { GuiAccountsSnapshot } from './guiAccounts';

/** Keep the chat header and account menu tied to the computer's selected account. */
export function guiAccountAvatar(snapshot: GuiAccountsSnapshot | null, fallback: string) {
  const selection = snapshot?.selection;
  const current = snapshot?.choices.find(choice => selection?.kind === choice.kind && selection.id === choice.id);
  return {
    initials: Array.from(current?.name.trim() || '').slice(0, 2).join('') || fallback,
  };
}
