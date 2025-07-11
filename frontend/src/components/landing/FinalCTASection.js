import React from 'react';

const FinalCTASection = ({ onPricingClick }) => {
    return (
        <div className="free-trial">
            <div className="heading4">
                <div className="text-block4">
                    <div className="try-power-today">Try POWER today</div>
                    <div className="get-started-for-free-add-your-whole-team-as-your-needs-grow2">
                        Get started for free.<br />
                        Add your whole team as your needs grow.
                    </div>
                </div>
                <div className="btn-try2" onClick={onPricingClick} style={{ cursor: 'pointer' }}>
                    <div className="try-power-free2">Try POWER free</div>
                </div>
                <div className="on-a-big-team-contact-sales" onClick={onPricingClick} style={{ cursor: 'pointer' }}>
                    On a big team? Contact sales
                </div>

                {/* Platform download icons */}
                <div className="app-icon">
                    <div className="apple-black-logo-2">
                        <div className="platform-icon">App Store</div>
                    </div>
                    <div className="windows-logo-1">
                        <div className="platform-icon">Windows</div>
                    </div>
                    <div className="android-logo-1">
                        <div className="platform-icon">Google Play</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinalCTASection;
