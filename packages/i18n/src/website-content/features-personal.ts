import type { Feature } from './types';

export const personalFeatures: Feature[] = [
  {
    slug: 'themes',
    number: '09',
    category: 'personalize',
    image: 'dream-skin',
    imageAlt: { zh: 'Interlude Dream Skin 主题与外观设置', en: 'Interlude Dream Skin themes and appearance settings' },
    source: 'README.md',
    related: ['codex-gui', 'floating-usage', 'skills'],
    zh: {
      title: 'Dream Skin 主题',
      headline: '每天打开的工作台，\n就该合你的心意。',
      summary: '从内置主题中选择喜欢的风格，调整背景与外观，让长时间使用的界面更适合自己。',
      audience: '适合重视工作环境，希望快速切换外观，或根据自己的习惯微调界面的用户。',
      sections: [
        {
          title: '从喜欢的风格开始',
          body: '内置 300 多套主题预设，并兼容 Codex-Dream-Skin。先选择一套接近偏好的主题，再决定是否继续调整。',
          points: ['浏览并选择主题预设。', '一键应用喜欢的风格。', '在不同外观之间切换，找到适合长期使用的方案。'],
        },
        {
          title: '把细节调到舒服',
          body: '通过背景和外观选项调整工作台。界面设置可以配合字体、主题色等偏好，服务于实际阅读和操作。',
          points: ['使用自定义背景。', '调整支持的外观选项。', '兼顾美观、文字对比度和阅读舒适度。'],
        },
        {
          title: '试过之后，也能恢复',
          body: '更换主题主要改变视觉体验，不需要重新配置模型或重建项目。保留恢复入口，方便回到熟悉的外观。',
          points: ['按需要尝试不同主题。', '使用恢复功能回到默认外观。', '远程工作区使用当前查看设备的外观偏好。'],
        },
      ],
      steps: [
        '进入一键换肤或 Dream Skin 页面。',
        '选择主题并应用，按需要调整背景与外观。',
        '在日常工作中检查阅读效果，不满意时恢复或重新选择。',
      ],
      note: '主题效果会随平台、窗口尺寸与版本有所差异。截图展示一种外观，不代表所有主题的默认状态。',
      faqs: [
        {
          question: '更换主题会影响账号和项目吗？',
          answer: '主题用于调整外观，不需要重新创建项目或重新配置模型服务。',
        },
        { question: '能恢复原来的外观吗？', answer: '支持恢复默认外观，也可以重新选择其他主题。' },
      ],
    },
    en: {
      title: 'Dream Skin themes',
      headline: 'Make your daily\nworkspace feel like you.',
      summary: 'Choose a built-in theme and adjust the background and appearance for a workspace you enjoy using.',
      audience: 'For people who want a personal visual environment and a more comfortable reading experience.',
      sections: [
        {
          title: 'Start with a style you like',
          body:
            'Choose from 300+ built-in presets with Codex-Dream-Skin compatibility, then ' +
            'refine the details if needed.',
          points: [
            'Browse theme presets.',
            'Apply a preferred style in one step.',
            'Try different looks for everyday work.',
          ],
        },
        {
          title: 'Tune the details for comfort',
          body:
            'Adjust supported background and appearance options alongside preferences such as ' +
            'fonts and theme color.',
          points: [
            'Use a custom background.',
            'Adjust supported appearance settings.',
            'Balance visual style with contrast and readability.',
          ],
        },
        {
          title: 'Experiment and return to familiar settings',
          body:
            'Changing the visual theme does not require recreating projects or model ' +
            'configurations. Restore the default appearance when needed.',
          points: [
            'Try different themes.',
            'Restore the default appearance.',
            'Remote workspaces use the viewing device’s appearance preferences.',
          ],
        },
      ],
      steps: [
        'Open Dream Skin or the theme page.',
        'Apply a preset and adjust its background and appearance.',
        'Check readability in daily use and restore or change the theme if needed.',
      ],
      note: 'Appearance can vary by platform, window size, and version. The screenshot shows one possible theme.',
      faqs: [
        {
          question: 'Will a new theme change my projects or accounts?',
          answer: 'Themes change the appearance. You do not need to recreate projects or reconfigure model services.',
        },
        {
          question: 'Can I restore the default look?',
          answer: 'Yes. Restore the default appearance or choose a different theme.',
        },
      ],
    },
  },
  {
    slug: 'two-factor',
    number: '10',
    category: 'manage',
    image: 'two-factor',
    imageAlt: {
      zh: 'Interlude 窗口右侧的 2FA 验证码管理面板',
      en: 'The 2FA verification code panel beside the Interlude workspace',
    },
    source: 'README.md',
    related: ['accounts', 'codex-gui', 'floating-usage'],
    zh: {
      title: '2FA 验证码',
      headline: '需要验证码时，\n就在工作台旁边。',
      summary: '从主窗口打开 2FA 面板，在工作过程中查看和管理验证码。',
      audience: '适合在日常登录流程中需要查看二次验证码，希望减少窗口来回切换的用户。',
      sections: [
        {
          title: '从熟悉的入口打开',
          body: '点击菜单中的 2FA，在主窗口右侧打开验证码面板。需要验证时查看，完成后继续原来的工作。',
          points: ['从主窗口菜单进入。', '在右侧面板查看验证码。', '让验证步骤靠近日常工作区。'],
        },
        {
          title: '把验证码管理放到一起',
          body: '在 2FA 面板中管理已添加的验证项目，使用时确认对应服务和账号，避免把验证码用错地方。',
          points: ['查看已有的验证项目。', '根据当前登录目标选择对应条目。', '按照页面提供的操作维护验证信息。'],
        },
        {
          title: '保留账号恢复方式',
          body: '二次验证码只是登录流程的一部分。添加验证项目之前，应保留服务提供方给出的恢复码或其他找回方式。',
          points: [
            '核对验证项目与服务账号的对应关系。',
            '按服务要求输入当前验证码。',
            '妥善保存服务方提供的恢复资料。',
          ],
        },
      ],
      steps: [
        '点击 Interlude 菜单中的 2FA。',
        '在右侧面板查看或管理对应验证项目。',
        '将验证码用于相应服务的正常验证流程。',
      ],
      note: '2FA 面板不能替代服务提供方的账号恢复机制。请妥善保管恢复码，避免向他人分享验证码或验证密钥。',
      faqs: [
        { question: '在哪里打开 2FA？', answer: '点击主窗口菜单中的 2FA，面板会显示在窗口右侧。' },
        {
          question: '丢失验证信息后能靠官网找回吗？',
          answer: '不能。应使用相应服务提供方的恢复码、备用验证方式或账号恢复流程。',
        },
      ],
    },
    en: {
      title: '2FA codes',
      headline: 'Your verification code.\nRight beside your work.',
      summary: 'Open the 2FA panel from the main window to view and manage verification codes.',
      audience: 'For people who need second-factor codes during everyday sign-in and want fewer window switches.',
      sections: [
        {
          title: 'Open it from a familiar place',
          body:
            'Select 2FA from the menu to open the panel on the right side of the main window, ' +
            'then return to your work after verification.',
          points: [
            'Enter through the main window menu.',
            'View verification codes in the side panel.',
            'Keep verification close to your workspace.',
          ],
        },
        {
          title: 'Keep verification entries together',
          body: 'Manage the entries you have added and check the associated service and account before using a code.',
          points: [
            'Review existing verification entries.',
            'Select the entry for the service you are signing into.',
            'Maintain verification information through the available panel controls.',
          ],
        },
        {
          title: 'Keep a way to recover the account',
          body:
            'A verification code is only one part of signing in. Keep the recovery codes or ' +
            'alternatives supplied by the service.',
          points: [
            'Match each entry to the correct service account.',
            'Use the current code as required by that service.',
            'Store the provider’s recovery information carefully.',
          ],
        },
      ],
      steps: [
        'Select 2FA in the Interlude menu.',
        'View or manage the relevant entry in the side panel.',
        'Use its code in the corresponding service’s sign-in flow.',
      ],
      note:
        'The panel does not replace a service’s account recovery process. Keep recovery ' +
        'codes safe and do not share verification codes or secrets.',
      faqs: [
        {
          question: 'Where do I open 2FA?',
          answer: 'Choose 2FA from the main window menu. The panel opens on the right.',
        },
        {
          question: 'Can this website recover lost verification information?',
          answer: 'No. Use the recovery codes, backup factors, or recovery process supplied by the relevant service.',
        },
      ],
    },
  },
  {
    slug: 'floating-usage',
    number: '11',
    category: 'personalize',
    image: 'floating-usage-expanded',
    imageKind: 'compact',
    imageAlt: { zh: 'Interlude 展开的悬浮用量面板', en: 'The expanded Interlude floating usage panel' },
    source: 'README.md',
    related: ['accounts', 'token-usage', 'themes'],
    zh: {
      title: '悬浮用量球',
      headline: '专注手上的事，\n用量抬眼就见。',
      summary: '用紧凑悬浮球或玻璃用量面板，在主工作流旁查看用量、额度和重置倒计时。',
      audience: '适合经常在编辑器和其他应用间工作，希望随时留意模型用量的桌面用户。',
      sections: [
        {
          title: '重要状态，留在视线里',
          body: '开启悬浮用量球后，不必每次回到主窗口查看用量。把它放到方便的位置，专注正在进行的任务。',
          points: ['查看当前用量与额度状态。', '留意额度重置倒计时。', '按需要设置置顶显示。'],
        },
        {
          title: '紧凑与展开，各有所用',
          body: '紧凑圆形适合减少占用，玻璃悬浮面板适合查看更多信息。根据屏幕空间与工作习惯选择。',
          points: ['使用紧凑圆形样式。', '切换到信息更丰富的悬浮面板。', '让状态展示与当前桌面布局配合。'],
        },
        {
          title: '需要时打开，不需要时收起',
          body: '悬浮显示是可选能力，可以在设置中按需启用。需要深入分析时，再打开完整的账号或 Token 用量页面。',
          points: ['在设置中控制悬浮显示。', '配合账号刷新查看状态。', '从概览转到完整用量分析。'],
        },
      ],
      steps: [
        '在设置中找到悬浮球相关选项并启用。',
        '选择紧凑或展开样式，调整显示位置与置顶偏好。',
        '需要详细信息时回到账号或 Token 分析页面。',
      ],
      note: '悬浮球展示应用获取到的用量信息，更新情况取决于账号刷新和相关请求；它不会增加可用额度。',
      faqs: [
        { question: '可以不显示悬浮球吗？', answer: '可以。它是可选功能，支持在设置中关闭。' },
        {
          question: '它和 Token 分析有什么区别？',
          answer: '悬浮球用于快速查看当前状态；Token 分析用于回顾记录的用量趋势和分类分布。',
        },
      ],
    },
    en: {
      title: 'Floating usage widget',
      headline: 'Stay in your flow.\nKeep usage in sight.',
      summary:
        'Check usage, quota status, and reset countdowns in a compact floating widget or ' + 'an expanded glass panel.',
      audience: 'For desktop users working across editors and applications who want a quick view of model usage.',
      sections: [
        {
          title: 'Keep the key status in view',
          body: 'The optional floating widget reduces trips back to the main window while you focus on a task.',
          points: [
            'Check usage and quota status.',
            'See reset countdowns.',
            'Enable always-on-top display when useful.',
          ],
        },
        {
          title: 'Choose compact or expanded',
          body:
            'Use the small circular widget when space is limited, or the expanded glass panel ' +
            'for a richer overview.',
          points: [
            'Use the compact circular style.',
            'Switch to the information panel.',
            'Fit the widget into your desktop layout.',
          ],
        },
        {
          title: 'Use it when you need it',
          body:
            'Enable the widget in settings and turn it off when it is unnecessary. Open ' +
            'account management or analytics for deeper inspection.',
          points: [
            'Control visibility in settings.',
            'Combine it with account refreshes.',
            'Move to full analytics for historical detail.',
          ],
        },
      ],
      steps: [
        'Enable the floating widget in settings.',
        'Choose a style, position, and always-on-top preference.',
        'Open account management or analytics for further detail.',
      ],
      note:
        'The widget displays information available to the app. Updates depend on ' +
        'refreshes and recorded requests; it does not add quota.',
      faqs: [
        { question: 'Can I turn the widget off?', answer: 'Yes. It is optional and can be disabled in settings.' },
        {
          question: 'How does it differ from Token analytics?',
          answer:
            'The widget offers an at-a-glance status. Analytics shows recorded usage trends ' +
            'and category breakdowns.',
        },
      ],
    },
  },
];
