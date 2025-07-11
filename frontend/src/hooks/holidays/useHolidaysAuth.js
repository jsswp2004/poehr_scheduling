import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

export const useHolidaysAuth = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            navigate('/login');
            return;
        }
        try {
            const decoded = jwtDecode(token);
            const role = decoded.role || '';
            if (role !== 'admin' && role !== 'system_admin' && role !== 'registrar') {
                navigate('/');
            }
        } catch (err) {
            navigate('/login');
        }
    }, [navigate]);

    const getAuthHeaders = () => {
        const token = localStorage.getItem('access_token');
        return { Authorization: `Bearer ${token}` };
    };

    return { getAuthHeaders };
};
