import { ru, ruHomeFaqs } from './copy-ru';
import ja from './ja/copy.json';
import jaHomeFaqs from './ja/faqs.json';
import { withEnglishFallback } from './fallback';
import type { Language } from './types';

const zh = {
  nav: { features: '探索功能', guide: '使用指南', download: '下载', github: 'GitHub', menu: '打开导航' },
  common: {
    learn: '了解更多',
    all: '探索全部功能',
    download: '下载 Interlude',
    web: '打开网页版',
    start: '开始使用',
    next: '继续探索',
    steps: '如何开始',
    faq: '你可能想了解',
    source: '查看项目文档',
    screenshot: '产品界面 · 实际外观以当前版本为准',
    diagram: '功能流程示意',
    back: '全部功能',
    audience: '适合谁使用',
    note: '使用前了解',
    skip: '跳到正文',
    home: '首页',
    markdown: '阅读文本版',
    contents: '本页内容',
  },
  home: {
    badge: '开源的 Codex 图形化工作台',
    title: ['想法，代码，下一步。', '都在一个工作台。'],
    description: '用自然语言推进项目，把对话、模型和工具连在一起。从电脑到浏览器和手机，随时接着做。',
    platforms: 'Windows · macOS · Linux',
    explore: '看看它如何工作',
    pillars: ['自然语言编程', '跨设备继续任务', '账号与模型管理', 'Apache-2.0 开源'],
    remoteLabel: 'PICK UP WHERE YOU LEFT OFF',
    remoteTitle: '离开书桌，\n不用离开思路。',
    remoteBody: '电脑运行项目，浏览器和手机连接工作区。换个屏幕查看进展，继续提出下一步要求。',
    remoteNote: '远程使用需要目标电脑在线，并保持 Interlude 运行。',
    remoteLink: '了解跨设备工作区',
    detailsTitle: '每一处细节，都为日常工作。',
    detailsBody: '看清用量，选好模型，整理历史，换上喜欢的外观。把工作台调成适合自己的样子。',
    faqTitle: '开始之前，先了解这些。',
    finalTitle: '下一个想法，\n现在就开始。',
    finalBody: '下载 Interlude，把 Codex 带进你的日常工作。',
  },
  features: {
    label: 'THE TOOLKIT',
    title: '把工作的每一面，\n都照顾到。',
    description: '从编程到远程连接，从模型管理到界面个性化。选择一项功能，了解它如何融入你的工作。',
    categories: {
      all: '全部功能',
      build: '编程与工具',
      connect: '连接与操作',
      manage: '账号与用量',
      personalize: '个性化',
    },
  },
  download: {
    label: 'MAKE IT YOURS',
    title: '你的下一段工作，\n从这里开始。',
    description: '选择适合电脑的安装包。首次打开后，按首页提示完成 Codex 设置，再开始你的第一个任务。',
    latest: '前往最新版本',
    releases: '全部版本与更新记录',
    platform: '选择你的平台',
    available: '安装包与具体架构以发布页为准。',
    cards: [
      { name: 'Windows', detail: '在熟悉的桌面上开始工作。', packages: 'x64 / ARM64 · 安装程序' },
      { name: 'macOS', detail: '让 Codex 融入你的 Mac 工作流。', packages: 'Apple Silicon / Intel · 查看发布包' },
      { name: 'Linux', detail: '把图形化工作台带到 Linux。', packages: 'x64 · .deb / AppImage（以版本为准）' },
    ],
    webTitle: '已经有一台在线电脑？',
    webBody: '打开 Interlude Web，登录与 PC 端相同的云端账号，选择电脑即可继续。目标电脑需要先安装并运行 Interlude。',
    helpTitle: '第一次使用？跟着指南走。',
    helpBody: '了解安装、账号与模型配置，以及如何从浏览器连接电脑。',
    note: 'Interlude 是独立开源项目，与 OpenAI 无隶属关系。模型账号、API 使用和相关费用由对应服务方提供及收取。',
  },
  guide: {
    label: 'A GOOD PLACE TO START',
    title: '几步准备，\n开始和 AI 一起工作。',
    description: '从安装到第一个任务，再到跨设备连接。这里是 Interlude 的入门路线。',
    sections: [
      {
        title: '01 / 安装 Interlude',
        body: '前往 GitHub Releases，选择适合操作系统和处理器架构的安装包。安装后打开应用，按首页提示完成 Codex 准备。',
      },
      {
        title: '02 / 准备账号或 Provider',
        body: '登录可用的 Codex 账号，或添加兼容的第三方 Provider。确认模型可用，并了解对应服务的额度和费用。',
      },
      {
        title: '03 / 开始第一个任务',
        body: '进入 Codex GUI，选择项目，描述希望完成的目标。可以附上图片或引用文件，再查看回复、命令结果和文件改动。',
      },
      {
        title: '04 / 从另一块屏幕继续',
        body: '让电脑保持在线并运行 Interlude。在网页或移动端登录相同云端账号，选择目标电脑，继续已有对话。',
      },
    ],
    factsTitle: '认识 Interlude',
    facts: [
      ['产品名称', 'Interlude（原 Codex Switch）'],
      ['产品定位', '面向 Codex 的开源图形化 AI 编程工作台'],
      ['桌面平台', 'Windows、macOS、Linux，具体架构以发布包为准'],
      ['远程入口', '网页版与移动端，连接运行 Interlude 的电脑'],
      ['开源协议', 'Apache-2.0'],
      ['模型来源', '用户自己的 Codex 账号或兼容 Provider'],
    ],
    troubleshooting: '遇到问题时',
    troubleshootingBody:
      '先检查当前电脑、账号与模型是否可用。远程连接时，确认两端登录相同云端账号，目标电脑在线。仍有问题，可以查阅仓库文档或提交包含复现步骤的 Issue。',
  },
  footer: {
    description: '让 AI 编程，融入你的工作。',
    product: '产品',
    resources: '资源',
    community: '社区',
    releases: '更新记录',
    issues: '问题反馈',
    license: '开源协议',
    disclaimer: '独立开源项目，与 OpenAI 无隶属关系。',
    communityText: 'QQ 技术交流群：972062132',
    text: '产品文本资料',
  },
};

export type SiteCopy = typeof zh;

const en: typeof zh = {
  nav: { features: 'Features', guide: 'Guide', download: 'Download', github: 'GitHub', menu: 'Open navigation' },
  common: {
    learn: 'Explore feature',
    all: 'Explore all features',
    download: 'Get Interlude',
    web: 'Open web app',
    start: 'Get started',
    next: 'Keep exploring',
    steps: 'Getting started',
    faq: 'A few useful answers',
    source: 'Read project documentation',
    screenshot: 'Product interface · Appearance varies by version',
    diagram: 'Illustrated workflow',
    back: 'All features',
    audience: 'Who it is for',
    note: 'Before you begin',
    skip: 'Skip to content',
    home: 'Home',
    markdown: 'Read as text',
    contents: 'On this page',
  },
  home: {
    badge: 'An open-source workspace for Codex',
    title: ['Your ideas. Your code.', 'One connected workspace.'],
    description:
      'Build through conversation. Bring your projects, models, and tools together. ' +
      'Pick up where you left off, from desktop to browser and phone.',
    platforms: 'Windows · macOS · Linux',
    explore: 'See how it works',
    pillars: [
      'Build through conversation',
      'Continue across devices',
      'Manage accounts & models',
      'Apache-2.0 open source',
    ],
    remoteLabel: 'PICK UP WHERE YOU LEFT OFF',
    remoteTitle: 'Leave the desk.\nKeep the momentum.',
    remoteBody:
      'Your computer runs the project. Your browser and phone connect to its workspace. ' +
      'Check progress and take the next step on another screen.',
    remoteNote: 'Remote access requires the host to stay online with Interlude running.',
    remoteLink: 'Explore connected workspaces',
    detailsTitle: 'The details that make it yours.',
    detailsBody:
      'Understand usage, choose models, organize history, and find a look you love. ' +
      'Shape the workspace around your day.',
    faqTitle: 'A little clarity before you start.',
    finalTitle: 'Your next idea.\nStart here.',
    finalBody: 'Download Interlude and bring Codex into your everyday work.',
  },
  features: {
    label: 'THE TOOLKIT',
    title: 'Every side of\nyour workflow.',
    description:
      'From coding to remote access, model management to a personal look. Explore how ' +
      'each feature fits into your work.',
    categories: {
      all: 'All features',
      build: 'Build & extend',
      connect: 'Connect & operate',
      manage: 'Accounts & usage',
      personalize: 'Personalize',
    },
  },
  download: {
    label: 'MAKE IT YOURS',
    title: 'Your next chapter\nstarts here.',
    description:
      'Choose the package for your computer. On first launch, follow the home screen to ' +
      'prepare Codex and start your first task.',
    latest: 'View latest release',
    releases: 'All releases & changelog',
    platform: 'Choose your platform',
    available: 'Check the release page for available packages and architectures.',
    cards: [
      { name: 'Windows', detail: 'Start from the desktop you know.', packages: 'x64 / ARM64 · Installer' },
      {
        name: 'macOS',
        detail: 'Bring Codex into your Mac workflow.',
        packages: 'Apple Silicon / Intel · See release assets',
      },
      {
        name: 'Linux',
        detail: 'A graphical workspace for Linux.',
        packages: 'x64 · .deb / AppImage, depending on release',
      },
    ],
    webTitle: 'Already have a computer online?',
    webBody:
      'Open Interlude Web, sign into the same cloud account as the PC, and select your ' +
      'computer. The host must have Interlude installed and running.',
    helpTitle: 'First time here? Follow the guide.',
    helpBody: 'Learn how to install, prepare accounts and models, and connect from a browser.',
    note:
      'Interlude is an independent open-source project, unaffiliated with OpenAI. Model ' +
      'access, API usage, and related charges come from the selected service.',
  },
  guide: {
    label: 'A GOOD PLACE TO START',
    title: 'A few steps.\nThen build with AI.',
    description:
      'From installation to your first task and a connected second screen. Start your ' + 'Interlude workflow here.',
    sections: [
      {
        title: '01 / Install Interlude',
        body:
          'Visit GitHub Releases and choose a package for your operating system and ' +
          'processor. Open the app and follow its home screen to prepare Codex.',
      },
      {
        title: '02 / Prepare an account or Provider',
        body:
          'Sign into an available Codex account or add a compatible third-party Provider. ' +
          'Check model availability, quotas, and service charges.',
      },
      {
        title: '03 / Start your first task',
        body:
          'Open Codex GUI, select a project, and describe your goal. Attach images or ' +
          'reference files, then follow replies, command results, and file changes.',
      },
      {
        title: '04 / Continue on another screen',
        body:
          'Keep the host online with Interlude running. Sign into the same cloud account on ' +
          'the browser or mobile client, select the host, and continue the conversation.',
      },
    ],
    factsTitle: 'Meet Interlude',
    facts: [
      ['Product', 'Interlude, formerly Codex Switch'],
      ['Purpose', 'An open-source graphical AI coding workspace for Codex'],
      ['Desktop platforms', 'Windows, macOS, Linux; architectures depend on release assets'],
      ['Remote access', 'Browser and mobile clients connected to a computer running Interlude'],
      ['License', 'Apache-2.0'],
      ['Model access', 'Your own Codex account or compatible Provider'],
    ],
    troubleshooting: 'If something needs a closer look',
    troubleshootingBody:
      'Check the selected computer, account, and model first. For remote work, confirm ' +
      'the same cloud account is signed in and the host is online. Read the repository ' +
      'docs or open an Issue with reproduction steps if needed.',
  },
  footer: {
    description: 'Make AI coding part of your flow.',
    product: 'Product',
    resources: 'Resources',
    community: 'Community',
    releases: 'Changelog',
    issues: 'Report an issue',
    license: 'License',
    disclaimer: 'An independent open-source project, unaffiliated with OpenAI.',
    communityText: 'QQ community: 972062132',
    text: 'Product text reference',
  },
};

// Russian copy lives in copy-ru.ts; anything it lacks falls back to English.
const russian = withEnglishFallback(ru, en, 'copy');
const localized = { zh, en, ru: russian, ja: withEnglishFallback(ja, en, 'ja.copy') };

export function copy(language: Language) {
  return localized[language];
}

export const homeFaqs = {
  zh: [
    {
      question: 'Interlude 是什么？',
      answer:
        'Interlude（原 Codex Switch）是一款面向 Codex 的开源图形化 AI 编程工作台，整合项目对话、账号与模型管理、用量分析和跨设备连接。',
    },
    {
      question: '使用 Interlude 需要付费吗？',
      answer:
        'Interlude 以 Apache-2.0 协议开源。使用 Codex 或第三方模型仍需相应账号或 API 服务，模型额度和费用由对应服务方决定。',
    },
    {
      question: '可以只打开网页就开始吗？',
      answer:
        '远程网页版需要连接一台已安装并运行 Interlude 的电脑。先在电脑上准备 Codex，再用相同云端账号登录网页并选择电脑。',
    },
    {
      question: '支持哪些操作系统？',
      answer:
        '桌面端提供 Windows、macOS 和 Linux 发布包，具体架构以 Releases 为准。电脑助手等系统功能有各自的平台要求。',
    },
  ],
  en: [
    {
      question: 'What is Interlude?',
      answer:
        'Interlude, formerly Codex Switch, is an open-source graphical AI coding ' +
        'workspace for Codex. It combines project conversations, account and model ' +
        'management, usage analytics, and remote access.',
    },
    {
      question: 'Do I need to pay for Interlude?',
      answer:
        'Interlude is open source under Apache-2.0. Codex and third-party models still ' +
        'require the appropriate account or API service; those providers determine quotas ' +
        'and charges.',
    },
    {
      question: 'Can I start with just the website?',
      answer:
        'The remote web app connects to a computer with Interlude installed and running. ' +
        'Prepare Codex there, then sign into the same cloud account on the web and select ' +
        'that computer.',
    },
    {
      question: 'Which operating systems are supported?',
      answer:
        'Desktop releases are available for Windows, macOS, and Linux; check Releases for ' +
        'architectures. System features such as Computer Use have their own platform ' +
        'requirements.',
    },
  ],
  ru: ruHomeFaqs,
  ja: jaHomeFaqs,
};
homeFaqs.ru = withEnglishFallback(homeFaqs.ru, homeFaqs.en, 'homeFaqs');
