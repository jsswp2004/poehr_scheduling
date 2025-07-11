import React from 'react';
import TabContent from './TabContent';

/**
 * PricingSection Component
 * Main container that renders the appropriate tab content based on active tab
 */
const PricingSection = ({ activeTab, personalPlans, clinicPlans, groupPlans }) => {
    const getTabPlans = () => {
        switch (activeTab) {
            case 'personal':
                return { main: personalPlans.basic, features: personalPlans.features };
            case 'clinic':
                return { main: clinicPlans.standard, features: clinicPlans.features };
            case 'group':
                return { main: groupPlans.enterprise, features: groupPlans.features };
            default:
                return { main: personalPlans.basic, features: personalPlans.features };
        }
    };

    return (
        <div className="pricing-section">
            <TabContent plans={getTabPlans()} />
        </div>
    );
};

export default PricingSection;
