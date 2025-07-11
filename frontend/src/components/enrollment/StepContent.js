import React from 'react';
import AccountDetailsStep from './AccountDetailsStep';
import PlanSelectionStep from './PlanSelectionStep';
import PaymentInfoStep from './PaymentInfoStep';
import ConfirmationStep from './ConfirmationStep';

/**
 * StepContent Component
 * Renders the appropriate step content based on current step
 */
const StepContent = React.forwardRef(({
    currentStep,
    formData,
    onChange,
    onTierSelect,
    isSubmitting,
    onPaymentMethodReady,
    status
}, ref) => {
    switch (currentStep) {
        case 0: // Account Details
            return (
                <AccountDetailsStep
                    formData={formData}
                    onChange={onChange}
                />
            );

        case 1: // Choose Plan
            return (
                <PlanSelectionStep
                    selectedTier={formData.subscription_tier}
                    onTierSelect={onTierSelect}
                    isSubmitting={isSubmitting}
                />
            );

        case 2: // Payment Info
            return (
                <PaymentInfoStep
                    ref={ref}
                    onPaymentMethodReady={onPaymentMethodReady}
                    loading={isSubmitting}
                    error={status.type === 'error' ? status.message : null}
                />
            );

        case 3: // Confirmation
            return (
                <ConfirmationStep
                    formData={formData}
                />
            );

        default:
            return null;
    }
});

StepContent.displayName = 'StepContent';

export default StepContent;
