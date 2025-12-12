import React, { useState, useMemo } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { 
  FiSearch, 
  FiFilter, 
  FiUser, 
  FiEdit, 
  FiMail, 
  FiPhone, 
  FiShield,
  FiRefreshCw,
  FiX,
  FiCheck,
  FiXCircle,
  FiKey,
  FiEye,
  FiEyeOff
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { theme } from '../../styles/GlobalStyle';
import api from '../../utils/api';
import toast from 'react-hot-toast';

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

const CheckboxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text};
  cursor: pointer;
  
  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: ${props => props.theme.colors.accent};
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
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
  }
  
  ${props => props.$selected && `
    background: rgba(6, 182, 212, 0.1);
    border-left: 3px solid ${props.theme.colors.accent};
  `}
`;

const TableCell = styled.td`
  padding: 1rem;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text};
`;

const UserAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${props => props.theme.colors.gradient};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: ${props => props.theme.borderRadius.sm};
  font-size: 0.75rem;
  font-weight: 500;
  background: ${props => {
    if (props.$variant === 'admin') return 'rgba(6, 182, 212, 0.2)';
    if (props.$variant === 'active') return 'rgba(16, 185, 129, 0.2)';
    if (props.$variant === 'inactive') return 'rgba(107, 114, 128, 0.2)';
    return 'rgba(107, 114, 128, 0.2)';
  }};
  color: ${props => {
    if (props.$variant === 'admin') return props.theme.colors.accent;
    if (props.$variant === 'active') return props.theme.colors.success;
    if (props.$variant === 'inactive') return props.theme.colors.textTertiary;
    return props.theme.colors.text;
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

const ActionButtonGroup = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const ActionButton = styled.button`
  padding: 0.5rem;
  background: ${props => props.$warning ? 'rgba(245, 158, 11, 0.1)' : props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.$warning ? 'rgba(245, 158, 11, 0.3)' : props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.$warning ? '#f59e0b' : props.theme.colors.text};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-size: 0.875rem;
  
  &:hover {
    background: ${props => props.$warning ? 'rgba(245, 158, 11, 0.2)' : props.theme.colors.surface};
    border-color: ${props => props.$warning ? '#f59e0b' : props.theme.colors.accent};
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

const EditUserModal = ({ user, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    username: user.username || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    role: user.role || 'user',
    isActive: user.isActive !== undefined ? user.isActive : true,
    extension: user.extension || '',
    sipUri: user.sipUri || '',
    employeeId: user.employeeId || '',
    department: user.department || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Edit User</ModalTitle>
          <ModalCloseButton onClick={onClose}>
            <FiX />
          </ModalCloseButton>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <FormGroup>
              <FormLabel>Username *</FormLabel>
              <FormInput
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </FormGroup>
            <FormGroup>
              <FormLabel>First Name *</FormLabel>
              <FormInput
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
              />
            </FormGroup>
            <FormGroup>
              <FormLabel>Last Name *</FormLabel>
              <FormInput
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
              />
            </FormGroup>
            <FormGroup>
              <FormLabel>Email *</FormLabel>
              <FormInput
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </FormGroup>
            <FormGroup>
              <FormLabel>Role</FormLabel>
              <FormSelect
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </FormSelect>
            </FormGroup>
            <FormGroup>
              <FormLabel>Extension</FormLabel>
              <FormInput
                value={formData.extension}
                onChange={(e) => setFormData({ ...formData, extension: e.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <FormLabel>SIP URI</FormLabel>
              <FormInput
                value={formData.sipUri}
                onChange={(e) => setFormData({ ...formData, sipUri: e.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <FormLabel>Employee ID</FormLabel>
              <FormInput
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <FormLabel>Department</FormLabel>
              <FormInput
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <span style={{ color: theme.colors.text }}>Active User</span>
              </label>
            </FormGroup>
          </ModalBody>
          <ModalFooter>
            <ModalButton type="button" onClick={onClose}>
              Cancel
            </ModalButton>
            <ModalButton $primary type="submit">
              <FiEdit />
              Update User
            </ModalButton>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

// Reset Password Modal Component
const ResetPasswordModal = ({ user, onClose, onReset }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [useTemporaryPassword, setUseTemporaryPassword] = useState(false); // Default to manual password
  const [showPassword, setShowPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');

  const generateTemporaryPassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setGeneratedPassword(password);
    setNewPassword(password);
    setConfirmPassword(password);
  };

  React.useEffect(() => {
    if (useTemporaryPassword && !generatedPassword) {
      generateTemporaryPassword();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useTemporaryPassword]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!useTemporaryPassword) {
      if (!newPassword || newPassword.length < 6) {
        toast.error('Password must be at least 6 characters long');
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    }

    onReset(useTemporaryPassword ? generatedPassword : newPassword, useTemporaryPassword);
  };

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Reset Password</ModalTitle>
          <ModalCloseButton onClick={onClose}>
            <FiX />
          </ModalCloseButton>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div style={{ marginBottom: '1rem', padding: '1rem', background: theme.colors.surfaceElevated, borderRadius: theme.borderRadius.md }}>
              <p style={{ margin: 0, color: theme.colors.text, fontSize: '0.875rem' }}>
                Resetting password for: <strong>{user.username}</strong> ({user.displayName || user.name || 'N/A'})
              </p>
            </div>

            <FormGroup>
              <FormLabel>Password Type</FormLabel>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="passwordType"
                    checked={!useTemporaryPassword}
                    onChange={() => {
                      setUseTemporaryPassword(false);
                      setNewPassword('');
                      setConfirmPassword('');
                      setGeneratedPassword('');
                    }}
                  />
                  <span style={{ color: theme.colors.text }}>Manual Password</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="passwordType"
                    checked={useTemporaryPassword}
                    onChange={() => {
                      setUseTemporaryPassword(true);
                      if (!generatedPassword) {
                        generateTemporaryPassword();
                      }
                    }}
                  />
                  <span style={{ color: theme.colors.text }}>Generate Temporary Password</span>
                </label>
              </div>
            </FormGroup>

            {useTemporaryPassword ? (
              <FormGroup>
                <FormLabel>Generated Temporary Password</FormLabel>
                <div style={{ position: 'relative' }}>
                  <FormInput
                    type={showPassword ? 'text' : 'password'}
                    value={generatedPassword}
                    readOnly
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: theme.colors.textSecondary,
                      cursor: 'pointer',
                      padding: '0.25rem'
                    }}
                  >
                    {showPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={generateTemporaryPassword}
                    style={{
                      padding: '0.5rem 1rem',
                      background: theme.colors.surfaceElevated,
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: theme.borderRadius.md,
                      color: theme.colors.text,
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    <FiRefreshCw style={{ marginRight: '0.25rem' }} />
                    Generate New
                  </button>
                </div>
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.5rem' }}>
                  This password will be shown in a success message after reset. User should change it on first login.
                </div>
              </FormGroup>
            ) : (
              <>
                <FormGroup>
                  <FormLabel>New Password *</FormLabel>
                  <FormInput
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    minLength={6}
                  />
                  <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                    Minimum 6 characters
                  </div>
                </FormGroup>
                <FormGroup>
                  <FormLabel>Confirm Password *</FormLabel>
                  <FormInput
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    minLength={6}
                  />
                </FormGroup>
                <FormGroup>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(e) => setShowPassword(e.target.checked)}
                    />
                    <span style={{ color: theme.colors.text }}>Show password</span>
                  </label>
                </FormGroup>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <ModalButton type="button" onClick={onClose}>
              Cancel
            </ModalButton>
            <ModalButton $primary type="submit">
              <FiKey />
              Reset Password
            </ModalButton>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const AdminUserManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resettingUser, setResettingUser] = useState(null);
  const queryClient = useQueryClient();

  // Fetch users
  const { data: users = [], isLoading } = useQuery(
    'admin-users',
    async () => {
      const response = await api.get('/api/auth/users');
      const usersData = response.data?.users || response.data || [];
      return usersData.map(user => ({
        ...user,
        id: user.id || user.userId,
        userId: user.userId || user.id
      }));
    },
    {
      retry: 2,
      onError: (error) => {
        if (error.response?.status !== 401 && error.response?.status !== 403) {
          toast.error('Failed to load users');
        }
      }
    }
  );

  // Filter users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = !searchTerm || 
        (user.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.displayName || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesRole = filterRole === 'all' || user.role === filterRole;
      const matchesStatus = filterStatus === 'all' || 
        (filterStatus === 'active' && user.isActive !== false) ||
        (filterStatus === 'inactive' && user.isActive === false);
      const matchesSource = filterSource === 'all' || user.source === filterSource;
      
      return matchesSearch && matchesRole && matchesStatus && matchesSource;
    });
  }, [users, searchTerm, filterRole, filterStatus, filterSource]);

  const handleDoubleClick = (user) => {
    setEditingUser(user);
    setShowEditModal(true);
  };

  const handleCloseEdit = () => {
    setShowEditModal(false);
    setEditingUser(null);
    queryClient.invalidateQueries('admin-users');
  };

  const handleResetPassword = (user) => {
    setResettingUser(user);
    setShowResetPasswordModal(true);
  };

  const handleCloseResetPassword = () => {
    setShowResetPasswordModal(false);
    setResettingUser(null);
  };

  // Reset password mutation
  const resetPasswordMutation = useMutation(
    async ({ userId, newPassword, temporaryPassword }) => {
      const res = await api.post(`/api/auth/users/${userId}/reset-password`, {
        newPassword,
        temporaryPassword
      });
      return res.data;
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('admin-users');
        setShowResetPasswordModal(false);
        setResettingUser(null);
        if (data.temporaryPassword) {
          toast.success(`Password reset successfully. Temporary password: ${data.temporaryPassword}`, { duration: 10000 });
        } else {
          toast.success('Password reset successfully');
        }
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to reset password');
      }
    }
  );

  const clearFilters = () => {
    setSearchTerm('');
    setFilterRole('all');
    setFilterStatus('all');
    setFilterSource('all');
  };

  return (
    <ThemeProvider theme={theme}>
      <Container>
        <FilterPanel>
          <FilterSection>
            <FilterTitle>Search</FilterTitle>
            <SearchInput
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </FilterSection>

          <FilterSection>
            <FilterTitle>Role</FilterTitle>
            <Select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </Select>
          </FilterSection>

          <FilterSection>
            <FilterTitle>Status</FilterTitle>
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </FilterSection>

          <FilterSection>
            <FilterTitle>Source</FilterTitle>
            <Select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
              <option value="all">All Sources</option>
              <option value="local">Local</option>
              <option value="ad">Active Directory</option>
            </Select>
          </FilterSection>

          <ClearButton onClick={clearFilters}>
            Clear Filters
          </ClearButton>
        </FilterPanel>

        <MainContent>
          <TableHeader>
            <TableTitle>Users ({filteredUsers.length})</TableTitle>
          </TableHeader>
          
          <TableContainer>
            {isLoading ? (
              <EmptyState>Loading users...</EmptyState>
            ) : filteredUsers.length === 0 ? (
              <EmptyState>No users found</EmptyState>
            ) : (
              <Table>
                <TableHead>
                  <TableHeaderRow>
                    <TableHeaderCell>User</TableHeaderCell>
                    <TableHeaderCell>Email</TableHeaderCell>
                    <TableHeaderCell>Role</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Source</TableHeaderCell>
                    <TableHeaderCell>Extension</TableHeaderCell>
                    <TableHeaderCell>Actions</TableHeaderCell>
                  </TableHeaderRow>
                </TableHead>
                <TableBody>
                  {filteredUsers.map(user => (
                    <TableRow
                      key={user.id || user.userId}
                      onDoubleClick={() => handleDoubleClick(user)}
                    >
                      <TableCell>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <UserAvatar>
                            {(user.username?.[0] || user.name?.[0] || user.displayName?.[0] || 'U').toUpperCase()}
                          </UserAvatar>
                          <div>
                            <div style={{ fontWeight: 500 }}>
                              {user.displayName || user.name || user.username || 'Unknown'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: theme.colors.textTertiary }}>
                              @{user.username || 'N/A'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{user.email || '—'}</TableCell>
                      <TableCell>
                        <Badge $variant={user.role === 'admin' ? 'admin' : 'default'}>
                          {user.role || 'user'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge $variant={user.isActive !== false ? 'active' : 'inactive'}>
                          {user.isActive !== false ? (
                            <>
                              <FiCheck style={{ marginRight: '0.25rem' }} />
                              Active
                            </>
                          ) : (
                            <>
                              <FiXCircle style={{ marginRight: '0.25rem' }} />
                              Inactive
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.source || 'local'}</TableCell>
                      <TableCell>{user.extension || '—'}</TableCell>
                      <TableCell>
                        <ActionButtonGroup>
                          <ActionButton onClick={() => handleDoubleClick(user)} title="Edit User">
                            <FiEdit />
                          </ActionButton>
                          {user.source === 'local' && (
                            <ActionButton 
                              onClick={() => handleResetPassword(user)} 
                              title="Reset Password"
                              $warning
                            >
                              <FiKey />
                            </ActionButton>
                          )}
                        </ActionButtonGroup>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableContainer>
        </MainContent>

        {showEditModal && editingUser && (
          <EditUserModal
            user={editingUser}
            onClose={handleCloseEdit}
            onSave={async (userData) => {
              try {
                await api.put(`/api/auth/users/${editingUser.id || editingUser.userId}`, userData);
                toast.success('User updated successfully');
                handleCloseEdit();
              } catch (error) {
                toast.error('Failed to update user');
              }
            }}
          />
        )}

        {showResetPasswordModal && resettingUser && (
          <ResetPasswordModal
            user={resettingUser}
            onClose={handleCloseResetPassword}
            onReset={(newPassword, temporaryPassword) => {
              resetPasswordMutation.mutate({
                userId: resettingUser.id || resettingUser.userId,
                newPassword,
                temporaryPassword
              });
            }}
          />
        )}
      </Container>
    </ThemeProvider>
  );
};

export default AdminUserManagement;

