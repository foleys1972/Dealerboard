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

  // Ultra-aggressive MetaMask blocking
  React.useEffect(() => {
    console.log('🚫 Starting React MetaMask blocking...');
    
    const aggressiveBlockMetaMask = () => {
      // Remove all Web3 objects
      if (window.ethereum) {
        console.log('🚫 React: Removing window.ethereum');
        delete window.ethereum;
      }
      if (window.web3) {
        console.log('🚫 React: Removing window.web3');
        delete window.web3;
      }
      if (window.MetaMask) {
        console.log('🚫 React: Removing window.MetaMask');
        delete window.MetaMask;
      }
      
      // Block MetaMask injection attempts
      const originalDefineProperty = Object.defineProperty;
      Object.defineProperty = function(obj, prop, descriptor) {
        if (prop === 'ethereum' || prop === 'web3' || prop === 'MetaMask') {
          console.log('🚫 React: Blocking MetaMask injection:', prop);
          return obj;
        }
        return originalDefineProperty.call(this, obj, prop, descriptor);
      };
      
      // Permanently block MetaMask objects
      try {
        Object.defineProperty(window, 'ethereum', {
          value: undefined,
          writable: false,
          configurable: false
        });
        Object.defineProperty(window, 'web3', {
          value: undefined,
          writable: false,
          configurable: false
        });
        Object.defineProperty(window, 'MetaMask', {
          value: undefined,
          writable: false,
          configurable: false
        });
      } catch (e) {
        console.log('🚫 React: MetaMask blocking in progress...');
      }
      
      // Block MetaMask events
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type.includes('ethereum') || type.includes('web3') || type.includes('MetaMask')) {
          console.log('🚫 React: Blocking MetaMask event:', type);
          return;
        }
        return originalAddEventListener.call(this, type, listener, options);
      };
      
      // Note: postMessage blocking removed to prevent infinite recursion
      
      console.log('🚫 React: MetaMask blocking system activated');
    };
    
    // Run immediately
    aggressiveBlockMetaMask();
    
    // Set up periodic blocking (reduced frequency to prevent performance issues)
    const interval = setInterval(aggressiveBlockMetaMask, 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

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
                  ? (isAdmin ? <AdminDashboard /> : <UserIntercom />)
                  : <Login />
              }
            />
            <Route path="/settings" element={isAuthenticated ? <Settings /> : <Login />} />
            <Route path="*" element={isAuthenticated ? (isAdmin ? <AdminDashboard /> : <UserIntercom />) : <Login />} />
          </Routes>
        </Router>
        <Toaster position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
