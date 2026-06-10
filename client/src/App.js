import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from 'styled-components';
import { GlobalStyle, theme } from './styles/GlobalStyle';
import { useAuthStore } from './stores/authStore';
import { useWebRTCStore } from './stores/webrtcStore';
import { getClientRoutingService } from './services/clientRoutingService';

// Components
import Login from './pages/Login/Login';
import UserIntercom from './pages/UserIntercom/UserIntercom';
import Intercom from './pages/Intercom/Intercom';
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
import TenantAdminDashboard from './pages/TenantAdminDashboard/TenantAdminDashboard';
import Settings from './pages/Settings/Settings';
import NotFound from './pages/NotFound/NotFound';
import RecordingsPage from './pages/Recordings/RecordingsPage';
import FederationPage from './pages/Federation/FederationPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import WpfMediaEnginePage from './pages/WpfMediaEngine/WpfMediaEnginePage';
import { getDefaultHomePath } from './utils/navigation';

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


  // Validate persisted session on load
  React.useEffect(() => {
    const { initializeAuth } = useAuthStore.getState();
    initializeAuth().catch(() => {
      // initializeAuth clears invalid tokens
    });
  }, []);

  React.useEffect(() => {
    const userKey = user?.id || user?.userId || user?.username;
    if (!isAuthenticated || !userKey) {
      if (initializedRef.current) {
        disconnectSocket();
        initializedRef.current = false;
      }
      return;
    }

    if (initializedRef.current) return;
    initializedRef.current = true;
    
    const routingService = getClientRoutingService();
    routingService.initialize(user).catch(error => {
      console.warn('Client routing initialization failed:', error);
    });
    
    initializeMediaSoup().catch(error => {
      console.warn('WebRTC initialization failed, continuing without it:', error);
    });
    
    connectSocket();
  }, [isAuthenticated, user?.id, user?.userId, user?.username, connectSocket, disconnectSocket, initializeMediaSoup]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <Router>
          <Routes>
            <Route path="/wpf-media-engine" element={<WpfMediaEnginePage />} />
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
            <Route
              path="/"
              element={
                isAuthenticated
                  ? <Navigate to={getDefaultHomePath(user)} replace />
                  : <Login />
              }
            />
            <Route path="/intercom" element={isAuthenticated ? <Intercom /> : <Login />} />
            <Route path="/admin" element={isAuthenticated ? <AdminDashboard /> : <Login />} />
            <Route path="/tenant-admin" element={isAuthenticated ? <TenantAdminDashboard /> : <Login />} />
            <Route path="/legacy" element={isAuthenticated ? <UserIntercom /> : <Login />} />
            <Route path="/settings" element={isAuthenticated ? <Settings /> : <Login />} />
            <Route path="/recordings" element={isAuthenticated ? <RecordingsPage /> : <Login />} />
            <Route path="/federation" element={isAuthenticated ? <FederationPage /> : <Login />} />
            <Route path="/dashboard" element={isAuthenticated ? <DashboardPage /> : <Login />} />
            <Route path="*" element={isAuthenticated ? <NotFound /> : <Login />} />
          </Routes>
        </Router>
        <Toaster position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
