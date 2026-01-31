// Toast Notification System
class ToastManager {
  constructor() {
    this.toasts = [];
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(listener => listener(this.toasts));
  }

  add(toast) {
    const id = Date.now() + Math.random();
    const newToast = {
      id,
      ...toast,
      timestamp: Date.now()
    };
    
    this.toasts = [...this.toasts, newToast];
    this.notify();

    // Auto-remove after duration
    const duration = toast.duration || 5000;
    setTimeout(() => {
      this.remove(id);
    }, duration);

    return id;
  }

  remove(id) {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.notify();
  }

  clear() {
    this.toasts = [];
    this.notify();
  }

  success(message, options = {}) {
    return this.add({
      type: 'success',
      message,
      ...options
    });
  }

  error(message, options = {}) {
    return this.add({
      type: 'error',
      message,
      duration: options.duration || 7000, // Errors stay longer
      ...options
    });
  }

  warning(message, options = {}) {
    return this.add({
      type: 'warning',
      message,
      ...options
    });
  }

  info(message, options = {}) {
    return this.add({
      type: 'info',
      message,
      ...options
    });
  }
}

export const toast = new ToastManager();