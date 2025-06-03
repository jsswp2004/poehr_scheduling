// Import styles for the landing page component
import '../LandingPageV1Desktop1920Px/LandingPageV1Desktop1920Px.css';
// Import React Router navigation hook
import { useNavigate } from 'react-router-dom';

// Asset imports
import POWERLogo from '../assets/POWER_IT.png'; // Company logo image
import DownArrow from '../assets/images/down-arrow0.svg'; // White dropdown arrow for navigation

// Main landing page component for POWER IT healthcare scheduling software
export const LandingPageV1Desktop1920Px = ({ className, ...props }) => {
  // Initialize navigation hook for routing to other pages
  const navigate = useNavigate();

  // Handler function to navigate to login page
  const handleLoginClick = () => {
    navigate('/login');
  };

  return (
    <div className={"landing-page-v-1-desktop-1920-px " + className}>
      {/* Hero Section - Main banner with headline and call-to-action */}
      <div className="hero-section">
        {/* Main headline and description text */}
        <div className="heading">
          <div className="text-block">
            {/* Primary value proposition headline */}
            <div className="smarter-scheduling-better-outcomes-powered-by-power">
              Smarter Scheduling. Better Outcomes. Powered by POWER.
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
        </div>
        {/* Hero image placeholder */}
        <div className="image-container"></div>
      </div>

      {/* Header with navigation and logo */}
      <div className="header">
        {/* Company logo and branding */}
        <div className="logo">
          <img className="power-logo-2-1" src={POWERLogo} alt="POWER IT Systems Logo" />
          <div className="power-it-systems" style={{ whiteSpace: 'nowrap' }}>POWER IT SYSTEMS</div>
        </div>
        <div className="frame-375">
          {/* Main navigation menu with dropdown arrows */}
          <div className="nav-menu">
            {/* Products dropdown menu */}
            <div className="products">
              <div className="products2">Products</div>
              <img className="down-arrow" src={DownArrow} alt="dropdown arrow" />
            </div>
            {/* Solutions dropdown menu */}
            <div className="solutios">
              <div className="solutions">Solutions</div>
              <img className="down-arrow2" src={DownArrow} alt="dropdown arrow" />
            </div>
            {/* Resources dropdown menu */}
            <div className="resources">
              <div className="resources2">Resources</div>
              <img className="down-arrow3" src={DownArrow} alt="dropdown arrow" />
            </div>
            {/* Pricing dropdown menu */}
            <div className="pricing">
              <div className="pricing2">Pricing</div>
              <img className="down-arrow4" src={DownArrow} alt="dropdown arrow" />
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
            </div> 
        </div>
      </div>

      {/* Product features section */}
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
          </div>
          {/* Feature image placeholder */}
          
          <div className="work-together-image">
            <div className="ellipse-5"></div>
            <div className="ellipse-6"></div>
            <div className="group-293">
              <div className="ellipse-2"></div>
            </div>
            <div className="group-22">
              <div className="ellipse-142"></div>
            </div>
            <div className="group-28">
              <div className="ellipse-13"></div>
            </div>
            <div className="group-24">
              <div className="ellipse-10"></div>
            </div>
            <div className="group-298">
              <div className="ellipse-102"></div>
            </div>
            <div className="group-295">
              <div className="ellipse-103"></div>
            </div>
            <div className="group-29">
              <div className="ellipse-172"></div>
              <div className="ellipse-4"></div>
            </div>
            <div className="group-297">
              <div className="ellipse-173"></div>
              <div className="ellipse-45"></div>
            </div>
            <div className="group-26">
              <div className="ellipse-162"></div>
            </div>
            <div className="group-327">
              <img className="power-logo-2-2" src={POWERLogo} alt="POWER logo" />
            </div>
          </div>            
          
        </div>

        {/* Collaboration features section */}
        <div className="content4">
          {/* Collaboration visualization placeholder */}
          <div className="work-together-image">
            <div className="ellipse-5"></div>
            <div className="ellipse-6"></div>
            <div className="group-293">
              <div className="ellipse-2"></div>
            </div>
            <div className="group-22">
              <div className="ellipse-142"></div>
            </div>
            <div className="group-28">
              <div className="ellipse-13"></div>
            </div>
            <div className="group-24">
              <div className="ellipse-10"></div>
            </div>
            <div className="group-298">
              <div className="ellipse-102"></div>
            </div>
            <div className="group-295">
              <div className="ellipse-103"></div>
            </div>
            <div className="group-29">
              <div className="ellipse-172"></div>
              <div className="ellipse-4"></div>
            </div>
            <div className="group-297">
              <div className="ellipse-173"></div>
              <div className="ellipse-45"></div>
            </div>
            <div className="group-26">
              <div className="ellipse-162"></div>
            </div>
            <div className="group-327">
              <img className="power-logo-2-2" src={POWERLogo} alt="POWER logo" />
            </div>
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
          </div>
        </div>
      </div>

      {/* Customer testimonials section */}
      <div className="testimonial">
        <div className="what-our-clients-says">What Our Clients Says</div>
        <div className="content2">
          {/* First testimonial */}
          <div className="client">
            <div className="comment">
              <div className="quote">
                <div className="quote-symbol">"</div>
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
                <div className="quote-symbol">"</div>
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
          <div className="ellipse-13"></div>
        </div>
      </div>

      {/* Pricing section */}
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
                <span className="price-amount">$0</span>
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
          </div>

          {/* Clinic Plan - Most Popular */}
          <div className="pricing-card popular">
            <div className="popular-badge">Most Popular</div>
            <div className="plan-header">
              <div className="plan-name">Clinic</div>
              <div className="plan-price">
                <span className="price-amount">$11.99</span>
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
                <span className="price-amount">$49.99</span>
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
          </div>
        </div>
      </div>

      {/* Free trial call-to-action section */}
      <div className="free-trial">
        <div className="heading4">
          <div className="text-block4">
            <div className="try-power-today">Try POWER today</div>
            <div className="get-started-for-free-add-your-whole-team-as-your-needs-grow2">
              Get started for free.<br />
              Add your whole team as your needs grow.
            </div>
          </div>
          <div className="btn-try2">
            <div className="try-power-free2">Try POWER free</div>
          </div>
          <div className="on-a-big-team-contact-sales">
            On a big team? Contact sales
          </div>
          {/* Platform download icons */}
          <div className="app-icon">
            <div className="apple-black-logo-2">
              <div className="platform-icon">📱 App Store</div>
            </div>
            <div className="windows-logo-1">
              <div className="platform-icon">🖥️ Windows</div>
            </div>
            <div className="android-logo-1">
              <div className="platform-icon">🤖 Google Play</div>
            </div>
          </div>
        </div>
      </div>      {/* Footer section */}
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
                <a href="#customer-stories" className="footer-link">Customer Stories</a>
              </div>
            </div>
            
            {/* Resources navigation links */}
            <div className="footer-column">
              <div className="footer-column-title">Resources</div>
              <div className="footer-links">
                <a href="#blog" className="footer-link">Blog</a>
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
                <a href="#careers" className="footer-link">Careers</a>
                <a href="#media" className="footer-link">Media Kit</a>
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
          </div>
        </div>
      </div>
    </div>
  );
};
