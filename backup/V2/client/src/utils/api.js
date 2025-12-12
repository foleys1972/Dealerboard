import axios from 'axios';

// Configure axios with base URL
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
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

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
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
            // Attempt token refresh
            const refreshResponse = await axios.post(
              `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/auth/refresh`,
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
