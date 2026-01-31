import { toast } from './toast.js';

// API Configuration
const API_BASE = '/api';

// Enhanced fetch wrapper with error handling
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (!options.silent) {
      toast.error(`API Error: ${error.message}`);
    }
    throw error;
  }
}

// Recipes API
export const recipesApi = {
  getAll: () => apiRequest('/recipes'),
  
  get: (id) => apiRequest(`/recipes/${id}`),
  
  create: (recipe) => apiRequest('/recipes', {
    method: 'POST',
    body: recipe,
  }),
  
  update: (id, recipe) => apiRequest(`/recipes/${id}`, {
    method: 'PUT',
    body: recipe,
  }),
  
  delete: (id) => apiRequest(`/recipes/${id}`, {
    method: 'DELETE',
  }),
};

// Meals API
export const mealsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/meals${query ? `?${query}` : ''}`);
  },
  
  create: (meal) => apiRequest('/meals', {
    method: 'POST',
    body: meal,
  }),
  
  update: (id, meal) => apiRequest(`/meals/${id}`, {
    method: 'PUT',
    body: meal,
  }),
  
  delete: (id) => apiRequest(`/meals/${id}`, {
    method: 'DELETE',
  }),
};

// Shopping List API
export const shoppingApi = {
  getAll: () => apiRequest('/shopping'),
  
  create: (item) => apiRequest('/shopping', {
    method: 'POST',
    body: item,
  }),
  
  update: (id, updates) => apiRequest(`/shopping/${id}`, {
    method: 'PATCH',
    body: updates,
  }),
  
  delete: (id) => apiRequest(`/shopping/${id}`, {
    method: 'DELETE',
  }),
  
  deleteAll: (checkedOnly = false) => apiRequest('/shopping', {
    method: 'DELETE',
    ...(checkedOnly && { headers: { 'X-Checked-Only': 'true' } })
  }),
  
  generateFromMeals: (params) => apiRequest('/shopping/generate', {
    method: 'POST',
    body: params,
  }),
};

// Utility functions
export function formatError(error) {
  if (error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}

export function handleApiError(error, context = '') {
  const message = formatError(error);
  toast.error(context ? `${context}: ${message}` : message);
}

// Loading state manager
class LoadingManager {
  constructor() {
    this.loading = new Set();
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    const isLoading = this.loading.size > 0;
    const loadingKeys = Array.from(this.loading);
    this.listeners.forEach(listener => listener({ isLoading, loadingKeys }));
  }

  start(key = 'default') {
    this.loading.add(key);
    this.notify();
  }

  stop(key = 'default') {
    this.loading.delete(key);
    this.notify();
  }

  isLoading(key = 'default') {
    return this.loading.has(key);
  }

  clear() {
    this.loading.clear();
    this.notify();
  }
}

export const loadingManager = new LoadingManager();

// Async operation wrapper with loading and error handling
export async function withLoading(operation, key = 'default', options = {}) {
  loadingManager.start(key);
  
  try {
    const result = await operation();
    
    if (options.successMessage) {
      toast.success(options.successMessage);
    }
    
    return result;
  } catch (error) {
    if (options.errorContext) {
      handleApiError(error, options.errorContext);
    } else if (!options.silent) {
      handleApiError(error);
    }
    throw error;
  } finally {
    loadingManager.stop(key);
  }
}