import React from 'react';

const DataSecuritySection = ({ onSecurityClick }) => {
    return (
        <div className="data-security-section">
            <div className="data-security-content">
                <div className="data-security-text">
                    <h2 className="data-security-headline">
                        <span className="highlight-yellow">100% your data</span>
                    </h2>
                    <p className="data-security-description">
                        Your data stays secure with end-to-end encryption and local storage options.
                        POWER ensures complete data ownership and privacy, giving you full control over
                        your patient information and clinic data. HIPAA compliant and trusted by healthcare
                        professionals worldwide.
                    </p>
                    <div className="data-security-cta">
                        <div className="btn-read-more" onClick={onSecurityClick} style={{ cursor: 'pointer' }}>
                            <div className="read-more-text">Read more</div>
                        </div>
                    </div>
                </div>
                <div className="data-security-icons">
                    <div className="security-icon shield-icon"></div>
                    <div className="security-icon lock-icon"></div>
                    <div className="security-icon encryption-icon"></div>
                </div>
            </div>
        </div>
    );
};

export default DataSecuritySection;
