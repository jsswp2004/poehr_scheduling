import React from 'react';

/**
 * SmsModal Component
 * Modal for sending SMS messages
 */
const SmsModal = ({
    isOpen,
    smsFormData,
    smsFormErrors,
    isSmsLoading,
    onInputChange,
    onSubmit,
    onClose
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Send SMS</h2>
                    <button className="close-button" onClick={onClose}>×</button>
                </div>
                <form onSubmit={onSubmit} className="email-form">
                    <div className="form-group">
                        <label htmlFor="phone_to">To:</label>
                        <input
                            type="tel"
                            id="phone_to"
                            name="phone_to"
                            value={smsFormData.phone_to}
                            onChange={onInputChange}
                            readOnly
                            className="form-input readonly"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="phone_from">From: *</label>
                        <input
                            type="tel"
                            id="phone_from"
                            name="phone_from"
                            value={smsFormData.phone_from}
                            onChange={onInputChange}
                            placeholder="Please add your phone number"
                            className={`form-input ${smsFormErrors.phone_from ? 'error' : ''}`}
                            required
                        />
                        {smsFormErrors.phone_from && <span className="error-message">{smsFormErrors.phone_from}</span>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="sms_message">Message: *</label>
                        <textarea
                            id="sms_message"
                            name="message"
                            value={smsFormData.message}
                            onChange={onInputChange}
                            placeholder="Enter your message here..."
                            className={`form-textarea ${smsFormErrors.message ? 'error' : ''}`}
                            rows="5"
                            required
                        />
                        {smsFormErrors.message && <span className="error-message">{smsFormErrors.message}</span>}
                    </div>

                    <div className="form-actions">
                        <button type="button" onClick={onClose} className="cancel-button" disabled={isSmsLoading}>
                            Cancel
                        </button>
                        <button type="submit" className="send-button" disabled={isSmsLoading}>
                            {isSmsLoading ? 'Sending...' : 'Send SMS'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SmsModal;
