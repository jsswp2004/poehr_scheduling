import React from 'react';

const PricingSection = ({ onPricingClick, onContactClick }) => {
    const pricingPlans = [
        {
            name: 'Professional',
            price: '$15',
            period: 'Free',
            description: 'For individuals getting started with healthcare scheduling',
            features: [
                'Basic scheduling',
                'Basic calendar view',
                'Email notifications',
                'Mobile app access',
                'Basic reporting'
            ],
            buttonText: 'Start Free Trial',
            onClick: onPricingClick,
            isPopular: false
        },
        {
            name: 'Clinic',
            price: '$49.99',
            period: 'per month',
            description: 'Keep your Clinic on track',
            features: [
                'Everything in Personal',
                'Up to 10 providers',
                'Unlimited appointments',
                'Advanced calendar features',
                'Team collaboration tools',
                'SMS + Email notifications',
                'Bulk SMS notifications',
                'Patient management system',
                'Automated reminders',
                'Advanced reporting & analytics'
            ],
            buttonText: 'Start Free Trial',
            onClick: () => onPricingClick('clinic'),
            isPopular: true
        },
        {
            name: 'Group',
            price: '$129.99',
            period: 'per month',
            description: 'For larger teams',
            features: [
                'Everything in Clinic',
                'Unlimited users',
                'Advanced analytics',
                'Priority support',
                'Custom integrations',
                'Multi-organization support',
                'Advanced analytics & reporting',
                'Custom branding',
                '24/7 dedicated support',
                'On-premise deployment option',
                'Custom feature development',
                'White-label solutions',
                'Custom integrations',
                'Dedicated account manager',
                'SLA guarantees',
                'Professional services'
            ],
            buttonText: 'Contact Sales',
            onClick: onContactClick,
            isPopular: false
        }
    ];

    return (
        <div className="pricing-section">
            <div className="pricing-header">
                <div className="choose-your-plan">Choose Your Plan</div>
                <div className="pricing-description">
                    Whether you're working solo or with a team, we have a plan that fits your needs.
                </div>
            </div>

            <div className="pricing-cards">
                {pricingPlans.map((plan, index) => (
                    <div key={index} className={`pricing-card ${plan.isPopular ? 'popular' : ''}`}>
                        <div className="plan-header">
                            <div className="plan-name">{plan.name}</div>
                            <div className="plan-price">
                                <span className="price-amount">{plan.price}</span>
                                <span className="price-period">{plan.period}</span>
                            </div>
                        </div>
                        <div className="plan-description">
                            {plan.description}
                        </div>
                        <div className="plan-features">
                            {plan.features.map((feature, featureIndex) => (
                                <div key={featureIndex} className="feature">{feature}</div>
                            ))}
                        </div>
                        <div className="plan-button">
                            <div className="btn-plan" onClick={plan.onClick} style={{ cursor: 'pointer' }}>
                                {plan.buttonText}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PricingSection;
