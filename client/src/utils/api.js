import axios from 'axios';
import { getClientRoutingService } from '../services/clientRoutingService';

// Configure axios with base URL
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
        config.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      }
    }
    
    // Ensure baseURL is always valid
    if (!config.baseURL || (!config.baseURL.startsWith('http://') && !config.baseURL.startsWith('https://'))) {
      config.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
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
    
    // Handle server errors (5xx) with failover
    if (error.response?.status >= 500 && routingService.isInitialized && !originalRequest._failoverAttempted) {
      originalRequest._failoverAttempted = true;
      
      // Try failover to backup homeserver
      const failoverSuccess = await routingService.forceFailover();
      if (failoverSuccess) {
        // Retry request with failover URL
        originalRequest.baseURL = routingService.getApiBaseUrl();
        return api(originalRequest);
      }
    }
    
    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
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
              : (process.env.REACT_APP_API_URL || 'http://localhost:5000');
            
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
      
      // If refresh failed or no token, clear auth and redirect
      localStorage.removeItem('auth-storage');
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

export default api;
