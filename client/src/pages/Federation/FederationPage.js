import React from 'react';
import { Navigate } from 'react-router-dom';
import PageShell from '../../components/PageShell/PageShell';
import { useAuthStore } from '../../stores/authStore';
import { canAccessAdmin, getDefaultHomePath } from '../../utils/navigation';
import Federation from './Federation';

const FederationPage = () => {
  const { user } = useAuthStore();

  if (!canAccessAdmin(user)) {
    return <Navigate to={getDefaultHomePath(user)} replace />;
  }

  return (
    <PageShell>
      <Federation />
    </PageShell>
  );
};

export default FederationPage;
