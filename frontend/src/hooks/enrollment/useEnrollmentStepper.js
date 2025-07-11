import { useState } from 'react';

/**
 * Custom hook for managing multi-step enrollment flow
 * Handles step navigation and validation
 */
export const useEnrollmentStepper = (formData, paymentMethodReady) => {
    const steps = ['Account Details', 'Choose Plan', 'Payment Info', 'Confirmation'];
    const [currentStep, setCurrentStep] = useState(0);

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const canProceed = () => {
        switch (currentStep) {
            case 0:
                return formData.organization_name && formData.first_name && formData.last_name &&
                    formData.username && formData.email && formData.password;
            case 1:
                return formData.subscription_tier;
            case 2:
                return paymentMethodReady;
            case 3:
                return true;
            default:
                return false;
        }
    };

    return {
        steps,
        currentStep,
        setCurrentStep,
        handleNext,
        handleBack,
        canProceed
    };
};
