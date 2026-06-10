import axios from 'axios';
import { getClientRoutingService, normalizeDevApiUrl } from '../services/clientRoutingService';

const defaultBaseUrl = normalizeDevApiUrl((() => {
  const envUrl = process.env.REACT_APP_API_URL;
  if (envUrl) return envUrl;

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'http://localhost:5000';
})());

// Configure axios with base URL
const api = axios.create({
  baseURL: defaultBaseUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

function normalizeBaseUrl(rawBaseUrl) {
  const raw = rawBaseUrl ? String(rawBaseUrl).trim() : '';
  if (!raw) return raw;

  let normalized = raw;
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  if (normalized.toLowerCase().endsWith('/api')) {
    normalized = normalized.slice(0, -4);
  }
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

// Request interceptor to add auth token and use client routing
api.interceptors.request.use(
  (config) => {
    // Use client routing service to get the appropriate API base URL
    const routingService = getClientRoutingService();
    if (routingService.isInitialized && config.url && !config.url.startsWith('http')) {
      const apiBase = routingService.getApiBaseUrl();
      // Validate that apiBase is a complete URL (has protocol and hostname)
      if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
        if (apiBase !== config.baseURL) {
          config.baseURL = apiBase;
        }
      } else {
        // If apiBase is invalid (like just ":5000"), use default
        console.warn('Invalid API base URL from routing service:', apiBase, 'using default');
        config.baseURL = defaultBaseUrl;
      }
    }
    
    // Ensure baseURL is always valid
    if (!config.baseURL || (!config.baseURL.startsWith('http://') && !config.baseURL.startsWith('https://'))) {
      config.baseURL = defaultBaseUrl;
    }

    // Normalize baseURL so it never ends with '/api'.
    // Our client calls endpoints using '/api/...' paths.
    config.baseURL = normalizeDevApiUrl(normalizeBaseUrl(config.baseURL));

    // If a caller uses '/api/...' paths (common), but baseURL also includes '/api',
    // strip the duplicate prefix to avoid '/api/api/...'.
    if (config.url && typeof config.url === 'string') {
      const url = config.url;
      const base = String(config.baseURL || '');
      if (base.toLowerCase().endsWith('/api') && url.startsWith('/api/')) {
        config.url = url.slice(4);
      }

      // Extra hardening: if we still have a double '/api/api/' in the constructed path,
      // fix it at the url level.
      if (config.url && typeof config.url === 'string' && config.url.includes('/api/api/')) {
        config.url = config.url.replace('/api/api/', '/api/');
      }
    }

    // Add auth token
    const token = localStorage.getItem('auth-storage');
    if (token) {
      try {
        const authData = JSON.parse(token);
        if (authData.state?.token) {
          config.headers.Authorization = `Bearer ${authData.state.token}`;
        }
      } catch (error) {
        console.warn('Failed to parse auth token:', error);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors and failover
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const routingService = getClientRoutingService();

    const requestUrl = (originalRequest?.url || '').toString();
    const isAuthEndpoint = requestUrl.includes('/api/auth/login') ||
      requestUrl.includes('/api/auth/refresh') ||
      requestUrl.includes('/api/auth/me');
    
    // Handle server errors (5xx) with failover — skip for local single-server dev
    const apiBaseForFailover = (originalRequest?.baseURL || '').toString();
    const isLocalDevApi = /localhost|127\.0\.0\.1|:5000/.test(apiBaseForFailover);
    if (
      error.response?.status >= 500 &&
      routingService.isInitialized &&
      !originalRequest._failoverAttempted &&
      !isLocalDevApi
    ) {
      originalRequest._failoverAttempted = true;
      
      // Try failover to backup homeserver
      const failoverSuccess = await routingService.forceFailover();
      if (failoverSuccess) {
        // Retry request with failover URL
        originalRequest.baseURL = routingService.getApiBaseUrl();
        return api(originalRequest);
      }
    }
    
    // Handle 401/403 auth failures (403 = invalid/expired token from authenticateToken)
    const authFailed = error.response?.status === 401 || error.response?.status === 403;
    if (authFailed && !originalRequest._retry && !requestUrl.includes('/api/auth/login')) {
      originalRequest._retry = true;
      
      try {
        // Try to refresh token
        const authStorage = localStorage.getItem('auth-storage');
        if (authStorage) {
          const authData = JSON.parse(authStorage);
          const token = authData?.state?.token;
          
          if (token) {
            // Use current API base URL for refresh
            const apiBase = routingService.isInitialized 
              ? routingService.getApiBaseUrl() 
              : defaultBaseUrl;
            
            // Attempt token refresh
            const refreshResponse = await axios.post(
              `${apiBase}/api/auth/refresh`,
              {},
              {
                headers: { Authorization: `Bearer ${token}` }
              }
            );
            
            if (refreshResponse.data?.token) {
              // Update stored token
              authData.state.token = refreshResponse.data.token;
              localStorage.setItem('auth-storage', JSON.stringify(authData));
              
              // Retry original request with new token
              originalRequest.headers.Authorization = `Bearer ${refreshResponse.data.token}`;
              return api(originalRequest);
            }
          }
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        console.error('Token refresh failed:', refreshError);
      }
      
      // If refresh failed or no token, only force logout for auth-critical requests.
      // Avoid logging out the whole UI because some non-critical endpoint returned 401.
      if (isAuthEndpoint) {
        localStorage.removeItem('auth-storage');
        window.location.href = '/login';
      }
    }

    // Targeted logging for persistent 404s on platform-admin routing endpoints.
    try {
      const status = error.response?.status;
      const url = (originalRequest?.url || '').toString();
      if (status === 404 && (url.includes('/platform-admin/ha/sites') || url.includes('/api/platform-admin/ha/sites'))) {
        const baseURL = (originalRequest?.baseURL || '').toString();
        const computed = (baseURL && url && !url.startsWith('http')) ? `${baseURL}${url}` : url;
        // eslint-disable-next-line no-console
        console.warn('API 404 (platform-admin ha/sites)', {
          baseURL,
          url,
          computed,
          method: originalRequest?.method,
          response: error.response?.data,
        });
      }
    } catch {
      // ignore
    }
    
    return Promise.reject(error);
  }
);

export default api;
