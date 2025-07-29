/**
 * Appointment form API utilities
 */
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

const API_ENDPOINTS_BASE = `${API_BASE_URL}/api`;

/**
 * Fetch doctors list
 */
export const fetchDoctors = async (token) => {
    const response = await axios.get(`${API_ENDPOINTS_BASE}/users/doctors/`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

/**
 * Fetch clinic events
 */
export const fetchClinicEvents = async (token) => {
    const response = await axios.get(`${API_ENDPOINTS_BASE}/clinic-events/`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

/**
 * Fetch blocked days from environment settings
 */
export const fetchBlockedDays = async (token) => {
    const response = await axios.get(`${API_ENDPOINTS_BASE}/settings/environment/`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.blocked_days || [];
};

/**
 * Fetch holidays
 */
export const fetchHolidays = async (token) => {
    const response = await axios.get(`${API_ENDPOINTS_BASE}/holidays/`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.filter(h => h.is_recognized);
};

/**
 * Fetch available dates for a doctor
 */
export const fetchDoctorAvailableDates = async (doctorId, token) => {
    const response = await axios.get(`${API_ENDPOINTS_BASE}/doctors/${doctorId}/available-dates/`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

/**
 * Fetch provider availability blocks
 */
export const fetchProviderAvailability = async (doctorId, token) => {
    const response = await axios.get(`${API_ENDPOINTS_BASE}/availability/?doctor=${doctorId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

/**
 * Create new appointment
 */
export const createAppointment = async (payload, token) => {
    // Debug logging for timezone issue
    console.log('=== CREATING APPOINTMENT API CALL ===');
    console.log('Payload being sent to backend:', JSON.stringify(payload, null, 2));
    console.log('appointment_datetime in payload:', payload.appointment_datetime);
    console.log('typeof appointment_datetime:', typeof payload.appointment_datetime);
    console.log('=====================================');

    const response = await axios.post(`${API_ENDPOINTS_BASE}/appointments/`, payload, {
        headers: { Authorization: `Bearer ${token}` }
    });

    console.log('=== APPOINTMENT CREATED RESPONSE ===');
    console.log('Response data:', response.data);
    console.log('===================================');

    return response.data;
};

/**
 * Update existing appointment
 */
export const updateAppointment = async (appointmentId, payload, token) => {
    // Debug logging for timezone issue
    console.log('=== UPDATING APPOINTMENT API CALL ===');
    console.log('Appointment ID:', appointmentId);
    console.log('Payload being sent to backend:', JSON.stringify(payload, null, 2));
    console.log('appointment_datetime in payload:', payload.appointment_datetime);
    console.log('typeof appointment_datetime:', typeof payload.appointment_datetime);
    console.log('=====================================');

    const response = await axios.put(`${API_ENDPOINTS_BASE}/appointments/${appointmentId}/`, payload, {
        headers: { Authorization: `Bearer ${token}` }
    });

    console.log('=== APPOINTMENT UPDATED RESPONSE ===');
    console.log('Response data:', response.data);
    console.log('===================================');

    return response.data;
};
