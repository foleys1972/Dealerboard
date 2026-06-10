import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { FiGrid, FiRadio, FiPhone, FiLink, FiHash, FiVolume2, FiDroplet, FiEye, FiUsers } from 'react-icons/fi';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { Button, Input, Select, Card } from '../../styles/GlobalStyle';
import { normalizeClientFlag, getDefaultLayoutTab } from '../../utils/clientAccess';
import {
  getAssignmentTypeMeta,
  getLineKindMeta,
  ASSIGNMENT_TYPE_META,
} from '../../utils/dealerboardAssignment';
import { LineTypeBadge, AssignmentLabelPreview } from '../Dealerboard/AssignmentTypeBadge';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 100%;
  overflow: visible;
  height: 100%;
  flex: 1;
  min-height: 0;
`;

const Section = styled.div`
  background: ${props => props.theme.colors.surface};
  border-radius: 12px;
  padding: 1rem;
  border: 1px solid ${props => props.theme.colors.border};
  width: 100%;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
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

const WorkspaceRow = styled.div`
  display: flex;
  gap: 1.25rem;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  align-items: flex-start;
`;

const GridPanel = styled.div`
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
`;

const SidePanel = styled.div`
  flex: 1;
  min-width: 280px;
  max-width: 380px;
  background: ${props => props.theme.colors.surfaceElevated || '#f9fafb'};
  border: 1px solid ${props => props.theme.colors.border || '#e5e7eb'};
  border-radius: 10px;
  padding: 1rem;
  overflow-y: auto;
  max-height: calc(92vh - 220px);
`;

const SidePanelTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
`;

const ButtonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 68px);
  grid-auto-rows: 54px;
  gap: 5px;
  padding: 10px;
  background: ${props => props.theme.colors.surfaceElevated || '#f3f4f6'};
  border-radius: 8px;
  border: 1px solid ${props => props.theme.colors.border || '#e5e7eb'};
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
  box-sizing: border-box;
`;

const IntercomButtonGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated || '#f3f4f6'};
  border-radius: 8px;
  border: 1px solid ${props => props.theme.colors.border || '#e5e7eb'};
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
  flex: 0 0 auto;
  overflow-y: auto;
  max-height: calc(92vh - 220px);
`;

const IntercomSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const IntercomSectionTitle = styled.h4`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${props => props.theme.colors.textSecondary || '#6b7280'};
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const IntercomButtonRow = styled.div`
  display: grid;
  grid-template-columns: repeat(${props => props.columns || 4}, 72px);
  gap: 5px;
`;

const IntercomHint = styled.p`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary || '#6b7280'};
  margin: 0;
  line-height: 1.4;
`;

const IntercomButton = styled.button`
  height: 46px;
  width: 72px;
  border: 1px solid ${props => {
    if (props.$selected) return props.theme.colors.accent || '#06b6d4';
    if (props.$hasAssignment) return props.theme.colors.success || '#10b981';
    return props.theme.colors.border || '#d1d5db';
  }};
  background: ${props => {
    if (props.$selected) return `${props.theme.colors.accent || '#06b6d4'}18`;
    if (props.$hasAssignment) return `${props.theme.colors.success || '#10b981'}12`;
    return props.theme.colors.surface || '#ffffff';
  }};
  border-radius: 5px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 3px 4px;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  position: relative;
  font-weight: 500;
  box-shadow: ${props => props.$selected ? '0 0 0 2px rgba(6, 182, 212, 0.25)' : 'none'};
  opacity: ${props => props.$hasAssignment ? '1' : '0.7'};

  &:hover {
    border-color: ${props => props.theme.colors.accent || '#06b6d4'};
    opacity: 1;
  }
`;

const IntercomButtonIndex = styled.span`
  font-size: 0.6rem;
  font-weight: 600;
  color: ${props => props.theme.colors.textSecondary || '#9ca3af'};
  line-height: 1;
`;

const IntercomButtonLabel = styled.span`
  font-size: 0.65rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text || '#111827'};
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  line-height: 1.1;
`;

const StatusDot = styled.span.withConfig({
  shouldForwardProp: (prop) => prop !== '$color'
})`
  position: absolute;
  top: 3px;
  left: 3px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: ${props => props.$color || '#6b7280'};
  box-shadow: 0 0 0 1px rgba(255,255,255,0.8);
`;

const IntercomOnDealerboardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(240px, 1fr));
  gap: 1.25rem;
  width: 100%;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const PageSelector = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const PageButton = styled.button`
  padding: 0.5rem 1rem;
  border: 1px solid ${props => props.$active ? props.theme.colors.accent : props.theme.colors.border};
  background: ${props => props.$active ? props.theme.colors.accent : 'transparent'};
  color: ${props => props.$active ? 'white' : props.theme.colors.text};
  border-radius: 6px;
  cursor: pointer;
  font-weight: ${props => props.$active ? '600' : '400'};
  transition: all 0.2s;

  &:hover {
    background: ${props => props.$active ? props.theme.colors.accent : props.theme.colors.surfaceElevated};
  }
`;

const LayoutButton = styled.button`
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 3px solid ${props => {
    if (props.$selected) return props.theme.colors.accent || '#06b6d4';
    if (props.$hasAssignment) return props.theme.colors.success || '#10b981';
    return props.theme.colors.border || '#e5e7eb';
  }};
  background: ${props => {
    if (props.$selected) return `${props.theme.colors.accent || '#06b6d4'}20`;
    if (props.$hasAssignment) return `${props.theme.colors.success || '#10b981'}15`;
    return props.theme.colors.surface || '#ffffff';
  }};
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
  transition: all 0.2s;
  position: relative;
  font-weight: 500;
  box-shadow: ${props => props.$selected ? '0 4px 12px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.1)'};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    border-width: 3px;
  }

  &:active {
    transform: translateY(0);
  }

  ${props => props.$busy && `
    border-color: #ef4444 !important;
    background: #ef4444 !important;
    color: #ffffff !important;
    box-shadow: 0 0 22px rgba(239, 68, 68, 0.35) !important;
  `}

  ${props => props.$forwarded && `
    border-color: #f59e0b !important;
    background: #f59e0b !important;
    color: #111827 !important;
    box-shadow: 0 0 18px rgba(245, 158, 11, 0.25) !important;
  `}

  ${props => props.$ringing && `
    animation: ringFlash 0.8s infinite;
    border-color: #ef4444 !important;
    background: #ef4444 !important;
    color: #ffffff !important;
    box-shadow: 0 0 26px rgba(239, 68, 68, 0.55) !important;
  `}

  @keyframes ringFlash {
    0%, 100% { 
      opacity: 1;
      transform: scale(1);
      filter: brightness(1);
    }
    50% { 
      opacity: 0.65;
      transform: scale(1.01);
      filter: brightness(0.85);
    }
  }
`;

const ButtonNumber = styled.div`
  font-size: 1rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text || '#111827'};
  line-height: 1;
`;

const ButtonLabel = styled.div`
  font-size: 0.7rem;
  color: ${props => props.theme.colors.textSecondary || '#6b7280'};
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  font-weight: 500;
  line-height: 1.2;
  max-height: 2.4em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const ButtonTypeChip = styled.div`
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: ${props => props.$color || '#6b7280'};
  background: ${props => props.$bg || 'rgba(107, 114, 128, 0.12)'};
  border: 1px solid ${props => props.$border || '#6b7280'};
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
  text-transform: uppercase;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TypeLegend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  align-items: center;
`;

const DealerboardLegend = styled.div`
  font-size: 0.8rem;
  color: ${props => props.theme.colors.textSecondary || '#6b7280'};
  margin-bottom: 0.75rem;
  line-height: 1.2;
`;

const GroupConfigBanner = styled.div`
  font-size: 0.8rem;
  color: #0c4a6e;
  background: #e0f2fe;
  border: 1px solid #7dd3fc;
  border-radius: 8px;
  padding: 0.65rem 0.85rem;
  margin-bottom: 0.75rem;
  line-height: 1.45;

  strong {
    color: #0369a1;
  }
`;

const BusyIndicator = styled.div`
  font-size: 0.65rem;
  color: #ef4444;
  font-weight: 600;
  text-align: center;
  margin-top: 2px;
  line-height: 1;
`;

const AssignmentPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 60vh;
  overflow-y: auto;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
`;

const CompactFormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
`;

const Label = styled.label`
  font-weight: 600;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text};
`;

const CompactLabel = styled.label`
  font-size: 0.8rem;
  font-weight: 500;
  color: ${props => props.theme.colors.text};
  margin-bottom: 0.2rem;
`;

const CompactSelect = styled.select`
  padding: 0.5rem;
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  font-size: 0.875rem;
  background: ${props => props.theme.colors.surface};
  color: ${props => props.theme.colors.text};
  width: 100%;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.accent}20;
  }
  
  option {
    padding: 0.25rem;
    font-size: 0.875rem;
  }
`;

const ColorPicker = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const ColorOption = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 2px solid ${props => props.$selected ? props.theme.colors.accent : 'transparent'};
  cursor: pointer;
  background: ${props => props.$color};
  transition: all 0.2s;

  &:hover {
    transform: scale(1.1);
  }
`;

const ViewingKeyIndicator = styled.div`
  position: absolute;
  top: 4px;
  right: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.$active ? '#10b981' : '#6b7280'};
  border: 2px solid white;
`;

const TabContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid ${props => props.theme.colors.border || '#e5e7eb'};
`;

const TabButton = styled.button`
  padding: 0.75rem 1.5rem;
  border: none;
  background: transparent;
  color: ${props => props.$active ? props.theme.colors.accent || '#06b6d4' : props.theme.colors.textSecondary || '#6b7280'};
  border-bottom: 3px solid ${props => props.$active ? props.theme.colors.accent || '#06b6d4' : 'transparent'};
  cursor: pointer;
  font-weight: ${props => props.$active ? '600' : '400'};
  font-size: 1rem;
  transition: all 0.2s;
  margin-bottom: -2px;

  &:hover {
    color: ${props => props.theme.colors.accent || '#06b6d4'};
  }
`;

const UserButtonLayout = ({ userId, onSave, onCancel, intercomEnabled = true, dealerboardEnabled = false }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedButton, setSelectedButton] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [preferences, setPreferences] = useState({
    audibleRinging: true,
    buttonColors: {},
    viewingKey: false,
    ringingTone: 'default'
  });
  const [availableLines, setAvailableLines] = useState([]);
  const [availableBroadcasts, setAvailableBroadcasts] = useState([]);
  const [availableSpeedDials, setAvailableSpeedDials] = useState([]);
  const [availablePrivateWires, setAvailablePrivateWires] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]); // For group calls (non-broadcast groups)
  const [availableContacts, setAvailableContacts] = useState([]); // For direct contacts (users)
  const [loading, setLoading] = useState(false);
  const [ringingButtons, setRingingButtons] = useState(new Set());
  const [busyLines, setBusyLines] = useState(new Set()); // Track lines that are busy (have active calls)
  const [ringingLineIds, setRingingLineIds] = useState(new Set()); // Track lines that are ringing (line ids)

  const prevRingingButtonsRef = useRef(new Set());
  const audioCtxRef = useRef(null);
  const pollingRef = useRef(null);
  const canShowIntercom = normalizeClientFlag(intercomEnabled, true);
  const canShowDealerboard = normalizeClientFlag(dealerboardEnabled, false);
  const showBothModules = canShowIntercom && canShowDealerboard;

  const [activeTab, setActiveTab] = useState(() =>
    getDefaultLayoutTab({ intercomEnabled, dealerboardEnabled })
  );

  // Keep the active tab aligned with which clients the user has enabled.
  useEffect(() => {
    setActiveTab((current) => {
      if (!canShowDealerboard && canShowIntercom) return current.startsWith('intercom') ? current : 'intercom';
      if (!canShowIntercom && canShowDealerboard) return current.startsWith('dealerboard') ? current : 'dealerboard';
      if (canShowDealerboard && canShowIntercom) {
        if (current === 'dealerboard' || current === 'intercom') return current;
        return 'dealerboard';
      }
      return getDefaultLayoutTab({ intercomEnabled, dealerboardEnabled });
    });
    setSelectedButton(null);
  }, [intercomEnabled, dealerboardEnabled, canShowDealerboard, canShowIntercom]);

  const [lineCallForwardDraft, setLineCallForwardDraft] = useState({ enabled: false, forwardToUri: '' });
  const [dealerboardAssignType, setDealerboardAssignType] = useState('line'); // line | speedDial | viewingKey | callForwardKey
  const [lineAorInput, setLineAorInput] = useState('');
  const [lineAorResolved, setLineAorResolved] = useState(null); // { kind, id, aor, name }
  const [lineButtonLabelInput, setLineButtonLabelInput] = useState('');
  const [speedDialNumberInput, setSpeedDialNumberInput] = useState('');
  const [speedDialLabelInput, setSpeedDialLabelInput] = useState('');
  const [cfFromAorInput, setCfFromAorInput] = useState('');
  const [cfFromResolved, setCfFromResolved] = useState(null);
  const [cfToNumberInput, setCfToNumberInput] = useState('');
  const [intercomPendingAssignId, setIntercomPendingAssignId] = useState('');
  const [dealerboardGroup, setDealerboardGroup] = useState(null);
  const prevSelectedButtonRef = useRef(null);

  const resetButtonEditorState = useCallback(() => {
    setSelectedButton(null);
    prevSelectedButtonRef.current = null;
    setDealerboardAssignType('line');
    setLineAorInput('');
    setLineAorResolved(null);
    setLineButtonLabelInput('');
    setSpeedDialNumberInput('');
    setSpeedDialLabelInput('');
    setCfFromAorInput('');
    setCfFromResolved(null);
    setCfToNumberInput('');
    setIntercomPendingAssignId('');
    setLineCallForwardDraft({ enabled: false, forwardToUri: '' });
  }, []);

  const handleCancelEditing = () => {
    resetButtonEditorState();
    if (onCancel) {
      onCancel();
    }
  };
  
  // Dealerboard Settings State
  const [dealerboardSettings, setDealerboardSettings] = useState({
    callForward: {
      enabled: false,
      forwardToUserId: '',
      condition: 'immediate' // 'immediate', 'busy', 'no-answer'
    },
    dnd: false,
    handsets: 1, // 1 or 2
    speakerCount: 0 // 0-24
  });

  // Intercom Settings State
  const [intercomSettings, setIntercomSettings] = useState({
    directorySearch: 'public', // 'public' or 'private'
    callForward: {
      enabled: false,
      forwardToUserId: '',
      condition: 'immediate'
    },
    dnd: false
  });

  // Load configuration
  useEffect(() => {
    loadConfiguration();
    loadAvailableItems();
  }, [userId]);

  // When selecting a button, pre-fill the assignment editor so existing assignments can be edited.
  useEffect(() => {
    if (!selectedButton) {
      prevSelectedButtonRef.current = null;
      return;
    }

    if (prevSelectedButtonRef.current === selectedButton) return;
    prevSelectedButtonRef.current = selectedButton;

    // Reset drafts
    setDealerboardAssignType('line');
    setLineAorInput('');
    setLineAorResolved(null);
    setLineButtonLabelInput('');
    setSpeedDialNumberInput('');
    setSpeedDialLabelInput('');
    setCfFromAorInput('');
    setCfFromResolved(null);
    setCfToNumberInput('');

    const parts = selectedButton.split('-');
    const firstPartNum = Number(parts[0]);
    const selectedIsDealerboard = Number.isFinite(firstPartNum) && !Number.isNaN(firstPartNum);
    if (!selectedIsDealerboard) return; // Intercom buttons handled elsewhere

    const [page, button] = parts.map(Number);
    const assignment = getButtonAssignment(page, button);
    if (!assignment) return;

    if (assignment.assignmentType === 'speedDial') {
      setDealerboardAssignType('speedDial');
      const speedDial = availableSpeedDials.find(sd => sd.id === assignment.speedDialId);
      setSpeedDialNumberInput(speedDial?.number || '');
      setSpeedDialLabelInput(assignment.metadata?.label || '');
      return;
    }

    if (assignment.assignmentType === 'viewingKey' || assignment.assignmentType === 'viewRingLines') {
      setDealerboardAssignType('viewingKey');
      return;
    }

    if (assignment.assignmentType === 'callForward') {
      setDealerboardAssignType('callForwardKey');
      const fromAor = assignment.metadata?.from?.aor || assignment.metadata?.from?.aorInput || '';
      const to = assignment.metadata?.to?.target || '';
      setCfFromAorInput(fromAor);
      setCfToNumberInput(to);
      return;
    }

    // Line-like assignments: prefill AOR if we can
    setDealerboardAssignType('line');
    if (assignment.assignmentType === 'privateWire') {
      const pw = availablePrivateWires.find(p => p.id === assignment.lineId);
      const aor = pw?.aor || '';
      setLineAorInput(aor);
      // Allow editing existing line buttons even if AOR isn't currently available in the cache.
      setLineAorResolved({ kind: 'privateWire', id: assignment.lineId, aor, name: pw?.lineLabel || 'Private Wire' });
      setLineButtonLabelInput(assignment.metadata?.label || '');
      return;
    }

    if (assignment.assignmentType === 'ddiLine') {
      const ddi = availableLines.find(l => l.type === 'DDI' && l.id === assignment.ddiLineId);
      const aor = ddi?.aor || '';
      setLineAorInput(aor);
      // Allow editing existing line buttons even if AOR isn't currently available in the cache.
      setLineAorResolved({ kind: 'ddiLine', id: assignment.ddiLineId, aor, name: ddi?.label || ddi?.name || 'DDI Line' });
      setLineButtonLabelInput(assignment.metadata?.label || '');
      return;
    }

    if (assignment.assignmentType === 'broadcast') {
      const b = availableBroadcasts.find(x => x.id === (assignment.broadcastId || assignment.lineId));
      const aor = String(b?.metadata?.aor || `BCAST:${b?.id || assignment.broadcastId || assignment.lineId}`);
      setLineAorInput(aor);
      setLineAorResolved({ kind: 'broadcast', id: (assignment.broadcastId || assignment.lineId), aor, name: b?.name || 'Broadcast' });
      setLineButtonLabelInput(assignment.metadata?.label || '');
      return;
    }
  }, [selectedButton, assignments, availablePrivateWires, availableLines, availableBroadcasts, availableSpeedDials]);

  // Refresh contacts periodically so intercom contact status (DND / in-call) stays current even if websocket is down
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const refresh = async () => {
      try {
        const contactsResponse = await api.get('/api/auth/users');
        if (cancelled) return;
        const users = contactsResponse.data?.users || contactsResponse.data || [];
        if (Array.isArray(users)) {
          setAvailableContacts(users);
        }
      } catch {
        // ignore
      }
    };

    refresh();
    timer = setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      try { if (timer) clearInterval(timer); } catch {}
    };
  }, [userId]);

  const getIntercomContactDotColor = (contact) => {
    if (!contact) return '#6b7280';
    if (contact.intercomDnd) return '#f59e0b'; // amber
    if (contact.isInIntercomCall) return '#ef4444'; // red
    const online = contact.status === 'online' || contact.isOnline === true;
    return online ? '#10b981' : '#6b7280'; // green / gray
  };

  const getContactDbId = (c) => {
    if (!c) return null;
    // In /api/auth/users response, `id` is often username and `userId` is DB id.
    return c.userId || c.id || null;
  };

  const resolveInternalAor = async (aor) => {
    const v = (aor || '').trim();
    if (!v) return null;
    const resp = await api.get(`/api/dealerboard/lines/resolve?aor=${encodeURIComponent(v)}`);
    if (resp.data?.success) return resp.data;
    return null;
  };

  // Poll busy/ringing status while this panel is open
  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const resp = await api.get(`/api/dealerboard/lines/busy-status?userId=${userId}`);
        if (cancelled) return;
        if (resp.data?.success) {
          const busy = Array.isArray(resp.data.busyLines) ? resp.data.busyLines : [];
          const ringing = Array.isArray(resp.data.ringingLines) ? resp.data.ringingLines : [];
          const ringingButtons = Array.isArray(resp.data.ringingButtons) ? resp.data.ringingButtons : [];

          setBusyLines(new Set(busy.map(String)));
          setRingingLineIds(new Set(ringing.map(String)));

          const newRingingKeys = new Set(
            ringingButtons
              .map(b => `${Number(b.pageNumber)}-${Number(b.buttonNumber)}`)
              .filter(k => k !== 'NaN-NaN')
          );
          setRingingButtons(newRingingKeys);

          // Audible tone on newly-ringing keys
          const prev = prevRingingButtonsRef.current || new Set();
          let hasNew = false;
          for (const k of newRingingKeys) {
            if (!prev.has(k)) {
              hasNew = true;
              break;
            }
          }

          if (hasNew && preferences.audibleRinging) {
            try {
              if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
              }
              const ctx = audioCtxRef.current;
              const now = ctx.currentTime;

              // Simple two-tone ring (no external assets)
              const playTone = (freq, start, dur) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, start);
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(start);
                osc.stop(start + dur + 0.02);
              };

              playTone(440, now + 0.00, 0.18);
              playTone(660, now + 0.22, 0.18);
            } catch (e) {
              // ignore audio failures (browser permissions)
            }
          }

          prevRingingButtonsRef.current = newRingingKeys;
        }
      } catch (e) {
        // ignore polling errors
      }
    };

    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 1500);

    return () => {
      cancelled = true;
      try { if (pollingRef.current) clearInterval(pollingRef.current); } catch {}
      pollingRef.current = null;
    };
  }, [userId, preferences.audibleRinging]);

  const showAssignmentResultToast = (response, fallback = 'Button assigned successfully') => {
    const group = response?.data?.dealerboardGroup;
    const count = response?.data?.assignedTo || response?.data?.clearedFor || 1;
    if (group && count > 1) {
      toast.success(`Applied to ${count} users in dealerboard group "${group.name}"`);
      return;
    }
    toast.success(fallback);
  };

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/dealerboard/config/${userId}`);
      if (response.data?.success) {
        setAssignments(response.data.assignments || {});
        setDealerboardGroup(response.data.dealerboardGroup || null);
        setPreferences({
          audibleRinging: response.data.preferences?.audibleRinging ?? true,
          buttonColors: response.data.preferences?.buttonColors || {},
          viewingKey: response.data.preferences?.viewingKey ?? false,
          ringingTone: response.data.preferences?.ringingTone || 'default'
        });
        
        // Load dealerboard settings
        const settings = response.data.preferences?.dealerboardSettings || {};
        setDealerboardSettings({
          callForward: settings.callForward || { enabled: false, forwardToUserId: '', condition: 'immediate' },
          dnd: settings.dnd || false,
          handsets: settings.handsets || 1,
          speakerCount: settings.speakerCount || 0
        });
        
        // Load intercom settings
        const intercomSettingsData = response.data.preferences?.intercomSettings || {};
        setIntercomSettings({
          directorySearch: intercomSettingsData.directorySearch || 'public',
          callForward: intercomSettingsData.callForward || { enabled: false, forwardToUserId: '', condition: 'immediate' },
          dnd: intercomSettingsData.dnd || false
        });
        
        // Load busy lines status
        try {
          const busyStatusResponse = await api.get(`/api/dealerboard/lines/busy-status?userId=${userId}`);
          if (busyStatusResponse.data?.success && busyStatusResponse.data?.busyLines) {
            setBusyLines(new Set(busyStatusResponse.data.busyLines));
          }
        } catch (error) {
          // If endpoint doesn't exist yet, that's okay - we'll just not show busy status
          console.debug('Busy status endpoint not available:', error);
        }
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
      toast.error('Failed to load button layout configuration');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableItems = async () => {
    try {
      // Load lines
      const linesResponse = await api.get('/api/dealerboard/lines');
      if (linesResponse.data?.success) {
        setAvailableLines(linesResponse.data.lines || []);
      }

      // Load broadcasts - get all groups and filter for broadcasts
      try {
        // Prefer server-side filtering by callMode=broadcast (matches WPF/server group model)
        const allGroupsResponse = await api.get('/api/groups?callMode=broadcast');
        
        if (allGroupsResponse.data?.success && allGroupsResponse.data?.groups) {
          const allGroups = Array.isArray(allGroupsResponse.data.groups) 
            ? allGroupsResponse.data.groups 
            : [];
          
          // Defensive filter (in case callMode isn't set on some records)
          const broadcasts = allGroups.filter(g => (g.callMode || '').toLowerCase() === 'broadcast');
          
          setAvailableBroadcasts(broadcasts);
          console.log('Loaded broadcasts:', broadcasts.length, broadcasts.map(b => ({ id: b.id, name: b.name, callMode: b.callMode, type: b.type })));
        } else if (Array.isArray(allGroupsResponse.data)) {
          // API might return array directly
          const broadcasts = allGroupsResponse.data.filter(g => (g.callMode || '').toLowerCase() === 'broadcast');
          setAvailableBroadcasts(broadcasts);
          console.log('Loaded broadcasts (from array):', broadcasts.length, broadcasts.map(b => ({ id: b.id, name: b.name, callMode: b.callMode, type: b.type })));
        } else {
          console.warn('Unexpected groups API response format:', allGroupsResponse.data);
          setAvailableBroadcasts([]);
        }
      } catch (error) {
        console.error('Failed to load broadcasts:', error);
        console.error('Error details:', error.response?.data);
        setAvailableBroadcasts([]);
      }

      // Load speed dials
      const speedDialsResponse = await api.get(`/api/dealerboard/speed-dials?userId=${userId}`);
      if (speedDialsResponse.data?.success) {
        setAvailableSpeedDials(speedDialsResponse.data.speedDials || []);
      }

      // Load private wires
      const privateWiresResponse = await api.get('/api/dealerboard/private-wires');
      if (privateWiresResponse.data?.success) {
        // API returns 'wires' not 'privateWires'
        setAvailablePrivateWires(privateWiresResponse.data.wires || privateWiresResponse.data.privateWires || []);
      }

      // Load groups (for group calls - exclude broadcasts)
      try {
        const groupsResponse = await api.get('/api/groups');
        
        if (groupsResponse.data?.success && groupsResponse.data?.groups) {
          const allGroups = Array.isArray(groupsResponse.data.groups) ? groupsResponse.data.groups : [];
          // Filter out broadcasts - WPF/server uses callMode=broadcast for broadcast groups
          const regularGroups = allGroups.filter(g => {
            const callMode = (g.callMode || '').toLowerCase();
            if (callMode === 'broadcast') return false;
            if (g.isActive === false) return false;
            return true;
          });
          setAvailableGroups(regularGroups);
          console.log('Loaded groups (for group calls):', regularGroups.length, regularGroups.map(g => ({ id: g.id, name: g.name, callMode: g.callMode, type: g.type })));
        } else if (Array.isArray(groupsResponse.data)) {
          // API might return array directly
          const regularGroups = groupsResponse.data.filter(g => {
            const callMode = (g.callMode || '').toLowerCase();
            if (callMode === 'broadcast') return false;
            if (g.isActive === false) return false;
            return true;
          });
          setAvailableGroups(regularGroups);
          console.log('Loaded groups (from array):', regularGroups.length, regularGroups.map(g => ({ id: g.id, name: g.name, callMode: g.callMode, type: g.type })));
        } else {
          console.warn('Unexpected groups API response format:', groupsResponse.data);
          setAvailableGroups([]);
        }
      } catch (error) {
        console.error('Failed to load groups:', error);
        console.error('Error details:', error.response?.data);
        setAvailableGroups([]);
      }

      // Load contacts (users) for direct contacts
      try {
        const contactsResponse = await api.get('/api/auth/users');
        if (contactsResponse.data?.users || Array.isArray(contactsResponse.data)) {
          const users = contactsResponse.data?.users || contactsResponse.data || [];
          setAvailableContacts(users);
          console.log('Loaded contacts:', users.length);
        }
      } catch (error) {
        console.error('Failed to load contacts:', error);
        setAvailableContacts([]);
      }
    } catch (error) {
      console.error('Failed to load available items:', error);
    }
  };

  const getButtonAssignment = (page, button) => {
    return assignments[page]?.[button] || null;
  };

  const getIntercomButtonAssignment = (section, buttonNum) => {
    const n = Number(buttonNum);
    const sectionKey = section === 'broadcast' ? 'broadcasts' : section === 'group' ? 'groups' : section === 'contact' ? 'contacts' : null;
    if (!sectionKey || !assignments[sectionKey]) return null;
    const bucket = assignments[sectionKey];
    return bucket[n] || bucket[String(n)] || null;
  };

  const getIntercomDisplayLabel = (assignment, section) => {
    if (!assignment) return 'Empty';
    if (assignment.label) return assignment.label;

    if (section === 'broadcast' || assignment.assignmentType === 'broadcast') {
      const broadcast = availableBroadcasts.find(b => b.id === assignment.broadcastId);
      return broadcast?.name || 'Broadcast';
    }
    if (section === 'group' || assignment.assignmentType === 'groupCall') {
      const group = availableGroups.find(g => g.id === assignment.groupId);
      return group?.name || 'Group';
    }
    if (section === 'contact' || assignment.assignmentType === 'directContact') {
      const contactId = assignment.contactId || assignment.userId;
      const contact = contactId ? availableContacts.find(c => getContactDbId(c) === contactId) : null;
      return contact?.displayName || contact?.name || contact?.username || 'Contact';
    }
    return 'Assigned';
  };

  const getButtonLabel = (page, button) => {
    const assignment = getButtonAssignment(page, button);
    if (!assignment) return '';

    // Per-button label override (used for speed dials, etc)
    const override = assignment.metadata?.label || assignment.metadata?.buttonLabel;
    if (override && String(override).trim()) return String(override).trim();
    
    switch (assignment.assignmentType) {
      case 'privateWire':
        const privateWire = availablePrivateWires.find(pw => pw.id === assignment.lineId);
        return privateWire?.lineLabel || 'Private Wire';
      case 'ddiLine':
        const ddiLine = availableLines.find(l => l.id === assignment.ddiLineId && l.type === 'DDI');
        return ddiLine?.name || 'DDI Line';
      case 'speedDial':
        const speedDial = availableSpeedDials.find(sd => sd.id === assignment.speedDialId);
        return speedDial?.name || 'Speed Dial';
      case 'broadcast':
        const broadcast = availableBroadcasts.find(b => b.id === (assignment.broadcastId || assignment.lineId));
        return broadcast?.name || 'Broadcast';
      case 'groupCall':
        const group = availableGroups.find(g => g.id === (assignment.groupId || assignment.lineId));
        return group?.name || 'Group Call';
      case 'directContact':
        const contact = availableContacts.find(c => c.id === (assignment.contactId || assignment.userId || assignment.lineId));
        return contact?.displayName || contact?.name || contact?.username || 'Direct Contact';
      case 'dialTone':
        return 'Dial Tone';
      case 'viewingKey':
      case 'viewRingLines':
        return 'View Ring Lines';
      default:
        return '';
    }
  };

  const handleButtonClick = (page, button) => {
    const key = `${page}-${button}`;
    setSelectedButton(selectedButton === key ? null : key);
  };

  const handleIntercomButtonClick = (section, buttonNum) => {
    const key = `${section}-${buttonNum}`;
    setSelectedButton(selectedButton === key ? null : key);
  };

  const handleAssignButton = async (assignmentType, itemId = null, metadataOverride = null) => {
    if (!selectedButton) return;

    const selectedParts = selectedButton.split('-');
    const firstPartNum = Number(selectedParts[0]);
    const selectedIsDealerboard = Number.isFinite(firstPartNum) && !Number.isNaN(firstPartNum);
    const selectedIsIntercom = !selectedIsDealerboard;
    
    // Handle Intercom button assignments (section-buttonNum format)
    if (selectedIsIntercom) {
      const [section, buttonNum] = selectedButton.split('-');
      const expectedType = { broadcast: 'broadcast', group: 'groupCall', contact: 'directContact' }[section];
      if (expectedType && assignmentType !== expectedType) {
        toast.error(`This slot is for ${section} assignments — use the matching control on the right`);
        return;
      }

      try {
        const payload = {
          section,
          buttonNumber: parseInt(buttonNum, 10),
          assignmentType,
          targetUserId: userId
        };
        if (metadataOverride && typeof metadataOverride === 'object') {
          payload.metadata = metadataOverride;
        }

        if (assignmentType === 'broadcast') {
          payload.broadcastId = itemId;
        } else if (assignmentType === 'groupCall') {
          payload.groupId = itemId;
        } else if (assignmentType === 'directContact') {
          payload.contactId = itemId;
          payload.userId = itemId;
        }

        await api.post('/api/dealerboard/assignments', payload);
        
        // Reload configuration to get updated button labels
        await loadConfiguration();

        setIntercomPendingAssignId('');
        toast.success('Button assigned successfully');
        return;
      } catch (error) {
        console.error('Failed to assign button:', error);
        const msg = error.response?.data?.details || error.response?.data?.error || 'Failed to assign button';
        toast.error(msg);
        return;
      }
    }
    
    // Handle Dealerboard button assignments (page-button format)
    const [page, button] = selectedButton.split('-').map(Number);
    
    try {
      const payload = {
        pageNumber: page,
        buttonNumber: button,
        assignmentType,
        targetUserId: userId
      };
      if (metadataOverride && typeof metadataOverride === 'object') {
        payload.metadata = metadataOverride;
      }

      if (assignmentType === 'privateWire') {
        payload.lineId = itemId;
      } else if (assignmentType === 'ddiLine') {
        payload.ddiLineId = itemId;
      } else if (assignmentType === 'speedDial') {
        payload.speedDialId = itemId;
      } else if (assignmentType === 'broadcast') {
        payload.broadcastId = itemId;
      } else if (assignmentType === 'groupCall') {
        payload.groupId = itemId;
      } else if (assignmentType === 'directContact') {
        payload.contactId = itemId;
        payload.userId = itemId;
      } else if (assignmentType === 'dialTone') {
        // dialTone doesn't need an ID
      } else if (assignmentType === 'viewRingLines' || assignmentType === 'viewingKey') {
        // viewRingLines/viewingKey doesn't need an ID
        payload.assignmentType = 'viewingKey'; // Backend uses 'viewingKey'
      }

      const response = await api.post('/api/dealerboard/assignments', payload);
      
      // Reload configuration to get updated button labels
      await loadConfiguration();
      
      setSelectedButton(null);
      showAssignmentResultToast(response);
    } catch (error) {
      console.error('Failed to assign button:', error);
      const msg = error.response?.data?.details || error.response?.data?.error || 'Failed to assign button';
      toast.error(msg);
    }
  };

  const handleClearButton = async () => {
    if (!selectedButton) return;
    
    try {
      // Intercom clear (section-buttonNum)
      const selectedParts = selectedButton.split('-');
      const firstPartNum = Number(selectedParts[0]);
      const selectedIsDealerboard = Number.isFinite(firstPartNum) && !Number.isNaN(firstPartNum);
      const selectedIsIntercom = !selectedIsDealerboard;

      if (selectedIsIntercom) {
        const [section, buttonNumStr] = selectedButton.split('-');
        const buttonNum = parseInt(buttonNumStr, 10);

        let mappedButtonNumber = buttonNum;
        if (section === 'broadcast') {
          mappedButtonNumber = buttonNum; // 1-8
        } else if (section === 'group') {
          mappedButtonNumber = 8 + buttonNum; // 9-18
        } else if (section === 'contact') {
          mappedButtonNumber = 18 + buttonNum; // 19-34
        } else {
          toast.error('Invalid intercom button selection');
          return;
        }

        await api.delete(`/api/dealerboard/assignments/${userId}/0/${mappedButtonNumber}`);
        await loadConfiguration();
        setSelectedButton(null);
        toast.success('Button cleared');
        return;
      }

      // Dealerboard clear (page-button)
      const [page, button] = selectedButton.split('-').map(Number);
      const clearResponse = await api.delete(`/api/dealerboard/assignments/${userId}/${page}/${button}`);

      // Update local state
      setAssignments(prev => {
        const newAssignments = { ...prev };
        if (newAssignments[page]) {
          const newPage = { ...newAssignments[page] };
          delete newPage[button];
          newAssignments[page] = newPage;
        }
        return newAssignments;
      });
      
      setSelectedButton(null);
      showAssignmentResultToast(clearResponse, 'Button cleared');
    } catch (error) {
      console.error('Failed to clear button:', error);
      toast.error('Failed to clear button');
    }
  };

  const handleSavePreferences = async () => {
    try {
      // Save button colors, viewing key preference, dealerboard settings, and intercom settings
      const prefsToSave = {
        buttonColors: preferences.buttonColors,
        viewingKey: preferences.viewingKey,
        dealerboardSettings: dealerboardSettings,
        intercomSettings: intercomSettings
      };
      
      await api.put(`/api/dealerboard/preferences/${userId}`, prefsToSave);
      toast.success('Settings saved (colors + DND/CF + options). Button assignments are saved per-button via “Save Line / Save Speed Dial / …”.', {
        duration: 5000,
        icon: '⚠️'
      });
      if (onSave) onSave();
    } catch (error) {
      console.error('Failed to save preferences:', error);
      toast.error('Failed to save preferences');
    }
  };

  const handleColorChange = (buttonKey, color) => {
    setPreferences(prev => ({
      ...prev,
      buttonColors: {
        ...prev.buttonColors,
        [buttonKey]: color
      }
    }));
  };

  // Check if a line is busy (has active call)
  const isLineBusy = (page, button) => {
    const assignment = getButtonAssignment(page, button);
    if (!assignment) return false;
    
    // Get the line ID from the assignment
    let lineId = null;
    if (assignment.assignmentType === 'privateWire' && assignment.lineId) {
      lineId = assignment.lineId;
    } else if (assignment.assignmentType === 'ddiLine' && assignment.ddiLineId) {
      lineId = assignment.ddiLineId;
    }
    
    if (!lineId) return false;
    
    // Check if this line ID is in the busy lines set
    return busyLines.has(lineId);
  };

  const isLineForwarded = (page, button) => {
    const assignment = getButtonAssignment(page, button);
    if (!assignment) return false;

    const type = assignment.assignmentType;
    if (type === 'privateWire') {
      const id = assignment.lineId;
      const pw = id ? availablePrivateWires.find(p => p.id === id) : null;
      return !!(pw?.metadata?.callForward?.enabled);
    }
    if (type === 'ddiLine') {
      const id = assignment.ddiLineId;
      const line = id ? availableLines.find(l => l.id === id && l.type === 'DDI') : null;
      return !!(line?.callForward?.enabled);
    }

    return false;
  };

  const renderButtonGrid = () => {
    const buttons = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 7; col++) {
        const buttonNum = row * 7 + col + 1;
        const key = `${currentPage}-${buttonNum}`;
        const assignment = getButtonAssignment(currentPage, buttonNum);
        const isSelected = selectedButton === key;
        const isRinging = ringingButtons.has(key);
        const isBusy = isLineBusy(currentPage, buttonNum);
        const isForwarded = !isRinging && !isBusy && isLineForwarded(currentPage, buttonNum);
        const buttonColor = preferences.buttonColors[key] || '#3b82f6';
        const typeMeta = assignment ? getAssignmentTypeMeta(assignment) : null;
        const buttonLabel = assignment ? getButtonLabel(currentPage, buttonNum) : '';
        
        buttons.push(
          <LayoutButton
            key={buttonNum}
            $selected={isSelected}
            $hasAssignment={!!assignment}
            $ringing={isRinging}
            $busy={isBusy}
            $forwarded={isForwarded}
            onClick={() => handleButtonClick(currentPage, buttonNum)}
            style={{
              backgroundColor: (isSelected || isBusy || isRinging || isForwarded) ? undefined : (assignment ? `${buttonColor}15` : undefined),
              borderLeft: assignment && typeMeta && !isSelected && !isBusy && !isRinging && !isForwarded
                ? `4px solid ${typeMeta.border}`
                : undefined,
            }}
            title={assignment ? `${typeMeta?.label || 'Line'}: ${buttonLabel}` : undefined}
          >
            {preferences.viewingKey && isRinging && <ViewingKeyIndicator $active={true} />}
            {/* WPF Dealerboard shows button mapping as "{buttonNumber}-{pageNumber}" */}
            <ButtonNumber>{`${buttonNum}-${currentPage}`}</ButtonNumber>
            {assignment && (
              <>
                <ButtonLabel>{buttonLabel}</ButtonLabel>
                {typeMeta && (
                  <ButtonTypeChip $color={typeMeta.color} $bg={typeMeta.bg} $border={typeMeta.border}>
                    {typeMeta.short}
                  </ButtonTypeChip>
                )}
              </>
            )}
            {isBusy && <BusyIndicator>busy</BusyIndicator>}
            {isForwarded && <BusyIndicator style={{ color: '#111827' }}>forward</BusyIndicator>}
          </LayoutButton>
        );
      }
    }
    return buttons;
  };

  const selectedAssignment = selectedButton ? (
    (() => {
      const parts = selectedButton.split('-');
      const firstPartNum = Number(parts[0]);
      const selectedIsDealerboard = Number.isFinite(firstPartNum) && !Number.isNaN(firstPartNum);
      return selectedIsDealerboard
        ? getButtonAssignment(...selectedButton.split('-').map(Number))
        : (() => {
            const [section, buttonNum] = selectedButton.split('-');
            return getIntercomButtonAssignment(section, buttonNum);
          })();
    })()
  ) : null;

  const selectedContext = useMemo(() => {
    if (!selectedButton) return null;
    const parts = selectedButton.split('-');
    const firstPartNum = Number(parts[0]);
    const selectedIsDealerboard = Number.isFinite(firstPartNum) && !Number.isNaN(firstPartNum);
    if (selectedIsDealerboard) {
      const [page, button] = parts.map(Number);
      return { kind: 'dealerboard', page, button };
    }
    const [section, buttonNum] = parts;
    return { kind: 'intercom', section, buttonNum: Number(buttonNum) };
  }, [selectedButton]);

  const assignmentPanelKind = selectedContext?.kind || (activeTab === 'intercom' ? 'intercom' : 'dealerboard');
  const isIntercomSelection = assignmentPanelKind === 'intercom';

  const selectedButtonTitle = useMemo(() => {
    if (!selectedContext) return '';
    if (selectedContext.kind === 'dealerboard') return `Dealerboard ${selectedContext.button}-${selectedContext.page}`;
    if (selectedContext.section === 'broadcast') return `Broadcast ${selectedContext.buttonNum}`;
    if (selectedContext.section === 'group') return `Intercom Group ${selectedContext.buttonNum}`;
    if (selectedContext.section === 'contact') return `Direct Contact ${selectedContext.buttonNum}`;
    return `Intercom ${selectedContext.section}-${selectedContext.buttonNum}`;
  }, [selectedContext]);

  const selectedDealerboardLineInfo = useMemo(() => {
    if (!selectedContext || selectedContext.kind !== 'dealerboard') return null;
    const assignment = getButtonAssignment(selectedContext.page, selectedContext.button);
    if (!assignment) return null;

    if (assignment.assignmentType === 'privateWire' && assignment.lineId) {
      const pw = availablePrivateWires.find(p => p.id === assignment.lineId);
      if (!pw) return { kind: 'privateWire', id: assignment.lineId, label: `Private Wire ${assignment.lineId}`, callForward: {} };
      return { kind: 'privateWire', id: pw.id, label: pw.lineLabel || pw.name || `Private Wire ${pw.id}`, callForward: pw.metadata?.callForward || {} };
    }

    if (assignment.assignmentType === 'ddiLine' && assignment.ddiLineId) {
      const line = availableLines.find(l => l.id === assignment.ddiLineId);
      if (!line) return { kind: 'ddiLine', id: assignment.ddiLineId, label: `DDI ${assignment.ddiLineId}`, callForward: {} };
      return { kind: 'ddiLine', id: line.id, label: line.label || line.name || `DDI ${line.id}`, callForward: line.callForward || {} };
    }

    return null;
  }, [selectedContext, availablePrivateWires, availableLines, assignments]);

  useEffect(() => {
    if (!selectedDealerboardLineInfo) return;
    const cf = selectedDealerboardLineInfo.callForward || {};
    setLineCallForwardDraft({
      enabled: cf.enabled === true,
      forwardToUri: (cf.forwardToUri || '').toString()
    });
  }, [selectedDealerboardLineInfo?.kind, selectedDealerboardLineInfo?.id]);

  useEffect(() => {
    setIntercomPendingAssignId('');
    if (!selectedContext || selectedContext.kind !== 'intercom') return;
    const assignment = getIntercomButtonAssignment(selectedContext.section, selectedContext.buttonNum);
    if (!assignment) return;
    if (selectedContext.section === 'group') {
      setIntercomPendingAssignId(assignment.groupId || '');
    } else if (selectedContext.section === 'broadcast') {
      setIntercomPendingAssignId(assignment.broadcastId || '');
    } else if (selectedContext.section === 'contact') {
      setIntercomPendingAssignId(assignment.contactId || assignment.userId || '');
    }
  }, [selectedContext, assignments]);

  const renderIntercomSidePanel = () => {
    if (!selectedContext || selectedContext.kind !== 'intercom') {
      return (
        <IntercomHint>Select a broadcast or group button to assign it.</IntercomHint>
      );
    }

    const { section, buttonNum } = selectedContext;
    const assignment = getIntercomButtonAssignment(section, buttonNum);
    const currentLabel = getIntercomDisplayLabel(assignment, section);

    if (section === 'broadcast') {
      return (
        <>
          <div style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            <strong>Current:</strong> {currentLabel}
          </div>
          <CompactFormGroup>
            <CompactLabel>Broadcast group</CompactLabel>
            <CompactSelect
              value={intercomPendingAssignId}
              onChange={(e) => setIntercomPendingAssignId(e.target.value)}
            >
              <option value="">-- Select broadcast --</option>
              {availableBroadcasts.map(b => (
                <option key={b.id} value={b.id}>{b.name || `Broadcast ${b.id}`}</option>
              ))}
            </CompactSelect>
            {availableBroadcasts.length === 0 && (
              <IntercomHint style={{ marginTop: '0.35rem' }}>
                No broadcast groups found. Create one in Admin → Broadcasts with call mode &quot;broadcast&quot;.
              </IntercomHint>
            )}
          </CompactFormGroup>
          <Button
            variant="primary"
            size="sm"
            disabled={!intercomPendingAssignId}
            onClick={() => handleAssignButton('broadcast', intercomPendingAssignId)}
            style={{ width: '100%' }}
          >
            Assign Broadcast
          </Button>
          {assignment && (
            <Button variant="secondary" size="sm" onClick={handleClearButton} style={{ width: '100%', marginTop: '0.5rem' }}>
              Clear
            </Button>
          )}
        </>
      );
    }

    if (section === 'group') {
      return (
        <>
          <div style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            <strong>Current:</strong> {currentLabel}
          </div>
          <CompactFormGroup>
            <CompactLabel>Group call</CompactLabel>
            <CompactSelect
              value={intercomPendingAssignId}
              onChange={(e) => setIntercomPendingAssignId(e.target.value)}
            >
              <option value="">-- Select group --</option>
              {availableGroups.map(g => (
                <option key={g.id} value={g.id}>{g.name || `Group ${g.id}`}</option>
              ))}
            </CompactSelect>
            {availableGroups.length === 0 && (
              <IntercomHint style={{ marginTop: '0.35rem' }}>
                No groups found. Create one in Admin → Groups first.
              </IntercomHint>
            )}
          </CompactFormGroup>
          <Button
            variant="primary"
            size="sm"
            disabled={!intercomPendingAssignId}
            onClick={() => handleAssignButton('groupCall', intercomPendingAssignId)}
            style={{ width: '100%' }}
          >
            Assign Group
          </Button>
          {assignment && (
            <Button variant="secondary" size="sm" onClick={handleClearButton} style={{ width: '100%', marginTop: '0.5rem' }}>
              Clear
            </Button>
          )}
        </>
      );
    }

    return (
      <>
        <div style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          <strong>Current:</strong> {currentLabel}
        </div>
        <CompactFormGroup>
          <CompactLabel>Direct contact</CompactLabel>
          <CompactSelect
            value={intercomPendingAssignId}
            onChange={(e) => setIntercomPendingAssignId(e.target.value)}
          >
            <option value="">-- Select contact --</option>
            {availableContacts
              .filter(c => getContactDbId(c) !== userId)
              .map(contact => (
                <option key={getContactDbId(contact) || contact.username} value={getContactDbId(contact) || ''}>
                  {contact.displayName || contact.name || contact.username || `User ${contact.id}`}
                </option>
              ))}
          </CompactSelect>
        </CompactFormGroup>
        <Button
          variant="primary"
          size="sm"
          disabled={!intercomPendingAssignId}
          onClick={() => handleAssignButton('directContact', intercomPendingAssignId)}
          style={{ width: '100%' }}
        >
          Assign Contact
        </Button>
        {assignment && (
          <Button variant="secondary" size="sm" onClick={handleClearButton} style={{ width: '100%', marginTop: '0.5rem' }}>
            Clear
          </Button>
        )}
      </>
    );
  };
  return (
    <Container>
      <Section>
        <SectionTitle>
          <FiGrid />
          Button Layout Configuration
        </SectionTitle>
        
        <TabContainer>
          {canShowDealerboard && (
            <TabButton 
              $active={activeTab === 'dealerboard' || activeTab === 'dealerboardSettings'}
              onClick={() => { setActiveTab('dealerboard'); setSelectedButton(null); }}
            >
              Dealerboard Buttons
            </TabButton>
          )}

          {canShowIntercom && (
            <TabButton 
              $active={activeTab === 'intercom' || activeTab === 'intercomSettings'}
              onClick={() => { setActiveTab('intercom'); setSelectedButton(null); }}
            >
              Intercom Buttons
            </TabButton>
          )}

          {canShowDealerboard && !showBothModules && (
            <TabButton 
              $active={activeTab === 'dealerboardSettings'}
              onClick={() => { setActiveTab('dealerboardSettings'); setSelectedButton(null); }}
            >
              Dealerboard Settings
            </TabButton>
          )}

          {canShowIntercom && !showBothModules && (
            <TabButton 
              $active={activeTab === 'intercomSettings'}
              onClick={() => { setActiveTab('intercomSettings'); setSelectedButton(null); }}
            >
              Intercom Settings
            </TabButton>
          )}
        </TabContainer>

        {showBothModules && (
          <div style={{ fontSize: '0.8rem', color: '#a0a0b0', marginBottom: '0.75rem' }}>
            Configure dealerboard and intercom button layouts using the tabs above. Module-specific settings are available after selecting a layout tab.
          </div>
        )}
        
        {canShowDealerboard && activeTab === 'dealerboard' && (
          <>
            <PageSelector style={{ flex: '0 0 auto', marginBottom: '1rem' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(page => (
                <PageButton
                  key={page}
                  $active={currentPage === page}
                  onClick={() => {
                    setCurrentPage(page);
                    setSelectedButton(null);
                  }}
                >
                  Page {page}
                </PageButton>
              ))}
            </PageSelector>

            <DealerboardLegend>
              WPF Dealerboard mapping: <strong>7×4 grid</strong> (buttons 1–28) filled left-to-right, top-to-bottom.
              Each key is labeled as <strong>{'{button}-{page}'}</strong> (e.g. <strong>1-1</strong>, <strong>28-10</strong>).
            </DealerboardLegend>

            <TypeLegend>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Types:</span>
              <LineTypeBadge meta={ASSIGNMENT_TYPE_META.privateWire} showLabel />
              <LineTypeBadge meta={ASSIGNMENT_TYPE_META.ddiLine} showLabel />
              <LineTypeBadge meta={ASSIGNMENT_TYPE_META.speedDial} showLabel />
            </TypeLegend>

            {dealerboardGroup && (
              <GroupConfigBanner>
                <strong>Shared configuration:</strong> {dealerboardGroup.name} ({dealerboardGroup.memberCount}{' '}
                {dealerboardGroup.memberCount === 1 ? 'member' : 'members'}). Line and button changes on this user
                apply to everyone in the group. Manage groups under Admin → Dealerboard Groups.
              </GroupConfigBanner>
            )}

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ButtonGrid>
                {renderButtonGrid()}
              </ButtonGrid>
            </div>
          </>
        )}

        {canShowIntercom && activeTab === 'intercom' && (
          <WorkspaceRow>
            <GridPanel>
              <IntercomButtonGrid>
                <IntercomSection>
                  <IntercomSectionTitle>Broadcast lines</IntercomSectionTitle>
                  <IntercomButtonRow columns={4}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(buttonNum => {
                      const key = `broadcast-${buttonNum}`;
                      const assignment = getIntercomButtonAssignment('broadcast', buttonNum);
                      const isSelected = selectedButton === key;
                      const buttonColor = preferences.buttonColors[key] || '#3b82f6';

                      return (
                        <IntercomButton
                          key={buttonNum}
                          $selected={isSelected}
                          $hasAssignment={!!assignment}
                          onClick={() => handleIntercomButtonClick('broadcast', buttonNum)}
                          style={{ backgroundColor: isSelected ? undefined : (assignment ? `${buttonColor}12` : undefined) }}
                          title={getIntercomDisplayLabel(assignment, 'broadcast')}
                        >
                          <IntercomButtonIndex>B{buttonNum}</IntercomButtonIndex>
                          <IntercomButtonLabel>{getIntercomDisplayLabel(assignment, 'broadcast')}</IntercomButtonLabel>
                        </IntercomButton>
                      );
                    })}
                  </IntercomButtonRow>
                </IntercomSection>

                <IntercomSection>
                  <IntercomSectionTitle>Group calls</IntercomSectionTitle>
                  <IntercomButtonRow columns={5}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(buttonNum => {
                      const key = `group-${buttonNum}`;
                      const assignment = getIntercomButtonAssignment('group', buttonNum);
                      const isSelected = selectedButton === key;
                      const buttonColor = preferences.buttonColors[key] || '#3b82f6';

                      return (
                        <IntercomButton
                          key={buttonNum}
                          $selected={isSelected}
                          $hasAssignment={!!assignment}
                          onClick={() => handleIntercomButtonClick('group', buttonNum)}
                          style={{ backgroundColor: isSelected ? undefined : (assignment ? `${buttonColor}12` : undefined) }}
                          title={getIntercomDisplayLabel(assignment, 'group')}
                        >
                          <IntercomButtonIndex>G{buttonNum}</IntercomButtonIndex>
                          <IntercomButtonLabel>{getIntercomDisplayLabel(assignment, 'group')}</IntercomButtonLabel>
                        </IntercomButton>
                      );
                    })}
                  </IntercomButtonRow>
                </IntercomSection>

                <IntercomSection>
                  <IntercomSectionTitle>Direct contacts</IntercomSectionTitle>
                  <IntercomButtonRow columns={4}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(buttonNum => {
                      const key = `contact-${buttonNum}`;
                      const assignment = getIntercomButtonAssignment('contact', buttonNum);
                      const isSelected = selectedButton === key;
                      const buttonColor = preferences.buttonColors[key] || '#3b82f6';
                      const contactId = assignment?.contactId || assignment?.userId;
                      const contact = contactId ? availableContacts.find(c => getContactDbId(c) === contactId) : null;
                      const dotColor = getIntercomContactDotColor(contact);

                      return (
                        <IntercomButton
                          key={buttonNum}
                          $selected={isSelected}
                          $hasAssignment={!!assignment}
                          onClick={() => handleIntercomButtonClick('contact', buttonNum)}
                          style={{ backgroundColor: isSelected ? undefined : (assignment ? `${buttonColor}12` : undefined) }}
                          title={getIntercomDisplayLabel(assignment, 'contact')}
                        >
                          <StatusDot $color={dotColor} />
                          <IntercomButtonIndex>C{buttonNum}</IntercomButtonIndex>
                          <IntercomButtonLabel>{getIntercomDisplayLabel(assignment, 'contact')}</IntercomButtonLabel>
                        </IntercomButton>
                      );
                    })}
                  </IntercomButtonRow>
                </IntercomSection>
              </IntercomButtonGrid>
            </GridPanel>

            <SidePanel>
              <SidePanelTitle>
                <FiHash />
                {selectedButtonTitle || 'Assignment'}
              </SidePanelTitle>
              {renderIntercomSidePanel()}
            </SidePanel>
          </WorkspaceRow>
        )}

        {canShowIntercom && activeTab === 'intercomSettings' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '1rem' }}>
            <Section style={{ flex: 1, overflowY: 'auto' }}>
              <SectionTitle>
                <FiUsers />
                Directory Search
              </SectionTitle>
              
              <CompactFormGroup>
                <CompactLabel>Directory Visibility</CompactLabel>
                <CompactSelect
                  value={intercomSettings.directorySearch}
                  onChange={(e) => setIntercomSettings(prev => ({
                    ...prev,
                    directorySearch: e.target.value
                  }))}
                >
                  <option value="public">Public (visible in directory searches)</option>
                  <option value="private">Private (hidden from directory searches)</option>
                </CompactSelect>
                <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Controls whether this user appears in directory searches for other users
                </div>
              </CompactFormGroup>
            </Section>

            <Section style={{ flex: 1, overflowY: 'auto' }}>
              <SectionTitle>
                <FiPhone />
                Call Forward
              </SectionTitle>
              
              <CompactFormGroup>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="intercomCallForwardEnabled"
                    checked={intercomSettings.callForward.enabled}
                    onChange={(e) => setIntercomSettings(prev => ({
                      ...prev,
                      callForward: { ...prev.callForward, enabled: e.target.checked }
                    }))}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <CompactLabel htmlFor="intercomCallForwardEnabled" style={{ margin: 0, cursor: 'pointer' }}>
                    Enable Call Forward
                  </CompactLabel>
                </div>
              </CompactFormGroup>

              {intercomSettings.callForward.enabled && (
                <>
                  <CompactFormGroup>
                    <CompactLabel>Forward To User</CompactLabel>
                    <CompactSelect
                      value={intercomSettings.callForward.forwardToUserId}
                      onChange={(e) => setIntercomSettings(prev => ({
                        ...prev,
                        callForward: { ...prev.callForward, forwardToUserId: e.target.value }
                      }))}
                    >
                      <option value="">-- Select User --</option>
                      {availableContacts
                        .filter(c => getContactDbId(c) !== userId)
                        .map(contact => (
                          <option key={getContactDbId(contact) || contact.username} value={getContactDbId(contact) || ''}>
                            {contact.displayName || contact.name || contact.username || `User ${contact.id}`}
                          </option>
                        ))}
                    </CompactSelect>
                  </CompactFormGroup>

                  <CompactFormGroup>
                    <CompactLabel>Forward Condition</CompactLabel>
                    <CompactSelect
                      value={intercomSettings.callForward.condition}
                      onChange={(e) => setIntercomSettings(prev => ({
                        ...prev,
                        callForward: { ...prev.callForward, condition: e.target.value }
                      }))}
                    >
                      <option value="immediate">Immediate</option>
                      <option value="busy">When Busy</option>
                      <option value="no-answer">No Answer</option>
                    </CompactSelect>
                  </CompactFormGroup>
                </>
              )}
            </Section>

            <Section style={{ flex: '0 0 auto' }}>
              <SectionTitle>
                <FiPhone />
                Do Not Disturb (DND)
              </SectionTitle>
              
              <CompactFormGroup>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="intercomDndEnabled"
                    checked={intercomSettings.dnd}
                    onChange={(e) => setIntercomSettings(prev => ({
                      ...prev,
                      dnd: e.target.checked
                    }))}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <CompactLabel htmlFor="intercomDndEnabled" style={{ margin: 0, cursor: 'pointer' }}>
                    Enable Do Not Disturb (auto-reject incoming calls)
                  </CompactLabel>
                </div>
              </CompactFormGroup>
            </Section>
          </div>
        )}

        {/* Dealerboard Settings tab content is located further down in the file; gate it here via a lightweight wrapper */}
        {/* (If dealerboard is disabled for this user, they should not see dealerboard buttons/settings at all.) */}
      </Section>

      {selectedButton && !isIntercomSelection && (
        <Section>
          <SectionTitle>
            <FiHash />
            {selectedButtonTitle} Assignment
          </SectionTitle>
          
          <AssignmentPanel>
            {selectedAssignment && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Current Assignment</div>
                {isIntercomSelection ? (
                  <div>
                    {(() => {
                      const [section, buttonNum] = selectedButton.split('-');
                      const assignment = getIntercomButtonAssignment(section, buttonNum);
                      if (!assignment) return 'Unassigned';
                      if (assignment.assignmentType === 'broadcast') {
                        const broadcast = availableBroadcasts.find(b => b.id === assignment.broadcastId);
                        return broadcast?.name || 'Broadcast';
                      } else if (assignment.assignmentType === 'groupCall') {
                        const group = availableGroups.find(g => g.id === assignment.groupId);
                        return group?.name || 'Group Call';
                      } else if (assignment.assignmentType === 'directContact') {
                        const contact = availableContacts.find(c => getContactDbId(c) === (assignment.contactId || assignment.userId));
                        return contact?.displayName || contact?.name || contact?.username || 'Direct Contact';
                      }
                      return 'Unassigned';
                    })()}
                  </div>
                ) : (
                  (() => {
                    const [page, button] = selectedButton.split('-').map(Number);
                    const assignment = getButtonAssignment(page, button);
                    if (!assignment) return 'Unassigned';
                    const meta = getAssignmentTypeMeta(assignment);
                    const label = getButtonLabel(page, button);
                    return (
                      <AssignmentLabelPreview
                        label={label}
                        meta={meta}
                        subtitle={assignment.metadata?.label ? 'Custom button label' : undefined}
                      />
                    );
                  })()
                )}
                <Button variant="secondary" size="sm" onClick={handleClearButton} style={{ marginTop: '0.5rem' }}>
                  Clear Assignment
                </Button>
              </div>
            )}

            {isIntercomSelection ? (
              <>
                {/* Intercom-specific assignments: Group Calls, Broadcasts, Direct Contacts */}
                <CompactFormGroup>
                  <CompactLabel>Assign Group Call</CompactLabel>
                  <CompactSelect
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAssignButton('groupCall', e.target.value);
                      }
                    }}
                  >
                    <option value="">-- Select Group --</option>
                    {availableGroups.length > 0 ? (
                      availableGroups.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.name || `Group ${g.id}`}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No groups available</option>
                    )}
                  </CompactSelect>
                </CompactFormGroup>

                <CompactFormGroup>
                  <CompactLabel>Assign Broadcast</CompactLabel>
                  <CompactSelect
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAssignButton('broadcast', e.target.value);
                      }
                    }}
                  >
                    <option value="">-- Select Broadcast --</option>
                    {availableBroadcasts.length > 0 ? (
                      availableBroadcasts.map(b => (
                        <option key={b.id} value={b.id} title={b.name || `Broadcast ${b.id}`}>
                          {b.name || `Broadcast ${b.id}`}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No broadcasts available</option>
                    )}
                  </CompactSelect>
                </CompactFormGroup>

                <CompactFormGroup>
                  <CompactLabel>Assign Direct Contact</CompactLabel>
                  <CompactSelect
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAssignButton('directContact', e.target.value);
                      }
                    }}
                  >
                    <option value="">-- Select Contact --</option>
                    {availableContacts.length > 0 ? (
                      availableContacts
                        .filter(c => getContactDbId(c) !== userId)
                        .map(contact => (
                          <option key={getContactDbId(contact) || contact.username} value={getContactDbId(contact) || ''}>
                            {contact.displayName || contact.name || contact.username || `User ${contact.id}`}
                          </option>
                        ))
                    ) : (
                      <option value="" disabled>No contacts available</option>
                    )}
                  </CompactSelect>
                </CompactFormGroup>
              </>
            ) : (
              <>
                <CompactFormGroup>
                  <CompactLabel>Type</CompactLabel>
                  <CompactSelect
                    value={dealerboardAssignType}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDealerboardAssignType(v);
                      setLineAorInput('');
                      setLineAorResolved(null);
                      setSpeedDialNumberInput('');
                      setCfFromAorInput('');
                      setCfFromResolved(null);
                      setCfToNumberInput('');
                    }}
                  >
                    <option value="line">Line</option>
                    <option value="speedDial">Speed Dial</option>
                    <option value="viewingKey">Soft Ring Key</option>
                    <option value="callForwardKey">Call Forward Line Key</option>
                  </CompactSelect>
                </CompactFormGroup>

                {dealerboardAssignType === 'line' && (
                  <>
                    <CompactFormGroup>
                      <CompactLabel>Line AOR (internal)</CompactLabel>
                      <Input
                        value={lineAorInput}
                        onChange={(e) => {
                          setLineAorInput(e.target.value);
                          setLineAorResolved(null);
                        }}
                        placeholder="6-digit AOR (preferred)  or  BCAST:<groupId>"
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            try {
                              const r = await resolveInternalAor(lineAorInput);
                              setLineAorResolved(r);
                              toast.success(`Resolved: ${r.name}`);
                            } catch (e) {
                              setLineAorResolved(null);
                              toast.error(e?.response?.data?.error || 'AOR not found');
                            }
                          }}
                        >
                          Resolve AOR
                        </Button>
                        <Button
                          variant="primary"
                          onClick={async () => {
                            if (!lineAorResolved?.id || !lineAorResolved?.kind) {
                              toast.error('Resolve the AOR first');
                              return;
                            }
                            const label = (lineButtonLabelInput || '').trim();
                            const meta = label ? { label } : {};
                            const kind = lineAorResolved.kind;
                            if (kind === 'privateWire') {
                              await handleAssignButton('privateWire', lineAorResolved.id, meta);
                            } else if (kind === 'ddiLine') {
                              await handleAssignButton('ddiLine', lineAorResolved.id, meta);
                            } else if (kind === 'broadcast') {
                              await handleAssignButton('broadcast', lineAorResolved.id, meta);
                            } else {
                              toast.error('Unsupported line kind');
                            }
                          }}
                        >
                          Save Line (updates button)
                        </Button>
                      </div>
                      {lineAorResolved && (
                        <AssignmentLabelPreview
                          label={lineAorResolved.name}
                          meta={getLineKindMeta(lineAorResolved.kind)}
                          subtitle={`AOR ${lineAorResolved.aor}`}
                        />
                      )}
                      <div style={{ marginTop: '0.6rem' }}>
                        <CompactLabel>Button label (optional)</CompactLabel>
                        <Input
                          value={lineButtonLabelInput}
                          onChange={(e) => setLineButtonLabelInput(e.target.value)}
                          placeholder="Overrides the button label (e.g., 'Main Line')"
                        />
                        <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          If blank, the line’s name/label is used.
                        </div>
                        {(lineAorResolved || (lineButtonLabelInput || '').trim()) && (
                          <div style={{ marginTop: '0.6rem' }}>
                            <CompactLabel>Button preview</CompactLabel>
                            <AssignmentLabelPreview
                              label={(lineButtonLabelInput || '').trim() || lineAorResolved?.name || 'Line'}
                              meta={lineAorResolved ? getLineKindMeta(lineAorResolved.kind) : ASSIGNMENT_TYPE_META.privateWire}
                              subtitle="As shown on the dealerboard key"
                            />
                          </div>
                        )}
                      </div>
                    </CompactFormGroup>
                  </>
                )}

                {dealerboardAssignType === 'speedDial' && (
                  <CompactFormGroup>
                    <CompactLabel>Number to dial</CompactLabel>
                    <Input
                      value={speedDialNumberInput}
                      onChange={(e) => setSpeedDialNumberInput(e.target.value)}
                      placeholder="+441234567890"
                    />
                    <CompactLabel style={{ marginTop: '0.35rem' }}>Button label</CompactLabel>
                    <Input
                      value={speedDialLabelInput}
                      onChange={(e) => setSpeedDialLabelInput(e.target.value)}
                      placeholder="e.g., Reception"
                    />
                    {(speedDialLabelInput || speedDialNumberInput) && (
                      <div style={{ marginTop: '0.6rem' }}>
                        <CompactLabel>Button preview</CompactLabel>
                        <AssignmentLabelPreview
                          label={(speedDialLabelInput || '').trim() || speedDialNumberInput || 'Speed Dial'}
                          meta={ASSIGNMENT_TYPE_META.speedDial}
                          subtitle={speedDialNumberInput ? `Dials ${speedDialNumberInput}` : undefined}
                        />
                      </div>
                    )}
                    <Button
                      variant="primary"
                      onClick={async () => {
                        const [page, button] = selectedButton.split('-').map(Number);
                        const num = (speedDialNumberInput || '').trim();
                        if (!num) return toast.error('Enter a number');
                        const label = (speedDialLabelInput || '').trim();
                        const sdResponse = await api.post('/api/dealerboard/assignments', {
                          pageNumber: page,
                          buttonNumber: button,
                          assignmentType: 'speedDial',
                          targetUserId: userId,
                          metadata: { number: num, label }
                        });
                        await loadConfiguration();
                        setSelectedButton(null);
                        setSpeedDialNumberInput('');
                        setSpeedDialLabelInput('');
                        showAssignmentResultToast(sdResponse);
                      }}
                      style={{ width: '100%', marginTop: '0.5rem' }}
                    >
                      Save Speed Dial (updates button)
                    </Button>
                  </CompactFormGroup>
                )}

                {dealerboardAssignType === 'viewingKey' && (
                  <CompactFormGroup>
                    <CompactLabel>Soft Ring Key</CompactLabel>
                    <Button
                      variant="primary"
                      onClick={() => handleAssignButton('viewRingLines')}
                      style={{ width: '100%', fontSize: '0.875rem', padding: '0.5rem' }}
                    >
                      Assign Soft Ring Key
                    </Button>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Shows lines ringing on other pages; user can answer by pressing the button.
                    </div>
                  </CompactFormGroup>
                )}

                {dealerboardAssignType === 'callForwardKey' && (
                  <>
                    <CompactFormGroup>
                      <CompactLabel>Line to forward from (AOR)</CompactLabel>
                      <Input
                        value={cfFromAorInput}
                        onChange={(e) => {
                          setCfFromAorInput(e.target.value);
                          setCfFromResolved(null);
                        }}
                        placeholder="LINE:<id>"
                      />
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          try {
                            const r = await resolveInternalAor(cfFromAorInput);
                            setCfFromResolved(r);
                            toast.success(`Resolved: ${r.name}`);
                          } catch (e) {
                            setCfFromResolved(null);
                            toast.error(e?.response?.data?.error || 'AOR not found');
                          }
                        }}
                        style={{ width: '100%', marginTop: '0.5rem' }}
                      >
                        Resolve From-AOR
                      </Button>
                      {cfFromResolved && (
                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>
                          <strong>{cfFromResolved.name}</strong> ({cfFromResolved.kind})
                        </div>
                      )}
                    </CompactFormGroup>

                    <CompactFormGroup>
                      <CompactLabel>Forward to number</CompactLabel>
                      <Input
                        value={cfToNumberInput}
                        onChange={(e) => setCfToNumberInput(e.target.value)}
                        placeholder="+441234567890"
                      />
                    </CompactFormGroup>

                    <Button
                      variant="primary"
                      onClick={async () => {
                        const [page, button] = selectedButton.split('-').map(Number);
                        const to = (cfToNumberInput || '').trim();
                        if (!cfFromResolved?.id) return toast.error('Resolve the from-AOR first');
                        if (!to) return toast.error('Enter a forward-to number');
                        const cfResponse = await api.post('/api/dealerboard/assignments', {
                          pageNumber: page,
                          buttonNumber: button,
                          assignmentType: 'callForward',
                          targetUserId: userId,
                          metadata: {
                            from: { kind: cfFromResolved.kind, id: cfFromResolved.id, aor: cfFromResolved.aor },
                            to: { target: to }
                          }
                        });
                        await loadConfiguration();
                        setSelectedButton(null);
                        showAssignmentResultToast(cfResponse);
                      }}
                      style={{ width: '100%' }}
                    >
                      Assign Call Forward Key
                    </Button>
                  </>
                )}

                <CompactFormGroup style={{ marginTop: '0.5rem' }}>
                  <CompactLabel>Assign Dial Tone Line</CompactLabel>
                  <Button
                    variant="secondary"
                    onClick={() => handleAssignButton('dialTone')}
                    style={{ width: '100%', fontSize: '0.875rem', padding: '0.5rem' }}
                  >
                    <FiPhone style={{ marginRight: '0.5rem' }} />
                    Assign Dial Tone
                  </Button>
                </CompactFormGroup>
              </>
            )}

            {selectedAssignment && (
              <FormGroup>
                <Label>Button Color</Label>
                <ColorPicker>
                  {['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#22c55e', '#e879f9'].map(color => (
                    <ColorOption
                      key={color}
                      $color={color}
                      $selected={preferences.buttonColors[selectedButton] === color}
                      onClick={() => handleColorChange(selectedButton, color)}
                    />
                  ))}
                </ColorPicker>
                <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.35rem' }}>
                  Note: <strong>red</strong> is reserved for busy/ringing, and <strong>amber</strong> is reserved for call-forward status.
                </div>
              </FormGroup>
            )}
          </AssignmentPanel>
        </Section>
      )}

      <Section style={{ flex: '0 0 auto', maxHeight: '120px' }}>
        <SectionTitle style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
          <FiVolume2 />
          WPF Application Settings
        </SectionTitle>
        
        <div style={{ 
          padding: '0.75rem', 
          background: '#f0f9ff', 
          borderRadius: '6px',
          border: '1px solid #bae6fd'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#0284c7' }}>
            Ringing tone and audio preferences are configured in the WPF client application settings.
          </div>
        </div>
      </Section>


      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
        <Button variant="secondary" type="button" onClick={handleCancelEditing}>
          Cancel
        </Button>
        <Button variant="primary" type="button" onClick={handleSavePreferences} disabled={loading}>
          Save Settings
        </Button>
      </div>
    </Container>
  );
};

export default UserButtonLayout;

