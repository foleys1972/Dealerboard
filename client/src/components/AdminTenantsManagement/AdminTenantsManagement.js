import React, { useMemo, useState } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { FiPlus, FiRefreshCw, FiUserPlus } from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';

import api from '../../utils/api';
import { theme } from '../../styles/GlobalStyle';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const SmallButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.6rem;
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surface};
  color: ${props => props.theme.colors.text};
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.25rem;
  color: ${props => props.theme.colors.text};
`;

const Actions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const Card = styled.div`
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 1rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const Input = styled.input`
  padding: 0.65rem 0.75rem;
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
`;

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.9rem;
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => (props.$variant === 'primary' ? 'transparent' : props.theme.colors.border)};
  background: ${props => (props.$variant === 'primary' ? props.theme.colors.accent : props.theme.colors.surface)};
  color: ${props => (props.$variant === 'primary' ? 'white' : props.theme.colors.text)};
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th, td {
    padding: 0.75rem;
    border-bottom: 1px solid ${props => props.theme.colors.border};
    text-align: left;
  }

  th {
    color: ${props => props.theme.colors.textSecondary};
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`;

const InlineHelp = styled.div`
  color: ${props => props.theme.colors.textTertiary};
  font-size: 0.85rem;
`;

const AdminTenantsManagement = () => {
  const queryClient = useQueryClient();
  const [createTenantForm, setCreateTenantForm] = useState({ slug: '', name: '' });
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenantAdminForm, setTenantAdminForm] = useState({
    username: '',
    password: '',
    email: '',
    firstName: '',
    lastName: '',
  });

  const tenantsQuery = useQuery(
    ['platform-tenants'],
    async () => {
      const resp = await api.get('/api/platform-admin/tenants');
      return resp.data?.tenants || [];
    },
    {
      retry: 1,
      refetchOnWindowFocus: false,
    }
  );

  const updateTenantMutation = useMutation(
    async ({ tenantId, payload }) => {
      const resp = await api.put(`/api/platform-admin/tenants/${encodeURIComponent(tenantId)}`, payload);
      return resp.data?.tenant;
    },
    {
      onSuccess: () => {
        toast.success('Tenant updated');
        queryClient.invalidateQueries(['platform-tenants']);
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to update tenant';
        toast.error(msg);
      }
    }
  );

  const deleteTenantMutation = useMutation(
    async (tenantId) => {
      const resp = await api.delete(`/api/platform-admin/tenants/${encodeURIComponent(tenantId)}`);
      return resp.data?.tenant;
    },
    {
      onSuccess: () => {
        toast.success('Tenant deactivated');
        queryClient.invalidateQueries(['platform-tenants']);
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to delete tenant';
        toast.error(msg);
      }
    }
  );

  const tenants = useMemo(() => (Array.isArray(tenantsQuery.data) ? tenantsQuery.data : []), [tenantsQuery.data]);

  const createTenantMutation = useMutation(
    async (payload) => {
      const resp = await api.post('/api/platform-admin/tenants', payload);
      return resp.data?.tenant;
    },
    {
      onSuccess: (tenant) => {
        toast.success('Tenant created');
        setCreateTenantForm({ slug: '', name: '' });
        if (tenant?.id) {
          setSelectedTenantId(tenant.id);
        }
        queryClient.invalidateQueries(['platform-tenants']);
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to create tenant';
        toast.error(msg);
      }
    }
  );

  const createTenantAdminMutation = useMutation(
    async ({ tenantId, payload }) => {
      const resp = await api.post(`/api/platform-admin/tenants/${encodeURIComponent(tenantId)}/tenant-admin`, payload);
      return resp.data?.user;
    },
    {
      onSuccess: () => {
        toast.success('Tenant admin created');
        setTenantAdminForm({ username: '', password: '', email: '', firstName: '', lastName: '' });
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to create tenant admin';
        toast.error(msg);
      }
    }
  );

  return (
    <ThemeProvider theme={theme}>
      <Container>
        <Header>
          <Title>Tenants</Title>
          <Actions>
            <Button
              onClick={() => tenantsQuery.refetch()}
              disabled={tenantsQuery.isFetching}
              title="Refresh tenants"
            >
              <FiRefreshCw />
              Refresh
            </Button>
          </Actions>
        </Header>

        <Grid>
          <Card>
            <h3 style={{ marginTop: 0 }}>Create Tenant</h3>
            <Row>
              <Label>
                Slug
                <Input
                  value={createTenantForm.slug}
                  onChange={(e) => setCreateTenantForm((s) => ({ ...s, slug: e.target.value }))}
                  placeholder="hsbc"
                />
              </Label>
              <Label>
                Name
                <Input
                  value={createTenantForm.name}
                  onChange={(e) => setCreateTenantForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="HSBC"
                />
              </Label>
            </Row>
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                $variant="primary"
                onClick={() => createTenantMutation.mutate({ slug: createTenantForm.slug.trim(), name: createTenantForm.name.trim() })}
                disabled={createTenantMutation.isLoading || !createTenantForm.slug.trim() || !createTenantForm.name.trim()}
              >
                <FiPlus />
                Create Tenant
              </Button>
            </div>
            <InlineHelp style={{ marginTop: '0.75rem' }}>
              Slug must be unique. This will be used as the company identifier.
            </InlineHelp>
          </Card>

          <Card>
            <h3 style={{ marginTop: 0 }}>Create Tenant Admin</h3>
            <Label>
              Tenant
              <select
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                style={{
                  padding: '0.65rem 0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #2a2e3a',
                  background: '#0b1220',
                  color: 'white',
                }}
              >
                <option value="">Select tenant...</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </select>
            </Label>

            <Row>
              <Label>
                Username
                <Input
                  value={tenantAdminForm.username}
                  onChange={(e) => setTenantAdminForm((s) => ({ ...s, username: e.target.value }))}
                  placeholder="hsbc.admin"
                />
              </Label>
              <Label>
                Password
                <Input
                  type="password"
                  value={tenantAdminForm.password}
                  onChange={(e) => setTenantAdminForm((s) => ({ ...s, password: e.target.value }))}
                  placeholder="ChangeMe123!"
                />
              </Label>
            </Row>

            <Row>
              <Label>
                Email
                <Input
                  value={tenantAdminForm.email}
                  onChange={(e) => setTenantAdminForm((s) => ({ ...s, email: e.target.value }))}
                  placeholder="hsbc.admin@hsbc.com"
                />
              </Label>
              <Label>
                First Name
                <Input
                  value={tenantAdminForm.firstName}
                  onChange={(e) => setTenantAdminForm((s) => ({ ...s, firstName: e.target.value }))}
                  placeholder="HSBC"
                />
              </Label>
            </Row>

            <Row>
              <Label>
                Last Name
                <Input
                  value={tenantAdminForm.lastName}
                  onChange={(e) => setTenantAdminForm((s) => ({ ...s, lastName: e.target.value }))}
                  placeholder="Admin"
                />
              </Label>
              <div />
            </Row>

            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                $variant="primary"
                onClick={() =>
                  createTenantAdminMutation.mutate({
                    tenantId: selectedTenantId,
                    payload: {
                      username: tenantAdminForm.username.trim(),
                      password: tenantAdminForm.password,
                      email: tenantAdminForm.email.trim() || undefined,
                      firstName: tenantAdminForm.firstName.trim() || undefined,
                      lastName: tenantAdminForm.lastName.trim() || undefined,
                    },
                  })
                }
                disabled={
                  createTenantAdminMutation.isLoading ||
                  !selectedTenantId ||
                  !tenantAdminForm.username.trim() ||
                  !tenantAdminForm.password
                }
              >
                <FiUserPlus />
                Create Tenant Admin
              </Button>
            </div>
          </Card>
        </Grid>

        <Card>
          <h3 style={{ marginTop: 0 }}>Existing Tenants</h3>
          {tenantsQuery.isLoading ? (
            <div>Loading...</div>
          ) : tenants.length === 0 ? (
            <div>No tenants created yet.</div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>ID</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span>{t.name}</span>
                        <SmallButton
                          onClick={() => {
                            const nextName = window.prompt('Rename tenant', t.name);
                            if (!nextName || !nextName.trim() || nextName.trim() === t.name) return;
                            updateTenantMutation.mutate({ tenantId: t.id, payload: { name: nextName.trim() } });
                          }}
                          disabled={updateTenantMutation.isLoading}
                          title="Rename tenant"
                        >
                          Rename
                        </SmallButton>
                      </div>
                    </td>
                    <td>{t.slug}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{t.id}</td>
                    <td>{t.is_active === false || t.isActive === false ? 'No' : 'Yes'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {t.is_active === false || t.isActive === false ? (
                          <SmallButton
                            onClick={() => updateTenantMutation.mutate({ tenantId: t.id, payload: { isActive: true } })}
                            disabled={updateTenantMutation.isLoading}
                            title="Reactivate tenant"
                          >
                            Reactivate
                          </SmallButton>
                        ) : (
                          <SmallButton
                            onClick={() => {
                              const ok = window.confirm(`Deactivate tenant "${t.name}"?`);
                              if (!ok) return;
                              deleteTenantMutation.mutate(t.id);
                            }}
                            disabled={deleteTenantMutation.isLoading}
                            title="Deactivate tenant"
                          >
                            Deactivate
                          </SmallButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Container>
    </ThemeProvider>
  );
};

export default AdminTenantsManagement;
