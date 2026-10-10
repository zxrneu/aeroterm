export type ShortcutCategory = 'tabs' | 'terminal' | 'view' | 'search' | 'tools' | 'general';

export interface ShortcutItem {
  id: string;
  category: ShortcutCategory;
  label: string;
  description: string;
  macKey: string;
  winKey: string;
  keywords?: string[];
}

export const SHORTCUT_CATEGORIES: { id: ShortcutCategory; name: string; icon: string }[] = [
  { id: 'tabs', name: '标签与分屏', icon: 'Layout' },
  { id: 'terminal', name: '终端与剪贴板', icon: 'Terminal' },
  { id: 'search', name: '终端查找', icon: 'Search' },
  { id: 'view', name: '视图与字号', icon: 'Eye' },
  { id: 'tools', name: '侧边栏与工具', icon: 'Wrench' },
  { id: 'general', name: '命令面板与通用', icon: 'Compass' },
];

export const SHORTCUT_ITEMS: ShortcutItem[] = [
  // 标签与分屏
  {
    id: 'tab-new',
    category: 'tabs',
    label: '新建终端标签',
    description: '快速创建新的本地系统终端 (zsh/bash)',
    macKey: '⌘ T',
    winKey: 'Ctrl+T',
    keywords: ['new tab', 'create', '新建', '终端', '标签'],
  },
  {
    id: 'tab-close',
    category: 'tabs',
    label: '关闭当前标签',
    description: '关闭当前激活的终端标签页并释放 PTY 会话',
    macKey: '⌘ W',
    winKey: 'Ctrl+W',
    keywords: ['close tab', '关闭', '退出'],
  },
  {
    id: 'tab-next',
    category: 'tabs',
    label: '切换至下一个标签',
    description: '向右切换到相邻的下一个终端标签',
    macKey: 'Ctrl+Tab / ⌘ ⌥ →',
    winKey: 'Ctrl+Tab / Ctrl+PageDown',
    keywords: ['next tab', '下一个', '切换'],
  },
  {
    id: 'tab-prev',
    category: 'tabs',
    label: '切换至上一个标签',
    description: '向左切换到相邻的上一个终端标签',
    macKey: 'Ctrl+Shift+Tab / ⌘ ⌥ ←',
    winKey: 'Ctrl+Shift+Tab / Ctrl+PageUp',
    keywords: ['prev tab', '上一个', '切换'],
  },
  {
    id: 'tab-jump',
    category: 'tabs',
    label: '跳转至指定标签 (1-9)',
    description: '直接快速跳转到第 1 到第 9 个标签页',
    macKey: '⌘ 1 ~ ⌘ 9',
    winKey: 'Ctrl+1 ~ Ctrl+9',
    keywords: ['jump tab', '跳转', '标签'],
  },
  {
    id: 'split-toggle',
    category: 'tabs',
    label: '切换双屏分屏',
    description: '开启或关闭终端双屏分屏并列窗口',
    macKey: '⌘ D / ⌘ ⇧ D',
    winKey: 'Ctrl+Shift+D / Alt+\\',
    keywords: ['split', '分屏', '双屏', '并列'],
  },
  {
    id: 'split-focus-switch',
    category: 'tabs',
    label: '切换分屏终端焦点',
    description: '在左侧主终端与右侧分屏终端之间切换键盘输入焦点',
    macKey: '⌥ ← / ⌥ →',
    winKey: 'Alt+Left / Alt+Right',
    keywords: ['focus', '焦点', '分屏焦点', '切换'],
  },

  // 终端与剪贴板
  {
    id: 'term-copy',
    category: 'terminal',
    label: '复制选中文本',
    description: '复制终端中选中的文本；未选中文本时自动传递终端中断信号',
    macKey: '⌘ C',
    winKey: 'Ctrl+Shift+C',
    keywords: ['copy', '复制', '剪贴板'],
  },
  {
    id: 'term-paste',
    category: 'terminal',
    label: '粘贴到终端',
    description: '从系统剪贴板读取内容并写入当前终端 PTY',
    macKey: '⌘ V',
    winKey: 'Ctrl+Shift+V',
    keywords: ['paste', '粘贴', '写入'],
  },
  {
    id: 'term-clear',
    category: 'terminal',
    label: '清空终端屏幕',
    description: '清空当前终端当前视图与回滚缓冲区 (Clear Buffer)',
    macKey: '⌘ K',
    winKey: 'Ctrl+K',
    keywords: ['clear', '清屏', '清空'],
  },
  {
    id: 'term-select-all',
    category: 'terminal',
    label: '全选终端内容',
    description: '选中当前终端整个回滚缓冲区的所有文本',
    macKey: '⌘ A',
    winKey: 'Ctrl+Shift+A',
    keywords: ['select all', '全选'],
  },

  // 终端查找
  {
    id: 'search-toggle',
    category: 'search',
    label: '终端文本查找',
    description: '打开/关闭终端内容快速查找栏',
    macKey: '⌘ F',
    winKey: 'Ctrl+F',
    keywords: ['search', 'find', '查找', '搜索'],
  },
  {
    id: 'search-next',
    category: 'search',
    label: '查找下一个匹配',
    description: '在终端搜索栏中查找下一个匹配项',
    macKey: 'Enter',
    winKey: 'Enter',
    keywords: ['next match', '下一个匹配'],
  },
  {
    id: 'search-prev',
    category: 'search',
    label: '查找上一个匹配',
    description: '在终端搜索栏中查找上一个匹配项',
    macKey: 'Shift+Enter',
    winKey: 'Shift+Enter',
    keywords: ['prev match', '上一个匹配'],
  },

  // 视图与字号
  {
    id: 'view-zoom-in',
    category: 'view',
    label: '放大终端字号',
    description: '增加终端字体字号 (+1px) 并自动重新适应窗口',
    macKey: '⌘ = / ⌘ +',
    winKey: 'Ctrl+= / Ctrl++',
    keywords: ['zoom in', '放大', '字号'],
  },
  {
    id: 'view-zoom-out',
    category: 'view',
    label: '缩小终端字号',
    description: '减小终端字体字号 (-1px) 并自动重新适应窗口',
    macKey: '⌘ -',
    winKey: 'Ctrl+-',
    keywords: ['zoom out', '缩小', '字号'],
  },
  {
    id: 'view-zoom-reset',
    category: 'view',
    label: '恢复默认字号',
    description: '将终端字体恢复为默认标准字号 (14px)',
    macKey: '⌘ 0',
    winKey: 'Ctrl+0',
    keywords: ['zoom reset', '恢复字号', '默认'],
  },

  // 侧边栏与工具
  {
    id: 'drawer-monitor',
    category: 'tools',
    label: '切换服务器监控抽屉',
    description: '显示或收起服务器 CPU、内存、网络及磁盘实时监控',
    macKey: '⌥ 1 / ⌘ ⇧ M',
    winKey: 'Alt+1 / Ctrl+Shift+M',
    keywords: ['monitor', '监控', 'cpu', '内存'],
  },
  {
    id: 'drawer-sftp',
    category: 'tools',
    label: '切换 SFTP 文件管理',
    description: '显示或收起 SFTP 远程文件浏览器与快速编辑器',
    macKey: '⌥ 2 / ⌘ ⇧ E',
    winKey: 'Alt+2 / Ctrl+Shift+E',
    keywords: ['sftp', '文件', '传输', '远程文件'],
  },
  {
    id: 'drawer-tunnels',
    category: 'tools',
    label: '切换端口隧道管理',
    description: '显示或收起本地与 SOCKS5 端口转发隧道侧边栏',
    macKey: '⌥ 3 / ⌘ ⇧ U',
    winKey: 'Alt+3 / Ctrl+Shift+U',
    keywords: ['tunnels', '端口', '隧道', '转发'],
  },
  {
    id: 'drawer-ai',
    category: 'tools',
    label: '切换小易 AI 助手',
    description: '呼出终端智能助手，解答命令与报错分析',
    macKey: '⌥ 4 / ⌘ ⇧ I',
    winKey: 'Alt+4 / Ctrl+Shift+I',
    keywords: ['ai', '小易', '智能助手', 'copilot'],
  },
  {
    id: 'tool-hosts',
    category: 'tools',
    label: '打开主机资产中心',
    description: '打开 SSH 主机连接库与 ~/.ssh/config 快速同步弹窗',
    macKey: '⌘ O',
    winKey: 'Ctrl+O',
    keywords: ['hosts', 'ssh', '主机', '资产'],
  },
  {
    id: 'tool-broadcast',
    category: 'tools',
    label: '切换广播输入模式',
    description: '开启或关闭将当前按键广播发送至所有活跃终端会话',
    macKey: '⌘ B',
    winKey: 'Ctrl+Alt+B',
    keywords: ['broadcast', '广播', '多终端'],
  },
  {
    id: 'tool-recording',
    category: 'tools',
    label: '会话录制开关',
    description: '开始或停止录制终端会话 (导出为 Asciinema .cast 文件)',
    macKey: '⌘ ⇧ R',
    winKey: 'Ctrl+Alt+R',
    keywords: ['record', '录制', 'cast', 'asciinema'],
  },

  // 命令面板与通用
  {
    id: 'general-palette',
    category: 'general',
    label: '快速命令面板',
    description: '呼出全局模糊搜索与命令执行面板 (Command Palette)',
    macKey: '⌘ P / ⌘ ⇧ P',
    winKey: 'Ctrl+P / Ctrl+Shift+P',
    keywords: ['palette', '命令面板', '搜索', '执行'],
  },
  {
    id: 'general-shortcuts',
    category: 'general',
    label: '常用快捷键指南',
    description: '打开常用快捷键完整速查表与操作说明',
    macKey: '⌘ / 或 ?',
    winKey: 'Ctrl+/ 或 ?',
    keywords: ['shortcuts', '快捷键', '帮助', '指南', 'help'],
  },
  {
    id: 'general-escape',
    category: 'general',
    label: '退出 / 关闭浮层',
    description: '关闭当前处于焦点的搜索框、命令面板、抽屉或弹出框',
    macKey: 'Esc',
    winKey: 'Esc',
    keywords: ['escape', '退出', '关闭', 'esc'],
  },
];
