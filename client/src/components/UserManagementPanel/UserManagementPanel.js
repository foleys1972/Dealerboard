import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
  FiUserPlus, 
  FiEdit2, 
  FiTrash2, 
  FiSearch,
  FiX,
  FiSave,
  FiShield,
  FiUser,
  FiPhone,
  FiMail,
  FiHash,
  FiKey
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';

const UserManagementPanel = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user: authUser } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [recordPrefs, setRecordPrefs] = useState({}); // { userId: boolean }

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    role: 'user',
    extension: '',
    sipUri: '',
    employeeId: '',
    department: '',
    allowFileSharing: false,
    allowMessageAccess: true
  });

  // Load users from API
  useEffect(() => {
    if (authUser?.role === 'admin' || authUser?.role === 'platform_admin') {
      loadUsers();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.role]);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/auth/users');
      if (response.data.success) {
        const loaded = response.data.users;
        setUsers(loaded);
        // Initialize recording preferences (default: true)
        setRecordPrefs(prev => {
          const next = { ...prev };
          loaded.forEach(u => {
            if (next[u.userId] === undefined) {
              next[u.userId] = true;
            }
          });
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      (user.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (user.username?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (user.extension || '').includes(searchQuery) ||
      (user.employeeId?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && user.isActive) ||
      (filterStatus === 'inactive' && !user.isActive);
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  // Handle add user
  const handleAddUser = async () => {
    if (!formData.username || !formData.password || !formData.name || !formData.email) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const response = await api.post('/api/auth/register', {
        username: formData.username,
        password: formData.password,
        firstName: formData.name.split(' ')[0],
        lastName: formData.name.split(' ').slice(1).join(' ') || formData.name,
        email: formData.email,
        role: formData.role || 'user',
        extension: formData.extension || null,
        sipUri: formData.sipUri || null,
        employeeId: formData.employeeId || null,
        department: formData.department || null
      });

      if (response.data.success) {
        toast.success(`User ${formData.name} created successfully`);
        setShowAddModal(false);
        resetForm();
        loadUsers(); // Reload the list
      }
    } catch (error) {
      console.error('Failed to create user:', error);
      toast.error(error.response?.data?.error || 'Failed to create user');
    }
  };

  // Handle edit user
  const handleEditUser = async () => {
    if (!formData.username || !formData.name || !formData.email) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      // Update user basic info
      const response = await api.put(`/api/auth/users/${selectedUser.userId}`, {
        username: formData.username,
        firstName: formData.name.split(' ')[0],
        lastName: formData.name.split(' ').slice(1).join(' ') || formData.name,
        email: formData.email,
        role: formData.role,
        isActive: formData.isActive !== undefined ? formData.isActive : true,
        extension: formData.extension || null,
        sipUri: formData.sipUri || null,
        employeeId: formData.employeeId || null,
        department: formData.department || null,
        password: formData.password || undefined
      });

      // Update user settings (file sharing and message access)
      try {
        await api.put(`/api/auth/users/${selectedUser.userId}/settings`, {
          settings: {
            allowFileSharing: formData.allowFileSharing || false,
            allowMessageAccess: formData.allowMessageAccess !== false
          }
        });
      } catch (settingsError) {
        console.error('Failed to update user settings:', settingsError);
        // Continue anyway - basic info was updated
      }

      if (response.data.success) {
        toast.success('User updated successfully');
        setShowEditModal(false);
        setSelectedUser(null);
        resetForm();
        loadUsers(); // Reload the list
      }
    } catch (error) {
      console.error('Failed to update user:', error);
      toast.error(error.response?.data?.error || 'Failed to update user');
    }
  };

  // Handle delete user
  const handleDeleteUser = async (userId, userName) => {
    if (window.confirm(`Are you sure you want to delete user: ${userName}?`)) {
      try {
        await api.delete(`/api/auth/users/${userId}`);
        toast.success(`User ${userName} deleted`);
        loadUsers(); // Reload the list
      } catch (error) {
        console.error('Failed to delete user:', error);
        toast.error('Failed to delete user');
      }
    }
  };

  // Open edit modal
  const openEditModal = async (user) => {
    setSelectedUser(user);
    
    // Fetch user settings from server
    let userSettings = { allowFileSharing: false, allowMessageAccess: true };
    try {
      const response = await api.get(`/api/auth/users/${user.userId}`);
      if (response.data?.user?.settings) {
        userSettings = response.data.user.settings;
      }
    } catch (error) {
      console.error('Failed to load user settings:', error);
    }
    
    setFormData({
      username: user.username,
      password: '',
      name: user.name,
      email: user.email,
      role: user.role,
      extension: user.extension || '',
      sipUri: user.sipUri || '',
      employeeId: user.employeeId || '',
      department: user.department || '',
      allowFileSharing: userSettings.allowFileSharing || false,
      allowMessageAccess: userSettings.allowMessageAccess !== false
    });
    setShowEditModal(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      role: 'user',
      extension: '',
      sipUri: '',
      employeeId: '',
      department: ''
    });
  };

  // Get status color
  const getStatusColor = (status) => {
    switch(status) {
      case 'available': return '#10b981';
      case 'busy': return '#f59e0b';
      case 'away': return '#6b7280';
      case 'dnd': return '#ef4444';
      case 'offline': return '#9ca3af';
      default: return '#6b7280';
    }
  };

  if (authUser?.role !== 'admin') {
    return (
      <RestrictedContainer>
        <h3>Admin access required</h3>
        <p>You need administrator permissions to view or manage users.</p>
      </RestrictedContainer>
    );
  }

  return (
    <Container>
      <Header>
        <Title>User Management</Title>
        <Stats>
          <StatItem>
            <StatValue>{users.length}</StatValue>
            <StatLabel>Total Users</StatLabel>
          </StatItem>
          <StatItem>
            <StatValue>{users.filter(u => u.isActive).length}</StatValue>
            <StatLabel>Active</StatLabel>
          </StatItem>
          <StatItem>
            <StatValue>{users.filter(u => u.role === 'admin').length}</StatValue>
            <StatLabel>Admins</StatLabel>
          </StatItem>
        </Stats>
      </Header>

      <Toolbar>
        <SearchBar>
          <FiSearch />
          <SearchInput
            type="text"
            placeholder="Search users by name, username, email, extension, or employee ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <ClearButton onClick={() => setSearchQuery('')}>
              <FiX />
            </ClearButton>
          )}
        </SearchBar>

        <Filters>
          <FilterSelect value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="user">Users</option>
            <option value="admin">Admins</option>
          </FilterSelect>

          <FilterSelect value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </FilterSelect>

          <AddButton onClick={() => setShowAddModal(true)}>
            <FiUserPlus />
            <span>Add User</span>
          </AddButton>
        </Filters>
      </Toolbar>

      <TableContainer>
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Extension</Th>
              <Th>SIP URI</Th>
              <Th>Employee ID</Th>
              <Th>Department</Th>
              <Th>Record</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <Tr key={user.userId}>
                <Td>
                  <UserCell>
                    <UserAvatar>
                      {(user.name || user.username || '??').substring(0, 2).toUpperCase()}
                    </UserAvatar>
                    <UserInfo>
                      <UserName>{user.name || user.username}</UserName>
                      <UserEmail>{user.email}</UserEmail>
                      <UserUsername>@{user.username}</UserUsername>
                    </UserInfo>
                  </UserCell>
                </Td>
                <Td>
                  <RoleBadge role={user.role}>
                    {user.role === 'admin' ? <FiShield /> : <FiUser />}
                    <span>{user.role.toUpperCase()}</span>
                  </RoleBadge>
                </Td>
                <Td>
                  <Code>{user.extension || '-'}</Code>
                </Td>
                <Td>
                  <Code small>{user.sipUri || '-'}</Code>
                </Td>
                <Td>
                  <Code>{user.employeeId || '-'}</Code>
                </Td>
                <Td>{user.department || '-'}</Td>
                <Td>
                  <input
                    type="checkbox"
                    checked={recordPrefs[user.userId] !== false}
                    onChange={(e) => {
                      const value = e.target.checked;
                      setRecordPrefs(prev => ({ ...prev, [user.userId]: value }));
                    }}
                  />
                </Td>
                <Td>
                  <StatusBadge color={getStatusColor(user.status)}>
                    {user.status}
                  </StatusBadge>
                </Td>
                <Td>
                  <Actions>
                    <ActionButton 
                      title="Edit User"
                      onClick={() => openEditModal(user)}
                    >
                      <FiEdit2 />
                    </ActionButton>
                    <ActionButton 
                      title="Delete User"
                      danger
                      onClick={() => handleDeleteUser(user.userId, user.name)}
                      disabled={user.role === 'admin' && users.filter(u => u.role === 'admin').length === 1}
                    >
                      <FiTrash2 />
                    </ActionButton>
                  </Actions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>

        {filteredUsers.length === 0 && (
          <EmptyState>
            <EmptyIcon>🔍</EmptyIcon>
            <EmptyText>No users found</EmptyText>
            <EmptySubtext>Try adjusting your search or filters</EmptySubtext>
          </EmptyState>
        )}
      </TableContainer>

      {/* Add User Modal */}
      {showAddModal && (
        <Modal onClick={() => setShowAddModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>
                <FiUserPlus />
                <span>Add New User</span>
              </ModalTitle>
              <CloseButton onClick={() => setShowAddModal(false)}>
                <FiX />
              </CloseButton>
            </ModalHeader>

            <ModalBody>
              <FormGrid>
                <FormGroup>
                  <Label required>
                    <FiUser />
                    <span>Full Name</span>
                  </Label>
                  <Input
                    type="text"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label required>
                    <FiKey />
                    <span>Username</span>
                  </Label>
                  <Input
                    type="text"
                    placeholder="john.doe"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label required>
                    <FiMail />
                    <span>Email</span>
                  </Label>
                  <Input
                    type="email"
                    placeholder="john.doe@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label required>
                    <FiKey />
                    <span>Password</span>
                  </Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>
                    <FiPhone />
                    <span>Extension</span>
                  </Label>
                  <Input
                    type="text"
                    placeholder="1001"
                    value={formData.extension}
                    onChange={(e) => setFormData({ ...formData, extension: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>
                    <FiHash />
                    <span>Employee ID</span>
                  </Label>
                  <Input
                    type="text"
                    placeholder="EMP12345"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  />
                </FormGroup>

                <FormGroup fullWidth>
                  <Label>
                    <FiPhone />
                    <span>SIP URI</span>
                  </Label>
                  <Input
                    type="text"
                    placeholder="sip:john.doe@trading.company.com"
                    value={formData.sipUri}
                    onChange={(e) => setFormData({ ...formData, sipUri: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>
                    <span>Department</span>
                  </Label>
                  <Input
                    type="text"
                    placeholder="FX Trading"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>
                    <FiShield />
                    <span>Role</span>
                  </Label>
                  <Select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </Select>
                </FormGroup>
              </FormGrid>
            </ModalBody>

            <ModalFooter>
              <CancelButton onClick={() => setShowAddModal(false)}>
                Cancel
              </CancelButton>
              <SaveButton onClick={handleAddUser}>
                <FiSave />
                <span>Create User</span>
              </SaveButton>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {/* Edit User Modal */}
      {showEditModal && (
        <Modal onClick={() => setShowEditModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>
                <FiEdit2 />
                <span>Edit User</span>
              </ModalTitle>
              <CloseButton onClick={() => setShowEditModal(false)}>
                <FiX />
              </CloseButton>
            </ModalHeader>

            <ModalBody>
              <FormGrid>
                <FormGroup>
                  <Label required>
                    <FiUser />
                    <span>Full Name</span>
                  </Label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>
                    <FiKey />
                    <span>Username</span>
                  </Label>
                  <Input
                    type="text"
                    value={formData.username}
                    disabled
                  />
                </FormGroup>

                <FormGroup>
                  <Label required>
                    <FiMail />
                    <span>Email</span>
                  </Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>
                    <FiKey />
                    <span>New Password</span>
                  </Label>
                  <Input
                    type="password"
                    placeholder="Leave blank to keep current"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>
                    <FiPhone />
                    <span>Extension</span>
                  </Label>
                  <Input
                    type="text"
                    value={formData.extension}
                    onChange={(e) => setFormData({ ...formData, extension: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>
                    <FiHash />
                    <span>Employee ID</span>
                  </Label>
                  <Input
                    type="text"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  />
                </FormGroup>

                <FormGroup fullWidth>
                  <Label>
                    <FiPhone />
                    <span>SIP URI</span>
                  </Label>
                  <Input
                    type="text"
                    value={formData.sipUri}
                    onChange={(e) => setFormData({ ...formData, sipUri: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>
                    <span>Department</span>
                  </Label>
                  <Input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>
                    <FiShield />
                    <span>Role</span>
                  </Label>
                  <Select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </Select>
                </FormGroup>

                <FormGroup fullWidth>
                  <Label style={{ marginBottom: '1rem', fontWeight: 600 }}>
                    💬 Messaging & File Sharing Settings
                  </Label>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#1f2937' }}>
                      <input
                        type="checkbox"
                        checked={formData.allowFileSharing || false}
                        onChange={(e) => setFormData({ ...formData, allowFileSharing: e.target.checked })}
                      />
                      <span style={{ fontSize: '0.875rem', color: '#1f2937' }}>
                        Allow File Sharing
                        <span style={{ color: '#ef4444', marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                          ⚠️ Disabled by default for regulatory compliance
                        </span>
                      </span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#1f2937' }}>
                      <input
                        type="checkbox"
                        checked={formData.allowMessageAccess !== false}
                        onChange={(e) => setFormData({ ...formData, allowMessageAccess: e.target.checked })}
                      />
                      <span style={{ fontSize: '0.875rem', color: '#1f2937' }}>
                        Allow Message Access
                      </span>
                    </label>
                  </div>
                </FormGroup>
              </FormGrid>
            </ModalBody>

            <ModalFooter>
              <CancelButton onClick={() => setShowEditModal(false)}>
                Cancel
              </CancelButton>
              <SaveButton onClick={handleEditUser}>
                <FiSave />
                <span>Save Changes</span>
              </SaveButton>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
};

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: 100%;
`;

const RestrictedContainer = styled.div`
  padding: 2rem;
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  text-align: center;

  h3 {
    margin-bottom: 0.5rem;
    font-size: 1.25rem;
    color: #111827;
  }

  p {
    color: #6b7280;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  color: #1f2937;
  font-weight: 700;
  margin: 0;
`;

const Stats = styled.div`
  display: flex;
  gap: 2rem;
`;

const StatItem = styled.div`
  text-align: center;
`;

const StatValue = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  color: #667eea;
`;

const StatLabel = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Toolbar = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const SearchBar = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.75rem 1rem;

  svg {
    color: #9ca3af;
    font-size: 1.25rem;
  }
`;

const SearchInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  font-size: 0.875rem;
  color: #1f2937;

  &::placeholder {
    color: #9ca3af;
  }
`;

const ClearButton = styled.button`
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;

  &:hover {
    color: #6b7280;
  }
`;

const Filters = styled.div`
  display: flex;
  gap: 0.75rem;
`;

const FilterSelect = styled.select`
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #1f2937;
  cursor: pointer;
  outline: none;

  &:focus {
    border-color: #667eea;
  }
`;

const AddButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }

  svg {
    font-size: 1rem;
  }
`;

const TableContainer = styled.div`
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: 1rem;
  background: #f9fafb;
  color: #6b7280;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 2px solid #e5e7eb;
`;

const Tr = styled.tr`
  border-bottom: 1px solid #e5e7eb;
  transition: background 0.2s;

  &:hover {
    background: #f9fafb;
  }
`;

const Td = styled.td`
  padding: 1rem;
  color: #1f2937;
  font-size: 0.875rem;
`;

const UserCell = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const UserAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
`;

const UserInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

const UserName = styled.div`
  font-weight: 500;
  color: #1f2937;
`;

const UserEmail = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
`;

const UserUsername = styled.div`
  font-size: 0.75rem;
  color: #9ca3af;
  font-family: monospace;
`;

const RoleBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${props => props.role === 'admin' ? '#fef3c7' : '#e0e7ff'};
  color: ${props => props.role === 'admin' ? '#92400e' : '#3730a3'};

  svg {
    font-size: 0.875rem;
  }
`;

const Code = styled.code`
  font-family: monospace;
  font-size: ${props => props.small ? '0.75rem' : '0.875rem'};
  color: #6b7280;
  background: #f3f4f6;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  background: ${props => props.color}15;
  color: ${props => props.color};
  text-transform: capitalize;
`;

const Actions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ActionButton = styled.button`
  background: ${props => props.danger ? '#fee2e2' : '#f3f4f6'};
  color: ${props => props.danger ? '#dc2626' : '#6b7280'};
  border: none;
  padding: 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${props => props.danger ? '#fecaca' : '#e5e7eb'};
    color: ${props => props.danger ? '#b91c1c' : '#1f2937'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    font-size: 1rem;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
  margin-bottom: 1rem;
`;

const EmptyText = styled.div`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 0.5rem;
`;

const EmptySubtext = styled.div`
  color: #9ca3af;
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 2px solid #e5e7eb;
`;

const ModalTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0;
  color: #1f2937;
  font-size: 1.25rem;

  svg {
    color: #667eea;
    font-size: 1.5rem;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  border-radius: 6px;
  transition: all 0.2s;

  &:hover {
    background: #f3f4f6;
    color: #1f2937;
  }

  svg {
    font-size: 1.5rem;
  }
`;

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
`;

const FormGroup = styled.div`
  grid-column: ${props => props.fullWidth ? '1 / -1' : 'span 1'};
`;

const Label = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 0.5rem;

  svg {
    color: #667eea;
    font-size: 1rem;
  }

  ${props => props.required && `
    &::after {
      content: '*';
      color: #ef4444;
      margin-left: 0.25rem;
    }
  `}
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #1f2937;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #667eea;
  }

  &:disabled {
    background: #f9fafb;
    color: #9ca3af;
    cursor: not-allowed;
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #1f2937;
  background: white;
  cursor: pointer;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 2px solid #e5e7eb;
`;

const CancelButton = styled.button`
  background: white;
  border: 2px solid #e5e7eb;
  color: #6b7280;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }
`;

const SaveButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }

  svg {
    font-size: 1rem;
  }
`;

export default UserManagementPanel;

