import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { FiVideo, FiLink, FiX, FiCheck, FiRefreshCw } from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
`;

const Section = styled.div`
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 1.5rem;
`;

const SectionTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Button = styled.button`
  padding: 0.75rem 1.5rem;
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: none;
  
  ${props => props.$primary ? `
    background: ${props.theme.colors.gradient};
    color: white;
  ` : `
    background: ${props.theme.colors.surfaceElevated};
    color: ${props.theme.colors.text};
    border: 1px solid ${props.theme.colors.border};
  `}
  
  &:hover {
    transform: translateY(-1px);
    box-shadow: ${props => props.theme.shadows.md};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const StatusBadge = styled.span`
  padding: 0.25rem 0.75rem;
  border-radius: ${props => props.theme.borderRadius.full};
  font-size: 0.75rem;
  font-weight: 500;
  background: ${props => props.$connected ? '#10b981' : '#6b7280'};
  color: #ffffff;
`;

const MeetingList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
`;

const MeetingItem = styled.div`
  padding: 1rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const MeetingInfo = styled.div`
  flex: 1;
`;

const MeetingTitle = styled.div`
  font-weight: 500;
  color: ${props => props.theme.colors.text};
  margin-bottom: 0.25rem;
`;

const MeetingMeta = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const TeamsTab = () => {
  const queryClient = useQueryClient();

  // Get Teams auth status
  const { data: authStatus, isLoading: loadingStatus } = useQuery(
    'teamsAuthStatus',
    async () => {
      const res = await api.get('/api/teams/auth/status');
      return res.data;
    }
  );

  // Get Teams meetings
  const { data: meetingsData, isLoading: loadingMeetings } = useQuery(
    'teamsMeetings',
    async () => {
      const res = await api.get('/api/teams/meetings');
      return res.data;
    },
    {
      enabled: authStatus?.connected === true
    }
  );

  // Connect Teams mutation
  const connectMutation = useMutation(
    async () => {
      const res = await api.get('/api/teams/auth/url');
      window.location.href = res.data.authUrl;
    },
    {
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to initiate Teams connection');
      }
    }
  );

  // Disconnect Teams mutation
  const disconnectMutation = useMutation(
    async () => {
      await api.post('/api/teams/auth/revoke');
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('teamsAuthStatus');
        queryClient.invalidateQueries('teamsMeetings');
        toast.success('Microsoft Teams disconnected successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to disconnect Teams');
      }
    }
  );

  // Create meeting mutation
  const createMeetingMutation = useMutation(
    async (meetingData) => {
      const res = await api.post('/api/teams/meetings', meetingData);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('teamsMeetings');
        toast.success('Teams meeting created successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create Teams meeting');
      }
    }
  );

  const handleConnect = () => {
    connectMutation.mutate();
  };

  const handleDisconnect = () => {
    if (window.confirm('Are you sure you want to disconnect from Microsoft Teams?')) {
      disconnectMutation.mutate();
    }
  };

  const handleCreateMeeting = () => {
    createMeetingMutation.mutate({
      subject: 'New Teams Meeting',
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString()
    });
  };

  return (
    <Container>
      <Section>
        <SectionTitle>
          <FiVideo />
          Microsoft Teams Integration
        </SectionTitle>
        
        {loadingStatus ? (
          <div>Loading...</div>
        ) : authStatus?.connected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <StatusBadge $connected={true}>Connected</StatusBadge>
              {authStatus.profile && (
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {authStatus.profile.displayName || authStatus.profile.mail}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button onClick={handleDisconnect}>
                <FiX />
                Disconnect
              </Button>
              <Button $primary onClick={handleCreateMeeting}>
                <FiVideo />
                Create Meeting
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              Connect your Microsoft Teams account to create and manage meetings
            </p>
            <Button $primary onClick={handleConnect}>
              <FiLink />
              Connect Microsoft Teams Account
            </Button>
          </div>
        )}
      </Section>

      {authStatus?.connected && (
        <Section>
          <SectionTitle>
            <FiVideo />
            My Teams Meetings
          </SectionTitle>
          
          {loadingMeetings ? (
            <div>Loading meetings...</div>
          ) : meetingsData?.meetings?.length > 0 ? (
            <MeetingList>
              {meetingsData.meetings.map((meeting) => (
                <MeetingItem key={meeting.id}>
                  <MeetingInfo>
                    <MeetingTitle>{meeting.subject || 'Untitled Meeting'}</MeetingTitle>
                    <MeetingMeta>
                      {meeting.startTime && new Date(meeting.startTime).toLocaleString()}
                    </MeetingMeta>
                  </MeetingInfo>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      onClick={() => window.open(meeting.joinUrl || meeting.joinWebUrl, '_blank')}
                      title="Join Meeting"
                    >
                      <FiLink />
                      Join
                    </Button>
                  </div>
                </MeetingItem>
              ))}
            </MeetingList>
          ) : (
            <div style={{ color: 'var(--text-secondary)' }}>No meetings found</div>
          )}
        </Section>
      )}
    </Container>
  );
};

export default TeamsTab;

