import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from 'styled-components';
import { GlobalStyle, theme } from './styles/GlobalStyle';
import { useAuthStore } from './stores/authStore';
import { useWebRTCStore } from './stores/webrtcStore';

// Components
import Login from './pages/Login/Login';
import UserIntercom from './pages/UserIntercom/UserIntercom';
import Intercom from './pages/Intercom/Intercom';
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
import Settings from './pages/Settings/Settings';

// Hooks
import { useWebRTC } from './hooks/useWebRTC';
import { useSocket } from './hooks/useSocket';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

function App() {
  const { isAuthenticated, user } = useAuthStore();
  const { initializeWebRTC } = useWebRTCStore();
  const { connectSocket, disconnectSocket } = useSocket();
  const { initializeMediaSoup } = useWebRTC();
  const initializedRef = React.useRef(false);


  // Debug authentication state
  React.useEffect(() => {
    console.log('🔍 App: Authentication state changed', { isAuthenticated, user: user?.username });
  }, [isAuthenticated, user]);

  React.useEffect(() => {
    if (isAuthenticated && !initializedRef.current) {
      // Initialize WebRTC and socket connection only once
      initializedRef.current = true;
      
      // Initialize WebRTC asynchronously without blocking the app
      initializeMediaSoup().catch(error => {
        console.warn('WebRTC initialization failed, continuing without it:', error);
      });
      
      connectSocket();
      
      return () => {
        disconnectSocket();
        initializedRef.current = false;
      };
    }
  }, [isAuthenticated, connectSocket, disconnectSocket, initializeMediaSoup]);

  const isAdmin = user?.role === 'admin';

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <Router>
          <Routes>
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
            <Route
              path="/"
              element={
                isAuthenticated
                  ? (isAdmin ? <AdminDashboard /> : <Intercom />)
                  : <Login />
              }
            />
            <Route path="/intercom" element={isAuthenticated ? <Intercom /> : <Login />} />
            <Route path="/legacy" element={isAuthenticated ? <UserIntercom /> : <Login />} />
            <Route path="/settings" element={isAuthenticated ? <Settings /> : <Login />} />
            <Route path="*" element={isAuthenticated ? (isAdmin ? <AdminDashboard /> : <Intercom />) : <Login />} />
          </Routes>
        </Router>
        <Toaster position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
