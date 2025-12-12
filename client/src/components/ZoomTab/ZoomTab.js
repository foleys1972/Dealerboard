import React from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { FiVideo, FiLink, FiX, FiSettings } from 'react-icons/fi';
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

const InfoText = styled.p`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
  margin-bottom: 1rem;
`;

const ZoomTab = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Get Zoom auth status
  const { data: authStatus, isLoading: loadingStatus } = useQuery(
    'zoomAuthStatus',
    async () => {
      const res = await api.get('/api/zoom/auth/status');
      return res.data;
    }
  );

  // Get Zoom meetings
  const { data: meetingsData, isLoading: loadingMeetings } = useQuery(
    'zoomMeetings',
    async () => {
      const res = await api.get('/api/zoom/meetings');
      return res.data;
    },
    {
      enabled: authStatus?.connected === true
    }
  );

  // Disconnect Zoom mutation
  const disconnectMutation = useMutation(
    async () => {
      await api.post('/api/zoom/auth/revoke');
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('zoomAuthStatus');
        queryClient.invalidateQueries('zoomMeetings');
        toast.success('Zoom disconnected successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to disconnect Zoom');
      }
    }
  );

  // Create meeting mutation
  const createMeetingMutation = useMutation(
    async (meetingData) => {
      const res = await api.post('/api/zoom/meetings', meetingData);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('zoomMeetings');
        toast.success('Zoom meeting created successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create Zoom meeting');
      }
    }
  );

  const handleDisconnect = () => {
    if (window.confirm('Are you sure you want to disconnect from Zoom?')) {
      disconnectMutation.mutate();
    }
  };

  const handleCreateMeeting = () => {
    createMeetingMutation.mutate({
      subject: 'New Zoom Meeting',
      startTime: new Date().toISOString(),
      duration: 60
    });
  };

  return (
    <Container>
      <Section>
        <SectionTitle>
          <FiVideo />
          Zoom Video Conference
        </SectionTitle>
        
        {loadingStatus ? (
          <div>Loading...</div>
        ) : authStatus?.connected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <StatusBadge $connected={true}>Connected</StatusBadge>
              {authStatus.profile && (
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {authStatus.profile.display_name || authStatus.profile.email}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
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
            <InfoText>
              Please configure your Zoom login credentials in Settings to connect your Zoom account.
            </InfoText>
            <Button $primary onClick={() => navigate('/settings?tab=zoom')}>
              <FiSettings />
              Go to Settings
            </Button>
          </div>
        )}
      </Section>

      {authStatus?.connected && (
        <>
          <Section>
            <SectionTitle>
              <FiVideo />
              Active Meeting
            </SectionTitle>
            
            <div style={{ 
              width: '100%', 
              height: '600px', 
              background: '#1a1a1a', 
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border)',
              position: 'relative'
            }}>
              {loadingMeetings ? (
                <div style={{ color: 'var(--text-secondary)' }}>Loading Zoom conference...</div>
              ) : meetingsData?.meetings?.length > 0 ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {/* Zoom Video Conference Container */}
                  <div style={{ 
                    flex: 1, 
                    width: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    background: '#000'
                  }}>
                    <iframe
                      src={meetingsData.meetings[0]?.joinUrl || ''}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        borderRadius: '8px'
                      }}
                      allow="microphone; camera; fullscreen"
                      title="Zoom Video Conference"
                    />
                  </div>
                  
                  {/* Meeting Controls */}
                  <div style={{ 
                    padding: '1rem', 
                    background: 'var(--surface)', 
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <MeetingTitle>{meetingsData.meetings[0]?.topic || 'Active Meeting'}</MeetingTitle>
                      <MeetingMeta>
                        {meetingsData.meetings[0]?.startTime && new Date(meetingsData.meetings[0].startTime).toLocaleString()}
                      </MeetingMeta>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button
                        onClick={() => window.open(meetingsData.meetings[0]?.joinUrl, '_blank')}
                        title="Open in New Window"
                      >
                        <FiLink />
                        Open Full Screen
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  gap: '1rem',
                  color: 'var(--text-secondary)'
                }}>
                  <FiVideo style={{ fontSize: '3rem', opacity: 0.5 }} />
                  <div>No active meeting</div>
                  <Button $primary onClick={handleCreateMeeting}>
                    <FiVideo />
                    Create Meeting
                  </Button>
                </div>
              )}
            </div>
          </Section>

          <Section>
            <SectionTitle>
              <FiVideo />
              My Zoom Meetings
            </SectionTitle>
            
            {loadingMeetings ? (
              <div>Loading meetings...</div>
            ) : meetingsData?.meetings?.length > 0 ? (
              <MeetingList>
                {meetingsData.meetings.map((meeting) => (
                  <MeetingItem key={meeting.id}>
                    <MeetingInfo>
                      <MeetingTitle>{meeting.topic || 'Untitled Meeting'}</MeetingTitle>
                      <MeetingMeta>
                        {meeting.startTime && new Date(meeting.startTime).toLocaleString()}
                      </MeetingMeta>
                    </MeetingInfo>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button
                        onClick={() => window.open(meeting.joinUrl, '_blank')}
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
        </>
      )}
    </Container>
  );
};

export default ZoomTab;
