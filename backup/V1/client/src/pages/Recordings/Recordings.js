import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { 
  FiPlay, 
  FiPause, 
  FiSquare, 
  FiDownload, 
  FiTrash2, 
  FiSearch,
  FiFilter,
  FiCalendar,
  FiClock,
  FiUsers,
  FiMic,
  FiMicOff,
  FiMail,
  FiEye,
  FiEyeOff,
  FiRefreshCw,
  FiChevronDown,
  FiChevronUp
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { 
  Card, 
  Button, 
  Input, 
  Select, 
  Badge, 
  Flex, 
  Grid, 
  Spacer,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  LoadingSpinner
} from '../../styles/GlobalStyle';
import toast from 'react-hot-toast';
import axios from 'axios';
import { format, formatDistanceToNow } from 'date-fns';

const RecordingsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.lg};
`;

const RecordingsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.lg};
`;

const RecordingsTitle = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const RecordingsActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
`;

const SearchContainer = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  margin-bottom: ${props => props.theme.spacing.lg};
  align-items: center;
`;

const FilterContainer = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  align-items: center;
`;

const RecordingsGrid = styled(Grid)`
  gap: ${props => props.theme.spacing.md};
`;

const RecordingCard = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
  transition: all 0.2s ease;
  cursor: pointer;
  border: 1px solid ${props => props.theme.colors.border};

  &:hover {
    box-shadow: ${props => props.theme.shadows.md};
    transform: translateY(-2px);
  }
`;

const RecordingHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.md};
`;

const RecordingTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const RecordingStatus = styled(Badge)`
  font-size: 0.75rem;
`;

const RecordingInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
  margin-bottom: ${props => props.theme.spacing.md};
`;

const RecordingDetail = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const RecordingDetailIcon = styled.div`
  font-size: 1rem;
  color: ${props => props.theme.colors.accent};
`;

const RecordingDetailText = styled.span`
  font-weight: 500;
`;

const RecordingActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  margin-top: ${props => props.theme.spacing.md};
`;

const RecordingActionButton = styled(Button)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.theme.spacing.xs};
  font-size: 0.875rem;
`;

const AudioPlayer = styled.div`
  background: ${props => props.theme.colors.background};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: ${props => props.theme.spacing.md};
  margin: ${props => props.theme.spacing.md} 0;
`;

const AudioControls = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const PlayButton = styled(Button)`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
`;

const ProgressBar = styled.div`
  flex: 1;
  height: 4px;
  background: ${props => props.theme.colors.border};
  border-radius: 2px;
  position: relative;
  cursor: pointer;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: ${props => props.theme.colors.accent};
  border-radius: 2px;
  width: ${props => props.progress}%;
  transition: width 0.1s ease;
`;

const TimeDisplay = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
  font-weight: 500;
  min-width: 80px;
  text-align: center;
`;

const VolumeControl = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const VolumeSlider = styled.input`
  width: 80px;
  height: 4px;
  background: ${props => props.theme.colors.border};
  border-radius: 2px;
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: ${props => props.theme.colors.accent};
    border-radius: 50%;
    cursor: pointer;
  }
`;

const ParticipantsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${props => props.theme.spacing.xs};
  margin-top: ${props => props.theme.spacing.sm};
`;

const ParticipantBadge = styled(Badge)`
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.xs};
`;

const ExpandableSection = styled.div`
  margin-top: ${props => props.theme.spacing.md};
  border-top: 1px solid ${props => props.theme.colors.border};
  padding-top: ${props => props.theme.spacing.md};
`;

const ExpandableHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: ${props => props.theme.spacing.sm};
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.background};
  transition: background-color 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.border};
  }
`;

const ExpandableContent = styled(motion.div)`
  margin-top: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.md};
  background: ${props => props.theme.colors.background};
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => props.theme.colors.border};
`;

const MetadataGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${props => props.theme.spacing.sm};
`;

const MetadataItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.xs};
`;

const MetadataLabel = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
`;

const MetadataValue = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text};
  font-weight: 500;
`;

const Recordings = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [expandedRecordings, setExpandedRecordings] = useState(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  
  const queryClient = useQueryClient();

  // Fetch recordings
  const { data: recordings, isLoading: recordingsLoading, refetch } = useQuery(
    ['recordings', searchTerm, filterGroup],
    async () => {
      const response = await axios.get('/api/recordings/completed');
      // normalize shape
      const list = response.data?.recordings || [];
      // client-side filter
      const filtered = list.filter(r => {
        const matchesSearch = !searchTerm
          || r.id?.toLowerCase?.().includes(searchTerm.toLowerCase())
          || r.groupId?.toLowerCase?.().includes(searchTerm.toLowerCase());
        const matchesGroup = (filterGroup === 'all') || (String(r.groupId || '') === String(filterGroup));
        return matchesSearch && matchesGroup;
      });
      return filtered;
    }
  );

  // Fetch groups for filter
  const { data: groups } = useQuery(
    'groups',
    async () => {
      const response = await axios.get('/api/groups');
      return response.data;
    }
  );

  // Delete recording mutation
  const deleteRecordingMutation = useMutation(
    async (recordingId) => {
      const response = await axios.delete(`/api/recordings/${recordingId}`);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('recordings');
        toast.success('Recording deleted successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to delete recording');
      }
    }
  );

  // Send email mutation
  const sendEmailMutation = useMutation(
    async ({ recordingId, recipients }) => {
      const response = await axios.post(`/api/recordings/send-email/${recordingId}`, {
        recipients
      });
      return response.data;
    },
    {
      onSuccess: () => {
        toast.success('Email sent successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to send email');
      }
    }
  );

  const handlePlayRecording = (recording) => {
    setSelectedRecording(recording);
    setShowPlayer(true);
    setIsPlaying(true);
  };

  const handleStopRecording = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleDownloadRecording = async (recording) => {
    try {
      const response = await axios.get(`/api/recordings/download/${recording.id}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${recording.id}.wav`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Recording downloaded');
    } catch (error) {
      toast.error('Failed to download recording');
    }
  };

  const handleDeleteRecording = (recording) => {
    if (window.confirm('Are you sure you want to delete this recording?')) {
      deleteRecordingMutation.mutate(recording.id);
    }
  };

  const handleSendEmail = (recording) => {
    const recipients = prompt('Enter email addresses (comma-separated):');
    if (recipients) {
      sendEmailMutation.mutate({
        recordingId: recording.id,
        recipients: recipients.split(',').map(email => email.trim())
      });
    }
  };

  const toggleExpanded = (recordingId) => {
    const newExpanded = new Set(expandedRecordings);
    if (newExpanded.has(recordingId)) {
      newExpanded.delete(recordingId);
    } else {
      newExpanded.add(recordingId);
    }
    setExpandedRecordings(newExpanded);
  };

  const formatDuration = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (recordingsLoading) {
    return (
      <RecordingsContainer>
        <Flex justify="center" align="center" style={{ height: '400px' }}>
          <LoadingSpinner size="48px" />
        </Flex>
      </RecordingsContainer>
    );
  }

  return (
    <RecordingsContainer>
      <RecordingsHeader>
        <RecordingsTitle>
          <FiMic />
          Recordings
        </RecordingsTitle>
        <RecordingsActions>
          <Button variant="secondary" onClick={() => refetch()}>
            <FiRefreshCw />
            Refresh
          </Button>
        </RecordingsActions>
      </RecordingsHeader>

      <SearchContainer>
        <Input
          placeholder="Search recordings..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1 }}
        />
        <FilterContainer>
          <Select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
          >
            <option value="all">All Groups</option>
            {groups?.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => refetch()}>
            <FiFilter />
            Filter
          </Button>
        </FilterContainer>
      </SearchContainer>

      <RecordingsGrid columns={1}>
        {recordings?.map((recording) => (
          <RecordingCard key={recording.id}>
            <RecordingHeader>
              <RecordingTitle>
                <FiMic />
                {recording.id}
              </RecordingTitle>
              <RecordingStatus variant={'info'}>
                Completed
              </RecordingStatus>
            </RecordingHeader>

            <RecordingInfo>
              <RecordingDetail>
                <RecordingDetailIcon>
                  <FiUsers />
                </RecordingDetailIcon>
                <RecordingDetailText>
                  Group: {recording.groupId}
                </RecordingDetailText>
              </RecordingDetail>
              
              <RecordingDetail>
                <RecordingDetailIcon>
                  <FiClock />
                </RecordingDetailIcon>
                <RecordingDetailText>
                  Duration: {formatDuration(recording.duration || 0)}
                </RecordingDetailText>
              </RecordingDetail>
              
              <RecordingDetail>
                <RecordingDetailIcon>
                  <FiCalendar />
                </RecordingDetailIcon>
                <RecordingDetailText>
                  Started: {format(new Date(recording.startTime), 'MMM dd, yyyy HH:mm')}
                </RecordingDetailText>
              </RecordingDetail>

              {recording.participants && recording.participants.length > 0 && (
                <ParticipantsList>
                  {recording.participants.map((participant, index) => (
                    <ParticipantBadge key={index} variant="info">
                      <FiUsers />
                      {participant}
                    </ParticipantBadge>
                  ))}
                </ParticipantsList>
              )}
            </RecordingInfo>

            <RecordingActions>
              <RecordingActionButton
                variant="primary"
                onClick={() => handlePlayRecording(recording)}
              >
                <FiPlay />
                Play
              </RecordingActionButton>
              
              <RecordingActionButton
                variant="secondary"
                onClick={() => handleDownloadRecording(recording)}
              >
                <FiDownload />
                Download
              </RecordingActionButton>
              
              <RecordingActionButton
                variant="secondary"
                onClick={() => handleSendEmail(recording)}
              >
                <FiMail />
                Email
              </RecordingActionButton>
              
              <RecordingActionButton
                variant="danger"
                onClick={() => handleDeleteRecording(recording)}
              >
                <FiTrash2 />
                Delete
              </RecordingActionButton>
            </RecordingActions>

            <ExpandableSection>
              <ExpandableHeader onClick={() => toggleExpanded(recording.id)}>
                <span>Recording Details</span>
                {expandedRecordings.has(recording.id) ? <FiChevronUp /> : <FiChevronDown />}
              </ExpandableHeader>
              
              {expandedRecordings.has(recording.id) && (
                <ExpandableContent
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <MetadataGrid>
                    <MetadataItem>
                      <MetadataLabel>Recording ID</MetadataLabel>
                      <MetadataValue>{recording.id}</MetadataValue>
                    </MetadataItem>
                    
                    <MetadataItem>
                      <MetadataLabel>Session ID</MetadataLabel>
                      <MetadataValue>{recording.sessionId}</MetadataValue>
                    </MetadataItem>
                    
                    <MetadataItem>
                      <MetadataLabel>User ID</MetadataLabel>
                      <MetadataValue>{recording.userId}</MetadataValue>
                    </MetadataItem>
                    
                    <MetadataItem>
                      <MetadataLabel>Start Time</MetadataLabel>
                      <MetadataValue>
                        {format(new Date(recording.startTime), 'yyyy-MM-dd HH:mm:ss')}
                      </MetadataValue>
                    </MetadataItem>
                    
                    <MetadataItem>
                      <MetadataLabel>End Time</MetadataLabel>
                      <MetadataValue>
                        {recording.endTime ? format(new Date(recording.endTime), 'yyyy-MM-dd HH:mm:ss') : 'N/A'}
                      </MetadataValue>
                    </MetadataItem>
                    
                    <MetadataItem>
                      <MetadataLabel>Retention Policy</MetadataLabel>
                      <MetadataValue>
                        {recording.retentionPolicy?.retentionDays || 'N/A'} days
                      </MetadataValue>
                    </MetadataItem>
                    
                    <MetadataItem>
                      <MetadataLabel>Email Sent</MetadataLabel>
                      <MetadataValue>
                        {recording.emailSent ? 'Yes' : 'No'}
                      </MetadataValue>
                    </MetadataItem>
                    
                    <MetadataItem>
                      <MetadataLabel>Encryption</MetadataLabel>
                      <MetadataValue>
                        {recording.metadata?.encryption ? 'Enabled' : 'Disabled'}
                      </MetadataValue>
                    </MetadataItem>
                  </MetadataGrid>
                </ExpandableContent>
              )}
            </ExpandableSection>
          </RecordingCard>
        ))}
      </RecordingsGrid>

      {/* Audio Player Modal */}
      {showPlayer && selectedRecording && (
        <Modal>
          <ModalContent style={{ maxWidth: '600px' }}>
            <ModalHeader>
              <h3>Audio Player - {selectedRecording.id}</h3>
              <Button variant="secondary" onClick={() => setShowPlayer(false)}>
                <FiSquare />
              </Button>
            </ModalHeader>
            <ModalBody>
              <AudioPlayer>
                <AudioControls>
                  <PlayButton
                    variant={isPlaying ? 'danger' : 'primary'}
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? <FiPause /> : <FiPlay />}
                  </PlayButton>
                  
                  <ProgressBar>
                    <ProgressFill progress={(currentTime / duration) * 100} />
                  </ProgressBar>
                  
                  <TimeDisplay>
                    {formatDuration(currentTime)} / {formatDuration(duration)}
                  </TimeDisplay>
                  
                  <VolumeControl>
                    <FiMic />
                    <VolumeSlider
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={volume}
                      onChange={(e) => setVolume(e.target.value)}
                    />
                  </VolumeControl>
                </AudioControls>
              </AudioPlayer>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setShowPlayer(false)}>
                Close
              </Button>
              <Button variant="primary" onClick={() => handleDownloadRecording(selectedRecording)}>
                <FiDownload />
                Download
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </RecordingsContainer>
  );
};

export default Recordings;
