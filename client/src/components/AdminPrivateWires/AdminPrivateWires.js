import React, { useState } from 'react';
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
  const [formData, setFormData] = useState({
    uriAddress: '',
    sbcDetails: '',
    lineLabel: '',
    circuitNumber: '',
    mode: 'ARD',
    subscriberId: '',
    isExternalCommunity: false,
    externalCommunityId: '',
    externalCommunityName: ''
  });

  const queryClient = useQueryClient();

  // Fetch private wires
  const { data: wiresData, isLoading } = useQuery(
    'privateWires',
    async () => {
      const res = await api.get('/api/dealerboard/private-wires');
      return res.data;
    }
  );

  // Fetch subscribers for dropdown
  const { data: subscribersData } = useQuery(
    'subscribers',
    async () => {
      const res = await api.get('/api/subscribers');
      return res.data.subscribers || [];
    }
  );

  const wires = wiresData?.wires || [];
  const subscribers = subscribersData || [];

  // Create/Update mutation
  const saveMutation = useMutation(
    async (data) => {
      if (editingWire) {
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

  const resetForm = () => {
    setFormData({
      uriAddress: '',
      sbcDetails: '',
      lineLabel: '',
      circuitNumber: '',
      mode: 'ARD',
      subscriberId: '',
      isExternalCommunity: false,
      externalCommunityId: '',
      externalCommunityName: ''
    });
  };

  const handleEdit = (wire) => {
    setEditingWire(wire);
    setFormData({
      uriAddress: wire.uriAddress || '',
      sbcDetails: typeof wire.sbcDetails === 'object' ? JSON.stringify(wire.sbcDetails, null, 2) : wire.sbcDetails || '',
      lineLabel: wire.lineLabel || '',
      circuitNumber: wire.circuitNumber || '',
      mode: wire.mode || 'ARD',
      subscriberId: wire.subscriberId || '',
      isExternalCommunity: wire.isExternalCommunity || false,
      externalCommunityId: wire.externalCommunityId || '',
      externalCommunityName: wire.externalCommunityName || ''
    });
    setShowModal(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this private wire?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    let sbcDetailsParsed = {};
    if (formData.sbcDetails.trim()) {
      try {
        sbcDetailsParsed = JSON.parse(formData.sbcDetails);
      } catch (error) {
        toast.error('Invalid JSON in SBC Details');
        return;
      }
    }

    // Validate external community fields if enabled
    if (formData.isExternalCommunity && (!formData.externalCommunityId || !formData.externalCommunityName)) {
      toast.error('External community ID and name are required when external community is enabled');
      return;
    }

    saveMutation.mutate({
      uriAddress: formData.uriAddress,
      sbcDetails: sbcDetailsParsed,
      lineLabel: formData.lineLabel,
      circuitNumber: formData.circuitNumber || null,
      mode: formData.mode,
      subscriberId: formData.subscriberId || null,
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
      ) : wires.length === 0 ? (
        <Card>
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            No private wires configured
          </div>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell>Line Label</TableHeaderCell>
              <TableHeaderCell>URI Address</TableHeaderCell>
              <TableHeaderCell>Mode</TableHeaderCell>
              <TableHeaderCell>Circuit Number</TableHeaderCell>
              <TableHeaderCell>Sudo Line Reference</TableHeaderCell>
              <TableHeaderCell>Subscriber</TableHeaderCell>
              <TableHeaderCell>External Community</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </tr>
          </TableHeader>
          <tbody>
            {wires.map((wire) => (
              <TableRow key={wire.id}>
                <TableCell>{wire.lineLabel}</TableCell>
                <TableCell>{wire.uriAddress}</TableCell>
                <TableCell>
                  <Badge $status={wire.mode}>{wire.mode}</Badge>
                </TableCell>
                <TableCell>{wire.circuitNumber || '-'}</TableCell>
                <TableCell style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                  {wire.sudoLineReference}
                </TableCell>
                <TableCell>
                  {subscribers.find(s => s.id === wire.subscriberId)?.name || '-'}
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
                  <Label>URI Address *</Label>
                  <Input
                    value={formData.uriAddress}
                    onChange={(e) => setFormData({ ...formData, uriAddress: e.target.value })}
                    placeholder="sip:line@example.com"
                    required
                  />
                </FormGroup>

                <FormGroup>
                  <Label>SBC Details (JSON)</Label>
                  <Textarea
                    value={formData.sbcDetails}
                    onChange={(e) => setFormData({ ...formData, sbcDetails: e.target.value })}
                    placeholder='{"host": "sbc.example.com", "port": 5060, "transport": "udp"}'
                  />
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Enter SBC configuration as JSON
                  </div>
                </FormGroup>

                <FormGroup>
                  <Label>Line Label *</Label>
                  <Input
                    value={formData.lineLabel}
                    onChange={(e) => setFormData({ ...formData, lineLabel: e.target.value })}
                    placeholder="Broker Line 1"
                    required
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Circuit Number</Label>
                  <Input
                    value={formData.circuitNumber}
                    onChange={(e) => setFormData({ ...formData, circuitNumber: e.target.value })}
                    placeholder="CIRC-001"
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

