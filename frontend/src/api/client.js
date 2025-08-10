import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { getAccessToken } from '../utils/tokenManager';

// Single preconfigured axios instance used across the app
export const api = axios.create({
    baseURL: API_BASE_URL,
});

// Attach Authorization header on every request
api.interceptors.request.use((config) => {
    const access = getAccessToken();
    if (!config.headers) config.headers = {};
    if (access) config.headers.Authorization = `Bearer ${access}`;
    return config;
});
