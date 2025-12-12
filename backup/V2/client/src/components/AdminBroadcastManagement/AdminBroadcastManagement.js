import React, { useState, useMemo } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { 
  FiSearch, 
  FiFilter, 
  FiRadio, 
  FiRefreshCw,
  FiX,
  FiUsers,
  FiMic,
  FiClock,
  FiActivity,
  FiSettings,
  FiEdit
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { theme } from '../../styles/GlobalStyle';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

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

const HeaderButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.border};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
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
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
  }
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
    if (props.$variant === 'active') return 'rgba(16, 185, 129, 0.2)';
    if (props.$variant === 'inactive') return 'rgba(107, 114, 128, 0.2)';
    return 'rgba(245, 158, 11, 0.2)';
  }};
  color: ${props => {
    if (props.$variant === 'active') return props.theme.colors.success;
    if (props.$variant === 'inactive') return props.theme.colors.textTertiary;
    return props.theme.colors.warning;
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
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
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

const ModalBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const FormLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
`;

const FormInput = styled.input`
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

const FormTextarea = styled.textarea`
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  min-height: 80px;
  resize: vertical;
  font-family: inherit;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1.5rem;
`;

const ModalButton = styled.button`
  padding: 0.75rem 1.5rem;
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  
  ${props => props.$primary ? `
    background: ${props.theme.colors.gradient};
    color: white;
    border: none;
  ` : `
    background: ${props.theme.colors.surfaceElevated};
    color: ${props.theme.colors.text};
    border: 1px solid ${props.theme.colors.border};
  `}
  
  &:hover {
    transform: translateY(-1px);
    box-shadow: ${props => props.theme.shadows.md};
  }
`;

const EditBroadcastModal = ({ broadcast, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: broadcast.name || '',
    description: broadcast.description || '',
    maxListeners: broadcast.hootConfig?.maxListeners || broadcast.maxParticipants || 100,
    maxSpeakers: broadcast.hootConfig?.maxSpeakers || 100,
    persistentListen: broadcast.hootConfig?.persistentListen || false,
    allowLatch: broadcast.hootConfig?.allowLatch || false,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      name: formData.name,
      description: formData.description,
      callMode: 'broadcast',
      hootConfig: {
        maxListeners: Number(formData.maxListeners) || 100,
        maxSpeakers: Number(formData.maxSpeakers) || 100,
        persistentListen: formData.persistentListen,
        defaultPushToTalk: true,
        allowLatch: formData.allowLatch,
      }
    });
  };

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Edit Broadcast</ModalTitle>
          <ModalCloseButton onClick={onClose}>
            <FiX />
          </ModalCloseButton>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <FormGroup>
              <FormLabel>Name *</FormLabel>
              <FormInput
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </FormGroup>
            <FormGroup>
              <FormLabel>Description</FormLabel>
              <FormTextarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <FormLabel>Max Listeners</FormLabel>
              <FormInput
                type="number"
                min="1"
                max="1000"
                value={formData.maxListeners}
                onChange={(e) => setFormData({ ...formData, maxListeners: parseInt(e.target.value) || 100 })}
              />
            </FormGroup>
            <FormGroup>
              <FormLabel>Max Speakers</FormLabel>
              <FormInput
                type="number"
                min="1"
                max="1000"
                value={formData.maxSpeakers}
                onChange={(e) => setFormData({ ...formData, maxSpeakers: parseInt(e.target.value) || 100 })}
              />
            </FormGroup>
            <FormGroup>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.persistentListen}
                  onChange={(e) => setFormData({ ...formData, persistentListen: e.target.checked })}
                />
                <span style={{ color: theme.colors.text }}>Persistent Listen</span>
              </label>
            </FormGroup>
            <FormGroup>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.allowLatch}
                  onChange={(e) => setFormData({ ...formData, allowLatch: e.target.checked })}
                />
                <span style={{ color: theme.colors.text }}>Allow Latch</span>
              </label>
            </FormGroup>
          </ModalBody>
          <ModalFooter>
            <ModalButton type="button" onClick={onClose}>
              Cancel
            </ModalButton>
            <ModalButton $primary type="submit">
              <FiEdit />
              Update Broadcast
            </ModalButton>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const AdminBroadcastManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBroadcast, setEditingBroadcast] = useState(null);
  const queryClient = useQueryClient();

  // Fetch broadcasts
  const { data: broadcasts = [], isLoading, refetch } = useQuery(
    'admin-broadcasts',
    async () => {
      const response = await api.get('/api/groups', {
        params: { callMode: 'broadcast' }
      });
      const groups = response.data?.groups || [];
      return groups.map(group => ({
        ...group,
        participants: Array.isArray(group.participants) ? group.participants : [],
      }));
    },
    {
      retry: 2,
      onError: (error) => {
        if (error.response?.status !== 401 && error.response?.status !== 403) {
          toast.error('Failed to load broadcasts');
        }
      }
    }
  );

  // Filter broadcasts
  const filteredBroadcasts = useMemo(() => {
    return broadcasts.filter(broadcast => {
      const matchesSearch = !searchTerm || 
        (broadcast.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (broadcast.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const isActive = broadcast.hoot?.state?.isActive || false;
      const matchesStatus = filterStatus === 'all' || 
        (filterStatus === 'active' && isActive) ||
        (filterStatus === 'inactive' && !isActive);
      
      return matchesSearch && matchesStatus;
    });
  }, [broadcasts, searchTerm, filterStatus]);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
  };

  const handleDoubleClick = (broadcast) => {
    setEditingBroadcast(broadcast);
    setShowEditModal(true);
  };

  const handleCloseEdit = () => {
    setShowEditModal(false);
    setEditingBroadcast(null);
    queryClient.invalidateQueries('admin-broadcasts');
  };

  const handleSaveBroadcast = async (broadcastData) => {
    if (!editingBroadcast) return;
    
    try {
      await api.put(`/api/groups/${editingBroadcast.id}`, broadcastData);
      toast.success('Broadcast updated successfully');
      handleCloseEdit();
      refetch();
    } catch (error) {
      toast.error('Failed to update broadcast');
      console.error('Update broadcast error:', error);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <Container>
        <FilterPanel>
          <FilterSection>
            <FilterTitle>Search</FilterTitle>
            <SearchInput
              type="text"
              placeholder="Search broadcasts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </FilterSection>

          <FilterSection>
            <FilterTitle>Status</FilterTitle>
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </FilterSection>

          <ClearButton onClick={clearFilters}>
            Clear Filters
          </ClearButton>
        </FilterPanel>

        <MainContent>
          <TableHeader>
            <TableTitle>Broadcasts ({filteredBroadcasts.length})</TableTitle>
            <HeaderButton onClick={() => refetch()} disabled={isLoading}>
              <FiRefreshCw />
              Refresh
            </HeaderButton>
          </TableHeader>
          
          <TableContainer>
            {isLoading ? (
              <EmptyState>Loading broadcasts...</EmptyState>
            ) : filteredBroadcasts.length === 0 ? (
              <EmptyState>No broadcasts found</EmptyState>
            ) : (
              <Table>
                <TableHead>
                  <TableHeaderRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Listeners</TableHeaderCell>
                    <TableHeaderCell>Speakers</TableHeaderCell>
                    <TableHeaderCell>Max Listeners</TableHeaderCell>
                    <TableHeaderCell>Max Speakers</TableHeaderCell>
                    <TableHeaderCell>Last Spoken</TableHeaderCell>
                  </TableHeaderRow>
                </TableHead>
                <TableBody>
                  {filteredBroadcasts.map(broadcast => {
                    const isActive = broadcast.hoot?.state?.isActive || false;
                    const listenerCount = broadcast.hoot?.state?.listenerCount || 0;
                    const speakerCount = broadcast.hoot?.state?.speakerCount || 0;
                    const maxListeners = broadcast.hootConfig?.maxListeners || broadcast.maxParticipants || '—';
                    const maxSpeakers = broadcast.hootConfig?.maxSpeakers || '—';
                    
                    return (
                      <TableRow 
                        key={broadcast.id}
                        onDoubleClick={() => handleDoubleClick(broadcast)}
                        style={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <div>
                            <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                              {broadcast.name || 'Unnamed Broadcast'}
                            </div>
                            {broadcast.description && (
                              <div style={{ fontSize: '0.75rem', color: theme.colors.textTertiary }}>
                                {broadcast.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge $variant={isActive ? 'active' : 'inactive'}>
                            {isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>{listenerCount}</TableCell>
                        <TableCell>{speakerCount}</TableCell>
                        <TableCell>{maxListeners}</TableCell>
                        <TableCell>{maxSpeakers}</TableCell>
                        <TableCell>
                          {broadcast.lastSpokenAt 
                            ? format(new Date(broadcast.lastSpokenAt), 'MMM dd, yyyy HH:mm')
                            : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TableContainer>
        </MainContent>

        {showEditModal && editingBroadcast && (
          <EditBroadcastModal
            broadcast={editingBroadcast}
            onClose={handleCloseEdit}
            onSave={handleSaveBroadcast}
          />
        )}
      </Container>
    </ThemeProvider>
  );
};

export default AdminBroadcastManagement;

