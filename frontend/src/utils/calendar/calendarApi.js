/**
 * Calendar API service functions
 */
import axios from "axios";

const BASE_URL = "http://127.0.0.1:8000/api";

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

    // Create appointment
    createAppointment: async (token, appointmentData) => {
        const api = createApiInstance(token);
        const response = await api.post("/appointments/", appointmentData);
        return response.data;
    },

    // Update appointment
    updateAppointment: async (token, appointmentId, appointmentData) => {
        const api = createApiInstance(token);
        const response = await api.put(`/appointments/${appointmentId}/`, appointmentData);
        return response.data;
    },

    // Delete appointment
    deleteAppointment: async (token, appointmentId) => {
        const api = createApiInstance(token);
        await api.delete(`/appointments/${appointmentId}/`);
    },
};
