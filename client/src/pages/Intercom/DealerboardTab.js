import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { 
  FiPhone, 
  FiPhoneOff, 
  FiPhoneCall,
  FiChevronLeft,
  FiChevronRight,
  FiBell,
  FiVolume2
} from 'react-icons/fi';
import { useAuthStore } from '../../stores/authStore';
import { useSocket } from '../../hooks/useSocket';
import api from '../../utils/api';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import LineButton from '../../components/Dealerboard/LineButton';
import MonitorButton from '../../components/Dealerboard/MonitorButton';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${props => props.theme.colors.background};
  padding: 1.5rem;
  gap: 1rem;
  overflow: hidden;
`;

const MainContent = styled.div`
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;
`;

const ButtonGridContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0.75rem;
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => props.theme.colors.border};
`;

const PageInfo = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
`;

const PaginationControls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
`;

const PageButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
  background: ${props => props.$disabled ? props.theme.colors.surfaceElevated : props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.$disabled ? props.theme.colors.textSecondary : props.theme.colors.text};
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s;
  font-size: 0.875rem;
  
  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.surfaceElevated};
    border-color: ${props => props.theme.colors.accent};
  }
`;

const ButtonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 0.75rem;
  flex: 1;
  min-height: 0;
  position: relative;
`;


const MonitorColumn = styled.div`
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const MonitorHeader = styled.div`
  padding: 0.5rem 1rem;
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => props.theme.colors.border};
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  text-align: center;
`;

const MonitorButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 0.25rem;
`;

const ControlsSection = styled.div`
  display: flex;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid ${props => props.theme.colors.border};
  justify-content: center;
  align-items: flex-start;
`;

const DialPadContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
`;


const DialPad = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  width: 240px;
`;

const DialButton = styled.button`
  aspect-ratio: 1;
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 1.25rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
    border-color: ${props => props.theme.colors.accent};
    transform: scale(1.05);
  }
  
  &:active {
    transform: scale(0.95);
  }
`;

const ControlButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 120px;
  margin-left: 1rem;
`;

const ControlButton = styled.button`
  padding: ${props => props.$large ? '1.5rem 2rem' : '0.75rem 1rem'};
  background: ${props => {
    if (props.$variant === 'danger') return '#ef4444';
    if (props.$variant === 'primary') return '#3b82f6';
    return props.theme.colors.surface;
  }};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.$variant === 'danger' || props.$variant === 'primary' ? 'white' : props.theme.colors.text};
  font-size: ${props => props.$large ? '1rem' : '0.875rem'};
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  
  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
  
  &:active {
    transform: translateY(0);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const RingingIndicator = styled.button`
  position: fixed;
  top: 80px;
  right: 2rem;
  padding: 0.75rem 1rem;
  background: #f59e0b;
  border: none;
  border-radius: ${props => props.theme.borderRadius.md};
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
  z-index: 100;
  animation: ${props => props.$ringing ? 'pulse 1s infinite' : 'none'};
  
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
  
  &:hover {
    background: #d97706;
  }
`;

const DealerboardTab = ({ currentPage: propCurrentPage, onPageChange }) => {
  const { user } = useAuthStore();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(propCurrentPage || 1);
  
  // Sync with parent if prop changes
  useEffect(() => {
    if (propCurrentPage !== undefined) {
      setCurrentPage(propCurrentPage);
    }
  }, [propCurrentPage]);
  
  // Notify parent of page changes
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
    if (onPageChange) {
      onPageChange(newPage);
    }
  }, [onPageChange]);
  const [selectedLine, setSelectedLine] = useState(null);
  const [dialedDigits, setDialedDigits] = useState('');
  const [monitoredLines, setMonitoredLines] = useState([]);
  const [ringingLines, setRingingLines] = useState([]);
  const [activeCalls, setActiveCalls] = useState(new Map());
  
  const maxPages = 10;
  const buttonsPerPage = 28; // 4 rows × 7 columns

  // Fetch user's dealerboard configuration
  const { data: dealerboardConfig, isLoading: loadingConfig } = useQuery(
    ['dealerboardConfig', user?.id],
    async () => {
      if (!user?.id) return null;
      const res = await api.get(`/api/dealerboard/config/${user.id}`);
      return res.data;
    },
    { enabled: !!user?.id }
  );

  // Fetch available lines (private wires and DDI)
  const { data: availableLines, isLoading: loadingLines } = useQuery(
    'availableLines',
    async () => {
      const res = await api.get('/api/dealerboard/lines');
      return res.data.lines || [];
    }
  );

  // Get button assignments for current page
  const getPageAssignments = useCallback(() => {
    if (!dealerboardConfig?.assignments) return {};
    return dealerboardConfig.assignments[currentPage] || {};
  }, [dealerboardConfig, currentPage]);

  const pageAssignments = getPageAssignments();

  // Helper to get line from assignment
  const getLineFromAssignment = useCallback((assignment) => {
    if (!assignment) return null;
    if (assignment.lineId) {
      return availableLines?.find(l => l.id === assignment.lineId);
    }
    if (assignment.ddiLineId) {
      return availableLines?.find(l => l.id === assignment.ddiLineId);
    }
    return null;
  }, [availableLines]);

  // Handle line button click
  const handleLineClick = useCallback(async (buttonNumber) => {
    const assignment = pageAssignments[buttonNumber];
    if (!assignment) {
      toast.error('No line assigned to this button');
      return;
    }

    if (assignment.type === 'speed_dial') {
      // Handle speed dial
      try {
        await api.post(`/api/dealerboard/speed-dial/${assignment.speedDialId}/call`);
        setActiveCalls(prev => new Map(prev).set(buttonNumber, { speedDialId: assignment.speedDialId, status: 'dialing' }));
      } catch (error) {
        toast.error('Failed to dial');
      }
      return;
    }

    const line = getLineFromAssignment(assignment);
    if (!line) {
      toast.error('Line not found');
      return;
    }

    // Handle different line types
    if (line.type === 'private_wire') {
      if (line.mode === 'ARD') {
        // Auto Ring Down - automatically ring far end
        try {
          const response = await api.post(`/api/dealerboard/private-wires/${line.id}/call`, { autoRing: true });
          setActiveCalls(prev => new Map(prev).set(buttonNumber, { 
            lineId: line.id, 
            status: 'ringing',
            matrixRoomId: response.data.matrixRoomId
          }));
          
          // Notify if Matrix room was created
          if (response.data.matrixRoomId && response.data.activeUsers >= 3) {
            toast.success(`Matrix room created! ${response.data.activeUsers} users on line`);
          }
        } catch (error) {
          toast.error('Failed to initiate call');
        }
      } else if (line.mode === 'MRD') {
        // Manual Ring Down - user can speak or signal
        setSelectedLine({ buttonNumber, line, assignment });
      } else if (line.mode === 'HOOT') {
        // Hoot - just shout down the line
        try {
          const response = await api.post(`/api/dealerboard/private-wires/${line.id}/call`, { hoot: true });
          setActiveCalls(prev => new Map(prev).set(buttonNumber, { 
            lineId: line.id, 
            status: 'connected',
            matrixRoomId: response.data.matrixRoomId
          }));
          
          // Notify if Matrix room was created
          if (response.data.matrixRoomId && response.data.activeUsers >= 3) {
            toast.success(`Matrix room created! ${response.data.activeUsers} users on line`);
          }
        } catch (error) {
          toast.error('Failed to connect');
        }
      }
    } else if (line.type === 'DDI') {
      // DDI - select line and send dialed digits if any
      setSelectedLine({ buttonNumber, line, assignment });
      if (dialedDigits) {
        try {
          await api.post(`/api/dealerboard/lines/${line.id}/call`, { digits: dialedDigits });
          setDialedDigits('');
          setActiveCalls(prev => new Map(prev).set(buttonNumber, { lineId: line.id, status: 'dialing' }));
        } catch (error) {
          toast.error('Failed to dial');
        }
      }
    }
  }, [pageAssignments, getLineFromAssignment, dialedDigits]);

  // Handle monitor toggle
  const handleMonitorToggle = useCallback(async (buttonNumber, enabled) => {
    const assignment = pageAssignments[buttonNumber];
    if (!assignment) return;

    const line = getLineFromAssignment(assignment);
    if (!line) return;

    // Only private wires support monitor mode with Matrix room creation
    if (assignment.type !== 'privateWire') {
      toast.error('Monitor mode is only available for private wires');
      return;
    }

    if (enabled) {
      if (monitoredLines.length >= 10) {
        toast.error('Maximum 10 lines can be monitored');
        return;
      }
      try {
        const response = await api.post(`/api/dealerboard/private-wires/${line.id}/monitor`, { enabled: true });
        setMonitoredLines(prev => [...prev, { buttonNumber, line, assignment, matrixRoomId: response.data.matrixRoomId }]);
        
        // Notify if Matrix room was created
        if (response.data.matrixRoomId) {
          if (response.data.monitoringUsers >= 2) {
            toast.success(`Matrix room created! ${response.data.monitoringUsers} users monitoring`);
          } else {
            toast.success('Monitoring enabled. Matrix room will be created when 2+ users are monitoring.');
          }
        } else {
          toast.success('Monitoring enabled');
        }
      } catch (error) {
        toast.error('Failed to enable monitor');
      }
    } else {
      try {
        const response = await api.post(`/api/dealerboard/private-wires/${line.id}/monitor`, { enabled: false });
        setMonitoredLines(prev => prev.filter(m => m.buttonNumber !== buttonNumber));
        
        if (response.data.remainingMonitors === 0) {
          toast.info('All users stopped monitoring. Matrix room remains active.');
        } else {
          toast.success('Monitoring disabled');
        }
      } catch (error) {
        toast.error('Failed to disable monitor');
      }
    }
  }, [pageAssignments, getLineFromAssignment, monitoredLines]);

  // Handle dial pad
  const handleDialPad = useCallback((digit) => {
    if (selectedLine) {
      // If line is selected, send digit immediately
      api.post(`/api/dealerboard/lines/${selectedLine.line.id}/dtmf`, { digit });
    } else {
      // Store digits for later
      setDialedDigits(prev => prev + digit);
    }
  }, [selectedLine]);

  // Handle control buttons
  const handleEndCall = useCallback(async () => {
    // Always clear dialed digits
    setDialedDigits('');
    
    if (!selectedLine) return;
    
    try {
      // Determine if it's a private wire or DDI line
      const isPrivateWire = selectedLine.line.type === 'private_wire';
      const endpoint = isPrivateWire 
        ? `/api/dealerboard/private-wires/${selectedLine.line.id}/end`
        : `/api/dealerboard/lines/${selectedLine.line.id}/end`;
      
      const response = await api.post(endpoint);
      
      setActiveCalls(prev => {
        const next = new Map(prev);
        next.delete(selectedLine.buttonNumber);
        return next;
      });
      setSelectedLine(null);
      
      if (response.data.remainingUsers !== undefined && response.data.remainingUsers < 3) {
        toast.info('Matrix room remains active for other users');
      }
    } catch (error) {
      toast.error('Failed to end call');
    }
  }, [selectedLine]);

  const handleTransfer = useCallback(async () => {
    if (!selectedLine) return;
    toast.info('Transfer functionality - select target line');
    // TODO: Implement transfer
  }, [selectedLine]);

  const handleSignal = useCallback(async () => {
    if (!selectedLine) return;
    try {
      await api.post(`/api/dealerboard/lines/${selectedLine.line.id}/signal`);
    } catch (error) {
      toast.error('Failed to send signal');
    }
  }, [selectedLine]);

  const handleCall = useCallback(async () => {
    if (!selectedLine && dialedDigits) {
      // Use default line or show selection
      toast.info('Please select a line first');
      return;
    }
    if (selectedLine && dialedDigits) {
      try {
        // Determine if it's a private wire or DDI line
        const isPrivateWire = selectedLine.line.type === 'private_wire';
        const endpoint = isPrivateWire 
          ? `/api/dealerboard/private-wires/${selectedLine.line.id}/call`
          : `/api/dealerboard/lines/${selectedLine.line.id}/call`;
        
        const response = await api.post(endpoint, { digits: dialedDigits });
        setDialedDigits('');
        setActiveCalls(prev => new Map(prev).set(selectedLine.buttonNumber, { 
          lineId: selectedLine.line.id, 
          status: 'dialing',
          matrixRoomId: response.data.matrixRoomId
        }));
        
        // Notify if Matrix room was created (for private wires)
        if (isPrivateWire && response.data.matrixRoomId && response.data.activeUsers >= 3) {
          toast.success(`Matrix room created! ${response.data.activeUsers} users on line`);
        }
      } catch (error) {
        toast.error('Failed to dial');
      }
    }
  }, [selectedLine, dialedDigits]);

  const handleConference = useCallback(async () => {
    if (!selectedLine) return;
    toast.info('Conference functionality - add to conference');
    // TODO: Implement conference
  }, [selectedLine]);

  // Listen for socket events
  useEffect(() => {
    if (!socket) return;

    const handleLineStatus = (data) => {
      if (data.status === 'ringing') {
        setRingingLines(prev => {
          const exists = prev.find(r => r.lineId === data.lineId);
          if (exists) return prev;
          return [...prev, { lineId: data.lineId, buttonNumber: data.buttonNumber }];
        });
      } else if (data.status === 'connected') {
        setRingingLines(prev => prev.filter(r => r.lineId !== data.lineId));
        setActiveCalls(prev => new Map(prev).set(data.buttonNumber, { lineId: data.lineId, status: 'connected' }));
      } else if (data.status === 'ended') {
        setActiveCalls(prev => {
          const next = new Map(prev);
          next.delete(data.buttonNumber);
          return next;
        });
      }
    };

    socket.on('dealerboard:lineStatus', handleLineStatus);

    return () => {
      socket.off('dealerboard:lineStatus', handleLineStatus);
    };
  }, [socket]);

  // Handle ringing indicator click
  const handleRingingClick = useCallback(() => {
    if (ringingLines.length > 0) {
      const firstRinging = ringingLines[0];
      // Find which page has this line
      // TODO: Navigate to page and answer
      toast.info(`Answering call on line ${firstRinging.lineId}`);
    }
  }, [ringingLines]);

  return (
    <Container>
      {ringingLines.length > 0 && (
        <RingingIndicator $ringing onClick={handleRingingClick}>
          <FiBell />
          {ringingLines.length} Line{ringingLines.length !== 1 ? 's' : ''} Ringing
        </RingingIndicator>
      )}

      <MainContent>
        <ButtonGridContainer>
          <ButtonGrid>
            {Array.from({ length: buttonsPerPage }, (_, i) => {
              const buttonNumber = i + 1;
              const assignment = pageAssignments[buttonNumber];
              const line = assignment ? getLineFromAssignment(assignment) : null;
              const isMonitored = monitoredLines.some(m => m.buttonNumber === buttonNumber);
              const activeCall = activeCalls.get(buttonNumber);
              const isRinging = ringingLines.some(r => r.buttonNumber === buttonNumber);
              
              return (
                <LineButton
                  key={buttonNumber}
                  buttonNumber={buttonNumber}
                  pageNumber={currentPage}
                  assignment={assignment}
                  line={line}
                  isMonitored={isMonitored}
                  activeCall={activeCall}
                  isRinging={isRinging}
                  isSelected={selectedLine?.buttonNumber === buttonNumber}
                  onLineClick={() => handleLineClick(buttonNumber)}
                  onMonitorToggle={(enabled) => handleMonitorToggle(buttonNumber, enabled)}
                />
              );
            })}
          </ButtonGrid>
          
        </ButtonGridContainer>

        <MonitorColumn>
          <MonitorHeader>Monitor (Max 10)</MonitorHeader>
          <MonitorButtons>
            {monitoredLines.map((monitored, idx) => (
              <MonitorButton
                key={idx}
                line={monitored.line}
                buttonNumber={monitored.buttonNumber}
                onToggle={() => handleMonitorToggle(monitored.buttonNumber, false)}
              />
            ))}
            {monitoredLines.length === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
                No lines monitored
              </div>
            )}
          </MonitorButtons>
        </MonitorColumn>
      </MainContent>

      <ControlsSection>
        <DialPadContainer>
          <DialPad>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map((digit) => (
              <DialButton key={digit} onClick={() => handleDialPad(digit.toString())}>
                {digit}
              </DialButton>
            ))}
          </DialPad>
          {dialedDigits && (
            <div style={{ marginTop: '0.5rem', fontSize: '1.25rem', fontWeight: 600, color: '#3b82f6' }}>
              {dialedDigits}
            </div>
          )}
        </DialPadContainer>

        <ControlButtons>
          <ControlButton onClick={handleTransfer} disabled={!selectedLine}>
            Xfer
          </ControlButton>
          <ControlButton onClick={handleSignal} disabled={!selectedLine}>
            Signal
          </ControlButton>
          <ControlButton $variant="primary" onClick={handleCall} disabled={!dialedDigits && !selectedLine}>
            <FiPhoneCall />
            Call
          </ControlButton>
          <ControlButton onClick={handleConference} disabled={!selectedLine}>
            Conf
          </ControlButton>
          <ControlButton $variant="danger" $large onClick={handleEndCall} disabled={!selectedLine && !dialedDigits}>
            <FiPhoneOff />
            End Call
          </ControlButton>
        </ControlButtons>
      </ControlsSection>
    </Container>
  );
};

export default DealerboardTab;

