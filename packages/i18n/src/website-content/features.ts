import { workspaceFeatures } from './features-workspace';
import { managementFeatures } from './features-management';
import { toolFeatures } from './features-tools';
import { personalFeatures } from './features-personal';
import { ruFeatures } from './features-ru';
import jaFeatures from './ja/features.json';
import { withEnglishFallback } from './fallback';
import type { Feature, FeatureContent, Language } from './types';

export const features = [...workspaceFeatures, ...managementFeatures, ...toolFeatures, ...personalFeatures];

export function findFeature(slug: string) {
  return features.find((feature) => feature.slug === slug);
}

if ((import.meta as ImportMeta & { env?: { SSR?: boolean } }).env?.SSR) {
  for (const slug of Object.keys(ruFeatures)) {
    if (!findFeature(slug)) console.warn(`[website] features-ru.ts has text for an unknown feature: ${slug}`);
  }
}

const localizedFeatures: Partial<Record<Language, Record<string, Partial<FeatureContent> & { imageAlt?: string }>>> = {
  ru: ruFeatures, ja: jaFeatures,
};
const translatedContent = new Map<string, FeatureContent>();

/** Resolve feature text independently for each page language, with English as a final fallback. */
export function featureContent(feature: Feature, language: Language): FeatureContent {
  const messages = localizedFeatures[language];
  if (!messages) return language === 'zh' ? feature.zh : feature.en;
  const key = `${language}/${feature.slug}`;
  let content = translatedContent.get(key);
  if (!content) {
    content = withEnglishFallback(messages[feature.slug], feature.en, `${language}.features.${feature.slug}`);
    translatedContent.set(key, content);
  }
  return content;
}

export function featureImageAlt(feature: Feature, language: Language) {
  const messages = localizedFeatures[language];
  if (!messages) return language === 'zh' ? feature.imageAlt.zh : feature.imageAlt.en;
  return withEnglishFallback(
    messages[feature.slug]?.imageAlt,
    feature.imageAlt.en,
    `${language}.features.${feature.slug}.imageAlt`,
  );
}
