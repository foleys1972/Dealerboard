import React, { useState } from 'react';
import styled from 'styled-components';
import { FiPlus, FiEdit, FiTrash2, FiX, FiCheck, FiUsers } from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { 
  Card, 
  Button, 
  Input, 
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
  min-height: 60px;
  
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
  background: ${props => props.$active ? '#10b981' : '#6b7280'};
  color: white;
`;

const MembersModal = ({ group, onClose }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  
  const queryClient = useQueryClient();

  // Fetch group members
  const { data: membersData } = useQuery(
    ['group-members', group?.id],
    async () => {
      const res = await api.get(`/api/dealerboard/groups/${group.id}/members`);
      return res.data;
    },
    { enabled: !!group?.id }
  );

  // Fetch all users
  const { data: usersData } = useQuery(
    'admin-users',
    async () => {
      const res = await api.get('/api/auth/users');
      return res.data?.users || res.data || [];
    }
  );

  const members = membersData?.members || [];
  const users = usersData || [];

  // Add member mutation
  const addMemberMutation = useMutation(
    async (userId) => {
      await api.post(`/api/dealerboard/groups/${group.id}/members`, { userId });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['group-members', group.id]);
        setShowAddModal(false);
        setSelectedUserId('');
        toast.success('User added to group');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to add user to group');
      }
    }
  );

  // Remove member mutation
  const removeMemberMutation = useMutation(
    async (userId) => {
      await api.delete(`/api/dealerboard/groups/${group.id}/members/${userId}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['group-members', group.id]);
        toast.success('User removed from group');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to remove user from group');
      }
    }
  );

  const availableUsers = users.filter(u => !members.find(m => m.id === u.id || m.id === u.userId));

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <ModalHeader>
          <h3>Group Members: {group.name}</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
          </Button>
        </ModalHeader>
        <ModalBody>
          <div style={{ marginBottom: '1rem' }}>
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              <FiPlus />
              Add Member
            </Button>
          </div>

          {members.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              No members in this group
            </div>
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </tr>
              </TableHeader>
              <tbody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.displayName || `${member.firstName} ${member.lastName}` || member.username}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => removeMemberMutation.mutate(member.id)}
                      >
                        <FiTrash2 />
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          )}

          {showAddModal && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f3f4f6', borderRadius: '8px' }}>
              <FormGroup>
                <Label>Select User</Label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px'
                  }}
                >
                  <option value="">Select a user...</option>
                  {availableUsers.map(user => (
                    <option key={user.id || user.userId} value={user.id || user.userId}>
                      {user.displayName || user.name || user.username} ({user.email})
                    </option>
                  ))}
                </select>
              </FormGroup>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <Button variant="primary" onClick={() => {
                  if (selectedUserId) {
                    addMemberMutation.mutate(selectedUserId);
                  }
                }}>
                  <FiCheck />
                  Add
                </Button>
                <Button variant="secondary" onClick={() => {
                  setShowAddModal(false);
                  setSelectedUserId('');
                }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const DealerboardGroups = () => {
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  const queryClient = useQueryClient();

  // Fetch groups
  const { data: groupsData, isLoading } = useQuery(
    'dealerboard-groups',
    async () => {
      const res = await api.get('/api/dealerboard/groups');
      return res.data;
    }
  );

  const groups = groupsData?.groups || [];

  // Create/Update mutation
  const saveMutation = useMutation(
    async (data) => {
      if (editingGroup) {
        const res = await api.put(`/api/dealerboard/groups/${editingGroup.id}`, data);
        return res.data;
      } else {
        const res = await api.post('/api/dealerboard/groups', data);
        return res.data;
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('dealerboard-groups');
        setShowModal(false);
        setEditingGroup(null);
        resetForm();
        toast.success(editingGroup ? 'Group updated successfully' : 'Group created successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save group');
      }
    }
  );

  // Delete mutation
  const deleteMutation = useMutation(
    async (id) => {
      await api.delete(`/api/dealerboard/groups/${id}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('dealerboard-groups');
        toast.success('Group deleted successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete group');
      }
    }
  );

  const resetForm = () => {
    setFormData({
      name: '',
      description: ''
    });
  };

  const handleEdit = (group) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || ''
    });
    setShowModal(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this group? This will remove all members from the group.')) {
      deleteMutation.mutate(id);
    }
  };

  const handleManageMembers = (group) => {
    setSelectedGroup(group);
    setShowMembersModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleClose = () => {
    setShowModal(false);
    setEditingGroup(null);
    resetForm();
  };

  return (
    <Container>
      <Header>
        <Title>Dealerboard Groups</Title>
        <Button variant="primary" onClick={() => { setEditingGroup(null); resetForm(); setShowModal(true); }}>
          <FiPlus />
          Add Group
        </Button>
      </Header>

      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem', padding: '1rem', background: '#f3f4f6', borderRadius: '8px' }}>
        <strong>Note:</strong> When a user in a group is assigned a line (private wire or DDI), the assignment is automatically applied to all members of the group.
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : groups.length === 0 ? (
        <Card>
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            No groups configured
          </div>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell>Group Name</TableHeaderCell>
              <TableHeaderCell>Description</TableHeaderCell>
              <TableHeaderCell>Members</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </tr>
          </TableHeader>
          <tbody>
            {groups.map((group) => (
              <TableRow key={group.id}>
                <TableCell>{group.name}</TableCell>
                <TableCell>{group.description || '-'}</TableCell>
                <TableCell>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleManageMembers(group)}
                  >
                    <FiUsers />
                    {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                  </Button>
                </TableCell>
                <TableCell>
                  <Badge $active={group.isActive}>
                    {group.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ActionButtons>
                    <Button variant="secondary" size="sm" onClick={() => handleEdit(group)}>
                      <FiEdit />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => handleDelete(group.id)}>
                      <FiTrash2 />
                    </Button>
                  </ActionButtons>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}

      {/* Group Modal */}
      {showModal && (
        <Modal onClick={handleClose}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h3>{editingGroup ? 'Edit Group' : 'Add Group'}</h3>
              <Button variant="secondary" onClick={handleClose}>
                <FiX />
              </Button>
            </ModalHeader>
            <ModalBody>
              <form onSubmit={handleSubmit}>
                <FormGroup>
                  <Label>Group Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Trading Floor A"
                    required
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description"
                  />
                </FormGroup>

                <ModalFooter>
                  <Button variant="secondary" type="button" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" disabled={saveMutation.isLoading}>
                    <FiCheck />
                    {editingGroup ? 'Update' : 'Create'}
                  </Button>
                </ModalFooter>
              </form>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}

      {/* Members Modal */}
      {showMembersModal && selectedGroup && (
        <MembersModal
          group={selectedGroup}
          onClose={() => {
            setShowMembersModal(false);
            setSelectedGroup(null);
          }}
        />
      )}
    </Container>
  );
};

export default DealerboardGroups;

