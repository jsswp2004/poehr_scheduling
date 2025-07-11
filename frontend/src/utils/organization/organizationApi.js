/**
 * Organization API service functions
 */
import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:8000/api';

// Create API instance with auth token
const createApiInstance = (token) => {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const organizationApi = {
  // Get current user
  getCurrentUser: async (token) => {
    const api = createApiInstance(token);
    const response = await api.get('/current-user/');
    return response.data;
  },

  // Get user's organization
  getUserOrganization: async (token) => {
    const api = createApiInstance(token);
    const response = await api.get('/user-organization/');
    return response.data;
  },

  // Get all organizations (system admin only)
  getAllOrganizations: async (token) => {
    const api = createApiInstance(token);
    const response = await api.get('/organizations/');
    return response.data;
  },

  // Create new organization
  createOrganization: async (token, formData) => {
    const api = createApiInstance(token);
    const response = await api.post('/organizations/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Update organization
  updateOrganization: async (token, organizationId, formData) => {
    const api = createApiInstance(token);
    const response = await api.put(`/organizations/${organizationId}/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Delete organization
  deleteOrganization: async (token, organizationId) => {
    const api = createApiInstance(token);
    await api.delete(`/organizations/${organizationId}/`);
  },
};
