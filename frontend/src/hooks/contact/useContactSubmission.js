import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

/**
 * Custom hook for handling contact form submissions
 */
export const useContactSubmission = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSmsLoading, setIsSmsLoading] = useState(false);

    const handleSendEmail = async (formData, onSuccess) => {
        setIsLoading(true);

        try {
            // Prepare email data matching the API format
            const subject = formData.subject || 'Contact Form Inquiry';
            const message = `From: ${formData.from}\nPhone: ${formData.telephone}\n\nMessage:\n${formData.message}`;

            // Send email directly through the API using the public contact endpoint
            await axios.post(
                'http://127.0.0.1:8000/api/messages/contact-email/',
                {
                    email: formData.to,
                    subject: subject,
                    message: message,
                }
                // Note: No Authorization header needed for contact form
            );

            toast.success('Email sent successfully! We\'ll get back to you soon.');
            onSuccess?.();

        } catch (err) {
            console.error('Email failed:', err);
            toast.error('Failed to send email. Please try again or contact us directly.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendSms = async (smsFormData, onSuccess) => {
        setIsSmsLoading(true);

        try {
            // Send SMS through the API using the public contact SMS endpoint
            await axios.post(
                'http://127.0.0.1:8000/api/messages/contact-sms/',
                {
                    phone_to: smsFormData.phone_to,
                    phone_from: smsFormData.phone_from,
                    message: smsFormData.message,
                }
                // Note: No Authorization header needed for contact form
            );

            toast.success('SMS sent successfully! We\'ll get back to you soon.');
            onSuccess?.();

        } catch (err) {
            console.error('SMS failed:', err);
            toast.error('Failed to send SMS. Please try again or contact us directly.');
        } finally {
            setIsSmsLoading(false);
        }
    };

    return {
        isLoading,
        isSmsLoading,
        handleSendEmail,
        handleSendSms
    };
};
