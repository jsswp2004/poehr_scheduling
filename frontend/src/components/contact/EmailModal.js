import React from 'react';

/**
 * EmailModal Component
 * Modal for sending email messages
 */
const EmailModal = ({
    isOpen,
    formData,
    formErrors,
    isLoading,
    onInputChange,
    onSubmit,
    onClose
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Send Email</h2>
                    <button className="close-button" onClick={onClose}>×</button>
                </div>
                <form onSubmit={onSubmit} className="email-form">
                    <div className="form-group">
                        <label htmlFor="to">To:</label>
                        <input
                            type="email"
                            id="to"
                            name="to"
                            value={formData.to}
                            onChange={onInputChange}
                            readOnly
                            className="form-input readonly"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="from">From: *</label>
                        <input
                            type="email"
                            id="from"
                            name="from"
                            value={formData.from}
                            onChange={onInputChange}
                            placeholder="Please enter your email address"
                            className={`form-input ${formErrors.from ? 'error' : ''}`}
                            required
                        />
                        {formErrors.from && <span className="error-message">{formErrors.from}</span>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="telephone">Phone Number: *</label>
                        <input
                            type="tel"
                            id="telephone"
                            name="telephone"
                            value={formData.telephone}
                            onChange={onInputChange}
                            placeholder="Please enter your phone number"
                            className={`form-input ${formErrors.telephone ? 'error' : ''}`}
                            required
                        />
                        {formErrors.telephone && <span className="error-message">{formErrors.telephone}</span>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="subject">Subject:</label>
                        <input
                            type="text"
                            id="subject"
                            name="subject"
                            value={formData.subject}
                            onChange={onInputChange}
                            placeholder="Subject (optional)"
                            className="form-input"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="message">Message:</label>
                        <textarea
                            id="message"
                            name="message"
                            value={formData.message}
                            onChange={onInputChange}
                            placeholder="Enter your message here..."
                            className="form-textarea"
                            rows="5"
                        />
                    </div>

                    <div className="form-actions">
                        <button type="button" onClick={onClose} className="cancel-button" disabled={isLoading}>
                            Cancel
                        </button>
                        <button type="submit" className="send-button" disabled={isLoading}>
                            {isLoading ? 'Sending...' : 'Send Email'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EmailModal;
