import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'error', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    error: (msg, duration) => addToast(msg, 'error', duration),
    success: (msg, duration) => addToast(msg, 'success', duration),
    info: (msg, duration) => addToast(msg, 'info', duration),
    warning: (msg, duration) => addToast(msg, 'warning', duration),
  };

  return (
    <ToastContext.Provider value={{ toast, addToast }}>
      {children}
      {/* Global Floating Toast Container */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="shake-error"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 18px',
              borderRadius: '9999px',
              backgroundColor: t.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(25, 25, 25, 0.95)',
              color: '#ffffff',
              border: t.type === 'error' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              fontSize: '13px',
              fontWeight: 500,
              animation: 'fadeInUp 0.25s ease-out',
            }}
          >
            <span>{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                padding: '0 4px',
                fontSize: '14px',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Return fallback if called outside provider
    return {
      toast: {
        error: (msg) => console.error('[Toast Error]:', msg),
        success: (msg) => console.log('[Toast Success]:', msg),
        info: (msg) => console.log('[Toast Info]:', msg),
        warning: (msg) => console.warn('[Toast Warning]:', msg),
      },
    };
  }
  return ctx;
};
