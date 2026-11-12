import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

/**
 * Custom hook for managing bulk messaging functionality
 * Handles message composition and sending to all contacts
 */
export const useBulkMessaging = (token) => {
    const [messageForm, setMessageForm] = useState({
        message: '',
        subject: 'Notification',
        send_email: false,
        send_sms: true
    });

    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);

    // Handle message form changes
    const updateMessageForm = (field, value) => {
        setMessageForm(prev => ({
            ...prev,
            [field]: value
        }));
        setError(null);
    };

    // Handle checkbox changes
    const updateMessageCheckbox = (field, checked) => {
        setMessageForm(prev => ({
            ...prev,
            [field]: checked
        }));
        setError(null);
    };

    // Validate message form
    const validateMessage = () => {
        if (!messageForm.message.trim()) {
            return 'Please enter a message';
        }

        if (!messageForm.send_email && !messageForm.send_sms) {
            return 'Please select at least one delivery method (Email or SMS)';
        }

        return null;
    };

    // Send bulk message
    const sendBulkMessage = async (contactIds, confirmCount) => {
        const validationError = validateMessage();
        if (validationError) {
            setError(validationError);
            return false;
        }

        if (!token) {
            setError('Authentication required');
            return false;
        }

        setSending(true);
        setError(null);

        try {
            const payload = Array.isArray(contactIds)
                ? { ...messageForm, contact_ids: contactIds }
                : { ...messageForm, ...(contactIds && contactIds.list_id ? { list_id: contactIds.list_id } : {}) };
            // Lets the server refuse if the number of recipients changed since the person reviewed it.
            if (Number.isInteger(confirmCount)) payload.confirm_count = confirmCount;
            const response = await axios.post(
                `${API_BASE_URL}/api/communicator/send/`,
                payload,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Reset form on success
            setMessageForm({
                message: '',
                subject: 'Notification',
                send_email: false,
                send_sms: true
            });

            return {
                success: true,
                sentCount: response.data.sent
            };
        } catch (err) {
            console.error('Failed to send message:', err);
            const msg = (err.response && err.response.data && err.response.data.error) || 'Failed to send message';
            setError(msg);
            return {
                success: false,
                error: msg
            };
        } finally {
            setSending(false);
        }
    };

    // Reset message form
    const resetMessageForm = () => {
        setMessageForm({
            message: '',
            subject: 'Notification',
            send_email: false,
            send_sms: true
        });
        setError(null);
    };

    return {
        messageForm,
        sending,
        error,
        updateMessageForm,
        updateMessageCheckbox,
        sendBulkMessage,
        resetMessageForm,
        validateMessage
    };
};
