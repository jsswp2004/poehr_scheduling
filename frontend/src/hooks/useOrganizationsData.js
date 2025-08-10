import { useState, useCallback } from 'react';
import { api } from '../api/client';
import { getValidToken, clearAuthData } from '../utils/auth';

export const useOrganizationsData = (navigate) => {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = await getValidToken();
      if (!token) {
        clearAuthData();
        navigate('/login');
        return;
      }

      console.log('📡 Fetching organizations...');
      const response = await api.get('/api/users/organizations/');
      
      console.log('✅ Organizations loaded, count:', response.data?.length || 0);
      setOrganizations(response.data);
      return response.data;
    } catch (err) {
      console.error('❌ Organizations fetch failed:', err);
      setError(err);
      setOrganizations([]);
      
      if (err?.response?.status === 401) {
        console.log("🚪 401 error, clearing auth and redirecting...");
        clearAuthData();
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  return {
    organizations,
    setOrganizations,
    loading,
    error,
    fetchOrganizations
  };
};
