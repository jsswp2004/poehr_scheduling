import { useState, useCallback } from 'react';
import { api } from '../api/client';
import { getValidToken, clearAuthData } from '../utils/auth';

export const useDoctorsData = (navigate) => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = await getValidToken();
      if (!token) {
        clearAuthData();
        navigate('/login');
        return;
      }

      console.log('📡 Fetching doctors...');
      const response = await api.get('/api/users/doctors/');
      
      console.log('✅ Doctors loaded, count:', response.data?.length || 0);
      setDoctors(response.data);
      return response.data;
    } catch (err) {
      console.error('❌ Failed to load doctors:', err);
      setError(err);
      setDoctors([]);
      
      if (err?.response?.status === 401) {
        clearAuthData();
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  return {
    doctors,
    setDoctors,
    loading,
    error,
    fetchDoctors
  };
};
