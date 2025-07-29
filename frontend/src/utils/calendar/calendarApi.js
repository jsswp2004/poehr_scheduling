/**
 * Calendar API service functions
 */
import axios from "axios";
import { API_BASE_URL } from "../../config/api";

const BASE_URL = `${API_BASE_URL}/api`;

// Create API instance with common configuration
const createApiInstance = (token) => {
    return axios.create({
        baseURL: BASE_URL,
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
};

export const calendarApi = {
    // Fetch doctors
    fetchDoctors: async (token) => {
        const api = createApiInstance(token);
        const response = await api.get("/users/doctors/");
        return response.data;
    },

    // Fetch appointments
    fetchAppointments: async (token) => {
        const api = createApiInstance(token);
        const response = await api.get("/appointments/");
        return response.data;
    },

    // Fetch availability
    fetchAvailability: async (token) => {
        const api = createApiInstance(token);
        const response = await api.get("/availability/");
        return response.data;
    },

    // Fetch clinic events
    fetchClinicEvents: async (token) => {
        const api = createApiInstance(token);
        const response = await api.get("/clinic-events/");
        return response.data;
    },

    // Fetch holidays
    fetchHolidays: async (token) => {
        const api = createApiInstance(token);
        const response = await api.get("/holidays/");
        return response.data;
    },

    // Fetch environment settings (blocked days)
    fetchEnvironmentSettings: async (token) => {
        const api = createApiInstance(token);
        const response = await api.get("/settings/environment/");
        return response.data;
    },

    // Create appointment
    createAppointment: async (token, appointmentData) => {
        // Debug logging for timezone issue
        console.log('=== CALENDAR API CREATING APPOINTMENT ===');
        console.log('appointmentData being sent:', JSON.stringify(appointmentData, null, 2));
        console.log('appointment_datetime in data:', appointmentData.appointment_datetime);
        console.log('typeof appointment_datetime:', typeof appointmentData.appointment_datetime);
        console.log('=========================================');

        const api = createApiInstance(token);
        const response = await api.post("/appointments/", appointmentData);

        console.log('=== CALENDAR APPOINTMENT CREATED RESPONSE ===');
        console.log('Response data:', response.data);
        console.log('=============================================');

        return response.data;
    },

    // Update appointment
    updateAppointment: async (token, appointmentId, appointmentData) => {
        // Debug logging for timezone issue
        console.log('=== CALENDAR API UPDATING APPOINTMENT ===');
        console.log('appointmentId:', appointmentId);
        console.log('appointmentData being sent:', JSON.stringify(appointmentData, null, 2));
        console.log('appointment_datetime in data:', appointmentData.appointment_datetime);
        console.log('typeof appointment_datetime:', typeof appointmentData.appointment_datetime);
        console.log('=========================================');

        const api = createApiInstance(token);
        const response = await api.put(`/appointments/${appointmentId}/`, appointmentData);

        console.log('=== CALENDAR APPOINTMENT UPDATED RESPONSE ===');
        console.log('Response data:', response.data);
        console.log('=============================================');

        return response.data;
    },

    // Delete appointment
    deleteAppointment: async (token, appointmentId) => {
        const api = createApiInstance(token);
        await api.delete(`/appointments/${appointmentId}/`);
    },
};
