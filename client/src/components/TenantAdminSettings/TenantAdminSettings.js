import React, { useEffect, useMemo, useState } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { FiSave, FiRefreshCw } from 'react-icons/fi';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';

import api from '../../utils/api';
import { theme } from '../../styles/GlobalStyle';
import { useAuthStore } from '../../stores/authStore';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Section = styled.div`
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 1.5rem;
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0 0 1rem 0;
`;

const InfoBox = styled.div`
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 1rem;
  color: ${props => props.theme.colors.textSecondary};
  font-size: 0.9rem;
`;

const Textarea = styled.textarea`
  width: 100%;
  min-height: 360px;
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
`;

const Button = styled.button`
  padding: 0.6rem 1rem;
  background: ${props => (props.$primary ? props.theme.colors.accent : props.theme.colors.surfaceElevated)};
  border: 1px solid ${props => (props.$primary ? props.theme.colors.accent : props.theme.colors.border)};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => (props.$primary ? '#ffffff' : props.theme.colors.text)};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    background: ${props => (props.$primary ? props.theme.colors.accentHover : props.theme.colors.surface)};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

function safePrettyJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{\n}';
  }
}

const TenantAdminSettings = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const hasTenantContext = Boolean(user?.tid || user?.tenantId);
  const isTenantAdminRole = user?.role === 'tenant_admin' || user?.role === 'platform_admin' || user?.role === 'admin';

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(
    'tenantAdminSettings',
    async () => {
      const res = await api.get('/api/tenant-admin/settings');
      return res.data;
    },
    {
      enabled: isTenantAdminRole && hasTenantContext,
    }
  );

  const serverSettings = useMemo(() => data?.settings ?? {}, [data]);

  const [draftText, setDraftText] = useState('');

  useEffect(() => {
    setDraftText(safePrettyJson(serverSettings));
  }, [serverSettings]);

  const updateMutation = useMutation(
    async (settingsObject) => {
      const res = await api.put('/api/tenant-admin/settings', { settings: settingsObject });
      return res.data;
    },
    {
      onSuccess: async () => {
        await queryClient.invalidateQueries('tenantAdminSettings');
        toast.success('Tenant settings saved');
      },
      onError: (e) => {
        toast.error(e?.response?.data?.error || 'Failed to save tenant settings');
      }
    }
  );

  const handleSave = () => {
    if (!hasTenantContext) {
      toast.error('Tenant context is missing for this user');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(draftText || '{}');
    } catch (e) {
      toast.error('Invalid JSON. Fix formatting before saving.');
      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      toast.error('Settings must be a JSON object');
      return;
    }

    updateMutation.mutate(parsed);
  };

  if (!isTenantAdminRole) {
    return (
      <ThemeProvider theme={theme}>
        <Container>
          <InfoBox>Tenant admin access required.</InfoBox>
        </Container>
      </ThemeProvider>
    );
  }

  if (!hasTenantContext) {
    return (
      <ThemeProvider theme={theme}>
        <Container>
          <InfoBox>
            Tenant context is missing for this account.
            <br />
            This screen requires a tenant-scoped `tenant_admin` user.
          </InfoBox>
        </Container>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Container>
        <Section>
          <SectionTitle>Tenant Settings</SectionTitle>
          <InfoBox>
            These settings apply only to your tenant.
            <br />
            Edit the JSON and click Save.
          </InfoBox>
        </Section>

        <Section>
          {isLoading && <InfoBox>Loading tenant settings…</InfoBox>}
          {isError && (
            <InfoBox>
              Failed to load tenant settings.
              <br />
              {error?.response?.data?.error || error?.message || 'Unknown error'}
            </InfoBox>
          )}

          {!isLoading && !isError && (
            <Textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} />
          )}

          <ButtonRow style={{ marginTop: '1rem' }}>
            <Button onClick={() => refetch()} disabled={isFetching || isLoading}>
              <FiRefreshCw />
              Refresh
            </Button>
            <Button $primary onClick={handleSave} disabled={updateMutation.isLoading || isLoading}>
              <FiSave />
              Save
            </Button>
          </ButtonRow>
        </Section>
      </Container>
    </ThemeProvider>
  );
};

export default TenantAdminSettings;
