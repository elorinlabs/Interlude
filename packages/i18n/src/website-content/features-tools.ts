import type { Feature } from './types';

export const toolFeatures: Feature[] = [
  {
    slug: 'skills',
    number: '07',
    category: 'build',
    image: 'skills',
    imageAlt: { zh: 'Interlude 插件与 Skills 市场界面', en: 'Interlude community plugin and Skills marketplace' },
    source: 'README.md',
    related: ['computer-use', 'codex-gui', 'themes'],
    zh: {
      title: 'Skills 与插件',
      headline: '让工作台，\n更懂你的工作。',
      summary: '查找和安装社区技能与插件，为常用任务补充可复用的方法和工具。',
      audience: '适合希望减少重复说明、拓展工作流程，或分享自己技能包的用户。',
      sections: [
        {
          title: '找到适合任务的扩展',
          body: '从市场搜索社区 Skill，了解用途后再安装到自己的使用环境。把经常需要的方法保留为可重复使用的能力。',
          points: [
            '搜索和浏览社区技能。',
            '按任务需要选择扩展，保持环境清晰。',
            '在对话中通过命令或技能入口使用已安装能力。',
          ],
        },
        {
          title: '把工具带进对话',
          body: '插件为对话补充特定工具。电脑助手可以与桌面应用交互，其他扩展的作用取决于各自提供的能力和连接。',
          points: ['在应用中管理支持的插件。', '按需启用和停用扩展。', '安装后在对应环境的对话中使用。'],
        },
        {
          title: '把经验整理成可分享的技能',
          body: '登录云端账号后，可以发布和更新自己的版本化 Skill 包，让成熟的工作方法更容易复用。',
          points: ['整理任务说明与必要资源。', '发布带版本的技能包。', '随实际使用情况维护和更新内容。'],
        },
      ],
      steps: [
        '打开 Skills 或社区插件页面，搜索需要的能力。',
        '阅读说明并安装到对应环境。',
        '回到对话中使用，按需要维护或停用。',
      ],
      note: '社区扩展由各自作者维护。安装前应了解其用途、权限和依赖；部分扩展需要额外服务或系统权限。',
      faqs: [
        {
          question: '安装 Skill 就一定能执行任何任务吗？',
          answer: 'Skill 提供方法和上下文，实际执行还依赖模型、可用工具、环境与权限。',
        },
        { question: '可以发布自己的技能吗？', answer: '可以。登录云端账号后，支持发布和更新自己的版本化 Skill 包。' },
      ],
    },
    en: {
      title: 'Skills & plugins',
      headline: 'A workspace that\nknows your workflow.',
      summary: 'Discover community skills and plugins to add reusable methods and tools to everyday tasks.',
      audience: 'For people extending workflows, reducing repeated instructions, or sharing reusable skills.',
      sections: [
        {
          title: 'Find an extension for the task',
          body: 'Search community Skills, understand what they do, and install the ones that fit your work.',
          points: [
            'Search and browse community skills.',
            'Choose extensions around actual tasks.',
            'Use installed capabilities through the conversation skill or command entry.',
          ],
        },
        {
          title: 'Bring tools into the conversation',
          body:
            'Plugins add specific tools. Computer Use interacts with desktop applications; ' +
            'other extensions depend on their own integrations.',
          points: [
            'Manage supported plugins in the app.',
            'Enable or disable extensions as needed.',
            'Use tools in conversations for the matching environment.',
          ],
        },
        {
          title: 'Share a repeatable way of working',
          body: 'Sign into a cloud account to publish and update your own versioned Skill packages.',
          points: [
            'Package task instructions and supporting resources.',
            'Publish a versioned skill.',
            'Maintain it as your workflow evolves.',
          ],
        },
      ],
      steps: [
        'Open Skills or community plugins and find the capability.',
        'Read its description and install it for the intended environment.',
        'Use it in a conversation and maintain or disable it as needed.',
      ],
      note:
        'Community extensions are maintained by their authors. Review their purpose, ' +
        'permissions, and dependencies; some require additional services.',
      faqs: [
        {
          question: 'Does a Skill guarantee a task will succeed?',
          answer:
            'No. Skills provide methods and context. Execution still depends on the model, ' +
            'tools, environment, and permissions.',
        },
        {
          question: 'Can I publish my own skill?',
          answer: 'Yes. A cloud account lets you publish and update versioned Skill packages.',
        },
      ],
    },
  },
  {
    slug: 'computer-use',
    number: '08',
    category: 'connect',
    image: 'computer-use',
    imageKind: 'diagram',
    imageAlt: {
      zh: '电脑助手理解任务、操作应用并检查结果的流程示意图',
      en: 'Diagram of Computer Use inspecting an app, performing actions, and checking results',
    },
    source: 'docs/computer-use-plugin.md',
    related: ['skills', 'codex-gui', 'remote-workspace'],
    zh: {
      title: 'Computer Use 电脑助手',
      headline: '从理解需求，\n到操作你的应用。',
      summary: '让 Codex GUI 使用电脑助手查看应用、操作控件，并通过截图和界面信息确认结果。',
      audience: '适合需要让 AI 协助完成桌面操作，并希望保留清晰任务目标与权限边界的用户。',
      sections: [
        {
          title: '把目标说清楚，让助手执行',
          body: '在支持的电脑上打开 Codex GUI，用自然语言描述任务，例如打开计算器并确认计算结果。',
          points: ['发现可用应用并读取界面信息。', '操作支持的窗口和控件。', '在对话中查看返回的截图和工具结果。'],
        },
        {
          title: '操作之后，再确认结果',
          body: '一次点击并不等于任务完成。助手可以继续读取界面或截图，把实际结果带回对话，帮助检查目标是否达成。',
          points: ['围绕明确目标开展操作。', '结合应用状态与截图验证结果。', '遇到系统确认或权限要求时由用户处理。'],
        },
        {
          title: '按自己的环境启用',
          body: 'Windows 和受支持的 macOS 上，GUI 首次连接会准备电脑助手。其他 Codex Home 可以从插件页安装，也可停用、修复或卸载。',
          points: [
            '支持 Windows x64 / ARM64。',
            '支持 macOS 13 及以上的 Intel 与 Apple Silicon。',
            'macOS 需要用户授予辅助功能和屏幕录制权限。',
          ],
        },
      ],
      steps: [
        '在受支持的 Windows 或 Mac 上打开 Codex GUI。',
        '等待助手准备完成，并按系统提示授予必要权限。',
        '描述一个清晰的操作目标，查看执行结果。',
      ],
      note: '电脑助手不支持所有操作系统和应用。系统安全界面、UAC 与受保护窗口仍受系统限制，权限只能由用户授予。',
      faqs: [
        {
          question: 'Linux 能使用电脑助手吗？',
          answer: '当前内置电脑助手的安装支持 Windows 和 macOS 13+；Linux 不在该插件的支持范围内。',
        },
        {
          question: '可以随时关闭吗？',
          answer: '可以在对应 Codex Home 的插件卡片中停用或卸载。已停用的助手不会在更新时被自动重新启用。',
        },
      ],
    },
    en: {
      title: 'Computer Use',
      headline: 'From a request.\nTo an action on screen.',
      summary:
        'Let Codex GUI inspect applications, operate controls, and check results through ' +
        'screenshots and interface information.',
      audience: 'For people delegating desktop tasks with clear goals and explicit system permissions.',
      sections: [
        {
          title: 'Describe the outcome you need',
          body:
            'On a supported computer, ask Codex GUI to perform a concrete task, such as ' +
            'opening the calculator and checking a result.',
          points: [
            'Discover applications and read interface information.',
            'Operate supported windows and controls.',
            'Review screenshots and tool results in the conversation.',
          ],
        },
        {
          title: 'Check what actually happened',
          body:
            'A click alone is not a completed task. The assistant can inspect the resulting ' +
            'interface and report whether the goal was reached.',
          points: [
            'Work toward a specific, verifiable goal.',
            'Use app state and screenshots to check results.',
            'Leave system confirmations and permission grants to the user.',
          ],
        },
        {
          title: 'Enable it for your environment',
          body:
            'Supported Windows and macOS installations prepare the assistant on the first GUI ' +
            'connection. Manage other Codex Homes from the plugin page.',
          points: [
            'Windows x64 and ARM64 support.',
            'macOS 13+ on Intel and Apple Silicon.',
            'macOS requires user-granted Accessibility and Screen Recording permissions.',
          ],
        },
      ],
      steps: [
        'Open Codex GUI on a supported Windows or Mac computer.',
        'Wait for setup and grant the required system permissions.',
        'Describe a concrete task and review its outcome.',
      ],
      note:
        'Not every operating system or application is supported. Secure system dialogs, ' +
        'UAC, and protected windows remain subject to platform restrictions.',
      faqs: [
        {
          question: 'Is Computer Use available on Linux?',
          answer:
            'The bundled assistant currently supports Windows and macOS 13+. Linux is outside ' +
            'this plugin’s supported platforms.',
        },
        {
          question: 'Can I turn it off?',
          answer:
            'Yes. Disable or uninstall it for the relevant Codex Home. Updates do not ' +
            'automatically re-enable a disabled assistant.',
        },
      ],
    },
  },
];
