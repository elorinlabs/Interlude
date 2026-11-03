import { jsonLanguage } from '@codemirror/lang-json';

export interface NpmScriptEntry { name: string; from: number }
export const isPackageJson = (path: string) => path.split(/[\\/]/).at(-1) === 'package.json';

/** Strict JSON validation prevents running an old script while the current draft is incomplete. */
export function npmScriptEntries(text: string): NpmScriptEntry[] {
  try { JSON.parse(text); } catch { return []; }
  const object = jsonLanguage.parser.parse(text).topNode.getChild('Object');
  const properties = object?.getChildren('Property') ?? [];
  const key = (from: number, to: number): string => JSON.parse(text.slice(from, to));
  // Match JSON's last-property-wins behavior, including escaped property names.
  const scripts = properties.filter(property => {
    const name = property.getChild('PropertyName');
    return name && key(name.from, name.to) === 'scripts';
  }).at(-1)?.getChild('Object');
  const entries = new Map<string, NpmScriptEntry>();
  for (const property of scripts?.getChildren('Property') ?? []) {
    const nameNode = property.getChild('PropertyName');
    if (!nameNode) continue;
    const name = key(nameNode.from, nameNode.to);
    entries.delete(name);
    if (property.lastChild?.name === 'String' && name && !/[\x00-\x1f\x7f]/.test(name)) {
      entries.set(name, { name, from: nameNode.from });
    }
  }
  return [...entries.values()].sort((a, b) => a.from - b.from);
}
