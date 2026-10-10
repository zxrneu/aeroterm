import React, { useEffect } from 'react';

interface ShortcutToastProps {
  message: string | null;
  onClose: () => void;
  durationMs?: number;
}

export const ShortcutToast: React.FC<ShortcutToastProps> = ({
  message,
  onClose,
  durationMs = 2200,
}) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [message, onClose, durationMs]);

  if (!message) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        background: 'rgba(15, 20, 32, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(56, 189, 248, 0.4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 12px rgba(56, 189, 248, 0.25)',
        borderRadius: '8px',
        color: '#f8fafc',
        fontSize: '12px',
        fontWeight: 500,
        pointerEvents: 'none',
        animation: 'fadeInUp 0.15s ease-out',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: '#38bdf8',
          boxShadow: '0 0 8px #38bdf8',
        }}
      />
      <span>{message}</span>
    </div>
  );
};
