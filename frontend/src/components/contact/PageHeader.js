import React from 'react';

/**
 * PageHeader Component
 * Displays the contact page header with title and subtitle
 */
const PageHeader = () => {
    return (
        <div className="page-title-section">
            <h1 className="page-title">Contact Us</h1>
            <p className="page-subtitle">We'd love to hear from you.</p>
            <p className="page-subtitle">Reach out to our team using the information below.</p>
            <p className="page-subtitle">Click on the phone or email button to send us a message.</p>
        </div>
    );
};

export default PageHeader;
