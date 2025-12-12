import React, { useState, useEffect, useMemo } from 'react';
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
  FiRefreshCw,
  FiChevronDown,
  FiChevronUp,
  FiRadio,
  FiPhone,
  FiUser
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
import api from '../../utils/api';
import { format, formatDistanceToNow, parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';

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

const FiltersContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.md};
  margin-bottom: ${props => props.theme.spacing.lg};
  padding: ${props => props.theme.spacing.md};
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => props.theme.colors.border};
`;

const FiltersRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${props => props.theme.spacing.sm};
  align-items: end;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.xs};
`;

const FilterLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const RecordingsGrid = styled(Grid)`
  gap: ${props => props.theme.spacing.md};
`;

const RecordingCard = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
  transition: all 0.2s ease;
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

const EmptyState = styled.div`
  padding: 4rem 2rem;
  text-align: center;
  color: ${props => props.theme.colors.textSecondary};
  
  h3 {
    margin-bottom: ${props => props.theme.spacing.sm};
    color: ${props => props.theme.colors.text};
  }
`;

const CallTypeIcon = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.xs};
  font-size: 0.875rem;
`;

const AudioPlayerContainer = styled.div`
  margin-top: ${props => props.theme.spacing.md};
  padding: ${props => props.theme.spacing.md};
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => props.theme.colors.border};
`;

const AudioControls = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const PlayPauseButton = styled(Button)`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
`;

const ProgressBar = styled.div`
  flex: 1;
  height: 6px;
  background: ${props => props.theme.colors.border};
  border-radius: 3px;
  position: relative;
  cursor: pointer;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: ${props => props.theme.colors.accent};
  border-radius: 3px;
  width: ${props => props.$progress}%;
  transition: width 0.1s ease;
`;

const TimeDisplay = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  font-family: monospace;
  min-width: 80px;
  text-align: center;
`;

const Recordings = () => {
  // Filter input states (not applied until search button clicked)
  const [searchTermInput, setSearchTermInput] = useState('');
  const [filterUserInput, setFilterUserInput] = useState('');
  const [filterDateInput, setFilterDateInput] = useState('');
  const [filterTimeInput, setFilterTimeInput] = useState('');
  const [filterCallTypeInput, setFilterCallTypeInput] = useState('all');
  
  // Applied filter states (used for actual filtering)
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterTime, setFilterTime] = useState('');
  const [filterCallType, setFilterCallType] = useState('all');
  
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [expandedRecordings, setExpandedRecordings] = useState(new Set());
  const [playingRecording, setPlayingRecording] = useState(null);
  const [audioRef, setAudioRef] = useState(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const queryClient = useQueryClient();
  
  // Apply search filters
  const handleSearch = () => {
    setSearchTerm(searchTermInput);
    setFilterUser(filterUserInput);
    setFilterDate(filterDateInput);
    setFilterTime(filterTimeInput);
    setFilterCallType(filterCallTypeInput);
  };
  
  // Clear all filters
  const handleClearFilters = () => {
    setSearchTermInput('');
    setFilterUserInput('');
    setFilterDateInput('');
    setFilterTimeInput('');
    setFilterCallTypeInput('all');
    setSearchTerm('');
    setFilterUser('');
    setFilterDate('');
    setFilterTime('');
    setFilterCallType('all');
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef) {
        try {
          audioRef.pause();
          audioRef.src = '';
          // Clean up blob URLs
          if (audioRef.src && audioRef.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioRef.src);
          }
        } catch (error) {
          console.warn('Error cleaning up audio:', error);
        }
      }
    };
  }, [audioRef]);

  // Fetch recordings
  const { data: recordingsData, isLoading: recordingsLoading, refetch } = useQuery(
    'recordings',
    async () => {
      try {
        const response = await api.get('/api/recordings/completed');
        console.log('📼 API Response:', response.data);
        // Handle both response structures
        const recordings = response.data?.recordings || response.data?.data?.recordings || [];
        console.log('📼 Fetched recordings:', recordings.length, recordings);
        if (recordings.length > 0) {
          console.log('📼 First recording:', recordings[0]);
        }
        return recordings;
      } catch (error) {
        console.error('❌ Failed to fetch recordings:', error);
        toast.error('Failed to load recordings');
        return [];
      }
    },
    {
      refetchInterval: 5000, // Refresh every 5 seconds
    }
  );

  const recordings = recordingsData || [];

  // Fetch users for filter
  const { data: usersData } = useQuery(
    'users',
    async () => {
      try {
        const response = await api.get('/api/auth/users');
        return response.data?.users || response.data || [];
      } catch {
        return [];
      }
    }
  );
  const users = usersData || [];

  // Filter recordings
  const filteredRecordings = useMemo(() => {
    if (!recordings || recordings.length === 0) return [];

    return recordings.filter(recording => {
      // Search term (matches ID, participants, or metadata)
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesId = recording.id?.toLowerCase().includes(searchLower);
        const matchesParticipants = Array.isArray(recording.participants) && 
          recording.participants.some(p => {
            if (typeof p === 'object') {
              return (
                String(p.userId || '').toLowerCase().includes(searchLower) ||
                String(p.userName || '').toLowerCase().includes(searchLower) ||
                String(p.userDisplayName || '').toLowerCase().includes(searchLower) ||
                String(p.userUri || '').toLowerCase().includes(searchLower)
              );
            }
            return String(p).toLowerCase().includes(searchLower);
          });
        const matchesMetadata = JSON.stringify(recording.metadata || {}).toLowerCase().includes(searchLower);
        if (!matchesId && !matchesParticipants && !matchesMetadata) {
          return false;
        }
      }

      // Filter by user (check participants or userId)
      if (filterUser) {
        const userId = String(filterUser);
        const hasUser = Array.isArray(recording.participants) && 
          recording.participants.some(p => {
            if (typeof p === 'object') {
              return String(p.userId || '') === userId;
            }
            return String(p) === userId;
          });
        const isUser = String(recording.userId || recording.metadata?.userId || '') === userId;
        if (!hasUser && !isUser) {
          return false;
        }
      }

      // Filter by date
      if (filterDate) {
        try {
          const filterDateObj = parseISO(filterDate);
          let recordingDate;
          if (recording.startTime) {
            if (typeof recording.startTime === 'string') {
              recordingDate = parseISO(recording.startTime);
            } else if (recording.startTime instanceof Date) {
              recordingDate = recording.startTime;
            } else {
              recordingDate = new Date(recording.startTime);
            }
          } else {
            return false; // No start time, exclude
          }
          
          if (isNaN(recordingDate.getTime())) {
            return false; // Invalid date, exclude
          }
          
          if (!isWithinInterval(recordingDate, {
            start: startOfDay(filterDateObj),
            end: endOfDay(filterDateObj)
          })) {
            return false;
          }
        } catch (e) {
          console.warn('Date filter error:', e, recording.startTime);
          // Invalid date, skip filter (don't exclude) - return true to include
          return true;
        }
      }

      // Filter by time (hour range)
      if (filterTime) {
        try {
          const [startHour, endHour] = filterTime.split('-').map(h => parseInt(h));
          let recordingDate;
          if (recording.startTime) {
            if (typeof recording.startTime === 'string') {
              recordingDate = parseISO(recording.startTime);
            } else if (recording.startTime instanceof Date) {
              recordingDate = recording.startTime;
            } else {
              recordingDate = new Date(recording.startTime);
            }
          } else {
            return false; // No start time, exclude
          }
          
          if (isNaN(recordingDate.getTime())) {
            return false; // Invalid date, exclude
          }
          
          const recordingHour = recordingDate.getHours();
          if (recordingHour < startHour || recordingHour >= endHour) {
            return false;
          }
        } catch (e) {
          console.warn('Time filter error:', e, recording.startTime);
          // Invalid time, skip filter (don't exclude) - return true to include
          return true;
        }
      }

      // Filter by call type
      if (filterCallType !== 'all') {
        const recordingType = recording.type || recording.metadata?.type || 'direct';
        if (recordingType !== filterCallType) {
          return false;
        }
      }

      return true;
    });
  }, [recordings, searchTerm, filterUser, filterDate, filterTime, filterCallType]);

  // Debug: Log filtering results
  useEffect(() => {
    console.log('📊 Recordings filter debug:', {
      total: recordings.length,
      filtered: filteredRecordings.length,
      filters: { searchTerm, filterUser, filterDate, filterTime, filterCallType }
    });
  }, [recordings.length, filteredRecordings.length, searchTerm, filterUser, filterDate, filterTime, filterCallType]);

  // Delete recording mutation
  const deleteRecordingMutation = useMutation(
    async (recordingId) => {
      const response = await api.delete(`/api/recordings/${recordingId}`);
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

  const handlePlayRecording = (recording) => {
    if (playingRecording === recording.id) {
      // Toggle play/pause
      if (audioRef) {
        if (isPlaying) {
          audioRef.pause();
          setIsPlaying(false);
        } else {
          audioRef.play().catch(err => {
            console.error('Failed to play audio:', err);
            toast.error('Failed to play recording');
          });
          setIsPlaying(true);
        }
      }
    } else {
      // Load new recording - stop previous one first
      if (audioRef) {
        audioRef.pause();
        audioRef.src = '';
        if (audioRef.srcObject) {
          URL.revokeObjectURL(audioRef.srcObject);
        }
      }
      
      // Fetch audio with authentication and create blob URL
      const audioUrl = `${process.env.REACT_APP_API_URL || ''}/api/recordings/download/${recording.id}`;
      
      // Fetch the audio file with proper headers using api helper
      api.get(`/api/recordings/download/${recording.id}`, {
        responseType: 'blob',
      })
        .then(response => {
          return response.data; // axios returns blob in response.data when responseType is 'blob'
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          const audio = new Audio(blobUrl);
          
          const onLoadedMetadata = () => {
            setAudioDuration(audio.duration);
          };
          
          const onTimeUpdate = () => {
            setAudioProgress(audio.currentTime);
          };
          
          const onEnded = () => {
            setIsPlaying(false);
            setAudioProgress(0);
            URL.revokeObjectURL(blobUrl);
          };
          
          const onError = (err) => {
            console.error('Audio playback error:', err);
            toast.error('Failed to play recording. The file may be corrupted or unsupported.');
            setIsPlaying(false);
            URL.revokeObjectURL(blobUrl);
          };
          
          const onPlay = () => setIsPlaying(true);
          const onPause = () => setIsPlaying(false);
          
          audio.addEventListener('loadedmetadata', onLoadedMetadata);
          audio.addEventListener('timeupdate', onTimeUpdate);
          audio.addEventListener('ended', onEnded);
          audio.addEventListener('error', onError);
          audio.addEventListener('play', onPlay);
          audio.addEventListener('pause', onPause);
          
          audio.play().catch(err => {
            console.error('Failed to play audio:', err);
            toast.error('Failed to play recording');
            URL.revokeObjectURL(blobUrl);
          });
          
          setAudioRef(audio);
          setPlayingRecording(recording.id);
          setIsPlaying(true);
        })
        .catch(err => {
          console.error('Failed to load audio:', err);
          const errorMessage = err.response?.status === 404 
            ? 'Recording file not found'
            : err.response?.status === 403
            ? 'Access denied to recording'
            : 'Failed to load recording. Please check if the file exists.';
          toast.error(errorMessage);
          setIsPlaying(false);
          setPlayingRecording(null);
        });
    }
  };

  const handleStopRecording = () => {
    if (audioRef) {
      audioRef.pause();
      audioRef.currentTime = 0;
      setIsPlaying(false);
      setAudioProgress(0);
      // Clean up blob URL if it exists
      if (audioRef.src && audioRef.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioRef.src);
      }
      audioRef.src = '';
    }
    setPlayingRecording(null);
  };

  const handleDownloadRecording = async (recording) => {
    try {
      // Download audio file
      const audioResponse = await api.get(`/api/recordings/download/${recording.id}`, {
        responseType: 'blob'
      });
      
      const audioUrl = window.URL.createObjectURL(new Blob([audioResponse.data]));
      const audioLink = document.createElement('a');
      audioLink.href = audioUrl;
      audioLink.setAttribute('download', `${recording.id}.wav`);
      document.body.appendChild(audioLink);
      audioLink.click();
      audioLink.remove();
      window.URL.revokeObjectURL(audioUrl);
      
      // Download metadata JSON
      try {
        const metaResponse = await api.get(`/api/recordings/metadata/${recording.id}`);
        const metadataJson = JSON.stringify(metaResponse.data, null, 2);
        const metadataBlob = new Blob([metadataJson], { type: 'application/json' });
        const metadataUrl = window.URL.createObjectURL(metadataBlob);
        const metadataLink = document.createElement('a');
        metadataLink.href = metadataUrl;
        metadataLink.setAttribute('download', `${recording.id}.json`);
        document.body.appendChild(metadataLink);
        metadataLink.click();
        metadataLink.remove();
        window.URL.revokeObjectURL(metadataUrl);
      } catch (metaError) {
        console.warn('Failed to download metadata, creating from recording data:', metaError);
        // Fallback: create metadata from recording object
        try {
          const metadata = {
            id: recording.id,
            type: recording.type,
            groupId: recording.groupId,
            participants: recording.participants || [],
            startTime: recording.startTime,
            endTime: recording.endTime,
            duration: recording.duration,
            userId: recording.userId || recording.metadata?.userId,
            userName: recording.metadata?.userName,
            userUri: recording.metadata?.userUri,
            ...(recording.metadata || {})
          };
          const metadataJson = JSON.stringify(metadata, null, 2);
          const metadataBlob = new Blob([metadataJson], { type: 'application/json' });
          const metadataUrl = window.URL.createObjectURL(metadataBlob);
          const metadataLink = document.createElement('a');
          metadataLink.href = metadataUrl;
          metadataLink.setAttribute('download', `${recording.id}.json`);
          document.body.appendChild(metadataLink);
          metadataLink.click();
          metadataLink.remove();
          window.URL.revokeObjectURL(metadataUrl);
        } catch (fallbackError) {
          console.error('Failed to create fallback metadata:', fallbackError);
          toast.error('Failed to download metadata');
        }
      }
      
      toast.success('Recording and metadata downloaded');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download recording');
    }
  };

  const handleDeleteRecording = (recording) => {
    if (window.confirm('Are you sure you want to delete this recording?')) {
      deleteRecordingMutation.mutate(recording.id);
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
    if (!milliseconds) return '0:00';
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getCallTypeIcon = (type) => {
    switch (type) {
      case 'broadcast':
        return <FiRadio />;
      case 'group':
        return <FiUsers />;
      case 'direct':
      default:
        return <FiPhone />;
    }
  };

  const getCallTypeLabel = (type) => {
    switch (type) {
      case 'broadcast':
        return 'Broadcast';
      case 'group':
        return 'Group Call';
      case 'direct':
      default:
        return 'Direct 1:1';
    }
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
          Recordings ({filteredRecordings.length})
        </RecordingsTitle>
        <RecordingsActions>
          <Button variant="secondary" onClick={() => refetch()}>
            <FiRefreshCw />
            Refresh
          </Button>
        </RecordingsActions>
      </RecordingsHeader>

      <FiltersContainer>
        <FiltersRow>
          <FilterGroup>
            <FilterLabel>Search</FilterLabel>
            <Input
              placeholder="Search by ID, participants, or metadata..."
              value={searchTermInput}
              onChange={(e) => setSearchTermInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              style={{ width: '100%' }}
            />
          </FilterGroup>

          <FilterGroup>
            <FilterLabel>User</FilterLabel>
            <Select
              value={filterUserInput}
              onChange={(e) => setFilterUserInput(e.target.value)}
              style={{ 
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '0.875rem',
                backgroundColor: 'white',
                color: '#1f2937',
                transition: 'border-color 0.2s ease'
              }}
            >
              <option value="">All Users</option>
              {users.map(user => (
                <option key={user.id || user.userId} value={user.id || user.userId}>
                  {user.username || user.name || user.email || `User ${user.id || user.userId}`}
                </option>
              ))}
            </Select>
          </FilterGroup>

          <FilterGroup>
            <FilterLabel>Date</FilterLabel>
            <Input
              type="date"
              value={filterDateInput}
              onChange={(e) => setFilterDateInput(e.target.value)}
              style={{ 
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '0.875rem',
                backgroundColor: 'white',
                color: '#1f2937'
              }}
            />
          </FilterGroup>

          <FilterGroup>
            <FilterLabel>Time Range</FilterLabel>
            <Select
              value={filterTimeInput}
              onChange={(e) => setFilterTimeInput(e.target.value)}
              style={{ 
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '0.875rem',
                backgroundColor: 'white',
                color: '#1f2937',
                transition: 'border-color 0.2s ease'
              }}
            >
              <option value="">All Times</option>
              <option value="0-6">00:00 - 06:00</option>
              <option value="6-12">06:00 - 12:00</option>
              <option value="12-18">12:00 - 18:00</option>
              <option value="18-24">18:00 - 24:00</option>
            </Select>
          </FilterGroup>

          <FilterGroup>
            <FilterLabel>Call Type</FilterLabel>
            <Select
              value={filterCallTypeInput}
              onChange={(e) => setFilterCallTypeInput(e.target.value)}
              style={{ 
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '0.875rem',
                backgroundColor: 'white',
                color: '#1f2937',
                transition: 'border-color 0.2s ease'
              }}
            >
              <option value="all">All Types</option>
              <option value="broadcast">Broadcast</option>
              <option value="group">Group Call</option>
              <option value="direct">Direct 1:1</option>
            </Select>
          </FilterGroup>

          <FilterGroup>
            <FilterLabel>&nbsp;</FilterLabel>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button 
                variant="primary" 
                onClick={handleSearch}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                <FiSearch />
                Search
              </Button>
              <Button 
                variant="secondary" 
                onClick={handleClearFilters}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                Clear
              </Button>
            </div>
          </FilterGroup>
        </FiltersRow>
      </FiltersContainer>

      {filteredRecordings.length === 0 ? (
        <EmptyState>
          <h3>No recordings found</h3>
          <p>
            {recordings.length === 0 
              ? 'No recordings have been created yet. Make a call to start recording.'
              : 'No recordings match your filters. Try adjusting your search criteria.'}
          </p>
        </EmptyState>
      ) : (
        <RecordingsGrid columns={1}>
          {filteredRecordings.map((recording) => {
            const callType = recording.type || recording.metadata?.type || 'direct';
            // Handle startTime - could be Date object, ISO string, or timestamp
            let startTime = new Date();
            if (recording.startTime) {
              if (typeof recording.startTime === 'string') {
                startTime = parseISO(recording.startTime);
              } else if (recording.startTime instanceof Date) {
                startTime = recording.startTime;
              } else {
                startTime = new Date(recording.startTime);
              }
            }
            // Validate date
            if (isNaN(startTime.getTime())) {
              console.warn('Invalid startTime for recording:', recording.id, recording.startTime);
              startTime = new Date();
            }
            
            return (
              <RecordingCard key={recording.id}>
                <RecordingHeader>
                  <RecordingTitle>
                    {getCallTypeIcon(callType)}
                    {recording.id}
                  </RecordingTitle>
                  <Flex gap="sm" align="center">
                    <CallTypeIcon>
                      {getCallTypeIcon(callType)}
                      {getCallTypeLabel(callType)}
                    </CallTypeIcon>
                    <RecordingStatus variant="info">
                      Completed
                    </RecordingStatus>
                  </Flex>
                </RecordingHeader>

                <RecordingInfo>
                  <RecordingDetail>
                    <RecordingDetailIcon>
                      <FiClock />
                    </RecordingDetailIcon>
                    <RecordingDetailText>
                      {format(startTime, 'MMM dd, yyyy HH:mm:ss')} ({formatDistanceToNow(startTime, { addSuffix: true })})
                    </RecordingDetailText>
                  </RecordingDetail>
                  
                  <RecordingDetail>
                    <RecordingDetailIcon>
                      <FiClock />
                    </RecordingDetailIcon>
                    <RecordingDetailText>
                      Duration: {formatDuration(recording.duration || recording.metadata?.durationMs || 0)}
                    </RecordingDetailText>
                  </RecordingDetail>

                  {recording.participants && recording.participants.length > 0 && (
                    <RecordingDetail>
                      <RecordingDetailIcon>
                        <FiUsers />
                      </RecordingDetailIcon>
                      <RecordingDetailText>
                        Participants: {recording.participants.length}
                      </RecordingDetailText>
                    </RecordingDetail>
                  )}

                  {recording.participants && recording.participants.length > 0 && (
                    <ParticipantsList>
                      {recording.participants.map((participant, index) => {
                        // Handle both old format (string IDs) and new format (objects with user info)
                        let displayText = '';
                        
                        if (typeof participant === 'object' && participant !== null) {
                          // New format with user info - show username and URI
                          const username = participant.userName || null;
                          const uri = participant.userUri || null;
                          
                          if (username && uri) {
                            displayText = `${username} (${uri})`;
                          } else if (username) {
                            displayText = username;
                          } else if (uri) {
                            displayText = uri;
                          } else {
                            // No username or URI available
                            displayText = `Participant ${index + 1}`;
                          }
                        } else {
                          // Old format - just an ID string, show as unknown
                          displayText = `Participant ${index + 1}`;
                        }
                        
                        return (
                          <ParticipantBadge key={index} variant="info">
                            <FiUser />
                            <span>{displayText}</span>
                          </ParticipantBadge>
                        );
                      })}
                    </ParticipantsList>
                  )}
                </RecordingInfo>

                <RecordingActions>
                  <RecordingActionButton
                    variant={playingRecording === recording.id && isPlaying ? "primary" : "secondary"}
                    onClick={() => handlePlayRecording(recording)}
                  >
                    {playingRecording === recording.id && isPlaying ? <FiPause /> : <FiPlay />}
                    {playingRecording === recording.id && isPlaying ? 'Pause' : 'Play'}
                  </RecordingActionButton>
                  
                  {playingRecording === recording.id && (
                    <RecordingActionButton
                      variant="secondary"
                      onClick={handleStopRecording}
                    >
                      <FiSquare />
                      Stop
                    </RecordingActionButton>
                  )}
                  
                  <RecordingActionButton
                    variant="secondary"
                    onClick={() => handleDownloadRecording(recording)}
                  >
                    <FiDownload />
                    Download
                  </RecordingActionButton>
                  
                  <RecordingActionButton
                    variant="danger"
                    onClick={() => handleDeleteRecording(recording)}
                  >
                    <FiTrash2 />
                    Delete
                  </RecordingActionButton>
                </RecordingActions>

                {playingRecording === recording.id && (
                  <AudioPlayerContainer>
                    <AudioControls>
                      <PlayPauseButton
                        variant={isPlaying ? "primary" : "secondary"}
                        onClick={() => handlePlayRecording(recording)}
                      >
                        {isPlaying ? <FiPause /> : <FiPlay />}
                      </PlayPauseButton>
                      
                      <ProgressBar
                        onClick={(e) => {
                          if (audioRef && audioDuration) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const clickX = e.clientX - rect.left;
                            const percentage = clickX / rect.width;
                            audioRef.currentTime = percentage * audioDuration;
                          }
                        }}
                      >
                        <ProgressFill $progress={audioDuration > 0 ? (audioProgress / audioDuration) * 100 : 0} />
                      </ProgressBar>
                      
                      <TimeDisplay>
                        {formatDuration(audioProgress * 1000)} / {formatDuration(audioDuration * 1000)}
                      </TimeDisplay>
                    </AudioControls>
                  </AudioPlayerContainer>
                )}

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
                          <MetadataLabel>Call Type</MetadataLabel>
                          <MetadataValue>{getCallTypeLabel(callType)}</MetadataValue>
                        </MetadataItem>
                        
                        <MetadataItem>
                          <MetadataLabel>Start Time</MetadataLabel>
                          <MetadataValue>
                            {format(startTime, 'yyyy-MM-dd HH:mm:ss')}
                          </MetadataValue>
                        </MetadataItem>
                        
                        <MetadataItem>
                          <MetadataLabel>End Time</MetadataLabel>
                          <MetadataValue>
                            {recording.endTime ? format(new Date(recording.endTime), 'yyyy-MM-dd HH:mm:ss') : 'N/A'}
                          </MetadataValue>
                        </MetadataItem>
                        
                        <MetadataItem>
                          <MetadataLabel>Duration</MetadataLabel>
                          <MetadataValue>
                            {formatDuration(recording.duration || recording.metadata?.durationMs || 0)}
                          </MetadataValue>
                        </MetadataItem>
                        
                        {recording.groupId && (
                          <MetadataItem>
                            <MetadataLabel>Group ID</MetadataLabel>
                            <MetadataValue>{recording.groupId}</MetadataValue>
                          </MetadataItem>
                        )}
                        
                        {(recording.userId || recording.metadata?.userId) && (
                          <MetadataItem>
                            <MetadataLabel>User ID</MetadataLabel>
                            <MetadataValue>{recording.userId || recording.metadata?.userId}</MetadataValue>
                          </MetadataItem>
                        )}
                        
                        {(recording.metadata?.userName || recording.metadata?.uploadedBy) && (
                          <MetadataItem>
                            <MetadataLabel>User Name</MetadataLabel>
                            <MetadataValue>{recording.metadata?.userName || recording.metadata?.uploadedBy || 'N/A'}</MetadataValue>
                          </MetadataItem>
                        )}
                        
                        {recording.metadata?.userUri && (
                          <MetadataItem>
                            <MetadataLabel>User URI</MetadataLabel>
                            <MetadataValue>{recording.metadata.userUri}</MetadataValue>
                          </MetadataItem>
                        )}
                        
                        {recording.participants && recording.participants.length > 0 && (
                          <MetadataItem style={{ gridColumn: '1 / -1' }}>
                            <MetadataLabel>Participants ({recording.participants.length})</MetadataLabel>
                            <MetadataValue>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {recording.participants.map((participant, idx) => {
                                  if (typeof participant === 'object' && participant !== null) {
                                    const username = participant.userName || null;
                                    const uri = participant.userUri || null;
                                    
                                    // Only show if we have at least username or URI
                                    if (username || uri) {
                                      return (
                                        <div key={idx} style={{ padding: '0.5rem', background: '#f5f5f5', borderRadius: '4px' }}>
                                          {username && <div><strong>Username:</strong> {username}</div>}
                                          {uri && <div><strong>URI:</strong> {uri}</div>}
                                        </div>
                                      );
                                    }
                                    // Fallback if no username or URI
                                    return (
                                      <div key={idx} style={{ padding: '0.5rem', background: '#f5f5f5', borderRadius: '4px', color: '#999' }}>
                                        Participant {idx + 1} (no username/URI available)
                                      </div>
                                    );
                                  } else {
                                    // Old format - just an ID string, try to look it up or show as unknown
                                    return (
                                      <div key={idx} style={{ padding: '0.5rem', background: '#f5f5f5', borderRadius: '4px', color: '#999' }}>
                                        Participant {idx + 1} (ID only: {String(participant || 'Unknown')})
                                      </div>
                                    );
                                  }
                                })}
                              </div>
                            </MetadataValue>
                          </MetadataItem>
                        )}
                        
                        {recording.metadata && Object.keys(recording.metadata).length > 0 && (
                          <MetadataItem style={{ gridColumn: '1 / -1' }}>
                            <MetadataLabel>Full Metadata</MetadataLabel>
                            <MetadataValue>
                              <pre style={{ fontSize: '0.75rem', overflow: 'auto', maxHeight: '200px', background: '#f5f5f5', padding: '0.5rem', borderRadius: '4px' }}>
                                {JSON.stringify(recording.metadata, null, 2)}
                              </pre>
                            </MetadataValue>
                          </MetadataItem>
                        )}
                      </MetadataGrid>
                    </ExpandableContent>
                  )}
                </ExpandableSection>
              </RecordingCard>
            );
          })}
        </RecordingsGrid>
      )}
    </RecordingsContainer>
  );
};

export default Recordings;
