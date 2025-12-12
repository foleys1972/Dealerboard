import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { 
  FiUsers, 
  FiUser,
  FiUserPlus, 
  FiEdit, 
  FiTrash2, 
  FiSearch,
  FiFilter,
  FiDownload,
  FiUpload,
  FiSettings,
  FiActivity,
  FiShield,
  FiDatabase,
  FiServer,
  FiMail,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
  FiCloudOff,
  FiPlay,
  FiPause,
  FiArchive,
  FiPhoneCall,
  FiMessageSquare,
  FiPlus,
  FiX,
  FiCheckCircle,
  FiPhone,
  FiLink
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useAuthStore } from '../../stores/authStore';
import { 
  Card, 
  Button, 
  Input, 
  Select, 
  Badge, 
  Flex, 
  Grid, 
  Spacer,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  LoadingSpinner
} from '../../styles/GlobalStyle';
import UserManagement from '../../components/UserManagement/UserManagement';
import ComplianceDashboard from '../../components/ComplianceDashboard/ComplianceDashboard';
import AdminDirectContacts from '../../components/AdminDirectContacts/AdminDirectContacts';
import MatrixMessagesPanel from '../../components/MatrixMessagesPanel/MatrixMessagesPanel';
import AdminPrivateWires from '../../components/AdminPrivateWires/AdminPrivateWires';
import AdminTelephone from '../../components/AdminTelephone/AdminTelephone';
import AdminSystemSettings from '../../components/AdminSystemSettings/AdminSystemSettings';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { formatDistanceToNow } from 'date-fns';

const formatDuration = (ms = 0) => {
  if (!ms) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

const AdminContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.lg};
`;

const AdminHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.lg};
`;

const AdminTitle = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const AdminActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
`;

const StatsGrid = styled(Grid)`
  margin-bottom: ${props => props.theme.spacing.xl};
`;

const StatCard = styled(Card)`
  text-align: center;
  padding: ${props => props.theme.spacing.lg};
  background: ${({ $variant, theme }) => ($variant === 'primary' ? theme.colors.primary : theme.colors.surface)};
  color: ${({ $variant, theme }) => ($variant === 'primary' ? 'white' : theme.colors.text)};
`;

const StatValue = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: ${props => props.theme.spacing.sm};
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const StatIcon = styled.div`
  font-size: 2rem;
  margin-bottom: ${props => props.theme.spacing.sm};
  opacity: 0.8;
`;

const TabsContainer = styled.div`
  display: flex;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  margin-bottom: ${props => props.theme.spacing.lg};
`;

const Tab = styled.button`
  padding: ${props => props.theme.spacing.md} ${props => props.theme.spacing.lg};
  border: none;
  background: none;
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.textSecondary)};
  font-weight: ${({ $active }) => ($active ? '600' : '500')};
  cursor: pointer;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};

  &:hover {
    color: ${props => props.theme.colors.primary};
  }
`;

const TabContent = styled.div`
  display: ${({ $active }) => ($active ? 'block' : 'none')};
`;

const TableContainer = styled.div`
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.lg};
  overflow: hidden;
  box-shadow: ${props => props.theme.shadows.sm};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHeader = styled.thead`
  background: ${props => props.theme.colors.background};
`;

const TableHeaderCell = styled.th`
  padding: ${props => props.theme.spacing.md};
  text-align: left;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  border-bottom: 1px solid ${props => props.theme.colors.border};
  transition: background-color 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.background};
  }
`;

const TableCell = styled.td`
  padding: ${props => props.theme.spacing.md};
  color: ${props => props.theme.colors.text};
`;

const UserAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${props => props.theme.colors.accent};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 0.875rem;
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const UserDetails = styled.div`
  display: flex;
  flex-direction: column;
`;

const UserName = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.text};
`;

const UserEmail = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.xs};
`;

const ActionButton = styled(Button)`
  padding: ${props => props.theme.spacing.xs};
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const SearchContainer = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  margin-bottom: ${props => props.theme.spacing.lg};
  align-items: center;
`;

const FilterContainer = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  align-items: center;
`;

const RestrictedMessage = styled.div`
  padding: 3rem 2rem;
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  text-align: center;

  h3 {
    margin-bottom: 0.5rem;
    color: ${props => props.theme.colors.text};
  }

  p {
    color: ${props => props.theme.colors.textSecondary};
  }
`;

const RecordingSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.lg};
`;

const RecordingStats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${props => props.theme.spacing.md};
`;

const RecordingTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.sm};
  overflow: hidden;
`;

const RecordingTableHeader = styled.thead`
  background: ${props => props.theme.colors.background};

  th {
    text-align: left;
    padding: ${props => props.theme.spacing.md};
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${props => props.theme.colors.textSecondary};
  }
`;

const RecordingTableBody = styled.tbody`
  td {
    padding: ${props => props.theme.spacing.md};
    border-top: 1px solid ${props => props.theme.colors.border};
  }

  tr:hover {
    background: ${props => props.theme.colors.background};
  }
`;

const RecordingName = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  strong {
    display: block;
    color: ${props => props.theme.colors.text};
  }
  small {
    color: ${props => props.theme.colors.textSecondary};
  }
`;

const RecordingActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.xs};
  flex-wrap: wrap;
`;

const LoadingRow = styled.div`
  text-align: center;
  padding: ${props => props.theme.spacing.lg};
  color: ${props => props.theme.colors.textSecondary};
`;

const EmptyState = styled.div`
  padding: ${props => props.theme.spacing.lg};
  text-align: center;
  color: ${props => props.theme.colors.textSecondary};
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
  align-items: center;
`;

const Admin = () => {
  const [activeTab, setActiveTab] = useState('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  const { user: currentUser } = useAuthStore();
  const isAdmin = currentUser?.role === 'admin';
  const queryClient = useQueryClient();

  // Fetch users
  const { data: users, isLoading: usersLoading } = useQuery(
    ['users', searchTerm, filterRole],
    async () => {
      const response = await api.get('/api/auth/users');
      return response.data;
    },
    {
      enabled: isAdmin
    }
  );

  // Fetch groups
  const { data: groups, isLoading: groupsLoading } = useQuery(
    'groups',
    async () => {
      const response = await api.get('/api/groups');
      return response.data;
    },
    {
      enabled: isAdmin
    }
  );

  const { data: recordingsData, isLoading: recordingsLoading } = useQuery(
    'recordings',
    async () => {
      const response = await api.get('/api/recordings/completed');
      return response.data;
    },
    {
      enabled: isAdmin
    }
  );

  const { data: recordingsStorage, isLoading: recordingsStorageLoading } = useQuery(
    'recordingsStorage',
    async () => {
      const response = await api.get('/api/recordings/storage-usage');
      return response.data;
    },
    {
      enabled: isAdmin
    }
  );

  // Fetch recordings - DISABLED (endpoint doesn't exist)
  const { data: recordings, isLoading: recordingsLoading } = useQuery(
    'recordings',
    async () => {
      return { recordings: [], total: 0 };
    },
    { enabled: false } // Disable this query
  );

  // Calculate stats from actual data
  const stats = {
    totalUsers: users?.users?.length || 0,
    activeUsers: users?.users?.filter(user => user.isActive).length || 0,
    totalGroups: groups?.groups?.length || 0,
    totalRecordings: 0, // Placeholder
    activeServers: 1 // Placeholder
  };

  // Create user mutation
  const createUserMutation = useMutation(
    async (userData) => {
      const response = await api.post('/api/auth/register', userData);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('users');
        toast.success('User created successfully');
        setShowUserModal(false);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create user');
      }
    }
  );

  // Update user mutation
  const updateUserMutation = useMutation(
    async ({ userId, userData }) => {
      const response = await api.put(`/api/admin/users/${userId}`, userData);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('users');
        toast.success('User updated successfully');
        setShowUserModal(false);
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to update user');
      }
    }
  );

  // Delete user mutation
  const deleteUserMutation = useMutation(
    async (userId) => {
      const response = await api.delete(`/api/admin/users/${userId}`);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('users');
        toast.success('User deleted successfully');
        setShowDeleteModal(false);
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to delete user');
      }
    }
  );

  const handleCreateUser = () => {
    setSelectedUser(null);
    setShowUserModal(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setShowUserModal(true);
  };

  const handleDeleteUser = (user) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    if (selectedUser) {
      deleteUserMutation.mutate(selectedUser.id);
    }
  };

  const handleUserSubmit = (userData) => {
    if (selectedUser) {
      updateUserMutation.mutate({ userId: selectedUser.id, userData });
    } else {
      createUserMutation.mutate(userData);
    }
  };

const tabs = [
  { id: 'users', label: 'Users', icon: FiUsers },
  { id: 'groups', label: 'Groups', icon: FiUsers },
  { id: 'directContacts', label: 'Direct Contacts', icon: FiPhoneCall },
  { id: 'messages', label: 'Messages', icon: FiMail },
  { id: 'chatRooms', label: 'Chat Rooms', icon: FiMessageSquare },
  { id: 'recordings', label: 'Recordings', icon: FiActivity },
  { id: 'compliance', label: 'Compliance', icon: FiShield },
  { id: 'privateWires', label: 'Private Wires', icon: FiLink },
  { id: 'telephone', label: 'Telephone', icon: FiPhone },
  { id: 'system', label: 'System', icon: FiServer },
];

  if (!isAdmin) {
    return (
      <AdminContainer>
        <RestrictedMessage>
          <h3>Admin access required</h3>
          <p>Please sign in with an administrator account to manage users and groups.</p>
        </RestrictedMessage>
      </AdminContainer>
    );
  }


  return (
    <AdminContainer>
      <AdminHeader>
        <AdminTitle>
          <FiShield />
          TradePulse Admin Portal
        </AdminTitle>
        <AdminActions>
          <Button variant="secondary" onClick={() => window.print()}>
            <FiDownload />
            Export
          </Button>
          <Button variant="primary" onClick={handleCreateUser}>
            <FiUserPlus />
            Add User
          </Button>
        </AdminActions>
      </AdminHeader>

      {/* Stats Grid */}
      <StatsGrid columns={4}>
        <StatCard $variant="primary">
          <StatIcon>
            <FiUsers />
          </StatIcon>
          <StatValue>{stats?.totalUsers || 0}</StatValue>
          <StatLabel>Total Users</StatLabel>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiUsers />
          </StatIcon>
          <StatValue>{stats.activeUsers}</StatValue>
          <StatLabel>Active Users</StatLabel>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiUsers />
          </StatIcon>
          <StatValue>{stats.totalGroups}</StatValue>
          <StatLabel>Groups</StatLabel>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiServer />
          </StatIcon>
          <StatValue>{stats?.activeServers || 0}</StatValue>
          <StatLabel>Active Servers</StatLabel>
        </StatCard>
      </StatsGrid>

      {/* Tabs */}
      <TabsContainer>
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            $active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon />
            {tab.label}
          </Tab>
        ))}
      </TabsContainer>

      {/* Tab Content */}
      <TabContent $active={activeTab === 'users'}>
        <UserManagement />
      </TabContent>

      <TabContent $active={activeTab === 'groups'}>
        <GroupsManagement groups={groups?.groups || []} isLoading={groupsLoading} />
      </TabContent>

      <TabContent $active={activeTab === 'directContacts'}>
        <AdminDirectContacts />
      </TabContent>

      <TabContent $active={activeTab === 'messages'}>
        <MatrixMessagesPanel />
      </TabContent>

      <TabContent $active={activeTab === 'recordings'}>
        <RecordingsPanel
          recordings={recordingsData?.recordings || []}
          isLoading={recordingsLoading}
          storageUsage={recordingsStorage}
          storageLoading={recordingsStorageLoading}
        />
      </TabContent>

      <TabContent $active={activeTab === 'compliance'}>
        <ComplianceDashboard />
      </TabContent>

      <TabContent $active={activeTab === 'chatRooms'}>
        <ChatRoomsPanel />
      </TabContent>

      <TabContent $active={activeTab === 'privateWires'}>
        <AdminPrivateWires />
      </TabContent>

      <TabContent $active={activeTab === 'telephone'}>
        <AdminTelephone />
      </TabContent>

      <TabContent $active={activeTab === 'system'}>
        <AdminSystemSettings />
      </TabContent>

      {/* User Modal */}
      {showUserModal && (
        <UserModal
          user={selectedUser}
          onSubmit={handleUserSubmit}
          onClose={() => setShowUserModal(false)}
          isLoading={createUserMutation.isLoading || updateUserMutation.isLoading}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <DeleteModal
          user={selectedUser}
          onConfirm={handleConfirmDelete}
          onClose={() => setShowDeleteModal(false)}
          isLoading={deleteUserMutation.isLoading}
        />
      )}
    </AdminContainer>
  );
};

// User Modal Component
const UserModal = ({ user, onSubmit, onClose, isLoading }) => {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    name: user?.name || '',
    role: user?.role || 'trader',
    isActive: user?.isActive ?? true,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <Modal>
      <ModalContent>
        <ModalHeader>
          <h3>{user ? 'Edit User' : 'Create User'}</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiXCircle />
          </Button>
        </ModalHeader>
        <ModalBody>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label>Username</label>
                <Input
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                />
              </div>
              <div>
                <label>Email</label>
                <Input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div>
                <label>Full Name</label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div>
                <label>Role</label>
                <Select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                >
                  <option value="trader">Trader</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="compliance">Compliance</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  name="isActive"
                  checked={formData.isActive}
                  onChange={handleChange}
                />
                <label>Active</label>
              </div>
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? <LoadingSpinner size="16px" /> : null}
            {user ? 'Update User' : 'Create User'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// Delete Modal Component
const DeleteModal = ({ user, onConfirm, onClose, isLoading }) => {
  return (
    <Modal>
      <ModalContent>
        <ModalHeader>
          <h3>Delete User</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiXCircle />
          </Button>
        </ModalHeader>
        <ModalBody>
          <p>Are you sure you want to delete user <strong>{user?.name}</strong>?</p>
          <p style={{ color: '#ff4444', fontSize: '0.875rem' }}>
            This action cannot be undone.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            variant="danger" 
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? <LoadingSpinner size="16px" /> : null}
            Delete User
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const RecordingsPanel = ({ recordings, isLoading, storageUsage, storageLoading }) => {
  const totalDuration = recordings.reduce((sum, rec) => sum + (rec.duration || 0), 0);
  const totalHours = (totalDuration / (1000 * 60 * 60)).toFixed(1);

  return (
    <RecordingSection>
      <RecordingStats>
        <StatCard>
          <StatIcon><FiActivity /></StatIcon>
          <StatValue>{recordings.length}</StatValue>
          <StatLabel>Total Recordings</StatLabel>
        </StatCard>
        <StatCard>
          <StatIcon><FiClock /></StatIcon>
          <StatValue>{totalHours}</StatValue>
          <StatLabel>Total Hours</StatLabel>
        </StatCard>
        <StatCard>
          <StatIcon><FiServer /></StatIcon>
          <StatValue>{storageUsage?.used || '0 GB'}</StatValue>
          <StatLabel>Storage Used</StatLabel>
          {storageLoading && <StatSubtext>Refreshing...</StatSubtext>}
        </StatCard>
        <StatCard>
          <StatIcon><FiCloudOff /></StatIcon>
          <StatValue>{storageUsage?.remaining || 'N/A'}</StatValue>
          <StatLabel>Remaining Storage</StatLabel>
        </StatCard>
      </RecordingStats>

      <RecordingTable>
        <RecordingTableHeader>
          <tr>
            <th>Recording</th>
            <th>Group</th>
            <th>Duration</th>
            <th>Started</th>
            <th>Participants</th>
            <th>Actions</th>
          </tr>
        </RecordingTableHeader>
        <RecordingTableBody>
          {isLoading && (
            <tr>
              <td colSpan="6">
                <LoadingRow>Loading recordings...</LoadingRow>
              </td>
            </tr>
          )}
          {!isLoading && recordings.length === 0 && (
            <tr>
              <td colSpan="6">
                <EmptyState>
                  <FiArchive size={32} />
                  <p>No recordings available yet.</p>
                </EmptyState>
              </td>
            </tr>
          )}
          {!isLoading && recordings.map((recording) => (
            <tr key={recording.id}>
              <td>
                <RecordingName>
                  <FiPlay />
                  <div>
                    <strong>{recording.id}</strong>
                    <small>{recording.metadata?.format?.toUpperCase()}</small>
                  </div>
                </RecordingName>
              </td>
              <td>{recording.groupId || 'N/A'}</td>
              <td>{formatDuration(recording.duration)}</td>
              <td>{formatDistanceToNow(new Date(recording.startTime), { addSuffix: true })}</td>
              <td>{recording.participants?.length || 0}</td>
              <td>
                <RecordingActions>
                  <Button
                    variant="secondary"
                    size="sm"
                    as="a"
                    href={`/api/recordings/download/${recording.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`/api/recordings/metadata/${recording.id}`, '_blank')}
                  >
                    Metadata
                  </Button>
                </RecordingActions>
              </td>
            </tr>
          ))}
        </RecordingTableBody>
      </RecordingTable>
    </RecordingSection>
  );
};

// Groups Management Component
const GroupsManagement = ({ groups, isLoading }) => {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const queryClient = useQueryClient();

  // Fetch users for the join modal
  const { data: users } = useQuery(
    'users-for-groups',
    async () => {
      const response = await api.get('/api/auth/users');
      return response.data;
    }
  );

  // Join group mutation
  const joinGroupMutation = useMutation(
    async ({ groupId, userId, userData }) => {
      const response = await api.post(`/api/groups/${groupId}/join`, {
        userId,
        userData
      });
      return response.data;
    },
    {
      onSuccess: () => {
        toast.success('User added to group successfully!');
        queryClient.invalidateQueries('groups');
        setShowJoinModal(false);
        setSelectedGroup(null);
        setSelectedUser(null);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to add user to group');
      }
    }
  );

  const handleJoinGroup = (group) => {
    setSelectedGroup(group);
    setShowJoinModal(true);
  };

  const handleConfirmJoin = () => {
    if (selectedGroup && selectedUser) {
      joinGroupMutation.mutate({
        groupId: selectedGroup.id,
        userId: selectedUser.id,
        userData: {
          username: selectedUser.username,
          firstName: selectedUser.firstName,
          lastName: selectedUser.lastName
        }
      });
    }
  };

  if (isLoading) {
    return (
      <Flex justify="center" align="center" style={{ height: '400px' }}>
        <LoadingSpinner size="48px" />
      </Flex>
    );
  }

  return (
    <div>
      <GroupsList>
        {groups.length > 0 ? (
          groups.map((group) => (
            <GroupCard key={group.id}>
              <GroupHeader>
                <GroupName>
                  <FiUsers />
                  {group.name}
                </GroupName>
                <GroupStatus $variant={group.isActive ? 'success' : 'warning'}>
                  {group.isActive ? 'Active' : 'Inactive'}
                </GroupStatus>
              </GroupHeader>

              <GroupInfo>
                <GroupDetail>
                  <GroupDetailIcon>
                    <FiUser />
                  </GroupDetailIcon>
                  <span>{group.participants?.length || 0} participants</span>
                </GroupDetail>
                
                <GroupDetail>
                  <GroupDetailIcon>
                    <FiActivity />
                  </GroupDetailIcon>
                  <span>Type: {group.type}</span>
                </GroupDetail>
                
                <GroupDetail>
                  <GroupDetailIcon>
                    <FiClock />
                  </GroupDetailIcon>
                  <span>Created {formatDistanceToNow(new Date(group.createdAt))} ago</span>
                </GroupDetail>
              </GroupInfo>

              <GroupActions>
                <Button 
                  variant="primary" 
                  size="sm"
                  onClick={() => handleJoinGroup(group)}
                >
                  <FiUserPlus />
                  Add User
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => {
                    // TODO: Implement view group details
                    toast('View group details - coming soon!', { icon: 'ℹ️' });
                  }}
                >
                  <FiEdit />
                  Manage
                </Button>
              </GroupActions>
            </GroupCard>
          ))
        ) : (
          <EmptyState>
            <EmptyIcon>
              <FiUsers />
            </EmptyIcon>
            <EmptyText>No groups found</EmptyText>
            <EmptySubtext>Groups will appear here when created</EmptySubtext>
          </EmptyState>
        )}
      </GroupsList>

      {/* Join Group Modal */}
      {showJoinModal && (
        <Modal>
          <ModalContent>
            <ModalHeader>
              <h3>Add User to Group</h3>
              <Button variant="secondary" onClick={() => setShowJoinModal(false)}>
                <FiXCircle />
              </Button>
            </ModalHeader>
            <ModalBody>
              <div style={{ marginBottom: '1rem' }}>
                <strong>Group:</strong> {selectedGroup?.name}
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label>Select User:</label>
                <Select
                  value={selectedUser?.id || ''}
                  onChange={(e) => {
                    const userId = e.target.value;
                    const user = users?.users?.find(u => u.id === userId);
                    setSelectedUser(user);
                  }}
                >
                  <option value="">Choose a user...</option>
                  {users?.users?.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username} ({user.firstName} {user.lastName})
                    </option>
                  ))}
                </Select>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button 
                variant="secondary" 
                onClick={() => setShowJoinModal(false)}
              >
                Cancel
              </Button>
              <Button 
                variant="primary" 
                onClick={handleConfirmJoin}
                disabled={!selectedUser || joinGroupMutation.isLoading}
              >
                {joinGroupMutation.isLoading ? <LoadingSpinner size="16px" /> : null}
                Add User to Group
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </div>
  );
};

// Additional styled components for GroupsManagement
const GroupsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.md};
`;

const GroupCard = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
  transition: all 0.2s ease;
  border: 1px solid ${props => props.theme.colors.border};

  &:hover {
    box-shadow: ${props => props.theme.shadows.md};
    transform: translateY(-2px);
  }
`;

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.md};
`;

const GroupName = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const GroupStatus = styled(Badge)`
  font-size: 0.75rem;
`;

const GroupInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
`;

const GroupDetail = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const GroupDetailIcon = styled.div`
  font-size: 1rem;
  color: ${props => props.theme.colors.accent};
`;

const GroupActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  margin-top: ${props => props.theme.spacing.md};
  padding-top: ${props => props.theme.spacing.md};
  border-top: 1px solid ${props => props.theme.colors.border};
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${props => props.theme.spacing.xl};
  color: ${props => props.theme.colors.textSecondary};
  text-align: center;
`;

const EmptyIcon = styled.div`
  font-size: 3rem;
  margin-bottom: ${props => props.theme.spacing.md};
  opacity: 0.5;
`;

const EmptyText = styled.div`
  font-size: 0.875rem;
  margin-bottom: ${props => props.theme.spacing.sm};
`;

const EmptySubtext = styled.div`
  font-size: 0.75rem;
  opacity: 0.7;
`;

// Chat Rooms Panel Component
const ChatRoomsPanel = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createChatType, setCreateChatType] = useState('direct');
  const [createChatName, setCreateChatName] = useState('');
  const [createChatMembers, setCreateChatMembers] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const queryClient = useQueryClient();

  const { data: usersData } = useQuery(
    'users-for-admin-chat',
    async () => {
      const response = await api.get('/api/auth/users');
      return response.data?.users || [];
    }
  );

  const { data: chatRooms, refetch: refetchChatRooms } = useQuery(
    'admin-chat-rooms',
    async () => {
      const response = await api.get('/api/matrix/chat/rooms?includeArchived=true');
      return response.data?.rooms || [];
    }
  );

  const createChatMutation = useMutation(
    async (chatData) => {
      const response = await api.post('/api/matrix/chat/create', chatData);
      return response.data;
    },
    {
      onSuccess: () => {
        toast.success('Chat room created successfully');
        setShowCreateModal(false);
        setCreateChatName('');
        setCreateChatMembers([]);
        setUserSearchQuery('');
        refetchChatRooms();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create chat room');
      }
    }
  );

  const handleCreateChat = () => {
    if (createChatType === 'direct' && createChatMembers.length !== 1) {
      toast.error('Please select exactly one user for a direct chat');
      return;
    }
    if (createChatType === 'group' && (!createChatName.trim() || createChatMembers.length === 0)) {
      toast.error('Please enter a name and select at least one member for the group chat');
      return;
    }

    createChatMutation.mutate({
      name: createChatType === 'direct' 
        ? `${createChatMembers[0].displayName || createChatMembers[0].username} & ${createChatMembers[0].displayName || createChatMembers[0].username}`
        : createChatName.trim(),
      type: createChatType,
      members: createChatMembers.map(m => m.id || m.userId)
    });
  };

  const toggleMember = (userToToggle) => {
    if (createChatType === 'direct') {
      setCreateChatMembers([userToToggle]);
    } else {
      const isSelected = createChatMembers.some(m => (m.id || m.userId) === (userToToggle.id || userToToggle.userId));
      if (isSelected) {
        setCreateChatMembers(createChatMembers.filter(m => (m.id || m.userId) !== (userToToggle.id || userToToggle.userId)));
      } else {
        setCreateChatMembers([...createChatMembers, userToToggle]);
      }
    }
  };

  const archiveRoomMutation = useMutation(
    async (roomId) => {
      const response = await api.post(`/api/matrix/chat/${roomId}/archive`);
      return response.data;
    },
    {
      onSuccess: () => {
        toast.success('Room archived successfully');
        refetchChatRooms();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to archive room');
      }
    }
  );

  const unarchiveRoomMutation = useMutation(
    async (roomId) => {
      const response = await api.post(`/api/matrix/chat/${roomId}/unarchive`);
      return response.data;
    },
    {
      onSuccess: () => {
        toast.success('Room unarchived successfully');
        refetchChatRooms();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to unarchive room');
      }
    }
  );

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Chat Rooms Management</h2>
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          <FiPlus style={{ marginRight: '0.5rem' }} />
          Create Chat Room
        </Button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Name</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Type</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Members</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Last Activity</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {chatRooms?.map(room => (
              <tr key={room.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '0.75rem' }}>{room.name}</td>
                <td style={{ padding: '0.75rem' }}>
                  <Badge $variant={room.type === 'direct' ? 'primary' : 'secondary'}>
                    {room.type === 'direct' ? '1:1' : 'Group'}
                  </Badge>
                </td>
                <td style={{ padding: '0.75rem' }}>{room.members?.length || 0}</td>
                <td style={{ padding: '0.75rem', color: '#6b7280' }}>
                  {room.lastActivity ? formatDistanceToNow(new Date(room.lastActivity), { addSuffix: true }) : 'Never'}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  <Badge $variant={room.isArchived ? 'secondary' : 'success'}>
                    {room.isArchived ? 'Archived' : 'Active'}
                  </Badge>
                </td>
                <td style={{ padding: '0.75rem' }}>
                  {room.isArchived ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => unarchiveRoomMutation.mutate(room.roomId)}
                      disabled={unarchiveRoomMutation.isLoading}
                    >
                      Unarchive
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => archiveRoomMutation.mutate(room.roomId)}
                      disabled={archiveRoomMutation.isLoading}
                    >
                      <FiArchive style={{ marginRight: '0.25rem' }} />
                      Archive
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!chatRooms || chatRooms.length === 0) && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
            No chat rooms found
          </div>
        )}
      </div>

      {/* Create Chat Modal */}
      {showCreateModal && (
        <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
          <ModalContent>
            <ModalHeader>
              <h2>Create New Chat Room</h2>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <FiX />
              </button>
            </ModalHeader>
            <ModalBody>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <button
                  onClick={() => {
                    setCreateChatType('direct');
                    setCreateChatMembers([]);
                    setCreateChatName('');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: createChatType === 'direct' ? '#3b82f6' : '#f3f4f6',
                    color: createChatType === 'direct' ? 'white' : '#1f2937',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <FiUser style={{ marginRight: '0.5rem' }} />
                  1:1 Chat
                </button>
                <button
                  onClick={() => {
                    setCreateChatType('group');
                    setCreateChatMembers([]);
                    setCreateChatName('');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: createChatType === 'group' ? '#3b82f6' : '#f3f4f6',
                    color: createChatType === 'group' ? 'white' : '#1f2937',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <FiUsers style={{ marginRight: '0.5rem' }} />
                  Group Chat
                </button>
              </div>

              {createChatType === 'group' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Group Name</label>
                  <Input
                    type="text"
                    placeholder="Enter group name..."
                    value={createChatName}
                    onChange={(e) => setCreateChatName(e.target.value)}
                  />
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  {createChatType === 'direct' ? 'Select User' : 'Select Members'}
                </label>
                <Input
                  type="text"
                  placeholder="Search users..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  style={{ marginBottom: '0.75rem' }}
                />
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem' }}>
                  {usersData
                    ?.filter(user => {
                      const query = userSearchQuery.toLowerCase();
                      const name = (user.displayName || user.username || '').toLowerCase();
                      const email = (user.email || '').toLowerCase();
                      return name.includes(query) || email.includes(query);
                    })
                    .map(user => {
                      const isSelected = createChatMembers.some(m => (m.id || m.userId) === (user.id || user.userId));
                      return (
                        <div
                          key={user.id || user.userId}
                          onClick={() => toggleMember(user)}
                          style={{
                            padding: '0.75rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            background: isSelected ? '#3b82f620' : 'transparent',
                            border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                            marginBottom: '0.5rem'
                          }}
                        >
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                            {(user.displayName || user.username || 'U')[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500 }}>{user.displayName || user.username || 'Unknown'}</div>
                            {user.email && <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{user.email}</div>}
                          </div>
                          {isSelected && <FiCheckCircle style={{ color: '#10b981' }} />}
                        </div>
                      );
                    })}
                </div>
              </div>

              {createChatMembers.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Selected {createChatType === 'direct' ? 'User' : 'Members'}</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {createChatMembers.map(member => (
                      <div
                        key={member.id || member.userId}
                        style={{
                          padding: '0.375rem 0.75rem',
                          background: '#3b82f6',
                          color: 'white',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        {member.displayName || member.username || 'Unknown'}
                        <button
                          onClick={() => {
                            setCreateChatMembers(createChatMembers.filter(m => (m.id || m.userId) !== (member.id || member.userId)));
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: 0 }}
                        >
                          <FiX size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateChat}
                disabled={
                  createChatMutation.isLoading ||
                  (createChatType === 'direct' && createChatMembers.length !== 1) ||
                  (createChatType === 'group' && (!createChatName.trim() || createChatMembers.length === 0))
                }
              >
                {createChatMutation.isLoading ? 'Creating...' : 'Create Chat'}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </Card>
  );
};

// System Settings Panel Component
const SystemSettingsPanel = () => {
  const [settings, setSettings] = useState({
    roomArchive: {
      enabled: false,
      inactiveDays: 90
    }
  });

  const { data: systemSettings } = useQuery(
    'system-settings',
    async () => {
      const response = await api.get('/api/system/settings');
      return response.data?.settings || { roomArchive: { enabled: false, inactiveDays: 90 } };
    }
  );

  useEffect(() => {
    if (systemSettings) {
      setSettings(systemSettings);
    }
  }, [systemSettings]);

  const updateSettingsMutation = useMutation(
    async (newSettings) => {
      const response = await api.put('/api/system/settings', { settings: newSettings });
      return response.data;
    },
    {
      onSuccess: () => {
        toast.success('System settings updated successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to update system settings');
      }
    }
  );

  const archiveRoomsMutation = useMutation(
    async () => {
      const response = await api.post('/api/system/archive-rooms');
      return response.data;
    },
    {
      onSuccess: (data) => {
        toast.success(`Archived ${data.archived || 0} inactive rooms`);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to archive rooms');
      }
    }
  );

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(settings);
  };

  return (
    <Card>
      <h2 style={{ marginBottom: '1.5rem' }}>System Settings</h2>

      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>Room Archiving</h3>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              type="checkbox"
              checked={settings.roomArchive?.enabled || false}
              onChange={(e) => {
                setSettings(prev => ({
                  ...prev,
                  roomArchive: { ...prev.roomArchive, enabled: e.target.checked }
                }));
              }}
            />
            <span>Enable automatic room archiving</span>
          </label>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginLeft: '1.5rem' }}>
            Automatically archive chat rooms that have been inactive for a specified number of days
          </p>
        </div>

        {settings.roomArchive?.enabled && (
          <div style={{ marginBottom: '1rem', marginLeft: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Archive rooms inactive for (days):
            </label>
            <Input
              type="number"
              min="1"
              value={settings.roomArchive?.inactiveDays || 90}
              onChange={(e) => {
                setSettings(prev => ({
                  ...prev,
                  roomArchive: { ...prev.roomArchive, inactiveDays: parseInt(e.target.value) || 90 }
                }));
              }}
              style={{ width: '200px' }}
            />
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
              Rooms with no activity for this many days will be automatically archived
            </p>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
          <Button variant="primary" onClick={handleSaveSettings} disabled={updateSettingsMutation.isLoading}>
            {updateSettingsMutation.isLoading ? 'Saving...' : 'Save Settings'}
          </Button>
          {settings.roomArchive?.enabled && (
            <Button
              variant="secondary"
              onClick={() => archiveRoomsMutation.mutate()}
              disabled={archiveRoomsMutation.isLoading}
            >
              {archiveRoomsMutation.isLoading ? 'Archiving...' : 'Archive Rooms Now'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

export default Admin;
