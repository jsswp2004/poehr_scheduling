/*
 * POWER IT Healthcare Scheduling - Landing Page Component
 * 
 * PAGE LAYOUT STRUCTURE:
 * =====================
 * 1. Hero Section - Main banner with headline and CTA button
 * 2. Navigation Header - Logo, menu items, login/trial buttons  
 * 3. Product Features - POWER Scheduling feature showcase
 * 4. Collaboration Section - Team collaboration features
 * 5. Customer Testimonials - Client reviews and feedback
 * 6. Cross-Platform Section - Multi-device availability info
 * 7. Data Security Section - Security and privacy features
 * 8. Pricing Section - Three-tier pricing plans (Personal/Clinic/Group)
 * 9. Free Trial CTA - Final call-to-action with platform links
 * 10. Footer - Company info, navigation links, legal
 */

// Import styles for the landing page component
import '../LandingPageV1Desktop1920Px/LandingPageV1Desktop1920Px.css';
// Import React Router navigation hook
import { useNavigate } from 'react-router-dom';
// Import React hooks for state management
import { useState, useEffect } from 'react';

// Asset imports
import POWERLogo from '../assets/POWER_IT.png'; // Company logo image
import DashboardImage from '../assets/dashboard_clinician.png'; // Dashboard clinician image
import DashboardSchedulingImage from '../assets/dashboard_scheduling.png'; // Dashboard scheduling image
import DashboardTogetherImage from '../assets/dashboard_together.png'; // Dashboard together image
import DashboardQouteImage from '../assets/dashboard_qoutes.png'; // Dashboard quote image
import DownArrow from '../assets/images/down-arrow0.svg'; // White dropdown arrow for navigation

// Main landing page component for POWER IT healthcare scheduling software
export const LandingPageV1Desktop1920Px = ({ className, ...props }) => {
  // Initialize navigation hook for routing to other pages
  const navigate = useNavigate();  // State for dropdown menu visibility
  const [showResourcesDropdown, setShowResourcesDropdown] = useState(false);
  const [showSolutionsDropdown, setShowSolutionsDropdown] = useState(false);
  const [showPricingDropdown, setShowPricingDropdown] = useState(false);

  // Handler function to navigate to login page
  const handleLoginClick = () => {
    navigate('/login');
  };

  // Handler function to toggle Resources dropdown
  const toggleResourcesDropdown = () => {
    setShowResourcesDropdown(!showResourcesDropdown);
  };

  // Handler function to toggle Solutions dropdown
  const toggleSolutionsDropdown = () => {
    setShowSolutionsDropdown(!showSolutionsDropdown);
  };

  // Handler function to toggle Pricing dropdown
  const togglePricingDropdown = () => {
    setShowPricingDropdown(!showPricingDropdown);
  };  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showResourcesDropdown && !event.target.closest('.resources')) {
        setShowResourcesDropdown(false);
      }
      if (showSolutionsDropdown && !event.target.closest('.solutios')) {
        setShowSolutionsDropdown(false);
      }
      if (showPricingDropdown && !event.target.closest('.pricing')) {
        setShowPricingDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showResourcesDropdown, showSolutionsDropdown, showPricingDropdown]);
  return (
    <div className={"landing-page-v-1-desktop-1920-px " + className}>
      
      {/* ===================================================================
          SECTION 1: HERO SECTION - TOP OF PAGE
          - Main value proposition headline
          - Primary call-to-action button
          - Featured prominently at the top
          ================================================================= */}
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
          <div className="btn-free-trial">
            <div className="try-power-free">Try POWER free</div>
          </div>
        </div>        {/* Hero image placeholder */}
        <div className="image-container">
          <img 
            src={DashboardImage} 
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

      {/* ===================================================================
          SECTION 2: NAVIGATION HEADER - BELOW HERO
          - Company logo and branding
          - Main navigation menu (Products, Solutions, Resources, Pricing)
          - Login and "Try POWER for free" buttons
          ================================================================= */}
      <div className="header">
        {/* Company logo and branding */}
        <div className="logo">
          <img className="power-logo-2-1" src={POWERLogo} alt="POWER IT Systems Logo" />
          <div className="power-it-systems" style={{ whiteSpace: 'nowrap' }}>POWER IT SYSTEMS</div>
        </div>
        <div className="frame-375">          {/* Main navigation menu with dropdown arrows */}
          <div className="nav-menu">            {/* Solutions dropdown menu */}
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
            </div>{/* Resources dropdown menu */}
            <div className="resources">
              <div className="resources2" onClick={toggleResourcesDropdown} style={{ cursor: 'pointer' }}>
                Resources
              </div>
              <img className="down-arrow3" src={DownArrow} alt="dropdown arrow" />
              {showResourcesDropdown && (
                <div className="dropdown-menu">
                  {/*<a href="#blog" className="dropdown-item">Blog</a>*/}
                  <a href="#guides" className="dropdown-item">Guides & Tutorials</a>
                  <a href="#help" className="dropdown-item">Help Center</a>
                  <a href="#support" className="dropdown-item">Support</a>
                </div>
              )}
            </div>            {/* Pricing dropdown menu */}
            <div className="pricing">
              <div className="pricing2" onClick={togglePricingDropdown} style={{ cursor: 'pointer' }}>
                Pricing
              </div>
              <img className="down-arrow4" src={DownArrow} alt="dropdown arrow" />
              {showPricingDropdown && (
                <div className="dropdown-menu">
                  <a href="#personal" className="dropdown-item">Personal</a>
                  <a href="#clinic" className="dropdown-item">Clinic</a>
                  <a href="#group" className="dropdown-item">Group</a>
                </div>
              )}
            </div>
           
          </div>
          {/* Login and trial buttons */}
            <div className="btn">
              <div className="btn-login" onClick={handleLoginClick} style={{ cursor: 'pointer' }}>
                <div className="login">Login</div>
              </div>
              <div className="btn-free-trial2">
                <div className="try-power-for-free">Try POWER for free</div>
              </div>
            </div>        </div>
      </div>

      {/* ===================================================================
          SECTION 3: PRODUCT FEATURES - MAIN CONTENT AREA
          - "POWER Scheduling" feature showcase with bullet points
          - Detailed feature descriptions and benefits
          - Visual elements and feature graphics
          ================================================================= */}
      <div className="work-management">
        <div className="content3">
          <div className="headline">
            <div className="text-block">
              <div className="power-scheduling">
                POWER Scheduling
              </div>
              {/* Feature description with bullet points */}
              <div className="keep-your-patient-schedule-organized-with-power-upload-clinic-events-holidays-staff-lists-and-provider-lists-directly-from-the-app-manage-availability-and-block-times-seamlessly-easily-send-text-and-email-messages-to-patients-including-automated-appointment-reminders-and-bulk-sms-notifications-keep-all-essential-clinic-information-and-communication-in-one-secure-user-friendly-platform">
                <span>
                  <span className="keep-your-patient-schedule-organized-with-power-upload-clinic-events-holidays-staff-lists-and-provider-lists-directly-from-the-app-manage-availability-and-block-times-seamlessly-easily-send-text-and-email-messages-to-patients-including-automated-appointment-reminders-and-bulk-sms-notifications-keep-all-essential-clinic-information-and-communication-in-one-secure-user-friendly-platform-span">
                    Keep your patient schedule organized with POWER:<br />
                  </span>
                  <ul className="keep-your-patient-schedule-organized-with-power-upload-clinic-events-holidays-staff-lists-and-provider-lists-directly-from-the-app-manage-availability-and-block-times-seamlessly-easily-send-text-and-email-messages-to-patients-including-automated-appointment-reminders-and-bulk-sms-notifications-keep-all-essential-clinic-information-and-communication-in-one-secure-user-friendly-platform-span2">
                    <li>Upload clinic events, holidays, staff lists, and provider lists directly from the app.</li>
                    <li>Manage availability and block times seamlessly.</li>
                    <li>Easily send text and email messages to patients, including automated appointment reminders and bulk SMS notifications.</li>
                    <li>Keep all essential clinic information and communication in one secure, user-friendly platform.</li>
                  </ul>
                </span>
              </div>
            </div>
            <div className="btn-get-started3">
              <div className="get-started3">Get Started</div>
            </div>
          </div>          {/* Feature image placeholder */}
          <div className="work-together-image">
          <img 
            src={DashboardSchedulingImage} 
            alt="POWER Healthcare Scheduler" 
            className="scheduling-dashboard-image"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '16px',
              padding: '5px'
            }}
          />
        </div>
         
        </div>

        {/* ===================================================================
            SUB-SECTION: COLLABORATION FEATURES
            - "POWER together" team collaboration showcase
            - Real-time collaboration benefits
            - Team communication features
            ================================================================= */}        <div className="content4">
          {/* Collaboration visualization placeholder */}
          <div className="work-together-image">
          <img 
            src={DashboardTogetherImage} 
            alt="POWER Healthcare Collaboration Dashboard" 
            className="collaboration-dashboard-image"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '16px',
              padding: '5px'
            }}
          />
        </div>
          <div className="headline">
            <div className="text-block">
              <div className="power-together">POWER together</div>
              <div className="with-power-securely-share-schedules-notes-and-updates-with-your-team-for-real-time-collaboration-collaborate-important-information-or-announcements-and-share-links-with-staff-or-providers-as-needed">
                With POWER, securely share schedules, notes, and updates with
                your team for real-time collaboration. Collaborate important
                information or announcements and share links with staff or
                providers as needed.
              </div>
            </div>
            <div className="btn-get-started3">
              <div className="try-it-now">Try it now</div>
            </div>
          </div>        </div>
      </div>

      {/* ===================================================================
          SECTION 4: CUSTOMER TESTIMONIALS
          - "What Our Clients Says" heading
          - Two testimonial cards with client quotes
          - Client names and titles
          - Testimonial slider indicators
          ================================================================= */}
      <div className="testimonial">
        <div className="what-our-clients-says">What Our Clients Says</div>
        <div className="content2">
          {/* First testimonial */}
          <div className="client">
            <div className="comment">
              <div className="quote">
                <div className="quote-symbol">
                  <img 
                    src={DashboardQouteImage} 
                    alt="POWER Healthcare Scheduler" 
                    className="quote-symbol-image"
                    style={{
                      objectFit: 'cover',
                      borderRadius: '16px',
                      padding: '0px'
                    }}
                  />
                </div>
              </div>
              <div className="power-is-designed-as-a-collaboration-platform-for-healthcare-teams-offering-a-complete-solution-for-patient-scheduling">
                POWER is designed as a collaboration platform for healthcare
                teams, offering a complete solution for patient scheduling.
              </div>
            </div>
            <div className="name-box">
              <div className="avater"></div>
              <div className="name">
                <div className="oberon-shaw-mch">Oberon Shaw, MCH</div>
                <div className="head-of-talent-acquisition-north-america">
                  Head of Talent Acquisition, North America
                </div>
              </div>
            </div>
          </div>

          {/* Second testimonial */}
          <div className="client2">
            <div className="comment2">
              <div className="quote">
                <div className="quote-symbol">
                  <img 
                    src={DashboardQouteImage} 
                    alt="POWER Healthcare Scheduler" 
                    className="quote-symbol-image"
                    style={{
                      objectFit: 'cover',
                      borderRadius: '16px',
                      padding: '0px'
                    }}
                  />
                </div>
              </div>
              <div className="designed-for-healthcare-power-delivers-seamless-collaboration-and-comprehensive-scheduling-management">
                Designed for healthcare, POWER delivers seamless collaboration
                and comprehensive scheduling management.
              </div>
            </div>
            <div className="name-box">
              <div className="avater"></div>
              <div className="name">
                <div className="oberon-shaw-mch2">Oberon Shaw, MCH</div>
                <div className="head-of-talent-acquisition-north-america2">
                  Head of Talent Acquisition, North America
                </div>
              </div>
            </div>
          </div>
        </div>        {/* Testimonial slider indicators */}
        <div className="slider">
          <div className="ellipse-12"></div>
          <div className="ellipse-13"></div>        </div>
      </div>

      {/* ===================================================================
          SECTION 5: CROSS-PLATFORM AVAILABILITY
          - "Efficient scheduling—anywhere, anytime" headline
          - Multi-device access information
          - Platform compatibility (Windows, macOS, Android, iOS)
          - "Try POWER" call-to-action button
          ================================================================= */}
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
              <div className="btn-try-power">
                <div className="try-power-text">Try POWER</div>
              </div>
            </div>
          </div>        </div>      </div>

      {/* ===================================================================
          SECTION 6: DATA SECURITY & PRIVACY
          - "100% your data" headline with yellow highlight
          - Security features and HIPAA compliance info
          - Data ownership and privacy benefits
          - Security icons (shield, lock, encryption)
          - "Read more" action button
          ================================================================= */}
      <div className="data-security-section">
        <div className="data-security-content">
          <div className="data-security-text">
            <h2 className="data-security-headline">
              <span className="highlight-yellow">100% your data</span>
            </h2>
            <p className="data-security-description">
              Your data stays secure with end-to-end encryption and local storage options. 
              POWER ensures complete data ownership and privacy, giving you full control over 
              your patient information and clinic data. HIPAA compliant and trusted by healthcare 
              professionals worldwide.
            </p>
            <div className="data-security-cta">
              <div className="btn-read-more">
                <div className="read-more-text">Read more</div>
              </div>
            </div>
          </div>
          <div className="data-security-icons">
            <div className="security-icon shield-icon"></div>
            <div className="security-icon lock-icon"></div>
            <div className="security-icon encryption-icon"></div>
          </div>        </div>
      </div>

      {/* ===================================================================
          SECTION 7: PRICING PLANS
          - "Choose Your Plan" headline and description
          - Three pricing tiers side-by-side:
            1. Personal ($0 Free) - Basic features
            2. Clinic ($11.99/month) - MOST POPULAR with blue badge
            3. Group ($49.99/month) - Enterprise features
          - Feature lists for each plan
          - Action buttons for each tier
          ================================================================= */}
      <div className="pricing-section">
        <div className="pricing-header">
          <div className="choose-your-plan">Choose Your Plan</div>
          <div className="pricing-description">
            Whether you're working solo or with a team, we have a plan that fits your needs.
          </div>
        </div>
        
        <div className="pricing-cards">
          {/* Personal Plan - Free */}
          <div className="pricing-card">
            <div className="plan-header">
              <div className="plan-name">Personal</div>
              <div className="plan-price">
                <span className="price-amount">$15</span>
                <span className="price-period">Free</span>
              </div>
            </div>
            <div className="plan-description">
              For individuals getting started with healthcare scheduling
            </div>
            <div className="plan-features">
              <div className="feature">✓ Basic scheduling</div>
              <div className="feature">✓ Personal calendar</div>
              <div className="feature">✓ Email notifications</div>
              <div className="feature">✓ Mobile access</div>
            </div>
            <div className="plan-button">
              <div className="btn-plan">Get Started</div>
            </div>
          </div>          {/* Clinic Plan - Most Popular */}
          <div className="pricing-card popular">
            <div className="plan-header">
              <div className="plan-name">Clinic</div>
              <div className="plan-price">
                <span className="price-amount">$49.99</span>
                <span className="price-period">per month</span>
              </div>
            </div>
            <div className="plan-description">
              Keep home and family on track
            </div>
            <div className="plan-features">
              <div className="feature">✓ Everything in Personal</div>
              <div className="feature">✓ Team collaboration</div>
              <div className="feature">✓ Patient management</div>
              <div className="feature">✓ SMS notifications</div>
              <div className="feature">✓ Advanced scheduling</div>
            </div>
            <div className="plan-button">
              <div className="btn-plan">Start Free Trial</div>
            </div>
          </div>

          {/* Group Plan - Enterprise */}
          <div className="pricing-card">
            <div className="plan-header">
              <div className="plan-name">Group</div>
              <div className="plan-price">
                <span className="price-amount">$129.99</span>
                <span className="price-period">per month</span>
              </div>
            </div>
            <div className="plan-description">
              For larger teams
            </div>
            <div className="plan-features">
              <div className="feature">✓ Everything in Clinic</div>
              <div className="feature">✓ Unlimited users</div>
              <div className="feature">✓ Advanced analytics</div>
              <div className="feature">✓ Priority support</div>
              <div className="feature">✓ Custom integrations</div>
            </div>
            <div className="plan-button">
              <div className="btn-plan">Contact Sales</div>
            </div>
          </div>        </div>
      </div>

      {/* ===================================================================
          SECTION 8: FINAL CALL-TO-ACTION
          - "Try POWER today" headline
          - "Get started for free" message
          - Primary "Try POWER free" button
          - "Contact sales" link for large teams
          - Platform download links (App Store, Windows, Google Play)
          ================================================================= */}
      <div className="free-trial">
        <div className="heading4">
          <div className="text-block4">
            <div className="try-power-today">Try POWER today</div>
            <div className="get-started-for-free-add-your-whole-team-as-your-needs-grow2">
              Get started for free.<br />
              Add your whole team as your needs grow.
            </div>
          </div>          <div className="btn-try2">
            <div className="try-power-free2">Try POWER free</div>
          </div>
          <div className="on-a-big-team-contact-sales">
            On a big team? Contact sales
          </div>          {/* Platform download icons */}
          <div className="app-icon">
            <div className="apple-black-logo-2">
              <div className="platform-icon">App Store</div>
            </div>
            <div className="windows-logo-1">
              <div className="platform-icon">Windows</div>
            </div>
            <div className="android-logo-1">
              <div className="platform-icon">Google Play</div>
            </div>          </div>
        </div>
      </div>      
      
      {/* ===================================================================
          SECTION 9: FOOTER - BOTTOM OF PAGE
          - Company branding and logo
          - Four-column layout with navigation links:
            1. Company description and mission
            2. Product links (Overview, Pricing, Features, Customer Stories)
            3. Resources links (Blog, Guides, Help Center, Support)
            4. Company links (About, Careers, Media Kit, Contact)
          - Footer bottom bar with copyright and legal links
          ================================================================= */}
      <div className="footer-section">
        <div className="footer-container">
          <div className="footer-content">
            {/* Company branding and description */}
            <div className="footer-brand">
              <div className="footer-logo">
                <img className="power-logo-footer" src={POWERLogo} alt="POWER IT Systems" />
                <div className="footer-brand-name">POWER IT SYSTEMS</div>
              </div>
              <div className="footer-description">
                POWER was created for the new ways healthcare teams work. We make
                better scheduling solutions for clinics around the world.
              </div>
            </div>
            
            {/* Product navigation links */}
            <div className="footer-column">
              <div className="footer-column-title">Product</div>
              <div className="footer-links">
                <a href="#overview" className="footer-link">Overview</a>
                <a href="#pricing" className="footer-link">Pricing</a>
                <a href="#features" className="footer-link">Features</a>
                {/*<a href="#customer-stories" className="footer-link">Customer Stories</a>*/}
              </div>
            </div>
            
            {/* Resources navigation links */}
            <div className="footer-column">
              <div className="footer-column-title">Resources</div>
              <div className="footer-links">
                {/*<a href="#blog" className="footer-link">Blog</a>*/}
                <a href="#guides" className="footer-link">Guides &amp; Tutorials</a>
                <a href="#help" className="footer-link">Help Center</a>
                <a href="#support" className="footer-link">Support</a>
              </div>
            </div>
            
            {/* Company navigation links */}
            <div className="footer-column">
              <div className="footer-column-title">Company</div>
              <div className="footer-links">
                <a href="#about" className="footer-link">About Us</a>
                {/*<a href="#careers" className="footer-link">Careers</a>*/}
                {/*<a href="#media" className="footer-link">Media Kit</a>*/}
                <a href="#contact" className="footer-link">Contact</a>
              </div>
            </div>
          </div>
          
          {/* Footer bottom section */}
          <div className="footer-bottom">
            <div className="footer-copyright">
              ©2025 POWER IT Systems LLC. All rights reserved.
            </div>
            <div className="footer-legal-links">
              <a href="#terms" className="footer-legal-link">Terms &amp; Privacy</a>
              <a href="#security" className="footer-legal-link">Security</a>
              <a href="#status" className="footer-legal-link">Status</a>
            </div>
          </div>        </div>
      </div>
    </div>
  );
};

/*
 * LANDING PAGE VISUAL FLOW SUMMARY:
 * =================================
 * 
 * TOP OF PAGE
 * ↓
 * [1] Hero Section - Main headline "Smarter Scheduling. Better Outcomes. Powered by POWER."
 * ↓  
 * [2] Navigation Header - Logo + Menu (Products, Solutions, Resources, Pricing) + Login/Trial buttons
 * ↓
 * [3] Product Features - "POWER Scheduling" with feature bullet points + "POWER together" collaboration
 * ↓
 * [4] Customer Testimonials - "What Our Clients Says" with two client reviews
 * ↓
 * [5] Cross-Platform Section - "Efficient scheduling—anywhere, anytime" multi-device info
 * ↓
 * [6] Data Security - "100% your data" with security features and HIPAA compliance
 * ↓
 * [7] Pricing Plans - "Choose Your Plan" with 3 tiers (Personal Free, Clinic $11.99, Group $49.99)
 * ↓
 * [8] Final CTA - "Try POWER today" with download links for all platforms
 * ↓
 * [9] Footer - Company info, navigation links, legal information
 * ↓
 * BOTTOM OF PAGE
 * 
 * KEY INTERACTIVE ELEMENTS:
 * - Multiple "Try POWER free" buttons throughout the page
 * - Login button in header (navigates to /login route)
 * - Pricing plan action buttons
 * - Platform download links (App Store, Windows, Google Play)
 * - Footer navigation links
 */
