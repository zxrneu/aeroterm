import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Terminal as TerminalIcon,
  X,
} from 'lucide-react';

export interface CommandItem {
  id: string;
  category: string;
  title: string;
  description?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  visible: boolean;
  onClose: () => void;
  commands: CommandItem[];
  isMac?: boolean;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  visible,
  onClose,
  commands,
  isMac = true,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredCommands = commands.filter((cmd) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      (cmd.description && cmd.description.toLowerCase().includes(q)) ||
      (cmd.keywords && cmd.keywords.some((k) => k.toLowerCase().includes(q)))
    );
  });

  useEffect(() => {
    if (visible) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [visible]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    // Scroll selected item into view smoothly
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredCommands.length > 0 ? (prev + 1) % filteredCommands.length : 0
      );
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredCommands.length > 0
          ? (prev - 1 + filteredCommands.length) % filteredCommands.length
          : 0
      );
      return;
    }
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing || (e as unknown as { keyCode: number }).keyCode === 229) {
        return;
      }
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        onClose();
      }
    }
  };

  if (!visible) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 8, 14, 0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '580px',
          maxWidth: '92vw',
          background: '#0f1420',
          border: '1px solid #222b42',
          borderRadius: '12px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 25px rgba(56, 189, 248, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px',
            borderBottom: '1px solid #1e2638',
            background: '#131929',
          }}
        >
          <Search size={18} color="#38bdf8" />
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索快捷命令、终端操作、侧边栏工具... (↑↓ 选择, Enter 执行)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: '14px',
            }}
          />
          <button
            onClick={onClose}
            style={{
              padding: '2px',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          style={{
            maxHeight: '380px',
            overflowY: 'auto',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {filteredCommands.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '13px',
              }}
            >
              未找到匹配的命令或操作
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    border: isSelected
                      ? '1px solid rgba(56, 189, 248, 0.3)'
                      : '1px solid transparent',
                    color: isSelected ? '#f8fafc' : '#cbd5e1',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        color: isSelected ? '#38bdf8' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {cmd.icon || <TerminalIcon size={16} />}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>
                        {cmd.title}
                        <span
                          style={{
                            marginLeft: '8px',
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#171d2d',
                            color: '#94a3b8',
                            border: '1px solid #1e2638',
                          }}
                        >
                          {cmd.category}
                        </span>
                      </div>
                      {cmd.description && (
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          {cmd.description}
                        </div>
                      )}
                    </div>
                  </div>

                  {cmd.shortcut && (
                    <kbd
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#171d2d',
                        border: '1px solid #2a3552',
                        fontSize: '11px',
                        fontFamily: 'inherit',
                        color: isSelected ? '#38bdf8' : '#94a3b8',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                      }}
                    >
                      {cmd.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid #1e2638',
            background: '#0a0d14',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <span>↑↓ 导航</span>
            <span>Enter 确认</span>
            <span>Esc 退出</span>
          </div>
          <div>按 {isMac ? '⌘ /' : 'Ctrl+/'} 查看全部快捷键</div>
        </div>
      </div>
    </div>
  );
};
