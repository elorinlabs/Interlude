export type RemoteModelTarget = 'proxy' | 'gui';

export interface RemoteModelState {
  activeAccountId?: string | null;
  activeProviderId?: string | null;
  activeProviderGroup?: string | null;
  guiAccountId?: string | null;
  guiProviderId?: string | null;
}

/** Omitted fields belong to another target or an older server; null explicitly clears a choice. */
export function mergeRemoteModelState<T extends RemoteModelState>(device: T, result: RemoteModelState): T {
  const next = { ...device };
  const fields = ['activeAccountId', 'activeProviderId', 'activeProviderGroup',
    'guiAccountId', 'guiProviderId'] as const;
  for (const field of fields) {
    if (result[field] !== undefined) next[field] = result[field];
  }
  return next;
}

/** Keep existing proxy endpoints compatible with older desktop clients. */
export function remoteModelPath(kind: 'account' | 'provider' | 'aggregate', target: RemoteModelTarget): string {
  return target === 'gui' ? `gui-${kind}` : kind;
}

const AGGREGATE_ID_PREFIX = 'aggregate:';

export function isRemoteAggregateId(id: string): boolean {
  return id.startsWith(AGGREGATE_ID_PREFIX);
}

/** Preserve the existing provider selection shape while using a dedicated, capability-checked command. */
export function remoteProviderCommand(id: string, target: RemoteModelTarget) {
  if (isRemoteAggregateId(id)) {
    return { path: remoteModelPath('aggregate', target), body: { aggregateId: id.slice(AGGREGATE_ID_PREFIX.length) } };
  }
  return { path: remoteModelPath('provider', target), body: { providerId: id } };
}

export function remoteModelOptions(device: (RemoteModelState & {
  capabilities: readonly string[];
  localProxyRunning: boolean;
}) | null, target: RemoteModelTarget) {
  const gui = target === 'gui';
  const supported = device?.capabilities.includes(gui ? 'gui-model-switch' : 'provider-switch') ?? false;
  return {
    supported,
    accountAvailable: !gui || supported,
    providerAvailable: supported && (gui || Boolean(device?.localProxyRunning)),
    aggregateAvailable: (device?.capabilities.includes(gui ? 'gui-aggregate-switch' : 'aggregate-switch') ?? false)
      && (gui || Boolean(device?.localProxyRunning)),
    groupSupported: !gui && (device?.capabilities.includes('provider-group-switch') ?? false),
    accountId: gui ? device?.guiAccountId : device?.activeAccountId,
    providerId: gui ? device?.guiProviderId : device?.activeProviderId,
    group: gui ? null : device?.activeProviderGroup,
  };
}
