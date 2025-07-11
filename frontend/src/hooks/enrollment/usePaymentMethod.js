import { useState } from 'react';

/**
 * Custom hook for managing payment method state
 * Handles payment method readiness and related state
 */
export const usePaymentMethod = () => {
    const [paymentMethodReady, setPaymentMethodReady] = useState(false);

    return {
        paymentMethodReady,
        setPaymentMethodReady
    };
};
