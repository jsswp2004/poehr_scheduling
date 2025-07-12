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
    // Debug logging for timezone issue
    console.log('=== CREATING APPOINTMENT API CALL ===');
    console.log('Payload being sent to backend:', JSON.stringify(payload, null, 2));
    console.log('appointment_datetime in payload:', payload.appointment_datetime);
    console.log('typeof appointment_datetime:', typeof payload.appointment_datetime);
    console.log('=====================================');

    const response = await axios.post(`${API_BASE_URL}/appointments/`, payload, {
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

    const response = await axios.put(`${API_BASE_URL}/appointments/${appointmentId}/`, payload, {
        headers: { Authorization: `Bearer ${token}` }
    });

    console.log('=== APPOINTMENT UPDATED RESPONSE ===');
    console.log('Response data:', response.data);
    console.log('===================================');

    return response.data;
};
