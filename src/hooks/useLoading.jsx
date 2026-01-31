import { useState, useEffect } from 'react';
import { loadingManager } from '../utils/api.js';

export function useLoading(key = 'default') {
  const [state, setState] = useState({
    isLoading: false,
    loadingKeys: []
  });

  useEffect(() => {
    const unsubscribe = loadingManager.subscribe(setState);
    return unsubscribe;
  }, []);

  return {
    isLoading: key ? state.loadingKeys.includes(key) : state.isLoading,
    isAnyLoading: state.isLoading,
    loadingKeys: state.loadingKeys,
    start: (k = key) => loadingManager.start(k),
    stop: (k = key) => loadingManager.stop(k),
  };
}

export function LoadingSpinner({ size = 16, className = '' }) {
  return (
    <div className={`spinner ${className}`} style={{ width: size, height: size }} />
  );
}

export function LoadingButton({ loading, children, loadingText, ...props }) {
  return (
    <button {...props} disabled={loading || props.disabled}>
      {loading && <LoadingSpinner />}
      {loading ? loadingText || 'Loading...' : children}
    </button>
  );
}