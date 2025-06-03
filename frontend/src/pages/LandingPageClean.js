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
                POWER<br />Scheduling
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
          <div className="image-container2"></div>
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
        </div>

        {/* Testimonial slider indicators */}
        <div className="slider">
          <div className="ellipse-12"></div>
          <div className="ellipse-13"></div>
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
      </div>

      {/* Footer section */}
      <div className="footer">
        <div className="content">
          <div className="info">
            {/* Company branding and description */}
            <div className="logo-description">
              <div className="logo2">
                <div className="logo-icon2">
                  <img className="power-logo-footer" src={POWERLogo} alt="POWER IT Systems" />
                </div>
                <div className="whitepace">POWER IT SYSTEMS</div>
              </div>
              <div className="whitepace-was-created-for-the-new-ways-we-live-and-work-we-make-a-better-workspace-around-the-world">
                POWER was created for the new ways healthcare teams work. We make
                better scheduling solutions for clinics around the world.
              </div>
            </div>
            {/* Product navigation links */}
            <div className="info2">
              <div className="product">Product</div>
              <div className="overview">Overview</div>
              <div className="pricing4">Pricing</div>
              <div className="customer-stories">Customer stories</div>
            </div>
            {/* Resources navigation links */}
            <div className="info3">
              <div className="resources3">Resources</div>
              <div className="blog">Blog</div>
              <div className="guides-tutorials">Guides &amp; tutorials</div>
              <div className="help-center">Help center</div>
            </div>
            {/* Company navigation links */}
            <div className="info3">
              <div className="company">Company</div>
              <div className="about-us">About us</div>
              <div className="careers">Careers</div>
              <div className="media-kit">Media kit</div>
            </div>
          </div>
          {/* Footer bottom section */}
          <div className="btm">
            <div className="tems-and-condition">
              <div className="terms-privacy">Terms &amp; privacy</div>
              <div className="security">Security</div>
              <div className="status">Status</div>
              <div className="_2021-whitepace-llc">©2025 POWER IT Systems LLC.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
