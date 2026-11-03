import fs from 'node:fs';

const read = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
const catalogs = Object.fromEntries(['zh', 'en', 'ru', 'ja'].map(language => {
  const directory = new URL(`../src/catalogs/desktop/${language}/`, import.meta.url);
  const entries = fs.readdirSync(directory).filter(file => file.endsWith('.json'))
    .flatMap(file => Object.entries(JSON.parse(fs.readFileSync(new URL(file, directory), 'utf8'))));
  return [language, Object.fromEntries(entries)];
}));

/** Integrators consume approved package copy; they must not rewrite application locale adapters. */
export function dreamSkinCopy(key) {
  for (const [language, catalog] of Object.entries(catalogs)) {
    for (const suffix of ['name', 'description']) {
      if (!catalog[`dreamSkin.theme.${key}.${suffix}`]) {
        throw new Error(`Add ${language} dream skin copy to packages/i18n first: ${key}.${suffix}`);
      }
    }
  }
  return {
    nameZh: catalogs.zh[`dreamSkin.theme.${key}.name`],
    nameEn: catalogs.en[`dreamSkin.theme.${key}.name`],
    descriptionZh: catalogs.zh[`dreamSkin.theme.${key}.description`],
    descriptionEn: catalogs.en[`dreamSkin.theme.${key}.description`],
  };
}

export function scienceFictionThemes() {
  return read('./dreamSkinScienceFiction.json').map(([slug, summary, appearance, tone]) => {
    const key = slug.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const copy = dreamSkinCopy(key);
    return { id: `preset-${slug}`, key, summary, appearance, tone, ...copy, englishName: copy.nameEn };
  });
}
