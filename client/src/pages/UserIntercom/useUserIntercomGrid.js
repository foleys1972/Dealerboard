import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';

const DEFAULT_GRID_CONFIG = {
  columns: 3,
  gap: '1rem',
  mobileColumns: 1,
  mobileGap: '0.75rem',
  tabletColumns: 2,
  contactColumns: 2,
  contactGap: '0.75rem',
  contactMobileColumns: 1,
};

export function useUserIntercomGrid() {
  const [gridConfig, setGridConfig] = useState(DEFAULT_GRID_CONFIG);

  const loadGridConfig = useCallback(async () => {
    try {
      const response = await api.get('/api/user-intercom/grid-config');
      if (response.data?.config) {
        setGridConfig((prev) => ({ ...prev, ...response.data.config }));
      }
    } catch (error) {
      console.error('Failed to load grid config, using defaults:', error);
    }
  }, []);

  useEffect(() => {
    loadGridConfig();
  }, [loadGridConfig]);

  return { gridConfig, setGridConfig, loadGridConfig };
}
