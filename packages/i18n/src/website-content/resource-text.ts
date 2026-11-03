import { withEnglishFallback } from './fallback';
import { resourceGroups, type AiResource, type ResourceGroup } from './resources';
import { ruResourceDescriptions, ruResourceGroups } from './resources-ru';
import jaResourceDescriptions from './ja/resource-descriptions.json';
import jaResourceGroups from './ja/resource-groups.json';
import type { Language } from './types';

const groupText: Partial<Record<Language, Record<string, { title: string; description: string }>>> = {
  ru: ruResourceGroups, ja: jaResourceGroups,
};
const descriptions: Partial<Record<Language, Record<string, string>>> = {
  ru: ruResourceDescriptions, ja: jaResourceDescriptions,
};

if ((import.meta as ImportMeta & { env?: { SSR?: boolean } }).env?.SSR) {
  const names = new Set(resourceGroups.flatMap((group) => group.items.map((resource) => resource.name)));
  for (const name of Object.keys(ruResourceDescriptions)) {
    if (!names.has(name)) console.warn(`[website] resources-ru.ts has a description for an unknown resource: ${name}`);
  }
}

/** Category title and description in the page language. Russian comes from resources-ru.ts. */
export function resourceGroupText(group: ResourceGroup, language: Language) {
  const source = language === 'zh' ? 'zh' : 'en';
  return withEnglishFallback(
    groupText[language]?.[group.id] ?? { title: group.title[source], description: group.description[source] },
    { title: group.title.en, description: group.description.en }, `${language}.resources.${group.id}`,
  );
}

/** Resource description in the page language. Russian comes from resources-ru.ts. */
export function resourceDescription(resource: AiResource, language: Language) {
  return withEnglishFallback(
    descriptions[language]?.[resource.name] ?? resource.description[language === 'zh' ? 'zh' : 'en'],
    resource.description.en,
    `${language}.resources.${resource.name}`,
  );
}
