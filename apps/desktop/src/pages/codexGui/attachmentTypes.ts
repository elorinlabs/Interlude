export interface AttachmentReference {
  kind: "file" | "folder" | "plugin" | "conversation" | "coze";
  name: string;
  path: string;
  /** Uploaded file bytes; materialized on the target computer before sending. */
  data?: string;
}
export const MAX_ATTACHMENTS = 32;

/** Uploaded files have no host path until sent; their generated names identify draft chips. */
export function attachmentKey(item: AttachmentReference): string {
  return item.data === undefined ? item.path : `upload:${item.name}`;
}

export interface ComposerPlugin {
  id: string;
  name: string;
  installed: boolean;
  enabled: boolean;
  iconUrl?: string;
  interface?: { displayName?: string | null; shortDescription?: string | null;
    composerIconUrl?: string | null; logoUrl?: string | null };
}
export interface PluginsResponse {
  marketplaces: { plugins: ComposerPlugin[] }[];
  marketplaceLoadErrors: unknown[];
}
