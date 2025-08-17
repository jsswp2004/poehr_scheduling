import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getValidToken, clearAuthData } from '../utils/auth';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../config/api';
import { getAccessToken } from '../utils/tokenManager';

export const usePatients = (navigate, userRole = null) => {
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [provider, setProvider] = useState('');
    const [page, setPage] = useState(1);
    const [totalSize, setTotalSize] = useState(0);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [emailForm, setEmailForm] = useState({
        subject: 'Message from your provider',
        message: '',
    });

    // Memoize state setters to prevent unnecessary re-renders
    const memoizedSetSearch = useCallback((value) => {
        setSearch(value);
    }, []);

    const memoizedSetProvider = useCallback((value) => {
        setProvider(value);
    }, []);

    const memoizedSetPage = useCallback((value) => {
        setPage(value);
    }, []);

    const rowsPerPage = 10;
    const totalPages = Math.ceil(totalSize / rowsPerPage);

    const fetchPatients = useCallback(async () => {
        // Only fetch patients if user is a doctor
        if (userRole !== 'doctor') {
            console.log('👤 usePatients: Skipping patient fetch - user is not a doctor (role:', userRole, ')');
            setPatients([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const validToken = await getValidToken();
            if (!validToken) {
                console.error('No valid token for fetching patients');
                clearAuthData();
                navigate('/login');
                return;
            }

            console.log('👨‍⚕️ usePatients: Fetching patients for doctor user');
            const res = await axios.get(`${API_BASE_URL}/api/users/patients/`, {
                headers: { Authorization: `Bearer ${validToken}` },
                params: {
                    search,
                    provider,
                    page,
                    page_size: rowsPerPage,
                },
            });

            // Add debugging and better error handling
            console.log('API Response:', res.data);

            // Check if response has expected structure
            if (!res.data || !res.data.results) {
                console.error('Unexpected API response structure:', res.data);
                toast.error('Received unexpected data format from server');
                return;
            }

            const patientsWithFullName = res.data.results.map((p) => ({
                ...p,
                full_name: `${p.first_name} ${p.last_name}`,
            }));
            setPatients(patientsWithFullName);
            setTotalSize(res.data.count || 0);
        } catch (err) {
            console.error('❌ Failed to fetch patients:', err);
            console.error('❌ Error details:', {
                message: err.message,
                status: err.response?.status,
                statusText: err.response?.statusText,
                data: err.response?.data,
                url: err.config?.url,
                headers: err.response?.headers
            });
            toast.error(`Failed to fetch patients: ${err.response?.status || 'Network Error'}`);
        } finally {
            setLoading(false);
        }
    }, [search, provider, page, navigate, userRole]);

    const handleSendText = async (patient, token) => {
        const phone = patient.phone_number;
        const message = `Hello ${patient.first_name}, this is a reminder from your provider.`;

        if (!phone) {
            toast.warning(`No phone number available for ${patient.first_name}`);
            return;
        }

        try {
            await axios.post(
                `${API_BASE_URL}/api/sms/send-sms/`,
                { phone, message },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(`Text sent to ${patient.first_name}`);
        } catch (err) {
            console.error('SMS failed:', err);
            toast.error('Failed to send SMS');
        }
    };

    const handleOpenEmailModal = (patient, token) => {
        setSelectedPatient(patient);

        // Get current user's name from token
        let userName = 'your provider';
        if (token) {
            try {
                const decoded = jwtDecode(token);
                const firstName = decoded.first_name || '';
                const lastName = decoded.last_name || '';
                if (firstName || lastName) {
                    userName = `${firstName} ${lastName}`.trim();
                }
            } catch (err) {
                console.error('Failed to decode token for user name:', err);
            }
        }

        setEmailForm({ subject: `Message from ${userName}`, message: '' });
        setShowEmailModal(true);
    };

    const handleSendEmail = async (token) => {
        try {
            // Use direct token access like PatientDetailPage for consistency
            const authToken = getAccessToken();
            if (!authToken) {
                toast.error('Authentication token not found. Please log in again.');
                clearAuthData();
                navigate('/login');
                return;
            }

            // Determine the email address to use
            const emailAddress = selectedPatient.email || selectedPatient.user?.email;
            if (!emailAddress) {
                toast.error('No email address found for this patient');
                return;
            }

            await axios.post(
                `${API_BASE_URL}/api/users/send-email/`,
                {
                    email: emailAddress,
                    subject: emailForm.subject,
                    message: emailForm.message,
                },
                {
                    headers: { Authorization: `Bearer ${authToken}` },
                }
            );
            toast.success('Email sent successfully!');
            setShowEmailModal(false);
            setEmailForm({ subject: 'Message from your provider', message: '' });
        } catch (err) {
            console.error('Email failed:', err);

            if (err.response?.status === 401) {
                toast.error('Authentication failed. Please log in again.');
                clearAuthData();
                navigate('/login');
            } else if (err.response?.status === 400) {
                toast.error(err.response.data?.error || 'Invalid email data');
            } else {
                toast.error('Failed to send email: ' + (err.response?.data?.error || err.message));
            }
        }
    };

    const handleDelete = async (id, token) => {
        const confirmDelete = window.confirm(
            'Are you sure you want to delete this patient?'
        );
        if (!confirmDelete) return;

        try {
            await axios.delete(`${API_BASE_URL}/api/users/patients/${id}/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success('Patient deleted!');
            setPage(1);
            setTimeout(() => {
                fetchPatients();
            }, 100);
        } catch (err) {
            console.error('Delete failed:', err);
            toast.error('Failed to delete patient');
        }
    };

    // Auto-fetch patients when search changes
    useEffect(() => {
        fetchPatients();
    }, [search, provider, page, fetchPatients]);

    return {
        patients,
        loading,
        search,
        setSearch: memoizedSetSearch,
        provider,
        setProvider: memoizedSetProvider,
        page,
        setPage: memoizedSetPage,
        totalSize,
        totalPages,
        rowsPerPage,
        showEmailModal,
        setShowEmailModal,
        selectedPatient,
        setSelectedPatient,
        emailForm,
        setEmailForm,
        fetchPatients,
        handleSendText,
        handleOpenEmailModal,
        handleSendEmail,
        handleDelete,
    };
};
