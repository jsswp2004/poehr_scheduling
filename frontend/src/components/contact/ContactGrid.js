import React from 'react';

/**
 * ContactGrid Component
 * Displays contact information cards with click handlers for email and SMS
 */
const ContactGrid = ({
    onEmailClick,
    onSmsClick
}) => {
    return (
        <div className="contact-section">
            <div className="contact-grid">
                <div className="contact-card non-interactive" style={{ cursor: 'default' }}>
                    <div className="contact-title">Address</div>
                    <div className="contact-details">
                        16192 Coastal Highway<br />
                        Lewes, Delaware 19958 <br />
                        Sussex County
                    </div>
                </div>

                <div className="contact-card" onClick={onSmsClick} style={{ cursor: 'pointer' }}>
                    <div className="contact-title">Phone</div>
                    <div className="contact-details">(301) 880-6015</div>
                </div>

                <div className="contact-card" onClick={onEmailClick} style={{ cursor: 'pointer' }}>
                    <div className="contact-title">Email</div>
                    <div className="contact-details">info@powerhealthcareit.com</div>
                </div>
            </div>
        </div>
    );
};

export default ContactGrid;
