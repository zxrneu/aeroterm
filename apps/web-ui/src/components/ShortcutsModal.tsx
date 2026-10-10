import React, { useState } from 'react';
import {
  SHORTCUT_ITEMS,
  SHORTCUT_CATEGORIES,
  type ShortcutCategory,
} from '../types/shortcuts';
import {
  Compass,
  Eye,
  Keyboard,
  Layout,
  Search,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';

interface ShortcutsModalProps {
  visible: boolean;
  onClose: () => void;
  isMac?: boolean;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  visible,
  onClose,
  isMac = true,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ShortcutCategory | 'all'>('all');
  const [displayPlatform, setDisplayPlatform] = useState<'mac' | 'win'>(isMac ? 'mac' : 'win');

  if (!visible) return null;

  const categoryIcons: Record<ShortcutCategory, React.ReactNode> = {
    tabs: <Layout size={15} />,
    terminal: <Terminal size={15} />,
    search: <Search size={15} />,
    view: <Eye size={15} />,
    tools: <Wrench size={15} />,
    general: <Compass size={15} />,
  };

  const filteredItems = SHORTCUT_ITEMS.filter((item) => {
    if (activeCategory !== 'all' && item.category !== activeCategory) {
      return false;
    }
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.macKey.toLowerCase().includes(q) ||
      item.winKey.toLowerCase().includes(q) ||
      (item.keywords && item.keywords.some((k) => k.toLowerCase().includes(q)))
    );
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 8, 14, 0.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '840px',
          maxWidth: '94vw',
          maxHeight: '85vh',
          background: '#0f1420',
          border: '1px solid #222b42',
          borderRadius: '14px',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
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
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
              }}
            >
              <Keyboard size={18} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                AeroTerm 常用键盘快捷键指南
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                极客工作站全套快捷键系统，支持多标签、双分屏、终端搜索与全局调控
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Platform Toggle */}
            <div
              style={{
                display: 'flex',
                background: '#0a0d14',
                padding: '2px',
                borderRadius: '6px',
                border: '1px solid #1e2638',
              }}
            >
              <button
                onClick={() => setDisplayPlatform('mac')}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: displayPlatform === 'mac' ? '#171d2d' : 'transparent',
                  color: displayPlatform === 'mac' ? '#38bdf8' : '#64748b',
                }}
              >
                macOS (⌘)
              </button>
              <button
                onClick={() => setDisplayPlatform('win')}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: displayPlatform === 'win' ? '#171d2d' : 'transparent',
                  color: displayPlatform === 'win' ? '#38bdf8' : '#64748b',
                }}
              >
                Windows / Linux
              </button>
            </div>

            <button onClick={onClose} style={{ color: '#94a3b8', padding: '4px' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search & Category Filter */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #1e2638',
            background: '#0c101a',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {/* Search Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              background: '#131929',
              border: '1px solid #1e2638',
              borderRadius: '6px',
            }}
          >
            <Search size={14} color="#64748b" />
            <input
              type="text"
              placeholder="快速搜索快捷键名称、动作或按键... (如: 分屏, 复制, tab, 搜索)"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: '#e2e8f0',
                fontSize: '12px',
                outline: 'none',
              }}
            />
            {filterQuery && (
              <button onClick={() => setFilterQuery('')} style={{ color: '#64748b' }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            <button
              onClick={() => setActiveCategory('all')}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 500,
                background: activeCategory === 'all' ? 'rgba(56, 189, 248, 0.15)' : '#131929',
                color: activeCategory === 'all' ? '#38bdf8' : '#94a3b8',
                border:
                  activeCategory === 'all'
                    ? '1px solid rgba(56, 189, 248, 0.3)'
                    : '1px solid #1e2638',
                whiteSpace: 'nowrap',
              }}
            >
              全部 ({SHORTCUT_ITEMS.length})
            </button>
            {SHORTCUT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: activeCategory === cat.id ? 'rgba(56, 189, 248, 0.15)' : '#131929',
                  color: activeCategory === cat.id ? '#38bdf8' : '#94a3b8',
                  border:
                    activeCategory === cat.id
                      ? '1px solid rgba(56, 189, 248, 0.3)'
                      : '1px solid #1e2638',
                  whiteSpace: 'nowrap',
                }}
              >
                {categoryIcons[cat.id]}
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Shortcut Cards Grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(370px, 1fr))',
            gap: '10px',
            alignContent: 'start',
          }}
        >
          {filteredItems.length === 0 ? (
            <div
              style={{
                gridColumn: '1 / -1',
                padding: '40px 0',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '13px',
              }}
            >
              没有找到匹配的快捷键
            </div>
          ) : (
            filteredItems.map((item) => {
              const keyCombo = displayPlatform === 'mac' ? item.macKey : item.winKey;
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: '#131929',
                    borderRadius: '8px',
                    border: '1px solid #1e2638',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div style={{ flex: 1, marginRight: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {item.description}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {keyCombo.split('/').map((combo, idx) => (
                      <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {idx > 0 && <span style={{ color: '#475569', fontSize: '11px' }}>/</span>}
                        <kbd
                          style={{
                            padding: '3px 8px',
                            background: '#1c2438',
                            border: '1px solid #2e3a59',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontFamily:
                              "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
                            color: '#38bdf8',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {combo.trim()}
                        </kbd>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid #1e2638',
            background: '#0a0d14',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#64748b',
          }}
        >
          <div>
            提示：在终端获得焦点时，所有快捷键均已深度接管，可正常呼出。
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>按 <kbd style={{ color: '#94a3b8' }}>Esc</kbd> 退出指南</span>
          </div>
        </div>
      </div>
    </div>
  );
};
