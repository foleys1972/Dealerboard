import React, { useState, useMemo, useRef, useEffect } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { 
  FiSearch, 
  FiFilter, 
  FiPlay, 
  FiPause, 
  FiSquare,
  FiDownload, 
  FiFileText,
  FiCalendar,
  FiClock,
  FiUsers,
  FiRefreshCw,
  FiX,
  FiMic,
  FiTrash2
} from 'react-icons/fi';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { theme } from '../../styles/GlobalStyle';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

const Container = styled.div`
  display: flex;
  height: 100%;
  gap: 1rem;
`;

const FilterPanel = styled.div`
  width: 280px;
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
`;

const FilterSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const FilterTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
  
  &::placeholder {
    color: ${props => props.theme.colors.textTertiary};
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
  
  option {
    background: ${props => props.theme.colors.surface};
    color: ${props => props.theme.colors.text};
  }
`;

const DateInput = styled.input`
  width: 100%;
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
`;

const ClearButton = styled.button`
  padding: 0.5rem 1rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.theme.colors.border};
  }
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  overflow: hidden;
`;

const ControlsBar = styled.div`
  padding: 1rem 1.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  gap: 1rem;
  background: ${props => props.theme.colors.surfaceElevated};
`;

const ControlButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: ${props => props.$variant === 'primary' ? props.theme.colors.gradient : props.theme.colors.surface};
  color: ${props => props.$variant === 'primary' ? 'white' : props.theme.colors.text};
  border: ${props => props.$variant === 'primary' ? 'none' : `1px solid ${props.theme.colors.border}`};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: ${props => props.theme.shadows.md};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SelectedRecordingInfo = styled.div`
  flex: 1;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  
  strong {
    color: ${props => props.theme.colors.accent};
  }
`;

const PlaybackBar = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const PlaybackRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const PlaybackTime = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  white-space: nowrap;
  min-width: 110px;
  text-align: right;
`;

const PlaybackSlider = styled.input`
  flex: 1;
  height: 4px;
  border-radius: 999px;
  accent-color: ${props => props.theme.colors.accent};
`;

const TableHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const TableTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0;
`;

const TableContainer = styled.div`
  flex: 1;
  overflow-y: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHead = styled.thead`
  position: sticky;
  top: 0;
  background: ${props => props.theme.colors.surface};
  z-index: 10;
`;

const TableHeaderRow = styled.tr`
  border-bottom: 2px solid ${props => props.theme.colors.border};
`;

const TableHeaderCell = styled.th`
  padding: 1rem;
  text-align: left;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  border-bottom: 1px solid ${props => props.theme.colors.border};
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
  }
  
  ${props => props.$selected && `
    background: rgba(6, 182, 212, 0.1);
    border-left: 3px solid ${props.theme.colors.accent};
  `}
`;

const TableCell = styled.td`
  padding: 1rem;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text};
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: ${props => props.theme.borderRadius.sm};
  font-size: 0.75rem;
  font-weight: 500;
  background: ${props => {
    if (props.$variant === 'call') return 'rgba(6, 182, 212, 0.2)';
    if (props.$variant === 'broadcast') return 'rgba(245, 158, 11, 0.2)';
    if (props.$variant === 'group') return 'rgba(16, 185, 129, 0.2)';
    return 'rgba(107, 114, 128, 0.2)';
  }};
  color: ${props => {
    if (props.$variant === 'call') return props.theme.colors.accent;
    if (props.$variant === 'broadcast') return props.theme.colors.warning;
    if (props.$variant === 'group') return props.theme.colors.success;
    return props.theme.colors.text;
  }};
`;

const EmptyState = styled.div`
  padding: 3rem;
  text-align: center;
  color: ${props => props.theme.colors.textTertiary};
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 2rem;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  width: 90%;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

function formatHhMmSsFromMilliseconds(milliseconds) {
  const ms = Math.max(0, Number(milliseconds) || 0);
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDateTimeInZone(dateInput, timeZone) {
  try {
    if (!dateInput) return '—';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '—';
    const tz = timeZone ? String(timeZone) : 'UTC';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return '—';
  }
}

const ModalTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0;
`;

const ModalCloseButton = styled.button`
  background: transparent;
  border: none;
  color: ${props => props.theme.colors.textSecondary};
  cursor: pointer;
  font-size: 1.5rem;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${props => props.theme.borderRadius.md};
  
  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
    color: ${props => props.theme.colors.text};
  }
`;

const MetadataContent = styled.pre`
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 1rem;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
`;

const AdminRecordings = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sentByFilter, setSentByFilter] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const audioRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: systemSettings } = useQuery(
    'systemSettings-adminrecordings',
    async () => {
      const res = await api.get('/api/system/settings');
      return res.data?.settings || {};
    },
    {
      retry: 1,
      refetchOnWindowFocus: false,
    }
  );

  const deleteMultipleRecordingsMutation = useMutation(
    async (recordingIds) => {
      if (!allowDelete) {
        throw new Error('Recording deletion is disabled by system settings');
      }

      const ids = Array.isArray(recordingIds) ? recordingIds : [];
      for (const id of ids)
      {
        await api.delete(`/api/recordings/${id}`);
      }
      return { count: ids.length };
    },
    {
      onSuccess: (res) => {
        const count = res?.count ?? 0;
        toast.success(count > 0 ? `Deleted ${count} recording(s)` : 'Deleted');
        queryClient.invalidateQueries('admin-recordings');
        setSelectedIds(new Set());
        setSelectedRecording(null);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || error.message || 'Failed to delete recordings');
      }
    }
  );

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success('Recordings refreshed');
    } catch (e) {
      toast.error(e?.message || 'Failed to refresh recordings');
    }
  };

  const allowDelete = Boolean(systemSettings?.recordings?.allowDeletion);

  // Fetch recordings
  const { data: recordings = [], isLoading, refetch, isFetching } = useQuery(
    'admin-recordings',
    async () => {
      const response = await api.get('/api/recordings');
      return response.data?.recordings || response.data || [];
    },
    {
      retry: 2,
      onError: (error) => {
        if (error.response?.status !== 401 && error.response?.status !== 403) {
          toast.error('Failed to load recordings');
        }
      }
    }
  );

  const deleteRecordingMutation = useMutation(
    async (recordingId) => {
      if (!allowDelete) {
        throw new Error('Recording deletion is disabled by system settings');
      }
      const res = await api.delete(`/api/recordings/${recordingId}`);
      return res.data;
    },
    {
      onSuccess: () => {
        toast.success('Recording deleted');
        queryClient.invalidateQueries('admin-recordings');
        setSelectedRecording(null);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || error.message || 'Failed to delete recording');
      }
    }
  );

  const handleDeleteSelected = () => {
    if (!selectedRecording) return;
    if (!allowDelete) {
      toast.error('Recording deletion is disabled by system settings');
      return;
    }
    if (window.confirm('Are you sure you want to delete this recording?')) {
      deleteRecordingMutation.mutate(selectedRecording.id);
    }
  };

  const toggleIdSelected = (id) => {
    const key = String(id || '').trim();
    if (!key) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setAllVisibleSelected = (checked) => {
    setSelectedIds(prev =>
    {
      const next = new Set(prev);
      if (!checked)
      {
        for (const r of filteredRecordings)
        {
          const id = String(r?.id || '').trim();
          if (id) next.delete(id);
        }
        return next;
      }

      for (const r of filteredRecordings)
      {
        const id = String(r?.id || '').trim();
        if (id) next.add(id);
      }
      return next;
    });
  };

  const handleDeleteChecked = () => {
    if (!allowDelete) {
      toast.error('Recording deletion is disabled by system settings');
      return;
    }

    const ids = Array.from(selectedIds || []).filter(Boolean);
    if (ids.length === 0) {
      toast.error('No recordings selected');
      return;
    }

    if (window.confirm(`Delete ${ids.length} selected recording(s)?`)) {
      deleteMultipleRecordingsMutation.mutate(ids);
    }
  };

  const getLineName = (recording) => {
    try {
      const meta = recording?.metadata || {};
      const lineName = meta.lineName || meta.groupName || meta.broadcastName || null;
      if (lineName && String(lineName).trim().length > 0) return String(lineName).trim();
    } catch {}
    return '—';
  };

  const formatParticipants = (recording) => {
    const normalizeUsername = (value) => {
      if (value == null) return '';
      const s = String(value).trim();
      if (!s) return '';
      // Requirement: show username only. If we received a display name like
      // "Test1 Test1" or "First Last", take the first token.
      return s.split(/\s+/)[0] || '';
    };

    const details = recording?.metadata?.participantDetails;
    if (Array.isArray(details) && details.length > 0) {
      const namesRaw = details
        .map(p => p?.userName || p?.username || p?.user?.username || p?.userId)
        .map(normalizeUsername)
        .filter(Boolean);

      const seen = new Set();
      const names = [];
      for (const n of namesRaw) {
        const key = String(n).trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        names.push(n);
      }
      if (names.length === 0) return '—';
      if (names.length <= 3) return names.join(', ');
      return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
    }

    const parts = Array.isArray(recording?.participants) ? recording.participants : [];
    const idsRaw = parts
      .map(p => (typeof p === 'string' ? p : (p?.userId || p?.id || p)))
      .map(normalizeUsername)
      .filter(Boolean);

    const seen = new Set();
    const ids = [];
    for (const id of idsRaw) {
      const key = String(id).trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      ids.push(id);
    }
    if (ids.length === 0) return '—';
    if (ids.length <= 3) return ids.join(', ');
    return `${ids.slice(0, 3).join(', ')} +${ids.length - 3}`;
  };

  const getSentBy = (recording) => {
    const meta = recording?.metadata || {};
    const raw = meta.uploadedByUsername || meta.uploadedByUserId || meta.uploadedBy || null;
    if (!raw) return '—';
    const s = String(raw).trim();
    return s ? s : '—';
  };

  // Filter recordings
  const filteredRecordings = useMemo(() => {
    return recordings.filter(recording => {
      const searchLower = (searchTerm || '').trim().toLowerCase();
      const matchesSearch = !searchLower || (() => {
        const id = String(recording?.id || '').toLowerCase();
        const sentBy = String(getSentBy(recording) || '').toLowerCase();
        const lineName = String(getLineName(recording) || '').toLowerCase();
        const type = String(recording?.type || '').toLowerCase();
        const participants = String(formatParticipants(recording) || '').toLowerCase();
        return (
          id.includes(searchLower) ||
          sentBy.includes(searchLower) ||
          lineName.includes(searchLower) ||
          type.includes(searchLower) ||
          participants.includes(searchLower)
        );
      })();

      const sentByLower = (sentByFilter || '').trim().toLowerCase();
      const matchesSentBy = !sentByLower || String(getSentBy(recording) || '').toLowerCase().includes(sentByLower);
      
      const matchesType = filterType === 'all' || recording.type === filterType;
      
      let matchesDate = true;
      if (filterDateFrom || filterDateTo) {
        const startTime = recording.startTime ? new Date(recording.startTime) : null;
        if (startTime) {
          if (filterDateFrom) {
            const fromDate = new Date(filterDateFrom);
            fromDate.setHours(0, 0, 0, 0);
            if (startTime < fromDate) matchesDate = false;
          }
          if (filterDateTo) {
            const toDate = new Date(filterDateTo);
            toDate.setHours(23, 59, 59, 999);
            if (startTime > toDate) matchesDate = false;
          }
        } else {
          matchesDate = false;
        }
      }
      
      return matchesSearch && matchesSentBy && matchesType && matchesDate;
    });
  }, [recordings, searchTerm, sentByFilter, filterType, filterDateFrom, filterDateTo]);

  const handleSelectRecording = (recording) => {
    setSelectedRecording(recording);
    setIsPlaying(false);
    setPlaybackSeconds(0);
    setDurationSeconds(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setPlaybackSeconds(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    };
    const onLoadedMetadata = () => {
      setDurationSeconds(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const onEnded = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      try { audio.removeEventListener('timeupdate', onTimeUpdate); } catch {}
      try { audio.removeEventListener('loadedmetadata', onLoadedMetadata); } catch {}
      try { audio.removeEventListener('ended', onEnded); } catch {}
    };
  }, []);

  const handlePlay = async () => {
    if (!selectedRecording) return;
    
    try {
      const response = await api.get(`/api/recordings/download/${selectedRecording.id}`, {
        responseType: 'blob'
      });
      
      const audioUrl = URL.createObjectURL(response.data);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        try {
          await audioRef.current.play();
        } catch (e) {
          throw e;
        }
        setIsPlaying(true);
      }
    } catch (error) {
      const errorMessage = error.response?.status === 404 
        ? 'Recording file not found'
        : error.response?.status === 403
        ? 'Access denied to recording'
        : 'Failed to load recording';
      toast.error(errorMessage);
    }
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setPlaybackSeconds(0);
    }
  };

  const handleSeek = (value) => {
    const audio = audioRef.current;
    if (!audio) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    audio.currentTime = Math.max(0, Math.min(v, durationSeconds || 0));
    setPlaybackSeconds(audio.currentTime);
  };

  const handleExport = async () => {
    if (!selectedRecording) return;
    
    try {
      const response = await api.get(`/api/recordings/download/${selectedRecording.id}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedRecording.id}.wav`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Recording exported successfully');
    } catch (error) {
      toast.error('Failed to export recording');
    }
  };

  const handleViewMetadata = async () => {
    if (!selectedRecording) return;
    setShowMetadata(true);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSentByFilter('');
    setFilterType('all');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const allVisibleIds = useMemo(() => {
    return (filteredRecordings || [])
      .map(r => String(r?.id || '').trim())
      .filter(Boolean);
  }, [filteredRecordings]);

  const allVisibleSelected = useMemo(() => {
    if (allVisibleIds.length === 0) return false;
    for (const id of allVisibleIds) {
      if (!selectedIds.has(id)) return false;
    }
    return true;
  }, [allVisibleIds, selectedIds]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <Container>
        <audio ref={audioRef} onEnded={() => setIsPlaying(false)} style={{ display: 'none' }} />
        
        <FilterPanel>
          <FilterSection>
            <FilterTitle>Search</FilterTitle>
            <SearchInput
              type="text"
              placeholder="Search recordings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </FilterSection>

          <FilterSection>
            <FilterTitle>Sent By</FilterTitle>
            <SearchInput
              type="text"
              placeholder="Search by uploader..."
              value={sentByFilter}
              onChange={(e) => setSentByFilter(e.target.value)}
            />
          </FilterSection>

          <FilterSection>
            <FilterTitle>Type</FilterTitle>
            <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              <option value="call">Call</option>
              <option value="broadcast">Broadcast</option>
              <option value="group">Group</option>
            </Select>
          </FilterSection>

          <FilterSection>
            <FilterTitle>Date From</FilterTitle>
            <DateInput
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </FilterSection>

          <FilterSection>
            <FilterTitle>Date To</FilterTitle>
            <DateInput
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </FilterSection>

          <ClearButton onClick={clearFilters}>
            Clear Filters
          </ClearButton>
        </FilterPanel>

        <MainContent>
          {selectedRecording && (
            <ControlsBar>
              <SelectedRecordingInfo>
                <strong>Selected:</strong> {selectedRecording.id} ({selectedRecording.type})
              </SelectedRecordingInfo>
              <ControlButton
                $variant="primary"
                onClick={isPlaying ? handlePause : handlePlay}
                disabled={!selectedRecording}
              >
                {isPlaying ? <FiPause /> : <FiPlay />}
                {isPlaying ? 'Pause' : 'Play'}
              </ControlButton>
              <ControlButton
                onClick={handleRefresh}
                disabled={isLoading || isFetching}
              >
                <FiRefreshCw size={16} />
                Refresh
              </ControlButton>
              <ControlButton
                onClick={handleStop}
                disabled={!selectedRecording}
              >
                <FiSquare />
                Stop
              </ControlButton>

              <PlaybackBar>
                <PlaybackRow>
                  <PlaybackSlider
                    type="range"
                    min={0}
                    max={Math.max(0, durationSeconds || 0)}
                    step={0.1}
                    value={Math.min(playbackSeconds, durationSeconds || 0)}
                    onChange={(e) => handleSeek(e.target.value)}
                    disabled={!selectedRecording}
                  />
                  <PlaybackTime>
                    {formatHhMmSsFromMilliseconds((playbackSeconds || 0) * 1000)} / {formatHhMmSsFromMilliseconds((durationSeconds || 0) * 1000)}
                  </PlaybackTime>
                </PlaybackRow>
              </PlaybackBar>
              <ControlButton onClick={handleExport}>
                <FiDownload />
                Export
              </ControlButton>
              <ControlButton onClick={handleViewMetadata}>
                <FiFileText />
                View Metadata
              </ControlButton>
              {allowDelete && (
                <ControlButton
                  onClick={handleDeleteSelected}
                  disabled={!selectedRecording || deleteRecordingMutation.isLoading}
                >
                  <FiTrash2 />
                  Delete
                </ControlButton>
              )}
            </ControlsBar>
          )}

          {!selectedRecording && allowDelete && (
            <ControlsBar>
              <SelectedRecordingInfo>
                <strong>Selected:</strong> —
              </SelectedRecordingInfo>
              <ControlButton
                onClick={handleRefresh}
                disabled={isLoading || isFetching}
              >
                <FiRefreshCw size={16} />
                Refresh
              </ControlButton>
              <ControlButton
                onClick={handleDeleteChecked}
                disabled={(selectedIds?.size || 0) === 0 || deleteMultipleRecordingsMutation.isLoading}
              >
                <FiTrash2 />
                Delete Selected ({selectedIds?.size || 0})
              </ControlButton>
            </ControlsBar>
          )}

          <TableHeader>
            <TableTitle>Recordings ({filteredRecordings.length})</TableTitle>
          </TableHeader>
          
          <TableContainer>
            {isLoading ? (
              <EmptyState>Loading recordings...</EmptyState>
            ) : filteredRecordings.length === 0 ? (
              <EmptyState>No recordings found</EmptyState>
            ) : (
              <Table>
                <TableHead>
                  <TableHeaderRow>
                    <TableHeaderCell style={{ width: '44px' }}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(e) => setAllVisibleSelected(e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={allVisibleIds.length === 0}
                      />
                    </TableHeaderCell>
                    <TableHeaderCell>ID</TableHeaderCell>
                    <TableHeaderCell>Line Name</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Start Time</TableHeaderCell>
                    <TableHeaderCell>Duration</TableHeaderCell>
                    <TableHeaderCell>Participants</TableHeaderCell>
                    <TableHeaderCell>Sent By</TableHeaderCell>
                  </TableHeaderRow>
                </TableHead>
                <TableBody>
                  {filteredRecordings.map(recording => (
                    <TableRow
                      key={recording.id}
                      $selected={selectedRecording?.id === recording.id}
                      onClick={() => handleSelectRecording(recording)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(String(recording.id || '').trim())}
                          onChange={() => toggleIdSelected(recording.id)}
                        />
                      </TableCell>
                      <TableCell>{recording.id}</TableCell>
                      <TableCell>{getLineName(recording)}</TableCell>
                      <TableCell>
                        <Badge $variant={recording.type}>
                          {recording.type || 'unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const tz = recording.recordingTimezone || 'UTC';
                          const local = formatDateTimeInZone(recording.startTime, tz);
                          const utc = formatDateTimeInZone(recording.startTime, 'UTC');
                          if (local === '—' && utc === '—') return '—';
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <div>{local} {tz ? `(${tz})` : ''}</div>
                              <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>{utc} (UTC)</div>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const ms = recording.metadata?.durationMs ?? recording.duration;
                          return ms ? formatHhMmSsFromMilliseconds(ms) : '—';
                        })()}
                      </TableCell>
                      <TableCell>
                        {formatParticipants(recording)}
                      </TableCell>
                      <TableCell>
                        {getSentBy(recording)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableContainer>
        </MainContent>

        {showMetadata && selectedRecording && (
          <Modal onClick={() => setShowMetadata(false)}>
            <ModalContent onClick={(e) => e.stopPropagation()}>
              <ModalHeader>
                <ModalTitle>Recording Metadata</ModalTitle>
                <ModalCloseButton onClick={() => setShowMetadata(false)}>
                  <FiX />
                </ModalCloseButton>
              </ModalHeader>
              <MetadataContent>
                {JSON.stringify(selectedRecording, null, 2)}
              </MetadataContent>
            </ModalContent>
          </Modal>
        )}
      </Container>
    </ThemeProvider>
  );
};

export default AdminRecordings;

