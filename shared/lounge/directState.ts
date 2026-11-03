import { mergeDirectPermissions, type DirectPermission } from './directPermission';
import type { LoungeMessage } from './types';

/** Server generations are monotonic; delayed updates cannot reopen a deleted conversation. */
export class LoungeDirectState {
  private permissions = new Map<string, DirectPermission>();
  private generations = new Map<string, number>();
  private synced = new Set<string>();
  resetAvailable = false;

  clear() { this.permissions.clear(); this.generations.clear(); this.resetAvailable = false; this.disconnect(); }
  disconnect() { this.synced.clear(); }
  permission(peer: string) { return this.permissions.get(peer); }
  generation(peer: string) { return this.generations.get(peer) ?? 0; }
  ready(peer: string) { return !this.resetAvailable || this.synced.has(peer); }

  receive(frame: Record<string, unknown>) {
    const states = frame.states;
    const generations = frame.generations;
    if (!states || typeof states !== 'object' || Array.isArray(states)) return;
    for (const [peer, state] of Object.entries(states)) {
      const generation = generations && typeof generations === 'object'
        ? (generations as Record<string, unknown>)[peer] : 0;
      if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < this.generation(peer)) continue;
      if (generation > this.generation(peer)) this.permissions.delete(peer);
      this.generations.set(peer, generation); this.synced.add(peer);
      mergeDirectPermissions(this.permissions, { [peer]: state });
    }
  }

  accept(message: LoungeMessage, peer: string) {
    const generation = message.generation ?? 0;
    if (generation < this.generation(peer)) return false;
    this.synced.add(peer);
    if (generation > this.generation(peer)) {
      this.generations.set(peer, generation); this.permissions.delete(peer);
    }
    return true;
  }
}
