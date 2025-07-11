/**
 * Appointment form API utilities
 */
import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

/**
 * Fetch doctors list
 */
export const fetchDoctors = async (token) => {
  const response = await axios.get(`${API_BASE_URL}/users/doctors/`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

/**
 * Fetch clinic events
 */
export const fetchClinicEvents = async (token) => {
  const response = await axios.get(`${API_BASE_URL}/clinic-events/`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

/**
 * Fetch blocked days from environment settings
 */
export const fetchBlockedDays = async (token) => {
  const response = await axios.get(`${API_BASE_URL}/settings/environment/`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data.blocked_days || [];
};

/**
 * Fetch holidays
 */
export const fetchHolidays = async (token) => {
  const response = await axios.get(`${API_BASE_URL}/holidays/`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data.filter(h => h.is_recognized);
};

/**
 * Fetch available dates for a doctor
 */
export const fetchDoctorAvailableDates = async (doctorId, token) => {
  const response = await axios.get(`${API_BASE_URL}/doctors/${doctorId}/available-dates/`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

/**
 * Fetch provider availability blocks
 */
export const fetchProviderAvailability = async (doctorId, token) => {
  const response = await axios.get(`${API_BASE_URL}/availability/?doctor=${doctorId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

/**
 * Create new appointment
 */
export const createAppointment = async (payload, token) => {
  const response = await axios.post(`${API_BASE_URL}/appointments/`, payload, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

/**
 * Update existing appointment
 */
export const updateAppointment = async (appointmentId, payload, token) => {
  const response = await axios.put(`${API_BASE_URL}/appointments/${appointmentId}/`, payload, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};
