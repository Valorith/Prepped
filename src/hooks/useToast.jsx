import { useState, useEffect } from 'react';
import { toast } from '../utils/toast.js';

export function useToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe(setToasts);
    return unsubscribe;
  }, []);

  return {
    toasts,
    toast: {
      success: toast.success.bind(toast),
      error: toast.error.bind(toast),
      warning: toast.warning.bind(toast),
      info: toast.info.bind(toast),
      remove: toast.remove.bind(toast),
      clear: toast.clear.bind(toast),
    }
  };
}

export function ToastContainer() {
  const { toasts, toast: toastAPI } = useToast();

  const getIcon = (type) => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📋';
    }
  };

  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => toastAPI.remove(toast.id)}
        >
          <span>{getIcon(toast.type)}</span>
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            className="btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              toastAPI.remove(toast.id);
            }}
            style={{ padding: '4px', minWidth: 'auto' }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}