import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { 
  FiPhone, 
  FiPhoneOff, 
  FiPhoneCall,
  FiChevronLeft,
  FiChevronRight,
  FiVolume2
} from 'react-icons/fi';
import { useAuthStore } from '../../stores/authStore';
import { useSocket } from '../../hooks/useSocket';
import api from '../../utils/api';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import LineButton from '../../components/Dealerboard/LineButton';
import MonitorButton from '../../components/Dealerboard/MonitorButton';
import {
  getPageAssignmentsMap,
  getButtonAssignment,
  isSpeedDialAssignment,
  isPrivateWireAssignment,
  resolveAssignmentLineId,
  resolvePrivateWireMode,
} from '../../utils/dealerboardAssignment';
import { useDealerboardLineMedia } from '../../hooks/useDealerboardLineMedia';
import { useLineRingTone } from '../../hooks/useLineRingTone';

const LineCallBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1rem;
  margin-bottom: 0.75rem;
  border-radius: 8px;
  font-weight: 600;
  background: ${(props) => (props.$ringing ? '#f59e0b' : '#16a34a')};
  color: #fff;
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: ${props => props.theme.colors.background};
  padding: 0.5rem 0.75rem;
  gap: 0.35rem;
  overflow: hidden;
`;

const MainContent = styled.div`
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;

  @media (max-width: ${props => props.theme.breakpoints.lg}) {
    flex-direction: column;
  }
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
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 0.35rem;
  flex: 1;
  min-height: 0;
`;


const MonitorColumn = styled.div`
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex-shrink: 0;
  background: ${(props) => props.theme.colors.surface};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: ${(props) => props.theme.borderRadius.md};
  padding: 0.35rem;
  min-height: 0;
  overflow: hidden;
`;

const MonitorHeader = styled.div`
  padding: 0.25rem 0.35rem;
  background: ${(props) => props.theme.colors.surfaceElevated};
  border-radius: ${(props) => props.theme.borderRadius.sm};
  border: 1px solid ${(props) => props.theme.colors.border};
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${(props) => props.theme.colors.warning};
  text-align: center;
  flex-shrink: 0;
`;

const MonitorButtons = styled.div`
  display: grid;
  grid-template-rows: repeat(10, minmax(0, 1fr));
  gap: 0.2rem;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

const StatusLegend = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  padding: 0.2rem 0.5rem;
  background: ${(props) => props.theme.colors.surface};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: ${(props) => props.theme.borderRadius.sm};
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: ${(props) => props.theme.colors.textSecondary};
  flex-shrink: 0;
`;

const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
`;

const LegendSwatch = styled.span`
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: ${(props) => props.$color};
  border: 1px solid ${(props) => props.$border || props.$color};
  box-shadow: ${(props) => (props.$glow ? `0 0 6px ${props.$glow}` : 'none')};
`;

const StatusBar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.65rem;
  padding: 0.2rem 0.5rem;
  background: ${(props) => props.theme.colors.surfaceElevated};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: ${(props) => props.theme.borderRadius.sm};
  font-size: 0.68rem;
  color: ${(props) => props.theme.colors.textSecondary};
  min-height: 22px;
  flex-shrink: 0;

  strong {
    color: ${(props) => props.theme.colors.text};
    font-weight: 600;
  }
`;

const StatusChip = styled.span`
  padding: 0.1rem 0.45rem;
  border-radius: 3px;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  background: ${(props) => props.$bg};
  color: ${(props) => props.$color || '#fff'};
  border: 1px solid ${(props) => props.$border || 'transparent'};
`;

const ControlsSection = styled.div`
  display: flex;
  gap: 0.75rem;
  padding-top: 0.35rem;
  border-top: 1px solid ${props => props.theme.colors.border};
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
`;

const DialPadContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: center;
`;

const DialPad = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.3rem;
  width: 168px;
`;

const DialButton = styled.button`
  aspect-ratio: 1;
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.sm};
  color: ${props => props.theme.colors.text};
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  min-height: 0;
  padding: 0.15rem;
  
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
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  justify-content: center;
`;

const ControlButton = styled.button`
  padding: ${props => props.$large ? '0.55rem 1rem' : '0.4rem 0.65rem'};
  background: ${props => {
    if (props.$active) return '#f59e0b';
    if (props.$variant === 'danger') return '#ef4444';
    if (props.$variant === 'primary') return '#3b82f6';
    return props.theme.colors.surface;
  }};
  border: 1px solid ${props => props.$active ? '#d97706' : props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.$active || props.$variant === 'danger' || props.$variant === 'primary' ? 'white' : props.theme.colors.text};
  font-size: ${props => props.$large ? '0.85rem' : '0.75rem'};
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
  const [assignedLines, setAssignedLines] = useState([]);
  const [speakingLineId, setSpeakingLineId] = useState(null);
  const [activeCalls, setActiveCalls] = useState(new Map());
  const [lineStatus, setLineStatus] = useState({
    privateLines: [],
    busyLines: [],
    ringingButtons: [],
    ringingLines: [],
    disconnectedLines: [],
  });
  const [incomingSipCalls, setIncomingSipCalls] = useState(new Map());
  const [socketRingingLineIds, setSocketRingingLineIds] = useState(new Set());
  const [transferMode, setTransferMode] = useState(false);
  const [conferenceMode, setConferenceMode] = useState(false);
  const { startLineListen, startLineCall, stopLineCall } = useDealerboardLineMedia();
  const activeLineMediaRef = useRef(new Map());
  const monitorsRehydratedRef = useRef(false);
  const speakersRehydratedRef = useRef(false);
  
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
    { enabled: !!user?.id, refetchOnWindowFocus: true, staleTime: 30000 }
  );

  const { data: speedDialsData } = useQuery(
    ['dealerboardSpeedDials', user?.id],
    async () => {
      if (!user?.id) return [];
      const res = await api.get(`/api/dealerboard/speed-dials?userId=${encodeURIComponent(user.id)}`);
      return res.data?.speedDials || [];
    },
    { enabled: !!user?.id, refetchOnWindowFocus: true, staleTime: 30000 }
  );

  const speedDials = speedDialsData || [];

  // Fetch available lines (private wires and DDI)
  const { data: availableLines, isLoading: loadingLines } = useQuery(
    'availableLines',
    async () => {
      const res = await api.get('/api/dealerboard/lines');
      return res.data.lines || [];
    }
  );

  // Get button assignments for current page
  const pageAssignments = useMemo(
    () => getPageAssignmentsMap(dealerboardConfig, currentPage),
    [dealerboardConfig, currentPage]
  );

  const findButtonForLineId = useCallback((lineId) => {
    if (!lineId || !dealerboardConfig?.assignments) return null;

    for (const [pageStr, page] of Object.entries(dealerboardConfig.assignments)) {
      if (!page) continue;
      for (const [btnStr, assignment] of Object.entries(page)) {
        const assignedId = assignment?.lineId || assignment?.ddiLineId;
        if (assignedId && String(assignedId) === String(lineId)) {
          return {
            pageNumber: parseInt(pageStr, 10),
            buttonNumber: parseInt(btnStr, 10),
            assignment,
            lineId: String(assignedId),
          };
        }
      }
    }
    return null;
  }, [dealerboardConfig]);

  const persistSpeakerLineIds = useCallback(async (entries) => {
    if (!user?.id) return;
    try {
      const prefsRes = await api.get('/api/dealerboard/preferences');
      const existing = prefsRes.data?.preferences?.preferences || {};
      const lineIds = entries
        .map((a) => a.line?.id || a.lineId)
        .filter(Boolean)
        .slice(0, 10);
      await api.put('/api/dealerboard/preferences', {
        preferences: { ...existing, speakerLineIds: lineIds },
      });
    } catch {
      // Non-fatal — speaker panel still works for this session
    }
  }, [user?.id]);

  const persistMonitoredLineIds = useCallback(async (entries) => {
    if (!user?.id) return;
    try {
      const prefsRes = await api.get('/api/dealerboard/preferences');
      const existing = prefsRes.data?.preferences?.preferences || {};
      const lineIds = entries
        .map((m) => m.line?.id || m.lineId)
        .filter(Boolean)
        .slice(0, 10);
      await api.put('/api/dealerboard/preferences', {
        preferences: { ...existing, monitoredLineIds: lineIds },
      });
    } catch {
      // Non-fatal — monitor still works for this session
    }
  }, [user?.id]);

  const allRingingTargets = useMemo(() => {
    const seen = new Map();

    for (const entry of lineStatus.ringingButtons || []) {
      if (!entry?.pageNumber || !entry?.buttonNumber) continue;
      seen.set(`${entry.pageNumber}-${entry.buttonNumber}`, entry);
    }

    for (const lineId of socketRingingLineIds) {
      const located = findButtonForLineId(lineId);
      if (located) {
        seen.set(`${located.pageNumber}-${located.buttonNumber}`, located);
      }
    }

    return Array.from(seen.values());
  }, [lineStatus.ringingButtons, socketRingingLineIds, findButtonForLineId]);

  const ringingLines = useMemo(
    () => allRingingTargets.filter((b) => b.pageNumber === currentPage),
    [allRingingTargets, currentPage]
  );

  // Audible ring while any line is ringing (user-toggleable in Settings → Notifications).
  useLineRingTone(allRingingTargets.length > 0);

  useEffect(() => {
    if (!user?.id) return undefined;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.get(`/api/dealerboard/lines/busy-status?userId=${user.id}`);
        if (!cancelled && res.data?.success) {
          setLineStatus({
            privateLines: res.data.privateLines || [],
            busyLines: res.data.busyLines || [],
            ringingButtons: res.data.ringingButtons || [],
            ringingLines: res.data.ringingLines || [],
            disconnectedLines: res.data.disconnectedLines || [],
          });
          setSocketRingingLineIds(new Set(res.data.ringingLines || []));
        }
      } catch {
        // ignore poll failures
      }
    };

    poll();
    const timer = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.id]);

  // Helper to get line from assignment
  const getLineFromAssignment = useCallback((assignment) => {
    if (!assignment) return null;
    if (assignment.lineId) {
      return availableLines?.find((l) => String(l.id) === String(assignment.lineId));
    }
    if (assignment.ddiLineId) {
      return availableLines?.find((l) => String(l.id) === String(assignment.ddiLineId));
    }
    return null;
  }, [availableLines]);

  // Rehydrate persisted speaker panel slots (SPK latch).
  useEffect(() => {
    if (!dealerboardConfig || !user?.id || speakersRehydratedRef.current) return undefined;
    speakersRehydratedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const prefsRes = await api.get('/api/dealerboard/preferences');
        const prefs = prefsRes.data?.preferences?.preferences || {};
        const ids = Array.isArray(prefs.speakerLineIds)
          ? prefs.speakerLineIds
          : (Array.isArray(prefs.monitoredLineIds) ? prefs.monitoredLineIds : []);
        if (ids.length === 0) return;

        const restored = [];
        for (const lineId of ids.slice(0, 10)) {
          const located = findButtonForLineId(String(lineId));
          if (!located?.assignment || !isPrivateWireAssignment(located.assignment)) continue;
          const line = getLineFromAssignment(located.assignment);
          if (!line?.id) continue;
          try {
            const response = await api.post(`/api/dealerboard/private-wires/${line.id}/monitor`, { enabled: true });
            const mediaGroupId = response.data?.mediaGroupId;
            if (mediaGroupId) {
              await startLineListen(mediaGroupId);
            }
            restored.push({
              buttonNumber: located.buttonNumber,
              pageNumber: located.pageNumber,
              line,
              assignment: located.assignment,
              mediaGroupId,
            });
          } catch {
            // Skip lines that fail to re-assign
          }
        }
        if (!cancelled && restored.length > 0) {
          setAssignedLines(restored);
        }
      } catch {
        // Preferences unavailable — start fresh
      }
    })();

    return () => { cancelled = true; };
  }, [dealerboardConfig, user?.id, findButtonForLineId, getLineFromAssignment, startLineListen]);

  // Rehydrate persisted MON toggles (listen-only, no speaker panel slot).
  useEffect(() => {
    if (!dealerboardConfig || !user?.id || monitorsRehydratedRef.current) return undefined;
    monitorsRehydratedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const prefsRes = await api.get('/api/dealerboard/preferences');
        const ids = prefsRes.data?.preferences?.preferences?.monitoredLineIds;
        if (!Array.isArray(ids) || ids.length === 0) return;

        const restored = [];
        for (const lineId of ids.slice(0, 10)) {
          const located = findButtonForLineId(String(lineId));
          if (!located?.assignment || !isPrivateWireAssignment(located.assignment)) continue;
          const line = getLineFromAssignment(located.assignment);
          if (!line?.id) continue;
          try {
            const response = await api.post(`/api/dealerboard/private-wires/${line.id}/monitor`, { enabled: true });
            restored.push({
              buttonNumber: located.buttonNumber,
              pageNumber: located.pageNumber,
              line,
              assignment: located.assignment,
              matrixRoomId: response.data?.matrixRoomId,
            });
          } catch {
            // Skip lines that fail to re-monitor
          }
        }
        if (!cancelled && restored.length > 0) {
          setMonitoredLines(restored);
        }
      } catch {
        // Preferences unavailable — start fresh
      }
    })();

    return () => { cancelled = true; };
  }, [dealerboardConfig, user?.id, findButtonForLineId, getLineFromAssignment]);

  const answerIncomingCall = useCallback(async ({ buttonNumber, lineId, assignment }) => {
    if (!lineId || !assignment) {
      toast.error('Could not locate ringing line');
      return;
    }

    const line = getLineFromAssignment(assignment);
    if (!line) {
      toast.error('Line not found');
      return;
    }

    try {
      const sipCallId = incomingSipCalls.get(lineId);
      const isPrivateWire = line.type === 'private_wire' || isPrivateWireAssignment(assignment);
      const endpoint = isPrivateWire
        ? `/api/dealerboard/private-wires/${lineId}/answer`
        : `/api/dealerboard/lines/${lineId}/answer`;

      const response = await api.post(endpoint, { sipCallId });
      if (response.data.mediaGroupId) {
        await startLineCall(response.data.mediaGroupId);
        activeLineMediaRef.current.set(buttonNumber, response.data.mediaGroupId);
      }
      setActiveCalls((prev) => new Map(prev).set(buttonNumber, {
        lineId,
        status: 'connected',
        mediaGroupId: response.data.mediaGroupId,
        sipCallId: response.data.sipCallId,
      }));
      setSelectedLine({ buttonNumber, line, assignment });
      setSocketRingingLineIds((prev) => {
        const next = new Set(prev);
        next.delete(lineId);
        return next;
      });
      toast.success('Incoming call answered');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to answer incoming call');
      throw error;
    }
  }, [getLineFromAssignment, incomingSipCalls, startLineCall]);

  // Handle line button click
  const handleLineClick = useCallback(async (buttonNumber) => {
    const assignment = getButtonAssignment(pageAssignments, buttonNumber);
    if (!assignment) {
      toast.error('No line assigned to this button');
      return;
    }

    if (isSpeedDialAssignment(assignment)) {
      try {
        await api.post(`/api/dealerboard/speed-dial/${assignment.speedDialId}/call`);
        setActiveCalls(prev => new Map(prev).set(buttonNumber, { speedDialId: assignment.speedDialId, status: 'dialing' }));
      } catch (error) {
        toast.error(error?.response?.data?.error || 'Failed to dial');
      }
      return;
    }

    const line = getLineFromAssignment(assignment);
    if (!line) {
      toast.error('Line not found');
      return;
    }

    const lineId = resolveAssignmentLineId(assignment);

    if (transferMode && selectedLine?.line?.id) {
      if (line.id === selectedLine.line.id) {
        toast.error('Select a different line for transfer');
        return;
      }
      try {
        await api.post(`/api/dealerboard/lines/${selectedLine.line.id}/transfer`, {
          targetLineId: line.id,
        });
        toast.success('Transfer initiated');
      } catch (error) {
        toast.error(error?.response?.data?.error || 'Transfer failed');
      } finally {
        setTransferMode(false);
      }
      return;
    }

    if (conferenceMode && selectedLine?.line?.id) {
      if (line.id === selectedLine.line.id) {
        toast.error('Select a different line to conference');
        return;
      }
      try {
        const response = await api.post(`/api/dealerboard/lines/${selectedLine.line.id}/conference`, {
          targetLineId: line.id,
        });
        toast.success(response.data?.message || 'Lines conferenced');
      } catch (error) {
        toast.error(error?.response?.data?.error || 'Conference failed');
      } finally {
        setConferenceMode(false);
      }
      return;
    }

    const activeCall = activeCalls.get(buttonNumber);

    // Active call on this button — press again to end (toggle off).
    if (activeCall?.lineId) {
      try {
        const isPrivateWire = line.type === 'private_wire' || isPrivateWireAssignment(assignment);
        const endpoint = isPrivateWire
          ? `/api/dealerboard/private-wires/${line.id}/end`
          : `/api/dealerboard/lines/${line.id}/end`;
        await api.post(endpoint);
        const mediaGroupId = activeLineMediaRef.current.get(buttonNumber);
        if (mediaGroupId) {
          stopLineCall(mediaGroupId);
          activeLineMediaRef.current.delete(buttonNumber);
        }
        setActiveCalls((prev) => {
          const next = new Map(prev);
          next.delete(buttonNumber);
          return next;
        });
        setIncomingSipCalls((prev) => {
          const next = new Map(prev);
          next.delete(line.id);
          return next;
        });
        setSocketRingingLineIds((prev) => {
          const next = new Set(prev);
          next.delete(line.id);
          return next;
        });
        if (selectedLine?.buttonNumber === buttonNumber) {
          setSelectedLine(null);
        }
        toast.success('Call ended');
      } catch (error) {
        toast.error(error?.response?.data?.error || 'Failed to end call');
      }
      return;
    }

    const isRinging = ringingLines.some((r) => r.buttonNumber === buttonNumber)
      || (lineId && socketRingingLineIds.has(lineId))
      || (lineId && (lineStatus.ringingLines || []).includes(lineId));

    if (isRinging && lineId) {
      const activeCall = activeCalls.get(buttonNumber);
      const isOutboundRinging = activeCall?.lineId === lineId
        && (activeCall?.status === 'ringing' || activeCall?.status === 'connected');

      if (!isOutboundRinging) {
        try {
          await answerIncomingCall({ buttonNumber, lineId, assignment });
          return;
        } catch (error) {
          const status = error?.response?.status;
          const errMsg = error?.response?.data?.error || error?.response?.data?.details || '';
          if (status === 409 || /conflict|no longer ringing/i.test(String(errMsg))) {
            try {
              const isPrivateWire = line.type === 'private_wire' || isPrivateWireAssignment(assignment);
              const endEndpoint = isPrivateWire
                ? `/api/dealerboard/private-wires/${lineId}/end`
                : `/api/dealerboard/lines/${lineId}/end`;
              await api.post(endEndpoint);
            } catch {
              // fall through to place a fresh call
            }
          } else {
            return;
          }
        }
      }
    }

    // Handle different line types
    const isPrivateWire = line.type === 'private_wire' || isPrivateWireAssignment(assignment);
    if (isPrivateWire) {
      const wireMode = resolvePrivateWireMode(line, assignment);
      const startPrivateWireCall = async ({ autoRing = false, hoot = false, status = 'connected' }) => {
        const response = await api.post(`/api/dealerboard/private-wires/${line.id}/call`, { autoRing, hoot });
        const callStatus = response.data?.ringing ? 'ringing' : status;
        setActiveCalls((prev) => new Map(prev).set(buttonNumber, {
          lineId: line.id,
          status: callStatus,
          matrixRoomId: response.data.matrixRoomId,
          mediaGroupId: response.data.mediaGroupId,
          sipCallId: response.data.sipCallId,
        }));
        setSelectedLine({ buttonNumber, line, assignment });

        if (response.data.mediaGroupId) {
          await startLineCall(response.data.mediaGroupId);
          activeLineMediaRef.current.set(buttonNumber, response.data.mediaGroupId);
          if (response.data.ringing || autoRing) {
            toast.success('Ringing far end…');
          } else if (response.data.joinedExistingCall) {
            toast.success('Joined shared line');
          } else {
            toast.success(hoot ? 'Hoot line connected' : 'Line connected');
          }
        } else {
          toast.error('No audio path returned for this line');
        }
      };

      try {
        if (wireMode === 'ARD') {
          await startPrivateWireCall({ autoRing: true, status: 'ringing' });
        } else if (wireMode === 'MRD') {
          await startPrivateWireCall({});
          toast('Use Signal to ring far end', { icon: '📞' });
        } else if (wireMode === 'HOOT') {
          await startPrivateWireCall({ hoot: true });
        } else {
          await startPrivateWireCall({ autoRing: true, status: 'ringing' });
        }
      } catch (error) {
        const status = error?.response?.status;
        const errMsg = error?.response?.data?.error || error?.response?.data?.details || '';
        if (status === 409 || /ringing|answer|conflict/i.test(String(errMsg))) {
          try {
            await answerIncomingCall({ buttonNumber, lineId: line.id, assignment });
            return;
          } catch (answerError) {
            toast.error(answerError?.response?.data?.error || 'Failed to answer incoming call');
            return;
          }
        }
        toast.error(errMsg || 'Failed to initiate call');
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
  }, [pageAssignments, getLineFromAssignment, dialedDigits, transferMode, conferenceMode, selectedLine, ringingLines, socketRingingLineIds, incomingSipCalls, answerIncomingCall, startLineCall, activeCalls, lineStatus.ringingLines, stopLineCall]);

  // Handle monitor toggle
  const handleMonitorToggle = useCallback(async (buttonNumber, enabled) => {
    const assignment = getButtonAssignment(pageAssignments, buttonNumber);
    if (!assignment) return;

    const line = getLineFromAssignment(assignment);
    if (!line) return;

    // Only private wires support monitor mode with Matrix room creation
    if (!isPrivateWireAssignment(assignment)) {
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
        const entry = {
          buttonNumber,
          pageNumber: currentPage,
          line,
          assignment,
          matrixRoomId: response.data.matrixRoomId,
        };
        setMonitoredLines((prev) => {
          const next = [...prev.filter((m) => m.line?.id !== line.id), entry];
          persistMonitoredLineIds(next);
          return next;
        });
        
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
        setMonitoredLines((prev) => {
          const next = prev.filter((m) => m.line?.id !== line.id);
          persistMonitoredLineIds(next);
          return next;
        });
        
        if (response.data.remainingMonitors === 0) {
          toast.info('All users stopped monitoring. Matrix room remains active.');
        } else {
          toast.success('Monitoring disabled');
        }
      } catch (error) {
        toast.error('Failed to disable monitor');
      }
    }
  }, [pageAssignments, getLineFromAssignment, monitoredLines, currentPage, persistMonitoredLineIds]);

  // Assign line to speaker panel (SPK toggle) — listen-only until panel slot is clicked.
  const handleAssignToggle = useCallback(async (buttonNumber, enabled) => {
    const assignment = getButtonAssignment(pageAssignments, buttonNumber);
    if (!assignment) return;

    const line = getLineFromAssignment(assignment);
    if (!line) return;

    if (!isPrivateWireAssignment(assignment)) {
      toast.error('Assign to speaker is only available for private wires');
      return;
    }

    if (enabled) {
      if (assignedLines.length >= 10) {
        toast.error('Maximum 10 lines on speaker panel');
        return;
      }
      try {
        const response = await api.post(`/api/dealerboard/private-wires/${line.id}/monitor`, { enabled: true });
        const mediaGroupId = response.data?.mediaGroupId;
        const entry = {
          buttonNumber,
          pageNumber: currentPage,
          line,
          assignment,
          mediaGroupId,
        };
        if (mediaGroupId) {
          await startLineListen(mediaGroupId);
        }
        setAssignedLines((prev) => {
          const next = [...prev.filter((a) => a.line?.id !== line.id), entry];
          persistSpeakerLineIds(next);
          return next;
        });
        toast.success('Line assigned to speaker — click panel to talk');
      } catch (error) {
        toast.error('Failed to assign line to speaker');
      }
    } else {
      const existing = assignedLines.find((a) => a.buttonNumber === buttonNumber);
      const mediaGroupId = existing?.mediaGroupId;

      if (speakingLineId === line.id) {
        try {
          await api.post(`/api/dealerboard/private-wires/${line.id}/end`, {});
        } catch {
          // Clear local talk state even if backend has no active call
        }
        setSpeakingLineId(null);
        activeLineMediaRef.current.delete(buttonNumber);
      }

      if (mediaGroupId) {
        stopLineCall(mediaGroupId);
      }

      try {
        await api.post(`/api/dealerboard/private-wires/${line.id}/monitor`, { enabled: false });
      } catch {
        // Non-fatal
      } finally {
        setAssignedLines((prev) => {
          const next = prev.filter((a) => a.buttonNumber !== buttonNumber);
          persistSpeakerLineIds(next);
          return next;
        });
      }
    }
  }, [
    pageAssignments,
    getLineFromAssignment,
    assignedLines,
    currentPage,
    persistSpeakerLineIds,
    speakingLineId,
    startLineListen,
    stopLineCall,
  ]);

  const stopSpeakerTalk = useCallback(async (entry) => {
    if (!entry?.line?.id) return;
    const { buttonNumber, line, mediaGroupId } = entry;

    try {
      await api.post(`/api/dealerboard/private-wires/${line.id}/end`, {});
    } catch {
      // Non-fatal
    }

    if (mediaGroupId) {
      stopLineCall(mediaGroupId);
      try {
        await startLineListen(mediaGroupId);
      } catch {
        // Listen restore is best-effort
      }
    }

    activeLineMediaRef.current.delete(buttonNumber);
    setSpeakingLineId((prev) => (prev === line.id ? null : prev));
  }, [stopLineCall, startLineListen]);

  const handleSpeakerSlotSpeak = useCallback(async (entry) => {
    if (!entry?.line?.id) return;
    const { buttonNumber, line, mediaGroupId: listenGroupId } = entry;
    const lineId = line.id;

    if (speakingLineId === lineId) {
      await stopSpeakerTalk(entry);
      return;
    }

    const currentTalker = assignedLines.find((a) => a.line?.id === speakingLineId);
    if (currentTalker) {
      await stopSpeakerTalk(currentTalker);
    }

    try {
      const response = await api.post(`/api/dealerboard/private-wires/${lineId}/call`, {});
      const mediaGroupId = response.data?.mediaGroupId || listenGroupId;
      if (mediaGroupId) {
        await startLineCall(mediaGroupId);
        activeLineMediaRef.current.set(buttonNumber, mediaGroupId);
      }
      setSpeakingLineId(lineId);
      setSelectedLine({ buttonNumber, line, assignment: entry.assignment });
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to open mic on line');
    }
  }, [assignedLines, speakingLineId, stopSpeakerTalk, startLineCall]);

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
    setTransferMode(false);
    setConferenceMode(false);
    setDialedDigits('');

    let target = selectedLine;
    if (!target && speakingLineId) {
      const speakerEntry = assignedLines.find((a) => a.line?.id === speakingLineId);
      if (speakerEntry) {
        target = {
          buttonNumber: speakerEntry.buttonNumber,
          line: speakerEntry.line,
          assignment: speakerEntry.assignment,
        };
      }
    }
    if (!target && activeCalls.size > 0) {
      for (const [buttonNumber, call] of activeCalls.entries()) {
        const assignment = getButtonAssignment(pageAssignments, buttonNumber);
        const line = assignment ? getLineFromAssignment(assignment) : null;
        if (line && call?.lineId) {
          target = { buttonNumber, line, assignment };
          break;
        }
      }
    }

    if (!target?.line?.id) return;

    try {
      const isPrivateWire = target.line.type === 'private_wire' || isPrivateWireAssignment(target.assignment);
      const endpoint = isPrivateWire
        ? `/api/dealerboard/private-wires/${target.line.id}/end`
        : `/api/dealerboard/lines/${target.line.id}/end`;

      const response = await api.post(endpoint);

      const mediaGroupId = activeLineMediaRef.current.get(target.buttonNumber);
      if (mediaGroupId) {
        stopLineCall(mediaGroupId);
        activeLineMediaRef.current.delete(target.buttonNumber);
      }

      const speakerEntry = assignedLines.find((a) => a.line?.id === target.line.id);
      if (speakerEntry?.mediaGroupId && speakingLineId === target.line.id) {
        try {
          await startLineListen(speakerEntry.mediaGroupId);
        } catch {
          // Best-effort restore listen-only on speaker panel
        }
        setSpeakingLineId(null);
      }

      setActiveCalls((prev) => {
        const next = new Map(prev);
        next.delete(target.buttonNumber);
        return next;
      });
      setIncomingSipCalls((prev) => {
        const next = new Map(prev);
        next.delete(target.line.id);
        return next;
      });
      setSocketRingingLineIds((prev) => {
        const next = new Set(prev);
        next.delete(target.line.id);
        return next;
      });

      if (selectedLine?.buttonNumber === target.buttonNumber) {
        setSelectedLine(null);
      }

      if (response.data.remainingUsers !== undefined && response.data.remainingUsers < 3) {
        toast.info('Matrix room remains active for other users');
      } else {
        toast.success('Call ended');
      }
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to end call');
    }
  }, [selectedLine, speakingLineId, assignedLines, activeCalls, pageAssignments, getLineFromAssignment, stopLineCall, startLineListen]);

  const handleTransfer = useCallback(async () => {
    if (!selectedLine?.line?.id) return;

    if (dialedDigits) {
      try {
        await api.post(`/api/dealerboard/lines/${selectedLine.line.id}/transfer`, {
          digits: dialedDigits,
        });
        setDialedDigits('');
        setTransferMode(false);
        toast.success('Transfer initiated');
      } catch (error) {
        toast.error(error?.response?.data?.error || 'Transfer failed');
      }
      return;
    }

    setConferenceMode(false);
    setTransferMode(true);
    toast('Select target line for transfer', { icon: '↪️' });
  }, [selectedLine, dialedDigits]);

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
          matrixRoomId: response.data.matrixRoomId,
          mediaGroupId: response.data.mediaGroupId,
        }));
        
        if (response.data.mediaGroupId) {
          toast.success(response.data.joinedExistingCall ? 'Joined shared line' : 'Line connected');
        }
      } catch (error) {
        toast.error('Failed to dial');
      }
    }
  }, [selectedLine, dialedDigits]);

  const handleConference = useCallback(async () => {
    if (!selectedLine?.line?.id) return;
    setTransferMode(false);
    setConferenceMode(true);
    toast('Select another line to conference', { icon: '👥' });
  }, [selectedLine]);

  // Real-time line state updates from SIP layer
  useEffect(() => {
    if (!socket) return undefined;

    const handleLineSipState = (data) => {
      const lineId = data?.lineId;
      if (!lineId) return;

      const status = String(data.status || '').toLowerCase();
      const reason = String(data.reason || '').toLowerCase();

      if (status === 'ringing' || status === 'incoming' || status === 'initiating') {
        setSocketRingingLineIds((prev) => new Set(prev).add(lineId));
        if (data.sipCallId || data.callId) {
          setIncomingSipCalls((prev) => new Map(prev).set(lineId, data.sipCallId || data.callId));
        }
      } else if (status === 'connected' || reason === 'line_released' || status === 'idle' || status === 'ended') {
        setSocketRingingLineIds((prev) => {
          const next = new Set(prev);
          next.delete(lineId);
          return next;
        });
        if (status !== 'ringing') {
          setIncomingSipCalls((prev) => {
            const next = new Map(prev);
            next.delete(lineId);
            return next;
          });
        }
      }

      if (status === 'connected') {
        setActiveCalls((prev) => {
          const located = findButtonForLineId(lineId);
          if (!located) return prev;
          const next = new Map(prev);
          const existing = next.get(located.buttonNumber);
          if (existing) {
            next.set(located.buttonNumber, { ...existing, status: 'connected' });
          }
          return next;
        });
      }

      if (data.reason === 'line_released' || status === 'idle' || status === 'ended') {
        setActiveCalls((prev) => {
          const next = new Map(prev);
          for (const [buttonNumber, call] of prev.entries()) {
            if (call?.lineId === lineId) {
              const mediaGroupId = activeLineMediaRef.current.get(buttonNumber);
              if (mediaGroupId) {
                stopLineCall(mediaGroupId);
                activeLineMediaRef.current.delete(buttonNumber);
              }
              next.delete(buttonNumber);
            }
          }
          return next;
        });
        setSelectedLine((current) => (
          current?.line?.id === lineId ? null : current
        ));
      }
    };

    const handleLineSipIncoming = async (data) => {
      const lineId = data?.lineId;
      if (!lineId) return;
      const status = String(data.status || 'ringing').toLowerCase();

      if (status === 'connected' && data.autoJoin) {
        setSocketRingingLineIds((prev) => {
          const next = new Set(prev);
          next.delete(lineId);
          return next;
        });

        const located = findButtonForLineId(lineId);
        if (located?.assignment && data.mediaGroupId) {
          try {
            await startLineCall(data.mediaGroupId);
            activeLineMediaRef.current.set(located.buttonNumber, data.mediaGroupId);
            setActiveCalls((prev) => new Map(prev).set(located.buttonNumber, {
              lineId,
              status: 'connected',
              mediaGroupId: data.mediaGroupId,
              sipCallId: data.sipCallId || data.callId,
            }));
            const line = getLineFromAssignment(located.assignment);
            if (line) {
              setSelectedLine({
                buttonNumber: located.buttonNumber,
                line,
                assignment: located.assignment,
              });
            }
            toast.success('Line connected');
          } catch (error) {
            toast.error('Connected but audio failed to start');
          }
        }
        return;
      }

      setSocketRingingLineIds((prev) => new Set(prev).add(lineId));
      if (data.sipCallId || data.callId) {
        setIncomingSipCalls((prev) => new Map(prev).set(lineId, data.sipCallId || data.callId));
      }
    };

    socket.on('line-sip-state', handleLineSipState);
    socket.on('line-sip-incoming', handleLineSipIncoming);
    return () => {
      socket.off('line-sip-state', handleLineSipState);
      socket.off('line-sip-incoming', handleLineSipIncoming);
    };
  }, [socket, findButtonForLineId, getLineFromAssignment, startLineCall, stopLineCall]);

  const activeLineCall = selectedLine
    ? activeCalls.get(selectedLine.buttonNumber)
    : null;

  return (
    <Container>
      {activeLineCall && selectedLine?.line && (
        <LineCallBanner $ringing={activeLineCall.status === 'ringing'}>
          <FiPhone />
          {activeLineCall.status === 'ringing' ? 'Ringing' : 'Connected'} — {selectedLine.line.label || selectedLine.line.name || 'Line'}
        </LineCallBanner>
      )}

      <StatusBar>
        {selectedLine?.line ? (
          <>
            <strong>{selectedLine.line.label || selectedLine.line.name || 'Line'}</strong>
            <span>{selectedLine.buttonNumber}-{currentPage}</span>
            {activeLineCall && (
              <StatusChip $bg={activeLineCall.status === 'ringing' ? '#dc2626' : '#166534'}>
                {activeLineCall.status === 'ringing' ? 'RINGING' : 'CONNECTED'}
              </StatusChip>
            )}
          </>
        ) : (
          <span>No line selected</span>
        )}
        {dialedDigits && <span>Dial: <strong>{dialedDigits}</strong></span>}
        {transferMode && <StatusChip $bg="#6366f1">XFER</StatusChip>}
        {conferenceMode && <StatusChip $bg="#6366f1">CONF</StatusChip>}
        {allRingingTargets.length > 0 && (
          <StatusChip $bg="#dc2626" $border="#ef4444">
            {allRingingTargets.length} INCOMING
          </StatusChip>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <LegendItem><LegendSwatch $color="#151520" $border="#2a2a3a" /> Idle</LegendItem>
          <LegendItem><LegendSwatch $color="#dc2626" $border="#ef4444" /> Ring</LegendItem>
          <LegendItem><LegendSwatch $color="#166534" $border="#22c55e" /> Private</LegendItem>
          <LegendItem><LegendSwatch $color="#1e3a5f" $border="#f59e0b" /> MON</LegendItem>
          <LegendItem><LegendSwatch $color="#1e3a8a" $border="#3b82f6" /> SPK</LegendItem>
        </span>
      </StatusBar>

      <MainContent>
        <ButtonGridContainer>
          <ButtonGrid>
            {Array.from({ length: buttonsPerPage }, (_, i) => {
              const buttonNumber = i + 1;
              const assignment = getButtonAssignment(pageAssignments, buttonNumber);
              const line = assignment ? getLineFromAssignment(assignment) : null;
              const lineId = resolveAssignmentLineId(assignment);
              const isMonitored = lineId && monitoredLines.some(
                (m) => String(m.line?.id || m.lineId) === String(lineId)
              );
              const isAssigned = lineId && assignedLines.some(
                (a) => String(a.line?.id) === String(lineId)
              );
              const isSpeakingOnLine = lineId && speakingLineId === lineId;
              const activeCall = activeCalls.get(buttonNumber);
              const localPrivate = !!activeCall;
              const isPrivate = localPrivate || (lineId && lineStatus.privateLines.includes(lineId));
              const isRinging = ringingLines.some((r) => r.buttonNumber === buttonNumber)
                || (lineId && socketRingingLineIds.has(lineId))
                || (lineId && (lineStatus.ringingLines || []).includes(lineId));
              const isBusy = lineId && !isPrivate && lineStatus.busyLines.includes(lineId);
              const isDisconnected = lineId
                && !isPrivate
                && !isBusy
                && !isRinging
                && lineStatus.disconnectedLines.includes(lineId);

              const isAudioActive = localPrivate || isAssigned || isMonitored || isSpeakingOnLine;
              
              return (
                <LineButton
                  key={buttonNumber}
                  buttonNumber={buttonNumber}
                  pageNumber={currentPage}
                  assignment={assignment}
                  line={line}
                  lines={availableLines || []}
                  speedDials={speedDials}
                  isMonitored={isMonitored}
                  isAssigned={isAssigned}
                  isAudioActive={isAudioActive}
                  isPrivate={isPrivate}
                  isBusy={isBusy}
                  isRinging={isRinging}
                  isDisconnected={isDisconnected}
                  onLineClick={() => handleLineClick(buttonNumber)}
                  onMonitorToggle={(enabled) => handleMonitorToggle(buttonNumber, enabled)}
                  onAssignToggle={(enabled) => handleAssignToggle(buttonNumber, enabled)}
                />
              );
            })}
          </ButtonGrid>
          
        </ButtonGridContainer>

        <MonitorColumn>
          <MonitorHeader>Speaker · {assignedLines.length}/10</MonitorHeader>
          <MonitorButtons>
            {Array.from({ length: 10 }, (_, idx) => {
              const assigned = assignedLines[idx];
              const lineId = assigned?.line?.id;
              return (
                <MonitorButton
                  key={idx}
                  slotIndex={idx + 1}
                  line={assigned?.line}
                  buttonNumber={assigned?.buttonNumber}
                  pageNumber={assigned?.pageNumber}
                  isSpeaking={lineId && speakingLineId === lineId}
                  onSpeakClick={assigned ? () => handleSpeakerSlotSpeak(assigned) : undefined}
                  onRemove={assigned?.line?.id
                    ? () => handleAssignToggle(assigned.buttonNumber, false)
                    : undefined}
                />
              );
            })}
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
          <ControlButton onClick={handleTransfer} disabled={!selectedLine} $active={transferMode}>
            Xfer
          </ControlButton>
          <ControlButton onClick={handleSignal} disabled={!selectedLine}>
            Signal
          </ControlButton>
          <ControlButton $variant="primary" onClick={handleCall} disabled={!dialedDigits && !selectedLine}>
            <FiPhoneCall />
            Call
          </ControlButton>
          <ControlButton onClick={handleConference} disabled={!selectedLine} $active={conferenceMode}>
            Conf
          </ControlButton>
          <ControlButton $variant="danger" $large onClick={handleEndCall} disabled={activeCalls.size === 0 && !selectedLine && !dialedDigits}>
            <FiPhoneOff />
            End Call
          </ControlButton>
        </ControlButtons>
      </ControlsSection>
    </Container>
  );
};

export default DealerboardTab;

