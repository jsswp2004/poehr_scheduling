import '../ContactPage/ContactPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

export const ContactPage = ({ className }) => {
  // State for email modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  // State for SMS modal
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    to: 'jsswp2004@outlook.com',
    from: '',
    telephone: '',
    subject: '',
    message: ''
  });
  // SMS form data
  const [smsFormData, setSmsFormData] = useState({
    phone_to: '3018806015',
    phone_from: '',
    message: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [smsFormErrors, setSmsFormErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSmsLoading, setIsSmsLoading] = useState(false);
  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  // Handle SMS form input changes
  const handleSmsInputChange = (e) => {
    const { name, value } = e.target;
    setSmsFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (smsFormErrors[name]) {
      setSmsFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };
  // Validate form
  const validateForm = () => {
    const errors = {};
    
    if (!formData.from.trim()) {
      errors.from = 'Email address is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.from)) {
      errors.from = 'Please enter a valid email address';
    }
    
    if (!formData.telephone.trim()) {
      errors.telephone = 'Phone number is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Validate SMS form
  const validateSmsForm = () => {
    const errors = {};
    
    if (!smsFormData.phone_from.trim()) {
      errors.phone_from = 'Your phone number is required';
    }
    
    if (!smsFormData.message.trim()) {
      errors.message = 'Message is required';
    }

    setSmsFormErrors(errors);
    return Object.keys(errors).length === 0;
  };  // Handle email send
  const handleSendEmail = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Prepare email data matching the API format
      const subject = formData.subject || 'Contact Form Inquiry';
      const message = `From: ${formData.from}\nPhone: ${formData.telephone}\n\nMessage:\n${formData.message}`;      // Send email directly through the API using the public contact endpoint
      await axios.post(
        'http://127.0.0.1:8000/api/messages/contact-email/',
        {
          email: formData.to,
          subject: subject,
          message: message,
        }
        // Note: No Authorization header needed for contact form
      );

      toast.success('Email sent successfully! We\'ll get back to you soon.');
      
      // Close modal and reset form
      setIsModalOpen(false);
      setFormData({
        to: 'jsswp2004@outlook.com',
        from: '',
        telephone: '',
        subject: '',
        message: ''
      });
      setFormErrors({});

    } catch (err) {
      console.error('Email failed:', err);
      toast.error('Failed to send email. Please try again or contact us directly.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle SMS send
  const handleSendSms = async (e) => {
    e.preventDefault();
    
    if (!validateSmsForm()) {
      return;
    }

    setIsSmsLoading(true);

    try {
      // Send SMS through the API using the public contact SMS endpoint
      await axios.post(
        'http://127.0.0.1:8000/api/messages/contact-sms/',
        {
          phone_to: smsFormData.phone_to,
          phone_from: smsFormData.phone_from,
          message: smsFormData.message,
        }
        // Note: No Authorization header needed for contact form
      );

      toast.success('SMS sent successfully! We\'ll get back to you soon.');
      
      // Close modal and reset form
      setIsSmsModalOpen(false);
      setSmsFormData({
        phone_to: '3018806015',
        phone_from: '',
        message: ''
      });
      setSmsFormErrors({});

    } catch (err) {
      console.error('SMS failed:', err);
      toast.error('Failed to send SMS. Please try again or contact us directly.');
    } finally {
      setIsSmsLoading(false);
    }
  };
  // Handle modal close
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormErrors({});
  };

  // Handle SMS modal close
  const handleCloseSmsModal = () => {
    setIsSmsModalOpen(false);
    setSmsFormErrors({});
  };

  return (
    <div className={`contact-page ${className || ''}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">Contact Us</h1>
        <p className="page-subtitle">We'd love to hear from you. Reach out to our team using the information below.</p>
      </div>
      <div className="contact-section">
        <div className="contact-grid">
          <div className="contact-card">
            <div className="contact-title">Address</div>
            <div className="contact-details">123 Placeholder Street<br/>City, State ZIP</div>
          </div>          <div className="contact-card" onClick={() => setIsSmsModalOpen(true)} style={{ cursor: 'pointer' }}>
            <div className="contact-title">Phone</div>
            <div className="contact-details">(301) 880-6015</div>
          </div>
          <div className="contact-card" onClick={() => setIsModalOpen(true)} style={{ cursor: 'pointer' }}>
            <div className="contact-title">Email</div>
            <div className="contact-details">jswp2004@outlook.com</div>
          </div>        
        </div>
      </div>

      {/* Email Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Send Email</h2>
              <button className="close-button" onClick={handleCloseModal}>×</button>
            </div>
            <form onSubmit={handleSendEmail} className="email-form">
              <div className="form-group">
                <label htmlFor="to">To:</label>
                <input
                  type="email"
                  id="to"
                  name="to"
                  value={formData.to}
                  onChange={handleInputChange}
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
                  onChange={handleInputChange}
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
                  onChange={handleInputChange}
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
                  onChange={handleInputChange}
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
                  onChange={handleInputChange}
                  placeholder="Enter your message here..."
                  className="form-textarea"
                  rows="5"
                />
              </div>              <div className="form-actions">
                <button type="button" onClick={handleCloseModal} className="cancel-button" disabled={isLoading}>
                  Cancel
                </button>
                <button type="submit" className="send-button" disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </form>
          </div>
        </div>      )}

      {/* SMS Modal */}
      {isSmsModalOpen && (
        <div className="modal-overlay" onClick={handleCloseSmsModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Send SMS</h2>
              <button className="close-button" onClick={handleCloseSmsModal}>×</button>
            </div>
            <form onSubmit={handleSendSms} className="email-form">
              <div className="form-group">
                <label htmlFor="phone_to">To:</label>
                <input
                  type="tel"
                  id="phone_to"
                  name="phone_to"
                  value={smsFormData.phone_to}
                  onChange={handleSmsInputChange}
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
                  onChange={handleSmsInputChange}
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
                  onChange={handleSmsInputChange}
                  placeholder="Enter your message here..."
                  className={`form-textarea ${smsFormErrors.message ? 'error' : ''}`}
                  rows="5"
                  required
                />
                {smsFormErrors.message && <span className="error-message">{smsFormErrors.message}</span>}
              </div>

              <div className="form-actions">
                <button type="button" onClick={handleCloseSmsModal} className="cancel-button" disabled={isSmsLoading}>
                  Cancel
                </button>
                <button type="submit" className="send-button" disabled={isSmsLoading}>
                  {isSmsLoading ? 'Sending...' : 'Send SMS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default ContactPage;
