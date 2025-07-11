import React from 'react';
import SubscriptionTierSelector from '../SubscriptionTierSelector';

/**
 * PlanSelectionStep Component
 * Step 2 of enrollment - Choose subscription plan
 */
const PlanSelectionStep = ({
    selectedTier,
    onTierSelect,
    isSubmitting
}) => {
    return (
        <SubscriptionTierSelector
            selectedTier={selectedTier}
            onTierSelect={onTierSelect}
            disabled={isSubmitting}
        />
    );
};

export default PlanSelectionStep;
