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
                <a href="/support" className="dropdown-item">Support</a>
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
          <div className="btn-free-trial2" onClick={handlePricingPageClick} style={{ cursor: 'pointer' }}>
            <div className="try-power-for-free">Try POWER for free</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;
