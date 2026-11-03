import type { Feature } from './types';

export const managementFeatures: Feature[] = [
  {
    slug: 'accounts',
    number: '04',
    category: 'manage',
    image: 'dashboard',
    imageAlt: {
      zh: 'Interlude 账号管理面板：账号卡片、用量与状态',
      en: 'Interlude account dashboard with account status and usage',
    },
    source: 'README.md',
    related: ['providers', 'token-usage', 'floating-usage'],
    zh: {
      title: '多账号管理',
      headline: '账号与用量，\n一眼心中有数。',
      summary: '集中查看账号状态、额度与重置时间，在不同工作需求之间切换可用账号。',
      audience: '适合维护多个 Codex 账号，希望减少手动切换和反复查看额度的用户。',
      sections: [
        {
          title: '把账号信息放在一起看',
          body: '账号卡片展示邮箱、套餐、用量窗口与重置信息。表格列可以按需要调整，让日常关注的信息更容易找到。',
          points: [
            '查看主、次用量窗口和重置倒计时。',
            '查看套餐、到期时间与当日 Token 信息。',
            '手动刷新或设置定时刷新，获取可用的最新状态。',
          ],
        },
        {
          title: '按任务需要切换账号',
          body: '支持应用内登录、浏览器登录与账号配置导入。手动切换适合明确的任务安排，自动切号适合预先设置好的额度策略。',
          points: [
            '登录并添加多个账号。',
            '为自动切换设置优先级与额度阈值。',
            '额度不足时，按已启用的策略选择可用账号。',
          ],
        },
        {
          title: '管理配置，也保留控制权',
          body: '可以通过备份包导出和恢复本地账号与服务商配置。GUI 对话使用独立记忆的账号选择，方便分别安排使用场景。',
          points: [
            '支持常见账号 JSON 格式导入。',
            '通过 .cs 备份包迁移或恢复配置。',
            '留意 GUI 账号和其他应用所用账号的区别。',
          ],
        },
      ],
      steps: [
        '通过登录或导入添加账号。',
        '刷新并确认账号状态、剩余额度与重置时间。',
        '选择要使用的账号，按需要配置自动切换。',
      ],
      note: '自动切号需要主动启用并配置。账号卡片展示服务提供方返回的信息，不能保证额度或服务持续可用。',
      faqs: [
        {
          question: '自动切号会改变正在使用的 GUI 账号吗？',
          answer: 'Codex GUI 独立记忆所选账号；共享自动回退和并发路由不会自动替换 GUI 当前选择。',
        },
        {
          question: '能导入已有账号配置吗？',
          answer: '支持 auth.json 以及常见第三方和多账号 JSON 格式。请只导入你有权使用的账号。',
        },
      ],
    },
    en: {
      title: 'Multiple accounts',
      headline: 'Your accounts.\nA clearer overview.',
      summary: 'See account status, quotas, and reset times together, and choose an available account for the work.',
      audience: 'For people managing multiple Codex accounts who want less manual switching and quota checking.',
      sections: [
        {
          title: 'See the account information together',
          body:
            'Account cards surface email, plan, usage windows, and reset information. ' +
            'Customize table columns around what matters to you.',
          points: [
            'Review primary and secondary usage windows.',
            'Check plan, expiration, reset time, and daily Token information.',
            'Refresh manually or configure scheduled refreshes.',
          ],
        },
        {
          title: 'Choose accounts around your work',
          body:
            'Add accounts through in-app login, browser login, or configuration import. Use ' +
            'manual selection or configure automatic switching.',
          points: [
            'Add and manage multiple accounts.',
            'Set priorities and quota thresholds for automatic switching.',
            'Use enabled fallback rules when quota runs low.',
          ],
        },
        {
          title: 'Keep control of your configuration',
          body:
            'Export and restore local account and Provider settings with a backup package. ' +
            'Codex GUI remembers its own account selection.',
          points: [
            'Import supported account JSON formats.',
            'Move or restore configuration with a .cs backup.',
            'Distinguish the GUI account from the account selected for other applications.',
          ],
        },
      ],
      steps: [
        'Add an account through login or import.',
        'Refresh and check its status, quota, and reset time.',
        'Select the account and configure automatic switching if needed.',
      ],
      note:
        'Automatic switching must be enabled and configured. Reported quotas and service ' +
        'availability depend on the account provider.',
      faqs: [
        {
          question: 'Does automatic switching change my GUI account?',
          answer:
            'Codex GUI remembers its selection independently. Shared fallback and concurrent ' +
            'routing do not replace that selection.',
        },
        {
          question: 'Can I import existing configurations?',
          answer:
            'Interlude supports auth.json and common third-party and multiple-account JSON ' +
            'formats. Only import accounts you are authorized to use.',
        },
      ],
    },
  },
  {
    slug: 'providers',
    number: '05',
    category: 'manage',
    image: 'providers',
    imageAlt: {
      zh: 'Interlude 第三方 Provider 与模型服务配置界面',
      en: 'Interlude third-party Provider and model configuration',
    },
    source: 'README.md',
    related: ['accounts', 'codex-gui', 'token-usage'],
    zh: {
      title: 'Provider 与本地代理',
      headline: '选择适合任务的，\n模型与服务。',
      summary: '集中配置第三方模型服务，通过本地代理衔接兼容接口，灵活安排官方账号与 Provider 的使用。',
      audience: '适合使用自选模型服务、兼容 API 或多个 Provider 的开发者。',
      sections: [
        {
          title: '集中维护模型连接',
          body: '把服务地址、可用模型和连接设置放到同一个管理界面。为不同需求保留独立配置，减少在多个应用间重复修改。',
          points: [
            '支持 OpenAI Responses 与兼容 Chat Completions 的服务。',
            '维护多个 Provider 和模型配置。',
            '按服务能力选择模型控制策略。',
          ],
        },
        {
          title: '通过本地入口连接服务',
          body: '本地代理提供统一的访问入口，支持官方账号与 Provider 之间热切换。具体能力仍取决于上游接口是否兼容。',
          points: [
            '通过本机代理连接已配置的模型服务。',
            '在官方账号与第三方 Provider 之间切换。',
            'GUI 可以独立选择可用账号或 Provider。',
          ],
        },
        {
          title: '连得上，也看得清',
          body: '结合代理会话与 Token 分析，查看请求表现和用量。部分常见中转站还支持余额查询，便于日常检查。',
          points: ['查看代理会话与请求信息。', '按 Provider 和模型分析记录的用量。', '在服务支持时查看余额信息。'],
        },
      ],
      steps: [
        '在 Provider 页面添加服务地址和你持有的凭据。',
        '配置可用模型，确认服务接口兼容。',
        '在 GUI 中选择该服务，或启用本地代理供相应应用使用。',
      ],
      note: 'Interlude 不提供模型额度。第三方服务的价格、数据处理方式和可用能力由该服务方决定。',
      faqs: [
        {
          question: '所有第三方模型都能直接使用吗？',
          answer: '需要服务接口与所选模式兼容。模型工具能力、图片支持和返回格式可能不同，请以实际服务为准。',
        },
        {
          question: 'GUI 使用 Provider 必须先打开外部代理吗？',
          answer: 'GUI 连接会自动准备自己的访问入口，不要求先启用供其他应用使用的外部代理。',
        },
      ],
    },
    en: {
      title: 'Providers & local proxy',
      headline: 'The right model.\nYour choice of service.',
      summary: 'Manage third-party model services and connect compatible APIs through a local proxy.',
      audience: 'For developers using their own model services, compatible APIs, or multiple Providers.',
      sections: [
        {
          title: 'Manage model connections in one place',
          body:
            'Keep service addresses, model choices, and connection settings together, with ' +
            'separate configurations for different needs.',
          points: [
            'Use OpenAI Responses or compatible Chat Completions services.',
            'Maintain multiple Providers and models.',
            'Configure model policies around the service capabilities.',
          ],
        },
        {
          title: 'Connect through a local entry point',
          body:
            'The local proxy offers a consistent entry point and hot switching between ' +
            'official accounts and Providers. Compatibility still depends on the upstream ' +
            'API.',
          points: [
            'Connect configured services through a local proxy.',
            'Switch between official accounts and third-party Providers.',
            'Select a GUI account or Provider independently.',
          ],
        },
        {
          title: 'Understand the connection and its usage',
          body:
            'Review proxy sessions and recorded Token usage. Supported relay services may ' +
            'also expose their account balance.',
          points: [
            'Inspect proxy sessions and request information.',
            'Break down recorded usage by Provider and model.',
            'Check balances when supported by the service.',
          ],
        },
      ],
      steps: [
        'Add the service address and your credentials on the Provider page.',
        'Configure models and confirm API compatibility.',
        'Select the service in GUI or enable the local proxy for another application.',
      ],
      note:
        'Interlude does not supply model credits. Pricing, data handling, availability, ' +
        'and capabilities are controlled by the service provider.',
      faqs: [
        {
          question: 'Does every third-party model work?',
          answer:
            'The API must be compatible with the selected mode. Tool use, image support, and ' +
            'response formats vary between services.',
        },
        {
          question: 'Must I enable the external proxy for GUI?',
          answer:
            'No. GUI prepares its own connection and does not require enabling the proxy used ' +
            'by other applications.',
        },
      ],
    },
  },
  {
    slug: 'token-usage',
    number: '06',
    category: 'manage',
    image: 'token-usage',
    imageAlt: {
      zh: 'Interlude Token 分析：趋势、热力图与用量分布',
      en: 'Interlude Token analysis with trends, heatmaps, and usage breakdowns',
    },
    source: 'README.md',
    related: ['providers', 'accounts', 'floating-usage'],
    zh: {
      title: 'Token 用量分析',
      headline: '每一次调用，\n都有迹可循。',
      summary: '从趋势、热力图和分类排行了解记录的 Token 用量，让模型使用情况更直观。',
      audience: '适合希望了解使用习惯、比较不同模型消耗，或排查代理请求表现的用户。',
      sections: [
        {
          title: '从整体趋势找到变化',
          body: '用热力图和趋势图回顾不同时间段的活动，观察使用节奏和消耗变化，减少只凭印象判断。',
          points: ['按周查看使用热力图。', '查看 Token 用量与趋势变化。', '结合工作时间理解使用高峰。'],
        },
        {
          title: '按真正关心的维度查看',
          body: '按 Token 类型、Provider、模型和账号查看分布与排行，了解不同工作安排对应的用量。',
          points: ['区分记录中的不同 Token 类型。', '比较模型与 Provider 的用量分布。', '查看账号维度的消耗情况。'],
        },
        {
          title: '从汇总回到具体请求',
          body: '代理会话可以帮助查看消息、上下文占用与响应延迟。需要进一步排查时，可以导出结构化诊断信息。',
          points: ['查看代理记录的会话与消息。', '关注上下文占用和响应时间。', '导出诊断信息用于分析问题。'],
        },
      ],
      steps: [
        '通过 Interlude 的 GUI 或代理开展任务。',
        '打开 Token 分析，查看趋势和分类排行。',
        '需要排查时，结合代理会话查看具体请求。',
      ],
      note: '统计以应用实际记录的数据为准，未经过相关入口的请求可能不在其中。费用估算不等同于服务商最终账单。',
      faqs: [
        {
          question: '统计会包含我所有应用的模型调用吗？',
          answer: '不会自动覆盖所有应用。统计范围取决于 Interlude 实际记录的请求和当前配置。',
        },
        {
          question: '页面中的金额是实际扣费吗？',
          answer: '金额属于估算或服务返回的信息。实际订阅与 API 扣费应以对应服务商的账单为准。',
        },
      ],
    },
    en: {
      title: 'Token analytics',
      headline: 'See where\nthe Tokens go.',
      summary: 'Understand recorded model usage through trends, heatmaps, and practical breakdowns.',
      audience: 'For people reviewing usage habits, comparing models, or investigating proxy request performance.',
      sections: [
        {
          title: 'Start with the larger pattern',
          body: 'Heatmaps and trends help you review activity over time and understand changes in usage.',
          points: [
            'Review weekly activity heatmaps.',
            'Follow Token usage trends.',
            'Relate usage peaks to your work.',
          ],
        },
        {
          title: 'Break usage down by what matters',
          body:
            'Compare recorded usage across Token types, Providers, models, and accounts to ' +
            'understand different workflows.',
          points: [
            'Distinguish recorded Token categories.',
            'Compare model and Provider usage.',
            'Review account-level breakdowns.',
          ],
        },
        {
          title: 'Go from totals to individual requests',
          body:
            'Proxy sessions show messages, context usage, and response latency. Export ' +
            'structured diagnostics when you need to investigate further.',
          points: [
            'Inspect recorded sessions and messages.',
            'Review context occupancy and response time.',
            'Export diagnostic information for troubleshooting.',
          ],
        },
      ],
      steps: [
        'Run tasks through Interlude GUI or its proxy.',
        'Open Token analytics to review trends and breakdowns.',
        'Use proxy sessions to investigate individual requests.',
      ],
      note:
        'Statistics reflect the requests actually recorded by the application. Cost ' +
        'estimates are not the final bill from your service provider.',
      faqs: [
        {
          question: 'Does this include every model call on my computer?',
          answer: 'No. Coverage depends on the requests Interlude records and the active configuration.',
        },
        {
          question: 'Is the displayed cost my actual charge?',
          answer:
            'Amounts are estimates or information returned by a service. Refer to the ' +
            'provider for actual subscription or API billing.',
        },
      ],
    },
  },
];
