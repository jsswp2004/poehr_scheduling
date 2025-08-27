import "../SupportPage/SupportPage.css";
import Header from "../components/Header";
import Footer from "../components/Footer";

export const SupportPage = ({ className }) => {
  return (
    <div className={`support-page ${className || ""}`}>
      <Header />
      <div className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-icon">🏥</span>
            <span className="badge-text">Organization Setup Guide</span>
          </div>
          <h1 className="hero-title">Register Your Healthcare Organization</h1>
          <p className="hero-subtitle">
            Complete step-by-step guide to onboard your healthcare practice with POWER Healthcare IT solutions
          </p>
          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-number">5 min</span>
              <span className="stat-label">Setup Time</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">7 days</span>
              <span className="stat-label">Free Trial</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">24/7</span>
              <span className="stat-label">Support</span>
            </div>
          </div>
        </div>
      </div>
      <div className="main-content">
        <div className="content-container">
          
          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">📋</div>
              <h2 className="section-title">Prerequisites</h2>
              <p className="section-description">Gather these details before starting your registration</p>
            </div>
            <div className="requirement-grid">
              <div className="requirement-card">
                <h4 className="requirement-title">🏢 Organization Information</h4>
                <ul className="requirement-list">
                  <li>Practice or clinic's official name</li>
                  <li>Main phone number</li>
                  <li>Business email address</li>
                </ul>
              </div>
              <div className="requirement-card">
                <h4 className="requirement-title">👤 Administrator Details</h4>
                <ul className="requirement-list">
                  <li>Full name (main administrator)</li>
                  <li>Professional email address</li>
                  <li>Direct phone number</li>
                </ul>
              </div>
              <div className="requirement-card">
                <h4 className="requirement-title">💳 Payment Information</h4>
                <ul className="requirement-list">
                  <li>Credit card or payment method</li>
                  <li>Billing address</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">🚀</div>
              <h2 className="section-title">Registration Process</h2>
              <p className="section-description">Follow these steps to complete your organization setup</p>
            </div>
            
            <div className="process-steps">
              <div className="step-card">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h3 className="step-title">Start Registration</h3>
                  <ul className="step-list">
                    <li>Visit <a href="https://powerhealthcareit.com" className="link">powerhealthcareit.com</a></li>
                    <li>Click "Get Started" or "Try Power Free"</li>
                  </ul>
                </div>
              </div>
              
              <div className="step-card">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h3 className="step-title">Account Details</h3>
                  <ul className="step-list">
                    <li>Enter organization name and type</li>
                    <li>Provide administrator details</li>
                    <li>Create secure password (8+ characters)</li>
                  </ul>
                </div>
              </div>
              
              <div className="step-card">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h3 className="step-title">Choose Plan & Payment</h3>
                  <ul className="step-list">
                    <li>Select subscription tier</li>
                    <li>Enter payment information</li>
                    <li>Review and confirm details</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">✅</div>
              <h2 className="section-title">After Registration</h2>
              <p className="section-description">What to expect once your account is created</p>
            </div>
            <div className="info-grid">
              <div className="info-card">
                <h4 className="info-title">📧 Welcome Email</h4>
                <ul className="info-list">
                  <li>Login credentials and dashboard access</li>
                  <li>Support contact information</li>
                </ul>
              </div>
              <div className="info-card">
                <h4 className="info-title">🔓 Account Activation</h4>
                <ul className="info-list">
                  <li>Immediate access to your portal</li>
                  <li>7-day free trial begins</li>
                </ul>
              </div>
            </div>
          </div>

        <div className="section">
          <h2 className="section-heading">🔧 Getting Started After Registration</h2>
          <h3>First Login</h3>
          <ol>
            <li>Check your email for the welcome message</li>
            <li>Click the login link or go to https://powerhealthcareit.com</li>
            <li>Click on the Solutions button</li>
            <li>Enter your email and password</li>
            <li>You'll be taken to your Management Portal</li>
          </ol>

          <h3>Initial Setup: Upload Your Data</h3>
          <ol>
            <li>
              Add Staff Members – providers and staff
              <ol>
                <li>Settings &gt; Uploads / Downloads</li>
                <li>Providers / Staff: Download Template</li>
                <li>Fill the CSV, Choose File, Upload CSV</li>
              </ol>
            </li>
            <li>
              Add Clinic Events – schedules and sessions
              <ol>
                <li>Settings &gt; Uploads / Downloads</li>
                <li>Clinic Events: Download Template</li>
                <li>Fill the CSV, Choose File, Upload CSV</li>
              </ol>
            </li>
            <li>
              Availability – provider schedules and slots
              <ol>
                <li>Settings &gt; Uploads / Downloads</li>
                <li>Availability: Download Template</li>
                <li>Fill the CSV, Choose File, Upload CSV</li>
              </ol>
            </li>
            <li>
              Patients – import patient records
              <ol>
                <li>Patients: Download Template</li>
                <li>Fill the CSV, Choose File, Upload CSV</li>
              </ol>
            </li>
          </ol>
        </div>

        <div className="section">
          <h2 className="section-heading">🗓️ Set Up Schedule Maintenance</h2>
          <ol>
            <li>Go to Settings &gt; Schedule Maintenance</li>
            <li>Select Clinician (after providers are uploaded)</li>
            <li>Set start/end time, recurrence, and end date</li>
            <li>Use "Block this schedule" for block time</li>
            <li>Schedules appear on the overview panel</li>
          </ol>
        </div>

        <div className="section">
          <h2 className="section-heading">⚙️ Set Up Environment Profile</h2>
          <ol>
            <li>Default Blocked Days – configure and Save Settings</li>
            <li>Holidays – Load Year or add manually</li>
            <li>Organization – upload logo, create clinics</li>
          </ol>
        </div>

        <div className="section">
          <h2 className="section-heading">🧪 Test the System</h2>
          <ul className="section-list">
            <li>Create a test appointment</li>
            <li>Send a test reminder</li>
            <li>Explore the dashboard</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">🆘 Need Help?</h2>
          <h3>Common Questions</h3>
          <ul className="section-list">
            <li>If you make a mistake during registration, support can help update info.</li>
            <li>You can change plans anytime from account settings.</li>
            <li>If payment doesn’t go through, check your card or contact support.</li>
          </ul>
          <h3>Contact Support</h3>
          <ul className="section-list">
            <li>Email: info@powerhealthcareit.com</li>
            <li>Phone: 301-880-6015</li>
            <li>Hours: Monday–Friday, 8 AM – 6 PM EST</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">✅ After Registration</h2>
          <ul className="section-list">
            <li>Save your login information securely</li>
            <li>Schedule time to explore the platform</li>
            <li>Plan staff training sessions</li>
            <li>Start with a small pilot group</li>
          </ul>
          <h3>Best Practices</h3>
          <ul className="section-list">
            <li>Keep contact information updated</li>
            <li>Review subscription and usage regularly</li>
            <li>Use training resources</li>
            <li>Provide feedback to improve the platform</li>
          </ul>
          </div>
          
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default SupportPage;
