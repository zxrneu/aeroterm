import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import {
  Activity,
  Bot,
  Check,
  Code,
  Command,
  FileText,
  FolderPlus,
  FolderTree,
  Keyboard,
  Network,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  SplitSquareVertical,
  Terminal as TerminalIcon,
  Trash2,
  UploadCloud,
  Video,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CommandPalette, type CommandItem } from './components/CommandPalette';
import { ShortcutsModal } from './components/ShortcutsModal';
import { TerminalSearch } from './components/TerminalSearch';
import { ShortcutToast } from './components/ShortcutToast';


interface SavedConnection {
  id: string;
  name: string;
  protocol: 'ssh' | 'localpty' | string;
  host: string;
  port: number;
  username: string;
  tags: string[];
  note?: string;
}

interface TabItem {
  id: string;
  name: string;
  type: 'local' | 'ssh';
  host?: string;
  port?: number;
  user?: string;
}

interface EditingFile {
  path: string;
  name: string;
  content: string;
  saving: boolean;
}

interface TunnelItem {
  id: string;
  name: string;
  tunnelType: 'local' | 'socks5';
  localPort: number;
  remoteHost?: string;
  remotePort?: number;
  running: boolean;
}

const QUICK_COMMANDS = [
  { label: '进程监控', cmd: 'top -l 1 | head -n 20' },
  { label: '端口监听', cmd: 'lsof -iTCP -sTCP:LISTEN -n -P' },
  { label: '磁盘空间', cmd: 'df -h' },
  { label: '网络状态', cmd: 'netstat -nr | head -n 15' },
  { label: 'Git 状态', cmd: 'git status' },
  { label: '清空屏幕', cmd: 'clear' },
];

export function App() {
  const isDev = window.location.port === '5173';
  const apiBase = isDev ? 'http://127.0.0.1:12335' : window.location.origin;
  const wsBase = isDev
    ? 'ws://127.0.0.1:12335'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

  // Tabs Management
  const [tabs, setTabs] = useState<TabItem[]>([
    { id: 'local-1', name: 'Local (zsh)', type: 'local' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('local-1');
  const [showAddTabMenu, setShowAddTabMenu] = useState(false);

  // Split Screen
  const [isSplitScreen, setIsSplitScreen] = useState(false);
  const [splitTabId] = useState<string>('local-split');

  // Terminals Refs & Instances
  const mainTermRef = useRef<HTMLDivElement>(null);
  const splitTermRef = useRef<HTMLDivElement>(null);
  const mainXterm = useRef<Terminal | null>(null);
  const splitXterm = useRef<Terminal | null>(null);
  const mainFitAddon = useRef<FitAddon | null>(null);
  const splitFitAddon = useRef<FitAddon | null>(null);
  const mainSearchAddon = useRef<SearchAddon | null>(null);
  const splitSearchAddon = useRef<SearchAddon | null>(null);

  // Terminal Customization & Shortcuts
  const [fontSize, setFontSize] = useState<number>(14);
  const [showSearch, setShowSearch] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [shortcutToast, setShortcutToast] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<'main' | 'split'>('main');

  const isMac = Boolean(
    typeof navigator !== 'undefined' && (
      (navigator.userAgent && navigator.userAgent.includes('Mac')) ||
      (navigator.platform && navigator.platform.includes('Mac'))
    )
  );

  // WebSockets
  const mainWsRef = useRef<WebSocket | null>(null);
  const splitWsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Drawers & Controls
  const [activeDrawer, setActiveDrawer] = useState<'monitor' | 'sftp' | 'tunnels' | 'ai' | null>('monitor');
  const [broadcastEnabled, setBroadcastEnabled] = useState(false);
  const [vaultUnlocked] = useState(true);

  // Connections Inventory
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [showConnModal, setShowConnModal] = useState(false);
  const [newConnName, setNewConnName] = useState('');
  const [newConnHost, setNewConnHost] = useState('');
  const [newConnPort, setNewConnPort] = useState(22);
  const [newConnUser, setNewConnUser] = useState('root');
  const [newConnTag, setNewConnTag] = useState('Production');
  const [connToast, setConnToast] = useState<string | null>(null);

  // SFTP & Remote File Editor
  const [sftpPath, setSftpPath] = useState('.');
  const [sftpEntries, setSftpEntries] = useState<Array<{ name: string; path?: string; is_dir: boolean; size_bytes: number }>>([]);
  const [editingFile, setEditingFile] = useState<EditingFile | null>(null);
  const [editorToast, setEditorToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Network Tunnels
  const [tunnels, setTunnels] = useState<TunnelItem[]>([
    { id: 'tun-1', name: 'MySQL 本地映射', tunnelType: 'local', localPort: 3307, remoteHost: '10.240.1.5', remotePort: 3306, running: true },
    { id: 'tun-2', name: '内网 SOCKS5 代理', tunnelType: 'socks5', localPort: 1080, running: false },
  ]);
  const [newTunnelName, setNewTunnelName] = useState('');
  const [newTunnelType, setNewTunnelType] = useState<'local' | 'socks5'>('local');
  const [newTunnelLocalPort, setNewTunnelLocalPort] = useState(8080);
  const [newTunnelRemoteHost, setNewTunnelRemoteHost] = useState('127.0.0.1');
  const [newTunnelRemotePort, setNewTunnelRemotePort] = useState(80);

  // Session Recording (Asciinema .cast v2)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingEventsRef = useRef<Array<[number, string, string]>>([]);
  const recordingStartRef = useRef<number>(0);

  // Live Metrics
  const [cpuUsage, setCpuUsage] = useState(18.5);
  const [memUsage, setMemUsage] = useState(42.3);
  const [netRx, setNetRx] = useState(12.4);
  const [netTx, setNetTx] = useState(3.8);

  // AI Chat
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<Array<{ sender: 'user' | 'assistant'; text: string; code?: string }>>([
    {
      sender: 'assistant',
      text: '你好！我是 AeroTerm 终端智能助手“小易”。我可以直接解释命令、分析报错、或者为你自动生成运维管理脚本。',
    },
  ]);

  // Load Saved Connections
  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/connections`);
      if (res.ok) {
        const data = await res.json();
        setConnections(data);
      }
    } catch {
      // fallback
    }
  }, [apiBase]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Import ~/.ssh/config
  const handleImportSshConfig = async () => {
    try {
      const res = await fetch(`${apiBase}/api/connections/import-ssh-config`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        await loadConnections();
        setConnToast(`成功从 ~/.ssh/config 导入并同步了 ${data.imported_count || 0} 台主机配置`);
        setTimeout(() => setConnToast(null), 3000);
      }
    } catch {
      setConnToast('导入失败，请检查 ~/.ssh/config 权限');
      setTimeout(() => setConnToast(null), 3000);
    }
  };

  // Create Connection
  const handleCreateConnection = async () => {
    if (!newConnName.trim() || !newConnHost.trim()) return;
    const payload = {
      id: '00000000-0000-0000-0000-000000000000',
      name: newConnName.trim(),
      protocol: 'ssh',
      host: newConnHost.trim(),
      port: Number(newConnPort) || 22,
      username: newConnUser.trim() || 'root',
      auth: { type: 'ask_every_time' },
      tags: [newConnTag.trim() || 'Server'],
      keepalive_interval_secs: 30,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const res = await fetch(`${apiBase}/api/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await loadConnections();
        setNewConnName('');
        setNewConnHost('');
        setShowConnModal(false);
      }
    } catch {
      setShowConnModal(false);
    }
  };

  // Delete Connection
  const handleDeleteConnection = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${apiBase}/api/connections/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setConnections((prev) => prev.filter((c) => c.id !== id));
      }
    } catch {
      // ignore
    }
  };

  // Add / Close Tabs
  const handleAddLocalTab = () => {
    const nextIdx = tabs.length + 1;
    const newTab: TabItem = {
      id: `local-${Date.now()}`,
      name: `Local (${nextIdx})`,
      type: 'local',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setShowAddTabMenu(false);
  };

  const handleConnectHost = (c: SavedConnection) => {
    const existing = tabs.find((t) => t.id === c.id || t.name === c.name);
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      const newTab: TabItem = {
        id: c.id,
        name: c.name,
        type: 'ssh',
        host: c.host,
        port: c.port,
        user: c.username,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
    setShowConnModal(false);
    setShowAddTabMenu(false);
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) return; // Keep at least one tab
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      setActiveTabId(nextTabs[nextTabs.length - 1].id);
    }
    fetch(`${apiBase}/api/sessions/${tabId}`, { method: 'DELETE' }).catch(() => {});
  };

  // State synchronization refs for event handlers to prevent stale closures
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const broadcastEnabledRef = useRef(broadcastEnabled);
  broadcastEnabledRef.current = broadcastEnabled;
  const isSplitScreenRef = useRef(isSplitScreen);
  isSplitScreenRef.current = isSplitScreen;
  const activeDrawerRef = useRef(activeDrawer);
  activeDrawerRef.current = activeDrawer;
  const showSearchRef = useRef(showSearch);
  showSearchRef.current = showSearch;
  const showCommandPaletteRef = useRef(showCommandPalette);
  showCommandPaletteRef.current = showCommandPalette;
  const showShortcutsModalRef = useRef(showShortcutsModal);
  showShortcutsModalRef.current = showShortcutsModal;
  const showConnModalRef = useRef(showConnModal);
  showConnModalRef.current = showConnModal;
  const activePaneRef = useRef(activePane);
  activePaneRef.current = activePane;
  const editingFileRef = useRef(editingFile);
  editingFileRef.current = editingFile;

  // Shortcut Actions
  const handleCloseActiveTab = useCallback(() => {
    const currentTabs = tabsRef.current;
    if (currentTabs.length <= 1) {
      setShortcutToast('至少保留一个终端标签页');
      return;
    }
    const currentId = activeTabIdRef.current;
    const currentIdx = currentTabs.findIndex((t) => t.id === currentId);
    const tabToClose = currentTabs[currentIdx];
    const nextTabs = currentTabs.filter((t) => t.id !== currentId);
    setTabs(nextTabs);
    const newIdx = Math.max(0, currentIdx - 1);
    setActiveTabId(nextTabs[newIdx].id);
    fetch(`${apiBase}/api/sessions/${tabToClose.id}`, { method: 'DELETE' }).catch(() => {});
    setShortcutToast(`已关闭标签: ${tabToClose.name}`);
  }, [apiBase]);

  const handleNextTab = useCallback(() => {
    const currentTabs = tabsRef.current;
    if (currentTabs.length <= 1) return;
    const currentIdx = currentTabs.findIndex((t) => t.id === activeTabIdRef.current);
    if (currentIdx !== -1) {
      const nextIdx = (currentIdx + 1) % currentTabs.length;
      setActiveTabId(currentTabs[nextIdx].id);
      setShortcutToast(`切换标签: ${currentTabs[nextIdx].name}`);
    }
  }, []);

  const handlePrevTab = useCallback(() => {
    const currentTabs = tabsRef.current;
    if (currentTabs.length <= 1) return;
    const currentIdx = currentTabs.findIndex((t) => t.id === activeTabIdRef.current);
    if (currentIdx !== -1) {
      const prevIdx = (currentIdx - 1 + currentTabs.length) % currentTabs.length;
      setActiveTabId(currentTabs[prevIdx].id);
      setShortcutToast(`切换标签: ${currentTabs[prevIdx].name}`);
    }
  }, []);

  const handleJumpToTab = useCallback((index: number) => {
    const currentTabs = tabsRef.current;
    if (index >= 0 && index < currentTabs.length) {
      setActiveTabId(currentTabs[index].id);
      setShortcutToast(`跳转标签: ${currentTabs[index].name}`);
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    setFontSize((prev) => {
      const next = Math.min(32, prev + 1);
      setShortcutToast(`终端字号: ${next}px`);
      return next;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setFontSize((prev) => {
      const next = Math.max(10, prev - 1);
      setShortcutToast(`终端字号: ${next}px`);
      return next;
    });
  }, []);

  const handleZoomReset = useCallback(() => {
    setFontSize(14);
    setShortcutToast('终端字号恢复默认 (14px)');
  }, []);

  const handlePasteToActive = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const targetWs = activePaneRef.current === 'split' ? splitWsRef.current : mainWsRef.current;
      const targetTerm = activePaneRef.current === 'split' ? splitXterm.current : mainXterm.current;
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        if (broadcastEnabledRef.current) {
          targetWs.send(JSON.stringify({ type: 'broadcast', data: text }));
        } else {
          targetWs.send(JSON.stringify({ type: 'input', data: text }));
        }
      } else if (targetTerm) {
        targetTerm.paste(text);
      }
      setShortcutToast('已粘贴剪贴板内容');
    } catch {
      setShortcutToast('无法读取剪贴板内容');
    }
  }, []);

  // Sync font size changes with xterm instances and resize websocket
  useEffect(() => {
    if (mainXterm.current) {
      mainXterm.current.options.fontSize = fontSize;
      mainFitAddon.current?.fit();
      if (mainWsRef.current?.readyState === WebSocket.OPEN) {
        mainWsRef.current.send(
          JSON.stringify({
            type: 'resize',
            cols: mainXterm.current.cols,
            rows: mainXterm.current.rows,
          })
        );
      }
    }
    if (splitXterm.current) {
      splitXterm.current.options.fontSize = fontSize;
      splitFitAddon.current?.fit();
      if (splitWsRef.current?.readyState === WebSocket.OPEN) {
        splitWsRef.current.send(
          JSON.stringify({
            type: 'resize',
            cols: splitXterm.current.cols,
            rows: splitXterm.current.rows,
          })
        );
      }
    }
  }, [fontSize]);


  // Recording Timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isRecording) {
      timer = setInterval(() => setRecordingSeconds((prev) => prev + 1), 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording]);

  const toggleRecording = () => {
    if (!isRecording) {
      recordingEventsRef.current = [];
      recordingStartRef.current = Date.now();
      setIsRecording(true);
    } else {
      setIsRecording(false);
      const cols = mainXterm.current?.cols || 80;
      const rows = mainXterm.current?.rows || 24;
      const header = {
        version: 2,
        width: cols,
        height: rows,
        timestamp: Math.floor(recordingStartRef.current / 1000),
        title: `AeroTerm Session (${activeTabId})`,
      };
      const lines = [JSON.stringify(header)];
      for (const ev of recordingEventsRef.current) {
        lines.push(JSON.stringify(ev));
      }
      const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/x-asciicast' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aeroterm_${activeTabId}_${Date.now()}.cast`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Metrics Polling
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${apiBase}/api/metrics`);
        if (res.ok) {
          const data = await res.json();
          if (data.cpu_usage_percent !== undefined) setCpuUsage(data.cpu_usage_percent);
          if (data.memory?.used_percent !== undefined) setMemUsage(data.memory.used_percent);
          if (data.network?.rx_bytes_sec) setNetRx(data.network.rx_bytes_sec / 1024 / 1024);
          if (data.network?.tx_bytes_sec) setNetTx(data.network.tx_bytes_sec / 1024 / 1024);
          return;
        }
      } catch {
        // simulation
      }
      setCpuUsage((prev) => Math.max(10, Math.min(95, prev + (Math.random() * 6 - 3))));
      setMemUsage((prev) => Math.max(20, Math.min(90, prev + (Math.random() * 2 - 1))));
      setNetRx((prev) => Math.max(1, Math.min(80, prev + (Math.random() * 4 - 2))));
      setNetTx((prev) => Math.max(0.5, Math.min(30, prev + (Math.random() * 2 - 1))));
    };

    const timer = setInterval(fetchMetrics, 2000);
    fetchMetrics();
    return () => clearInterval(timer);
  }, [apiBase]);

  // Handle Keyboard Event from xterm instances
  const handleTerminalKeyEvent = useCallback(
    (e: KeyboardEvent, term: Terminal, isSplit: boolean): boolean => {
      if (e.type !== 'keydown') return true;

      const isCtrlOrMeta = e.metaKey || e.ctrlKey;

      // 1. Copy: Cmd+C (Mac) or Ctrl+Shift+C (Win)
      if (
        (isMac && e.metaKey && (e.key === 'c' || e.key === 'C')) ||
        (!isMac && e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C'))
      ) {
        if (term.hasSelection()) {
          const text = term.getSelection();
          navigator.clipboard.writeText(text).catch(() => {});
          setShortcutToast(`已复制选中文本 (${isMac ? '⌘C' : 'Ctrl+Shift+C'})`);
          return false; // Intercept: do not send SIGINT to PTY!
        }
        return true; // No selection: let SIGINT (^C) pass to shell
      }

      // 2. Paste: Cmd+V (Mac) or Ctrl+Shift+V / Ctrl+V
      if (
        (isMac && e.metaKey && (e.key === 'v' || e.key === 'V')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'v' || e.key === 'V'))
      ) {
        handlePasteToActive();
        return false;
      }

      // 3. Clear Screen: Cmd+K / Ctrl+K
      if (isCtrlOrMeta && (e.key === 'k' || e.key === 'K')) {
        term.clear();
        setShortcutToast(`终端屏幕已清空 (${isMac ? '⌘K' : 'Ctrl+K'})`);
        return false;
      }

      // 4. Select All: Cmd+A (Mac) or Ctrl+Shift+A (Win)
      if (
        (isMac && e.metaKey && (e.key === 'a' || e.key === 'A')) ||
        (!isMac && e.ctrlKey && e.shiftKey && (e.key === 'a' || e.key === 'A'))
      ) {
        term.selectAll();
        setShortcutToast('已全选终端内容');
        return false;
      }

      // 5. In-Terminal Search: Cmd+F / Ctrl+F
      if (isCtrlOrMeta && (e.key === 'f' || e.key === 'F')) {
        setActivePane(isSplit ? 'split' : 'main');
        setShowSearch((prev) => !prev);
        return false;
      }

      // 6. Command Palette: Cmd+P / Ctrl+P
      if (isCtrlOrMeta && (e.key === 'p' || e.key === 'P')) {
        setShowCommandPalette((prev) => !prev);
        return false;
      }

      // 7. Shortcuts Cheat Sheet: Cmd+/ or Ctrl+/
      if (isCtrlOrMeta && e.key === '/') {
        setShowShortcutsModal((prev) => !prev);
        return false;
      }

      // 8. New Tab: Cmd+T / Ctrl+T
      if (isCtrlOrMeta && (e.key === 't' || e.key === 'T')) {
        handleAddLocalTab();
        setShortcutToast(`新建系统终端标签 (${isMac ? '⌘T' : 'Ctrl+T'})`);
        return false;
      }

      // 9. Close Tab: Cmd+W / Ctrl+W
      if (isCtrlOrMeta && (e.key === 'w' || e.key === 'W')) {
        handleCloseActiveTab();
        return false;
      }

      // 10. Split Screen: Cmd+D / Ctrl+Shift+D
      if (
        (isMac && e.metaKey && (e.key === 'd' || e.key === 'D')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D'))
      ) {
        setIsSplitScreen((prev) => !prev);
        setShortcutToast(`切换双屏分屏 (${isMac ? '⌘D' : 'Ctrl+Shift+D'})`);
        return false;
      }

      // 11. Switch Pane Focus: Alt+ArrowLeft / Alt+ArrowRight / Alt+O
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'o' || e.key === 'O')) {
        setActivePane((prev) => (prev === 'main' ? 'split' : 'main'));
        setShortcutToast('切换分屏焦点');
        return false;
      }

      // 12. Zoom: Cmd+= / Cmd+- / Cmd+0
      if (isCtrlOrMeta && (e.key === '=' || e.key === '+')) {
        handleZoomIn();
        return false;
      }
      if (isCtrlOrMeta && (e.key === '-' || e.key === '_')) {
        handleZoomOut();
        return false;
      }
      if (isCtrlOrMeta && e.key === '0') {
        handleZoomReset();
        return false;
      }

      // 13. Jump to Tab: Cmd+1~9 / Ctrl+1~9
      if (isCtrlOrMeta && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        handleJumpToTab(idx);
        return false;
      }

      // 14. Next / Prev Tab: Ctrl+Tab or Cmd+Option+Arrows
      if (e.ctrlKey && e.key === 'Tab') {
        if (e.shiftKey) {
          handlePrevTab();
        } else {
          handleNextTab();
        }
        return false;
      }
      if (isMac && e.metaKey && e.altKey) {
        if (e.key === 'ArrowRight') {
          handleNextTab();
          return false;
        }
        if (e.key === 'ArrowLeft') {
          handlePrevTab();
          return false;
        }
      }

      // 15. Tools Drawers: Alt+1 / Alt+2 / Alt+3 / Alt+4
      if (e.altKey && e.key === '1') {
        setActiveDrawer((prev) => (prev === 'monitor' ? null : 'monitor'));
        return false;
      }
      if (e.altKey && e.key === '2') {
        setActiveDrawer((prev) => (prev === 'sftp' ? null : 'sftp'));
        return false;
      }
      if (e.altKey && e.key === '3') {
        setActiveDrawer((prev) => (prev === 'tunnels' ? null : 'tunnels'));
        return false;
      }
      if (e.altKey && e.key === '4') {
        setActiveDrawer((prev) => (prev === 'ai' ? null : 'ai'));
        return false;
      }

      // 16. Hosts / Assets Center: Cmd+O / Ctrl+O
      if (isCtrlOrMeta && (e.key === 'o' || e.key === 'O')) {
        setShowConnModal((prev) => !prev);
        return false;
      }

      // 17. Broadcast: Cmd+B
      if (isCtrlOrMeta && (e.key === 'b' || e.key === 'B')) {
        setBroadcastEnabled((prev) => !prev);
        setShortcutToast(!broadcastEnabledRef.current ? '广播输入模式: 已开启' : '广播输入模式: 已关闭');
        return false;
      }

      // 18. Recording: Cmd+Shift+R / Ctrl+Alt+R
      if (isCtrlOrMeta && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        toggleRecording();
        return false;
      }

      // 19. Escape
      if (e.key === 'Escape') {
        if (showSearchRef.current) {
          setShowSearch(false);
          return false;
        }
        if (showCommandPaletteRef.current) {
          setShowCommandPalette(false);
          return false;
        }
        if (showShortcutsModalRef.current) {
          setShowShortcutsModal(false);
          return false;
        }
      }

      return true;
    },
    [
      isMac,
      handleAddLocalTab,
      handleCloseActiveTab,
      handleJumpToTab,
      handleNextTab,
      handlePrevTab,
      handleZoomIn,
      handleZoomOut,
      handleZoomReset,
      handlePasteToActive,
      toggleRecording,
    ]
  );

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      const isCtrlOrMeta = e.metaKey || e.ctrlKey;

      // Escape always handles modals first
      if (e.key === 'Escape') {
        if (showSearchRef.current) {
          setShowSearch(false);
          e.preventDefault();
          return;
        }
        if (showCommandPaletteRef.current) {
          setShowCommandPalette(false);
          e.preventDefault();
          return;
        }
        if (showShortcutsModalRef.current) {
          setShowShortcutsModal(false);
          e.preventDefault();
          return;
        }
        if (showConnModalRef.current) {
          setShowConnModal(false);
          e.preventDefault();
          return;
        }
        if (editingFileRef.current) {
          setEditingFile(null);
          e.preventDefault();
          return;
        }
        if (activeDrawerRef.current) {
          setActiveDrawer(null);
          e.preventDefault();
          return;
        }
      }

      // Command Palette (Cmd+P / Ctrl+P)
      if (isCtrlOrMeta && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
        return;
      }

      // Shortcuts help (Cmd+/ or Ctrl+/ or ? when not typing in text field)
      if (
        (isCtrlOrMeta && e.key === '/') ||
        (!isInInput && !isCtrlOrMeta && e.key === '?')
      ) {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      // In-Terminal Search (Cmd+F / Ctrl+F)
      if (isCtrlOrMeta && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setShowSearch((prev) => !prev);
        return;
      }

      // New Tab (Cmd+T / Ctrl+T)
      if (isCtrlOrMeta && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        handleAddLocalTab();
        setShortcutToast(`新建系统终端标签 (${isMac ? '⌘T' : 'Ctrl+T'})`);
        return;
      }

      // Close Tab (Cmd+W / Ctrl+W)
      if (isCtrlOrMeta && (e.key === 'w' || e.key === 'W') && !isInInput) {
        e.preventDefault();
        handleCloseActiveTab();
        return;
      }

      // Split Screen (Cmd+D / Ctrl+Shift+D)
      if (
        (isMac && e.metaKey && (e.key === 'd' || e.key === 'D')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D'))
      ) {
        e.preventDefault();
        setIsSplitScreen((prev) => !prev);
        setShortcutToast(`切换双屏分屏 (${isMac ? '⌘D' : 'Ctrl+Shift+D'})`);
        return;
      }

      // Zoom (Cmd+= / Cmd+- / Cmd+0)
      if (isCtrlOrMeta && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      if (isCtrlOrMeta && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      if (isCtrlOrMeta && e.key === '0') {
        e.preventDefault();
        handleZoomReset();
        return;
      }

      // Next / Prev Tab
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          handlePrevTab();
        } else {
          handleNextTab();
        }
        return;
      }
      if (isMac && e.metaKey && e.altKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNextTab();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePrevTab();
          return;
        }
      }

      // Tab jump (Cmd+1~9)
      if (isCtrlOrMeta && /^[1-9]$/.test(e.key) && !isInInput) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        handleJumpToTab(idx);
        return;
      }

      // Tool drawers (Alt+1 ~ 4)
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        setActiveDrawer((prev) => (prev === 'monitor' ? null : 'monitor'));
        return;
      }
      if (e.altKey && e.key === '2') {
        e.preventDefault();
        setActiveDrawer((prev) => (prev === 'sftp' ? null : 'sftp'));
        return;
      }
      if (e.altKey && e.key === '3') {
        e.preventDefault();
        setActiveDrawer((prev) => (prev === 'tunnels' ? null : 'tunnels'));
        return;
      }
      if (e.altKey && e.key === '4') {
        e.preventDefault();
        setActiveDrawer((prev) => (prev === 'ai' ? null : 'ai'));
        return;
      }

      // Hosts (Cmd+O / Ctrl+O)
      if (isCtrlOrMeta && (e.key === 'o' || e.key === 'O') && !isInInput) {
        e.preventDefault();
        setShowConnModal((prev) => !prev);
        return;
      }

      // Broadcast (Cmd+B)
      if (isCtrlOrMeta && (e.key === 'b' || e.key === 'B') && !isInInput) {
        e.preventDefault();
        setBroadcastEnabled((prev) => !prev);
        setShortcutToast(!broadcastEnabledRef.current ? '广播输入模式: 已开启' : '广播输入模式: 已关闭');
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    isMac,
    handleAddLocalTab,
    handleCloseActiveTab,
    handleJumpToTab,
    handleNextTab,
    handlePrevTab,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
  ]);


  // SFTP Operations
  const loadSftpList = useCallback(
    async (path: string) => {
      try {
        const res = await fetch(`${apiBase}/api/sftp/list?path=${encodeURIComponent(path)}`);
        if (res.ok) {
          const data = await res.json();
          setSftpEntries(data);
          setSftpPath(path);
        }
      } catch {
        // ignore
      }
    },
    [apiBase]
  );

  useEffect(() => {
    if (activeDrawer === 'sftp') {
      loadSftpList(sftpPath);
    }
  }, [activeDrawer, sftpPath, loadSftpList]);

  const handleOpenFile = async (file: { name: string; path?: string }) => {
    const filePath = file.path || (sftpPath === '.' ? file.name : `${sftpPath}/${file.name}`);
    try {
      const res = await fetch(`${apiBase}/api/sftp/read?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = await res.json();
        setEditingFile({
          path: filePath,
          name: file.name,
          content: data.content,
          saving: false,
        });
        return;
      }
    } catch {
      // fallback
    }
    setEditingFile({
      path: filePath,
      name: file.name,
      content: `# AeroTerm Remote File: ${file.name}\n# Path: ${filePath}\n\n# Loaded content...`,
      saving: false,
    });
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    setEditingFile((prev) => (prev ? { ...prev, saving: true } : null));
    try {
      const res = await fetch(`${apiBase}/api/sftp/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editingFile.path, content: editingFile.content }),
      });
      if (res.ok) {
        setEditorToast('已成功保存并同步至服务器');
        setTimeout(() => setEditorToast(null), 3000);
      }
    } catch {
      setEditorToast('保存失败，请检查写入权限');
      setTimeout(() => setEditorToast(null), 3000);
    } finally {
      setEditingFile((prev) => (prev ? { ...prev, saving: false } : null));
    }
  };

  const handleDeleteFile = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`确定删除 ${filePath} 吗？`)) return;
    try {
      const res = await fetch(`${apiBase}/api/sftp/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      if (res.ok) {
        loadSftpList(sftpPath);
      }
    } catch {
      // ignore
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt('请输入新目录名称:');
    if (!name) return;
    const target = sftpPath === '.' ? name : `${sftpPath}/${name}`;
    try {
      const res = await fetch(`${apiBase}/api/sftp/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: target }),
      });
      if (res.ok) {
        loadSftpList(sftpPath);
      }
    } catch {
      // ignore
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      const content = reader.result as string;
      const targetPath = sftpPath === '.' ? file.name : `${sftpPath}/${file.name}`;
      try {
        await fetch(`${apiBase}/api/sftp/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath, content }),
        });
        loadSftpList(sftpPath);
      } catch {
        // ignore
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Tunnel Actions
  const handleToggleTunnel = (id: string) => {
    setTunnels((prev) =>
      prev.map((t) => (t.id === id ? { ...t, running: !t.running } : t))
    );
  };

  const handleAddTunnel = () => {
    if (!newTunnelName.trim()) return;
    const item: TunnelItem = {
      id: `tun-${Date.now()}`,
      name: newTunnelName.trim(),
      tunnelType: newTunnelType,
      localPort: Number(newTunnelLocalPort) || 8080,
      remoteHost: newTunnelRemoteHost.trim() || '127.0.0.1',
      remotePort: Number(newTunnelRemotePort) || 80,
      running: true,
    };
    setTunnels((prev) => [...prev, item]);
    setNewTunnelName('');
  };

  // Main Terminal WebSocket Connection
  useEffect(() => {
    if (!mainTermRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
      theme: {
        background: '#0a0d14',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        black: '#1e293b',
        red: '#f43f5e',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#38bdf8',
        white: '#f8fafc',
      },
      allowTransparency: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    mainSearchAddon.current = searchAddon;

    term.open(mainTermRef.current);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // fallback
    }
    fitAddon.fit();
    mainXterm.current = term;
    mainFitAddon.current = fitAddon;

    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      return handleTerminalKeyEvent(e, term, false);
    });

    // Connect WebSocket
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(`${wsBase}/ws/terminal/${activeTabId}`);
      socket.binaryType = 'arraybuffer';
      mainWsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
        socket?.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };

      socket.onclose = () => setWsConnected(false);
      socket.onerror = () => setWsConnected(false);

      socket.onmessage = (event) => {
        let chunk = '';
        if (event.data instanceof ArrayBuffer) {
          const u8 = new Uint8Array(event.data);
          chunk = new TextDecoder().decode(u8);
          term.write(u8);
        } else if (typeof event.data === 'string') {
          chunk = event.data;
          term.write(event.data);
        }
        if (recordingStartRef.current > 0 && chunk) {
          const elapsed = (Date.now() - recordingStartRef.current) / 1000;
          recordingEventsRef.current.push([elapsed, 'o', chunk]);
        }
      };
    } catch {
      setWsConnected(false);
    }

    term.onData((data) => {
      if (mainWsRef.current && mainWsRef.current.readyState === WebSocket.OPEN) {
        if (broadcastEnabled) {
          mainWsRef.current.send(JSON.stringify({ type: 'broadcast', data }));
        } else {
          mainWsRef.current.send(JSON.stringify({ type: 'input', data }));
        }
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      if (mainWsRef.current && mainWsRef.current.readyState === WebSocket.OPEN) {
        mainWsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (socket) socket.close();
      mainSearchAddon.current = null;
      term.dispose();
    };
  }, [activeTabId, broadcastEnabled, wsBase, handleTerminalKeyEvent]);

  // Split-Screen Terminal Initialization
  useEffect(() => {
    if (!isSplitScreen || !splitTermRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: {
        background: '#0a0d14',
        foreground: '#e2e8f0',
        cursor: '#10b981',
      },
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    splitSearchAddon.current = searchAddon;

    term.open(splitTermRef.current);
    fitAddon.fit();
    splitXterm.current = term;
    splitFitAddon.current = fitAddon;

    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      return handleTerminalKeyEvent(e, term, true);
    });

    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(`${wsBase}/ws/terminal/${splitTabId}`);
      socket.binaryType = 'arraybuffer';
      splitWsRef.current = socket;

      socket.onopen = () => {
        socket?.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };

      socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(event.data));
        } else if (typeof event.data === 'string') {
          term.write(event.data);
        }
      };
    } catch {
      // ignore
    }

    term.onData((data) => {
      if (splitWsRef.current && splitWsRef.current.readyState === WebSocket.OPEN) {
        splitWsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (socket) socket.close();
      splitSearchAddon.current = null;
      term.dispose();
    };
  }, [isSplitScreen, splitTabId, wsBase, handleTerminalKeyEvent]);

  // Execute Quick Command
  const runQuickCommand = (cmd: string) => {
    if (mainWsRef.current && mainWsRef.current.readyState === WebSocket.OPEN) {
      mainWsRef.current.send(JSON.stringify({ type: 'input', data: `${cmd}\n` }));
    }
  };

  // AI Assistant Actions
  const handleSendAi = async () => {
    if (!aiInput.trim()) return;
    const prompt = aiInput.trim();
    setAiMessages((prev) => [...prev, { sender: 'user', text: prompt }]);
    setAiInput('');
    setAiLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, os_type: 'macOS', current_cwd: sftpPath }),
      });
      if (res.ok) {
        const data = await res.json();
        const codeMatch = data.response?.match(/```(?:bash|sh)?\n([\s\S]*?)```/);
        const code = codeMatch ? codeMatch[1].trim() : undefined;
        setAiMessages((prev) => [...prev, { sender: 'assistant', text: data.response, code }]);
        setAiLoading(false);
        return;
      }
    } catch {
      // fallback
    }

    setTimeout(() => {
      setAiMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `针对：“${prompt}”，推荐执行以下命令：`,
          code: `ps aux | grep node`,
        },
      ]);
      setAiLoading(false);
    }, 400);
  };

  const handleDiagnoseError = async () => {
    setAiLoading(true);
    setActiveDrawer('ai');
    try {
      const res = await fetch(`${apiBase}/api/ai/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'docker-compose up',
          error_output: 'bind: address already in use: 0.0.0.0:80',
          exit_code: 1,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: data.analysis,
            code: 'sudo lsof -i :80 -P -n | grep LISTEN',
          },
        ]);
      }
    } catch {
      // ignore
    } finally {
      setAiLoading(false);
    }
  };

  // Command Palette Items
  const paletteCommands: CommandItem[] = [
    // 快捷运维指令
    {
      id: 'cmd-top',
      category: '运维指令',
      title: '执行: 进程监控 (top)',
      description: '查看系统当前高消耗进程占用情况',
      shortcut: '快捷指令',
      icon: <Activity size={16} color="#38bdf8" />,
      action: () => runQuickCommand('top -l 1 | head -n 20'),
      keywords: ['top', 'process', '进程', 'cpu', '监控'],
    },
    {
      id: 'cmd-lsof',
      category: '运维指令',
      title: '执行: 端口监听 (lsof)',
      description: '查看当前主机正在监听的 TCP 端口',
      shortcut: '快捷指令',
      icon: <Network size={16} color="#38bdf8" />,
      action: () => runQuickCommand('lsof -iTCP -sTCP:LISTEN -n -P'),
      keywords: ['lsof', 'port', '端口', 'listen'],
    },
    {
      id: 'cmd-df',
      category: '运维指令',
      title: '执行: 磁盘空间 (df -h)',
      description: '查看各分区可用磁盘容量与挂载点',
      shortcut: '快捷指令',
      icon: <Server size={16} color="#38bdf8" />,
      action: () => runQuickCommand('df -h'),
      keywords: ['df', 'disk', '磁盘', '容量'],
    },
    {
      id: 'cmd-git',
      category: '运维指令',
      title: '执行: Git 状态 (git status)',
      description: '查看当前目录代码变更与分支状态',
      shortcut: '快捷指令',
      icon: <TerminalIcon size={16} color="#10b981" />,
      action: () => runQuickCommand('git status'),
      keywords: ['git', 'status', '代码', '分支'],
    },
    {
      id: 'cmd-clear',
      category: '终端操作',
      title: '清空当前屏幕 (clear)',
      description: '清空终端屏幕与回滚缓冲区',
      shortcut: isMac ? '⌘K' : 'Ctrl+K',
      icon: <Trash2 size={16} color="#f43f5e" />,
      action: () => {
        if (mainXterm.current) mainXterm.current.clear();
        setShortcutToast('终端屏幕已清空');
      },
      keywords: ['clear', '清屏', '清空'],
    },

    // 标签与分屏
    {
      id: 'tab-new-cmd',
      category: '标签管理',
      title: '新建系统终端标签',
      description: '创建一个新的本地 zsh/bash 会话',
      shortcut: isMac ? '⌘T' : 'Ctrl+T',
      icon: <Plus size={16} color="#10b981" />,
      action: handleAddLocalTab,
      keywords: ['new', 'tab', '新建', '终端'],
    },
    {
      id: 'tab-close-cmd',
      category: '标签管理',
      title: '关闭当前终端标签',
      description: '关闭当前激活标签并释放会话',
      shortcut: isMac ? '⌘W' : 'Ctrl+W',
      icon: <X size={16} color="#f43f5e" />,
      action: handleCloseActiveTab,
      keywords: ['close', 'tab', '关闭'],
    },
    {
      id: 'split-toggle-cmd',
      category: '分屏管理',
      title: '切换双屏分屏终端',
      description: '并排开启或关闭右侧分屏终端',
      shortcut: isMac ? '⌘D' : 'Ctrl+Shift+D',
      icon: <SplitSquareVertical size={16} color="#38bdf8" />,
      action: () => setIsSplitScreen((prev) => !prev),
      keywords: ['split', '分屏', '双屏'],
    },

    // 终端查找与视图
    {
      id: 'search-cmd',
      category: '终端查找',
      title: '在终端中查找文本',
      description: '呼出终端查找栏并高亮搜索匹配项',
      shortcut: isMac ? '⌘F' : 'Ctrl+F',
      icon: <Search size={16} color="#38bdf8" />,
      action: () => setShowSearch((prev) => !prev),
      keywords: ['find', 'search', '查找', '搜索'],
    },
    {
      id: 'zoom-in-cmd',
      category: '视图与字号',
      title: '增大终端字体',
      description: '增加终端字体字号 (+1px)',
      shortcut: isMac ? '⌘+' : 'Ctrl++',
      icon: <ZoomIn size={16} color="#38bdf8" />,
      action: handleZoomIn,
      keywords: ['zoom in', '放大', '字号'],
    },
    {
      id: 'zoom-out-cmd',
      category: '视图与字号',
      title: '减小终端字体',
      description: '减小终端字体字号 (-1px)',
      shortcut: isMac ? '⌘-' : 'Ctrl+-',
      icon: <ZoomOut size={16} color="#38bdf8" />,
      action: handleZoomOut,
      keywords: ['zoom out', '缩小', '字号'],
    },
    {
      id: 'zoom-reset-cmd',
      category: '视图与字号',
      title: '恢复默认终端字号 (14px)',
      description: '重置终端字体大小',
      shortcut: isMac ? '⌘0' : 'Ctrl+0',
      icon: <RotateCcw size={16} color="#94a3b8" />,
      action: handleZoomReset,
      keywords: ['reset', '重置', '恢复'],
    },

    // 侧边栏与工具
    {
      id: 'drawer-monitor-cmd',
      category: '侧边栏',
      title: '切换服务器实时监控',
      description: '查看 CPU、内存、网络 IO 等指标',
      shortcut: '⌥1',
      icon: <Activity size={16} color="#38bdf8" />,
      action: () => setActiveDrawer((prev) => (prev === 'monitor' ? null : 'monitor')),
      keywords: ['monitor', '监控', 'cpu', '内存'],
    },
    {
      id: 'drawer-sftp-cmd',
      category: '侧边栏',
      title: '切换 SFTP 文件传输',
      description: '浏览远程文件、上传下载及在线编辑',
      shortcut: '⌥2',
      icon: <FolderTree size={16} color="#38bdf8" />,
      action: () => setActiveDrawer((prev) => (prev === 'sftp' ? null : 'sftp')),
      keywords: ['sftp', '文件', '文件传输'],
    },
    {
      id: 'drawer-tunnels-cmd',
      category: '侧边栏',
      title: '切换端口转发与隧道',
      description: '管理本地端口映射与 SOCKS5 代理',
      shortcut: '⌥3',
      icon: <Network size={16} color="#38bdf8" />,
      action: () => setActiveDrawer((prev) => (prev === 'tunnels' ? null : 'tunnels')),
      keywords: ['tunnels', '端口', '隧道', '转发'],
    },
    {
      id: 'drawer-ai-cmd',
      category: '侧边栏',
      title: '切换小易 AI 智能助手',
      description: '自动分析终端报错、生成管理脚本',
      shortcut: '⌥4',
      icon: <Bot size={16} color="#a855f7" />,
      action: () => setActiveDrawer((prev) => (prev === 'ai' ? null : 'ai')),
      keywords: ['ai', '小易', '智能助手', 'copilot'],
    },
    {
      id: 'hosts-manager-cmd',
      category: '主机资产',
      title: '打开主机资产中心',
      description: '管理 SSH 主机配置与同步 ~/.ssh/config',
      shortcut: isMac ? '⌘O' : 'Ctrl+O',
      icon: <Server size={16} color="#38bdf8" />,
      action: () => setShowConnModal(true),
      keywords: ['host', 'ssh', '主机', '资产'],
    },
    {
      id: 'broadcast-cmd',
      category: '终端操作',
      title: broadcastEnabled ? '关闭广播输入模式' : '开启广播输入模式',
      description: '将输入同时分发至全部活跃终端',
      shortcut: isMac ? '⌘B' : 'Ctrl+Alt+B',
      icon: <Radio size={16} color="#f43f5e" />,
      action: () => {
        setBroadcastEnabled((prev) => !prev);
        setShortcutToast(!broadcastEnabled ? '广播输入模式: 已开启' : '广播输入模式: 已关闭');
      },
      keywords: ['broadcast', '广播', '多终端'],
    },
    {
      id: 'record-cmd',
      category: '会话录制',
      title: isRecording ? '停止会话录制并导出' : '开启会话录制 (.cast)',
      description: '录制终端操作为 Asciinema 播放格式',
      shortcut: isMac ? '⌘⇧R' : 'Ctrl+Alt+R',
      icon: <Video size={16} color="#ef4444" />,
      action: toggleRecording,
      keywords: ['record', '录制', 'cast', 'asciinema'],
    },
    {
      id: 'shortcuts-help-cmd',
      category: '帮助',
      title: '常用快捷键指南',
      description: '查看 AeroTerm 全量键盘快捷键对照表',
      shortcut: isMac ? '⌘/' : 'Ctrl+/',
      icon: <Keyboard size={16} color="#38bdf8" />,
      action: () => setShowShortcutsModal(true),
      keywords: ['shortcuts', '快捷键', 'help', '帮助', '指南'],
    },
    // 主机列表快速直连
    ...connections
      .filter((c) => c.protocol !== 'localpty')
      .map((c) => ({
        id: `connect-${c.id}`,
        category: '主机连接',
        title: `连接主机: ${c.name} (${c.username}@${c.host}:${c.port})`,
        description: c.tags?.join(', ') || 'SSH 连接',
        icon: <Server size={16} color="#38bdf8" />,
        action: () => handleConnectHost(c),
        keywords: [c.name, c.host, c.username, 'ssh', 'connect'],
      })),
  ];


  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', background: '#0a0d14' }}>
      {/* 1. Top Global Navigation Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '46px',
          background: '#0f1420',
          borderBottom: '1px solid #1e2638',
          padding: '0 12px',
          zIndex: 20,
        }}
      >
        {/* Brand & Dynamic Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '16px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 0 10px rgba(56, 189, 248, 0.4)',
              }}
            >
              <TerminalIcon size={16} />
            </div>
            <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.3px', color: '#f8fafc' }}>
              Aero<span style={{ color: '#38bdf8' }}>Term</span>
            </span>
          </div>

          {/* Tab List */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: activeTabId === tab.id ? '#171d2d' : 'transparent',
                  color: activeTabId === tab.id ? '#38bdf8' : '#94a3b8',
                  border: activeTabId === tab.id ? '1px solid #1e2638' : '1px solid transparent',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {tab.type === 'local' ? <TerminalIcon size={13} /> : <Server size={13} />}
                <span>{tab.name}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    style={{
                      padding: '2px',
                      borderRadius: '4px',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="关闭标签页"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}

            {/* Add Tab Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowAddTabMenu(!showAddTabMenu)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  background: showAddTabMenu ? '#1e2638' : 'transparent',
                }}
                title="新建终端 / 连接主机"
              >
                <Plus size={15} />
              </button>

              {showAddTabMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '32px',
                    left: 0,
                    width: '220px',
                    background: '#131929',
                    border: '1px solid #1e2638',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    padding: '6px',
                    zIndex: 30,
                  }}
                >
                  <button
                    onClick={handleAddLocalTab}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#e2e8f0',
                      textAlign: 'left',
                    }}
                  >
                    <TerminalIcon size={14} color="#10b981" />
                    <span>新建系统终端 (zsh)</span>
                  </button>

                  <div style={{ height: '1px', background: '#1e2638', margin: '4px 0' }} />

                  <div style={{ fontSize: '11px', color: '#64748b', padding: '4px 10px' }}>快速连接主机:</div>
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    {connections
                      .filter((c) => c.protocol !== 'localpty')
                      .slice(0, 6)
                      .map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleConnectHost(c)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            color: '#cbd5e1',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Server size={13} color="#38bdf8" />
                            <span>{c.name}</span>
                          </div>
                          <span style={{ fontSize: '10px', color: '#64748b' }}>{c.host}</span>
                        </button>
                      ))}
                  </div>

                  <div style={{ height: '1px', background: '#1e2638', margin: '4px 0' }} />

                  <button
                    onClick={() => {
                      setShowAddTabMenu(false);
                      setShowConnModal(true);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#38bdf8',
                      textAlign: 'left',
                    }}
                  >
                    <Plus size={14} />
                    <span>主机资产管理中心...</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Command Palette Button */}
          <button
            onClick={() => setShowCommandPalette(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              background: 'rgba(30, 41, 59, 0.5)',
              color: '#94a3b8',
              border: '1px solid #1e2638',
            }}
            title={`快速命令面板 (${isMac ? '⌘P' : 'Ctrl+P'})`}
          >
            <Command size={13} color="#38bdf8" />
            <span style={{ fontSize: '11px' }}>命令</span>
            <kbd style={{ fontSize: '10px', color: '#38bdf8', opacity: 0.85 }}>{isMac ? '⌘P' : 'Ctrl+P'}</kbd>
          </button>

          {/* Shortcuts Guide Button */}
          <button
            onClick={() => setShowShortcutsModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              background: 'rgba(30, 41, 59, 0.5)',
              color: '#94a3b8',
              border: '1px solid #1e2638',
            }}
            title={`常用快捷键指南 (${isMac ? '⌘/' : 'Ctrl+/'})`}
          >
            <Keyboard size={13} color="#38bdf8" />
            <span style={{ fontSize: '11px' }}>快捷键</span>
            <kbd style={{ fontSize: '10px', color: '#38bdf8', opacity: 0.85 }}>{isMac ? '⌘/' : 'Ctrl+/'}</kbd>
          </button>

          {/* Split Screen Control */}
          <button
            onClick={() => setIsSplitScreen(!isSplitScreen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              background: isSplitScreen ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.5)',
              color: isSplitScreen ? '#38bdf8' : '#94a3b8',
              border: isSplitScreen ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid #1e2638',
            }}
            title={`双屏分屏终端 (${isMac ? '⌘D' : 'Ctrl+Shift+D'})`}
          >
            <SplitSquareVertical size={13} />
            {isSplitScreen ? '分屏中' : '分屏'}
          </button>

          {/* Session Recording Button */}
          <button
            onClick={toggleRecording}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'rgba(30, 41, 59, 0.5)',
              color: isRecording ? '#ef4444' : '#94a3b8',
              border: isRecording ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid #1e2638',
            }}
            title={`会话录制 (.cast) (${isMac ? '⌘⇧R' : 'Ctrl+Alt+R'})`}
          >
            <Video size={13} />
            {isRecording
              ? `录制中 [${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')}] 停止`
              : '会话录制'}
          </button>

          {/* Broadcast Input Button */}
          <button
            onClick={() => setBroadcastEnabled(!broadcastEnabled)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              background: broadcastEnabled ? 'rgba(244, 63, 94, 0.15)' : 'rgba(30, 41, 59, 0.5)',
              color: broadcastEnabled ? '#f43f5e' : '#94a3b8',
              border: broadcastEnabled ? '1px solid rgba(244, 63, 94, 0.4)' : '1px solid #1e2638',
            }}
            title={`多终端广播输入 (${isMac ? '⌘B' : 'Ctrl+Alt+B'})`}
          >
            <Radio size={13} />
            {broadcastEnabled ? '广播已开启' : '广播输入'}
          </button>

          {/* PTY Live Connection Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              background: wsConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              border: wsConnected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
              color: wsConnected ? '#34d399' : '#fbbf24',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: wsConnected ? '#10b981' : '#f59e0b',
                boxShadow: wsConnected ? '0 0 8px #10b981' : 'none',
              }}
            />
            {wsConnected ? 'PTY 在线' : 'PTY 离线'}
          </div>

          {/* Vault Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              background: vaultUnlocked ? 'rgba(56, 189, 248, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: vaultUnlocked ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              color: vaultUnlocked ? '#38bdf8' : '#ef4444',
            }}
          >
            <Shield size={11} />
            {vaultUnlocked ? 'Vault: E2EE' : 'Vault: 锁定'}
          </div>
        </div>
      </header>

      {/* 2. Main Body Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Vertical Tool Dock */}
        <aside
          style={{
            width: '48px',
            background: '#0f1420',
            borderRight: '1px solid #1e2638',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '12px 0',
            gap: '16px',
            zIndex: 10,
          }}
        >
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'monitor' ? null : 'monitor')}
            style={{
              padding: '10px',
              borderRadius: '8px',
              color: activeDrawer === 'monitor' ? '#38bdf8' : '#94a3b8',
              background: activeDrawer === 'monitor' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            }}
            title={`服务器实时监控 (${isMac ? '⌥1' : 'Alt+1'})`}
          >
            <Activity size={18} />
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'sftp' ? null : 'sftp')}
            style={{
              padding: '10px',
              borderRadius: '8px',
              color: activeDrawer === 'sftp' ? '#38bdf8' : '#94a3b8',
              background: activeDrawer === 'sftp' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            }}
            title={`SFTP 文件传输 (${isMac ? '⌥2' : 'Alt+2'})`}
          >
            <FolderTree size={18} />
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'tunnels' ? null : 'tunnels')}
            style={{
              padding: '10px',
              borderRadius: '8px',
              color: activeDrawer === 'tunnels' ? '#38bdf8' : '#94a3b8',
              background: activeDrawer === 'tunnels' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            }}
            title={`端口转发与隧道 (${isMac ? '⌥3' : 'Alt+3'})`}
          >
            <Network size={18} />
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'ai' ? null : 'ai')}
            style={{
              padding: '10px',
              borderRadius: '8px',
              color: activeDrawer === 'ai' ? '#a855f7' : '#94a3b8',
              background: activeDrawer === 'ai' ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
            }}
            title={`小易 AI 终端助手 (${isMac ? '⌥4' : 'Alt+4'})`}
          >
            <Bot size={18} />
          </button>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={() => setShowShortcutsModal(true)}
              style={{
                padding: '10px',
                borderRadius: '8px',
                color: showShortcutsModal ? '#38bdf8' : '#64748b',
                background: showShortcutsModal ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              }}
              title={`键盘快捷键指南 (${isMac ? '⌘/' : 'Ctrl+/'})`}
            >
              <Keyboard size={18} />
            </button>
            <button
              onClick={() => setShowConnModal(true)}
              style={{
                padding: '10px',
                borderRadius: '8px',
                color: '#64748b',
              }}
              title={`主机资产中心 (${isMac ? '⌘O' : 'Ctrl+O'})`}
            >
              <Server size={18} />
            </button>
            <button
              style={{
                padding: '10px',
                borderRadius: '8px',
                color: '#64748b',
              }}
              title="设置"
            >
              <Settings size={18} />
            </button>
          </div>
        </aside>

        {/* Center Workspace (Quick Commands + Terminal Window) */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#0a0d14',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Quick Commands Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              background: '#0f1420',
              borderBottom: '1px solid #1e2638',
              overflowX: 'auto',
            }}
          >
            <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>快捷指令:</span>
            {QUICK_COMMANDS.map((qc, idx) => (
              <button
                key={idx}
                onClick={() => runQuickCommand(qc.cmd)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  background: '#171d2d',
                  color: '#cbd5e1',
                  border: '1px solid #1e2638',
                  whiteSpace: 'nowrap',
                }}
              >
                {qc.label}
              </button>
            ))}

            <div style={{ width: '1px', height: '14px', background: '#1e2638', margin: '0 4px' }} />

            {/* In-Terminal Search Button */}
            <button
              onClick={() => setShowSearch((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                background: showSearch ? 'rgba(56, 189, 248, 0.2)' : '#171d2d',
                color: showSearch ? '#38bdf8' : '#cbd5e1',
                border: showSearch ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid #1e2638',
                whiteSpace: 'nowrap',
              }}
              title={`在终端中查找文本 (${isMac ? '⌘F' : 'Ctrl+F'})`}
            >
              <Search size={11} /> 查找
              <kbd style={{ fontSize: '10px', opacity: 0.7 }}>{isMac ? '⌘F' : 'Ctrl+F'}</kbd>
            </button>

            {/* Terminal Font Zoom Controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                background: '#171d2d',
                padding: '2px 4px',
                borderRadius: '4px',
                border: '1px solid #1e2638',
              }}
            >
              <button
                onClick={handleZoomOut}
                style={{ color: '#94a3b8', padding: '2px 4px', display: 'flex' }}
                title={`减小字号 (${isMac ? '⌘-' : 'Ctrl-'})`}
              >
                <ZoomOut size={11} />
              </button>
              <span
                onClick={handleZoomReset}
                style={{ fontSize: '10px', color: '#64748b', cursor: 'pointer', padding: '0 4px' }}
                title={`恢复默认字号 14px (${isMac ? '⌘0' : 'Ctrl+0'})`}
              >
                {fontSize}px
              </span>
              <button
                onClick={handleZoomIn}
                style={{ color: '#94a3b8', padding: '2px 4px', display: 'flex' }}
                title={`增大字号 (${isMac ? '⌘+' : 'Ctrl++'})`}
              >
                <ZoomIn size={11} />
              </button>
            </div>

            <button
              onClick={handleDiagnoseError}
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                background: 'rgba(168, 85, 247, 0.15)',
                color: '#c084fc',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              <Zap size={11} /> 诊断报错
            </button>
          </div>

          {/* Terminal Panes */}
          <div style={{ flex: 1, display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* Main Terminal */}
            <div
              ref={mainTermRef}
              className="terminal-container"
              onClick={() => setActivePane('main')}
              style={{
                position: 'relative',
                flex: 1,
                width: isSplitScreen ? '50%' : '100%',
                height: '100%',
                overflow: 'hidden',
                borderRight: isSplitScreen ? '1px solid #1e2638' : 'none',
                boxShadow: isSplitScreen && activePane === 'main' ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.4)' : 'none',
              }}
            >
              <TerminalSearch
                visible={showSearch && activePane === 'main'}
                searchAddon={mainSearchAddon.current}
                onClose={() => setShowSearch(false)}
              />
            </div>

            {/* Split Screen Terminal */}
            {isSplitScreen && (
              <div
                ref={splitTermRef}
                className="terminal-container"
                onClick={() => setActivePane('split')}
                style={{
                  position: 'relative',
                  flex: 1,
                  width: '50%',
                  height: '100%',
                  overflow: 'hidden',
                  background: '#070a10',
                  boxShadow: activePane === 'split' ? 'inset 0 0 0 1px rgba(16, 185, 129, 0.4)' : 'none',
                }}
              >
                <TerminalSearch
                  visible={showSearch && activePane === 'split'}
                  searchAddon={splitSearchAddon.current}
                  onClose={() => setShowSearch(false)}
                />
              </div>
            )}
          </div>
        </main>

        {/* Right Drawer */}
        {activeDrawer && (
          <aside
            style={{
              width: '380px',
              background: '#0f1420',
              borderLeft: '1px solid #1e2638',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-10px 0 25px rgba(0, 0, 0, 0.4)',
              zIndex: 15,
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #1e2638',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px' }}>
                {activeDrawer === 'monitor' && (
                  <>
                    <Activity size={16} color="#38bdf8" />
                    <span>无 Agent 实时资源监控</span>
                  </>
                )}
                {activeDrawer === 'sftp' && (
                  <>
                    <FolderTree size={16} color="#38bdf8" />
                    <span>SFTP 远端文件工作区</span>
                  </>
                )}
                {activeDrawer === 'tunnels' && (
                  <>
                    <Network size={16} color="#38bdf8" />
                    <span>网络隧道与端口转发</span>
                  </>
                )}
                {activeDrawer === 'ai' && (
                  <>
                    <Bot size={16} color="#c084fc" />
                    <span>小易 AI 终端助手</span>
                  </>
                )}
              </div>
              <button
                onClick={() => setActiveDrawer(null)}
                style={{ color: '#64748b', padding: '4px', borderRadius: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Drawer Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 1. MONITOR */}
              {activeDrawer === 'monitor' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ background: '#171d2d', padding: '12px', borderRadius: '8px', border: '1px solid #1e2638' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>CPU 核心占用</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: '#38bdf8' }}>{cpuUsage.toFixed(1)}%</div>
                      <div style={{ width: '100%', height: '4px', background: '#222b42', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                        <div style={{ width: `${cpuUsage}%`, height: '100%', background: '#38bdf8', transition: 'width 0.5s' }} />
                      </div>
                    </div>
                    <div style={{ background: '#171d2d', padding: '12px', borderRadius: '8px', border: '1px solid #1e2638' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>物理内存 (16GB)</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>{memUsage.toFixed(1)}%</div>
                      <div style={{ width: '100%', height: '4px', background: '#222b42', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                        <div style={{ width: `${memUsage}%`, height: '100%', background: '#10b981' }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#171d2d', padding: '12px', borderRadius: '8px', border: '1px solid #1e2638' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px' }}>
                      <span style={{ color: '#94a3b8' }}>网卡实时吞吐 (eth0)</span>
                      <span style={{ color: '#10b981' }}>正常</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>下行流量 (RX)</div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: '#38bdf8' }}>{netRx.toFixed(1)} MB/s</div>
                      </div>
                      <div style={{ borderRight: '1px solid #1e2638' }} />
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>上行流量 (TX)</div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: '#a855f7' }}>{netTx.toFixed(1)} MB/s</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#171d2d', padding: '12px', borderRadius: '8px', border: '1px solid #1e2638' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>磁盘挂载空间</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#cbd5e1' }}>
                          <span>/ (根分区)</span>
                          <span>42.5 GB / 100 GB (42%)</span>
                        </div>
                        <div style={{ width: '100%', height: '4px', background: '#222b42', borderRadius: '2px', marginTop: '4px' }}>
                          <div style={{ width: '42%', height: '100%', background: '#38bdf8' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 2. SFTP FILE WORKSPACE */}
              {activeDrawer === 'sftp' && (
                <>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      value={sftpPath}
                      onChange={(e) => setSftpPath(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadSftpList(sftpPath)}
                      style={{
                        flex: 1,
                        background: '#171d2d',
                        border: '1px solid #1e2638',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        color: '#38bdf8',
                        fontSize: '12px',
                      }}
                    />
                    <button
                      onClick={handleCreateFolder}
                      style={{ padding: '6px', background: '#171d2d', borderRadius: '6px', color: '#94a3b8' }}
                      title="新建文件夹"
                    >
                      <FolderPlus size={14} />
                    </button>
                    <button
                      onClick={() => loadSftpList(sftpPath)}
                      style={{ padding: '6px', background: '#171d2d', borderRadius: '6px', color: '#94a3b8' }}
                      title="刷新"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>

                  {/* File List */}
                  <div style={{ background: '#171d2d', borderRadius: '8px', border: '1px solid #1e2638', flex: 1, padding: '8px', overflowY: 'auto' }}>
                    <div
                      onClick={() => {
                        const parts = sftpPath.replace(/\/+$/, '').split('/');
                        parts.pop();
                        const next = parts.join('/') || '.';
                        setSftpPath(next);
                        loadSftpList(next);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        borderBottom: '1px solid #1e2638',
                        marginBottom: '4px',
                      }}
                    >
                      <FolderTree size={14} color="#f59e0b" />
                      <span>.. (上级目录)</span>
                    </div>

                    {sftpEntries.map((f, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          if (f.is_dir) {
                            const next = sftpPath === '.' ? f.name : `${sftpPath}/${f.name}`;
                            setSftpPath(next);
                            loadSftpList(next);
                          } else {
                            handleOpenFile(f);
                          }
                        }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: '#e2e8f0',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {f.is_dir ? <FolderTree size={14} color="#f59e0b" /> : <Code size={14} color="#38bdf8" />}
                          <span>{f.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {f.is_dir ? '目录' : `${(f.size_bytes / 1024).toFixed(1)} KB`}
                          </span>
                          <button
                            onClick={(e) => handleDeleteFile(f.path || `${sftpPath}/${f.name}`, e)}
                            style={{ color: '#64748b' }}
                            title="删除"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Upload Target */}
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '1px dashed #2a3552',
                      borderRadius: '8px',
                      padding: '16px',
                      textAlign: 'center',
                      color: '#94a3b8',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <UploadCloud size={20} color="#38bdf8" />
                    <span>点击或拖拽文件上传 (直接同步至远端)</span>
                  </div>
                </>
              )}

              {/* 3. TUNNELS */}
              {activeDrawer === 'tunnels' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {tunnels.map((t) => (
                      <div key={t.id} style={{ background: '#171d2d', padding: '12px', borderRadius: '8px', border: '1px solid #1e2638' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>{t.name}</span>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: t.tunnelType === 'local' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(168, 85, 247, 0.1)',
                              color: t.tunnelType === 'local' ? '#34d399' : '#c084fc',
                            }}
                          >
                            {t.tunnelType === 'local' ? '本地转发 (-L)' : '动态代理 (-D)'}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
                          127.0.0.1:{t.localPort} {t.tunnelType === 'local' ? `➜ ${t.remoteHost}:${t.remotePort}` : '(SOCKS5)'}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: t.running ? '#10b981' : '#64748b' }}>
                            {t.running ? '● 正在监听' : '○ 已停止'}
                          </span>
                          <button
                            onClick={() => handleToggleTunnel(t.id)}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: t.running ? '#dc2626' : '#0284c7',
                              color: '#fff',
                            }}
                          >
                            {t.running ? '停止' : '启动'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Tunnel Form */}
                  <div style={{ background: '#171d2d', padding: '12px', borderRadius: '8px', border: '1px solid #1e2638' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: '#f8fafc' }}>新建端口转发</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input
                        placeholder="隧道名称 (如: Redis 映射)"
                        value={newTunnelName}
                        onChange={(e) => setNewTunnelName(e.target.value)}
                        style={{ background: '#0a0d14', border: '1px solid #1e2638', padding: '6px 10px', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                          value={newTunnelType}
                          onChange={(e) => setNewTunnelType(e.target.value as any)}
                          style={{ background: '#0a0d14', border: '1px solid #1e2638', padding: '6px', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px' }}
                        >
                          <option value="local">本地转发 (-L)</option>
                          <option value="socks5">动态代理 (-D)</option>
                        </select>
                        <input
                          placeholder="本地端口"
                          type="number"
                          value={newTunnelLocalPort}
                          onChange={(e) => setNewTunnelLocalPort(Number(e.target.value))}
                          style={{ flex: 1, background: '#0a0d14', border: '1px solid #1e2638', padding: '6px', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px' }}
                        />
                      </div>
                      {newTunnelType === 'local' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            placeholder="远端主机"
                            value={newTunnelRemoteHost}
                            onChange={(e) => setNewTunnelRemoteHost(e.target.value)}
                            style={{ flex: 2, background: '#0a0d14', border: '1px solid #1e2638', padding: '6px', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px' }}
                          />
                          <input
                            placeholder="端口"
                            type="number"
                            value={newTunnelRemotePort}
                            onChange={(e) => setNewTunnelRemotePort(Number(e.target.value))}
                            style={{ flex: 1, background: '#0a0d14', border: '1px solid #1e2638', padding: '6px', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px' }}
                          />
                        </div>
                      )}
                      <button
                        onClick={handleAddTunnel}
                        style={{ padding: '6px', background: '#0284c7', color: '#fff', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}
                      >
                        创建并监听
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* 4. AI COPILOT */}
              {activeDrawer === 'ai' && (
                <>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                    {aiMessages.map((msg, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                          maxWidth: '90%',
                          background: msg.sender === 'user' ? '#1e293b' : '#171d2d',
                          border: msg.sender === 'user' ? '1px solid #334155' : '1px solid #1e2638',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          lineHeight: '1.5',
                        }}
                      >
                        <div style={{ color: '#e2e8f0' }}>{msg.text}</div>
                        {msg.code && (
                          <div style={{ marginTop: '8px', background: '#0a0d14', padding: '8px', borderRadius: '6px', border: '1px solid #222b42' }}>
                            <code style={{ color: '#38bdf8', fontSize: '11px', wordBreak: 'break-all' }}>{msg.code}</code>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                              <button
                                onClick={() => runQuickCommand(msg.code!)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  background: '#0284c7',
                                  color: '#fff',
                                }}
                              >
                                <Play size={10} /> 回填执行
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {aiLoading && <div style={{ fontSize: '12px', color: '#a855f7' }}>小易正在思考分析...</div>}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                    <input
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendAi()}
                      placeholder="问小易：诊断 502 错误、排查网络延迟..."
                      style={{
                        flex: 1,
                        background: '#171d2d',
                        border: '1px solid #1e2638',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    />
                    <button
                      onClick={handleSendAi}
                      style={{
                        padding: '8px 12px',
                        background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                        borderRadius: '6px',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '12px',
                      }}
                    >
                      发送
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 3. Bottom Status Bar */}
      <footer
        style={{
          height: '24px',
          background: '#0a0d14',
          borderTop: '1px solid #1e2638',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontSize: '11px',
          color: '#64748b',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span>编码: UTF-8</span>
          <span>终端仿真: xterm-256color (WebGL GPU 加速)</span>
          <span>Shell Integration: OSC 133 开启</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span>CPU: {cpuUsage.toFixed(0)}%</span>
          <span>内存: {memUsage.toFixed(0)}%</span>
          <span style={{ color: '#10b981' }}>● 运行时健康</span>
        </div>
      </footer>

      {/* 4. Remote File Editor Modal */}
      {editingFile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              width: '900px',
              maxWidth: '95vw',
              height: '80vh',
              background: '#0f1420',
              border: '1px solid #222b42',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                borderBottom: '1px solid #1e2638',
                background: '#131929',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={18} color="#38bdf8" />
                <span style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>{editingFile.name}</span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>({editingFile.path})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {editorToast && (
                  <span style={{ fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={14} /> {editorToast}
                  </span>
                )}
                <button
                  onClick={handleSaveFile}
                  disabled={editingFile.saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#0284c7',
                    color: '#fff',
                  }}
                >
                  <Save size={14} />
                  {editingFile.saving ? '保存中...' : '保存并同步 (Ctrl+S)'}
                </button>
                <button onClick={() => setEditingFile(null)} style={{ color: '#94a3b8' }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, padding: '16px', background: '#0a0d14' }}>
              <textarea
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    handleSaveFile();
                  }
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'transparent',
                  color: '#e2e8f0',
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: '13px',
                  lineHeight: '1.6',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 5. Connection Inventory Manager Modal */}
      {showConnModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              width: '800px',
              maxWidth: '95vw',
              background: '#0f1420',
              border: '1px solid #222b42',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #1e2638',
                background: '#131929',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Server size={18} color="#38bdf8" />
                <span style={{ fontWeight: 600, fontSize: '15px', color: '#f8fafc' }}>服务器与主机资产中心</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={handleImportSshConfig}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    background: 'rgba(56, 189, 248, 0.15)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                  }}
                  title="自动从本地 ~/.ssh/config 发现并导入主机"
                >
                  <RefreshCw size={12} /> 一键同步 ~/.ssh/config
                </button>
                <button onClick={() => setShowConnModal(false)} style={{ color: '#94a3b8' }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {connToast && (
              <div style={{ padding: '8px 20px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '12px', borderBottom: '1px solid #1e2638' }}>
                {connToast}
              </div>
            )}

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '10px', fontWeight: 500 }}>已保存的主机节点 ({connections.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {connections.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: '#171d2d',
                        borderRadius: '8px',
                        border: '1px solid #1e2638',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {c.protocol === 'localpty' ? <TerminalIcon size={16} color="#10b981" /> : <Server size={16} color="#38bdf8" />}
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>{c.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {c.protocol === 'localpty' ? '本机系统终端' : `${c.username}@${c.host}:${c.port}`}
                          </div>
                        </div>
                        {c.tags?.map((t, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '10px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: t === 'SSH Config' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(56, 189, 248, 0.1)',
                              color: t === 'SSH Config' ? '#c084fc' : '#38bdf8',
                              border: t === 'SSH Config' ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(56, 189, 248, 0.2)',
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          onClick={() => handleConnectHost(c)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            background: '#0284c7',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          快速连接
                        </button>
                        {c.protocol !== 'localpty' && (
                          <button
                            onClick={(e) => handleDeleteConnection(c.id, e)}
                            style={{ color: '#64748b', padding: '6px' }}
                            title="删除配置"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Form */}
              <div style={{ borderTop: '1px solid #1e2638', paddingTop: '16px' }}>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px', fontWeight: 500 }}>新增 SSH 主机节点</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <input
                    placeholder="节点别名 (如: app-prod-01)"
                    value={newConnName}
                    onChange={(e) => setNewConnName(e.target.value)}
                    style={{ background: '#171d2d', border: '1px solid #1e2638', padding: '8px 12px', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px' }}
                  />
                  <input
                    placeholder="主机 IP / 域名 (如: 192.168.1.100)"
                    value={newConnHost}
                    onChange={(e) => setNewConnHost(e.target.value)}
                    style={{ background: '#171d2d', border: '1px solid #1e2638', padding: '8px 12px', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px' }}
                  />
                  <input
                    placeholder="SSH 端口 (默认: 22)"
                    type="number"
                    value={newConnPort}
                    onChange={(e) => setNewConnPort(Number(e.target.value))}
                    style={{ background: '#171d2d', border: '1px solid #1e2638', padding: '8px 12px', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px' }}
                  />
                  <input
                    placeholder="登录用户名 (如: root, ubuntu)"
                    value={newConnUser}
                    onChange={(e) => setNewConnUser(e.target.value)}
                    style={{ background: '#171d2d', border: '1px solid #1e2638', padding: '8px 12px', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px' }}
                  />
                  <input
                    placeholder="业务标签 (如: Production, K8s, DB)"
                    value={newConnTag}
                    onChange={(e) => setNewConnTag(e.target.value)}
                    style={{ gridColumn: 'span 2', background: '#171d2d', border: '1px solid #1e2638', padding: '8px 12px', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px' }}
                  />
                </div>
                <button
                  onClick={handleCreateConnection}
                  style={{
                    marginTop: '14px',
                    width: '100%',
                    padding: '8px',
                    background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  保存并加入主机资产库
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Shortcuts Cheatsheet Modal */}
      <ShortcutsModal
        visible={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        isMac={isMac}
      />

      {/* 7. Command Palette Modal */}
      <CommandPalette
        visible={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={paletteCommands}
        isMac={isMac}
      />

      {/* 8. Action Feedback Toast */}
      <ShortcutToast
        message={shortcutToast}
        onClose={() => setShortcutToast(null)}
      />
    </div>
  );
}

export default App;
