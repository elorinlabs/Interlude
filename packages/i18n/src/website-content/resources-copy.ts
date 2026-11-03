import { withEnglishFallback } from './fallback';
import { ruResourcesCopy } from './resources-ru';
import ja from './ja/resources-copy.json';
import type { Language } from './types';

const zh = {
  title: 'AI 资源',
  heading: '把好用的 AI 资源，\n放在一起。',
  description: '从模型官网到开发文档，从本地工具到学习资料。按场景整理，帮你更快找到下一步。',
  metadata: '探索 AI 模型官网、API 文档、本地与开源工具、Agent 扩展、模型评测和学习课程。',
  entries: '个精选入口',
  groups: '个分类',
  navigation: '按需探索',
  sourceNote: '链接直达各资源原站，具体功能与使用方式请查看对应网站。',
  external: '在新标签页打开',
  nextTitle: '接下来，回到你的工作台。',
  nextBody: '准备配置模型或扩展工作流？从这两份指南继续。',
  providers: '了解 Provider 配置',
  skills: '探索 Skills 与插件',
};

export type ResourcesCopy = typeof zh;

const en: typeof zh = {
  title: 'AI resources',
  heading: 'Good AI resources.\nAll in one place.',
  description: 'Model websites, developer docs, local tools, and learning materials. Find your next step here.',
  metadata: 'Explore AI model websites, API docs, open tools, agent extensions, evaluations, and courses.',
  entries: 'curated links',
  groups: 'categories',
  navigation: 'Explore by category',
  sourceNote: 'Links lead to each resource’s own website. Visit the source for features and usage details.',
  external: 'Opens in a new tab',
  nextTitle: 'Bring it back to your workspace.',
  nextBody: 'Ready to configure a model or extend your workflow? Continue with these guides.',
  providers: 'Explore Provider setup',
  skills: 'Discover Skills & plugins',
};

// Russian copy lives in resources-ru.ts; anything it lacks falls back to English.
const russian = withEnglishFallback(ruResourcesCopy, en, 'resourcesCopy');
const localized = { zh, en, ru: russian, ja: withEnglishFallback(ja, en, 'ja.resourcesCopy') };

export function resourcesCopy(language: Language) {
  return localized[language];
}
