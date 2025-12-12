import React, { useState, useMemo } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { 
  FiSearch, 
  FiFilter, 
  FiUsers, 
  FiRefreshCw,
  FiX,
  FiPhone,
  FiClock,
  FiUserPlus,
  FiUserMinus,
  FiEdit,
  FiTrash2
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
    if (props.$variant === 'group-call') return 'rgba(6, 182, 212, 0.2)';
    if (props.$variant === 'conference') return 'rgba(16, 185, 129, 0.2)';
    return 'rgba(107, 114, 128, 0.2)';
  }};
  color: ${props => {
    if (props.$variant === 'group-call') return props.theme.colors.accent;
    if (props.$variant === 'conference') return props.theme.colors.success;
    return props.theme.colors.text;
  }};
`;

const ActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: transparent;
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.sm};
  color: ${props => props.theme.colors.text};
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  margin-right: 0.5rem;
  
  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
    border-color: ${props => props.theme.colors.accent};
    color: ${props => props.theme.colors.accent};
  }
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

const FormSelect = styled.select`
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

const EditGroupModal = ({ group, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: group.name || '',
    description: group.description || '',
    maxParticipants: group.maxParticipants || 200,
    callMode: group.callMode || 'conference',
    allowRecording: group.allowRecording !== false,
    pushToTalk: group.pushToTalk || false,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Edit Group</ModalTitle>
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
              <FormLabel>Call Mode</FormLabel>
              <FormSelect
                value={formData.callMode}
                onChange={(e) => setFormData({ ...formData, callMode: e.target.value })}
              >
                <option value="conference">Conference</option>
                <option value="group-call">Group Call</option>
                <option value="hunt">Hunt</option>
              </FormSelect>
            </FormGroup>
            <FormGroup>
              <FormLabel>Max Participants</FormLabel>
              <FormInput
                type="number"
                min="2"
                max="1000"
                value={formData.maxParticipants}
                onChange={(e) => setFormData({ ...formData, maxParticipants: parseInt(e.target.value) || 200 })}
              />
            </FormGroup>
            <FormGroup>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.allowRecording}
                  onChange={(e) => setFormData({ ...formData, allowRecording: e.target.checked })}
                />
                <span style={{ color: theme.colors.text }}>Allow Recording</span>
              </label>
            </FormGroup>
            <FormGroup>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.pushToTalk}
                  onChange={(e) => setFormData({ ...formData, pushToTalk: e.target.checked })}
                />
                <span style={{ color: theme.colors.text }}>Push to Talk</span>
              </label>
            </FormGroup>
          </ModalBody>
          <ModalFooter>
            <ModalButton type="button" onClick={onClose}>
              Cancel
            </ModalButton>
            <ModalButton $primary type="submit">
              <FiEdit />
              Update Group
            </ModalButton>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const AdminGroupManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const queryClient = useQueryClient();

  // Fetch groups
  const { data: groups = [], isLoading, refetch } = useQuery(
    'admin-groups',
    async () => {
      const response = await api.get('/api/groups');
      const allGroups = response.data?.groups || [];
      // Filter out broadcasts
      return allGroups.filter(group => (group.callMode || 'conference') !== 'broadcast');
    },
    {
      retry: 2,
      onError: (error) => {
        if (error.response?.status !== 401 && error.response?.status !== 403) {
          toast.error('Failed to load groups');
        }
      }
    }
  );

  // Filter groups
  const filteredGroups = useMemo(() => {
    return groups.filter(group => {
      const matchesSearch = !searchTerm || 
        (group.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (group.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const callMode = group.callMode || 'conference';
      const matchesType = filterType === 'all' || 
        (filterType === 'group-call' && (callMode === 'hunt' || callMode === 'group-call')) ||
        (filterType === 'conference' && callMode === 'conference');
      
      return matchesSearch && matchesType;
    });
  }, [groups, searchTerm, filterType]);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterType('all');
  };

  const handleDoubleClick = (group) => {
    setEditingGroup(group);
    setShowEditModal(true);
  };

  const handleCloseEdit = () => {
    setShowEditModal(false);
    setEditingGroup(null);
    queryClient.invalidateQueries('admin-groups');
  };

  const handleSaveGroup = async (groupData) => {
    if (!editingGroup) return;
    
    try {
      await api.put(`/api/groups/${editingGroup.id}`, groupData);
      toast.success('Group updated successfully');
      handleCloseEdit();
      refetch();
    } catch (error) {
      toast.error('Failed to update group');
      console.error('Update group error:', error);
    }
  };

  const getCallModeLabel = (callMode) => {
    const mode = callMode || 'conference';
    if (mode === 'hunt' || mode === 'group-call') {
      return { label: 'Group Call', variant: 'group-call' };
    }
    return { label: 'Conference', variant: 'conference' };
  };

  return (
    <ThemeProvider theme={theme}>
      <Container>
        <FilterPanel>
          <FilterSection>
            <FilterTitle>Search</FilterTitle>
            <SearchInput
              type="text"
              placeholder="Search groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </FilterSection>

          <FilterSection>
            <FilterTitle>Type</FilterTitle>
            <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              <option value="group-call">Group Calls</option>
              <option value="conference">Conferences</option>
            </Select>
          </FilterSection>

          <ClearButton onClick={clearFilters}>
            Clear Filters
          </ClearButton>
        </FilterPanel>

        <MainContent>
          <TableHeader>
            <TableTitle>Groups ({filteredGroups.length})</TableTitle>
            <HeaderButton onClick={() => refetch()} disabled={isLoading}>
              <FiRefreshCw />
              Refresh
            </HeaderButton>
          </TableHeader>
          
          <TableContainer>
            {isLoading ? (
              <EmptyState>Loading groups...</EmptyState>
            ) : filteredGroups.length === 0 ? (
              <EmptyState>No groups found</EmptyState>
            ) : (
              <Table>
                <TableHead>
                  <TableHeaderRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Participants</TableHeaderCell>
                    <TableHeaderCell>Max Participants</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell>Last Used</TableHeaderCell>
                  </TableHeaderRow>
                </TableHead>
                <TableBody>
                  {filteredGroups.map(group => {
                    const modeInfo = getCallModeLabel(group.callMode);
                    const participants = Array.isArray(group.participants) ? group.participants : [];
                    return (
                      <TableRow 
                        key={group.id}
                        onDoubleClick={() => handleDoubleClick(group)}
                        style={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <div>
                            <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                              {group.name || 'Unnamed Group'}
                            </div>
                            {group.description && (
                              <div style={{ fontSize: '0.75rem', color: theme.colors.textTertiary }}>
                                {group.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge $variant={modeInfo.variant}>
                            {modeInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{participants.length}</TableCell>
                        <TableCell>{group.maxParticipants || '—'}</TableCell>
                        <TableCell>
                          {group.createdAt 
                            ? format(new Date(group.createdAt), 'MMM dd, yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {group.lastUsedOn 
                            ? format(new Date(group.lastUsedOn), 'MMM dd, yyyy HH:mm')
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

        {showEditModal && editingGroup && (
          <EditGroupModal
            group={editingGroup}
            onClose={handleCloseEdit}
            onSave={handleSaveGroup}
          />
        )}
      </Container>
    </ThemeProvider>
  );
};

export default AdminGroupManagement;

