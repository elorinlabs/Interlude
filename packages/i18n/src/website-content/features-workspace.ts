import type { Feature } from './types';

export const workspaceFeatures: Feature[] = [
  {
    slug: 'codex-gui',
    number: '01',
    category: 'build',
    image: 'codex-gui',
    imageAlt: {
      zh: 'Interlude 的 Codex GUI：项目列表、对话工作区与任务输入框',
      en: 'Codex GUI with projects, conversations, and a task composer',
    },
    source: 'docs/codex-gui.md',
    related: ['remote-workspace', 'conversations', 'computer-use'],
    zh: {
      title: 'Codex GUI',
      headline: '从一句想法，\n到看得见的实现。',
      summary: '在一个图形化工作台中与 Codex 对话，把项目、上下文、执行过程和代码改动连在一起。',
      audience: '适合希望通过自然语言理解代码、实现功能、修复问题，并随时查看执行过程的开发者。',
      sections: [
        {
          title: '把上下文交代清楚，再开始',
          body: '选择本地项目后，用文字描述目标，附上图片或引用文件。围绕项目组织对话，让后续讨论保持连贯。',
          points: [
            '按项目整理工作，查看和切换 Git 分支。',
            '输入 / 选择命令或技能，按需补充文件与图片。',
            '为任务选择模型、思考强度和访问权限。',
          ],
        },
        {
          title: '执行过程，随时看得见',
          body: '回复会逐步显示，任务中的计划、命令输出和文件改动也会进入对话。需要确认时，你可以在当前工作区处理。',
          points: [
            '查看流式回复、命令结果与执行进度。',
            '阅读文件差异，了解具体修改了什么。',
            '响应问题和权限确认，也可以中断当前任务。',
          ],
        },
        {
          title: '从当前任务，接着往下做',
          body: '历史对话保留了工作的来龙去脉。回到之前的讨论，继续调整需求、检查实现或推进下一步。',
          points: [
            '搜索、重命名、置顶和归档对话。',
            '在桌面或连接到电脑的浏览器中使用工作区。',
            '任务运行在所选电脑上，项目文件保留在那台电脑。',
          ],
        },
      ],
      steps: [
        '安装并打开 Interlude，按首页提示准备 Codex。',
        '进入 Codex GUI，选择项目和可用账号或 Provider。',
        '描述目标，补充上下文，查看执行过程与文件改动。',
      ],
      note: '使用模型需要可用的 Codex 账号或兼容的 Provider。模型可用性、额度和费用由相应服务提供方决定。',
      faqs: [
        {
          question: '一定要先选择项目吗？',
          answer: '不需要。不选项目也可以直接提问；需要围绕代码工作时，再选择相应项目。',
        },
        {
          question: '网页版会把项目搬到云端吗？',
          answer: '远程网页版连接运行 Interlude 的电脑，任务在该电脑执行。它不是独立的云端代码运行环境。',
        },
      ],
    },
    en: {
      title: 'Codex GUI',
      headline: 'From an idea.\nTo a visible result.',
      summary:
        'Work with Codex in a graphical workspace that connects your project, context, ' +
        'execution, and code changes.',
      audience: 'For developers who want to understand code, build features, and resolve issues through conversation.',
      sections: [
        {
          title: 'Give each task the context it needs',
          body:
            'Select a local project, describe the outcome, and attach images or reference ' +
            'files. Organize conversations around the work.',
          points: [
            'Organize projects and view or switch Git branches.',
            'Use / to choose commands or skills and add relevant context.',
            'Choose a model, reasoning effort, and access level for the task.',
          ],
        },
        {
          title: 'Follow the work as it happens',
          body:
            'Streamed replies, plans, command output, and file changes appear in the ' +
            'conversation. Handle requests for input in the same workspace.',
          points: [
            'Read streamed responses and execution progress.',
            'Inspect file diffs to understand changes.',
            'Answer questions, approve permissions, or interrupt a task.',
          ],
        },
        {
          title: 'Pick up where you left off',
          body:
            'Return to an earlier conversation to refine the requirements, review an ' +
            'implementation, or take the next step.',
          points: [
            'Search, rename, pin, and archive conversations.',
            'Use the desktop workspace or a browser connected to your computer.',
            'Tasks run on the selected computer, where the project files reside.',
          ],
        },
      ],
      steps: [
        'Install Interlude and follow the home screen to prepare Codex.',
        'Open Codex GUI, select a project, and choose an account or Provider.',
        'Describe the task and follow execution and file changes.',
      ],
      note:
        'You need a usable Codex account or compatible Provider. Model availability, ' +
        'quotas, and charges depend on that service.',
      faqs: [
        {
          question: 'Do I have to select a project?',
          answer: 'No. You can ask questions without a project. Select one when you want to work with its code.',
        },
        {
          question: 'Does the browser move my project to the cloud?',
          answer:
            'The remote browser connects to a computer running Interlude. Tasks execute on ' +
            'that computer, not in a separate cloud coding environment.',
        },
      ],
    },
  },
  {
    slug: 'remote-workspace',
    number: '02',
    category: 'connect',
    image: 'remote-workspace',
    imageKind: 'diagram',
    imageAlt: {
      zh: '电脑运行项目，浏览器和手机连接工作区的示意图',
      en: 'Diagram of a computer workspace connected to a browser and phone',
    },
    source: 'docs/codex-gui.md',
    related: ['codex-gui', 'conversations', 'providers'],
    zh: {
      title: '跨设备工作区',
      headline: '电脑上的工作，\n换个屏幕继续。',
      summary: '用浏览器或移动端连接运行 Interlude 的电脑，也可以从桌面端切换到另一台在线电脑。',
      audience: '适合需要从不同设备查看任务、继续对话，或管理多台电脑上项目的用户。',
      sections: [
        {
          title: '项目留在电脑，入口随你切换',
          body: '远程连接把另一块屏幕变成工作入口。对话和任务属于所选电脑，切换设备不需要重新创建一套项目。',
          points: [
            '在浏览器中连接电脑，继续使用 Codex 工作区。',
            '移动端适配窄屏对话与任务查看。',
            '桌面端可以在本机和其他在线电脑之间切换。',
          ],
        },
        {
          title: '明确知道自己在操作哪台电脑',
          body: '切换电脑后，项目、对话和模型设置来自目标电脑。已经运行的任务继续留在原电脑上。',
          points: [
            '通过电脑选择器确认当前工作位置。',
            '离线电脑仍可辨认，但不能连接使用。',
            '连接中断时显示连接状态，不会把操作悄悄转到本机。',
          ],
        },
        {
          title: '为远程工作保留必要工具',
          body: '支持的版本可以在远程工作区查看文件差异、使用终端和 Git 工具。远程桌面功能可操作目标 Windows 电脑的主屏幕。',
          points: [
            '远程命令在选中的电脑上运行。',
            '终端和代码改动与远程项目对应。',
            '远程桌面需要对应版本、目标平台及连接条件支持。',
          ],
        },
      ],
      steps: [
        '在目标电脑安装 Interlude，完成 Codex 设置并保持运行联网。',
        '在网页或移动端登录与电脑相同的 Interlude 云端账号。',
        '选择在线电脑，打开项目或已有对话。',
      ],
      note: '远程使用需要目标电脑在线并保持 Interlude 运行。不同平台的系统能力有所差异，具体功能以当前版本为准。',
      faqs: [
        {
          question: '电脑关机后还能执行任务吗？',
          answer: '不能。任务依赖运行 Interlude 的电脑，关机或断网会影响连接与任务执行。',
        },
        {
          question: '切换电脑会停止原来的任务吗？',
          answer: '切换工作区不会主动停止原电脑上的任务。返回那台电脑后可以继续查看。',
        },
      ],
    },
    en: {
      title: 'Connected workspaces',
      headline: 'Same computer.\nA different screen.',
      summary: 'Connect to a computer running Interlude from your browser, phone, or another desktop installation.',
      audience: 'For people who follow tasks across devices or work with projects on multiple computers.',
      sections: [
        {
          title: 'Keep the project on its computer',
          body:
            'A remote connection gives you another way into the workspace. Conversations and ' +
            'tasks belong to the selected computer.',
          points: [
            'Continue Codex work from a connected browser.',
            'Use mobile layouts for conversations and task progress.',
            'Switch between local and online remote computers on desktop.',
          ],
        },
        {
          title: 'Know which computer you are using',
          body:
            'After switching, projects, conversations, and model settings come from the ' +
            'selected computer. Existing tasks remain on their original host.',
          points: [
            'Check the computer picker before starting work.',
            'Offline computers remain identifiable but cannot be selected.',
            'Connection failures do not silently redirect operations to your local computer.',
          ],
        },
        {
          title: 'Bring the supporting tools along',
          body:
            'Supported versions offer remote file diffs, terminal access, and Git tools. ' +
            'Remote desktop can control the primary display of a target Windows computer.',
          points: [
            'Remote commands execute on the selected host.',
            'Terminals and changes correspond to the remote project.',
            'Remote desktop depends on the host platform, version, and connection.',
          ],
        },
      ],
      steps: [
        'Install Interlude and prepare Codex on the host; leave it running and online.',
        'Sign into the same Interlude cloud account on the browser or mobile client.',
        'Choose the online computer and open a project or conversation.',
      ],
      note:
        'The host must stay online with Interlude running. System-level features vary by ' +
        'platform and installed version.',
      faqs: [
        {
          question: 'Can tasks run after my computer shuts down?',
          answer:
            'No. Tasks depend on the host computer. Powering it off or disconnecting it ' +
            'affects execution and access.',
        },
        {
          question: 'Does switching computers stop the previous task?',
          answer:
            'Switching workspaces does not stop tasks on the original computer. Return to ' +
            'that host to check their progress.',
        },
      ],
    },
  },
  {
    slug: 'conversations',
    number: '03',
    category: 'build',
    image: 'conversations',
    imageAlt: { zh: 'Interlude 会话管理界面与会话列表', en: 'Interlude conversation management and history' },
    source: 'README.md',
    related: ['codex-gui', 'remote-workspace', 'token-usage'],
    zh: {
      title: '会话管理',
      headline: '每一次讨论，\n都能接着往下走。',
      summary: '把进行中的工作和历史上下文整理好，快速找回对话，让长期项目保持连续。',
      audience: '适合同时推进多个项目、需要回看讨论过程，或经常接续历史任务的用户。',
      sections: [
        {
          title: '用项目组织讨论',
          body: '在 Codex GUI 中按项目开展任务，让相关的对话围绕同一个工作目录组织，减少来回寻找上下文的时间。',
          points: ['从项目入口查看相关对话。', '在新任务和已有讨论之间切换。', '通过清晰的名称区分不同目标。'],
        },
        {
          title: '重要对话容易找到',
          body: '通过搜索找回已有讨论，将经常使用的对话置顶。暂时告一段落的工作可以归档，让最近列表保持清晰。',
          points: ['搜索和重命名已有对话。', '置顶需要持续关注的工作。', '归档结束的讨论，需要时再恢复。'],
        },
        {
          title: '带着上下文继续',
          body: '再次打开历史对话时，可以回看已有消息和执行结果，再补充新的目标。跨设备连接时，请先确认当前选中的电脑。',
          points: [
            '回顾任务中的回复、命令结果和修改信息。',
            '沿着已有讨论继续迭代需求。',
            '不同电脑的工作区分别保留自己的项目与对话。',
          ],
        },
      ],
      steps: [
        '进入 Codex GUI，选择项目或打开历史列表。',
        '搜索目标对话，并按需要重命名或置顶。',
        '补充新的要求继续工作，完成后按需归档。',
      ],
      note: '截图展示会话管理界面；Codex GUI 同时提供自己的项目对话列表。具体可用操作以所在页面和当前版本为准。',
      faqs: [
        {
          question: '归档之后还能找回来吗？',
          answer: 'Codex GUI 支持查看和恢复归档对话，适合暂时收起已经结束的工作。',
        },
        {
          question: '远程连接会显示哪台电脑的对话？',
          answer: '会显示当前选中电脑的工作区。切换电脑后，对话列表也随工作区切换。',
        },
      ],
    },
    en: {
      title: 'Conversation management',
      headline: 'Keep the context.\nContinue the work.',
      summary: 'Organize active work and previous conversations so longer projects are easier to pick up again.',
      audience: 'For people juggling projects, reviewing earlier decisions, or returning to unfinished tasks.',
      sections: [
        {
          title: 'Organize discussions around projects',
          body:
            'Codex GUI groups work around a project directory, helping related conversations ' +
            'stay close to their context.',
          points: [
            'Find conversations through their project.',
            'Move between new tasks and existing discussions.',
            'Give conversations names that describe the goal.',
          ],
        },
        {
          title: 'Make important work easy to find',
          body:
            'Search for a previous discussion and pin work you revisit often. Archive ' +
            'completed tasks to keep the recent list focused.',
          points: [
            'Search and rename conversations.',
            'Pin ongoing work.',
            'Archive discussions and restore them when needed.',
          ],
        },
        {
          title: 'Continue with the history in view',
          body:
            'Reopen a conversation, review its messages and results, then add the next ' +
            'objective. Check the selected computer when working remotely.',
          points: [
            'Review responses, command results, and change information.',
            'Refine requirements in the existing conversation.',
            'Each computer keeps its own workspace and conversations.',
          ],
        },
      ],
      steps: [
        'Open a project or the conversation list in Codex GUI.',
        'Find the conversation, then rename or pin it as useful.',
        'Continue the work and archive it when finished.',
      ],
      note:
        'The screenshot shows conversation management. Codex GUI also has a project ' +
        'conversation list; available actions depend on the page and version.',
      faqs: [
        {
          question: 'Can I bring back archived conversations?',
          answer: 'Yes. Codex GUI supports viewing and restoring archived conversations.',
        },
        {
          question: 'Which history does a remote client show?',
          answer:
            'The history belongs to the currently selected computer. Switching computers ' +
            'switches the workspace and its conversations.',
        },
      ],
    },
  },
];
