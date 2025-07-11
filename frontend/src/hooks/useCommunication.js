import { useState, useCallback } from 'react';
import axios from 'axios';
import { apiEndpoints, getAuthHeaders } from '../config/api';
import { toast } from '../components/SimpleToast';

/**
 * Custom hook for email and SMS communication
 */
export const useCommunication = () => {
    // Email form state
    const [emailForm, setEmailForm] = useState({
        to: "",
        cc: "",
        bcc: "",
        subject: "",
        message: "",
        attachments: [],
    });

    // SMS form state
    const [smsForm, setSmsForm] = useState({
        phone: "",
        message: "Please write your message to your physician.",
    });

    const [emailSending, setEmailSending] = useState(false);
    const [smsSending, setSmsSending] = useState(false);
    const [messageSent, setMessageSent] = useState(false);
    const [smsSent, setSMSSent] = useState(false);

    // Update email form
    const updateEmailForm = useCallback((field, value) => {
        setEmailForm(prev => ({
            ...prev,
            [field]: value,
        }));
    }, []);

    // Update SMS form
    const updateSmsForm = useCallback((field, value) => {
        setSmsForm(prev => ({
            ...prev,
            [field]: value,
        }));
    }, []);

    // Send email
    const sendEmail = useCallback(async () => {
        if (!emailForm.to || !emailForm.subject || !emailForm.message) {
            toast.error('Please fill in all required fields (To, Subject, Message)');
            return;
        }

        try {
            setEmailSending(true);
            await axios.post(
                apiEndpoints.sendEmail,
                emailForm,
                { headers: getAuthHeaders() }
            );

            setMessageSent(true);
            toast.success('Email sent successfully!');

            // Reset form
            setEmailForm({
                to: "",
                cc: "",
                bcc: "",
                subject: "",
                message: "",
                attachments: [],
            });

            // Reset success message after 3 seconds
            setTimeout(() => setMessageSent(false), 3000);
        } catch (error) {
            console.error('Error sending email:', error);
            toast.error('Failed to send email');
        } finally {
            setEmailSending(false);
        }
    }, [emailForm]);

    // Send SMS
    const sendSMS = useCallback(async () => {
        if (!smsForm.phone || !smsForm.message) {
            toast.error('Please fill in phone number and message');
            return;
        }

        try {
            setSmsSending(true);
            await axios.post(
                apiEndpoints.sendSMS,
                smsForm,
                { headers: getAuthHeaders() }
            );

            setSMSSent(true);
            toast.success('SMS sent successfully!');

            // Reset form
            setSmsForm({
                phone: "",
                message: "Please write your message to your physician.",
            });

            // Reset success message after 3 seconds
            setTimeout(() => setSMSSent(false), 3000);
        } catch (error) {
            console.error('Error sending SMS:', error);
            toast.error('Failed to send SMS');
        } finally {
            setSmsSending(false);
        }
    }, [smsForm]);

    // Handle file attachment for email
    const handleAttachment = useCallback((files) => {
        const fileArray = Array.from(files);
        setEmailForm(prev => ({
            ...prev,
            attachments: [...prev.attachments, ...fileArray],
        }));
    }, []);

    // Remove attachment
    const removeAttachment = useCallback((index) => {
        setEmailForm(prev => ({
            ...prev,
            attachments: prev.attachments.filter((_, i) => i !== index),
        }));
    }, []);

    return {
        emailForm,
        smsForm,
        emailSending,
        smsSending,
        messageSent,
        smsSent,
        updateEmailForm,
        updateSmsForm,
        sendEmail,
        sendSMS,
        handleAttachment,
        removeAttachment,
    };
};
