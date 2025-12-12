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
  FiMic
} from 'react-icons/fi';
import { useQuery } from 'react-query';
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
  const [filterType, setFilterType] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const audioRef = useRef(null);

  // Fetch recordings
  const { data: recordings = [], isLoading, refetch } = useQuery(
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

  // Filter recordings
  const filteredRecordings = useMemo(() => {
    return recordings.filter(recording => {
      const matchesSearch = !searchTerm || 
        (recording.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (recording.type || '').toLowerCase().includes(searchTerm.toLowerCase());
      
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
      
      return matchesSearch && matchesType && matchesDate;
    });
  }, [recordings, searchTerm, filterType, filterDateFrom, filterDateTo]);

  const handleSelectRecording = (recording) => {
    setSelectedRecording(recording);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  };

  const handlePlay = async () => {
    if (!selectedRecording) return;
    
    try {
      const response = await api.get(`/api/recordings/download/${selectedRecording.id}`, {
        responseType: 'blob'
      });
      
      const audioUrl = URL.createObjectURL(response.data);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play();
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
    }
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
    setFilterType('all');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

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
        <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
        
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
              >
                {isPlaying ? <FiPause /> : <FiPlay />}
                {isPlaying ? 'Pause' : 'Play'}
              </ControlButton>
              <ControlButton onClick={handleStop} disabled={!isPlaying}>
                <FiSquare />
                Stop
              </ControlButton>
              <ControlButton onClick={handleExport}>
                <FiDownload />
                Export
              </ControlButton>
              <ControlButton onClick={handleViewMetadata}>
                <FiFileText />
                View Metadata
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
                    <TableHeaderCell>ID</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Start Time</TableHeaderCell>
                    <TableHeaderCell>Duration</TableHeaderCell>
                    <TableHeaderCell>Participants</TableHeaderCell>
                  </TableHeaderRow>
                </TableHead>
                <TableBody>
                  {filteredRecordings.map(recording => (
                    <TableRow
                      key={recording.id}
                      $selected={selectedRecording?.id === recording.id}
                      onClick={() => handleSelectRecording(recording)}
                    >
                      <TableCell>{recording.id}</TableCell>
                      <TableCell>
                        <Badge $variant={recording.type}>
                          {recording.type || 'unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {recording.startTime 
                          ? format(new Date(recording.startTime), 'MMM dd, yyyy HH:mm:ss')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {recording.duration 
                          ? `${Math.floor(recording.duration / 60)}:${String(Math.floor(recording.duration % 60)).padStart(2, '0')}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {recording.participants?.length || 0}
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

