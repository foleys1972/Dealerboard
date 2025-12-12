import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { 
  FiWifi, 
  FiWifiOff, 
  FiServer, 
  FiUsers, 
  FiMessageCircle,
  FiShield,
  FiRefreshCw,
  FiAlertCircle,
  FiCheckCircle,
  FiActivity
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Card, Button, Badge, Flex, Spacer } from '../../styles/GlobalStyle';
import toast from 'react-hot-toast';
import axios from 'axios';

const MatrixStatusContainer = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
`;

const StatusHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.md};
`;

const StatusTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const StatusIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const StatusDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.isConnected ? '#00ff88' : '#ff4444'};
  animation: ${props => props.isConnected ? 'pulse 1s infinite' : 'none'};
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

const StatusText = styled.span`
  font-size: 0.875rem;
  color: ${props => props.isConnected ? '#00ff88' : '#ff4444'};
  font-weight: 600;
`;

const StatusDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
`;

const StatusItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${props => props.theme.spacing.sm};
  background: ${props => props.theme.colors.background};
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => props.theme.colors.border};
`;

const StatusItemLabel = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const StatusItemValue = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text};
  font-weight: 600;
`;

const StatusActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  margin-top: ${props => props.theme.spacing.md};
`;

const StatusError = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm};
  background: #ff444420;
  border: 1px solid #ff444440;
  border-radius: ${props => props.theme.borderRadius.md};
  color: #ff4444;
  font-size: 0.875rem;
  margin-top: ${props => props.theme.spacing.sm};
`;

const StatusSuccess = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm};
  background: #00ff8820;
  border: 1px solid #00ff8840;
  border-radius: ${props => props.theme.borderRadius.md};
  color: #00ff88;
  font-size: 0.875rem;
  margin-top: ${props => props.theme.spacing.sm};
`;

const MatrixStatus = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // Fetch Matrix status
  const { data: status, isLoading, error, refetch } = useQuery(
    'matrix-status',
    async () => {
      const response = await axios.get('/api/matrix/status');
      return response.data;
    },
    {
      refetchInterval: 30000, // Refresh every 30 seconds
      retry: 3,
      retryDelay: 1000,
    }
  );

  // Fetch federation info
  const { data: federationInfo } = useQuery(
    'matrix-federation',
    async () => {
      const response = await axios.get('/api/matrix/federation');
      return response.data;
    },
    {
      refetchInterval: 60000, // Refresh every minute
    }
  );

  // Test Matrix connection
  const testConnectionMutation = useMutation(
    async () => {
      const response = await axios.post('/api/matrix/test');
      return response.data;
    },
    {
      onSuccess: (data) => {
        toast.success('Matrix connection test successful');
        queryClient.invalidateQueries('matrix-status');
      },
      onError: (error) => {
        toast.error('Matrix connection test failed');
      }
    }
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      await queryClient.invalidateQueries('matrix-federation');
      toast.success('Matrix status refreshed');
    } catch (error) {
      toast.error('Failed to refresh Matrix status');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
  };

  if (isLoading) {
    return (
      <MatrixStatusContainer>
        <StatusHeader>
          <StatusTitle>
            <FiServer />
            Matrix Federation
          </StatusTitle>
          <StatusIndicator>
            <StatusDot isConnected={false} />
            <StatusText isConnected={false}>Loading...</StatusText>
          </StatusIndicator>
        </StatusHeader>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <FiRefreshCw className="animate-spin" />
          <div style={{ marginTop: '0.5rem', color: '#666' }}>
            Loading Matrix status...
          </div>
        </div>
      </MatrixStatusContainer>
    );
  }

  if (error) {
    return (
      <MatrixStatusContainer>
        <StatusHeader>
          <StatusTitle>
            <FiServer />
            Matrix Federation
          </StatusTitle>
          <StatusIndicator>
            <StatusDot isConnected={false} />
            <StatusText isConnected={false}>Error</StatusText>
          </StatusIndicator>
        </StatusHeader>
        <StatusError>
          <FiAlertCircle />
          Failed to load Matrix status
        </StatusError>
        <StatusActions>
          <Button variant="secondary" onClick={handleRefresh}>
            <FiRefreshCw />
            Retry
          </Button>
        </StatusActions>
      </MatrixStatusContainer>
    );
  }

  return (
    <MatrixStatusContainer>
      <StatusHeader>
        <StatusTitle>
          <FiServer />
          Matrix Federation
        </StatusTitle>
        <StatusIndicator>
          <StatusDot isConnected={status?.isConnected} />
          <StatusText isConnected={status?.isConnected}>
            {status?.isConnected ? 'Connected' : 'Disconnected'}
          </StatusText>
        </StatusIndicator>
      </StatusHeader>

      <StatusDetails>
        <StatusItem>
          <StatusItemLabel>
            <FiWifi />
            Connection
          </StatusItemLabel>
          <StatusItemValue>
            {status?.isConnected ? 'Active' : 'Inactive'}
          </StatusItemValue>
        </StatusItem>

        <StatusItem>
          <StatusItemLabel>
            <FiUsers />
            Rooms
          </StatusItemLabel>
          <StatusItemValue>
            {status?.roomCount || 0}
          </StatusItemValue>
        </StatusItem>

        <StatusItem>
          <StatusItemLabel>
            <FiShield />
            Server
          </StatusItemLabel>
          <StatusItemValue>
            {status?.config?.serverName || 'Unknown'}
          </StatusItemValue>
        </StatusItem>

        <StatusItem>
          <StatusItemLabel>
            <FiActivity />
            Federation
          </StatusItemLabel>
          <StatusItemValue>
            {federationInfo?.federationEnabled ? 'Enabled' : 'Disabled'}
          </StatusItemValue>
        </StatusItem>

        {status?.userId && (
          <StatusItem>
            <StatusItemLabel>
              <FiMessageCircle />
              User ID
            </StatusItemLabel>
            <StatusItemValue>
              {status.userId}
            </StatusItemValue>
          </StatusItem>
        )}
      </StatusDetails>

      {status?.isConnected && (
        <StatusSuccess>
          <FiCheckCircle />
          Matrix federation is active and connected
        </StatusSuccess>
      )}

      {!status?.isConnected && (
        <StatusError>
          <FiAlertCircle />
          Matrix federation is disconnected
        </StatusError>
      )}

      <StatusActions>
        <Button 
          variant="secondary" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <FiRefreshCw className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </Button>
        
        <Button 
          variant="primary" 
          onClick={handleTestConnection}
          disabled={testConnectionMutation.isLoading}
        >
          Test Connection
        </Button>
      </StatusActions>
    </MatrixStatusContainer>
  );
};

export default MatrixStatus;
