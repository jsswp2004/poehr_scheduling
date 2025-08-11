import axios from 'axios';
import { API_BASE_URL } from '../config/api';

// Single preconfigured axios instance used across the app
// Note: Authorization headers are managed centrally by App.js interceptors
// to prevent duplicate token refresh logic and storms
export const api = axios.create({
    baseURL: API_BASE_URL,
});
