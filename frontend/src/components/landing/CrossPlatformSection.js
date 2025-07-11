import React from 'react';

const CrossPlatformSection = ({ onPricingClick }) => {
    return (
        <div className="efficient-scheduling-section">
            <div className="efficient-scheduling-content">
                <div className="efficient-scheduling-text">
                    <h2 className="efficient-scheduling-headline">
                        Efficient scheduling—anywhere, anytime.
                    </h2>
                    <p className="efficient-scheduling-description">
                        Access your schedules and patient information from your computer, phone, or tablet—anytime, anywhere. POWER keeps
                        everything in sync, so your appointments and clinic data are always up to date, whether you're at the office, at home, or on the go.
                        Available on Windows, macOS, Android, and iOS.
                    </p>
                    <div className="efficient-scheduling-cta">
                        <div className="btn-try-power" onClick={onPricingClick} style={{ cursor: 'pointer' }}>
                            <div className="try-power-text">Try POWER</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CrossPlatformSection;
