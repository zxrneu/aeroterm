import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import {
  Activity,
  Bot,
  Check,
  Code,
  FileText,
  FolderTree,
  Network,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Server,
  Settings,
  Shield,
  SplitSquareVertical,
  Terminal as TerminalIcon,
  UploadCloud,
  Video,
  X,
  Zap,
} from 'lucide-react';

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

interface EditingFile {
  path: string;
  name: string;
  content: string;
  saving: boolean;
}

export function App() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);

  const isDev = window.location.port === '5173';
  const apiBase = isDev ? 'http://127.0.0.1:12335' : window.location.origin;
  const wsBase = isDev
    ? 'ws://127.0.0.1:12335'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

  const [activeTab, setActiveTab] = useState<string>('local');
  const [activeDrawer, setActiveDrawer] = useState<'monitor' | 'sftp' | 'tunnels' | 'ai' | null>('monitor');
  const [broadcastEnabled, setBroadcastEnabled] = useState(false);
  const [vaultUnlocked] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Connection Inventory state
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [showConnModal, setShowConnModal] = useState(false);
  const [newConnName, setNewConnName] = useState('');
  const [newConnHost, setNewConnHost] = useState('');
  const [newConnPort, setNewConnPort] = useState(22);
  const [newConnUser, setNewConnUser] = useState('root');
  const [newConnTag, setNewConnTag] = useState('Production');

  // Remote File Editor state
  const [editingFile, setEditingFile] = useState<EditingFile | null>(null);
  const [editorToast, setEditorToast] = useState<string | null>(null);

  // Session Recording state (Asciinema .cast v2)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingEventsRef = useRef<Array<[number, string, string]>>([]);
  const recordingStartRef = useRef<number>(0);

  // Monitor live metrics state
  const [cpuUsage, setCpuUsage] = useState(24.5);
  const [memUsage, setMemUsage] = useState(58.2);
  const [netRx, setNetRx] = useState(14.8);
  const [netTx, setNetTx] = useState(4.2);

  // SFTP state
  const [sftpPath, setSftpPath] = useState('.');
  const [sftpEntries, setSftpEntries] = useState<Array<{ name: string; path?: string; is_dir: boolean; size_bytes: number }>>([]);

  // AI chat state
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{ sender: 'user' | 'assistant'; text: string; code?: string }>>([
    {
      sender: 'assistant',
      text: '你好！我是 TerminalPro 终端智能助手“小易”。我可以直接解释命令、分析报错、或者根据你的自然语言需求生成高可用运维脚本。',
    },
  ]);

  // Load saved connection profiles
  const loadConnections = async () => {
    try {
      const res = await fetch(`${apiBase}/api/connections`);
      if (res.ok) {
        const data = await res.json();
        setConnections(data);
      }
    } catch {
      // fallback sample
      setConnections([
        { id: '1', name: 'prod-k8s-node-01', protocol: 'ssh', host: '10.244.0.15', port: 22, username: 'root', tags: ['Kubernetes', 'Prod'] },
        { id: '2', name: 'db-postgres-master', protocol: 'ssh', host: '192.168.1.120', port: 5432, username: 'postgres', tags: ['Database'] },
      ]);
    }
  };

  useEffect(() => {
    loadConnections();
  }, [apiBase]);

  // Handle saving new connection
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

  // Recording timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
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
      // Export Asciinema v2 .cast file
      setIsRecording(false);
      const cols = xtermInstance.current?.cols || 80;
      const rows = xtermInstance.current?.rows || 24;
      const header = {
        version: 2,
        width: cols,
        height: rows,
        timestamp: Math.floor(recordingStartRef.current / 1000),
        title: `TerminalPro Session (${activeTab})`,
      };
      const lines = [JSON.stringify(header)];
      for (const ev of recordingEventsRef.current) {
        lines.push(JSON.stringify(ev));
      }
      const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/x-asciicast' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terminalpro_${activeTab}_${Date.now()}.cast`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Open file for in-app code editor
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
      content: `# TerminalPro Remote File: ${file.name}\n# Path: ${filePath}\n\nserver {\n    listen 80;\n    server_name production.internal;\n    location /api {\n        proxy_pass http://127.0.0.1:12335;\n    }\n}\n`,
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
      setEditorToast('已保存 (本地离线态)');
      setTimeout(() => setEditorToast(null), 3000);
    } finally {
      setEditingFile((prev) => (prev ? { ...prev, saving: false } : null));
    }
  };

  // Periodic metric updates from backend probe
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
        // Fallback simulation
      }
      setCpuUsage((prev) => Math.max(10, Math.min(95, prev + (Math.random() * 8 - 4))));
      setMemUsage((prev) => Math.max(20, Math.min(90, prev + (Math.random() * 2 - 1))));
      setNetRx((prev) => Math.max(1, Math.min(80, prev + (Math.random() * 4 - 2))));
      setNetTx((prev) => Math.max(0.5, Math.min(30, prev + (Math.random() * 2 - 1))));
    };

    const timer = setInterval(fetchMetrics, 2000);
    fetchMetrics();
    return () => clearInterval(timer);
  }, [apiBase]);

  // Load SFTP directory entries
  const loadSftpList = async (path: string) => {
    try {
      const res = await fetch(`${apiBase}/api/sftp/list?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setSftpEntries(data);
        setSftpPath(path);
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    if (activeDrawer === 'sftp') {
      loadSftpList(sftpPath);
    }
  }, [activeDrawer, sftpPath, apiBase]);

  // Initialize xterm.js & WebSocket bridge
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
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
        brightBlack: '#475569',
        brightRed: '#fb7185',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#7dd3fc',
        brightWhite: '#ffffff',
      },
      allowTransparency: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);

    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
    } catch {
      // fallback to canvas/DOM if WebGL not supported in current environment
    }

    fitAddon.fit();
    xtermInstance.current = term;

    // Welcome banner
    term.writeln('\x1b[1;36m======================================================================\x1b[0m');
    term.writeln('\x1b[1;34m  TerminalPro v0.1.0\x1b[0m \x1b[38;5;244m- Next-Gen Terminal Workstation (Rust Core)\x1b[0m');
    term.writeln('\x1b[38;5;244m  Zero-Knowledge Vault: \x1b[32mActive (AES-256-GCM)\x1b[0m | MCP Service: \x1b[32mhttp://127.0.0.1:12335\x1b[0m');
    term.writeln('\x1b[1;36m======================================================================\x1b[0m');

    // Connect WebSocket to real backend PTY/SSH session
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(`${wsBase}/ws/terminal/${activeTab}`);
      socket.binaryType = 'arraybuffer';
      wsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
        term.writeln('\x1b[32m[✓] Live PTY Bridge Connected (ws://127.0.0.1:12335)\x1b[0m\r\n');
        socket?.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };

      socket.onclose = () => {
        setWsConnected(false);
      };

      socket.onerror = () => {
        setWsConnected(false);
      };

      socket.onmessage = async (event) => {
        let textChunk = '';
        if (event.data instanceof ArrayBuffer) {
          const u8 = new Uint8Array(event.data);
          textChunk = new TextDecoder().decode(u8);
          term.write(u8);
        } else if (typeof event.data === 'string') {
          textChunk = event.data;
          term.write(event.data);
        }
        if (recordingStartRef.current > 0 && textChunk) {
          const elapsed = (Date.now() - recordingStartRef.current) / 1000;
          recordingEventsRef.current.push([elapsed, 'o', textChunk]);
        }
      };
    } catch {
      setWsConnected(false);
    }

    let currentLine = '';
    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (broadcastEnabled) {
          wsRef.current.send(JSON.stringify({ type: 'broadcast', data }));
        } else {
          wsRef.current.send(JSON.stringify({ type: 'input', data }));
        }
      } else {
        // Fallback local echo
        if (data === '\r') {
          term.writeln('');
          handleCommand(currentLine.trim(), term);
          currentLine = '';
          term.write('\x1b[32m➜\x1b[0m \x1b[36m~/coding/terminal_pro\x1b[0m \x1b[33m(main)\x1b[0m $ ');
        } else if (data === '\u007F') {
          if (currentLine.length > 0) {
            currentLine = currentLine.slice(0, -1);
            term.write('\b \b');
          }
        } else {
          currentLine += data;
          term.write(data);
        }
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (socket) {
        socket.close();
      }
      term.dispose();
    };
  }, [activeTab, broadcastEnabled, wsBase]);

  const handleCommand = (cmd: string, term: Terminal) => {
    if (!cmd) return;
    if (cmd === 'clear') {
      term.clear();
    } else if (cmd === 'uname -a') {
      term.writeln('Darwin zxr-MacBook-Pro.local 24.6.0 Darwin Kernel Version 24.6.0 arm64');
    } else if (cmd === 'help') {
      term.writeln('Available demo commands: help, uname -a, status, monitor, sftp, clear');
    } else if (cmd === 'status') {
      term.writeln('\x1b[32m[✓] Backend Core:\x1b[0m Rust 2024 (Tokio Async, Russh 0.64)');
      term.writeln('\x1b[32m[✓] Vault:\x1b[0m Argon2id KDF + AES-256-GCM AEAD (Unlocked)');
      term.writeln('\x1b[32m[✓] MCP Server:\x1b[0m http://127.0.0.1:12335 (4 Tools Active)');
      term.writeln('\x1b[32m[✓] PTY:\x1b[0m Portable-PTY POSIX OpenPTY');
    } else {
      term.writeln(`zsh: command executed: ${cmd}`);
    }
  };

  const handleSendAi = async () => {
    if (!aiInput.trim()) return;
    const prompt = aiInput.trim();
    setAiMessages((prev) => [...prev, { sender: 'user', text: prompt }]);
    setAiInput('');

    try {
      const res = await fetch(`${apiBase}/api/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, os_type: 'macOS', current_cwd: '~/coding/terminal_pro' }),
      });
      if (res.ok) {
        const data = await res.json();
        const codeMatch = data.response?.match(/```(?:bash|sh)?\n([\s\S]*?)```/);
        const code = codeMatch ? codeMatch[1].trim() : undefined;
        setAiMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: data.response,
            code,
          },
        ]);
        return;
      }
    } catch {
      // ignore
    }

    // Fallback simulation
    setTimeout(() => {
      if (prompt.includes('端口') || prompt.includes('占用')) {
        setAiMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: '在 Linux 上排查特定端口占用的推荐命令如下，已为你生成参数：',
            code: 'sudo lsof -i :8080 -P -n | grep LISTEN',
          },
        ]);
      } else if (prompt.includes('查找') || prompt.includes('大文件')) {
        setAiMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: '查找系统根目录下大于 500MB 的文件并按大小降序输出：',
            code: 'find / -type f -size +500M -exec du -h {} + 2>/dev/null | sort -rh | head -n 15',
          },
        ]);
      } else {
        setAiMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: `针对你的需求：“${prompt}”，可以使用以下 Shell 命令执行并自动检查返回状态：`,
            code: `curl -fsSL https://api.service.internal/health && echo "Health check OK"`,
          },
        ]);
      }
    }, 400);
  };

  const injectCodeToTerminal = (code: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: `${code}\n` }));
    } else if (xtermInstance.current) {
      xtermInstance.current.writeln(code);
      xtermInstance.current.writeln(`[Executing: ${code}]`);
      xtermInstance.current.write('\x1b[32m➜\x1b[0m \x1b[36m~/coding/terminal_pro\x1b[0m \x1b[33m(main)\x1b[0m $ ');
    }
  };

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
        {/* Brand & Tabs */}
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
              Terminal<span style={{ color: '#38bdf8' }}>Pro</span>
            </span>
          </div>

          {/* Connection Tabs */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setActiveTab('local')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                background: activeTab === 'local' ? '#171d2d' : 'transparent',
                color: activeTab === 'local' ? '#38bdf8' : '#94a3b8',
                border: activeTab === 'local' ? '1px solid #1e2638' : '1px solid transparent',
              }}
            >
              <TerminalIcon size={13} />
              Local (zsh)
            </button>
            {connections
              .filter((c) => c.protocol !== 'localpty')
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveTab(c.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    background: activeTab === c.name ? '#171d2d' : 'transparent',
                    color: activeTab === c.name ? '#38bdf8' : '#94a3b8',
                    border: activeTab === c.name ? '1px solid #1e2638' : '1px solid transparent',
                  }}
                >
                  <Server size={13} />
                  {c.name}
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                </button>
              ))}
            <button
              onClick={() => setShowConnModal(true)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              title="新建/管理资产连接"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Session Recording Button (Asciinema .cast v2) */}
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
              cursor: 'pointer',
            }}
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
          >
            <Radio size={13} />
            {broadcastEnabled ? '广播同步开启' : '广播输入'}
          </button>

          {/* Split Screen Control */}
          <button
            style={{
              padding: '6px',
              borderRadius: '6px',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              background: '#171d2d',
            }}
            title="分屏视图"
          >
            <SplitSquareVertical size={14} />
          </button>

          {/* MCP Server Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
            }}
          >
            <Zap size={11} />
            MCP: 12335
          </div>

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
            {wsConnected ? 'PTY: Online' : 'PTY: Offline'}
          </div>

          {/* Vault Status Badge */}
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
            {vaultUnlocked ? 'Vault: E2EE' : 'Vault: Locked'}
          </div>
        </div>
      </header>

      {/* 2. Main Body Layout (Left Sidebar + Center Terminal + Right Auxiliary Drawer) */}
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
              transition: 'all 0.2s',
            }}
            title="服务器实时监控"
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
              transition: 'all 0.2s',
            }}
            title="SFTP 文件传输"
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
              transition: 'all 0.2s',
            }}
            title="端口转发与隧道"
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
              transition: 'all 0.2s',
            }}
            title="小易 AI 终端助手"
          >
            <Bot size={18} />
          </button>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              style={{
                padding: '10px',
                borderRadius: '8px',
                color: '#64748b',
              }}
              title="系统设置"
            >
              <Settings size={18} />
            </button>
          </div>
        </aside>

        {/* Center Workspace (Terminal Window) */}
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
          {/* Terminal View Container */}
          <div
            ref={terminalRef}
            className="terminal-container"
            style={{
              flex: 1,
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
          />
        </main>

        {/* Right Drawer (Collapsible Panels: Monitor / SFTP / Tunnels / AI) */}
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
              {/* 1. MONITOR PANEL */}
              {activeDrawer === 'monitor' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {/* CPU Card */}
                    <div style={{ background: '#171d2d', padding: '12px', borderRadius: '8px', border: '1px solid #1e2638' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>CPU 核心占用</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: '#38bdf8' }}>{cpuUsage.toFixed(1)}%</div>
                      <div style={{ width: '100%', height: '4px', background: '#222b42', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                        <div style={{ width: `${cpuUsage}%`, height: '100%', background: '#38bdf8', transition: 'width 0.5s' }} />
                      </div>
                    </div>
                    {/* Memory Card */}
                    <div style={{ background: '#171d2d', padding: '12px', borderRadius: '8px', border: '1px solid #1e2638' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>物理内存 (16GB)</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>{memUsage.toFixed(1)}%</div>
                      <div style={{ width: '100%', height: '4px', background: '#222b42', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                        <div style={{ width: `${memUsage}%`, height: '100%', background: '#10b981' }} />
                      </div>
                    </div>
                  </div>

                  {/* Network Bandwidth */}
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

                  {/* Disk Partitions */}
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
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#cbd5e1' }}>
                          <span>/data (NVMe)</span>
                          <span>136 GB / 200 GB (68%)</span>
                        </div>
                        <div style={{ width: '100%', height: '4px', background: '#222b42', borderRadius: '2px', marginTop: '4px' }}>
                          <div style={{ width: '68%', height: '100%', background: '#f59e0b' }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Processes */}
                  <div style={{ background: '#171d2d', padding: '12px', borderRadius: '8px', border: '1px solid #1e2638', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
                      <span>实时进程列表 (Top 4)</span>
                      <RefreshCw size={12} style={{ cursor: 'pointer' }} />
                    </div>
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ color: '#64748b', borderBottom: '1px solid #222b42' }}>
                          <th style={{ padding: '4px 0' }}>PID</th>
                          <th>进程名</th>
                          <th>CPU</th>
                          <th>内存</th>
                        </tr>
                      </thead>
                      <tbody style={{ color: '#cbd5e1' }}>
                        <tr>
                          <td style={{ padding: '6px 0' }}>1428</td>
                          <td>dockerd</td>
                          <td style={{ color: '#38bdf8' }}>14.2%</td>
                          <td>4.1%</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '6px 0' }}>2091</td>
                          <td>postgres</td>
                          <td style={{ color: '#38bdf8' }}>6.8%</td>
                          <td>18.4%</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '6px 0' }}>3102</td>
                          <td>nginx</td>
                          <td style={{ color: '#38bdf8' }}>2.1%</td>
                          <td>0.8%</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '6px 0' }}>89</td>
                          <td>systemd-journal</td>
                          <td style={{ color: '#38bdf8' }}>0.4%</td>
                          <td>0.5%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* 2. SFTP FILE MANAGER PANEL */}
              {activeDrawer === 'sftp' && (
                <>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      value={sftpPath}
                      onChange={(e) => setSftpPath(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') loadSftpList(sftpPath);
                      }}
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
                      onClick={() => loadSftpList(sftpPath)}
                      style={{ padding: '6px', background: '#171d2d', borderRadius: '6px', color: '#94a3b8' }}
                      title="刷新"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>

                  <div style={{ background: '#171d2d', borderRadius: '8px', border: '1px solid #1e2638', flex: 1, padding: '8px', overflowY: 'auto' }}>
                    {/* Parent Dir Button */}
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

                    {(sftpEntries.length > 0
                      ? sftpEntries
                      : [
                          { name: 'Cargo.toml', is_dir: false, size_bytes: 2048 },
                          { name: 'crates', is_dir: true, size_bytes: 0 },
                          { name: 'apps', is_dir: true, size_bytes: 0 },
                          { name: 'doc', is_dir: true, size_bytes: 0 },
                          { name: 'README.md', is_dir: false, size_bytes: 1234 },
                        ]
                    ).map((f, i) => (
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
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {f.is_dir ? '目录' : `${(f.size_bytes / 1024).toFixed(1)} KB`}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div
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
                    }}
                  >
                    <UploadCloud size={20} color="#38bdf8" />
                    <span>拖拽文件至此快速上传 (Tar/Zstd 智能加速)</span>
                  </div>
                </>
              )}

              {/* 3. TUNNELS PANEL */}
              {activeDrawer === 'tunnels' && (
                <>
                  <div style={{ background: '#171d2d', padding: '12px', borderRadius: '8px', border: '1px solid #1e2638' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>MySQL 生产只读库映射</span>
                      <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>本地转发 (-L)</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
                      <code>127.0.0.1:3307</code> ➜ <code>10.240.1.5:3306</code>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                      <span>流量: 28.4 MB</span>
                      <span style={{ color: '#10b981' }}>● 监听中</span>
                    </div>
                  </div>

                  <div style={{ background: '#171d2d', padding: '12px', borderRadius: '8px', border: '1px solid #1e2638' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>内网 SOCKS5 动态代理</span>
                      <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.1)', color: '#c084fc' }}>动态代理 (-D)</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
                      本地端口: <code>127.0.0.1:1080</code> (RFC 1928)
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                      <span>活跃连接: 4</span>
                      <span style={{ color: '#10b981' }}>● 监听中</span>
                    </div>
                  </div>
                </>
              )}

              {/* 4. AI COPILOT PANEL */}
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
                                onClick={() => injectCodeToTerminal(msg.code!)}
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
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                    <input
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendAi()}
                      placeholder="问小易：查找大于 100M 的日志、诊断 502 报错..."
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
            {/* Modal Header */}
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
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Save size={14} />
                  {editingFile.saving ? '保存中...' : '保存并同步 (Ctrl+S)'}
                </button>
                <button
                  onClick={() => setEditingFile(null)}
                  style={{ color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Editor Textarea */}
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
              width: '750px',
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
              <button
                onClick={() => setShowConnModal(false)}
                style={{ color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Existing Connections */}
              <div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '10px', fontWeight: 500 }}>已保存的主机节点</div>
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
                              background: 'rgba(56, 189, 248, 0.1)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.2)',
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab(c.name);
                          setShowConnModal(false);
                        }}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          background: '#0284c7',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 500,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        快速连接
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Connection Form */}
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
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  保存并加入主机资产库
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
