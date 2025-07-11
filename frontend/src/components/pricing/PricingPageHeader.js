import React from 'react';

/**
 * PricingPageHeader Component
 * Displays the main heading and subtitle for the pricing page
 */
const PricingPageHeader = () => {
    return (
        <div className="pricing-page-header">
            <div className="page-title-section">
                <h1 className="page-title">Pick your plan</h1>
                <p className="page-subtitle">
                    Whether you're practicing solo or with a clinic or Physician Group,
                    we have a plan that fits your needs.
                </p>
            </div>
        </div>
    );
};

export default PricingPageHeader;
