import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { FiPlus, FiEdit, FiTrash2, FiX, FiCheck } from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { 
  Card, 
  Button, 
  Input, 
  Select, 
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter
} from '../../styles/GlobalStyle';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.lg};
  overflow: hidden;
`;

const TableHeader = styled.thead`
  background: ${props => props.theme.colors.background};
`;

const TableHeaderCell = styled.th`
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

const TableRow = styled.tr`
  border-bottom: 1px solid ${props => props.theme.colors.border};
  
  &:hover {
    background: ${props => props.theme.colors.background};
  }
`;

const TableCell = styled.td`
  padding: 1rem;
  color: ${props => props.theme.colors.text};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${props => props.theme.colors.text};
`;

const Textarea = styled.textarea`
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
`;

const Badge = styled.span`
  padding: 0.25rem 0.75rem;
  border-radius: ${props => props.theme.borderRadius.full};
  font-size: 0.75rem;
  font-weight: 500;
  background: ${props => {
    if (props.$status === 'ARD') return '#10b981';
    if (props.$status === 'MRD') return '#3b82f6';
    return '#f59e0b';
  }};
  color: white;
`;

const AdminPrivateWires = () => {
  const [showModal, setShowModal] = useState(false);
  const [editingWire, setEditingWire] = useState(null);
  const [isAutoLabel, setIsAutoLabel] = useState(true);
  const [formData, setFormData] = useState({
    uriAddress: '',
    sbcHost: '',
    sbcPort: '',
    sbcUsername: '',
    sbcPassword: '',
    sbcDomain: '',
    sbcSecondaryHost: '',
    sbcSecondaryPort: '',
    sbcSecondaryUsername: '',
    sbcSecondaryPassword: '',
    sbcSecondaryDomain: '',
    sbcFailbackToPrimary: true,
    lineLabel: '',
    lineLabelA: '',
    lineLabelB: '',
    circuitNumber: '',
    mode: 'ARD',
    subscriberId: '',
    internalWire: false,
    homeSubscriberId: '',
    secondarySubscriberId: '',
    isExternalCommunity: false,
    externalCommunityId: '',
    externalCommunityName: ''
  });

  const queryClient = useQueryClient();

  // Fetch private wires
  const { data: wiresData, isLoading, isError, error } = useQuery(
    'privateWires',
    async () => {
      const res = await api.get('/api/dealerboard/private-wires');
      return res.data;
    },
    {
      onError: (e) => {
        // Make API failures obvious; otherwise the UI looks "empty"
        toast.error(e?.response?.data?.error || 'Failed to load private wires');
      }
    }
  );

  // Fetch subscribers for dropdown (refetch when modal opens so hybrid/local nodes appear)
  const { data: subscribersData, refetch: refetchSubscribers } = useQuery(
    'subscribers',
    async () => {
      const res = await api.get('/api/subscribers');
      return res.data.subscribers || [];
    }
  );

  useEffect(() => {
    if (showModal) {
      refetchSubscribers();
    }
  }, [showModal, refetchSubscribers]);

  const rawWires = wiresData?.wires || [];

  // Main table: true Private Wires + mirrored internal pairs. We exclude Intercom/Group/Broadcast rows here,
  // but we still render them below under "Legacy rows" so nothing disappears from the UI.
  const wires = useMemo(() => {
    const all = rawWires.filter(w => {
      const mode = String(w?.mode || '').toUpperCase();
      return !['INTERCOM', 'GROUP', 'BROADCAST'].includes(mode);
    });

    // Group mirrored internal wires into pairs (one row in this table).
    // Internal wires may use ARD/MRD/HOOT signalling; we key off metadata.internalPairId (not mode).
    const pairs = new Map();
    const standalone = [];

    for (const w of all) {
      const pairId = w?.metadata?.internalPairId;
      if (pairId) {
        if (!pairs.has(pairId)) pairs.set(pairId, []);
        pairs.get(pairId).push(w);
      } else {
        standalone.push(w);
      }
    }

    const pairedRows = [];
    for (const [pairId, rows] of pairs.entries()) {
      const a = rows.find(r => r?.metadata?.internalRole === 'A') || rows[0];
      const b = rows.find(r => r?.metadata?.internalRole === 'B') || rows[1];
      pairedRows.push({
        id: a?.id, // primary id (delete/edit uses backend pair behavior)
        internalPairId: pairId,
        mode: a?.mode || b?.mode || 'ARD',
        lineLabel: `${a?.lineLabel || ''} / ${b?.lineLabel || ''}`.trim(),
        lineLabelA: a?.lineLabel || '',
        lineLabelB: b?.lineLabel || '',
        aorA: a?.aor || null,
        aorB: b?.aor || null,
        uriAddress: '(internal)',
        circuitNumber: a?.circuitNumber || b?.circuitNumber || null,
        sudoLineReferenceA: a?.sudoLineReference || null,
        sudoLineReferenceB: b?.sudoLineReference || null,
        subscriberId: null,
        homeSubscriberId: a?.homeSubscriberId || b?.homeSubscriberId || null,
        secondarySubscriberId: a?.secondarySubscriberId || b?.secondarySubscriberId || null,
        isExternalCommunity: false,
        externalCommunityId: null,
        externalCommunityName: null,
        isActive: Boolean(a?.isActive) && Boolean(b?.isActive),
        metadata: { internalWire: true, internalPairId: pairId }
      });
    }

    // Show internal pairs first for visibility, then normal wires
    return [...pairedRows, ...standalone];
  }, [rawWires]);

  const legacyWires = useMemo(() => {
    return rawWires.filter(w => ['INTERCOM', 'GROUP', 'BROADCAST'].includes(String(w?.mode || '').toUpperCase()));
  }, [rawWires]);
  const subscribers = subscribersData || [];

  const subscribersById = useMemo(() => {
    const map = new Map();
    for (const s of subscribers) map.set(s.id, s);
    return map;
  }, [subscribers]);

  // Optional helper defaults for internal wires (labels remain free-text and editable).
  const internalDefaultLabelA = useMemo(() => {
    if (!formData.internalWire) return '';
    return formData.homeSubscriberId ? (subscribersById.get(formData.homeSubscriberId)?.name || 'A') : 'A';
  }, [formData.internalWire, formData.homeSubscriberId, subscribersById]);
  const internalDefaultLabelB = useMemo(() => {
    if (!formData.internalWire) return '';
    return formData.secondarySubscriberId ? (subscribersById.get(formData.secondarySubscriberId)?.name || 'B') : 'B';
  }, [formData.internalWire, formData.secondarySubscriberId, subscribersById]);

  // Create/Update mutation
  const saveMutation = useMutation(
    async (data) => {
      if (editingWire) {
        if (editingWire.internalPairId) {
          const res = await api.put(`/api/dealerboard/private-wires/pair/${editingWire.internalPairId}`, {
            lineLabel: data.lineLabel,
            lineLabelA: data.lineLabelA,
            lineLabelB: data.lineLabelB,
            mode: data.mode,
            homeSubscriberId: data.homeSubscriberId,
            secondarySubscriberId: data.secondarySubscriberId,
          });
          return res.data;
        }
        const res = await api.put(`/api/dealerboard/private-wires/${editingWire.id}`, data);
        return res.data;
      } else {
        const res = await api.post('/api/dealerboard/private-wires', data);
        return res.data;
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('privateWires');
        setShowModal(false);
        setEditingWire(null);
        resetForm();
        toast.success(editingWire ? 'Private wire updated successfully' : 'Private wire created successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save private wire');
      }
    }
  );

  // Delete mutation
  const deleteMutation = useMutation(
    async (id) => {
      await api.delete(`/api/dealerboard/private-wires/${id}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('privateWires');
        toast.success('Private wire deleted successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete private wire');
      }
    }
  );

  const migrateLegacyMutation = useMutation(
    async (id) => {
      const res = await api.post('/api/dealerboard/private-wires/migrate-legacy', { id });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('privateWires');
        toast.success('Legacy row migrated. You can now manage it in Broadcasts.');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to migrate legacy row');
      }
    }
  );

  const deleteLegacyMutation = useMutation(
    async ({ ids, force }) => {
      const list = Array.isArray(ids) ? ids : [ids];
      const res = await api.post('/api/dealerboard/private-wires/delete-legacy', { ids: list, force: Boolean(force) });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('privateWires');
        toast.success('Legacy rows deleted');
      },
      onError: (error) => {
        const msg = error.response?.data?.error || 'Failed to delete legacy rows';
        const referenced = error.response?.data?.referenced;
        if (Array.isArray(referenced) && referenced.length > 0) {
          const detail = referenced.map(r => `${r.id} (${r.assignments})`).join(', ');
          toast.error(`${msg}\nReferenced by button assignments: ${detail}`);
        } else {
          toast.error(msg);
        }
      }
    }
  );

  const resetForm = () => {
    setFormData({
      uriAddress: '',
      sbcHost: '',
      sbcPort: '',
      sbcUsername: '',
      sbcPassword: '',
      sbcDomain: '',
      sbcSecondaryHost: '',
      sbcSecondaryPort: '',
      sbcSecondaryUsername: '',
      sbcSecondaryPassword: '',
      sbcSecondaryDomain: '',
      sbcFailbackToPrimary: true,
      lineLabel: '',
      lineLabelA: '',
      lineLabelB: '',
      circuitNumber: '',
      mode: 'ARD',
      subscriberId: '',
      internalWire: false,
      homeSubscriberId: '',
      secondarySubscriberId: '',
      isExternalCommunity: false,
      externalCommunityId: '',
      externalCommunityName: ''
    });
    setIsAutoLabel(true);
  };

  const handleEdit = (wire) => {
    setEditingWire(wire);

    const primary = (wire?.sbcDetails?.primary) || ((wire?.sbcDetails?.host) ? wire.sbcDetails : {});
    const secondary = wire?.sbcDetails?.secondary || {};
    const isInternal = Boolean(wire?.internalPairId) || Boolean(wire?.metadata?.internalPairId) || Boolean(wire?.metadata?.internalWire);

    setFormData({
      uriAddress: wire.uriAddress || '',
      sbcHost: wire.sbcHost || primary.host || '',
      sbcPort: wire.sbcPort !== undefined && wire.sbcPort !== null && wire.sbcPort !== ''
        ? String(wire.sbcPort)
        : (primary.port !== undefined && primary.port !== null ? String(primary.port) : ''),
      sbcUsername: wire.sbcUsername || primary.username || '',
      sbcPassword: wire.sbcPassword || primary.password || '',
      sbcDomain: wire.sbcDomain || primary.domain || '',
      sbcSecondaryHost: wire.sbcSecondaryHost || secondary.host || '',
      sbcSecondaryPort: wire.sbcSecondaryPort !== undefined && wire.sbcSecondaryPort !== null && wire.sbcSecondaryPort !== ''
        ? String(wire.sbcSecondaryPort)
        : (secondary.port !== undefined && secondary.port !== null ? String(secondary.port) : ''),
      sbcSecondaryUsername: wire.sbcSecondaryUsername || secondary.username || '',
      sbcSecondaryPassword: wire.sbcSecondaryPassword || secondary.password || '',
      sbcSecondaryDomain: wire.sbcSecondaryDomain || secondary.domain || '',
      sbcFailbackToPrimary: wire.sbcFailbackToPrimary !== false,
      lineLabel: wire.lineLabel || '',
      lineLabelA: wire.lineLabelA || '',
      lineLabelB: wire.lineLabelB || '',
      circuitNumber: wire.circuitNumber || '',
      mode: wire.mode || 'ARD',
      subscriberId: wire.subscriberId || '',
      internalWire: isInternal,
      homeSubscriberId: wire.homeSubscriberId || '',
      secondarySubscriberId: wire.secondarySubscriberId || '',
      isExternalCommunity: wire.isExternalCommunity || false,
      externalCommunityId: wire.externalCommunityId || '',
      externalCommunityName: wire.externalCommunityName || ''
    });
    setIsAutoLabel(!(wire.lineLabel && wire.lineLabel.trim().length > 0));
    setShowModal(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this private wire?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (formData.sbcPort && !Number.isFinite(parseInt(formData.sbcPort, 10))) {
      toast.error('Invalid SBC Port');
      return;
    }
    if (formData.sbcSecondaryPort && !Number.isFinite(parseInt(formData.sbcSecondaryPort, 10))) {
      toast.error('Invalid secondary SBC Port');
      return;
    }

    // Validate internal wire fields
    if (formData.internalWire) {
      if (!formData.homeSubscriberId || !formData.secondarySubscriberId) {
        toast.error('Internal wire requires both A-end and B-end subscribers');
        return;
      }
    }

    // Validate external community fields if enabled
    if (formData.isExternalCommunity && (!formData.externalCommunityId || !formData.externalCommunityName)) {
      toast.error('External community ID and name are required when external community is enabled');
      return;
    }

    saveMutation.mutate({
      uriAddress: formData.internalWire ? null : formData.uriAddress,
      sbcHost: formData.sbcHost,
      sbcPort: formData.sbcPort,
      sbcUsername: formData.sbcUsername,
      sbcPassword: formData.sbcPassword,
      sbcDomain: formData.sbcDomain,
      sbcSecondaryHost: formData.sbcSecondaryHost,
      sbcSecondaryPort: formData.sbcSecondaryPort,
      sbcSecondaryUsername: formData.sbcSecondaryUsername,
      sbcSecondaryPassword: formData.sbcSecondaryPassword,
      sbcSecondaryDomain: formData.sbcSecondaryDomain,
      sbcFailbackToPrimary: formData.sbcFailbackToPrimary,
      // For internal mirrored wires we support per-end labels.
      // Keep sending lineLabel for backwards compatibility/validation.
      lineLabel: formData.internalWire ? (formData.lineLabelA || formData.lineLabelB || formData.lineLabel) : formData.lineLabel,
      lineLabelA: formData.internalWire ? formData.lineLabelA : undefined,
      lineLabelB: formData.internalWire ? formData.lineLabelB : undefined,
      circuitNumber: formData.circuitNumber || null,
      mode: formData.mode,
      subscriberId: formData.subscriberId || null,
      internalWire: formData.internalWire,
      homeSubscriberId: formData.internalWire ? formData.homeSubscriberId : null,
      secondarySubscriberId: formData.internalWire ? formData.secondarySubscriberId : null,
      isExternalCommunity: formData.isExternalCommunity,
      externalCommunityId: formData.isExternalCommunity ? formData.externalCommunityId : null,
      externalCommunityName: formData.isExternalCommunity ? formData.externalCommunityName : null
    });
  };

  const handleClose = () => {
    setShowModal(false);
    setEditingWire(null);
    resetForm();
  };

  return (
    <Container>
      <Header>
        <Title>Private Wires</Title>
        <Button variant="primary" onClick={() => { setEditingWire(null); resetForm(); setShowModal(true); }}>
          <FiPlus />
          Add Private Wire
        </Button>
      </Header>

      {isLoading ? (
        <div>Loading...</div>
      ) : isError ? (
        <Card>
          <div style={{ padding: '1.5rem', color: '#ef4444' }}>
            Failed to load private wires: {error?.response?.data?.error || error?.message || 'Unknown error'}
          </div>
        </Card>
      ) : wires.length === 0 ? (
        <Card>
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            No private wires configured
            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#6b7280' }}>
              Raw rows in DB: {rawWires.length} • Legacy (INTERCOM/GROUP/BROADCAST): {legacyWires.length}
            </div>
          </div>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell>Line Label</TableHeaderCell>
              <TableHeaderCell>AOR</TableHeaderCell>
              <TableHeaderCell>URI Address</TableHeaderCell>
              <TableHeaderCell>Mode</TableHeaderCell>
              <TableHeaderCell>Reference</TableHeaderCell>
              <TableHeaderCell>Sudo Line Reference</TableHeaderCell>
              <TableHeaderCell>Subscriber</TableHeaderCell>
              <TableHeaderCell>A-End</TableHeaderCell>
              <TableHeaderCell>B-End</TableHeaderCell>
              <TableHeaderCell>External Community</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </tr>
          </TableHeader>
          <tbody>
            {wires.map((wire) => (
              <TableRow key={wire.id}>
                <TableCell>
                  {wire.internalPairId ? (
                    <div>
                      <div><strong>A:</strong> {wire.lineLabelA || '-'}</div>
                      <div><strong>B:</strong> {wire.lineLabelB || '-'}</div>
                    </div>
                  ) : (
                    wire.lineLabel
                  )}
                </TableCell>
                <TableCell style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                  {wire.internalPairId ? (
                    <div>
                      <div>A: {wire.aorA || '-'}</div>
                      <div>B: {wire.aorB || '-'}</div>
                    </div>
                  ) : (
                    wire.aor || '-'
                  )}
                </TableCell>
                <TableCell>{wire.uriAddress}</TableCell>
                <TableCell>
                  <Badge $status={wire.mode}>{wire.mode}</Badge>
                </TableCell>
                <TableCell>{wire.circuitNumber || '-'}</TableCell>
                <TableCell style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                  {wire.internalPairId ? (
                    <div>
                      <div>A: {wire.sudoLineReferenceA || '-'}</div>
                      <div>B: {wire.sudoLineReferenceB || '-'}</div>
                    </div>
                  ) : (
                    wire.sudoLineReference
                  )}
                </TableCell>
                <TableCell>
                  {wire.internalPairId ? '-' : (subscribers.find(s => s.id === wire.subscriberId)?.name || '-')}
                </TableCell>
                <TableCell>
                  {subscribers.find(s => s.id === wire.homeSubscriberId)?.name || '-'}
                </TableCell>
                <TableCell>
                  {subscribers.find(s => s.id === wire.secondarySubscriberId)?.name || '-'}
                </TableCell>
                <TableCell>
                  {wire.isExternalCommunity ? (
                    <div>
                      <Badge variant="info" style={{ marginBottom: '0.25rem', display: 'block' }}>
                        {wire.externalCommunityName || wire.externalCommunityId}
                      </Badge>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        ID: {wire.externalCommunityId}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}>-</span>
                  )}
                </TableCell>
                <TableCell>
                  {wire.isActive ? (
                    <span style={{ color: '#10b981' }}>Active</span>
                  ) : (
                    <span style={{ color: '#6b7280' }}>Inactive</span>
                  )}
                </TableCell>
                <TableCell>
                  <ActionButtons>
                    <Button variant="secondary" size="sm" onClick={() => handleEdit(wire)}>
                      <FiEdit />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => handleDelete(wire.id)}>
                      <FiTrash2 />
                    </Button>
                  </ActionButtons>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}

      {!isLoading && !isError && legacyWires.length > 0 && (
        <Card>
          <div style={{ padding: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
              Legacy rows stored in Private Wires table (INTERCOM/GROUP/BROADCAST): {legacyWires.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem' }}>
              These are not true private wires. They were previously stored in `dealerboard_private_wires` and are shown here so they don't "disappear".
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Label</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Mode</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>AOR</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>ID</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {legacyWires.map(w => (
                    <tr key={w.id}>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{w.lineLabel || '-'}</td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{String(w.mode || '').toUpperCase()}</td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: 'monospace' }}>{w.aor || '-'}</td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: 'monospace' }}>{w.id}</td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {String(w.mode || '').toUpperCase() === 'BROADCAST' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={migrateLegacyMutation.isLoading}
                              onClick={() => {
                                if (window.confirm('Migrate this legacy BROADCAST row into the Broadcasts table? This will update any button assignments that reference it.')) {
                                  migrateLegacyMutation.mutate(w.id);
                                }
                              }}
                            >
                              Migrate to Broadcasts
                            </Button>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>—</span>
                          )}

                          <Button
                            variant="danger"
                            size="sm"
                            disabled={deleteLegacyMutation.isLoading}
                            onClick={() => {
                              if (window.confirm('FORCE DELETE: This will permanently delete the legacy row AND clear any dealerboard button assignments that reference it. Continue?')) {
                                deleteLegacyMutation.mutate({ ids: [w.id], force: true });
                              }
                            }}
                          >
                            Force Delete (clears buttons)
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Modal */}
      {showModal && (
        <Modal onClick={handleClose}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h3>{editingWire ? 'Edit Private Wire' : 'Add Private Wire'}</h3>
              <Button variant="secondary" onClick={handleClose}>
                <FiX />
              </Button>
            </ModalHeader>
            <ModalBody>
              <form onSubmit={handleSubmit}>
                <FormGroup>
                  <Label>
                    <input
                      type="checkbox"
                      checked={formData.internalWire}
                      onChange={(e) => setFormData({
                        ...formData,
                        internalWire: e.target.checked,
                        // Default signalling for internal wires is ARD
                        mode: e.target.checked ? 'ARD' : formData.mode,
                        // Internal wires can't be external community connections
                        isExternalCommunity: e.target.checked ? false : formData.isExternalCommunity
                      })}
                      style={{ marginRight: '0.5rem' }}
                    />
                    Internal Wire (Subscriber ↔ Subscriber)
                  </Label>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Simple setup: pick A-end and B-end subscribers (can be the same). No SBC/URI required.
                  </div>
                </FormGroup>

                {formData.internalWire && (
                  <>
                    <FormGroup>
                      <Label>A-End Subscriber *</Label>
                      <Select
                        value={formData.homeSubscriberId}
                        onChange={(e) => {
                          setIsAutoLabel(true);
                          setFormData({ ...formData, homeSubscriberId: e.target.value });
                        }}
                        required={formData.internalWire}
                      >
                        <option value="">Select subscriber</option>
                        {subscribers.filter((sub) => sub.isActive !== false).map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}{sub.serverId ? ` (${sub.serverId})` : ''}
                          </option>
                        ))}
                      </Select>
                    </FormGroup>

                    <FormGroup>
                      <Label>B-End Subscriber *</Label>
                      <Select
                        value={formData.secondarySubscriberId}
                        onChange={(e) => {
                          setIsAutoLabel(true);
                          setFormData({ ...formData, secondarySubscriberId: e.target.value });
                        }}
                        required={formData.internalWire}
                      >
                        <option value="">Select subscriber</option>
                        {subscribers.filter((sub) => sub.isActive !== false).map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}{sub.serverId ? ` (${sub.serverId})` : ''}
                          </option>
                        ))}
                      </Select>
                    </FormGroup>
                  </>
                )}

                {!formData.internalWire && (
                <FormGroup>
                  <Label>URI Address *</Label>
                  <Input
                    value={formData.uriAddress}
                    onChange={(e) => setFormData({ ...formData, uriAddress: e.target.value })}
                    placeholder="sip:line@example.com"
                    required
                  />
                </FormGroup>
                )}

                {!formData.internalWire && (
                <FormGroup>
                  <Label>SBC Host</Label>
                  <Input
                    value={formData.sbcHost}
                    onChange={(e) => setFormData({ ...formData, sbcHost: e.target.value })}
                    placeholder="sbc.example.com"
                  />
                </FormGroup>
                )}

                {!formData.internalWire && (
                <FormGroup>
                  <Label>SBC Port</Label>
                  <Input
                    value={formData.sbcPort}
                    onChange={(e) => setFormData({ ...formData, sbcPort: e.target.value })}
                    placeholder="5060"
                  />
                </FormGroup>
                )}

                {!formData.internalWire && (
                <FormGroup>
                  <Label>SBC Username</Label>
                  <Input
                    value={formData.sbcUsername}
                    onChange={(e) => setFormData({ ...formData, sbcUsername: e.target.value })}
                    placeholder="user"
                  />
                </FormGroup>
                )}

                {!formData.internalWire && (
                <FormGroup>
                  <Label>SBC Password</Label>
                  <Input
                    type="password"
                    value={formData.sbcPassword}
                    onChange={(e) => setFormData({ ...formData, sbcPassword: e.target.value })}
                    placeholder="password"
                  />
                </FormGroup>
                )}

                {!formData.internalWire && (
                <FormGroup>
                  <Label>SBC Domain</Label>
                  <Input
                    value={formData.sbcDomain}
                    onChange={(e) => setFormData({ ...formData, sbcDomain: e.target.value })}
                    placeholder="sip.example.com"
                  />
                </FormGroup>
                )}

                {!formData.internalWire && (
                <>
                  <div style={{ fontWeight: 600, marginTop: '0.5rem', marginBottom: '0.25rem' }}>Secondary SBC (failover)</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Alternate route to the same logical SIP line (same button and AOR). Host and port are required;
                    username, password, and domain inherit from primary when left blank.
                  </div>
                  <FormGroup>
                    <Label>Secondary SBC Host</Label>
                    <Input
                      value={formData.sbcSecondaryHost}
                      onChange={(e) => setFormData({ ...formData, sbcSecondaryHost: e.target.value })}
                      placeholder="sbc-backup.example.com"
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>Secondary SBC Port</Label>
                    <Input
                      value={formData.sbcSecondaryPort}
                      onChange={(e) => setFormData({ ...formData, sbcSecondaryPort: e.target.value })}
                      placeholder="5060"
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>Secondary SBC Username</Label>
                    <Input
                      value={formData.sbcSecondaryUsername}
                      onChange={(e) => setFormData({ ...formData, sbcSecondaryUsername: e.target.value })}
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>Secondary SBC Password</Label>
                    <Input
                      type="password"
                      value={formData.sbcSecondaryPassword}
                      onChange={(e) => setFormData({ ...formData, sbcSecondaryPassword: e.target.value })}
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>Secondary SBC Domain</Label>
                    <Input
                      value={formData.sbcSecondaryDomain}
                      onChange={(e) => setFormData({ ...formData, sbcSecondaryDomain: e.target.value })}
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>
                      <input
                        type="checkbox"
                        checked={formData.sbcFailbackToPrimary !== false}
                        onChange={(e) => setFormData({ ...formData, sbcFailbackToPrimary: e.target.checked })}
                        style={{ marginRight: '0.5rem' }}
                      />
                      Automatically fail back to primary SBC when it recovers
                    </Label>
                  </FormGroup>
                </>
                )}

                <FormGroup>
                  <Label>Line Label *</Label>
                  <Input
                    value={formData.lineLabel}
                    onChange={(e) => {
                      setIsAutoLabel(false);
                      setFormData({ ...formData, lineLabel: e.target.value });
                    }}
                    placeholder="Broker Line 1"
                    required={!formData.internalWire}
                    disabled={formData.internalWire}
                  />
                  {formData.internalWire && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      Internal wires use per-end labels (below).
                    </div>
                  )}
                </FormGroup>

                {formData.internalWire && (
                  <>
                    <FormGroup>
                      <Label>Line Label (A-End) *</Label>
                      <Input
                        value={formData.lineLabelA}
                        onChange={(e) => setFormData({ ...formData, lineLabelA: e.target.value })}
                        placeholder={internalDefaultLabelA || 'A'}
                        required={formData.internalWire}
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>Line Label (B-End) *</Label>
                      <Input
                        value={formData.lineLabelB}
                        onChange={(e) => setFormData({ ...formData, lineLabelB: e.target.value })}
                        placeholder={internalDefaultLabelB || 'B'}
                        required={formData.internalWire}
                      />
                    </FormGroup>
                  </>
                )}

                <FormGroup>
                  <Label>Reference number</Label>
                  <Input
                    value={formData.circuitNumber}
                    onChange={(e) => setFormData({ ...formData, circuitNumber: e.target.value })}
                    placeholder="REF-001"
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Mode *</Label>
                  <Select
                    value={formData.mode}
                    onChange={(e) => setFormData({ ...formData, mode: e.target.value })}
                    required
                  >
                    <option value="ARD">ARD (Auto Ring Down)</option>
                    <option value="MRD">MRD (Manual Ring Down)</option>
                    <option value="HOOT">HOOT (Always Open)</option>
                    <option value="INTERNAL">INTERNAL (legacy)</option>
                  </Select>
                </FormGroup>

                <FormGroup>
                  <Label>Subscriber</Label>
                  <Select
                    value={formData.subscriberId}
                    onChange={(e) => setFormData({ ...formData, subscriberId: e.target.value })}
                  >
                    <option value="">None</option>
                    {subscribers.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </Select>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Allocate to subscriber for local communication
                  </div>
                </FormGroup>

                <FormGroup>
                  <Label>
                    <input
                      type="checkbox"
                      checked={formData.isExternalCommunity}
                      onChange={(e) => setFormData({ ...formData, isExternalCommunity: e.target.checked })}
                      style={{ marginRight: '0.5rem' }}
                    />
                    External Community Connection
                  </Label>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Enable for private wires connecting to external communities
                  </div>
                </FormGroup>

                {formData.isExternalCommunity && (
                  <>
                    <FormGroup>
                      <Label>External Community ID *</Label>
                      <Input
                        type="text"
                        value={formData.externalCommunityId}
                        onChange={(e) => setFormData({ ...formData, externalCommunityId: e.target.value })}
                        placeholder="e.g., community-001"
                        required={formData.isExternalCommunity}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label>External Community Name *</Label>
                      <Input
                        type="text"
                        value={formData.externalCommunityName}
                        onChange={(e) => setFormData({ ...formData, externalCommunityName: e.target.value })}
                        placeholder="e.g., Trading Community A"
                        required={formData.isExternalCommunity}
                      />
                    </FormGroup>
                  </>
                )}

                <ModalFooter>
                  <Button variant="secondary" type="button" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" disabled={saveMutation.isLoading}>
                    <FiCheck />
                    {editingWire ? 'Update' : 'Create'}
                  </Button>
                </ModalFooter>
              </form>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
};

export default AdminPrivateWires;

