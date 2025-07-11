import React from 'react';
import { Link } from 'react-router-dom';

/**
 * PricingPanel Component
 * Reusable component for displaying pricing plan information
 */
const PricingPanel = ({
    badge,
    title,
    price,
    period,
    description,
    features,
    buttonText,
    enrollLink,
    featured = false
}) => {
    return (
        <div className={`pricing-panel ${featured ? 'featured' : ''}`}>
            <div className="panel-header">
                {badge && <div className="panel-badge">{badge}</div>}
                <div className="panel-title">{title}</div>
                {price && (
                    <div className="panel-price">
                        <span className="price-amount">{price}</span>
                        {period && <span className="price-period">{period}</span>}
                    </div>
                )}
            </div>

            <div className="panel-description">
                {description}
            </div>

            <div className="panel-features">
                {features.map((feature, index) => (
                    <div key={index} className="feature">
                        {feature}
                    </div>
                ))}
            </div>

            {buttonText && enrollLink && (
                <div className="panel-button">
                    <Link to={enrollLink} className="btn-panel">
                        {buttonText}
                    </Link>
                </div>
            )}
        </div>
    );
};

export default PricingPanel;
