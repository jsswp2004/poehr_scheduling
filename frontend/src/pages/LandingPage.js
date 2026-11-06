/*
 * POWER IT Healthcare Scheduling - Landing Page Component
 *
 * PAGE LAYOUT STRUCTURE:
 * =====================
 * 1. Hero Section - Main banner with headline and CTA button
 * 2. Navigation Header - Logo, menu items, login/trial buttons
 * 3. Services strip and four feature rows (scheduling, front desk to OR, nursing, team)
 * 4. AI assistants band
 * 5. Customer Testimonials - Client reviews and feedback
 * 6. Cross-Platform Section - Multi-device availability info
 * 7. Data Security Section - Security and privacy features
 * 8. Pricing Section - Three-tier pricing plans (Professional/Clinic/Group)
 * 9. Free Trial CTA - Final call-to-action with platform links
 * 10. Footer - Company info, navigation links, legal
 */

// Import styles for the landing page component
import "../LandingPageV1Desktop1920Px/LandingPageV1Desktop1920Px.css";
// Import reusable Header component
import Header from "../components/Header";
// Import useNavigate for page navigation
import { useNavigate } from "react-router-dom";
// Import React hooks for state management
import { useState } from "react";

// Asset imports for page content (logo moved to header component)
import DashboardImage from "../assets/dashboard_clinician.png"; // Dashboard clinician image
import DashboardSchedulingImage from "../assets/dashboard_scheduling.jpg"; // Dashboard scheduling image
import DashboardTogetherImage from "../assets/dashboard_together.png"; // Dashboard together image
import DashboardQouteImage from "../assets/dashboard_quotes.png"; // Dashboard quote image
import SurgeryImage from "../assets/surgery.jpg"; // Surgery case list and day planner
import MdsImage from "../assets/mds.jpg"; // MDS coding workspace
import Footer from "../components/Footer";

// The services, in the order the Overview page shows them. Each chip opens the Overview page.
const SERVICES = [
  "Patient Portal", "Registration", "Notes", "Surgery", "Scheduler",
  "Staffing", "Communicator", "Telehealth", "Dictate", "MDS",
];

// The feature rows: who each is for, what it does today. Images alternate sides.
const FEATURE_ROWS = [
  {
    key: "scheduling",
    image: DashboardSchedulingImage,
    alt: "POWER Scheduler",
    kicker: "Scheduling and messaging",
    title: "Keep the whole day organized",
    text: "Appointments, provider availability and check-in, with texts and emails that remind your patients for you.",
    bullets: [
      "Recurring appointments, holidays and clinic events",
      "Upload staff, provider and patient lists from a file",
      "Automatic reminders and bulk text, with opt-outs handled",
    ],
    link: "See Scheduler and Communicator",
  },
  {
    key: "front-desk",
    image: SurgeryImage,
    alt: "POWER Surgery case list and day planner",
    kicker: "Clinics and hospitals",
    title: "From the front desk to the operating room",
    text: "Register the patient, document the care, and run the day\u2019s surgical cases.",
    bullets: [
      "Registration with a duplicate check and numbered receipts",
      "Notes, orders, lab results and prescriptions together",
      "Surgery case list, day planner and a live status board",
    ],
    link: "See Registration, Notes and Surgery",
  },
  {
    key: "nursing",
    image: MdsImage,
    alt: "POWER MDS coding workspace",
    kicker: "Skilled nursing facilities",
    title: "Cover the floor and code the MDS",
    text: "Keep shifts covered against your requirements, and get a coding guide for MDS 3.0 that shows its evidence.",
    bullets: [
      "Staffing coverage against your requirements",
      "MDS suggested answers with the chart pages that support them",
      "PDPM and HIPPS results, validation and a printable findings sheet",
    ],
    link: "See Staffing and MDS",
  },
  {
    key: "team",
    image: DashboardTogetherImage,
    alt: "POWER team collaboration",
    kicker: "Your whole team",
    title: "Share it with the team, use it anywhere",
    text: "Share schedules, notes and announcements securely, and open POWER on a computer, phone or tablet in any modern browser.",
    bullets: [
      "Secure staff messaging and announcements",
      "Role-based access you can adjust for each person",
      "Works on Windows, macOS, Android and iOS",
    ],
    link: "See what every plan includes",
  },
];

// The AI assistants, with a question each answers. Only MDS is read-only; the others prepare changes you confirm.
const ASSISTANTS = [
  { name: "Scheduler", ask: "Who is waiting for approval?", note: "Can prepare an approval, denial, arrival or no-show for you to confirm." },
  { name: "Staffing", ask: "Who is working tonight?", note: "Answers from your roster. Can prepare a time-off request or call-out." },
  { name: "Communicator", ask: "Who has opted out of texts?", note: "Can prepare a text, an email or a new contact. Nothing is sent until you confirm." },
  { name: "MDS", ask: "Which documents do I need to code?", note: "Answers from the open assessment. It only reads; it never changes anything." },
];

// Main landing page component for POWER IT healthcare scheduling software
export const LandingPageV1Desktop1920Px = ({ className, ...props }) => {
  // Initialize navigation hook
  const navigate = useNavigate();
  
  // State for App Store popup modal
  const [showAppStoreModal, setShowAppStoreModal] = useState(false);

  // Handler for pricing page navigation
  const handlePricingClick = (planType = null) => {
    if (typeof planType === "string" && planType) {
      navigate(`/pricing?plan=${planType}`);
    } else {
      navigate("/pricing");
    }
  };

  // Navigate to detailed data security page
  const handleSecurityClick = () => {
    navigate("/security");
  };

  // Handler for App Store button click
  const handleAppStoreClick = () => {
    setShowAppStoreModal(true);
  };

  // Handler to close the modal
  const closeModal = () => {
    setShowAppStoreModal(false);
  };

  return (
    <div className={"landing-page-v-1-desktop-1920-px " + className}>
      {/* ===================================================================
          SECTION 2: NAVIGATION HEADER - BELOW HERO
          - Reusable Header component with logo, navigation, and buttons
          ================================================================= 
      <Header />*/}
      <Header />
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
            <div className="lp-kicker">For clinics, nursing homes and hospitals</div>
            <div className="smarter-scheduling-better-outcomes-powered-by-power">
              Smarter Platform. Better Outcomes. That is POWER.
            </div>
            {/* Supporting description text */}
            <div className="healthcare-scheduling-software-that-empowers-your-team-to-coordinate-plan-and-manage-patient-care-every-day">
              Scheduling, registration, charting, staffing, surgery and MDS
              coding in one platform. Choose the services you need, add more as
              you grow.
            </div>
          </div>
          {/* Primary call-to-action button */}
          <div className="lp-hero-actions">
            <div
              className="btn-free-trial"
              onClick={handlePricingClick}
              style={{ cursor: "pointer" }}
            >
              <div className="try-power-free">Try POWER free</div>
            </div>
            <button type="button" className="lp-btn-secondary" onClick={() => navigate("/overview")}>
              See what is included
            </button>
          </div>
          <div className="lp-hero-note">7-day free trial. Change your services at any time.</div>
        </div>{" "}
        {/* Hero image placeholder */}
        <div className="image-container">
          <img
            src={DashboardImage}
            alt="POWER Healthcare Dashboard Preview"
            className="hero-dashboard-image"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "16px",
              padding: "0px",
            }}
          />
        </div>
      </div>

      {/* ===================================================================
          SERVICES: the ten services as links to the Overview page
          ================================================================= */}
      <section className="lp-services" aria-labelledby="lp-services-title">
        <h2 id="lp-services-title">Ten services, one sign-in</h2>
        <p>From the front desk to the operating room to the MDS office. Use one, or use them together.</p>
        <div className="lp-chips">
          {SERVICES.map((name) => (
            <button type="button" key={name} className="lp-chip" onClick={() => navigate("/overview")}>
              {name}
            </button>
          ))}
        </div>
        <button type="button" className="lp-link" onClick={() => navigate("/overview")}>
          Explore every service
        </button>
      </section>

      {/* ===================================================================
          FEATURE ROWS: who each part of the platform is for (images alternate sides)
          ================================================================= */}
      {FEATURE_ROWS.map((r, idx) => (
        <section key={r.key} className={"lp-row" + (idx % 2 === 1 ? " lp-row-reverse" : "")}>
          <div className="lp-row-image">
            <img src={r.image} alt={r.alt} />
          </div>
          <div className="lp-row-text">
            <div className="lp-row-kicker">{r.kicker}</div>
            <h2>{r.title}</h2>
            <p>{r.text}</p>
            <ul>
              {r.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <button
              type="button"
              className="lp-link"
              onClick={() => navigate(r.key === "team" ? "/pricing" : "/overview")}
            >
              {r.link}
            </button>
          </div>
        </section>
      ))}

      {/* ===================================================================
          SECTION 4: CUSTOMER TESTIMONIALS
          - "What Our Clients Says" heading
          - Two testimonial cards with client quotes
          - Client names and titles
          - Testimonial slider indicators
          ================================================================= */}
      {/*<div className="testimonial">
        <div className="what-our-clients-says">What Our Clients Says</div>
        <div className="content2">
          {/* First testimonial */}
      {/*<div className="client">
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
      {/*<div className="client2">
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
        </div>        
        {/* Testimonial slider indicators */}
      {/*<div className="slider">
          <div className="ellipse-12"></div>
          <div className="ellipse-13"></div>        
          </div>
      </div> */}

      {/* ===================================================================
          AI ASSISTANTS: an example question for each
          ================================================================= */}
      <section className="lp-ai" aria-labelledby="lp-ai-title">
        <div className="lp-row-kicker">New</div>
        <h2 id="lp-ai-title">AI assistants that answer from your own data</h2>
        <p>Ask in plain words. Where an assistant can prepare a change, nothing happens until you confirm it.</p>
        <div className="lp-ai-grid">
          {ASSISTANTS.map((a) => (
            <div className="lp-ai-card" key={a.name}>
              <div className="lp-ai-name">{a.name}</div>
              <div className="lp-ai-ask">{a.ask}</div>
              <div className="lp-ai-note">{a.note}</div>
            </div>
          ))}
        </div>
      </section>

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
              Your data is encrypted in transit and at rest, and each
              organization's data is kept separate. You own your data: export
              it or close your account yourself, and we do not sell your
              patient information. Built with HIPAA safeguards in mind.
            </p>
            <div className="data-security-cta">
              <div
                className="btn-read-more"
                onClick={handleSecurityClick}
                style={{ cursor: "pointer" }}
              >
                <div className="read-more-text">Read more</div>
              </div>
            </div>
          </div>
          <div className="data-security-icons">
            <div className="security-icon shield-icon"></div>
            <div className="security-icon lock-icon"></div>
            <div className="security-icon encryption-icon"></div>
          </div>{" "}
        </div>
      </div>

      {/* ===================================================================
          SECTION 7: PRICING PLANS
          - "Choose Your Plan" headline and description
          - Three pricing tiers side-by-side:
            1. Professional ($299/month, 1 user)
            2. Clinic ($599/month, up to 10 users, 2 services included) - MOST POPULAR with blue badge
            3. Group (Contact Sales, unlimited users)
          - Professional includes 1 service, Clinic includes 2, $150 for each additional one; texts and emails billed by volume
          - Feature lists for each plan
          - Action buttons for each tier
          ================================================================= */}
      <div className="pricing-section">
        <div className="pricing-header">
          <div className="choose-your-plan">Choose Your Plan</div>
          <div className="pricing-description">
            Whether you're working solo or with a team, we have a plan that fits
            your needs.
          </div>
        </div>

        <div className="pricing-cards">
          {/* Professional - 1 user */}
          <div className="pricing-card">
            <div className="plan-header">
              <div className="plan-name">Professional</div>
              <div className="plan-price">
                <span className="price-amount">$299</span>
                <span className="price-period">per month</span>
              </div>
            </div>
            <div className="plan-description">
              For a solo provider or manager. Your first service is included.
            </div>
            <div className="plan-features">
              <div className="feature">1 user</div>
              <div className="feature">First service included</div>
              <div className="feature">Each additional service $150</div>
              <div className="feature">Reports free</div>
              <div className="feature">AI assistants included; texts, emails and extra AI questions billed by volume</div>
              <div className="feature">7-day free trial</div>
            </div>
            <div className="plan-button">
              <div
                className="btn-plan"
                onClick={() => handlePricingClick()}
                style={{ cursor: "pointer" }}
              >
                Start Free Trial
              </div>
            </div>
          </div>{" "}
          {/* Clinic - up to 10 users */}
          <div className="pricing-card popular">
            <div className="plan-header">
              <div className="plan-name">Clinic</div>
              <div className="plan-price">
                <span className="price-amount">$599</span>
                <span className="price-period">per month</span>
              </div>
            </div>
            <div className="plan-description">Keep your clinic or unit on track</div>
            <div className="plan-features">
              <div className="feature">Up to 10 users</div>
              <div className="feature">2 services included</div>
              <div className="feature">Each additional service $150</div>
              <div className="feature">Reports free</div>
              <div className="feature">AI assistants included; texts, emails and extra AI questions billed by volume</div>
              <div className="feature">7-day free trial</div>
            </div>
            <div className="plan-button">
              <div
                className="btn-plan"
                onClick={() => handlePricingClick("clinic")}
                style={{ cursor: "pointer" }}
              >
                Start Free Trial
              </div>
            </div>
          </div>
          {/* Group - quoted */}
          <div className="pricing-card">
            <div className="plan-header">
              <div className="plan-name">Group</div>
            </div>
            <div className="plan-description">
              For larger organizations and multiple sites. Priced by a quote based on your size.
            </div>
            <div className="plan-features">
              <div className="feature">Unlimited users</div>
              <div className="feature">All services available</div>
              <div className="feature">Reports free</div>
              <div className="feature">AI assistants included; texts, emails and extra AI questions billed by volume</div>
              <div className="feature">Quote based on your size</div>
            </div>
            <div className="plan-button">
              <div
                className="btn-plan"
                onClick={() => navigate("/contact")}
                style={{ cursor: "pointer" }}
              >
                Contact Sales
              </div>
            </div>
          </div>{" "}
        </div>
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
              Get started for free.
              <br />
              Add your whole team as your needs grow.
            </div>{" "}
          </div>
          <div
            className="btn-try2"
            onClick={handlePricingClick}
            style={{ cursor: "pointer" }}
          >
            <div className="try-power-free2">Try POWER free</div>
          </div>
          <div
            className="on-a-big-team-contact-sales"
            onClick={handlePricingClick}
            style={{ cursor: "pointer" }}
          >
            On a big team? Contact sales
          </div>{" "}
          {/* Platform download icons */}
          <div className="app-icon">
            <div 
              className="apple-black-logo-2"
              onClick={handleAppStoreClick}
              style={{ cursor: "pointer" }}
            >
              <div className="platform-icon">Apps in beta</div>
            </div>
            {/* Platform download icons 
            <div className="windows-logo-1">
              <div className="platform-icon">Windows</div>
            </div>
            <div className="android-logo-1">
              <div className="platform-icon">Google Play</div>
            </div>{" "}*/}
          </div>
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
      <Footer pricingLink="/pricing" featuresLink="/features" />
      
      {/* App Store Coming Soon Modal */}
      {showAppStoreModal && (
        <div 
          className="modal-overlay"
          onClick={closeModal}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
        >
          <div 
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              padding: '40px',
              borderRadius: '12px',
              textAlign: 'center',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
            }}
          >
            <h2 style={{ 
              marginBottom: '20px', 
              color: '#333',
              fontSize: '24px',
              fontWeight: 'bold'
            }}>
              📱 Mobile apps in beta
            </h2>
            <p style={{ 
              marginBottom: '30px', 
              color: '#666',
              fontSize: '16px',
              lineHeight: '1.5'
            }}>
              Our mobile apps are in beta testing. Contact power@powerhealthit.com to ask about them.
            </p>
            <button
              onClick={closeModal}
              style={{
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '6px',
                fontSize: '16px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#0056b3'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#007bff'}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
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
