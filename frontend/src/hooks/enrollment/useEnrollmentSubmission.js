import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

/**
 * Custom hook for managing enrollment submission and API interaction
 * Handles payment method creation and user registration
 */
export const useEnrollmentSubmission = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (formData, paymentFormRef) => {
        setIsSubmitting(true);
        setStatus({ type: '', message: '' });

        try {
            // Step 1: Create payment method if we're on the payment step
            let paymentMethodId = null;
            if (paymentFormRef.current) {
                const paymentMethod = await paymentFormRef.current.createPaymentMethod();
                paymentMethodId = paymentMethod.id;
            }

            // Step 2: Register user with subscription info
            const registrationData = {
                ...formData,
                payment_method_id: paymentMethodId,
                is_enrollment: true  // Flag to indicate this is service enrollment, not patient registration
            };

            const response = await axios.post('http://127.0.0.1:8000/api/auth/register/', registrationData);

            setStatus({
                type: 'success',
                message: `Enrollment successful! Your ${formData.subscription_tier} plan trial has started. Redirecting to login...`
            });

            // Redirect to login after showing success message
            setTimeout(() => {
                navigate('/login');
            }, 3000);

        } catch (err) {
            console.error('Enrollment failed:', err);
            let errorMessage = 'Enrollment failed. Please try again.';

            // Extract specific error messages from the response
            if (err.response?.data) {
                const errors = err.response.data;
                if (typeof errors === 'object') {
                    const errorMessages = Object.entries(errors)
                        .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
                        .join('; ');
                    errorMessage = `Enrollment failed: ${errorMessages}`;
                } else if (typeof errors === 'string') {
                    errorMessage = `Enrollment failed: ${errors}`;
                }
            }

            setStatus({ type: 'error', message: errorMessage });

        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        status,
        isSubmitting,
        setStatus,
        handleSubmit
    };
};
