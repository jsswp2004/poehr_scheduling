// Import styles for the landing page component
import '../LandingPageV1Desktop1920Px/LandingPageV1Desktop1920Px.css';

// Asset imports
import POWERLogo from '../assets/POWER_IT.png';        // Company logo image
import DownArrow from '../assets/images/down-arrow0.svg';  // White dropdown arrow for navigation

// Main landing page component for POWER IT healthcare scheduling software
export const LandingPageV1Desktop1920Px = ({ className, ...props }) => {
  return (
    <div className={"landing-page-v-1-desktop-1920-px " + className}>
      {/* Hero Section - Main banner with headline and call-to-action */}
      <div className="hero-section">
        <img className="element" src="element0.svg" alt="" /> {/* Decorative element */}
        {/* Main headline and description text */}
        <div className="heading">
          <div className="text-block">
            {/* Primary value proposition headline */}
            <div className="smarter-scheduling-better-outcomes-powered-by-power">
              Smarter Scheduling. Better Outcomes. Powered by POWER.{" "}
            </div>
            {/* Supporting description text */}
            <div className="healthcare-scheduling-software-that-empowers-your-team-to-coordinate-plan-and-manage-patient-care-every-day">
              Healthcare scheduling software that empowers your team to
              coordinate, plan, and manage patient care—every day.{" "}
            </div>
          </div>
          {/* Primary call-to-action button */}
          <div className="btn-free-trial">
            <div className="try-power-free">Try POWER free </div>
            <img className="group-212" src="group-2120.svg" alt="" /> {/* CTA arrow icon */}
          </div>
        </div>
        {/* Hero image placeholder */}
        <div className="image-container"></div>
      </div>
      {/* Header with navigation and logo */}      <div className="header">        
        {/* Company logo and branding */}
        <div className="logo">
          <img className="power-logo-2-1" src={POWERLogo} alt="POWER IT Systems Logo" />
          <div className="power-it-systems" style={{whiteSpace: 'nowrap'}}>POWER IT SYSTEMS</div>
        </div>
        <div className="frame-375">          
          {/* Main navigation menu with dropdown arrows */}
          <div className="nav-menu">              
            {/* Products dropdown menu */}
            <div className="products">
              <div className="products2">Products </div>
              <img className="down-arrow" src={DownArrow} alt="dropdown arrow" />
            </div>
            {/* Solutions dropdown menu */}
            <div className="solutios">
              <div className="solutions">Solutions </div>
              <img className="down-arrow2" src={DownArrow} alt="dropdown arrow" />
            </div>
            {/* Resources dropdown menu */}
            <div className="resources">
              <div className="resources2">Resources </div>
              <img className="down-arrow3" src={DownArrow} alt="dropdown arrow" />
            </div>
            {/* Pricing dropdown menu */}
            <div className="pricing">
              <div className="pricing2">Pricing </div>
              <img className="down-arrow4" src={DownArrow} alt="dropdown arrow" />
            </div>
          </div>
          {/* Login and trial buttons */}
          <div className="btn">
            <div className="btn-login">
              <div className="login">Login </div>
            </div>
            <div className="btn-free-trial2">
              <div className="try-power-for-free">Try POWER for free </div>
              <div className="icon">
                <img className="group-2122" src="group-2121.svg" alt="" /> {/* Button icon */}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Pricing plans section */}
      <div className="pricing3">
        {/* Section heading */}
        <div className="heading2">
          <img className="element2" src="element1.svg" alt="" /> {/* Decorative element */}
          <div className="choose-your-plan">Choose Your Plan </div>
          <div className="whether-you-re-aiming-to-simplify-patient-scheduling-reduce-no-shows-or-optimize-your-clinic-s-workflow-power-gives-you-the-tools-to-schedule-with-confidence-and-efficiency">
            Whether you're aiming to simplify patient scheduling, reduce
            no-shows, or optimize your clinic's workflow, POWER gives you the
            tools to schedule with confidence and efficiency.{" "}
          </div>
        </div>
        {/* Pricing plan cards container */}
        <div className="price-list">
          {/* Personal Plan - Free tier */}
          <div className="price-board">
            <div className="text-block-01">
              <div className="personal">Personal </div>
              <div className="_0">$0 </div>
              <div className="capture-ideas-and-find-them-quickly">
                Capture ideas and find them quickly{" "}
              </div>
            </div>
            {/* Feature list with icons */}
            <div className="bullet-point">
              <div className="point">
                <img className="icon2" src="icon1.svg" alt="" />
                <div className="sync-unlimited-devices">
                  Sync unlimited devices{" "}
                </div>
              </div>
              <div className="point">
                <img className="icon3" src="icon2.svg" alt="" />
                <div className="_10-gb-monthly-uploads">
                  10 GB monthly uploads
                </div>
              </div>
              <div className="point">
                <img className="icon4" src="icon3.svg" alt="" />
                <div className="_200-mb-max-note-size">
                  200 MB max. note size
                </div>
              </div>
              <div className="point">
                <img className="icon5" src="icon4.svg" alt="" />
                <div className="customize-home-dashboard-and-access-extra-widgets">
                  Customize Home dashboard and access extra widgets{" "}
                </div>
              </div>
              <div className="point">
                <img className="icon6" src="icon5.svg" alt="" />
                <div className="connect-primary-google-calendar-account">
                  Connect primary Google Calendar account
                </div>
              </div>
              <div className="point">
                <img className="icon7" src="icon6.svg" alt="" />
                <div className="add-due-dates-reminders-and-notifications-to-your-tasks">
                  Add due dates, reminders, and notifications to your tasks
                </div>
              </div>
            </div>
            <div className="btn-get-started">
              <div className="get-started">Get Started </div>
            </div>
          </div>
          {/* Clinic Plan - Mid-tier */}
          <div className="price-board2">
            <div className="text-block2">
              <div className="clinic">Clinic </div>
              <div className="_11-99">$11.99 </div>
              <div className="keep-home-and-family-on-track">
                Keep home and family on track{" "}
              </div>
            </div>
            {/* Feature list with icons */}
            <div className="bullet-point">
              <div className="point">
                <img className="icon8" src="icon7.svg" alt="" />
                <div className="sync-unlimited-devices2">
                  Sync unlimited devices{" "}
                </div>
              </div>
              <div className="point">
                <img className="icon9" src="icon8.svg" alt="" />
                <div className="_10-gb-monthly-uploads2">
                  10 GB monthly uploads
                </div>
              </div>
              <div className="point">
                <img className="icon10" src="icon9.svg" alt="" />
                <div className="_200-mb-max-note-size2">
                  200 MB max. note size
                </div>
              </div>
              <div className="point">
                <img className="icon11" src="icon10.svg" alt="" />
                <div className="customize-home-dashboard-and-access-extra-widgets2">
                  Customize Home dashboard and access extra widgets{" "}
                </div>
              </div>
              <div className="point">
                <img className="icon12" src="icon11.svg" alt="" />
                <div className="connect-primary-google-calendar-account2">
                  Connect primary Google Calendar account
                </div>
              </div>
              <div className="point">
                <img className="icon13" src="icon12.svg" alt="" />
                <div className="add-due-dates-reminders-and-notifications-to-your-tasks2">
                  Add due dates, reminders, and notifications to your tasks
                </div>
              </div>
            </div>
            <div className="btn-get-started2">
              <div className="get-started2">Get Started </div>
            </div>
          </div>
          {/* Group Plan - Premium tier */}
          <div className="price-board">
            <div className="text-block-01">
              <div className="group">Group </div>
              <div className="_49-99">$49.99 </div>
              <div className="capture-ideas-and-find-them-quickly">
                Capture ideas and find them quickly{" "}
              </div>
            </div>
            {/* Feature list with icons */}
            <div className="bullet-point">
              <div className="point">
                <img className="icon14" src="icon13.svg" alt="" />
                <div className="sync-unlimited-devices">
                  Sync unlimited devices{" "}
                </div>
              </div>
              <div className="point">
                <img className="icon15" src="icon14.svg" alt="" />
                <div className="_10-gb-monthly-uploads">
                  10 GB monthly uploads
                </div>
              </div>
              <div className="point">
                <img className="icon16" src="icon15.svg" alt="" />
                <div className="_200-mb-max-note-size">
                  200 MB max. note size
                </div>
              </div>
              <div className="point">
                <img className="icon17" src="icon16.svg" alt="" />
                <div className="customize-home-dashboard-and-access-extra-widgets">
                  Customize Home dashboard and access extra widgets{" "}
                </div>
              </div>
              <div className="point">
                <img className="icon18" src="icon17.svg" alt="" />
                <div className="connect-primary-google-calendar-account">
                  Connect primary Google Calendar account
                </div>
              </div>
              <div className="point">
                <img className="icon19" src="icon18.svg" alt="" />
                <div className="add-due-dates-reminders-and-notifications-to-your-tasks">
                  Add due dates, reminders, and notifications to your tasks
                </div>
              </div>
            </div>
            <div className="btn-get-started">
              <div className="get-started">Get Started </div>
            </div>
          </div>
        </div>
      </div>
      {/* Cross-platform availability section */}
      <div className="your-work">
        <div className="heading3">
          <div className="text-block3">
            <img className="element3" src="element2.svg" alt="" /> {/* Decorative element */}
            <div className="efficient-scheduling-anywhere-anytime">
              Efficient scheduling—anywhere, anytime.{" "}
            </div>
            <div className="access-your-schedules-and-patient-information-from-your-computer-phone-or-tablet-anytime-anywhere-power-keeps-everything-in-sync-so-your-appointments-and-clinic-data-are-always-up-to-date-whether-you-re-at-the-office-at-home-or-on-the-go-available-on-windows-mac-os-android-and-i-os">
              Access your schedules and patient information from your computer,
              phone, or tablet—anytime, anywhere. POWER keeps everything in
              sync, so your appointments and clinic data are always up to date,
              whether you're at the office, at home, or on the go. Available on
              Windows, macOS, Android, and iOS.{" "}
            </div>
          </div>
          <div className="btn-try">
            <img className="background" src="background0.svg" alt="" /> {/* Button background */}
            <div className="try-power">Try POWER </div>
            <div className="icon">
              <img className="group-214" src="group-2140.svg" alt="" /> {/* Button icon */}
            </div>
          </div>
        </div>
      </div>
      {/* Data security and privacy section */}
      <div className="your-data">
        <div className="heading">
          <div className="text-block">
            <img className="element4" src="element3.svg" alt="" /> {/* Decorative element */}
            <div className="_100-your-data">100% your data </div>
            <div className="your-data-is-always-yours-secure-and-accessible-power-uses-industry-standard-encryption-to-keep-patient-and-clinic-information-safe-and-private-ensuring-only-authorized-users-have-access-all-your-schedules-and-records-are-stored-securely-so-your-information-is-always-available-when-you-need-it">
              Your data is always yours—secure and accessible. POWER uses
              industry-standard encryption to keep patient and clinic
              information safe and private, ensuring only authorized users have
              access. All your schedules and records are stored securely, so
              your information is always available when you need it.{" "}
            </div>
          </div>
          <div className="btn-try">
            <div className="read-more">Read more </div>
            <div className="icon">
              <img className="group-2142" src="group-2141.svg" alt="" /> {/* Button icon */}
            </div>
          </div>
        </div>
        {/* Security visualization with icons and graphics */}
        <div className="element5">
          <img className="ellipse-14" src="ellipse-140.svg" alt="" />
          <div className="line-3"></div>
          <div className="line-4"></div>
          <div className="line-5"></div>
          <div className="rectangle-367"></div>
          <div className="rectangle-368"></div>
          <div className="rectangle-369"></div>
          {/* Security shield icons */}
          <div className="protection-1">
            <img className="group2" src="group1.svg" alt="" />
            <img className="group3" src="group2.svg" alt="" />
            <img className="group4" src="group3.svg" alt="" />
            <img className="group5" src="group4.svg" alt="" />
            <img className="group6" src="group5.svg" alt="" />
            <img className="group7" src="group6.svg" alt="" />
            <img className="group8" src="group7.svg" alt="" />
            <img className="group9" src="group8.svg" alt="" />
          </div>
          <div className="rectangle-370"></div>
          {/* Padlock security icon */}
          <div className="padlock-1">
            <img className="group10" src="group9.svg" alt="" />
            <img className="group11" src="group10.svg" alt="" />
          </div>
          <div className="rectangle-371"></div>
          {/* Database security icon */}
          <div className="database-1">
            <img className="group12" src="group11.svg" alt="" />
          </div>
          <div className="rectangle-372"></div>
          {/* Key security icon */}
          <div className="key-1">
            <img className="group13" src="group12.svg" alt="" />
            <img className="group14" src="group13.svg" alt="" />
          </div>
          <div className="ellipse-15"></div>
          <div className="ellipse-16"></div>
          <div className="ellipse-17"></div>
          <div className="logo-icon">
            <img className="group15" src="group14.svg" alt="" />
          </div>
        </div>
      </div>
      {/* Footer section with links and information */}
      <div className="footer">
        <div className="content">
          <div className="info">
            {/* Company branding and description */}
            <div className="logo-description">
              <div className="logo2">
                <div className="logo-icon2">
                  <img className="group16" src="group15.svg" alt="" />
                </div>
                <div className="whitepace">whitepace </div>
              </div>
              <div className="whitepace-was-created-for-the-new-ways-we-live-and-work-we-make-a-better-workspace-around-the-world">
                whitepace was created for the new ways we live and work. We make
                a better workspace around the world{" "}
              </div>
            </div>
            {/* Product navigation links */}
            <div className="info2">
              <div className="product">Product </div>
              <div className="overview">Overview </div>
              <div className="pricing4">Pricing </div>
              <div className="customer-stories">Customer stories </div>
            </div>
            {/* Resources navigation links */}
            <div className="info3">
              <div className="resources3">Resources </div>
              <div className="blog">Blog </div>
              <div className="guides-tutorials">Guides &amp; tutorials </div>
              <div className="help-center">Help center </div>
            </div>
            {/* Company navigation links */}
            <div className="info3">
              <div className="company">Company </div>
              <div className="about-us">About us </div>
              <div className="careers">Careers</div>
              <div className="media-kit">Media kit </div>
            </div>
            {/* Call-to-action section */}
            <div className="try-btn">
              <div className="try-it-today">Try It Today </div>
              <div className="get-started-for-free-add-your-whole-team-as-your-needs-grow">
                Get started for free. Add your whole team as your needs grow.{" "}
              </div>
              <div className="btn-try">
                <div className="start-today">Start today </div>
                <div className="icon">
                  <img className="group-2143" src="group-2142.svg" alt="" />
                </div>
              </div>
            </div>
          </div>
          {/* Footer bottom section */}
          <div className="btm">
            <div className="tems-and-condition">
              {/* Language selector */}
              <div className="language">
                <div className="icon20">
                  <img className="group17" src="group16.svg" alt="" />
                </div>
                <div className="english">English </div>
                <img className="arrow" src="arrow0.svg" alt="" />
              </div>
              {/* Legal links */}
              <div className="terms-privacy">Terms &amp; privacy </div>
              <div className="security">Security </div>
              <div className="status">Status </div>
              <div className="_2021-whitepace-llc">©2021 Whitepace LLC. </div>
            </div>
            {/* Social media icons */}
            <div className="social-icon">
              <img className="x-30-1-facebook" src="x-30-1-facebook0.svg" alt="Facebook" />
              <img className="twitter" src="twitter0.svg" alt="Twitter" />
              <img className="linkedin" src="linkedin0.svg" alt="LinkedIn" />
            </div>
          </div>
          <div className="line-2"></div>
        </div>
      </div>
      {/* Customer testimonials section */}
      <div className="testimonial">
        <img className="group18" src="group17.svg" alt="" /> {/* Decorative element */}
        <div className="what-our-clients-says">What Our Clients Says </div>
        <div className="content2">
          {/* First testimonial */}
          <div className="client">
            <div className="comment">
              <div className="quote">
                <img className="group19" src="group18.svg" alt="" /> {/* Quote icon */}
              </div>
              <div className="power-is-designed-as-a-collaboration-platform-for-healthcare-teams-offering-a-complete-solution-for-patient-scheduling">
                POWER is designed as a collaboration platform for healthcare
                teams, offering a complete solution for patient scheduling.{" "}
              </div>
            </div>            <div className="name-box">
              <img className="avater" src="avater0.png" alt="Oberon Shaw" />
              <div className="name">
                <div className="oberon-shaw-mch">Oberon Shaw, MCH </div>
                <div className="head-of-talent-acquisition-north-america">
                  Head of Talent Acquisition, North America{" "}
                </div>
              </div>
            </div>
          </div>
          {/* Second testimonial */}
          <div className="client2">
            <div className="comment2">
              <div className="quote">
                <img className="group20" src="group19.svg" alt="" /> {/* Quote icon */}
              </div>
              <div className="designed-for-healthcare-power-delivers-seamless-collaboration-and-comprehensive-scheduling-management">
                Designed for healthcare, POWER delivers seamless collaboration
                and comprehensive scheduling management.{" "}
              </div>
            </div>
            <div className="name-box">
              <img className="avater" src="avater1.png" alt="Oberon Shaw" />
              <div className="name">
                <div className="oberon-shaw-mch2">Oberon Shaw, MCH </div>
                <div className="head-of-talent-acquisition-north-america2">
                  Head of Talent Acquisition, North America{" "}
                </div>
              </div>
            </div>
          </div>
          {/* Third testimonial */}
          <div className="client2">
            <div className="comment2">
              <div className="quote">
                <img className="group21" src="group20.svg" alt="" /> {/* Quote icon */}
              </div>
              <div className="power-is-your-all-in-one-healthcare-scheduling-and-collaboration-tool-purpose-built-for-clinics-and-care-teams">
                POWER is your all-in-one healthcare scheduling and collaboration
                tool, purpose-built for clinics and care teams{" "}
              </div>
            </div>
            <div className="name-box">
              <img className="avater" src="avater2.png" alt="Oberon Shaw" />
              <div className="name">
                <div className="oberon-shaw-mch2">Oberon Shaw, MCH </div>
                <div className="head-of-talent-acquisition-north-america2">
                  Head of Talent Acquisition, North America{" "}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Testimonial slider indicators */}
        <div className="slider">
          <div className="ellipse-42"></div>
          <div className="ellipse-43"></div>
          <div className="ellipse-44"></div>
        </div>
      </div>
      {/* Free trial call-to-action section */}
      <div className="free-trial">
        <div className="heading4">
          <div className="text-block4">
            <div className="try-power-today">Try POWER today </div>
            <div className="get-started-for-free-add-your-whole-team-as-your-needs-grow2">
              Get started for free.
              <br />
              Add your whole team as your needs grow.{" "}
            </div>
          </div>
          <div className="btn-try2">
            <div className="try-power-free2">Try Taskey free </div>
            <div className="icon">
              <img className="group-2144" src="group-2143.svg" alt="" />
            </div>
          </div>
          <div className="on-a-big-team-contact-sales">
            On a big team? Contact sales{" "}
          </div>
          {/* Platform download icons */}
          <div className="app-icon">
            <div className="apple-black-logo-2">
              <img className="group22" src="group21.svg" alt="Apple App Store" />
            </div>
            <div className="windows-logo-1">
              <img className="group23" src="group22.svg" alt="Windows Store" />
            </div>
            <div className="android-logo-1">
              <img className="group24" src="group23.svg" alt="Google Play Store" />
            </div>
          </div>
        </div>
      </div>
      {/* Product features section */}
      <div className="work-management">
        <div className="content3">
          <img className="background2" src="background1.svg" alt="" /> {/* Background graphic */}
          <div className="headline">
            <div className="text-block">
              <img className="element6" src="element5.svg" alt="" /> {/* Decorative element */}
              <div className="power-scheduling">
                POWER
                <br />
                Scheduling{" "}
              </div>
              {/* Feature description with bullet points */}
              <div className="keep-your-patient-schedule-organized-with-power-upload-clinic-events-holidays-staff-lists-and-provider-lists-directly-from-the-app-manage-availability-and-block-times-seamlessly-easily-send-text-and-email-messages-to-patients-including-automated-appointment-reminders-and-bulk-sms-notifications-keep-all-essential-clinic-information-and-communication-in-one-secure-user-friendly-platform">
                <span>
                  <span className="keep-your-patient-schedule-organized-with-power-upload-clinic-events-holidays-staff-lists-and-provider-lists-directly-from-the-app-manage-availability-and-block-times-seamlessly-easily-send-text-and-email-messages-to-patients-including-automated-appointment-reminders-and-bulk-sms-notifications-keep-all-essential-clinic-information-and-communication-in-one-secure-user-friendly-platform-span">
                    Keep your patient schedule organized with POWER:
                    <br />
                  </span>
                  <ul className="keep-your-patient-schedule-organized-with-power-upload-clinic-events-holidays-staff-lists-and-provider-lists-directly-from-the-app-manage-availability-and-block-times-seamlessly-easily-send-text-and-email-messages-to-patients-including-automated-appointment-reminders-and-bulk-sms-notifications-keep-all-essential-clinic-information-and-communication-in-one-secure-user-friendly-platform-span2">
                    <li>
                      Upload clinic events, holidays, staff lists, and provider
                      lists directly from the app.
                    </li>
                    <li>Manage availability and block times seamlessly.</li>
                    <li>
                      Easily send text and email messages to patients, including
                      automated appointment reminders and bulk SMS
                      notifications.
                    </li>
                    <li>
                      Keep all essential clinic information and communication in
                      one secure, user-friendly platform.
                    </li>
                  </ul>
                </span>{" "}
              </div>
            </div>
            <div className="btn-get-started3">
              <div className="get-started3">Get Started </div>
              <div className="icon">
                <img className="group-2145" src="group-2144.svg" alt="" />
              </div>
            </div>
          </div>
          {/* Feature image placeholder */}
          <div className="image-container2"></div>
        </div>
        {/* Collaboration features section */}
        <div className="content4">
          {/* Collaboration visualization with connected icons */}
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
              <img className="mask-group" src="mask-group0.svg" alt="" />
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
              <img className="power-logo-2-2" src="power-logo-2-20.png" alt="POWER logo" />
            </div>
          </div>
          <div className="headline">
            <div className="text-block">
              <img className="element7" src="element6.svg" alt="" /> {/* Decorative element */}
              <div className="power-together">POWER together </div>
              <div className="with-power-securely-share-schedules-notes-and-updates-with-your-team-for-real-time-collaboration-collaborate-important-information-or-announcements-and-share-links-with-staff-or-providers-as-needed">
                With POWER, securely share schedules, notes, and updates with
                your team for real-time collaboration. Collaborate important
                information or announcements and share links with staff or
                providers as needed.{" "}
              </div>
            </div>
            <div className="btn-get-started3">
              <div className="try-it-now">Try it now </div>
              <div className="icon">
                <img className="group-2146" src="group-2145.svg" alt="" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
