import React from 'react';
import PricingPanel from './PricingPanel';

/**
 * TabContent Component
 * Displays the pricing panels for each tab (Personal, Clinic, Group)
 */
const TabContent = ({ plans }) => {
    const { main, features } = plans;

    return (
        <div className="tab-content">
            <div className="pricing-panels">
                {/* Main pricing panel */}
                <PricingPanel
                    badge={main.badge}
                    title={main.title}
                    price={main.price}
                    period={main.period}
                    description={main.description}
                    features={main.features}
                    buttonText={main.buttonText}
                    enrollLink={main.enrollLink}
                />

                {/* Features panel */}
                <PricingPanel
                    title={features.title}
                    description={features.description}
                    features={features.features}
                    featured={true}
                />
            </div>
        </div>
    );
};

export default TabContent;
