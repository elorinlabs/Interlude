import type { LoungeAccount } from './types';

export const MAX_NICKNAME = 32;
export const MAX_REMARK = 64;
const MAX_UPDATES = 200;

export function validName(value: unknown, limit: number): value is string {
  return typeof value === 'string' && Array.from(value).length <= limit
    && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value);
}

export const accountName = (user: LoungeAccount) => user.remark || user.nickname || user.account;
export const accountMatches = (user: LoungeAccount, query: string) =>
  [user.account, user.nickname, user.remark]
    .some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

/** Remarks are owner-scoped presentation data and must never be included in outgoing message/quote frames. */
export class LoungeNames {
  available = false;
  private nicknames = new Map<string, string>();
  private remarks = new Map<string, string>();

  clear() { this.available = false; this.nicknames.clear(); this.remarks.clear(); }
  ready(user: LoungeAccount, available: boolean) {
    this.available = available;
    if (available) this.nicknames.set(user.id, user.nickname ?? '');
  }
  receive(input: Record<string, unknown>) {
    if (!this.available) return false;
    this.read(input.profiles, 'nickname', MAX_NICKNAME, this.nicknames);
    this.read(input.remarks, 'remark', MAX_REMARK, this.remarks);
    return true;
  }
  private read(input: unknown, field: 'nickname' | 'remark', limit: number, values: Map<string, string>) {
    if (!Array.isArray(input) || input.length > MAX_UPDATES) return;
    for (const value of input) {
      if (typeof value?.id === 'string' && value.id.length > 0 && value.id.length <= 80 && validName(value[field], limit)) {
        values.set(value.id, value[field]);
      }
    }
  }
  user(user: LoungeAccount): LoungeAccount {
    const nickname = this.nicknames.has(user.id) ? this.nicknames.get(user.id) : user.nickname;
    const remark = this.remarks.has(user.id) ? this.remarks.get(user.id) : user.remark;
    return nickname === user.nickname && remark === user.remark ? user : { ...user, nickname, remark };
  }
  async save(options: { kind: 'nickname' | 'remark'; userId: string; value: string },
    submit: (frame: Record<string, unknown>) => Promise<void>) {
    const { kind, userId, value } = options;
    if (!this.available || !validName(value, kind === 'nickname' ? MAX_NICKNAME : MAX_REMARK)) {
      throw new Error(`client.lounge.${kind}SaveFailed`);
    }
    try { await submit({ type: kind, userId, [kind]: value.trim() }); }
    catch { throw new Error(`client.lounge.${kind}SaveFailed`); }
  }
}
