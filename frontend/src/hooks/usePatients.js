import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import { getValidToken, clearAuthData } from '../utils/auth';

export const usePatients = (navigate) => {
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

    const rowsPerPage = 10;
    const totalPages = Math.ceil(totalSize / rowsPerPage);

    const fetchPatients = async () => {
        setLoading(true);
        try {
            const validToken = await getValidToken();
            if (!validToken) {
                console.error('No valid token for fetching patients');
                clearAuthData();
                navigate('/login');
                return;
            }

            const res = await axios.get('http://127.0.0.1:8000/api/users/patients/', {
                headers: { Authorization: `Bearer ${validToken}` },
                params: {
                    search,
                    provider,
                    page,
                    page_size: rowsPerPage,
                },
            });

            const patientsWithFullName = res.data.results.map((p) => ({
                ...p,
                full_name: `${p.first_name} ${p.last_name}`,
            }));
            setPatients(patientsWithFullName);
            setTotalSize(res.data.count);
        } catch (err) {
            console.error('Failed to fetch patients:', err);
            toast.error('Failed to fetch patients');
        } finally {
            setLoading(false);
        }
    };

    const handleSendText = async (patient, token) => {
        const phone = patient.phone_number;
        const message = `Hello ${patient.first_name}, this is a reminder from your provider.`;

        if (!phone) {
            toast.warning(`No phone number available for ${patient.first_name}`);
            return;
        }

        try {
            await axios.post(
                'http://127.0.0.1:8000/api/sms/send-sms/',
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
            await axios.post(
                'http://127.0.0.1:8000/api/messages/send-email/',
                {
                    email: selectedPatient.email,
                    subject: emailForm.subject,
                    message: emailForm.message,
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            toast.success('Email sent successfully!');
            setShowEmailModal(false);
            setEmailForm({ subject: 'Message from your provider', message: '' });
        } catch (err) {
            console.error('Email failed:', err);
            toast.error('Failed to send email');
        }
    };

    const handleDelete = async (id, token) => {
        const confirmDelete = window.confirm(
            'Are you sure you want to delete this patient?'
        );
        if (!confirmDelete) return;

        try {
            await axios.delete(`http://127.0.0.1:8000/api/users/patients/${id}/`, {
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

    return {
        patients,
        loading,
        search,
        setSearch,
        provider,
        setProvider,
        page,
        setPage,
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
