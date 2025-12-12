import React, { useState } from 'react';
import styled from 'styled-components';
import { FiX, FiCheck, FiCopy } from 'react-icons/fi';
import { useMutation, useQueryClient } from 'react-query';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input } from '../../styles/GlobalStyle';

const FormGroup = styled.div`
  margin-bottom: 1rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${props => props.theme.colors.text};
  margin-bottom: 0.5rem;
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

const InfoText = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  margin-top: 0.25rem;
`;

const CopyUserModal = ({ user, onClose }) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    copyAssignments: true,
    copySpeedDials: true
  });

  const queryClient = useQueryClient();

  // Copy user mutation
  const copyUserMutation = useMutation(
    async (data) => {
      // First, get the copy data from the API
      const copyRes = await api.post(`/api/dealerboard/users/${user.id || user.userId}/copy`, {
        username: data.username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        copyAssignments: data.copyAssignments,
        copySpeedDials: data.copySpeedDials
      });

      const { userData, assignments, speedDials } = copyRes.data;

      // Create the new user
      const createRes = await api.post('/api/auth/register', {
        ...userData,
        password: 'TempPassword123!' // Temporary password, user should change on first login
      });

      const newUserId = createRes.data.user?.id || createRes.data.id;

      // Copy assignments if requested
      if (data.copyAssignments && assignments.length > 0) {
        for (const assignment of assignments) {
          try {
            await api.post('/api/dealerboard/assignments', {
              pageNumber: assignment.page_number,
              buttonNumber: assignment.button_number,
              assignmentType: assignment.assignment_type,
              lineId: assignment.line_id,
              ddiLineId: assignment.ddi_line_id,
              speedDialId: assignment.speed_dial_id,
              targetUserId: newUserId
            });
          } catch (error) {
            console.warn('Failed to copy assignment:', error);
          }
        }
      }

      // Copy speed dials if requested
      if (data.copySpeedDials && speedDials.length > 0) {
        for (const speedDial of speedDials) {
          try {
            await api.post('/api/dealerboard/speed-dials', {
              userId: newUserId,
              name: speedDial.name,
              number: speedDial.number,
              description: speedDial.description
            });
          } catch (error) {
            console.warn('Failed to copy speed dial:', error);
          }
        }
      }

      return { newUserId, userData };
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('admin-users');
        toast.success(`User copied successfully! New user ID: ${data.newUserId}. Temporary password: TempPassword123!`, { duration: 10000 });
        onClose();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to copy user');
      }
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.username || !formData.email || !formData.firstName || !formData.lastName) {
      toast.error('Please fill in all required fields');
      return;
    }

    copyUserMutation.mutate(formData);
  };

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3>Copy User: {user.displayName || user.name || user.username}</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
          </Button>
        </ModalHeader>
        <ModalBody>
          <form onSubmit={handleSubmit}>
            <FormGroup>
              <Label>Username *</Label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="Enter unique username"
                required
              />
            </FormGroup>

            <FormGroup>
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@example.com"
                required
              />
            </FormGroup>

            <FormGroup>
              <Label>First Name *</Label>
              <Input
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="First Name"
                required
              />
            </FormGroup>

            <FormGroup>
              <Label>Last Name *</Label>
              <Input
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Last Name"
                required
              />
            </FormGroup>

            <FormGroup>
              <CheckboxLabel>
                <input
                  type="checkbox"
                  checked={formData.copyAssignments}
                  onChange={(e) => setFormData({ ...formData, copyAssignments: e.target.checked })}
                />
                <span>Copy Button Assignments</span>
              </CheckboxLabel>
              <InfoText>Copy all dealerboard button assignments to the new user</InfoText>
            </FormGroup>

            <FormGroup>
              <CheckboxLabel>
                <input
                  type="checkbox"
                  checked={formData.copySpeedDials}
                  onChange={(e) => setFormData({ ...formData, copySpeedDials: e.target.checked })}
                />
                <span>Copy Speed Dials</span>
              </CheckboxLabel>
              <InfoText>Copy all speed dial entries to the new user</InfoText>
            </FormGroup>

            <InfoText style={{ marginTop: '1rem', padding: '0.75rem', background: '#fef3c7', borderRadius: '4px', color: '#92400e' }}>
              <strong>Note:</strong> The new user will be created with a temporary password (TempPassword123!). 
              They should change it on first login.
            </InfoText>

            <ModalFooter>
              <Button variant="secondary" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={copyUserMutation.isLoading}>
                <FiCopy />
                Copy User
              </Button>
            </ModalFooter>
          </form>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default CopyUserModal;

