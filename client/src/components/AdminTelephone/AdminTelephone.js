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

const AdminTelephone = () => {
  const [showModal, setShowModal] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [formData, setFormData] = useState({
    lineNumber: '',
    lineName: '',
    sbcDetails: '',
    connectionDetails: '',
    subscriberId: ''
  });

  const queryClient = useQueryClient();

  // Fetch DDI lines
  const { data: linesData, isLoading } = useQuery(
    'ddiLines',
    async () => {
      const res = await api.get('/api/dealerboard/ddi-lines');
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

  const lines = linesData?.lines || [];
  const subscribers = subscribersData || [];

  // Create/Update mutation
  const saveMutation = useMutation(
    async (data) => {
      if (editingLine) {
        const res = await api.put(`/api/dealerboard/ddi-lines/${editingLine.id}`, data);
        return res.data;
      } else {
        const res = await api.post('/api/dealerboard/ddi-lines', data);
        return res.data;
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('ddiLines');
        setShowModal(false);
        setEditingLine(null);
        resetForm();
        toast.success(editingLine ? 'DDI line updated successfully' : 'DDI line created successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save DDI line');
      }
    }
  );

  // Delete mutation
  const deleteMutation = useMutation(
    async (id) => {
      await api.delete(`/api/dealerboard/ddi-lines/${id}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('ddiLines');
        toast.success('DDI line deleted successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete DDI line');
      }
    }
  );

  const resetForm = () => {
    setFormData({
      lineNumber: '',
      lineName: '',
      sbcDetails: '',
      connectionDetails: '',
      subscriberId: ''
    });
  };

  const handleEdit = (line) => {
    setEditingLine(line);
    setFormData({
      lineNumber: line.lineNumber || '',
      lineName: line.lineName || '',
      sbcDetails: typeof line.sbcDetails === 'object' ? JSON.stringify(line.sbcDetails, null, 2) : line.sbcDetails || '',
      connectionDetails: typeof line.connectionDetails === 'object' ? JSON.stringify(line.connectionDetails, null, 2) : line.connectionDetails || '',
      subscriberId: line.subscriberId || ''
    });
    setShowModal(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this DDI line?')) {
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

    let connectionDetailsParsed = {};
    if (formData.connectionDetails.trim()) {
      try {
        connectionDetailsParsed = JSON.parse(formData.connectionDetails);
      } catch (error) {
        toast.error('Invalid JSON in Connection Details');
        return;
      }
    }

    saveMutation.mutate({
      lineNumber: formData.lineNumber,
      lineName: formData.lineName,
      sbcDetails: sbcDetailsParsed,
      connectionDetails: connectionDetailsParsed,
      subscriberId: formData.subscriberId || null
    });
  };

  const handleClose = () => {
    setShowModal(false);
    setEditingLine(null);
    resetForm();
  };

  return (
    <Container>
      <Header>
        <Title>Telephone (DDI Lines)</Title>
        <Button variant="primary" onClick={() => { setEditingLine(null); resetForm(); setShowModal(true); }}>
          <FiPlus />
          Add DDI Line
        </Button>
      </Header>

      {isLoading ? (
        <div>Loading...</div>
      ) : lines.length === 0 ? (
        <Card>
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            No DDI lines configured
          </div>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell>Line Number</TableHeaderCell>
              <TableHeaderCell>Line Name</TableHeaderCell>
              <TableHeaderCell>Sudo Line Reference</TableHeaderCell>
              <TableHeaderCell>Subscriber</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </tr>
          </TableHeader>
          <tbody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.lineNumber}</TableCell>
                <TableCell>{line.lineName}</TableCell>
                <TableCell style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                  {line.sudoLineReference}
                </TableCell>
                <TableCell>
                  {subscribers.find(s => s.id === line.subscriberId)?.name || '-'}
                </TableCell>
                <TableCell>
                  {line.isActive ? (
                    <span style={{ color: '#10b981' }}>Active</span>
                  ) : (
                    <span style={{ color: '#6b7280' }}>Inactive</span>
                  )}
                </TableCell>
                <TableCell>
                  <ActionButtons>
                    <Button variant="secondary" size="sm" onClick={() => handleEdit(line)}>
                      <FiEdit />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => handleDelete(line.id)}>
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
              <h3>{editingLine ? 'Edit DDI Line' : 'Add DDI Line'}</h3>
              <Button variant="secondary" onClick={handleClose}>
                <FiX />
              </Button>
            </ModalHeader>
            <ModalBody>
              <form onSubmit={handleSubmit}>
                <FormGroup>
                  <Label>Line Number *</Label>
                  <Input
                    value={formData.lineNumber}
                    onChange={(e) => setFormData({ ...formData, lineNumber: e.target.value })}
                    placeholder="+1234567890"
                    required
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Line Name *</Label>
                  <Input
                    value={formData.lineName}
                    onChange={(e) => setFormData({ ...formData, lineName: e.target.value })}
                    placeholder="Main Office Line"
                    required
                  />
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    This name will appear on dealerboard buttons
                  </div>
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
                  <Label>Connection Details (JSON)</Label>
                  <Textarea
                    value={formData.connectionDetails}
                    onChange={(e) => setFormData({ ...formData, connectionDetails: e.target.value })}
                    placeholder='{"provider": "Example Telecom", "account": "ACC123"}'
                  />
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Enter connection/provider details as JSON
                  </div>
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

                <ModalFooter>
                  <Button variant="secondary" type="button" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" disabled={saveMutation.isLoading}>
                    <FiCheck />
                    {editingLine ? 'Update' : 'Create'}
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

export default AdminTelephone;

