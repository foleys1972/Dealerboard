import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../utils/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      isAuthenticated: false,
      user: null,
      token: null,
      loading: false,
      error: null,

      // Actions
      login: async (credentials) => {
        console.log('🔐 AuthStore: Starting login process', credentials);
        set({ loading: true, error: null });
        
        try {
          console.log('🌐 AuthStore: Making API call to /api/auth/login');
          const response = await api.post('/api/auth/login', credentials);
          console.log('✅ AuthStore: API response received', response.data);
          const { user, token } = response.data;
          
          set({
            isAuthenticated: true,
            user,
            token,
            loading: false,
            error: null,
          });
          
          console.log('🎉 AuthStore: Login successful, state updated');
          return { success: true, user };
        } catch (error) {
          console.error('❌ AuthStore: Login failed', error);
          const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Login failed - server may be offline';
          set({
            isAuthenticated: false,
            user: null,
            token: null,
            loading: false,
            error: errorMessage,
          });
          return { success: false, error: errorMessage };
        }
      },

      logout: () => {
        set({
          isAuthenticated: false,
          user: null,
          token: null,
          loading: false,
          error: null,
        });
      },

      updateUser: (userData) => {
        set((state) => ({
          user: { ...state.user, ...userData },
        }));
      },

      clearError: () => {
        set({ error: null });
      },

      // Check if user has permission
      hasPermission: (permission) => {
        const { user } = get();
        if (!user || !user.permissions) return false;
        return user.permissions.includes(permission);
      },

      // Check if user has role
      hasRole: (role) => {
        const { user } = get();
        if (!user || !user.roles) return false;
        return user.roles.includes(role);
      },

      // Get user's groups
      getUserGroups: () => {
        const { user } = get();
        return user?.groups || [];
      },

      // Check if user is in group
      isInGroup: (groupId) => {
        const { user } = get();
        if (!user || !user.groups) return false;
        return user.groups.some(group => group.id === groupId);
      },

      // Refresh user data
      refreshUser: async () => {
        const { token } = get();
        if (!token) return;

        try {
          const response = await api.get('/api/auth/me');
          const { user } = response.data;
          
          set({ user });
          return { success: true, user };
        } catch (error) {
          console.error('Failed to refresh user data:', error);
          return { success: false, error: error.message };
        }
      },

      // Refresh token
      refreshToken: async () => {
        const { token } = get();
        if (!token) {
          return { success: false, error: 'No token to refresh' };
        }

        try {
          const response = await api.post('/api/auth/refresh', {}, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          
          const { token: newToken, user } = response.data;
          
          set({
            token: newToken,
            user: user || get().user,
            isAuthenticated: true
          });
          
          return { success: true, token: newToken, user };
        } catch (error) {
          console.error('Failed to refresh token:', error);
          // If refresh fails, token might be expired - clear auth state
          if (error.response?.status === 401 || error.response?.status === 403) {
            set({
              isAuthenticated: false,
              user: null,
              token: null,
            });
            return { success: false, error: 'Token expired. Please login again.' };
          }
          return { success: false, error: error.response?.data?.error || error.message || 'Failed to refresh token' };
        }
      },

      // Initialize auth from stored token
      initializeAuth: async () => {
        const { token } = get();
        if (!token) return;

        try {
          // Verify token and get user data
          const response = await api.get('/api/auth/me');
          const { user } = response.data;
          
          set({
            isAuthenticated: true,
            user,
          });
          
          return { success: true, user };
        } catch (error) {
          // Token is invalid, clear auth state
          set({
            isAuthenticated: false,
            user: null,
            token: null,
          });
          return { success: false, error: 'Token expired' };
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export { useAuthStore };
