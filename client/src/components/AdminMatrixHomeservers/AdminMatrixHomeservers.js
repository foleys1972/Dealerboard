import React, { useState } from 'react';
import styled from 'styled-components';
import { FiPlus, FiEdit, FiTrash2, FiX, FiCheck, FiServer, FiGlobe, FiActivity } from 'react-icons/fi';
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
  ModalFooter,
  Badge
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

const StatusBadge = styled(Badge)`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
`;

const AdminMatrixHomeservers = () => {
  const [showModal, setShowModal] = useState(false);
  const [editingHomeserver, setEditingHomeserver] = useState(null);
  const [formData, setFormData] = useState({
    region: 'US',
    serverName: '',
    baseUrl: '',
    federationUrl: '',
    isSelfHosted: true,
    externalProvider: '',
    locationId: '',
    capacity: 1000
  });

  const queryClient = useQueryClient();

  // Fetch homeservers
  const { data: homeserversData, isLoading } = useQuery(
    'matrix-homeservers',
    async () => {
      const response = await api.get('/api/matrix/homeservers');
      return response.data;
    }
  );

  // Fetch federation status
  const { data: federationStatus } = useQuery(
    'matrix-federation-status',
    async () => {
      const response = await api.get('/api/matrix/federation/status');
      return response.data;
    },
    {
      refetchInterval: 30000 // Refresh every 30 seconds
    }
  );

  // Fetch locations for dropdown
  const { data: locationsData } = useQuery(
    'locations',
    async () => {
      const response = await api.get('/api/locations');
      return response.data;
    }
  );

  // Create homeserver mutation
  const createMutation = useMutation(
    async (data) => {
      const response = await api.post('/api/matrix/homeservers', data);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('matrix-homeservers');
        queryClient.invalidateQueries('matrix-federation-status');
        toast.success('Homeserver created successfully');
        setShowModal(false);
        resetForm();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create homeserver');
      }
    }
  );

  // Update homeserver mutation
  const updateMutation = useMutation(
    async ({ id, data }) => {
      const response = await api.put(`/api/matrix/homeservers/${id}`, data);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('matrix-homeservers');
        queryClient.invalidateQueries('matrix-federation-status');
        toast.success('Homeserver updated successfully');
        setShowModal(false);
        resetForm();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to update homeserver');
      }
    }
  );

  // Delete homeserver mutation
  const deleteMutation = useMutation(
    async (id) => {
      const response = await api.delete(`/api/matrix/homeservers/${id}`);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('matrix-homeservers');
        queryClient.invalidateQueries('matrix-federation-status');
        toast.success('Homeserver deleted successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete homeserver');
      }
    }
  );

  // Reload federation mutation
  const reloadFederationMutation = useMutation(
    async () => {
      const response = await api.post('/api/matrix/federation/reload');
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('matrix-federation-status');
        toast.success('Federation configuration reloaded');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to reload federation');
      }
    }
  );

  const resetForm = () => {
    setFormData({
      region: 'US',
      serverName: '',
      baseUrl: '',
      federationUrl: '',
      isSelfHosted: true,
      externalProvider: '',
      locationId: '',
      capacity: 1000
    });
    setEditingHomeserver(null);
  };

  const handleCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleEdit = (homeserver) => {
    setFormData({
      region: homeserver.region,
      serverName: homeserver.serverName,
      baseUrl: homeserver.baseUrl,
      federationUrl: homeserver.federationUrl || '',
      isSelfHosted: homeserver.isSelfHosted,
      externalProvider: homeserver.externalProvider || '',
      locationId: homeserver.locationId || '',
      capacity: homeserver.capacity || 1000
    });
    setEditingHomeserver(homeserver);
    setShowModal(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this homeserver?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingHomeserver) {
      updateMutation.mutate({ id: editingHomeserver.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getFederationStatus = (homeserverId) => {
    if (!federationStatus?.homeservers) return null;
    return federationStatus.homeservers.find(hs => hs.homeserverId === homeserverId);
  };

  const homeservers = homeserversData?.homeservers || [];
  const locations = locationsData?.locations || [];

  return (
    <Container>
      <Header>
        <Title>
          <FiServer style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Matrix Homeservers
        </Title>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => reloadFederationMutation.mutate()}
            disabled={reloadFederationMutation.isLoading}
          >
            <FiActivity style={{ marginRight: '0.25rem' }} />
            Reload Federation
          </Button>
          <Button variant="primary" onClick={handleCreate}>
            <FiPlus style={{ marginRight: '0.25rem' }} />
            Add Homeserver
          </Button>
        </div>
      </Header>

      {federationStatus && (
        <Card>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
            <strong>Federation Status:</strong> {federationStatus.summary?.connected || 0} connected, 
            {federationStatus.summary?.disconnected || 0} disconnected
          </div>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading homeservers...</div>
        ) : homeservers.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            No homeservers configured. Click "Add Homeserver" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHeaderCell>Server Name</TableHeaderCell>
                <TableHeaderCell>Region</TableHeaderCell>
                <TableHeaderCell>Base URL</TableHeaderCell>
                <TableHeaderCell>Federation</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </tr>
            </TableHeader>
            <tbody>
              {homeservers.map((homeserver) => {
                const fedStatus = getFederationStatus(homeserver.id);
                return (
                  <TableRow key={homeserver.id}>
                    <TableCell>
                      <strong>{homeserver.serverName}</strong>
                      {homeserver.subscriberName && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          Subscriber: {homeserver.subscriberName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="info">{homeserver.region}</Badge>
                    </TableCell>
                    <TableCell>
                      <div style={{ fontSize: '0.875rem' }}>{homeserver.baseUrl}</div>
                      {homeserver.federationUrl && homeserver.federationUrl !== homeserver.baseUrl && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          <FiGlobe style={{ marginRight: '0.25rem' }} />
                          {homeserver.federationUrl}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {fedStatus ? (
                        <StatusBadge 
                          variant={fedStatus.canFederate ? 'success' : 'danger'}
                        >
                          {fedStatus.canFederate ? 'Connected' : 'Disconnected'}
                        </StatusBadge>
                      ) : (
                        <StatusBadge variant="secondary">Unknown</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell>
                      {homeserver.isSelfHosted ? (
                        <Badge variant="info">Self-Hosted</Badge>
                      ) : (
                        <Badge variant="warning">External ({homeserver.externalProvider})</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={homeserver.isActive ? 'success' : 'danger'}>
                        {homeserver.isActive ? 'Active' : 'Inactive'}
                      </StatusBadge>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Load: {homeserver.currentLoad || 0}/{homeserver.capacity || 1000}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ActionButtons>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleEdit(homeserver)}
                        >
                          <FiEdit />
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(homeserver.id)}
                        >
                          <FiTrash2 />
                        </Button>
                      </ActionButtons>
                    </TableCell>
                  </TableRow>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
        <ModalContent>
          <ModalHeader>
            {editingHomeserver ? 'Edit Homeserver' : 'Create Homeserver'}
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody>
              <FormGroup>
                <Label>Region *</Label>
                <Select
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  required
                >
                  <option value="US">US</option>
                  <option value="UK">UK</option>
                  <option value="APAC">APAC</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Server Name *</Label>
                <Input
                  type="text"
                  value={formData.serverName}
                  onChange={(e) => setFormData({ ...formData, serverName: e.target.value })}
                  placeholder="e.g., us.matrix.hsbc"
                  required
                />
              </FormGroup>

              <FormGroup>
                <Label>Base URL *</Label>
                <Input
                  type="url"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  placeholder="https://matrix.example.com"
                  required
                />
              </FormGroup>

              <FormGroup>
                <Label>Federation URL</Label>
                <Input
                  type="url"
                  value={formData.federationUrl}
                  onChange={(e) => setFormData({ ...formData, federationUrl: e.target.value })}
                  placeholder="https://matrix.example.com (optional, defaults to base URL)"
                />
              </FormGroup>

              <FormGroup>
                <Label>
                  <input
                    type="checkbox"
                    checked={formData.isSelfHosted}
                    onChange={(e) => setFormData({ ...formData, isSelfHosted: e.target.checked })}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Self-Hosted
                </Label>
              </FormGroup>

              {!formData.isSelfHosted && (
                <FormGroup>
                  <Label>External Provider</Label>
                  <Input
                    type="text"
                    value={formData.externalProvider}
                    onChange={(e) => setFormData({ ...formData, externalProvider: e.target.value })}
                    placeholder="e.g., Element, Synapse Cloud"
                  />
                </FormGroup>
              )}

              <FormGroup>
                <Label>Location</Label>
                <Select
                  value={formData.locationId}
                  onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                >
                  <option value="">None</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Capacity</Label>
                <Input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1000 })}
                  min="1"
                />
              </FormGroup>
            </ModalBody>
            <ModalFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowModal(false)}
              >
                <FiX style={{ marginRight: '0.25rem' }} />
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={createMutation.isLoading || updateMutation.isLoading}
              >
                <FiCheck style={{ marginRight: '0.25rem' }} />
                {editingHomeserver ? 'Update' : 'Create'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </Container>
  );
};

export default AdminMatrixHomeservers;

