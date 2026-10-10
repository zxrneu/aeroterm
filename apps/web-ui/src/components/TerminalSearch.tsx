import React, { useState, useEffect, useRef } from 'react';
import { SearchAddon } from '@xterm/addon-search';
import { ArrowDown, ArrowUp, X } from 'lucide-react';

interface TerminalSearchProps {
  searchAddon: SearchAddon | null;
  onClose: () => void;
  visible: boolean;
}

export const TerminalSearch: React.FC<TerminalSearchProps> = ({
  searchAddon,
  onClose,
  visible,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [hasMatches, setHasMatches] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input when opened
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      if (searchAddon) {
        searchAddon.clearDecorations();
      }
    }
  }, [visible, searchAddon]);

  const doSearch = (term: string, backwards = false) => {
    if (!searchAddon || !term.trim()) {
      setHasMatches(true);
      return;
    }
    const options = {
      caseSensitive,
      regex: useRegex,
      wholeWord,
      incremental: !backwards,
    };

    let found = false;
    if (backwards) {
      found = searchAddon.findPrevious(term, options);
    } else {
      found = searchAddon.findNext(term, options);
    }
    setHasMatches(found);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    doSearch(val, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'Enter') {
      // Check for IME composition safely
      if (e.nativeEvent.isComposing || (e as unknown as { keyCode: number }).keyCode === 229) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) {
        doSearch(searchTerm, true);
      } else {
        doSearch(searchTerm, false);
      }
    }
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '8px',
        right: '16px',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(15, 20, 32, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6), 0 0 12px rgba(56, 189, 248, 0.15)',
        borderRadius: '8px',
        padding: '6px 10px',
        maxWidth: '420px',
        width: 'auto',
      }}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder="在终端中查找... (Enter / ⇧Enter)"
        value={searchTerm}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        style={{
          background: '#0a0d14',
          border: `1px solid ${!hasMatches && searchTerm ? 'rgba(239, 68, 68, 0.6)' : '#1e2638'}`,
          borderRadius: '5px',
          padding: '4px 8px',
          color: '#f8fafc',
          fontSize: '12px',
          width: '200px',
          outline: 'none',
          boxShadow: !hasMatches && searchTerm ? '0 0 8px rgba(239, 68, 68, 0.3)' : 'none',
        }}
      />

      {/* Navigation Buttons */}
      <button
        onClick={() => doSearch(searchTerm, true)}
        title="查找上一个 (Shift+Enter)"
        style={{
          padding: '4px 6px',
          borderRadius: '4px',
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(30, 41, 59, 0.5)',
        }}
      >
        <ArrowUp size={13} />
      </button>

      <button
        onClick={() => doSearch(searchTerm, false)}
        title="查找下一个 (Enter)"
        style={{
          padding: '4px 6px',
          borderRadius: '4px',
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(30, 41, 59, 0.5)',
        }}
      >
        <ArrowDown size={13} />
      </button>

      <div style={{ width: '1px', height: '16px', background: '#1e2638', margin: '0 2px' }} />

      {/* Options: Case Sensitive */}
      <button
        onClick={() => {
          const next = !caseSensitive;
          setCaseSensitive(next);
          if (searchAddon && searchTerm) {
            searchAddon.findNext(searchTerm, { caseSensitive: next, regex: useRegex, wholeWord });
          }
        }}
        title="区分大小写"
        style={{
          padding: '2px 5px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          background: caseSensitive ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
          color: caseSensitive ? '#38bdf8' : '#64748b',
          border: caseSensitive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
        }}
      >
        Aa
      </button>

      {/* Options: Whole Word */}
      <button
        onClick={() => {
          const next = !wholeWord;
          setWholeWord(next);
          if (searchAddon && searchTerm) {
            searchAddon.findNext(searchTerm, { caseSensitive, regex: useRegex, wholeWord: next });
          }
        }}
        title="全词匹配"
        style={{
          padding: '2px 5px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          background: wholeWord ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
          color: wholeWord ? '#38bdf8' : '#64748b',
          border: wholeWord ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
        }}
      >
        \b
      </button>

      {/* Options: Regex */}
      <button
        onClick={() => {
          const next = !useRegex;
          setUseRegex(next);
          if (searchAddon && searchTerm) {
            searchAddon.findNext(searchTerm, { caseSensitive, regex: next, wholeWord });
          }
        }}
        title="使用正则表达式"
        style={{
          padding: '2px 5px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          background: useRegex ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
          color: useRegex ? '#38bdf8' : '#64748b',
          border: useRegex ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
        }}
      >
        .*
      </button>

      <div style={{ width: '1px', height: '16px', background: '#1e2638', margin: '0 2px' }} />

      {/* Close button */}
      <button
        onClick={onClose}
        title="关闭查找 (Esc)"
        style={{
          padding: '4px',
          borderRadius: '4px',
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
};
