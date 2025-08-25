/**
 * Landing page pricing section component
 */
import React from 'react';

export const PricingSection = ({
    onPricingClick,
    onContactClick
}) => {
    return (
        <div className="pricing-section">
            <div className="pricing-header">
                <div className="choose-your-plan">Choose Your Plan</div>
                <div className="pricing-description">
                    Whether you're working solo or with a team, we have a plan that fits your needs.
                </div>
            </div>

            <div className="pricing-cards">
                {/* Professional Plan - Free */}
                <div className="pricing-card">
                    <div className="plan-header">
                        <div className="plan-name">Professional</div>
                        <div className="plan-price">
                            <span className="price-amount">$15</span>
                            <span className="price-period">Free</span>
                        </div>
                    </div>
                    <div className="plan-description">
                        For individuals getting started with healthcare scheduling
                    </div>
                    <div className="plan-features">
                        <div className="feature">Basic scheduling</div>
                        <div className="feature">Basic calendar view</div>
                        <div className="feature">Email notifications</div>
                        <div className="feature">Mobile app access</div>
                        <div className="feature">Basic reporting</div>
                    </div>
                    <div className="plan-button">
                        <div className="btn-plan" onClick={onPricingClick} style={{ cursor: 'pointer' }}>
                            Start Free Trial
                        </div>
                    </div>
                </div>

                {/* Clinic Plan - Most Popular */}
                <div className="pricing-card popular">
                    <div className="plan-header">
                        <div className="plan-name">Clinic</div>
                        <div className="plan-price">
                            <span className="price-amount">$49.99</span>
                            <span className="price-period">per month</span>
                        </div>
                    </div>
                    <div className="plan-description">
                        Keep your Clinic on track
                    </div>
                    <div className="plan-features">
                        <div className="feature">Everything in Professional</div>
                        <div className="feature">Up to 10 providers</div>
                        <div className="feature">Unlimited appointments</div>
                        <div className="feature">Advanced calendar features</div>
                        <div className="feature">Team collaboration tools</div>
                        <div className="feature">SMS + Email notifications</div>
                        <div className="feature">Bulk SMS notifications</div>
                        <div className="feature">Patient management system</div>
                        <div className="feature">Automated reminders</div>
                        <div className="feature">Advanced reporting & analytics</div>
                    </div>
                    <div className="plan-button">
                        <div className="btn-plan" onClick={() => onPricingClick('clinic')} style={{ cursor: 'pointer' }}>
                            Start Free Trial
                        </div>
                    </div>
                </div>

                {/* Group Plan - Enterprise */}
                <div className="pricing-card">
                    <div className="plan-header">
                        <div className="plan-name">Group</div>
                        <div className="plan-price">
                            <span className="price-amount">$129.99</span>
                            <span className="price-period">per month</span>
                        </div>
                    </div>
                    <div className="plan-description">
                        For larger teams
                    </div>
                    <div className="plan-features">
                        <div className="feature">Everything in Clinic</div>
                        <div className="feature">Unlimited users</div>
                        <div className="feature">Advanced analytics</div>
                        <div className="feature">Priority support</div>
                        <div className="feature">Custom integrations</div>
                        <div className="feature">Multi-organization support</div>
                        <div className="feature">Advanced analytics & reporting</div>
                        <div className="feature">Custom branding</div>
                        <div className="feature">24/7 dedicated support</div>
                        <div className="feature">On-premise deployment option</div>
                        <div className="feature">Custom feature development</div>
                        <div className="feature">White-label solutions</div>
                        <div className="feature">Custom integrations</div>
                        <div className="feature">Dedicated account manager</div>
                        <div className="feature">SLA guarantees</div>
                        <div className="feature">Professional services</div>
                    </div>
                    <div className="plan-button">
                        <div className="btn-plan" onClick={onContactClick} style={{ cursor: 'pointer' }}>
                            Contact Sales
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
