/**
 * Hook for managing appointment form external data (events, holidays, blocked days)
 */
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { 
  fetchClinicEvents, 
  fetchBlockedDays, 
  fetchHolidays 
} from '../../utils/appointment/appointmentApi';

export const useAppointmentFormData_External = (token) => {
  const [clinicEvents, setClinicEvents] = useState([]);
  const [blockedDays, setBlockedDays] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadExternalData = async () => {
      if (!token) return;

      setLoading(true);
      try {
        const [eventsData, blockedDaysData, holidaysData] = await Promise.all([
          fetchClinicEvents(token),
          fetchBlockedDays(token),
          fetchHolidays(token)
        ]);

        setClinicEvents(eventsData);
        setBlockedDays(blockedDaysData);
        setHolidays(holidaysData);
      } catch (error) {
        console.error('Failed to fetch external data:', error);
        toast.error('Failed to load form data');
      } finally {
        setLoading(false);
      }
    };

    loadExternalData();
  }, [token]);

  return {
    clinicEvents,
    blockedDays,
    holidays,
    loading,
  };
};
