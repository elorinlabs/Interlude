import type { SourceLanguage } from './types';

/** Chinese and English text. Russian lives in resources-ru.ts; read it through resource-text.ts. */
type LocalizedText = Record<SourceLanguage, string>;

export interface AiResource {
  name: string;
  url: string;
  description: LocalizedText;
}

export interface ResourceGroup {
  id: 'models' | 'docs' | 'open-tools' | 'agents' | 'learn';
  title: LocalizedText;
  description: LocalizedText;
  items: AiResource[];
}

// Link to the publisher or project itself. Keep descriptions independent of model versions and pricing.
export const resourceGroups: ResourceGroup[] = [
  {
    id: 'models',
    title: { zh: '模型官网', en: 'Model websites' },
    description: {
      zh: '了解各家模型与产品，从官方入口开始体验。',
      en: 'Explore model families and products, starting with their official websites.',
    },
    items: [
      {
        name: 'OpenAI / GPT', url: 'https://openai.com/',
        description: {
          zh: '了解 GPT 模型、ChatGPT 和 Codex，查看官方产品与研究动态。',
          en: 'Explore GPT models, ChatGPT, Codex, and product and research updates from OpenAI.',
        },
      },
      {
        name: 'Claude', url: 'https://claude.com/',
        description: {
          zh: 'Anthropic 的 AI 助手，了解写作、分析、编程与团队协作功能。',
          en: 'Discover Anthropic’s assistant for writing, analysis, coding, and team collaboration.',
        },
      },
      {
        name: 'Gemini', url: 'https://deepmind.google/models/gemini/',
        description: {
          zh: '查看 Google Gemini 模型家族，了解文本、图像、音频等多模态能力。',
          en: 'Explore Google’s Gemini family and its text, image, audio, and multimodal capabilities.',
        },
      },
      {
        name: 'DeepSeek', url: 'https://www.deepseek.com/',
        description: {
          zh: '访问深度求索的对话产品、模型介绍与 API 开放平台。',
          en: 'Find DeepSeek’s chat experience, model information, and API platform.',
        },
      },
      {
        name: 'Qwen', url: 'https://qwen.ai/',
        description: {
          zh: '千问的官方入口，体验 AI 对话并探索 Qwen 模型相关产品。',
          en: 'Visit Qwen’s official home to try AI chat and explore its model ecosystem.',
        },
      },
      {
        name: 'Kimi', url: 'https://www.kimi.com/',
        description: {
          zh: '月之暗面的 AI 助手，探索资料处理、知识工作与编程场景。',
          en: 'Explore Moonshot’s assistant for working with documents, knowledge, and code.',
        },
      },
      {
        name: 'Z.ai / GLM', url: 'https://z.ai/',
        description: {
          zh: '体验 GLM 模型驱动的对话与 Agent 产品，了解智谱的 AI 工具。',
          en: 'Try chat and agent experiences powered by the GLM model family.',
        },
      },
      {
        name: 'Mistral AI', url: 'https://mistral.ai/',
        description: {
          zh: '了解 Mistral 模型、Le Chat 和开发平台，探索开放模型生态。',
          en: 'Discover Mistral models, Le Chat, its developer platform, and open model ecosystem.',
        },
      },
      {
        name: 'Grok', url: 'https://x.ai/',
        description: {
          zh: '查看 Grok 模型与产品介绍，找到对话体验和开发者入口。',
          en: 'Learn about Grok models and products, with links to chat and developer resources.',
        },
      },
      {
        name: 'MiniMax', url: 'https://www.minimax.io/',
        description: {
          zh: '探索 MiniMax 的语言、语音、音乐和视频模型及相关产品。',
          en: 'Explore MiniMax’s language, speech, music, and video models and products.',
        },
      },
    ],
  },
  {
    id: 'docs',
    title: { zh: 'API 与开发文档', en: 'APIs & documentation' },
    description: {
      zh: '查模型能力、接入方式和调用示例，准备动手时直接翻文档。',
      en: 'Find model capabilities, integration guides, and examples when you are ready to build.',
    },
    items: [
      {
        name: 'OpenAI API', url: 'https://developers.openai.com/api/docs',
        description: {
          zh: '官方 API 指南与参考文档，涵盖模型调用、工具、图像和语音。',
          en: 'Official guides and API reference for model calls, tools, images, and audio.',
        },
      },
      {
        name: 'Claude API', url: 'https://platform.claude.com/docs/en/home',
        description: {
          zh: '从第一次请求到应用集成，查阅 Claude 的 SDK、接口与使用示例。',
          en: 'Find Claude SDKs, API reference, and examples, from a first request to application integration.',
        },
      },
      {
        name: 'Gemini API', url: 'https://ai.google.dev/gemini-api/docs',
        description: {
          zh: 'Google 的 Gemini 开发指南，包含多模态调用、工具与 AI Studio 入口。',
          en: 'Google’s Gemini guides cover multimodal requests, tools, and access to AI Studio.',
        },
      },
      {
        name: 'DeepSeek API', url: 'https://api-docs.deepseek.com/',
        description: {
          zh: '查看 DeepSeek 的接入示例、模型说明、Token 用量和错误码。',
          en: 'Read DeepSeek integration examples, model details, token usage guidance, and error codes.',
        },
      },
    ],
  },
  {
    id: 'open-tools',
    title: { zh: '本地与开源工具', en: 'Local & open tools' },
    description: {
      zh: '寻找模型与数据集，或把开放模型运行在自己的电脑上。',
      en: 'Discover models and datasets, or run open models on your own computer.',
    },
    items: [
      {
        name: 'Hugging Face', url: 'https://huggingface.co/',
        description: {
          zh: '浏览模型、数据集和 Spaces 演示，查看模型卡与社区项目。',
          en: 'Browse models, datasets, and Spaces demos, with model cards and community projects.',
        },
      },
      {
        name: 'ModelScope', url: 'https://modelscope.cn/',
        description: {
          zh: '魔搭社区的模型与数据集入口，发现中文资源和开发者实践。',
          en: 'Discover models, datasets, Chinese-language resources, and developer projects on ModelScope.',
        },
      },
      {
        name: 'Ollama', url: 'https://ollama.com/',
        description: {
          zh: '下载并运行开放模型，探索本地模型工具和模型库。',
          en: 'Download and run open models, and explore tools and a model library for local use.',
        },
      },
      {
        name: 'LM Studio', url: 'https://lmstudio.ai/',
        description: {
          zh: '在桌面上探索和运行开放模型，用于对话、工作与编程。',
          en: 'Explore and run open models on your desktop for chat, work, and coding.',
        },
      },
    ],
  },
  {
    id: 'agents',
    title: { zh: 'Agent 与扩展', en: 'Agents & extensions' },
    description: {
      zh: '了解编程助手、工具连接与可复用技能，让 AI 更贴合你的工作方式。',
      en: 'Learn about coding agents, tool connections, and reusable skills for your workflow.',
    },
    items: [
      {
        name: 'Codex', url: 'https://learn.chatgpt.com/docs/developers',
        description: {
          zh: '官方开发者指南，了解 Codex 的编程工作流、扩展与集成方式。',
          en: 'Official developer guides to Codex workflows, extensions, and integrations.',
        },
      },
      {
        name: 'Model Context Protocol', url: 'https://modelcontextprotocol.io/',
        description: {
          zh: 'MCP 官方规范与文档，了解 AI 应用如何连接外部工具和数据。',
          en: 'The official MCP specification and docs for connecting AI applications to tools and data.',
        },
      },
      {
        name: 'Agent Skills', url: 'https://agentskills.io/',
        description: {
          zh: '了解开放的技能格式，把专业知识、步骤和资源组织成可复用能力。',
          en: 'Learn the open skills format for packaging knowledge, instructions, and reusable resources.',
        },
      },
      {
        name: 'AGENTS.md', url: 'https://agents.md/',
        description: {
          zh: '为编程助手提供项目说明，集中记录构建步骤、测试方式和代码约定。',
          en: 'Give coding agents project context, build steps, test commands, and coding conventions.',
        },
      },
    ],
  },
  {
    id: 'learn',
    title: { zh: '评测与学习', en: 'Evaluation & learning' },
    description: {
      zh: '结合评测与实际任务选模型，再通过课程和示例补齐知识。',
      en: 'Use evaluations alongside your own tasks to explore models, then learn through courses and examples.',
    },
    items: [
      {
        name: 'Artificial Analysis', url: 'https://artificialanalysis.ai/',
        description: {
          zh: '比较模型能力、速度与成本，查看独立评测和测试方法。',
          en: 'Compare model capabilities, speed, and cost through independent evaluations and methodologies.',
        },
      },
      {
        name: 'Arena', url: 'https://arena.ai/leaderboard',
        description: {
          zh: '查看基于真实使用与用户比较的榜单，从不同任务角度了解模型表现。',
          en: 'Explore rankings informed by real usage and user comparisons across different tasks.',
        },
      },
      {
        name: 'Hugging Face Learn', url: 'https://huggingface.co/learn',
        description: {
          zh: '学习大语言模型、Agent、音频与计算机视觉，跟随课程和示例实践。',
          en: 'Learn about language models, agents, audio, and computer vision with courses and examples.',
        },
      },
      {
        name: 'DeepLearning.AI', url: 'https://www.deeplearning.ai/courses?types=short_course',
        description: {
          zh: '通过短课程学习提示词、RAG 与 Agent 开发，把概念变成实践。',
          en: 'Practice prompting, RAG, and agent development through focused short courses.',
        },
      },
    ],
  },
];

export const resourceCount = resourceGroups.reduce((count, group) => count + group.items.length, 0);
