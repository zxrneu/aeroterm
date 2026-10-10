# AeroTerm 常用键盘快捷键指南 (Keyboard Shortcuts)

AeroTerm 作为高性能极客级终端与运维工作站，内置了一套完整、现代且深度集成的键盘快捷键系统。快捷键通过双层事件总线驱动：
1. **底层 xterm.js 深度接管**：通过 `term.attachCustomKeyEventHandler` 在终端获得输入焦点时精准拦截快捷操作，避免终端 PTY 吞噬按键；
2. **全局视窗级调度**：在非终端区域、侧边栏或通用页面中同样支持快捷键触发；
3. **自适应平台支持**：自动适配 macOS (<kbd>⌘ Command</kbd>) 与 Windows / Linux (<kbd>Ctrl</kbd>)。

---

## 快捷键速查表

### 1. 标签页与分屏管理 (Tabs & Split Panes)

| 功能说明 | macOS 快捷键 | Windows / Linux 快捷键 | 详细行为 |
|---|---|---|---|
| **新建系统终端标签** | <kbd>⌘</kbd> + <kbd>T</kbd> | <kbd>Ctrl</kbd> + <kbd>T</kbd> | 创建新的本地系统终端 (zsh/bash) 并自动聚焦 |
| **关闭当前标签** | <kbd>⌘</kbd> + <kbd>W</kbd> | <kbd>Ctrl</kbd> + <kbd>W</kbd> | 关闭当前激活的标签页，释放对应 PTY 会话 (至少保留 1 个标签) |
| **切换至下一个标签** | <kbd>Ctrl</kbd> + <kbd>Tab</kbd> / <kbd>⌘</kbd> + <kbd>⌥</kbd> + <kbd>→</kbd> | <kbd>Ctrl</kbd> + <kbd>Tab</kbd> / <kbd>Ctrl</kbd> + <kbd>PageDown</kbd> | 循环向右切换至相邻标签页 |
| **切换至上一个标签** | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Tab</kbd> / <kbd>⌘</kbd> + <kbd>⌥</kbd> + <kbd>←</kbd> | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Tab</kbd> / <kbd>Ctrl</kbd> + <kbd>PageUp</kbd> | 循环向左切换至相邻标签页 |
| **跳转至指定标签 (1~9)** | <kbd>⌘</kbd> + <kbd>1</kbd> ~ <kbd>9</kbd> | <kbd>Ctrl</kbd> + <kbd>1</kbd> ~ <kbd>9</kbd> | 快速直达第 1 到第 9 个标签页 |
| **切换双屏分屏终端** | <kbd>⌘</kbd> + <kbd>D</kbd> / <kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>D</kbd> | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | 开启或关闭并排双屏终端 |
| **切换分屏焦点** | <kbd>⌥</kbd> + <kbd>←</kbd> / <kbd>→</kbd> 或 <kbd>⌥</kbd> + <kbd>O</kbd> | <kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>→</kbd> 或 <kbd>Alt</kbd> + <kbd>O</kbd> | 在左侧主终端与右侧分屏终端之间切换键盘输入焦点 |

---

### 2. 终端文本、编辑与剪贴板 (Terminal & Clipboard)

| 功能说明 | macOS 快捷键 | Windows / Linux 快捷键 | 详细行为 |
|---|---|---|---|
| **复制选中文本** | <kbd>⌘</kbd> + <kbd>C</kbd> | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd> | 当终端存在选中文本时，复制至系统剪贴板并弹出提示；若未选中文本，则放行向下传递 `^C` (SIGINT) 中断信号 |
| **粘贴到终端** | <kbd>⌘</kbd> + <kbd>V</kbd> | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd> | 从系统剪贴板读取内容并安全写入终端 PTY |
| **清空当前终端屏幕** | <kbd>⌘</kbd> + <kbd>K</kbd> | <kbd>Ctrl</kbd> + <kbd>K</kbd> | 清理终端屏幕内容与回滚缓冲区 (Clear Scrollback) |
| **全选终端内容** | <kbd>⌘</kbd> + <kbd>A</kbd> | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>A</kbd> | 选中当前终端缓冲区的全部文本 |

---

### 3. 终端内查找 (Find In Terminal)

| 功能说明 | macOS 快捷键 | Windows / Linux 快捷键 | 详细行为 |
|---|---|---|---|
| **呼出 / 隐藏查找栏** | <kbd>⌘</kbd> + <kbd>F</kbd> | <kbd>Ctrl</kbd> + <kbd>F</kbd> | 在当前激活终端右上角呼出玻璃拟态搜索条，自动聚焦输入框 |
| **查找下一个匹配** | <kbd>Enter</kbd> | <kbd>Enter</kbd> | 查找并高亮向后的下一个匹配项 (支持 IME 中文防误触) |
| **查找上一个匹配** | <kbd>Shift</kbd> + <kbd>Enter</kbd> | <kbd>Shift</kbd> + <kbd>Enter</kbd> | 查找并高亮向前的前一个匹配项 |
| **匹配选项** | 界面按钮切换 | 界面按钮切换 | 支持大小写匹配 (`Aa`)、全词匹配 (`\b`) 与正则表达式 (`.*`) |
| **关闭查找栏** | <kbd>Esc</kbd> | <kbd>Esc</kbd> | 关闭查找栏并清除终端高亮标记，焦点回归终端 |

---

### 4. 视图与字号缩放 (Zoom & View)

| 功能说明 | macOS 快捷键 | Windows / Linux 快捷键 | 详细行为 |
|---|---|---|---|
| **增大终端字号** | <kbd>⌘</kbd> + <kbd>=</kbd> / <kbd>+</kbd> | <kbd>Ctrl</kbd> + <kbd>=</kbd> / <kbd>+</kbd> | 增大字号 (+1px，最高 32px)，终端视口自动重新计算行列大小 (FitAddon) 并同步 PTY |
| **减小终端字号** | <kbd>⌘</kbd> + <kbd>-</kbd> | <kbd>Ctrl</kbd> + <kbd>-</kbd> | 减小字号 (-1px，最低 10px)，自动适配并重绘终端 |
| **恢复默认字号** | <kbd>⌘</kbd> + <kbd>0</kbd> | <kbd>Ctrl</kbd> + <kbd>0</kbd> | 重置字号为默认 14px 标准尺寸 |

---

### 5. 快速命令面板与帮助 (Command Palette & Help)

| 功能说明 | macOS 快捷键 | Windows / Linux 快捷键 | 详细行为 |
|---|---|---|---|
| **快速命令面板** | <kbd>⌘</kbd> + <kbd>P</kbd> | <kbd>Ctrl</kbd> + <kbd>P</kbd> | 呼出类似 Raycast / Spotlight 的全局模糊搜索面板，支持方向键选择与一键运行 |
| **快捷键完整指南** | <kbd>⌘</kbd> + <kbd>/</kbd> 或 <kbd>?</kbd> | <kbd>Ctrl</kbd> + <kbd>/</kbd> 或 <kbd>?</kbd> | 呼出可视化快捷键速查中心，支持分类浏览与搜索对照 |
| **通用退出 / 取消** | <kbd>Esc</kbd> | <kbd>Esc</kbd> | 快速退出查找条、命令面板、快捷键帮助、资产管理或当前打开的抽屉 |

---

### 6. 侧边栏工具与高级特性 (Sidebars & Power Tools)

| 功能说明 | macOS 快捷键 | Windows / Linux 快捷键 | 详细行为 |
|---|---|---|---|
| **服务器实时监控抽屉** | <kbd>⌥</kbd> + <kbd>1</kbd> | <kbd>Alt</kbd> + <kbd>1</kbd> | 展开 / 收起 CPU、内存、网络 IO 与磁盘空间实时面板 |
| **SFTP 文件管理抽屉** | <kbd>⌥</kbd> + <kbd>2</kbd> | <kbd>Alt</kbd> + <kbd>2</kbd> | 展开 / 收起远程文件浏览器与快速文本编辑器 |
| **端口隧道管理抽屉** | <kbd>⌥</kbd> + <kbd>3</kbd> | <kbd>Alt</kbd> + <kbd>3</kbd> | 展开 / 收起本地映射与 SOCKS5 代理隧道列表 |
| **小易 AI 终端助手** | <kbd>⌥</kbd> + <kbd>4</kbd> | <kbd>Alt</kbd> + <kbd>4</kbd> | 呼出终端智能助手，自动解释报错或生成管理命令 |
| **主机资产管理中心** | <kbd>⌘</kbd> + <kbd>O</kbd> | <kbd>Ctrl</kbd> + <kbd>O</kbd> | 打开 SSH 主机库弹窗与 `~/.ssh/config` 一键同步导入 |
| **集群广播输入模式** | <kbd>⌘</kbd> + <kbd>B</kbd> | <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>B</kbd> | 开启 / 关闭广播输入模式（一次输入同时分发至所有会话） |
| **会话录制开关** | <kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>R</kbd> | <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>R</kbd> | 开启或停止录制终端会话，停止后自动导出为 Asciinema `.cast` 文件 |

---

## 交互设计与技术实现亮点

1. **智能复制/中断分离**：
   解决 Web 终端长期存在的痛点——在终端按 <kbd>⌘C</kbd> / <kbd>Ctrl+C</kbd> 时，若缓冲区内存在选中文本，优先执行内容复制，绝不误杀正在运行的进程；仅当没有选中文本时才向 Shell 发送 `^C` 中断信号。
2. **非侵入式毛玻璃状态 Toast**：
   快捷操作（如字号缩放、清屏、复制成功、广播状态切换）触发时，在底部中间呈现精致微动画提示，清晰感知状态反馈。
3. **中文输入法 (IME) 合成兼容**：
   在终端内查找条与命令面板中，利用 `KeyboardEvent.isComposing` 与 `keyCode === 229` 双重兜底，避免中文拼音选词敲击回车时被误判定为提交执行。
4. **即时发现性 (Discoverability)**：
   在顶部导航栏、工具 Dock 与快捷指令条中均常态显示快捷键徽标提示与入口按钮，降低学习成本。
