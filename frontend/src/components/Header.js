/*
 * POWER IT Healthcare Scheduling - Reusable Header Component
 * 
 * COMPONENT PURPOSE:
 * ==================
 * Shared navigation header component used across all pages including:
 * - Landing page
 * - Pricing page
 * - Other future pages
 * 
 * FEATURES:
 * =========
 * - Company logo with click navigation to home
 * - Dropdown navigation menus (Solutions, Resources, Pricing)
 * - Login button with navigation
 * - "Try POWER for free" call-to-action button
 * - Responsive design with hover effects
 * - Click-outside-to-close dropdown functionality
 */

// Import React hooks for state management
import { useState, useEffect } from 'react';
// Import React Router navigation hook
import { useNavigate } from 'react-router-dom';
// Import Header component styles
import './Header.css';
// Import ContactPage styles for modal
import '../ContactPage/ContactPage.css';
// Import axios for API calls
import axios from 'axios';
// Import toast for notifications
import { toast } from 'react-toastify';
// Import API configuration
import { API_BASE_URL } from '../config/api';

// Asset imports
import POWERLogo from '../assets/POWER_IT.png'; // Company logo image
import DownArrow from '../assets/images/down-arrow0.svg'; // White dropdown arrow for navigation

// Reusable header component for consistent navigation across all pages
export const Header = ({ className }) => {
  // Initialize navigation hook for routing to other pages
  const navigate = useNavigate();

  // State for dropdown menu visibility
  const [showResourcesDropdown, setShowResourcesDropdown] = useState(false);
  const [showSolutionsDropdown, setShowSolutionsDropdown] = useState(false);
  const [showPricingDropdown, setShowPricingDropdown] = useState(false);

  // State for demo request email modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    to: 'info@powerhealthcareit.com',
    from: '',
    telephone: '',
    subject: 'Demo Request',
    message: 'I would like to request a demo of POWER Healthcare IT Systems.'
  });
  const [formErrors, setFormErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // Handler function to navigate to the solutions page
  const handleLoginClick = () => {
    navigate('/solutions');
  };

  // Handler function to navigate to landing page
  const handleLogoClick = () => {
    navigate('/');
  };

  // Handler function to navigate to pricing page
  const handlePricingPageClick = () => {
    navigate('/pricing');
    setShowPricingDropdown(false);
  };

  // Handler function to toggle Resources dropdown
  const toggleResourcesDropdown = () => {
    setShowResourcesDropdown(!showResourcesDropdown);
    setShowSolutionsDropdown(false);
    setShowPricingDropdown(false);
  };

  // Handler function to toggle Solutions dropdown
  const toggleSolutionsDropdown = () => {
    setShowSolutionsDropdown(!showSolutionsDropdown);
    setShowResourcesDropdown(false);
    setShowPricingDropdown(false);
  };

  // Handler function to toggle Pricing dropdown
  const togglePricingDropdown = () => {
    setShowPricingDropdown(!showPricingDropdown);
    setShowResourcesDropdown(false);
    setShowSolutionsDropdown(false);
  };

  // Handler function to open demo request modal
  const handleDemoRequest = () => {
    setIsModalOpen(true);
    setShowPricingDropdown(false);
  };

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

  // Handle email form submission
  const handleSendEmail = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/send-email/`, formData, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 200) {
        toast.success('Demo request sent successfully! We will contact you soon.');
        // Close modal and reset form
        setIsModalOpen(false);
        setFormData({
          to: 'info@powerhealthcareit.com',
          from: '',
          telephone: '',
          subject: 'Demo Request',
          message: 'I would like to request a demo of POWER Healthcare IT Systems.'
        });
        setFormErrors({});
      }
    } catch (error) {
      console.error('Error sending demo request:', error);
      if (error.response?.data?.errors) {
        setFormErrors(error.response.data.errors);
        toast.error('Please fix the errors and try again.');
      } else {
        toast.error('Failed to send demo request. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle modal close
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormErrors({});
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.nav-menu')) {
        setShowResourcesDropdown(false);
        setShowSolutionsDropdown(false);
        setShowPricingDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  return (
    <div className={`header ${className || ''}`}>
      {/* Company logo and branding */}
      <div className="logo" onClick={handleLogoClick} style={{ cursor: 'pointer' }}>
        <img className="power-logo-2-1" src={POWERLogo} alt="POWER IT Systems Logo" />
        <div className="power-it-systems" style={{ whiteSpace: 'nowrap' }}>POWER HEALTHCARE IT SYSTEMS</div>
      </div>
      
      <div className="frame-375">
        {/* Main navigation menu with dropdown arrows */}
        <div className="nav-menu">
          {/* Solutions dropdown menu 
          <div className="solutios">
            <div className="solutions" onClick={toggleSolutionsDropdown} style={{ cursor: 'pointer' }}>
              Solutions
            </div>
            <img className="down-arrow2" src={DownArrow} alt="dropdown arrow" />
            {showSolutionsDropdown && (
              <div className="dropdown-menu">
                <a href="/login" className="dropdown-item">Scheduler</a>
              </div>
            )}
          </div>*/}

          {/* Resources dropdown menu */}
          <div className="resources">
            <div className="resources2" onClick={toggleResourcesDropdown} style={{ cursor: 'pointer' }}>
              Resources
            </div>
            <img className="down-arrow3" src={DownArrow} alt="dropdown arrow" />
            {showResourcesDropdown && (
              <div className="dropdown-menu">
                {/*<a href="#guides" className="dropdown-item">Guides & Tutorials</a>
                <a href="#help" className="dropdown-item">Help Center</a>*/}
                <a href="/support" className="dropdown-item">How to Register Guide</a>
              </div>
            )}
          </div>

          {/* Pricing dropdown menu */}
          <div className="pricing">
            <div className="pricing2" onClick={togglePricingDropdown} style={{ cursor: 'pointer' }}>
              Pricing
            </div>
            <img className="down-arrow4" src={DownArrow} alt="dropdown arrow" />
            {showPricingDropdown && (
              <div className="dropdown-menu">
                 {/*<a href="#personal" className="dropdown-item">Personal</a>
                <a href="#clinic" className="dropdown-item">Clinic</a>
                <a href="#group" className="dropdown-item">Group</a>*/}
                <div className="dropdown-item" onClick={handlePricingPageClick} style={{ cursor: 'pointer' }}>
                  All Plans
                </div>
              </div>
            )}
          </div>
        </div>        {/* Login and trial buttons */}
        <div className="btn">
          <div className="btn-login" onClick={handleLoginClick} style={{ cursor: 'pointer' }}>
            <div className="login">Solutions</div>
          </div>
          <div className="btn-free-trial2" onClick={handleDemoRequest} style={{ cursor: 'pointer' }}>
            <div className="try-power-for-free">Request a Demo</div>
          </div>
          <div className="btn-free-trial2" onClick={handlePricingPageClick} style={{ cursor: 'pointer' }}>
            <div className="try-power-for-free">Try POWER for free</div>
          </div>

        </div>
      </div>

      {/* Demo Request Email Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Request a Demo</h2>
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
              </div>

              <div className="form-actions">
                <button type="button" onClick={handleCloseModal} className="cancel-button" disabled={isLoading}>
                  Cancel
                </button>
                <button type="submit" className="send-button" disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send Demo Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Header;
