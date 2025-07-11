import React from 'react';

const HeroSection = ({ onPricingClick, dashboardImage }) => {
    return (
        <div className="hero-section">
            {/* Main headline and description text */}
            <div className="heading">
                <div className="text-block">
                    {/* Primary value proposition headline */}
                    <div className="smarter-scheduling-better-outcomes-powered-by-power">
                        Smarter Scheduling. Better Outcomes. That is POWER.
                    </div>
                    {/* Supporting description text */}
                    <div className="healthcare-scheduling-software-that-empowers-your-team-to-coordinate-plan-and-manage-patient-care-every-day">
                        Healthcare scheduling software that empowers your team to
                        coordinate, plan, and manage patient care—every day.
                    </div>
                </div>
                {/* Primary call-to-action button */}
                <div className="btn-free-trial" onClick={onPricingClick} style={{ cursor: 'pointer' }}>
                    <div className="try-power-free">Try POWER free</div>
                </div>
            </div>

            {/* Hero image placeholder */}
            <div className="image-container">
                <img
                    src={dashboardImage}
                    alt="POWER Healthcare Dashboard Preview"
                    className="hero-dashboard-image"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '16px',
                        padding: '0px'
                    }}
                />
            </div>
        </div>
    );
};

export default HeroSection;
