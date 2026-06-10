import React, { useState, useEffect } from 'react';
import styled, { useTheme } from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../utils/api';
import { 
  FiUsers, 
  FiUser, 
  FiUserPlus, 
  FiUserX, 
  FiEdit, 
  FiGrid,
  FiSearch,
  FiFilter,
  FiRefreshCw,
  FiShield,
  FiMail,
  FiPhone,
  FiMapPin,
  FiClock,
  FiCheck,
  FiX,
  FiMoreVertical,
  FiKey,
  FiDatabase,
  FiGlobe,
  FiRadio
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useAuthStore } from '../../stores/authStore';
import { useSocket } from '../../hooks/useSocket';

import { getUserClientAccess } from '../../utils/clientAccess';
import UserButtonLayout from '../UserButtonLayout/UserButtonLayout';
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
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';

const UserManagementContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.lg};
  height: 100%;
`;

const UserManagementHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.lg};
`;

const UserManagementTitle = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const UserManagementActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
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

const UsersGrid = styled(Grid)`
  flex: 1;
  gap: ${props => props.theme.spacing.md};
`;

const UserCard = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
  transition: all 0.2s ease;
  cursor: pointer;
  border: 1px solid ${props => props.theme.colors.border};

  &:hover {
    box-shadow: ${props => props.theme.shadows.md};
    transform: translateY(-2px);
  }
`;

const UsersTableCard = styled(Card)`
  padding: ${props => props.theme.spacing.md};
  overflow: auto;
`;

const UsersTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const UsersTh = styled.th`
  text-align: left;
  padding: ${props => props.theme.spacing.sm};
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${props => props.theme.colors.textSecondary};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  white-space: nowrap;
`;

const UsersTr = styled.tr.withConfig({
  shouldForwardProp: (prop) => prop !== '$selected'
})`
  cursor: pointer;
  background: ${props => props.$selected ? props.theme.colors.surfaceElevated : 'transparent'};

  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
  }
`;

const UsersTd = styled.td`
  padding: ${props => props.theme.spacing.sm};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  vertical-align: middle;
`;

const Muted = styled.div`
  color: ${props => props.theme.colors.textSecondary};
  font-size: 0.8rem;
`;

const UserHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.md};
`;

const UserAvatar = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: ${props => props.theme.colors.accent};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.25rem;
  margin-right: ${props => props.theme.spacing.md};
`;

const UserInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const UserName = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0 0 ${props => props.theme.spacing.xs} 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UserEmail = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: ${props => props.theme.spacing.xs};
`;

const UserRole = styled(Badge)`
  font-size: 0.75rem;
`;

const UserStatus = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  margin-bottom: ${props => props.theme.spacing.md};
`;

const UserDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
  margin-bottom: ${props => props.theme.spacing.md};
`;

const UserDetail = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const UserDetailIcon = styled.div`
  font-size: 1rem;
  color: ${props => props.theme.colors.accent};
`;

const UserActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  position: relative;
`;

const UserActionButton = styled(Button)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.theme.spacing.xs};
  font-size: 0.875rem;
`;

const UserActionIcon = styled(Button)`
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
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

const UserManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showUserActions, setShowUserActions] = useState(null);
  const [showButtonLayout, setShowButtonLayout] = useState(false);
  const [buttonLayoutAccess, setButtonLayoutAccess] = useState(null);
  
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const { socket } = useSocket();

  // Fetch locations (for assigning users)
  const { data: locations } = useQuery(
    'locations',
    async () => {
      const resp = await api.get('/api/locations');
      return resp.data?.locations || [];
    },
    {
      retry: 1,
    }
  );

  // Listen to presence-update events to update user status in real-time
  useEffect(() => {
    if (!socket) return;

    const handlePresenceUpdate = (data) => {
      console.log('Received presence-update:', data);
      queryClient.setQueryData(['users', searchTerm, filterRole, filterSource], (oldData) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        
        return oldData.map(user => {
          if (user.id === data.userId || user.username === data.username || user.userId === data.userId) {
            return {
              ...user,
              status: data.online ? 'online' : 'offline',
              isOnline: data.online === true
            };
          }
          return user;
        });
      });
      
      // Also invalidate the query to refetch if needed
      queryClient.invalidateQueries(['users']);
    };

    socket.on('presence-update', handlePresenceUpdate);
    
    return () => {
      socket.off('presence-update', handlePresenceUpdate);
    };
  }, [socket, queryClient, searchTerm, filterRole, filterSource]);

  // Fetch users
  const { data: users, isLoading: usersLoading, error: usersError, refetch: refetchUsers } = useQuery(
    ['users', searchTerm, filterRole, filterSource],
    async () => {
      try {
        const response = await api.get('/api/auth/users');
        console.log('Users API response:', response.data);
        // Handle both response formats
        const usersData = response.data?.users || response.data || [];
        console.log('Parsed users:', usersData);
        
        // Normalize user objects - ensure both id and userId are present
        const normalizedUsers = Array.isArray(usersData) ? usersData.map(user => ({
          ...user,
          id: user.id || user.userId, // Ensure id exists
          userId: user.userId || user.id // Ensure userId exists
        })) : [];
        
        console.log('Normalized users:', normalizedUsers);
        return normalizedUsers;
      } catch (error) {
        console.error('Error fetching users:', error);
        console.error('Error response:', error.response);
        console.error('Error status:', error.response?.status);
        console.error('Error details:', error.response?.data);
        
        // Show specific error messages
        if (error.response?.status === 403) {
          toast.error('Admin access required to view users. Please log in as an administrator.', {
            duration: 5000,
            icon: '🔒'
          });
        } else if (error.response?.status === 401) {
          toast.error('Authentication required. Please log in again.', {
            duration: 5000,
            icon: '🔐'
          });
        } else if (error.response?.status !== 401 && error.response?.status !== 403) {
          toast.error(error.response?.data?.error || error.message || 'Failed to load users');
        }
        return [];
      }
    },
    {
      retry: 2,
      retryDelay: 1000
    }
  );

  // Fetch AD status
  const { data: adStatus } = useQuery(
    'ad-status',
    async () => {
      const response = await api.get('/api/auth/ad/status');
      return response.data.status;
    }
  );

  // Fetch AD users
  const { data: adUsers } = useQuery(
    'ad-users',
    async () => {
      const response = await api.get('/api/auth/ad/users');
      return response.data.users;
    }
  );

  // Fetch AD groups
  const { data: adGroups } = useQuery(
    'ad-groups',
    async () => {
      const response = await api.get('/api/auth/ad/groups');
      return response.data.groups;
    }
  );

  // Sync users from AD
  const syncUsersMutation = useMutation(
    async () => {
      const response = await api.post('/api/auth/ad/sync/users');
      return response.data;
    },
    {
      onSuccess: (data) => {
        toast.success(data.message);
        queryClient.invalidateQueries('users');
        queryClient.invalidateQueries('ad-users');
      },
      onError: (error) => {
        toast.error('Failed to sync users from AD');
      }
    }
  );

  // Sync groups from AD
  const syncGroupsMutation = useMutation(
    async () => {
      const response = await api.post('/api/auth/ad/sync/groups');
      return response.data;
    },
    {
      onSuccess: (data) => {
        toast.success(data.message);
        queryClient.invalidateQueries('ad-groups');
      },
      onError: (error) => {
        toast.error('Failed to sync groups from AD');
      }
    }
  );

  // Create user mutation
  const createUserMutation = useMutation(
    async (userData) => {
      try {
        const response = await api.post('/api/auth/register', userData);
        return response.data;
      } catch (error) {
        console.error('Error creating user:', error);
        throw error;
      }
    },
    {
      onSuccess: (data) => {
        toast.success('User created successfully');
        queryClient.invalidateQueries(['users']);
        queryClient.refetchQueries(['users']);
        setShowAddUser(false);
      },
      onError: (error) => {
        console.error('User creation failed:', error);
        toast.error(error.response?.data?.error || 'Failed to create user');
      }
    }
  );

  // Update user mutation
  const updateUserMutation = useMutation(
    async ({ userId, userData }) => {
      try {
        const response = await api.put(`/api/auth/users/${userId}`, userData);
        return response.data;
      } catch (error) {
        console.error('Error updating user:', error);
        throw error;
      }
    },
    {
      onSuccess: (data) => {
        toast.success('User updated successfully');
        queryClient.invalidateQueries(['users']);
        queryClient.refetchQueries(['users']);
        setShowEditUser(false);
        setEditingUser(null);
      },
      onError: (error) => {
        console.error('User update failed:', error);
        toast.error(error.response?.data?.error || 'Failed to update user');
      }
    }
  );

  // Delete user mutation
  const deleteUserMutation = useMutation(
    async (userId) => {
      try {
        const response = await api.delete(`/api/auth/users/${userId}`);
        return response.data;
      } catch (error) {
        console.error('Error deleting user:', error);
        throw error;
      }
    },
    {
      onSuccess: (data) => {
        toast.success('User deleted successfully');
        queryClient.invalidateQueries(['users']);
        queryClient.refetchQueries(['users']);
      },
      onError: (error) => {
        console.error('User deletion failed:', error);
        toast.error(error.response?.data?.error || 'Failed to delete user');
      }
    }
  );

  const handleSyncUsers = () => {
    syncUsersMutation.mutate();
  };

  const handleSyncGroups = () => {
    syncGroupsMutation.mutate();
  };

  const handleRefresh = async () => {
    await refetchUsers();
    await queryClient.invalidateQueries('ad-status');
    await queryClient.invalidateQueries('ad-users');
    await queryClient.invalidateQueries('ad-groups');
    toast.success('User data refreshed');
  };

  const handleUserClick = (user) => {
    setEditingUser(user);
    setShowEditUser(true);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setShowEditUser(true);
  };

  const handleDeleteUser = (user) => {
    if (window.confirm(`Are you sure you want to delete user "${user.username}"? This action cannot be undone.`)) {
      deleteUserMutation.mutate(user.id);
    }
  };

  const handleToggleUserStatus = (user) => {
    const newStatus = !user.isActive;
    const action = newStatus ? 'enable' : 'disable';
    
    if (window.confirm(`Are you sure you want to ${action} user "${user.username}"?`)) {
      updateUserMutation.mutate({
        userId: user.id,
        userData: {
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isActive: newStatus
        }
      });
    }
  };

  const handleToggleUserActions = (userId) => {
    setShowUserActions(showUserActions === userId ? null : userId);
  };

  const filteredUsers = React.useMemo(() => {
    if (!users || !Array.isArray(users)) {
      console.log('Users is not an array:', users);
      return [];
    }
    
    return users.filter(user => {
      if (!user) return false;
      
      const matchesRole = filterRole === 'all' || user.role === filterRole;
      const matchesSource = filterSource === 'all' || 
        (filterSource === 'local' && (user.source === 'local' || !user.source)) ||
        (filterSource === 'active_directory' && user.source === 'active_directory');
      const matchesStatus = filterStatus === 'all' || 
        (filterStatus === 'active' && user.isActive) || 
        (filterStatus === 'inactive' && !user.isActive);
      const matchesSearch = !searchTerm || 
        (user.username && user.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.firstName && user.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.lastName && user.lastName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.displayName && user.displayName.toLowerCase().includes(searchTerm.toLowerCase()));
      
      return matchesRole && matchesSource && matchesStatus && matchesSearch;
    });
  }, [users, filterRole, filterSource, filterStatus, searchTerm]);

  // Check if user is admin
  const isAdmin =
    currentUser?.role === 'platform_admin' ||
    currentUser?.role === 'tenant_admin' ||
    currentUser?.role === 'admin';

  if (usersLoading) {
    return (
      <UserManagementContainer>
        <Flex justify="center" align="center" style={{ height: '400px' }}>
          <LoadingSpinner size="48px" />
        </Flex>
      </UserManagementContainer>
    );
  }

  // Show access denied message if not admin
  if (!isAdmin) {
    return (
      <UserManagementContainer>
        <Card style={{ padding: '3rem', textAlign: 'center' }}>
          <FiShield style={{ fontSize: '3rem', color: '#ef4444', marginBottom: '1rem' }} />
          <h2 style={{ marginBottom: '0.5rem', color: '#ef4444' }}>Access Denied</h2>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            You need administrator privileges to view and manage users.
          </p>
          <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
            Current role: <strong>{currentUser?.role || 'user'}</strong>
          </p>
        </Card>
      </UserManagementContainer>
    );
  }

  return (
    <UserManagementContainer>
      <UserManagementHeader>
        <UserManagementTitle>
          <FiUsers />
          User Management
        </UserManagementTitle>
        <UserManagementActions>
          <Button variant="secondary" onClick={handleRefresh}>
            <FiRefreshCw />
            Refresh
          </Button>
          <Button variant="primary" onClick={() => setShowAddUser(true)}>
            <FiUserPlus />
            Add User
          </Button>
        </UserManagementActions>
      </UserManagementHeader>

      {/* AD Status */}
      {adStatus?.isConnected && (
        <Card style={{ padding: '1rem', marginBottom: '1rem', background: '#e8f5e8' }}>
          <Flex align="center" gap="0.5rem">
            <FiDatabase style={{ color: '#28a745' }} />
            <span style={{ fontWeight: '600', color: '#28a745' }}>
              Active Directory Connected
            </span>
            <Spacer />
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleSyncUsers}
              disabled={syncUsersMutation.isLoading}
            >
              <FiRefreshCw className={syncUsersMutation.isLoading ? 'animate-spin' : ''} />
              Sync Users
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleSyncGroups}
              disabled={syncGroupsMutation.isLoading}
            >
              <FiRefreshCw className={syncGroupsMutation.isLoading ? 'animate-spin' : ''} />
              Sync Groups
            </Button>
            <Button 
              variant="primary" 
              size="sm" 
              onClick={handleRefresh}
            >
              <FiRefreshCw />
              Refresh Users
            </Button>
          </Flex>
        </Card>
      )}

      <SearchContainer>
        <Input
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1 }}
        />
        <FilterContainer>
          <Select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="trader">Trader</option>
            <option value="user">User</option>
          </Select>
          <Select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
          >
            <option value="all">All Sources</option>
            <option value="local">Local</option>
            <option value="active_directory">Active Directory</option>
          </Select>
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </FilterContainer>
      </SearchContainer>

      {usersError && (
        <Card style={{ padding: '1rem', marginBottom: '1rem', background: '#fee', border: '1px solid #fcc' }}>
          <div style={{ color: '#c33' }}>
            <strong>Error loading users:</strong> {usersError.response?.data?.error || usersError.message}
          </div>
        </Card>
      )}
      
      {!usersLoading && (!users || users.length === 0) && (
        <Card style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No users found</div>
          <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {users === undefined ? 'Users data not loaded' : 'No users are configured in the system'}
          </div>
        </Card>
      )}

      <UsersTableCard>
        {filteredUsers.length > 0 ? (
          <UsersTable>
            <thead>
              <tr>
                <UsersTh>User</UsersTh>
                <UsersTh>Role</UsersTh>
                <UsersTh>Status</UsersTh>
                <UsersTh>Source</UsersTh>
                <UsersTh>Clients</UsersTh>
                <UsersTh>Actions</UsersTh>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const id = user.id || user.userId;
                const displayName = user.displayName || user.name || user.username || 'Unknown User';
                const isOnline = user.status === 'online' || user.isOnline;
                const { intercomEnabled, dealerboardEnabled } = getUserClientAccess(user);

                return (
                  <UsersTr
                    key={id}
                    $selected={editingUser?.id === id}
                    onClick={() => handleUserClick(user)}
                  >
                    <UsersTd>
                      <div style={{ fontWeight: 600 }}>{displayName}</div>
                      <Muted>{user.email || user.username || id}</Muted>
                    </UsersTd>
                    <UsersTd>
                      <Badge variant={user.role === 'admin' ? 'error' : user.role === 'trader' ? 'warning' : 'info'}>
                        {user.role || 'user'}
                      </Badge>
                    </UsersTd>
                    <UsersTd>
                      <Flex align="center" gap="0.5rem">
                        <Badge variant={user.isActive !== false ? 'success' : 'secondary'}>
                          {user.isActive !== false ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant={isOnline ? 'success' : 'secondary'} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FiRadio style={{ fontSize: '12px' }} />
                          {isOnline ? 'Online' : 'Offline'}
                        </Badge>
                      </Flex>
                    </UsersTd>
                    <UsersTd>
                      <Badge variant="secondary">
                        {user.source === 'active_directory' ? 'AD' : 'Local'}
                      </Badge>
                    </UsersTd>
                    <UsersTd>
                      <Flex align="center" gap="0.5rem" wrap>
                        {intercomEnabled && <Badge variant="info">Intercom</Badge>}
                        {dealerboardEnabled && <Badge variant="info">Dealerboard</Badge>}
                        {!intercomEnabled && !dealerboardEnabled && (
                          <Muted style={{ fontSize: '0.85rem' }}>None</Muted>
                        )}
                      </Flex>
                    </UsersTd>
                    <UsersTd>
                      <Flex align="center" gap="0.5rem" style={{ position: 'relative' }}>
                        <Button
                          variant="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditUser(user);
                          }}
                        >
                          <FiEdit />
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleUserActions(id);
                          }}
                        >
                          <FiMoreVertical />
                        </Button>

                        {showUserActions === id && (
                          <UserActionsDropdown
                            user={user}
                            onEdit={handleEditUser}
                            onDelete={handleDeleteUser}
                            onToggleStatus={handleToggleUserStatus}
                            onClose={() => setShowUserActions(null)}
                          />
                        )}
                      </Flex>
                    </UsersTd>
                  </UsersTr>
                );
              })}
            </tbody>
          </UsersTable>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No users found</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
              Try adjusting your search criteria
            </div>
          </div>
        )}
      </UsersTableCard>

      {/* Add User Modal */}
      {showAddUser && (
        <AddUserModal
          onSubmit={(userData) => {
            // Handle user creation
            console.log('Add user:', userData);
            createUserMutation.mutate(userData);
          }}
          onClose={() => setShowAddUser(false)}
        />
      )}

      {/* Edit User Modal */}
      {showEditUser && editingUser && (
        <EditUserModal
          user={editingUser}
          locations={locations || []}
          onSubmit={(userData) => {
            updateUserMutation.mutate({
              userId: editingUser.id,
              userData
            });
          }}
          onOpenButtonLayout={(access) => {
            setButtonLayoutAccess(access);
            setShowEditUser(false);
            setShowUserActions(null);
            setShowButtonLayout(true);
          }}
          onClose={() => {
            setShowEditUser(false);
            setEditingUser(null);
          }}
        />
      )}

      {/* Button Layout Modal */}
      {showButtonLayout && editingUser && (() => {
        const access = buttonLayoutAccess || getUserClientAccess(editingUser);
        return (
        <Modal>
          <ModalContent style={{ width: '95vw', maxWidth: '920px', height: '88vh' }}>
            <ModalHeader>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FiGrid />
                Button Layout: {editingUser.displayName || editingUser.name || editingUser.username}
              </h2>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowButtonLayout(false);
                  setButtonLayoutAccess(null);
                }}
                type="button"
              >
                <FiX />
              </Button>
            </ModalHeader>
            <ModalBody style={{ height: '100%', minHeight: 0 }}>
              <div style={{ height: '100%', minHeight: 0 }}>
                <UserButtonLayout
                  key={`${editingUser.userId || editingUser.id}-${access.intercomEnabled}-${access.dealerboardEnabled}`}
                  userId={editingUser.userId || editingUser.id}
                  intercomEnabled={access.intercomEnabled}
                  dealerboardEnabled={access.dealerboardEnabled}
                  onSave={() => {
                    setShowButtonLayout(false);
                    setButtonLayoutAccess(null);
                    queryClient.invalidateQueries(['users']);
                  }}
                  onCancel={() => {
                    setShowButtonLayout(false);
                    setButtonLayoutAccess(null);
                  }}
                />
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
        );
      })()}
    </UserManagementContainer>
  );
};

// User Details Modal Component
const UserDetailsModal = ({ user, onClose, onEdit }) => {
  const [userGroups, setUserGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    if (user.source === 'active_directory') {
      setLoadingGroups(true);
      api.get(`/api/auth/users/${user.username}/groups`)
        .then(response => {
          setUserGroups(response.data.groups);
        })
        .catch(error => {
          console.error('Failed to load user groups:', error);
        })
        .finally(() => {
          setLoadingGroups(false);
        });
    }
  }, [user]);

  return (
    <Modal>
      <ModalContent>
        <ModalHeader>
          <h3>User Details</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
          </Button>
        </ModalHeader>
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#007bff',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                fontWeight: '600'
              }}>
                {user.firstName?.charAt(0) || user.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.25rem' }}>{user.displayName || user.username}</h4>
                <p style={{ margin: 0, color: '#666' }}>{user.email}</p>
                <Badge variant={user.role === 'admin' ? 'error' : user.role === 'trader' ? 'warning' : 'info'}>
                  {user.role}
                </Badge>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>First Name</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {user.firstName || 'N/A'}
                </div>
              </div>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Last Name</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {user.lastName || 'N/A'}
                </div>
              </div>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Title</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {user.title || 'N/A'}
                </div>
              </div>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Department</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {user.department || 'N/A'}
                </div>
              </div>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Phone</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {user.phone || 'N/A'}
                </div>
              </div>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Source</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {user.source === 'active_directory' ? 'Active Directory' : 'Local'}
                </div>
              </div>
            </div>

            {user.source === 'active_directory' && (
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>AD Groups</label>
                {loadingGroups ? (
                  <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <LoadingSpinner size="24px" />
                  </div>
                ) : userGroups.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {userGroups.map((group, index) => (
                      <Badge key={index} variant="info">
                        {group.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px', color: '#666' }}>
                    No groups found
                  </div>
                )}
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => {
            onEdit(user);
          }}>
            <FiEdit />
            Edit User
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// Add User Modal Component
const AddUserModal = ({ onSubmit, onClose }) => {
  const theme = useTheme();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    companyName: '',
    country: '',
    role: 'user',
    source: 'local',
    intercomEnabled: true,
    dealerboardEnabled: false
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
          <h3>Add New User</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label>First Name</label>
                  <Input
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label>Last Name</label>
                  <Input
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                  />
                </div>
              </div>
              <div>
                <label>Password</label>
                <Input
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
              </div>

              <div>
                <label>Location</label>
                <Input
                  value="Tenantless"
                  disabled
                />
              </div>

              <div>
                <label>Company</label>
                <Input
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label>Country</label>
                <Input
                  name="country"
                  value={formData.country}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label>Role</label>
                <Select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                >
                  <option value="user">User</option>
                  <option value="trader">Trader</option>
                  <option value="tenant_admin">Tenant Admin</option>
                  <option value="platform_admin">Platform Admin</option>
                </Select>
              </div>
              
              <div style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: `1px solid ${theme.colors.border}` }}>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.75rem' }}>
                  Client Types
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      name="intercomEnabled"
                      checked={formData.intercomEnabled}
                      onChange={handleChange}
                    />
                    <label style={{ fontWeight: '500' }}>
                      Intercom Client
                    </label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      name="dealerboardEnabled"
                      checked={formData.dealerboardEnabled}
                      onChange={handleChange}
                    />
                    <label style={{ fontWeight: '500' }}>
                      Dealerboard Client
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Add User
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// User Actions Dropdown Component
const UserActionsDropdown = ({ user, onEdit, onDelete, onToggleStatus, onClose }) => {
  const theme = useTheme();
  return (
    <div style={{
      position: 'absolute',
      top: '100%',
      right: 0,
      backgroundColor: theme.colors.surfaceElevated,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: '8px',
      boxShadow: theme.shadows.md,
      zIndex: 1000,
      minWidth: '160px',
      padding: '0.5rem 0'
    }}>
      <button
        style={{
          width: '100%',
          padding: '0.5rem 1rem',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.875rem',
          color: theme.colors.text
        }}
        onClick={() => {
          onEdit(user);
          onClose();
        }}
      >
        <FiEdit />
        Edit User
      </button>
      
      <button
        style={{
          width: '100%',
          padding: '0.5rem 1rem',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.875rem',
          color: user.isActive ? theme.colors.warning : theme.colors.success
        }}
        onClick={() => {
          onToggleStatus(user);
          onClose();
        }}
      >
        {user.isActive ? <FiUserX /> : <FiUser />}
        {user.isActive ? 'Disable User' : 'Enable User'}
      </button>
      
      <button
        style={{
          width: '100%',
          padding: '0.5rem 1rem',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.875rem',
          color: theme.colors.error
        }}
        onClick={() => {
          onDelete(user);
          onClose();
        }}
      >
        <FiUserX />
        Delete User
      </button>
    </div>
  );
};

// Edit User Modal Component
const EditUserModal = ({ user, locations, onSubmit, onOpenButtonLayout, onClose }) => {
  const theme = useTheme();
  const { intercomEnabled, dealerboardEnabled } = getUserClientAccess(user);
  
  const [formData, setFormData] = useState({
    username: user.username || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    role: user.role || 'user',
    isActive: user.isActive !== undefined ? user.isActive : true,
    locationId: user.locationId || '',
    intercomEnabled: intercomEnabled,
    dealerboardEnabled: dealerboardEnabled
  });

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    if (e?.preventDefault) e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Modal>
      <ModalContent>
        <ModalHeader>
          <h2>Edit User</h2>
        </ModalHeader>
        <ModalBody>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>
                  Username *
                </label>
                <Input
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>
                  First Name *
                </label>
                <Input
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>
                  Last Name *
                </label>
                <Input
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>
                  Email *
                </label>
                <Input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>
                  Role
                </label>
                <Select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                >
                  <option value="user">User</option>
                  <option value="trader">Trader</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>

              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>
                  Location
                </label>
                <Select
                  name="locationId"
                  value={formData.locationId}
                  onChange={handleInputChange}
                >
                  <option value="">Unassigned</option>
                  {(locations || []).map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </Select>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  name="isActive"
                  checked={formData.isActive}
                  onChange={handleInputChange}
                />
                <label style={{ fontWeight: '600' }}>
                  Active User
                </label>
              </div>
              
              <div style={{ 
                marginTop: '1.5rem', 
                paddingTop: '1.5rem', 
                borderTop: `2px solid ${theme.colors.border}`,
                backgroundColor: theme.colors.surfaceElevated,
                padding: '1.5rem',
                borderRadius: '8px'
              }}>
                <label style={{ 
                  fontWeight: '600', 
                  display: 'block', 
                  marginBottom: '1rem',
                  fontSize: '1rem',
                  color: theme.colors.text
                }}>
                  Client Types
                </label>
                <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: theme.colors.textSecondary }}>
                  Check the client(s) this user may sign in with. Only checked clients are assigned.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    backgroundColor: theme.colors.surface
                  }}>
                    <input
                      type="checkbox"
                      id="intercomEnabled"
                      name="intercomEnabled"
                      checked={formData.intercomEnabled}
                      onChange={handleInputChange}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer'
                      }}
                    />
                    <label 
                      htmlFor="intercomEnabled"
                      style={{ 
                        fontWeight: '500',
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        color: theme.colors.text
                      }}
                    >
                      Intercom Client
                    </label>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    backgroundColor: theme.colors.surface
                  }}>
                    <input
                      type="checkbox"
                      id="dealerboardEnabled"
                      name="dealerboardEnabled"
                      checked={formData.dealerboardEnabled}
                      onChange={handleInputChange}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer'
                      }}
                    />
                    <label 
                      htmlFor="dealerboardEnabled"
                      style={{ 
                        fontWeight: '500',
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        color: theme.colors.text
                      }}
                    >
                      Dealerboard Client
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => onOpenButtonLayout?.({
              intercomEnabled: formData.intercomEnabled,
              dealerboardEnabled: formData.dealerboardEnabled,
            })}
            disabled={!formData.intercomEnabled && !formData.dealerboardEnabled}
            title={!formData.intercomEnabled && !formData.dealerboardEnabled ? 'Enable Intercom and/or Dealerboard to configure buttons' : 'Configure button layout'}
          >
            <FiGrid />
            Configure Buttons
          </Button>
          <Button variant="primary" type="button" onClick={handleSubmit}>
            <FiEdit />
            Update User
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default UserManagement;
