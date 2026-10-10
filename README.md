# AeroTerm

> **轻灵如羽，快如疾风** —— 一个基于 Rust 构建的高性能、极客级、现代化跨平台终端与服务器管理工作站（告别 Electron 臃肿，全面对标 [XTerminal](https://docs.xterminal.cn/)）。

## 项目定位与核心优势
- **极速响应与极致轻量**：采用 Rust + Tauri 2.0 架构，体积 < 25MB，内存占用仅约 40MB，启动毫秒级。
- **全协议覆盖**：SSH 2.0、本地 PTY、SFTP、端口转发隧道 (-L/-R/-D)、远程图形桌面 (RDP/VNC)。
- **深度终端交互**：多标签自由分屏、集群广播输入、Shell Integration (OSC 133) 命令块、智能退出码捕获。
- **无 Agent 服务器监控**：零侵入式探针采集 Linux 原生性能指标与 Top 进程管理。
- **AI 原生与 MCP 互联**：内置 AI 诊断助手，支持标准 Model Context Protocol (Streamable HTTP) 本地服务与安全交互确认。
- **零知识加密金库**：Argon2id + AES-256-GCM 端到端加密，内存零化脱敏（Zeroize）。

## 项目文档与研发排期
详细的技术路线选型、全景功能矩阵架构设计及 16 周研发具体排期（M0 ~ M5 里程碑），请查阅：
👉 [产品技术路线与实施排期 (doc/product_roadmap_and_schedule.md)](doc/product_roadmap_and_schedule.md)
