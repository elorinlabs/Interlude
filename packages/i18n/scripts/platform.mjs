import fs from 'node:fs';
import path from 'node:path';
import { generateChromeResources } from './chrome.mjs';

/** Platform tools consume generated copies at their required paths without runtime file access. */
export function generatePlatformResources(root, generated) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'platform.json'), 'utf8'));
  generateChromeResources(root, manifest.chrome, generated);
  const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  for (const { source, target } of manifest.mirrors) {
    const notice = `Generated from packages/i18n/${source}. Do not edit.`;
    const banner = target.endsWith('.json') ? ''
      : target.endsWith('.html') ? `<!-- ${notice} -->\n`
      : target.endsWith('.strings') ? `/* ${notice} */\n` : `// ${notice}\n`;
    generated.set(`../../${target}`, banner + read(source));
  }
  for (const { source, target, name } of manifest.sections) {
    const file = `../../${target}`;
    const content = generated.get(file) ?? read(file);
    const pattern = new RegExp(`^([ \\t]*)// i18n:${name}:start\\n[\\s\\S]*?^\\1// i18n:${name}:end`, 'm');
    if (!pattern.test(content)) throw new Error(`Missing generated translation markers: ${target}/${name}`);
    generated.set(file, content.replace(pattern, (_, indent) => {
      const body = read(source).trimEnd().split('\n').map(line => indent + line).join('\n');
      return `${indent}// i18n:${name}:start\n${body}\n${indent}// i18n:${name}:end`;
    }));
  }
}
