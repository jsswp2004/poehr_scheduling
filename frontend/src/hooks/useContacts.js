import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

/**
 * Custom hook for managing contacts functionality
 * Handles CRUD operations for contacts
 */
export const useContacts = (token) => {
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch contacts
    const fetchContacts = useCallback(async (showErrorToast = false) => {
        if (!token) return;

        setLoading(true);
        setError(null);

        try {
            const response = await axios.get(`${API_BASE_URL}/api/communicator/contacts/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setContacts(response.data);
        } catch (err) {
            console.error('Failed to fetch contacts:', err);
            const errorMessage = 'Failed to load contacts';
            setError(errorMessage);

            if (showErrorToast && window.toast) {
                window.toast.error(errorMessage);
            }
        } finally {
            setLoading(false);
        }
    }, [token]);

    // Create contact
    const createContact = useCallback(async (contactData) => {
        if (!token) return false;

        try {
            await axios.post(
                `${API_BASE_URL}/api/communicator/contacts/`,
                contactData,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            await fetchContacts(true);
            return true;
        } catch (err) {
            console.error('Failed to create contact:', err);
            setError('Failed to save contact');
            return false;
        }
    }, [token, fetchContacts]);

    // Update contact
    const updateContact = useCallback(async (contactId, contactData) => {
        if (!token) return false;

        try {
            await axios.put(
                `${API_BASE_URL}/api/communicator/contacts/${contactId}/`,
                contactData,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            await fetchContacts(true);
            return true;
        } catch (err) {
            console.error('Failed to update contact:', err);
            setError('Failed to save contact');
            return false;
        }
    }, [token, fetchContacts]);

    // Delete contact
    const deleteContact = useCallback(async (contactId) => {
        if (!token) return false;

        try {
            await axios.delete(`${API_BASE_URL}/api/communicator/contacts/${contactId}/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            await fetchContacts(true);
            return true;
        } catch (err) {
            console.error('Failed to delete contact:', err);
            setError('Failed to delete contact');
            return false;
        }
    }, [token, fetchContacts]);

    // Auto-fetch on mount
    useEffect(() => {
        fetchContacts();
    }, [fetchContacts]);

    return {
        contacts,
        loading,
        error,
        fetchContacts,
        createContact,
        updateContact,
        deleteContact,
        refreshContacts: () => fetchContacts(true)
    };
};
